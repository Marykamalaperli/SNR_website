from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]
    supabase_url: str = ""
    supabase_jwt_issuer: str = ""
    supabase_jwt_audience: str = "authenticated"
    supabase_jwks_url: str = ""

    @model_validator(mode="after")
    def validate_security(self):
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
        if bool(self.supabase_jwt_issuer) != bool(self.supabase_jwks_url):
            raise ValueError("Configure both JWT issuer and JWKS URL")
        for value in (self.supabase_url, self.supabase_jwt_issuer, self.supabase_jwks_url):
            if value:
                parsed = urlsplit(value)
                if (
                    parsed.scheme != "https"
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                ):
                    raise ValueError("Supabase authentication endpoints must use HTTPS")
        if self.supabase_jwt_issuer and not self.supabase_jwt_audience:
            raise ValueError("JWT audience must not be empty")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
