from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application configuration settings."""

    app_name: str = "Loom Backend"
    debug: bool = True
    version: str = "0.1.0"
    description: str = "FastAPI service for Loom image processing"

    # Cloud Vision AI credentials
    gemini_api_key: Optional[str] = None
    hf_api_token: Optional[str] = None
    groq_api_key: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"
