import logging
import re
import uuid
import chromadb
from app.config import Settings
from app import repository
from app.ollama_client import embed, chat_stream

logger = logging.getLogger("pragna.memory")

EXTRACTION_SYSTEM_PROMPT = (
    "You are a memory extraction assistant. Given a recent conversation exchange, "
    "determine if there is a durable, personal fact or preference about the user worth remembering long-term. "
    "If yes, state the fact concisely as a single standalone sentence (e.g. 'User prefers dark mode', 'User works as a software engineer in Chicago'). "
    "If no, respond with ONLY the word NONE."
)


def get_memories_chroma_collection(settings: Settings):
    client = chromadb.PersistentClient(path=settings.chroma_path)
    return client.get_or_create_collection(
        name="memories", metadata={"hnsw:space": "cosine"}
    )


async def extract_and_save_memory(
    conn,
    memories_collection,
    settings: Settings,
    conversation_id: int,
    user_message: str | None,
    assistant_message: str | None,
    *,
    user_id: int | None = None,
) -> int | None:
    if not user_message:
        return None

    # Immediate deterministic extraction for high-confidence identity facts (e.g. name, nickname)
    nick_match = re.search(r"\b(?:my nickname is|nickname is|my nick is)\s+([A-Za-z0-9_-]+)\b", user_message, re.IGNORECASE)
    if nick_match:
        cand_nick = nick_match.group(1).strip()
        fact = f"User's nickname is {cand_nick.capitalize()}."
        try:
            existing = [m.get("content") for m in repository.list_memories(conn)]
            if fact not in existing:
                repository.create_memory(conn, fact, source_conversation_id=conversation_id)
        except Exception as e:
            logger.warning(f"Immediate nickname persistence warning: {e}")

    name_match = re.search(r"\b(?:my name is|i am|call me|i'm)\s+([A-Za-z]+)\b", user_message, re.IGNORECASE)
    if name_match:
        cand_name = name_match.group(1).strip()
        invalid_words = {
            "a", "an", "the", "here", "just", "trying", "working", "looking", "sorry",
            "fine", "good", "happy", "busy", "online", "curious", "not", "asking", "thinking", "sure", "ready"
        }
        if cand_name.lower() not in invalid_words:
            fact = f"User's name is {cand_name.capitalize()}."
            try:
                existing = [m.get("content") for m in repository.list_memories(conn)]
                if fact not in existing:
                    repository.create_memory(conn, fact, source_conversation_id=conversation_id)
                if user_id:
                    conn.execute(
                        "UPDATE users SET name = ? WHERE id = ? AND (name IS NULL OR name = 'Guest')",
                        (cand_name.capitalize(), user_id),
                    )
                    conn.commit()
            except Exception as e:
                logger.warning(f"Immediate name persistence warning: {e}")


    if not assistant_message:
        return None

    prompt_messages = [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": f"User: {user_message}\nAssistant: {assistant_message}"},
    ]

    # Always use fixed fast cloud model per spec
    model = "gemma4:cloud"
    extracted_text = ""

    try:
        async for token in chat_stream(prompt_messages, model, settings.ollama_url):
            extracted_text += token
    except Exception as e:
        logger.warning(f"Memory extraction model call failed: {e}")
        return None

    cleaned = extracted_text.strip()
    if not cleaned or cleaned.upper() == "NONE" or "NONE" in cleaned.upper() and len(cleaned) < 10:
        return None

    # Strip any quote wrapping if present
    if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
        cleaned = cleaned[1:-1].strip()

    try:
        memory_id = repository.create_memory(conn, cleaned, source_conversation_id=conversation_id)
        if memories_collection is not None:
            try:
                vector = await embed(cleaned, settings.embed_model, settings.ollama_url)
                if vector and len(vector) > 0:
                    memories_collection.add(
                        ids=[str(memory_id)],
                        embeddings=[vector],
                        documents=[cleaned],
                        metadatas=[{"memory_id": memory_id, "conversation_id": conversation_id}],
                    )
            except Exception as ce:
                logger.warning(f"Chroma indexing skipped for memory {memory_id}: {ce}")
        return memory_id
    except Exception as e:
        logger.warning(f"Failed to persist extracted memory: {e}")
        return None


async def retrieve_memories(
    query: str,
    memories_collection,
    embed_model: str,
    ollama_url: str,
    top_k: int = 5,
    threshold: float = 0.5,
    *,
    conn=None,
    user_id: int | None = None,
) -> list[str]:
    memories: list[str] = []

    # 1. Direct user profile name injection
    if conn and user_id:
        try:
            user = repository.get_user(conn, user_id)
            if user and user.get("name") and user["name"].lower() not in ("guest", "none"):
                name_fact = f"User's name is {user['name']}."
                if name_fact not in memories:
                    memories.append(name_fact)
        except Exception:
            pass

    # 2. Vector search with ChromaDB if available
    if memories_collection is not None and memories_collection.count() > 0:
        try:
            query_embedding = await embed(query, embed_model, ollama_url)
            if query_embedding and len(query_embedding) > 0:
                results = memories_collection.query(
                    query_embeddings=[query_embedding],
                    n_results=min(top_k, memories_collection.count())
                )
                if results and "documents" in results and len(results["documents"]) > 0:
                    docs = results["documents"][0]
                    distances = results.get("distances", [[0.0] * len(docs)])[0]
                    for doc, distance in zip(docs, distances):
                        similarity = 1 - distance
                        if similarity >= threshold and doc not in memories:
                            memories.append(doc)
        except Exception as e:
            logger.warning(f"Chroma memory retrieval skipped: {e}")

    # 3. Persistent SQLite fallback so memories are NEVER lost across new tabs/conversations
    if conn:
        try:
            sql_mems = repository.list_memories(conn)
            for m in sql_mems[:top_k]:
                doc = m.get("content", "").strip()
                if doc and doc not in memories:
                    memories.append(doc)
        except Exception as e:
            logger.warning(f"SQLite fallback memory retrieval failed: {e}")

    return memories


def delete_memory_record(conn, memories_collection, memory_id: int) -> bool:
    memory = repository.get_memory(conn, memory_id)
    if not memory:
        return False

    deleted = repository.delete_memory(conn, memory_id)
    if deleted and memories_collection is not None:
        try:
            memories_collection.delete(ids=[str(memory_id)])
        except Exception:
            pass
    return deleted


def search_past_chats(conn, query: str, limit: int = 5) -> list[dict]:
    """Search past conversation messages using SQLite full-text search."""
    if not query.strip():
        return []
    cursor = conn.cursor()
    
    # Clean query for FTS5
    clean_query = " ".join(re.findall(r"\w+", query))
    if not clean_query:
        return []
        
    try:
        cursor.execute(
            """
            SELECT c.title, m.role, m.content, m.created_at, m.conversation_id
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE m.content LIKE ?
            ORDER BY m.id DESC
            LIMIT ?
            """,
            (f"%{clean_query}%", limit),
        )
        rows = cursor.fetchall()
        return [
            {
                "conversation_title": r[0],
                "role": r[1],
                "content": r[2][:300],
                "created_at": r[3],
                "conversation_id": r[4],
            }
            for r in rows
        ]
    except Exception as e:
        logger.warning(f"search_past_chats failed: {e}")
        return []

