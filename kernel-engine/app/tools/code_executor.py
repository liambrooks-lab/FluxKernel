"""
code_executor.py — Multi-language code execution engine for FluxKernel.

Supports:
  - Python  (.py)  — via sys.executable (same interpreter as the server)
  - C++     (.cpp) — via g++  (must be on PATH)
  - JavaScript (.js) — via node (must be on PATH)
  - TypeScript (.ts) — via ts-node (must be installed globally or via npx)

Short tasks run synchronously (execute_code_sync).
Long tasks are dispatched to a Celery worker (dispatch_async_execution)
and tracked by task_id via the /api/v1/tasks/* endpoints.
"""
import subprocess
import tempfile
import sys
import shutil
import uuid
import json
from pathlib import Path
from typing import Literal

from app.tools.file_manager import WORKSPACE_DIR
from app.core.task_queue import celery_app

# ── Types ─────────────────────────────────────────────────────────────────────
Language = Literal["python", "cpp", "javascript", "typescript", "unknown"]

ExecutionResult = dict  # {success, stdout, stderr, exit_code, language}

# ── Language Detection ────────────────────────────────────────────────────────
_EXTENSION_MAP: dict[str, Language] = {
    ".py":   "python",
    ".cpp":  "cpp",
    ".cc":   "cpp",
    ".cxx":  "cpp",
    ".c":    "cpp",   # treat as C but compile with g++ (works for C)
    ".js":   "javascript",
    ".mjs":  "javascript",
    ".ts":   "typescript",
    ".tsx":  "typescript",
}


def detect_language(filename_or_ext: str) -> Language:
    """
    Infer execution language from a filename or bare extension string.
    Returns 'unknown' if the extension is not recognised.
    """
    ext = Path(filename_or_ext).suffix.lower()
    return _EXTENSION_MAP.get(ext, "unknown")


# ── Compiler Pre-flight ───────────────────────────────────────────────────────
def _check_available(cmd: str) -> bool:
    """Return True if `cmd` is found on PATH."""
    return shutil.which(cmd) is not None


COMPILER_AVAILABILITY: dict[str, bool] = {
    "g++":     _check_available("g++"),
    "node":    _check_available("node"),
    "ts-node": _check_available("ts-node"),
    "npx":     _check_available("npx"),
}


def check_compiler_availability() -> dict[str, bool]:
    """Return the cached compiler availability map."""
    return COMPILER_AVAILABILITY


# ── Temp-file Helpers ─────────────────────────────────────────────────────────
_TEMP_DIR = WORKSPACE_DIR / ".flux_temp"
_TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _make_temp_file(content: str, suffix: str) -> Path:
    f = tempfile.NamedTemporaryFile(
        dir=str(_TEMP_DIR),
        suffix=suffix,
        delete=False,
        mode="w+",
        encoding="utf-8",
    )
    f.write(content)
    f.close()
    return Path(f.name)


def _cleanup(*paths: Path) -> None:
    for p in paths:
        p.unlink(missing_ok=True)


# ── Language Runners ──────────────────────────────────────────────────────────

def _run_python(code: str, timeout: int) -> ExecutionResult:
    src = _make_temp_file(code, ".py")
    try:
        result = subprocess.run(
            [sys.executable, str(src)],
            capture_output=True, text=True,
            timeout=timeout, cwd=str(WORKSPACE_DIR),
        )
        return {
            "success":   result.returncode == 0,
            "stdout":    result.stdout,
            "stderr":    result.stderr,
            "exit_code": result.returncode,
            "language":  "python",
        }
    except subprocess.TimeoutExpired as e:
        return {
            "success":   False,
            "stdout":    e.stdout.decode("utf-8") if e.stdout else "",
            "stderr":    f"Execution halted: time limit exceeded ({timeout}s).",
            "exit_code": 124,
            "language":  "python",
        }
    finally:
        _cleanup(src)


def _run_cpp(code: str, timeout: int) -> ExecutionResult:
    if not COMPILER_AVAILABILITY["g++"]:
        return {
            "success": False, "stdout": "",
            "stderr": "g++ is not available on this system. Install build-essential (Linux) or MinGW (Windows).",
            "exit_code": 127, "language": "cpp",
        }

    src = _make_temp_file(code, ".cpp")
    binary_ext = ".exe" if sys.platform == "win32" else ""
    binary = src.with_suffix(binary_ext or ".out")

    try:
        # Step 1: Compile
        compile_result = subprocess.run(
            ["g++", "-std=c++17", "-Wall", "-o", str(binary), str(src)],
            capture_output=True, text=True,
            timeout=60, cwd=str(WORKSPACE_DIR),
        )
        if compile_result.returncode != 0:
            return {
                "success":   False,
                "stdout":    "",
                "stderr":    f"[Compilation Error]\n{compile_result.stderr}",
                "exit_code": compile_result.returncode,
                "language":  "cpp",
            }

        # Step 2: Execute compiled binary
        run_result = subprocess.run(
            [str(binary)],
            capture_output=True, text=True,
            timeout=timeout, cwd=str(WORKSPACE_DIR),
        )
        return {
            "success":   run_result.returncode == 0,
            "stdout":    run_result.stdout,
            "stderr":    run_result.stderr,
            "exit_code": run_result.returncode,
            "language":  "cpp",
        }
    except subprocess.TimeoutExpired as e:
        return {
            "success":   False,
            "stdout":    e.stdout.decode("utf-8") if e.stdout else "",
            "stderr":    f"Execution halted: time limit exceeded ({timeout}s).",
            "exit_code": 124,
            "language":  "cpp",
        }
    finally:
        _cleanup(src, binary)


