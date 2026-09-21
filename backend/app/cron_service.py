import re
import sqlite3
from typing import Any


def _parse_duration_seconds(expr: str) -> int:
    """Parse a schedule expression like "10 minutes", "2h", "30s", "in 1 day"
    into a whole number of seconds. Falls back to treating a bare number as
    minutes (the common phrasing when a unit is omitted), and to 60s if the
    expression is unparseable.
    """
    text = str(expr).strip().lower()
    match = re.search(r"(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)?", text)
    if not match:
        return 60
    amount = float(match.group(1))
    unit = match.group(2) or "minutes"
    if unit.startswith("s"):
        multiplier = 1
    elif unit.startswith("m"):
        multiplier = 60
    elif unit.startswith("h"):
        multiplier = 3600
    elif unit.startswith("d"):
        multiplier = 86400
    else:
        multiplier = 60
    return max(1, int(amount * multiplier))


def schedule_task(
    conn: sqlite3.Connection,
    prompt: str,
    schedule_expression: str,
    conversation_id: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    """Schedule a recurring or delayed background task for the AI agent."""
    if not prompt.strip():
        return {"success": False, "error": "Task prompt cannot be empty."}
        
    task_title = (title or "").strip() or prompt.strip().split("\n")[0][:40]
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO scheduled_jobs (prompt, schedule_expression, status, conversation_id, title, created_at)
        VALUES (?, ?, 'active', ?, ?, datetime('now'))
        """,
        (prompt.strip(), schedule_expression.strip(), conversation_id, task_title),
    )
    conn.commit()
    job_id = cursor.lastrowid
    return {
        "success": True,
        "job_id": job_id,
        "title": task_title,
        "prompt": prompt,
        "schedule": schedule_expression,
        "summary": f"Scheduled task #{job_id}: '{task_title}' ({schedule_expression})",
    }


def list_scheduled_tasks(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """List all scheduled background jobs."""
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, prompt, schedule_expression, status, created_at, title, last_run FROM scheduled_jobs ORDER BY id DESC"
    )
    rows = cursor.fetchall()
    return [
        {
            "id": r[0],
            "prompt": r[1],
            "schedule": r[2],
            "status": r[3],
            "created_at": r[4],
            "title": r[5] or (r[1][:40] if r[1] else "Untitled task"),
            "last_run": r[6],
        }
        for r in rows
    ]


def toggle_scheduled_task(conn: sqlite3.Connection, job_id: int) -> dict[str, Any]:
    """Toggle between active and paused status."""
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM scheduled_jobs WHERE id = ?", (job_id,))
    row = cursor.fetchone()
    if not row:
        return {"success": False, "error": f"Job #{job_id} not found."}
    current_status = row[0]
    new_status = "paused" if current_status == "active" else "active"
    cursor.execute("UPDATE scheduled_jobs SET status = ? WHERE id = ?", (new_status, job_id))
    conn.commit()
    return {"success": True, "job_id": job_id, "status": new_status, "summary": f"Task #{job_id} is now {new_status}."}


def cancel_scheduled_task(conn: sqlite3.Connection, job_id: int) -> dict[str, Any]:
    """Cancel a scheduled background task."""
    cursor = conn.cursor()
    cursor.execute("UPDATE scheduled_jobs SET status = 'cancelled' WHERE id = ?", (job_id,))
    conn.commit()
    if cursor.rowcount == 0:
        return {"success": False, "error": f"Job #{job_id} not found."}
    return {"success": True, "job_id": job_id, "summary": f"Cancelled scheduled task #{job_id}"}


async def run_scheduled_task_now(conn: sqlite3.Connection, job_id: int) -> dict[str, Any]:
    """Trigger execution of a scheduled task immediately."""
    from datetime import datetime, timezone
    from app import repository
    cursor = conn.cursor()
    cursor.execute("SELECT id, prompt, schedule_expression, conversation_id, title FROM scheduled_jobs WHERE id = ?", (job_id,))
    row = cursor.fetchone()
    if not row:
        return {"success": False, "error": f"Job #{job_id} not found."}
    
    jid, prompt, expr, conv_id, title = row
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute("UPDATE scheduled_jobs SET last_run = datetime('now') WHERE id = ?", (job_id,))
    conn.commit()

    # Deliver to conversation if associated
    if conv_id:
        try:
            cid = int(conv_id)
            active_leaf = repository.get_active_leaf(conn, cid)
            repository.append_message(
                conn,
                conversation_id=cid,
                role="assistant",
                content=f"⏰ **[Scheduled Task: {title or 'Triggered'}]**\n\n{prompt}",
                parent_id=active_leaf,
                model="scheduled-task",
            )
        except Exception:
            pass

    return {
        "success": True,
        "job_id": job_id,
        "last_run": now_iso,
        "summary": f"Task '{title or prompt[:30]}' triggered successfully."
    }


async def run_scheduled_jobs_worker(conn: sqlite3.Connection):
    """Background loop that polls scheduled_jobs every 2s and fires due jobs into conversation threads."""
    import asyncio
    from datetime import datetime, timezone
    from app import repository

    while True:
        try:
            await asyncio.sleep(2)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, prompt, schedule_expression, conversation_id, created_at FROM scheduled_jobs WHERE status = 'active'"
            )
            jobs = cursor.fetchall()
            now_dt = datetime.now(timezone.utc)

            for job in jobs:
                job_id, prompt, expr, conv_id, created_at_str = job

                duration_sec = _parse_duration_seconds(expr)

                # Parse created_at ISO string safely
                try:
                    clean_str = str(created_at_str).replace("Z", "").split(".")[0]
                    created_dt = datetime.fromisoformat(clean_str).replace(tzinfo=timezone.utc)
                except Exception:
                    created_dt = now_dt

                elapsed = (now_dt - created_dt).total_seconds()
                if elapsed >= duration_sec:
                    # Mark completed
                    cursor.execute("UPDATE scheduled_jobs SET status = 'completed' WHERE id = ?", (job_id,))
                    conn.commit()

                    # Push notification message into conversation
                    if conv_id:
                        try:
                            cid = int(conv_id)
                            active_leaf = repository.get_active_leaf(conn, cid)
                            repository.append_message(
                                conn,
                                conversation_id=cid,
                                role="assistant",
                                content=f"⏰ **Scheduled Notification:** {prompt}",
                                parent_id=active_leaf,
                                model="scheduled-timer",
                            )
                        except Exception:
                            pass
        except Exception:
            pass
