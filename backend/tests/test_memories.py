from unittest.mock import AsyncMock, patch
from app.db import init_db, get_connection
from app import repository
from app.memory_service import extract_and_save_memory, delete_memory_record


def make_conn(tmp_path):
    db_path = str(tmp_path / "pragna.db")
    init_db(db_path)
    conn = get_connection(db_path)
    repository.create_user(conn, "test@example.com", "hash")
    return conn


class FakeSettings:
    embed_model = "nomic-embed-text"
    ollama_url = "http://fake"


async def test_extract_and_save_memory(tmp_path):
    conn = make_conn(tmp_path)
    cid = repository.create_conversation(conn, "Mem Test", 1)

    async def fake_stream(messages, model, ollama_url):
        yield "User works as a software engineer."

    with patch("app.memory_service.chat_stream", new=fake_stream), patch(
        "app.memory_service.embed", new=AsyncMock(return_value=[0.1, 0.2])
    ):
        mem_id = await extract_and_save_memory(
            conn, None, FakeSettings(), cid, "What do I do?", "You mentioned software engineering.", user_id=1
        )

    assert mem_id is not None
    mems = repository.list_memories(conn, 1)
    assert len(mems) == 1
    assert mems[0]["content"] == "User works as a software engineer."


async def test_extract_none_saved(tmp_path):
    conn = make_conn(tmp_path)
    cid = repository.create_conversation(conn, "Mem Test 2", 1)

    async def fake_stream_none(messages, model, ollama_url):
        yield "NONE"

    with patch("app.memory_service.chat_stream", new=fake_stream_none):
        mem_id = await extract_and_save_memory(
            conn, None, FakeSettings(), cid, "Hi", "Hello", user_id=1
        )

    assert mem_id is None
    assert len(repository.list_memories(conn, 1)) == 0


def test_memories_api(client):
    conn = client.app.state.conn
    user_id = repository.get_user_by_email(conn, "test@example.com")["id"]
    mid = repository.create_memory(conn, "User likes pizza.", user_id=user_id)

    res = client.get("/api/memories")
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["content"] == "User likes pizza."

    del_res = client.delete(f"/api/memories/{mid}")
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True

    res_after = client.get("/api/memories")
    assert len(res_after.json()) == 0

    del_404 = client.delete("/api/memories/9999")
    assert del_404.status_code == 404



def _second_user_headers(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "otherpassword123"},
    )
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_memories_are_private_to_each_user(client):
    other = _second_user_headers(client)

    client.post("/api/memories", json={"content": "User's nickname is Sigma."})
    assert [m["content"] for m in client.get("/api/memories").json()] == ["User's nickname is Sigma."]

    # A second account must not see the first account's memories.
    assert client.get("/api/memories", headers=other).json() == []

    # The same fact can exist independently for each user.
    other_post = client.post("/api/memories", json={"content": "User's nickname is Sigma."}, headers=other)
    assert other_post.json()["success"] is True
    assert len(client.get("/api/memories", headers=other).json()) == 1
    assert len(client.get("/api/memories").json()) == 1


def test_cannot_delete_another_users_memory(client):
    other = _second_user_headers(client)
    mid = client.post("/api/memories", json={"content": "User likes tea."}).json()["id"]

    assert client.delete(f"/api/memories/{mid}", headers=other).status_code == 404
    assert len(client.get("/api/memories").json()) == 1
    assert client.delete(f"/api/memories/{mid}").status_code == 200


def test_clear_all_only_clears_own_memories(client):
    other = _second_user_headers(client)
    client.post("/api/memories", json={"content": "Mine."})
    client.post("/api/memories", json={"content": "Theirs."}, headers=other)

    assert client.delete("/api/memories").status_code == 200
    assert client.get("/api/memories").json() == []
    assert [m["content"] for m in client.get("/api/memories", headers=other).json()] == ["Theirs."]


async def test_retrieve_memories_only_returns_own(tmp_path):
    from app.memory_service import retrieve_memories

    conn = make_conn(tmp_path)
    repository.create_user(conn, "other@example.com", "hash")
    repository.create_memory(conn, "User's nickname is Sigma.", user_id=1)
    repository.create_memory(conn, "User's nickname is Pookie.", user_id=2)

    mine = await retrieve_memories("nickname", None, "m", "http://fake", conn=conn, user_id=1)
    theirs = await retrieve_memories("nickname", None, "m", "http://fake", conn=conn, user_id=2)
    nobody = await retrieve_memories("nickname", None, "m", "http://fake", conn=conn, user_id=None)

    assert "User's nickname is Sigma." in mine and "User's nickname is Pookie." not in mine
    assert "User's nickname is Pookie." in theirs and "User's nickname is Sigma." not in theirs
    assert nobody == []

