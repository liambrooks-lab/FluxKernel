"""
llm_router.py — Hybrid Cognitive Router for FluxKernel.

Now heavily integrated with `instructor` and Pydantic function calling paradigms
to enforce strict schema adherence and eliminate LLM OS-level hallucinations.
"""
from __future__ import annotations

import sys
import subprocess
import traceback
from typing import Any, Union, Literal
import json

import httpx
import psutil
from pydantic import BaseModel, Field, ValidationError

try:
    import instructor
except ImportError:
    instructor = None

from app.core.config import settings
from app.tools.os_controller import OSCommandSchema
from app.tools.software_manager import SoftwareInstallSchema

# ── Global Router Data Models (Instructor Parsing) ───────────────────────────

class TextResponseSchema(BaseModel):
    """Fallback text response when no system tools are needed."""
    type: Literal["text"] = "text"
    content: str = Field(..., description="The conversational response.")

class KernelActionResponse(BaseModel):
    """The strictly validated output from the LLM."""
    action: Union[OSCommandSchema, SoftwareInstallSchema, TextResponseSchema] = Field(
        ..., description="The action to execute or text response."
    )

# ── Thresholds ───────────────────────────────────────────────────────────────
RAM_THRESHOLD_GB: float = getattr(settings, "CLOUD_HANDOFF_RAM_THRESHOLD_GB", 1.0)
TOKEN_THRESHOLD: int = getattr(settings, "CLOUD_HANDOFF_TOKEN_THRESHOLD", 2048)


def estimate_token_count(text: str) -> int:
    return max(1, len(text) // 4)


def _get_vram_free_gb() -> float | None:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            mib_free = float(result.stdout.strip().splitlines()[0])
            return mib_free / 1024
    except Exception:
        pass
    return None


def assess_system_load() -> dict[str, Any]:
    ram_available_gb = psutil.virtual_memory().available / (1024 ** 3)
    vram_gb = _get_vram_free_gb()

    return {
        "ram_available_gb":  ram_available_gb,
        "vram_available_gb": vram_gb,
        "ram_pressure":      ram_available_gb < RAM_THRESHOLD_GB,
        "vram_pressure":     (vram_gb is not None) and (vram_gb < RAM_THRESHOLD_GB),
    }


# ── Strict Wrappers ──────────────────────────────────────────────────────────

def _handle_validation_error(exc: Exception) -> str:
    print(f"[Router] Hallucination aborted cleanly: {exc}", file=sys.stderr)
    return json.dumps({
        "type": "error",
        "content": f"System action aborted: LLM hallucinated an invalid command or parameter. Details: {str(exc)}"
    })


async def _call_ollama(prompt: str, system_prompt: str) -> str:
    async with httpx.AsyncClient() as client:
        # Instructor Ollama fallback: we inject the JSON schema to the prompt natively.
        prompt_with_schema = f"{system_prompt}\n\n[STRICT JSON SCHEMA REQUIRED: {KernelActionResponse.model_json_schema()}]\n\nUser: {prompt}\nKernel:"
        response = await client.post(
            f"{settings.LOCAL_LLM_URL}/api/generate",
            json={
                "model":  getattr(settings, "LOCAL_LLM_MODEL", "llama3"),
                "prompt": prompt_with_schema,
                "stream": False,
                "format": "json"
            },
            timeout=60.0,
        )
        response.raise_for_status()
        raw = response.json().get("response", "{}")
        try:
            parsed = KernelActionResponse.model_validate_json(raw)
            return parsed.model_dump_json()
        except ValidationError as e:
            return _handle_validation_error(e)


async def _call_gemini(prompt: str, system_prompt: str) -> str:
    import google.generativeai as genai
    genai.configure(api_key=settings.GEMINI_API_KEY)
    
    if instructor:
        client = instructor.from_gemini(
            client=genai.GenerativeModel(model_name=getattr(settings, "GEMINI_MODEL", "gemini-1.5-flash")),
            mode=instructor.Mode.GEMINI_JSON,
        )
        try:
            # Note: Instructor API usage can vary, we mock the call flow directly assuming recent `instructor>=1.0.0`
            resp = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                response_model=KernelActionResponse,
            )
            return resp.model_dump_json()
        except ValidationError as e:
            return _handle_validation_error(e)
    else:
        # Fallback to pure gemini
        model = genai.GenerativeModel(model_name="gemini-1.5-flash", system_instruction=system_prompt)
        return model.generate_content(prompt).text


async def _call_anthropic(prompt: str, system_prompt: str) -> str:
    import anthropic as ant
    if instructor:
        client = instructor.from_anthropic(ant.Anthropic(api_key=settings.ANTHROPIC_API_KEY))
        try:
            resp = client.messages.create(
                model=getattr(settings, "ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),
                max_tokens=4096,
                system=system_prompt,
                messages=[{"role": "user", "content": prompt}],
                response_model=KernelActionResponse
            )
            return resp.model_dump_json()
        except ValidationError as e:
            return _handle_validation_error(e)
    else:
        client = ant.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=getattr(settings, "ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text


async def route_llm(
    prompt: str,
    persona_name: str,
    system_prompt: str,
    *,
    force_cloud: bool = False,
) -> dict[str, str]:
    token_count = estimate_token_count(prompt + system_prompt)
    load = assess_system_load()

    should_handoff = (
        force_cloud
        or load["ram_pressure"]
        or load["vram_pressure"]
        or token_count > TOKEN_THRESHOLD
    )

    reasons: list[str] = []
    if load["ram_pressure"]: reasons.append(f"low RAM")
    if load["vram_pressure"]: reasons.append(f"low VRAM")
    if token_count > TOKEN_THRESHOLD: reasons.append(f"prompt complexity")
    if force_cloud: reasons.append("caller forced cloud")

    is_unfiltered = persona_name.lower() == "unfiltered"

    # Local Route
    if is_unfiltered and not should_handoff:
        try:
            print(f"[Router] → LOCAL  | tokens={token_count} | {load}", file=sys.stderr)
            content = await _call_ollama(prompt, system_prompt)
            return {"content": content, "routed_to": "local", "reason": "nominal system load"}
        except Exception as exc:
            reasons.append(f"Ollama unavailable ({exc})")
            print(f"[Router] Ollama failed. Elevating. {exc}", file=sys.stderr)

    handoff_reason = "; ".join(reasons) if reasons else "non-Unfiltered persona uses cloud by default"
    print(f"[Router] → CLOUD  | tokens={token_count} | reason={handoff_reason}", file=sys.stderr)

    if getattr(settings, "GEMINI_API_KEY", ""):
        try:
            content = await _call_gemini(prompt, system_prompt)
            return {"content": content, "routed_to": "gemini", "reason": handoff_reason}
        except Exception as exc:
            print(f"[Router] Gemini failed: {exc}", file=sys.stderr)

    if getattr(settings, "ANTHROPIC_API_KEY", ""):
        try:
            content = await _call_anthropic(prompt, system_prompt)
            return {"content": content, "routed_to": "anthropic", "reason": handoff_reason}
        except Exception as exc:
            print(f"[Router] Anthropic failed: {exc}", file=sys.stderr)

    return {"content": "System Error: All llm routes failed.", "routed_to": "fallback", "reason": handoff_reason}