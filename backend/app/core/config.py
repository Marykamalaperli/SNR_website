from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    app_env: Literal["development", "test", "production"] = "development"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]
    database_url: str = ""
    access_cookie_name: str = "snr_access"
    refresh_cookie_name: str = "snr_refresh"
    access_session_minutes: int = 15
    refresh_session_days: int = 30
    session_cookie_secure: bool = True

    @model_validator(mode="after")
    def validate_security(self):
        self.database_url = self.database_url.strip()
        if self.database_url and not self.database_url.startswith(
            ("postgresql://", "postgresql+psycopg://")
        ):
            raise ValueError("DATABASE_URL must use PostgreSQL")
        if self.app_env == "production" and not self.database_url:
            raise ValueError("Production requires DATABASE_URL")
        if self.access_session_minutes < 1 or self.access_session_minutes > 60:
            raise ValueError("Access session lifetime must be between 1 and 60 minutes")
        if self.refresh_session_days < 1 or self.refresh_session_days > 30:
            raise ValueError("Refresh session lifetime must be between 1 and 30 days")
        if not self.allowed_hosts or "*" in self.allowed_hosts:
            raise ValueError("Configure explicit allowed hosts")
        for origin in self.cors_origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.path
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError("CORS origins must be exact HTTP(S) origins")
            if self.app_env == "production" and parsed.scheme != "https":
                raise ValueError("Production CORS origins must use HTTPS")
        if self.app_env == "production" and not self.session_cookie_secure:
            raise ValueError("Production session cookies must be Secure")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
