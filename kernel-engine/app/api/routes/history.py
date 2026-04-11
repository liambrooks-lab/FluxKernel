from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.database.connection import get_db
from app.database.models import ChatSession, Message

router = APIRouter(prefix="/history", tags=["history"])


class MessageOut(BaseModel):
    id: int
    role: str
    content: str

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: int
    title: str
    messages: List[MessageOut] = []

    model_config = {"from_attributes": True}


@router.get("/sessions", response_model=List[SessionOut])
def list_sessions(db: Session = Depends(get_db)):
    """Return all chat sessions ordered by most recent."""
    sessions = db.query(ChatSession).order_by(ChatSession.id.desc()).all()
    return sessions


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: Session = Depends(get_db)):
    """Return a single session with all its messages."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db)):
    """Delete a session and cascade-delete all its messages."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()