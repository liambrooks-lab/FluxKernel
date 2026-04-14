from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.connection import Base

class Persona(Base):
    __tablename__ = "personas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, index=True, nullable=False)
    system_prompt = Column(Text, nullable=False)
    intensity = Column(String(20), default="standard")
    
    sessions = relationship("ChatSession", back_populates="persona")

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), default="New Session")
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    persona = relationship("Persona", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"))
    role = Column(String(20), nullable=False) # 'user' or 'kernel'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    session = relationship("ChatSession", back_populates="messages")


class ProjectPin(Base):
    __tablename__ = "project_pins"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String(500), unique=True, nullable=False, index=True)
    kind = Column(String(20), nullable=False, default="file")
    label = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    chunks = relationship(
        "ProjectDocumentChunk",
        back_populates="pin",
        cascade="all, delete-orphan",
    )


class ProjectDocumentChunk(Base):
    __tablename__ = "project_document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    pin_id = Column(Integer, ForeignKey("project_pins.id"), nullable=False, index=True)
    path = Column(String(500), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pin = relationship("ProjectPin", back_populates="chunks")
