from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database.connection import get_db
from app.database.models import Persona, ChatSession, Message
from app.core.llm_router import route_llm

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
    routed_to: str = "unknown"
    routing_reason: str = ""

@router.post("/", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    # 1. Fetch or create Persona
    persona = db.query(Persona).filter(Persona.name == request.persona_name).first()
    if not persona:
        persona = Persona(
            name=request.persona_name,
            system_prompt="You are FluxKernel.",
            intensity="standard"
        )
        db.add(persona)
        db.commit()
    
    # 2. Fetch or create Session
    if request.session_id:
        chat_session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
        if not chat_session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        chat_session = ChatSession(persona_id=persona.id)
        db.add(chat_session)
        db.commit()
        db.refresh(chat_session)
        
    # 3. Save User Message
    user_msg = Message(session_id=chat_session.id, role="user", content=request.prompt)
    db.add(user_msg)
    db.commit()
    
    # 4. Call LLM Router
    llm_result = await route_llm(
        prompt=request.prompt,
        persona_name=persona.name,
        system_prompt=persona.system_prompt
    )
    llm_response_text = llm_result["content"]
    routed_to = llm_result.get("routed_to", "unknown")
    routing_reason = llm_result.get("reason", "")
    
    # 5. Save Kernel Message
    kernel_msg = Message(session_id=chat_session.id, role="kernel", content=llm_response_text)
    db.add(kernel_msg)
    db.commit()
    db.refresh(kernel_msg)
    
    return ChatResponse(
        session_id=chat_session.id,
        message_id=kernel_msg.id,
        content=kernel_msg.content,
        role=kernel_msg.role,
        routed_to=routed_to,
        routing_reason=routing_reason,
    )