def _run_javascript(code: str, timeout: int) -> ExecutionResult:
    if not COMPILER_AVAILABILITY["node"]:
        return {
            "success": False, "stdout": "",
            "stderr": "node is not available on PATH. Install Node.js.",
            "exit_code": 127, "language": "javascript",
        }

    src = _make_temp_file(code, ".js")
    try:
        result = subprocess.run(
            ["node", str(src)],
            capture_output=True, text=True,
            timeout=timeout, cwd=str(WORKSPACE_DIR),
        )
        return {
            "success":   result.returncode == 0,
            "stdout":    result.stdout,
            "stderr":    result.stderr,
            "exit_code": result.returncode,
            "language":  "javascript",
        }
    except subprocess.TimeoutExpired as e:
        return {
            "success":   False,
            "stdout":    e.stdout.decode("utf-8") if e.stdout else "",
            "stderr":    f"Execution halted: time limit exceeded ({timeout}s).",
            "exit_code": 124,
            "language":  "javascript",
        }
    finally:
        _cleanup(src)


def _run_typescript(code: str, timeout: int) -> ExecutionResult:
    """Runs TypeScript via ts-node; falls back to npx ts-node if not global."""
    src = _make_temp_file(code, ".ts")

    runner = (
        ["ts-node", "--skip-project"]
        if COMPILER_AVAILABILITY["ts-node"]
        else (
            ["npx", "--yes", "ts-node", "--skip-project"]
            if COMPILER_AVAILABILITY["npx"]
            else None
        )
    )

    if runner is None:
        _cleanup(src)
        return {
            "success": False, "stdout": "",
            "stderr": "Neither ts-node nor npx is available on PATH.",
            "exit_code": 127, "language": "typescript",
        }

    try:
        result = subprocess.run(
            runner + [str(src)],
            capture_output=True, text=True,
            timeout=timeout, cwd=str(WORKSPACE_DIR),
        )
        return {
            "success":   result.returncode == 0,
            "stdout":    result.stdout,
            "stderr":    result.stderr,
            "exit_code": result.returncode,
            "language":  "typescript",
        }
    except subprocess.TimeoutExpired as e:
        return {
            "success":   False,
            "stdout":    e.stdout.decode("utf-8") if e.stdout else "",
            "stderr":    f"Execution halted: time limit exceeded ({timeout}s).",
            "exit_code": 124,
            "language":  "typescript",
        }
    finally:
        _cleanup(src)


# ── Public Synchronous Executor ───────────────────────────────────────────────

def execute_code_sync(
    code: str,
    language: Language | str = "python",
    timeout: int = 30,
) -> ExecutionResult:
    """
    Execute code synchronously in the requested language.
    Suitable for tasks expected to complete within `timeout` seconds.
    Raises ValueError for unknown languages.
    """
    match language:
        case "python":
            return _run_python(code, timeout)
        case "cpp":
            return _run_cpp(code, timeout)
        case "javascript":
            return _run_javascript(code, timeout)
        case "typescript":
            return _run_typescript(code, timeout)
        case _:
            return {
                "success": False, "stdout": "",
                "stderr":  f"Unsupported language: '{language}'. Supported: python, cpp, javascript, typescript.",
                "exit_code": 1, "language": language,
            }


# Backwards-compatible alias used by existing routes
execute_python_code = lambda code, timeout=10: _run_python(code, timeout)


# ── Celery Async Task (Feature 1) ────────────────────────────────────────────

@celery_app.task(bind=True, name="fluxkernel.execute_code_async")
def execute_code_async_task(
    self,  # noqa: ANN001 — Celery injects `self` for bind=True
    code: str,
    language: str = "python",
    timeout: int = 300,
) -> ExecutionResult:
    """
    Celery task wrapper around execute_code_sync.
    Results are stored in Redis and retrievable via the task ID.
    """
    return execute_code_sync(code, language, timeout)


def dispatch_async_execution(
    code: str,
    language: str = "python",
    timeout: int = 300,
) -> str:
    """
    Enqueue code for background execution.

    Returns:
        task_id — use GET /api/v1/tasks/{task_id}/stream to follow progress.
    """
    task = execute_code_async_task.apply_async(
        args=[code],
        kwargs={"language": language, "timeout": timeout},
    )
    return task.id