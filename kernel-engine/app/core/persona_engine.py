from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.project_rag import RetrievedChunk, build_context_block, retrieve_context
from app.tools.code_executor import check_compiler_availability


class CognitiveMode(str, Enum):
    PROJECT = "PROJECT MODE"
    PLANNER = "PLANNER & SCHEDULE MODE"
    CODER = "CODER MODE"
    DATA = "DATA ANALYSIS MODE"
    STANDARD = "Standard"


class ToolDescriptor(BaseModel):
    id: str
    label: str
    description: str


class ProjectModeResponse(BaseModel):
    type: str = "project_mode"
    answer: str = Field(..., description="Grounded response built from the retrieved project context.")
    retrieved_context_paths: list[str] = Field(default_factory=list)
    pinned_paths: list[str] = Field(default_factory=list)
    follow_up_actions: list[str] = Field(default_factory=list)


class PlanTask(BaseModel):
    id: str
    title: str
    description: str
    status: str = Field(..., description="todo, in_progress, blocked, or done")
    owner: str = "unassigned"
    start: str = Field(..., description="ISO date string")
    end: str = Field(..., description="ISO date string")
    effort_points: int = 1
    tags: list[str] = Field(default_factory=list)


class PlanDependency(BaseModel):
    from_task_id: str
    to_task_id: str
    kind: str = Field(default="finish_to_start")


class PlanTimeline(BaseModel):
    start: str
    end: str
    milestones: list[str] = Field(default_factory=list)
    critical_path: list[str] = Field(default_factory=list)


class PlannerModeResponse(BaseModel):
    type: str = "planner_mode"
    title: str
    summary: str
    tasks: list[PlanTask]
    dependencies: list[PlanDependency] = Field(default_factory=list)
    timeline: PlanTimeline


class CodeArtifact(BaseModel):
    path: str
    language: str
    content: str
    purpose: str


class VerificationResult(BaseModel):
    language: str
    success: bool
    exit_code: int
    stdout: str = ""
    stderr: str = ""


class CoderModeResponse(BaseModel):
    type: str = "coder_mode"
    summary: str
    implementation_notes: list[str] = Field(default_factory=list)
    code_artifacts: list[CodeArtifact] = Field(default_factory=list)
    verification: list[VerificationResult] = Field(default_factory=list)
    diff_hints: list[str] = Field(default_factory=list)


class DataArtifact(BaseModel):
    path: str
    media_type: str
    description: str


class DataAnalysisPlan(BaseModel):
    summary: str
    python_code: str = Field(..., description="Pure Python analysis using pandas/matplotlib and the provided dataset paths.")
    expected_artifacts: list[str] = Field(default_factory=list)


class DataAnalysisResponse(BaseModel):
    type: str = "data_analysis_mode"
    summary: str
    insights: list[str] = Field(default_factory=list)
    output_files: list[DataArtifact] = Field(default_factory=list)
    stdout: str = ""
    stderr: str = ""


@dataclass
class AttachmentContext:
    filename: str
    stored_path: str
    media_type: str
    relative_path: str | None = None

    def describe(self) -> dict[str, str]:
        return {
            "filename": self.filename,
            "stored_path": self.stored_path,
            "media_type": self.media_type,
            "relative_path": self.relative_path or self.filename,
        }


@dataclass
class ResolvedMode:
    mode: CognitiveMode
    display_name: str
    system_prompt: str
    response_model: type[BaseModel] | None
    tools: list[ToolDescriptor] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


MODE_TOOLSETS: dict[CognitiveMode, list[ToolDescriptor]] = {
    CognitiveMode.PROJECT: [
        ToolDescriptor(
            id="project_rag",
            label="Pinned Project Context",
            description="Reads only persisted, pinned workspace chunks and cites their paths.",
        ),
    ],
    CognitiveMode.PLANNER: [
        ToolDescriptor(
            id="planner_schema",
            label="Planner JSON Schema",
            description="Must produce structured tasks, dependencies, and timeline only.",
        ),
    ],
    CognitiveMode.CODER: [
        ToolDescriptor(
            id="subprocess_compiler",
            label="Subprocess Compiler",
            description="Compile and execute generated code before the answer is finalized.",
        ),
        ToolDescriptor(
            id="diff_viewer",
            label="Diff Viewer",
            description="Emit file-level artifacts and diff hints that the frontend can review.",
        ),
    ],
    CognitiveMode.DATA: [
        ToolDescriptor(
            id="python_pandas",
            label="Pandas Sandbox",
            description="Use pandas and matplotlib against the attached datasets instead of estimating results.",
        ),
    ],
    CognitiveMode.STANDARD: [],
}


def normalize_mode(persona_name: str | None) -> CognitiveMode:
    candidate = (persona_name or "").strip().upper()
    aliases = {
        "PROJECT": CognitiveMode.PROJECT,
        "PROJECT MODE": CognitiveMode.PROJECT,
        "PLANNER": CognitiveMode.PLANNER,
        "PLANNER & SCHEDULE MODE": CognitiveMode.PLANNER,
        "PLANNER AND SCHEDULE MODE": CognitiveMode.PLANNER,
        "CODER": CognitiveMode.CODER,
        "CODER MODE": CognitiveMode.CODER,
        "DATA": CognitiveMode.DATA,
        "DATA ANALYSIS": CognitiveMode.DATA,
        "DATA ANALYSIS MODE": CognitiveMode.DATA,
        "STANDARD": CognitiveMode.STANDARD,
    }
    return aliases.get(candidate, CognitiveMode.STANDARD)


