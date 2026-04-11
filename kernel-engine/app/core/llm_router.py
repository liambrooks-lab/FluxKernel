import httpx
from app.core.config import settings

async def route_llm(prompt: str, persona_name: str, system_prompt: str) -> str:
    """
    Routes to local model if persona is 'Unfiltered', else mocks standard API response.
    """
    if persona_name.lower() == "unfiltered":
        # Route to Local LLM (e.g. Ollama)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.LOCAL_LLM_URL}/api/generate",
                    json={
                        "model": "llama3", # typical default local model
                        "prompt": f"{system_prompt}\n\nUser: {prompt}\nKernel:",
                        "stream": False
                    },
                    timeout=30.0
                )
                if response.status_code == 200:
                    return response.json().get("response", "No response content from local LLM.")
                return f"Error from Local LLM: HTTP {response.status_code}"
        except Exception as e:
            return f"Failed to connect to local LLM at {settings.LOCAL_LLM_URL}. Error: {str(e)}"
    
    else:
        # Mock standard API response for demo purposes
        return f"[Standard API Mock] Processed via {persona_name} logic. Response prepared for context: '{prompt}'."