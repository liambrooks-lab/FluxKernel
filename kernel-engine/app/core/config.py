from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./fluxkernel.db"

    # ── Local LLM (Ollama) ────────────────────────────────────────────────────
    LOCAL_LLM_URL: str = "http://localhost:11434"
    LOCAL_LLM_MODEL: str = "llama3"

    # ── Feature 1: Async Task Queue (Redis/Celery) ────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # ── Feature 3: Cloud LLM Fallback Keys ───────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"

    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-20241022"

    # ── Feature 3: Cognitive Routing Thresholds ───────────────────────────────
    # Handoff to cloud when free RAM drops below this (GB)
    CLOUD_HANDOFF_RAM_THRESHOLD_GB: float = 1.0
    # Handoff to cloud when prompt+system_prompt exceeds this token estimate
    CLOUD_HANDOFF_TOKEN_THRESHOLD: int = 2048

    # ── Feature 5: Web Fetcher ────────────────────────────────────────────────
    # Optional allowlist of domains. Empty string = all https domains allowed.
    WEB_FETCH_DOMAIN_ALLOWLIST: str = ""

    # ── Security ──────────────────────────────────────────────────────────────
    FLUX_API_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()