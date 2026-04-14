from __future__ import annotations

import json
import subprocess
import sys
from typing import Any

import httpx
import psutil
from pydantic import BaseModel, ValidationError

try:
    import instructor
except ImportError:
    instructor = None

from app.core.config import settings

RAM_THRESHOLD_GB: float = getattr(settings, "CLOUD_HANDOFF_RAM_THRESHOLD_GB", 1.0)
TOKEN_THRESHOLD: int = getattr(settings, "CLOUD_HANDOFF_TOKEN_THRESHOLD", 2048)


class TextResponseSchema(BaseModel):
    type: str = "text"
    content: str


def estimate_token_count(text: str) -> int:
    return max(1, len(text) // 4)


def _get_vram_free_gb() -> float | None:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            mib_free = float(result.stdout.strip().splitlines()[0])
            return mib_free / 1024
    except Exception:
        return None
    return None


def assess_system_load() -> dict[str, Any]:
    ram_available_gb = psutil.virtual_memory().available / (1024 ** 3)
    vram_gb = _get_vram_free_gb()
    return {
        "ram_available_gb": ram_available_gb,
        "vram_available_gb": vram_gb,
        "ram_pressure": ram_available_gb < RAM_THRESHOLD_GB,
        "vram_pressure": (vram_gb is not None) and (vram_gb < RAM_THRESHOLD_GB),
    }


def _handle_validation_error(exc: Exception) -> str:
    print(f"[Router] Validation failed: {exc}", file=sys.stderr)
    return json.dumps(
        {
            "type": "error",
            "content": "Structured response validation failed.",
            "details": str(exc),
        }
    )


def _json_guidance(response_model: type[BaseModel]) -> str:
    return (
        "Return only valid JSON matching this schema exactly.\n"
        f"{json.dumps(response_model.model_json_schema(), ensure_ascii=True)}"
    )


def _validate_structured_output(
    raw: str,
    response_model: type[BaseModel] | None,
) -> str:
    if response_model is None:
        return raw

    try:
        parsed = response_model.model_validate_json(raw)
        return parsed.model_dump_json()
    except ValidationError as exc:
        return _handle_validation_error(exc)


async def _call_ollama(
    prompt: str,
    system_prompt: str,
    response_model: type[BaseModel] | None = None,
) -> str:
    prompt_body = prompt
    request_body: dict[str, Any] = {
        "model": getattr(settings, "LOCAL_LLM_MODEL", "llama3"),
        "prompt": f"{system_prompt}\n\nUser: {prompt_body}\nAssistant:",
        "stream": False,
    }
    if response_model is not None:
        request_body["prompt"] = (
            f"{system_prompt}\n\n{_json_guidance(response_model)}\n\nUser: {prompt_body}\nAssistant:"
        )
        request_body["format"] = "json"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.LOCAL_LLM_URL}/api/generate",
            json=request_body,
            timeout=90.0,
        )
        response.raise_for_status()
        raw = response.json().get("response", "")
        return _validate_structured_output(raw, response_model)


async def _call_gemini(
    prompt: str,
    system_prompt: str,
    response_model: type[BaseModel] | None = None,
) -> str:
    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model_name = getattr(settings, "GEMINI_MODEL", "gemini-1.5-flash")

    if instructor and response_model is not None:
        client = instructor.from_gemini(
            client=genai.GenerativeModel(model_name=model_name),
            mode=instructor.Mode.GEMINI_JSON,
        )
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            response_model=response_model,
        )
        return response.model_dump_json()

    model = genai.GenerativeModel(model_name=model_name, system_instruction=system_prompt)
    raw = model.generate_content(
        f"{_json_guidance(response_model)}\n\n{prompt}" if response_model else prompt
    ).text
    return _validate_structured_output(raw, response_model)


async def _call_anthropic(
    prompt: str,
    system_prompt: str,
    response_model: type[BaseModel] | None = None,
) -> str:
    import anthropic as ant

    model_name = getattr(settings, "ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")

    if instructor and response_model is not None:
        client = instructor.from_anthropic(ant.Anthropic(api_key=settings.ANTHROPIC_API_KEY))
        response = client.messages.create(
            model=model_name,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
            response_model=response_model,
        )
        return response.model_dump_json()

    client = ant.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=model_name,
        max_tokens=4096,
        system=system_prompt if response_model is None else f"{system_prompt}\n\n{_json_guidance(response_model)}",
        messages=[{"role": "user", "content": prompt}],
    )
    raw = "".join(
        block.text for block in message.content if getattr(block, "type", "") == "text"
    )
    return _validate_structured_output(raw, response_model)


async def route_llm(
    prompt: str,
    persona_name: str,
    system_prompt: str,
    *,
    force_cloud: bool = False,
    response_model: type[BaseModel] | None = None,
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
    if load["ram_pressure"]:
        reasons.append("low RAM")
    if load["vram_pressure"]:
        reasons.append("low VRAM")
    if token_count > TOKEN_THRESHOLD:
        reasons.append("prompt complexity")
    if force_cloud:
        reasons.append("caller forced cloud")

    allow_local = persona_name.lower() in {
        "unfiltered",
        "project mode",
        "planner & schedule mode",
        "coder mode",
        "data analysis mode",
    }

    if allow_local and not should_handoff:
        try:
            print(f"[Router] -> LOCAL | tokens={token_count} | {load}", file=sys.stderr)
            content = await _call_ollama(prompt, system_prompt, response_model)
            return {
                "content": content,
                "routed_to": "local",
                "reason": "nominal system load",
            }
        except Exception as exc:
            reasons.append(f"Ollama unavailable ({exc})")
            print(f"[Router] Local route failed: {exc}", file=sys.stderr)

    handoff_reason = "; ".join(reasons) if reasons else "cloud default"
    print(f"[Router] -> CLOUD | tokens={token_count} | reason={handoff_reason}", file=sys.stderr)

    if getattr(settings, "GEMINI_API_KEY", ""):
        try:
            content = await _call_gemini(prompt, system_prompt, response_model)
            return {"content": content, "routed_to": "gemini", "reason": handoff_reason}
        except Exception as exc:
            print(f"[Router] Gemini failed: {exc}", file=sys.stderr)

    if getattr(settings, "ANTHROPIC_API_KEY", ""):
        try:
            content = await _call_anthropic(prompt, system_prompt, response_model)
            return {"content": content, "routed_to": "anthropic", "reason": handoff_reason}
        except Exception as exc:
            print(f"[Router] Anthropic failed: {exc}", file=sys.stderr)

    if response_model is not None:
        fallback = _handle_validation_error(RuntimeError("No available LLM route"))
    else:
        fallback = "System Error: All llm routes failed."

    return {"content": fallback, "routed_to": "fallback", "reason": handoff_reason}

