from __future__ import annotations

import os
from dataclasses import dataclass


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Required environment variable is missing: {name}")
    return value


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    supabase_url: str
    allowed_origins: tuple[str, ...]
    jwt_audience: str = "authenticated"

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"

    @classmethod
    def from_env(cls) -> "Settings":
        origins = tuple(
            origin.strip()
            for origin in os.getenv(
                "ITPEFLASH_ALLOWED_ORIGINS", "https://itpeflash.haorio.com"
            ).split(",")
            if origin.strip()
        )
        if not origins or "*" in origins:
            raise RuntimeError(
                "ITPEFLASH_ALLOWED_ORIGINS must contain explicit HTTPS origins"
            )
        return cls(
            database_url=_required_env("DATABASE_URL"),
            supabase_url=_required_env("SUPABASE_URL"),
            allowed_origins=origins,
            jwt_audience=os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated").strip(),
        )
