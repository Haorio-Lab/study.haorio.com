from __future__ import annotations

from typing import Annotated, Callable
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .config import Settings
from .models import AuthenticatedUser


_bearer = HTTPBearer(auto_error=False)


class SupabaseTokenVerifier:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._jwks = PyJWKClient(settings.jwks_url, cache_keys=True, lifespan=3600)

    def verify(self, token: str) -> AuthenticatedUser:
        try:
            signing_key = self._jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience=self._settings.jwt_audience,
                issuer=self._settings.jwt_issuer,
                options={"require": ["exp", "sub", "aud", "iss"]},
            )
            user_id = UUID(str(claims["sub"]))
            email = str(claims.get("email") or "").strip().lower()
            if not email:
                raise ValueError("email claim is missing")
            return AuthenticatedUser(id=user_id, email=email)
        except (jwt.PyJWTError, KeyError, TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from None


def create_current_user_dependency(
    verifier: SupabaseTokenVerifier,
) -> Callable[..., AuthenticatedUser]:
    def current_user(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    ) -> AuthenticatedUser:
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Bearer access token is required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return verifier.verify(credentials.credentials)

    return current_user
