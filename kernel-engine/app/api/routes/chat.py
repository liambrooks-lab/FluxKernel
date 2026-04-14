from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app.core.data_analysis import run_analysis_code
from app.core.llm_router import route_llm
from app.core.persona_engine import (
    AttachmentContext,
    CoderModeResponse,
    CognitiveMode,
    DataAnalysisPlan,
    DataAnalysisResponse,
    PersonaEngine,
    ProjectModeResponse,
    VerificationResult,
    normalize_mode,
)
from app.database.connection import get_db
from app.database.models import ChatSession, Message, Persona
from app.tools.code_executor import execute_code_sync
from app.tools.file_manager import WORKSPACE_DIR

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: int | None = None
    prompt: str
    persona_name: str = "Standard"


class ChatResponse(BaseModel):
    session_id: int
    message_id: int
    content: str
    role: str
    mode: str = "Standard"
    routed_to: str = "unknown"
    routing_reason: str = ""


def _sanitize_relative_path(raw_path: str | None, fallback_name: str) -> str:
    path = Path(raw_path or fallback_name)
    safe_parts = [part for part in path.parts if part not in {"..", ".", "/", "\\"}]
    return "/".join(safe_parts) or fallback_name


async def _parse_chat_request(request: Request) -> tuple[ChatRequest, list[UploadFile], list[dict[str, Any]]]:
    content_type = request.headers.get("content-type", "").lower()

    if "multipart/form-data" in content_type:
        form = await request.form()
        prompt = str(form.get("prompt", "")).strip()
        persona_name = str(form.get("persona_name", "Standard")).strip() or "Standard"
        session_id_value = form.get("session_id")
        attachments_meta_raw = str(form.get("attachments_meta", "[]"))
        try:
            attachments_meta = json.loads(attachments_meta_raw)
        except json.JSONDecodeError:
            attachments_meta = []

        files = [
            value
            for _, value in form.multi_items()
            if isinstance(value, UploadFile)
        ]

        return (
            ChatRequest(
                prompt=prompt,
                persona_name=persona_name,
                session_id=int(session_id_value) if session_id_value not in {None, "", "null"} else None,
            ),
            files,
            attachments_meta if isinstance(attachments_meta, list) else [],
        )

    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid request payload: {exc}") from exc

    try:
        return ChatRequest.model_validate(body), [], []
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc


def _get_or_create_persona(db: Session, persona_name: str) -> Persona:
    persona = db.query(Persona).filter(Persona.name == persona_name).first()
    if persona is None:
        persona = Persona(
            name=persona_name,
            system_prompt="You are FluxKernel, a highly capable AI operating system.",
            intensity="standard",
        )
        db.add(persona)
        db.commit()
        db.refresh(persona)
    return persona


