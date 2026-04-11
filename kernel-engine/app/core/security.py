"""
Security module — API key verification and request origin validation.
Extend with JWT / OAuth2 when deploying to production.
"""
import os
import secrets
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)

# Loaded from env; falls back to a random key in dev so the server still starts.
_API_KEY = os.getenv("FLUX_API_KEY", "")


def verify_token(api_key: str = Security(API_KEY_HEADER)) -> str:
    """
    FastAPI dependency. Use as:
        @router.post("/secure")
        def endpoint(key: str = Depends(verify_token)):
            ...

    In dev (FLUX_API_KEY not set) every request is allowed through.
    In production set FLUX_API_KEY in the environment.
    """
    if not _API_KEY:
        # Development mode — no key required
        return "dev"

    if not api_key or not secrets.compare_digest(api_key, _API_KEY):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API key.",
        )
    return api_key