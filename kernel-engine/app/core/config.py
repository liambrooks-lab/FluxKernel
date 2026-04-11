from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./fluxkernel.db"
    LOCAL_LLM_URL: str = "http://localhost:11434"
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()