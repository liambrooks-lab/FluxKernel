"""
autopilot.py — Auto-Pilot API routes for the FluxKernel agentic loop.

Endpoints:
  POST /api/v1/autopilot/start               — Kick off a new agentic loop
  POST /api/v1/autopilot/{loop_id}/abort     — Signal running loop to stop
  GET  /api/v1/autopilot/{loop_id}/stream    — SSE stream of loop events
  GET  /api/v1/autopilot/{loop_id}/status    — Instant state snapshot
"""
import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.agentic_loop import create_loop, abort_loop, get_loop, run_agentic_loop

router = APIRouter(prefix="/autopilot", tags=["autopilot"])

_POLL_INTERVAL = 0.2  # SSE flush cadence in seconds


# ── Request / Response Models ─────────────────────────────────────────────────

class StartLoopRequest(BaseModel):
    prompt: str
    persona_name: str = "Standard"
    system_prompt: str = "You are FluxKernel Auto-Pilot, an expert software engineer."


class StartLoopResponse(BaseModel):
    loop_id: str
    status: str
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/start", response_model=StartLoopResponse)
async def start_loop(request: StartLoopRequest) -> StartLoopResponse:
    """
    Create and launch a new agentic loop.
    The loop runs as an asyncio background task; this endpoint returns immediately.
    """
    loop_id, state = create_loop(
        initial_prompt=request.prompt,
        persona_name=request.persona_name,
        system_prompt=request.system_prompt,
    )

    # Schedule the loop as a background asyncio task (non-blocking)
    asyncio.create_task(
        run_agentic_loop(
            loop_id=loop_id,
            initial_prompt=request.prompt,
            persona_name=request.persona_name,
            system_prompt=request.system_prompt,
        )
    )

    return StartLoopResponse(
        loop_id=loop_id,
        status="running",
        message=f"Auto-Pilot loop {loop_id} started. Stream events at /autopilot/{loop_id}/stream",
    )


@router.post("/{loop_id}/abort")
async def abort(loop_id: str) -> dict:
    """
    Signal a running loop to abort after its current step.
    The loop may take up to one iteration step to fully stop.
    """
    success = abort_loop(loop_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Loop '{loop_id}' not found or is not currently running.",
        )
    return {"loop_id": loop_id, "abort_requested": True}


@router.get("/{loop_id}/status")
async def get_status(loop_id: str) -> dict:
    """Instant snapshot of a loop's current state (no streaming)."""
    state = get_loop(loop_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Loop '{loop_id}' not found.")
    return {
        "loop_id":       state.loop_id,
        "status":        state.status,
        "iteration":     state.iteration,
        "max_iterations": state.max_iterations,
        "files_written": len(state.files_written),
        "abort_flag":    state.abort_flag,
    }


async def _sse_event_generator(loop_id: str) -> AsyncGenerator[str, None]:
    """
    Drain the loop's event_queue as SSE frames.  Polls until the loop
    reaches a terminal state AND the queue is fully drained.
    """
    state = get_loop(loop_id)
    if not state:
        yield f"data: {json.dumps({'event': 'error', 'message': f'Loop {loop_id} not found'})}\n\n"
        return

    terminal_states = {"completed", "aborted", "failed"}

    while True:
        try:
            # Non-blocking drain of all queued events
            while not state.event_queue.empty():
                event = await asyncio.wait_for(state.event_queue.get(), timeout=0.1)
                yield f"data: {json.dumps(event)}\n\n"
        except asyncio.TimeoutError:
            pass

        if state.status in terminal_states and state.event_queue.empty():
            # Emit a final marker so the client can close cleanly
            yield f"data: {json.dumps({'event': 'stream_end', 'loop_id': loop_id, 'final_status': state.status})}\n\n"
            break

        await asyncio.sleep(_POLL_INTERVAL)


@router.get("/{loop_id}/stream")
async def stream_loop(loop_id: str):
    """
    SSE stream for a running agentic loop.
    Emits events: iteration_start, file_written, test_start, test_result,
                  loop_done, loop_aborted, plan_error, stream_end
    """
    return StreamingResponse(
        _sse_event_generator(loop_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
