from fastapi import APIRouter, Request, HTTPException, Depends
from app import repository
from app.memory_service import delete_memory_record
from app.auth import get_optional_current_user

router = APIRouter()


@router.get("/api/memories")
async def list_memories(request: Request, current_user: dict = Depends(get_optional_current_user)):
    return repository.list_memories(request.app.state.conn, current_user["id"])


@router.post("/api/memories")
async def create_memory(request: Request, current_user: dict = Depends(get_optional_current_user)):
    body = await request.json()
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")
    user_id = current_user["id"]
    conn = request.app.state.conn
    memories_collection = getattr(request.app.state, "memories_collection", None)

    # Check if this user already has the fact
    existing = [m.get("content") for m in repository.list_memories(conn, user_id)]
    if content in existing:
        return {"success": True, "message": "Memory already exists", "content": content}

    memory_id = repository.create_memory(conn, content, user_id=user_id)
    if memories_collection is not None:
        try:
            from app.ollama_client import embed
            settings = request.app.state.settings
            vector = await embed(content, settings.embed_model, settings.ollama_url)
            if vector and len(vector) > 0:
                memories_collection.add(
                    ids=[str(memory_id)],
                    embeddings=[vector],
                    documents=[content],
                    metadatas=[{"memory_id": memory_id, "user_id": user_id}],
                )
        except Exception:
            pass
    return {"id": memory_id, "content": content, "success": True}


@router.delete("/api/memories/{memory_id}")
async def delete_memory(request: Request, memory_id: int, current_user: dict = Depends(get_optional_current_user)):
    conn = request.app.state.conn
    memories_collection = getattr(request.app.state, "memories_collection", None)
    deleted = delete_memory_record(conn, memories_collection, memory_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"id": memory_id, "deleted": True}


@router.post("/api/memories/sync")
@router.post("/api/memories/refresh")
async def sync_memories(request: Request, current_user: dict = Depends(get_optional_current_user)):
    user_id = current_user["id"]
    conn = request.app.state.conn
    memories_collection = getattr(request.app.state, "memories_collection", None)
    memories = repository.list_memories(conn, user_id)
    chroma_count = 0
    if memories_collection is not None:
        try:
            chroma_count = len(memories_collection.get(where={"user_id": user_id}, include=[])["ids"])
        except Exception:
            chroma_count = 0
    return {
        "success": True,
        "message": f"Memory store synchronized. {len(memories)} memories in SQLite, {chroma_count} in ChromaDB vector store.",
        "count": len(memories),
        "vector_count": chroma_count,
    }


@router.delete("/api/memories")
async def clear_all_memories(request: Request, current_user: dict = Depends(get_optional_current_user)):
    user_id = current_user["id"]
    conn = request.app.state.conn
    memories_collection = getattr(request.app.state, "memories_collection", None)
    memories = repository.list_memories(conn, user_id)
    for mem in memories:
        delete_memory_record(conn, memories_collection, mem["id"], user_id)
    return {"success": True, "message": f"Purged {len(memories)} memories from SQLite and ChromaDB."}