def _get_or_create_session(db: Session, session_id: int | None, persona_id: int) -> ChatSession:
    if session_id is not None:
        session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return session

    session = ChatSession(persona_id=persona_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


async def _save_attachments(
    chat_session: ChatSession,
    files: list[UploadFile],
    metadata: list[dict[str, Any]],
) -> list[AttachmentContext]:
    if not files:
        return []

    saved: list[AttachmentContext] = []
    root = WORKSPACE_DIR / "uploads" / f"session_{chat_session.id}"
    root.mkdir(parents=True, exist_ok=True)

    for index, upload in enumerate(files):
        meta = metadata[index] if index < len(metadata) and isinstance(metadata[index], dict) else {}
        relative_name = _sanitize_relative_path(
            meta.get("relativePath") or meta.get("relative_path"),
            upload.filename or f"attachment_{index}",
        )
        stored_relative = Path("uploads") / f"session_{chat_session.id}" / relative_name
        target = WORKSPACE_DIR / stored_relative
        target.parent.mkdir(parents=True, exist_ok=True)
        content = await upload.read()
        target.write_bytes(content)

        saved.append(
            AttachmentContext(
                filename=upload.filename or target.name,
                stored_path=stored_relative.as_posix(),
                media_type=upload.content_type or meta.get("type") or "application/octet-stream",
                relative_path=relative_name,
            )
        )

    return saved


def _merge_project_payload(content: str, pinned_paths: list[str]) -> str:
    parsed = ProjectModeResponse.model_validate_json(content)
    merged = parsed.model_copy(
        update={
            "retrieved_context_paths": parsed.retrieved_context_paths or pinned_paths,
            "pinned_paths": pinned_paths,
        }
    )
    return merged.model_dump_json()


def _verify_coder_payload(content: str) -> str:
    parsed = CoderModeResponse.model_validate_json(content)
    verification: list[VerificationResult] = []

    for artifact in parsed.code_artifacts:
        result = execute_code_sync(
            artifact.content,
            language=artifact.language,
            timeout=45,
        )
        verification.append(
            VerificationResult(
                language=artifact.language,
                success=bool(result.get("success")),
                exit_code=int(result.get("exit_code", -1)),
                stdout=str(result.get("stdout", ""))[:4000],
                stderr=str(result.get("stderr", ""))[:4000],
            )
        )

    merged = parsed.model_copy(update={"verification": verification})
    return merged.model_dump_json()


def _run_data_mode(
    prompt: str,
    content: str,
    attachments: list[AttachmentContext],
) -> str:
    plan = DataAnalysisPlan.model_validate_json(content)
    if not attachments:
        return DataAnalysisResponse(
            summary=plan.summary,
            insights=["No datasets were attached, so the pandas sandbox was not executed."],
            output_files=[],
            stdout="",
            stderr="DATA ANALYSIS MODE requires at least one uploaded dataset or image.",
        ).model_dump_json()

    execution = run_analysis_code(prompt, plan.python_code, attachments)
    enriched = execution.model_copy(update={"summary": plan.summary})
    return enriched.model_dump_json()


@router.post("/", response_model=ChatResponse)
async def chat_endpoint(request: Request, db: Session = Depends(get_db)):
    parsed_request, files, attachments_meta = await _parse_chat_request(request)
    if not parsed_request.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty.")

    persona = _get_or_create_persona(db, parsed_request.persona_name)
    chat_session = _get_or_create_session(db, parsed_request.session_id, persona.id)
    attachments = await _save_attachments(chat_session, files, attachments_meta)

    user_message = Message(session_id=chat_session.id, role="user", content=parsed_request.prompt)
    db.add(user_message)
    db.commit()

    persona_engine = PersonaEngine(db)
    resolved = persona_engine.resolve(
        persona_name=persona.name,
        base_system_prompt=persona.system_prompt,
        user_prompt=parsed_request.prompt,
        attachments=attachments,
    )

    llm_result = await route_llm(
        prompt=parsed_request.prompt,
        persona_name=resolved.display_name,
        system_prompt=resolved.system_prompt,
        response_model=resolved.response_model,
    )

    content = llm_result["content"]
    if resolved.mode is CognitiveMode.PROJECT:
        pinned_paths = sorted({chunk.path for chunk in resolved.metadata.get("retrieved_chunks", [])})
        content = _merge_project_payload(content, pinned_paths)
    elif resolved.mode is CognitiveMode.CODER:
        content = _verify_coder_payload(content)
    elif resolved.mode is CognitiveMode.DATA:
        content = _run_data_mode(parsed_request.prompt, content, attachments)

    kernel_message = Message(session_id=chat_session.id, role="kernel", content=content)
    db.add(kernel_message)
    db.commit()
    db.refresh(kernel_message)

    return ChatResponse(
        session_id=chat_session.id,
        message_id=kernel_message.id,
        content=kernel_message.content,
        role=kernel_message.role,
        mode=resolved.display_name,
        routed_to=llm_result.get("routed_to", "unknown"),
        routing_reason=llm_result.get("reason", ""),
    )

