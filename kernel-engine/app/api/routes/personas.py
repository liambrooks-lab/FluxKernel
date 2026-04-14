from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.persona_engine import CognitiveMode, MODE_TOOLSETS
from app.core.project_rag import delete_pin, list_pins, pin_workspace_paths
from app.database.connection import get_db
from app.database.models import Persona, ProjectPin

router = APIRouter(prefix="/personas", tags=["personas"])


class PersonaCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    system_prompt: str = Field(..., min_length=1)
    intensity: str = Field(default="standard", pattern="^(standard|creative|unfiltered)$")


class PersonaOut(BaseModel):
    id: int
    name: str
    system_prompt: str
    intensity: str

    model_config = {"from_attributes": True}


class CognitiveModeOut(BaseModel):
    id: str
    label: str
    description: str
    tools: list[str]


class PinRequest(BaseModel):
    paths: list[str] = Field(..., min_length=1)
    label: str | None = None


class PinOut(BaseModel):
    id: int
    path: str
    kind: str
    label: str | None = None

    model_config = {"from_attributes": True}


MODE_DESCRIPTIONS = {
    CognitiveMode.PROJECT: "Persistent project memory with pinned-file retrieval and citation-first answers.",
    CognitiveMode.PLANNER: "Strict planning schema for timelines, dependencies, and board-ready task payloads.",
    CognitiveMode.CODER: "Compiler-backed software engineering mode with code artifact verification.",
    CognitiveMode.DATA: "Sandboxed pandas/matplotlib execution for real dataset analysis and chart generation.",
}


@router.get("/", response_model=List[PersonaOut])
def list_personas(db: Session = Depends(get_db)):
    return db.query(Persona).order_by(Persona.id).all()


@router.get("/modes", response_model=List[CognitiveModeOut])
def list_cognitive_modes():
    modes: list[CognitiveModeOut] = []
    for mode in (CognitiveMode.PROJECT, CognitiveMode.PLANNER, CognitiveMode.CODER, CognitiveMode.DATA):
        modes.append(
            CognitiveModeOut(
                id=mode.name,
                label=mode.value,
                description=MODE_DESCRIPTIONS[mode],
                tools=[tool.label for tool in MODE_TOOLSETS[mode]],
            )
        )
    return modes


@router.post("/", response_model=PersonaOut, status_code=201)
def create_persona(payload: PersonaCreate, db: Session = Depends(get_db)):
    existing = db.query(Persona).filter(Persona.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Persona '{payload.name}' already exists.")
    persona = Persona(**payload.model_dump())
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return persona


@router.put("/{persona_id}", response_model=PersonaOut)
def update_persona(persona_id: int, payload: PersonaCreate, db: Session = Depends(get_db)):
    persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    for field, value in payload.model_dump().items():
        setattr(persona, field, value)
    db.commit()
    db.refresh(persona)
    return persona


@router.delete("/{persona_id}", status_code=204)
def delete_persona(persona_id: int, db: Session = Depends(get_db)):
    persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    db.delete(persona)
    db.commit()


@router.get("/project/pins", response_model=List[PinOut])
def get_project_pins(db: Session = Depends(get_db)):
    return list_pins(db)


@router.post("/project/pins", response_model=List[PinOut], status_code=201)
def create_project_pins(payload: PinRequest, db: Session = Depends(get_db)):
    try:
        return pin_workspace_paths(db, payload.paths, label=payload.label)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/project/pins/{pin_id}", status_code=204)
def remove_project_pin(pin_id: int, db: Session = Depends(get_db)):
    deleted = delete_pin(db, pin_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Pinned path not found")

