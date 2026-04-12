"""
agentic_loop.py — Autonomous "Auto-Pilot" agentic loop for FluxKernel.

The loop executes a  Plan → Write → Test → Fix  cycle for up to MAX_ITERATIONS
(default 5) without user intervention per iteration.  Once the loop either:
  a) passes its own subprocess test,              OR
  b) exhausts all iterations,                     OR
  c) receives an abort signal

… it collects ALL file diffs produced during the run into a single
DiffBatch payload that the frontend BatchDiffViewer can present to the user
for a single consolidated approval gate.

Architecture:
  - AgenticLoopState is a plain dataclass held in an in-memory dict.
  - Each loop is identified by a UUID loop_id.
  - Progress is streamed to the frontend via SSE from autopilot.py.
  - The loop asyncio task yields control between steps so the SSE endpoint
    can flush its queue.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Literal

from app.core.llm_router import route_llm
from app.tools.code_executor import execute_code_sync, detect_language
from app.tools.file_manager import write_file, read_file, WORKSPACE_DIR

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_ITERATIONS = 5


# ── Data models ───────────────────────────────────────────────────────────────

@dataclass
class DiffEntry:
    """A single file change produced during a loop iteration."""
    path: str
    content: str
    iteration: int


@dataclass
class AgenticLoopState:
    loop_id: str
    persona_name: str
    system_prompt: str
    initial_prompt: str
    max_iterations: int = MAX_ITERATIONS
    iteration: int = 0
    status: Literal["running", "completed", "aborted", "failed"] = "running"
    abort_flag: bool = False
    files_written: list[DiffEntry] = field(default_factory=list)
    last_test_result: dict | None = None
    event_queue: asyncio.Queue = field(default_factory=asyncio.Queue)

    def abort(self) -> None:
        self.abort_flag = True

    async def emit(self, event_type: str, payload: dict) -> None:
        """Push an SSE-ready event onto the queue."""
        await self.event_queue.put(
            {"event": event_type, "loop_id": self.loop_id, **payload}
        )


# ── Registry ──────────────────────────────────────────────────────────────────
# In a multi-worker setup this would be Redis-backed. For now it's in-process.
_active_loops: dict[str, AgenticLoopState] = {}


def get_loop(loop_id: str) -> AgenticLoopState | None:
    return _active_loops.get(loop_id)


def abort_loop(loop_id: str) -> bool:
    """Signal a running loop to stop after its current step. Thread-safe."""
    loop = _active_loops.get(loop_id)
    if loop and loop.status == "running":
        loop.abort()
        return True
    return False


# ── LLM Prompt Helpers ────────────────────────────────────────────────────────

_PLAN_SYSTEM = """\
You are FluxKernel Auto-Pilot. Output ONLY valid JSON with this exact structure:
{
  "entrypoint": "<workspace-relative path to run for testing>",
  "language": "<python|cpp|javascript|typescript>",
  "files": [
    {"path": "<workspace-relative path>", "content": "<full file content>"}
  ]
}
Do NOT include markdown fences, explanations, or any text outside the JSON object.\
"""

_FIX_SYSTEM = """\
You are FluxKernel Auto-Pilot in FIX mode. A subprocess test failed.
Return ONLY valid JSON in the same structure as before (same entrypoint/language/files).
Fix the code so the test passes. Output ONLY the JSON, no extra text.\
"""


def _build_plan_prompt(user_prompt: str) -> str:
    return (
        f"Task: {user_prompt}\n\n"
        "Generate a complete, working implementation. Output only the JSON plan."
    )


def _build_fix_prompt(user_prompt: str, code_map: dict[str, str], stderr: str) -> str:
    files_block = "\n".join(
        f"--- {path} ---\n{content}" for path, content in code_map.items()
    )
    return (
        f"Original task: {user_prompt}\n\n"
        f"Current files:\n{files_block}\n\n"
        f"Test failed with this stderr:\n{stderr}\n\n"
        "Fix the bug(s) and return the corrected JSON plan."
    )


async def _call_llm(prompt: str, system: str, persona: str, sys_prompt: str) -> str:
    result = await route_llm(
        prompt=prompt,
        persona_name=persona,
        system_prompt=system + "\n\n" + sys_prompt,
    )
    return result["content"]


def _parse_plan(raw: str) -> dict:
    """Extract and parse JSON from LLM output, stripping any stray markdown."""
    # Strip triple-backtick fences if present
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip().rstrip("`").strip()
    return json.loads(raw)


# ── Core Loop ─────────────────────────────────────────────────────────────────

async def run_agentic_loop(
    loop_id: str,
    initial_prompt: str,
    persona_name: str,
    system_prompt: str,
) -> None:
    """
    Main autonomous loop.  Runs in an asyncio background task.
    All progress is pushed to state.event_queue for the SSE endpoint to stream.

    Lifecycle:
        PENDING → running → (completed | aborted | failed)
    """
    state = _active_loops[loop_id]
    code_map: dict[str, str] = {}  # path → content (latest version)
    entrypoint: str | None = None
    language: str = "python"
    current_prompt = _build_plan_prompt(initial_prompt)
    current_system = _PLAN_SYSTEM

    for iteration in range(1, state.max_iterations + 1):
        state.iteration = iteration

        # ── Check abort ───────────────────────────────────────────────────────
        if state.abort_flag:
            state.status = "aborted"
            await state.emit("loop_aborted", {"iteration": iteration})
            return

        await state.emit("iteration_start", {"iteration": iteration, "max_iterations": state.max_iterations})

        # ── PLAN / FIX: Call LLM ──────────────────────────────────────────────
        try:
            raw_response = await _call_llm(
                prompt=current_prompt,
                system=current_system,
                persona=persona_name,
                sys_prompt=system_prompt,
            )
            plan = _parse_plan(raw_response)
            entrypoint = plan.get("entrypoint", "")
            language = plan.get("language", "python")
            files: list[dict] = plan.get("files", [])
        except Exception as exc:
            await state.emit("plan_error", {"iteration": iteration, "error": str(exc)})
            state.status = "failed"
            return

        # ── WRITE: Persist files to workspace ─────────────────────────────────
        for file_entry in files:
            path: str = file_entry.get("path", "")
            content: str = file_entry.get("content", "")
            if not path:
                continue
            write_file(path, content)
            code_map[path] = content
            diff_entry = DiffEntry(path=path, content=content, iteration=iteration)
            state.files_written.append(diff_entry)
            await state.emit("file_written", {"iteration": iteration, "path": path})

        # ── TEST: Execute the entrypoint ──────────────────────────────────────
        if not entrypoint:
            await state.emit("test_skip", {"iteration": iteration, "reason": "No entrypoint specified in plan"})
            # Treat missing entrypoint as a failure to fix
            current_prompt = _build_fix_prompt(initial_prompt, code_map, "No entrypoint was returned by the planner.")
            current_system = _FIX_SYSTEM
            continue

        await state.emit("test_start", {"iteration": iteration, "entrypoint": entrypoint})

        test_result = execute_code_sync(
            code=code_map.get(entrypoint, ""),
            language=language,
            timeout=60,
        )
        state.last_test_result = test_result

        await state.emit("test_result", {
            "iteration":  iteration,
            "success":    test_result["success"],
            "stdout":     test_result.get("stdout", ""),
            "stderr":     test_result.get("stderr", ""),
            "exit_code":  test_result.get("exit_code", -1),
        })

        # ── SUCCESS: Batch all diffs and emit final event ─────────────────────
        if test_result["success"]:
            diff_batch = [
                {"path": d.path, "content": d.content, "iteration": d.iteration}
                for d in state.files_written
            ]
            state.status = "completed"
            await state.emit("loop_done", {
                "iterations_used": iteration,
                "diff_batch": diff_batch,
                "stdout": test_result.get("stdout", ""),
            })
            return

        # ── FAIL: Prepare fix prompt for next iteration ───────────────────────
        if state.abort_flag:
            state.status = "aborted"
            await state.emit("loop_aborted", {"iteration": iteration})
            return

        current_prompt = _build_fix_prompt(
            initial_prompt, code_map, test_result.get("stderr", "")
        )
        current_system = _FIX_SYSTEM

    # ── EXHAUSTED: All iterations used; surface batch for user review ──────────
    diff_batch = [
        {"path": d.path, "content": d.content, "iteration": d.iteration}
        for d in state.files_written
    ]
    state.status = "completed"
    await state.emit("loop_done", {
        "iterations_used": state.max_iterations,
        "diff_batch": diff_batch,
        "note": "Max iterations reached. Tests may not be passing — please review the diff.",
        "stdout": state.last_test_result.get("stdout", "") if state.last_test_result else "",
    })


# ── Factory ────────────────────────────────────────────────────────────────────

def create_loop(
    initial_prompt: str,
    persona_name: str,
    system_prompt: str,
) -> tuple[str, AgenticLoopState]:
    """
    Initialise a new loop state and register it. Returns (loop_id, state).
    The caller is responsible for scheduling run_agentic_loop as an asyncio task.
    """
    loop_id = str(uuid.uuid4())
    state = AgenticLoopState(
        loop_id=loop_id,
        persona_name=persona_name,
        system_prompt=system_prompt,
        initial_prompt=initial_prompt,
    )
    _active_loops[loop_id] = state
    return loop_id, state
