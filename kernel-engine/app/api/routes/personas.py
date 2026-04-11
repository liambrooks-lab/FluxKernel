from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, Field
from app.database.connection import get_db
from app.database.models import Persona

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


@router.get("/", response_model=List[PersonaOut])
def list_personas(db: Session = Depends(get_db)):
    return db.query(Persona).order_by(Persona.id).all()


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