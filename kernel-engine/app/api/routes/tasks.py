"""
tasks.py — API routes for Celery background task tracking.

Endpoints:
  GET /api/v1/tasks/{task_id}/status   — Instant poll of task state
  GET /api/v1/tasks/{task_id}/stream   — SSE stream that pushes updates
                                         until SUCCESS or FAILURE
"""
import asyncio
import json
from typing import AsyncGenerator

from celery.result import AsyncResult
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.task_queue import celery_app

router = APIRouter(prefix="/tasks", tags=["tasks"])

_POLL_INTERVAL = 0.5  # seconds between Celery result polls


def _serialize_result(task_id: str) -> dict:
    """
    Convert a Celery AsyncResult into a JSON-serialisable status dict.
    """
    result: AsyncResult = AsyncResult(task_id, app=celery_app)
    state = result.state  # PENDING | STARTED | SUCCESS | FAILURE | REVOKED

    payload: dict = {"task_id": task_id, "state": state}

    if state == "SUCCESS":
        payload.update(result.result or {})   # merges stdout/stderr/success/language
    elif state == "FAILURE":
        payload["stderr"] = str(result.result)
        payload["success"] = False
    elif state in ("PENDING", "STARTED"):
        payload["stdout"] = ""
        payload["stderr"] = ""

    return payload


@router.get("/{task_id}/status")
async def get_task_status(task_id: str) -> dict:
    """Return the current state of a background task (instant, non-blocking)."""
    return _serialize_result(task_id)


async def _sse_generator(task_id: str) -> AsyncGenerator[str, None]:
    """
    Async generator that polls Celery every 500ms and emits SSE frames.
    Terminates when the task reaches a terminal state.
    """
    terminal_states = {"SUCCESS", "FAILURE", "REVOKED"}

    while True:
        payload = _serialize_result(task_id)
        yield f"data: {json.dumps(payload)}\n\n"

        if payload["state"] in terminal_states:
            # Emit a final `done` frame so the client knows the stream is closed
            yield f"data: {json.dumps({'task_id': task_id, 'state': 'done'})}\n\n"
            break

        await asyncio.sleep(_POLL_INTERVAL)


@router.get("/{task_id}/stream")
async def stream_task(task_id: str):
    """
    SSE endpoint — push task status updates until the task completes.
    The frontend useTaskStream hook consumes this stream.
    """
    return StreamingResponse(
        _sse_generator(task_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