class PersonaEngine:
    def __init__(self, db: Session):
        self.db = db

    def resolve(
        self,
        persona_name: str,
        base_system_prompt: str,
        user_prompt: str,
        attachments: list[AttachmentContext] | None = None,
    ) -> ResolvedMode:
        mode = normalize_mode(persona_name)
        attachments = attachments or []

        if mode is CognitiveMode.PROJECT:
            retrieved = retrieve_context(self.db, user_prompt, limit=6)
            return ResolvedMode(
                mode=mode,
                display_name=mode.value,
                response_model=ProjectModeResponse,
                tools=MODE_TOOLSETS[mode],
                metadata={
                    "retrieved_chunks": retrieved,
                    "pinned_paths": sorted({chunk.path for chunk in retrieved}),
                },
                system_prompt=self._build_project_prompt(base_system_prompt, retrieved, attachments),
            )

        if mode is CognitiveMode.PLANNER:
            return ResolvedMode(
                mode=mode,
                display_name=mode.value,
                response_model=PlannerModeResponse,
                tools=MODE_TOOLSETS[mode],
                system_prompt=self._build_planner_prompt(base_system_prompt),
            )

        if mode is CognitiveMode.CODER:
            return ResolvedMode(
                mode=mode,
                display_name=mode.value,
                response_model=CoderModeResponse,
                tools=MODE_TOOLSETS[mode],
                metadata={"compiler_availability": check_compiler_availability()},
                system_prompt=self._build_coder_prompt(base_system_prompt),
            )

        if mode is CognitiveMode.DATA:
            return ResolvedMode(
                mode=mode,
                display_name=mode.value,
                response_model=DataAnalysisPlan,
                tools=MODE_TOOLSETS[mode],
                metadata={"attachments": [attachment.describe() for attachment in attachments]},
                system_prompt=self._build_data_prompt(base_system_prompt, attachments),
            )

        return ResolvedMode(
            mode=CognitiveMode.STANDARD,
            display_name=base_system_prompt or CognitiveMode.STANDARD.value,
            response_model=None,
            tools=[],
            system_prompt=base_system_prompt,
        )

    def _build_project_prompt(
        self,
        base_system_prompt: str,
        retrieved: list[RetrievedChunk],
        attachments: list[AttachmentContext],
    ) -> str:
        context_block = build_context_block(retrieved)
        attachment_manifest = json.dumps([attachment.describe() for attachment in attachments], indent=2)
        return (
            f"{base_system_prompt}\n\n"
            "You are FluxKernel in PROJECT MODE.\n"
            "Ground every statement in retrieved project context or explicitly say that the relationship is unknown.\n"
            "Never invent file relationships, ownership, or architecture beyond the pinned context.\n"
            "Return only JSON matching the provided schema.\n"
            "Available tools: pinned project context retrieval.\n\n"
            f"Retrieved project context:\n{context_block or '[none pinned yet]'}\n\n"
            f"Incoming attachments:\n{attachment_manifest}"
        )

    def _build_planner_prompt(self, base_system_prompt: str) -> str:
        return (
            f"{base_system_prompt}\n\n"
            "You are FluxKernel in PLANNER & SCHEDULE MODE.\n"
            "You must output only valid JSON matching the planner schema.\n"
            "Do not output markdown. Do not output prose outside the JSON fields.\n"
            "Every task must include dates, status, effort points, and a concise description.\n"
            "Dependencies must reference valid task ids.\n"
            "Timeline dates must align with the tasks."
        )

    def _build_coder_prompt(self, base_system_prompt: str) -> str:
        availability = json.dumps(check_compiler_availability(), indent=2)
        return (
            f"{base_system_prompt}\n\n"
            "You are FluxKernel in CODER MODE.\n"
            "Be syntax-first, implementation-heavy, and avoid speculation.\n"
            "Return only valid JSON matching the coder schema.\n"
            "Whenever you emit code, include it in code_artifacts with a path and language.\n"
            "Assume every generated code block will be compiled or executed before the answer is returned.\n"
            "Use diff_hints to describe file-level edits instead of long prose.\n\n"
            f"Compiler availability:\n{availability}"
        )

    def _build_data_prompt(
        self,
        base_system_prompt: str,
        attachments: list[AttachmentContext],
    ) -> str:
        attachment_manifest = json.dumps([attachment.describe() for attachment in attachments], indent=2)
        return (
            f"{base_system_prompt}\n\n"
            "You are FluxKernel in DATA ANALYSIS MODE.\n"
            "Produce only valid JSON matching the data analysis planning schema.\n"
            "Generate Python that uses pandas/matplotlib against the supplied attachment paths.\n"
            "Never guess numerical insights. The Python execution result is the source of truth.\n"
            "Save charts as PNGs and additionally emit base64 text artifacts into the workspace.\n\n"
            f"Attached datasets and media:\n{attachment_manifest}"
        )

