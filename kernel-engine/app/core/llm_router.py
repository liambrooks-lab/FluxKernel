"""
llm_router.py — Hybrid Cognitive Router for FluxKernel.

Routing strategy for the "Unfiltered" persona:
  1. Assess system load (RAM + optional VRAM via nvidia-smi)
  2. Estimate prompt token count
  3. If load is OK and prompt is short → route to LOCAL Ollama
  4. If memory pressure OR prompt exceeds threshold → Dynamic Handoff to cloud:
       a. Try Gemini (google-generativeai) if GEMINI_API_KEY is set
       b. Try Anthropic Claude if ANTHROPIC_API_KEY is set
       c. Return a descriptive fallback error if both are unavailable

For all other personas the standard (cloud) path is used directly,
skipping the local-first step.

All routing decisions are printed to stderr for observability.
"""
from __future__ import annotations

import sys
import subprocess
import traceback
from typing import Any

import httpx
import psutil

from app.core.config import settings


# ── Thresholds (overridable via Settings) ─────────────────────────────────────
RAM_THRESHOLD_GB: float = getattr(settings, "CLOUD_HANDOFF_RAM_THRESHOLD_GB", 1.0)
TOKEN_THRESHOLD: int = getattr(settings, "CLOUD_HANDOFF_TOKEN_THRESHOLD", 2048)

# ── Token Estimation ─────────────────────────────────────────────────────────

def estimate_token_count(text: str) -> int:
    """Rough approximation: 1 token ≈ 4 characters (good enough for routing decisions)."""
    return max(1, len(text) // 4)


# ── System Load Assessment ────────────────────────────────────────────────────

def _get_vram_free_gb() -> float | None:
    """
    Query NVIDIA GPU free VRAM via nvidia-smi. Returns None if unavailable.
    Non-blocking: if nvidia-smi is absent or errors, returns None gracefully.
    """
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            mib_free = float(result.stdout.strip().splitlines()[0])
            return mib_free / 1024  # MiB → GiB
    except Exception:
        pass
    return None


def assess_system_load() -> dict[str, Any]:
    """
    Sample current RAM and VRAM availability.

    Returns:
        {
          "ram_available_gb": float,
          "vram_available_gb": float | None,
          "ram_pressure": bool,   # True when free RAM < RAM_THRESHOLD_GB
          "vram_pressure": bool,  # True when free VRAM < RAM_THRESHOLD_GB (if GPU present)
        }
    """
    ram_available_gb = psutil.virtual_memory().available / (1024 ** 3)
    vram_gb = _get_vram_free_gb()

    return {
        "ram_available_gb":  ram_available_gb,
        "vram_available_gb": vram_gb,
        "ram_pressure":      ram_available_gb < RAM_THRESHOLD_GB,
        "vram_pressure":     (vram_gb is not None) and (vram_gb < RAM_THRESHOLD_GB),
    }


# ── Local LLM (Ollama) ────────────────────────────────────────────────────────

async def _call_ollama(prompt: str, system_prompt: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.LOCAL_LLM_URL}/api/generate",
            json={
                "model":  getattr(settings, "LOCAL_LLM_MODEL", "llama3"),
                "prompt": f"{system_prompt}\n\nUser: {prompt}\nKernel:",
                "stream": False,
            },
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json().get("response", "")


# ── Cloud LLM — Gemini ────────────────────────────────────────────────────────

async def _call_gemini(prompt: str, system_prompt: str) -> str:
    import google.generativeai as genai  # lazy import — only needed on handoff
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(
        model_name=getattr(settings, "GEMINI_MODEL", "gemini-1.5-flash"),
        system_instruction=system_prompt,
    )
    response = model.generate_content(prompt)
    return response.text


# ── Cloud LLM — Anthropic ─────────────────────────────────────────────────────

async def _call_anthropic(prompt: str, system_prompt: str) -> str:
    import anthropic as ant  # lazy import
    client = ant.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=getattr(settings, "ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


# ── Main Router ───────────────────────────────────────────────────────────────

async def route_llm(
    prompt: str,
    persona_name: str,
    system_prompt: str,
    *,
    force_cloud: bool = False,
) -> dict[str, str]:
    """
    Route a prompt to the best available LLM and return a response dict.

    Returns:
        {
          "content":    str,   # The LLM response text
          "routed_to":  str,   # "local" | "gemini" | "anthropic" | "fallback"
          "reason":     str,   # Human-readable routing decision explanation
        }
    """
    token_count = estimate_token_count(prompt + system_prompt)
    load = assess_system_load()

    should_handoff = (
        force_cloud
        or load["ram_pressure"]
        or load["vram_pressure"]
        or token_count > TOKEN_THRESHOLD
    )

    reasons: list[str] = []
    if load["ram_pressure"]:
        reasons.append(f"low RAM ({load['ram_available_gb']:.2f} GB free < {RAM_THRESHOLD_GB} GB threshold)")
    if load["vram_pressure"]:
        reasons.append(f"low VRAM ({load['vram_available_gb']:.2f} GB free < {RAM_THRESHOLD_GB} GB threshold)")
    if token_count > TOKEN_THRESHOLD:
        reasons.append(f"prompt complexity ({token_count} tokens > {TOKEN_THRESHOLD} threshold)")
    if force_cloud:
        reasons.append("caller forced cloud route")

    is_unfiltered = persona_name.lower() == "unfiltered"

    # ── PATH 1: Local Ollama (Unfiltered persona, no pressure) ────────────────
    if is_unfiltered and not should_handoff:
        try:
            print(f"[Router] → LOCAL  | tokens={token_count} | {load}", file=sys.stderr)
            content = await _call_ollama(prompt, system_prompt)
            return {"content": content, "routed_to": "local", "reason": "nominal system load, within token budget"}
        except Exception as exc:
            reasons.append(f"Ollama unavailable ({exc})")
            print(f"[Router] Ollama failed — escalating to cloud. Reason: {exc}", file=sys.stderr)

    # ── PATH 2: Dynamic Handoff → Cloud ───────────────────────────────────────
    handoff_reason = "; ".join(reasons) if reasons else "non-Unfiltered persona uses cloud by default"
    print(f"[Router] → CLOUD  | tokens={token_count} | reason={handoff_reason}", file=sys.stderr)

    # Try Gemini
    if getattr(settings, "GEMINI_API_KEY", ""):
        try:
            content = await _call_gemini(prompt, system_prompt)
            return {"content": content, "routed_to": "gemini", "reason": handoff_reason}
        except Exception as exc:
            print(f"[Router] Gemini failed: {exc}", file=sys.stderr)

    # Try Anthropic
    if getattr(settings, "ANTHROPIC_API_KEY", ""):
        try:
            content = await _call_anthropic(prompt, system_prompt)
            return {"content": content, "routed_to": "anthropic", "reason": handoff_reason}
        except Exception as exc:
            print(f"[Router] Anthropic failed: {exc}", file=sys.stderr)

    # Final fallback
    fallback_msg = (
        f"⚠ FluxKernel Cognitive Handoff Failed\n"
        f"Reason: {handoff_reason}\n"
        f"No cloud LLM keys are configured and the local Ollama instance is unreachable. "
        f"Set GEMINI_API_KEY or ANTHROPIC_API_KEY in your .env file to enable cloud fallback."
    )
    return {"content": fallback_msg, "routed_to": "fallback", "reason": handoff_reason}