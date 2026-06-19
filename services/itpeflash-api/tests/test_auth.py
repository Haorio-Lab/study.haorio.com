from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app.auth import SupabaseTokenVerifier
from app.config import Settings


USER_ID = "c152558c-dc3e-4ce3-872f-c9958db33b37"


def build_verifier() -> tuple[SupabaseTokenVerifier, ec.EllipticCurvePrivateKey]:
    settings = Settings(
        database_url="postgresql://unused",
        supabase_url="https://example.supabase.co",
        allowed_origins=("https://itpeflash.haorio.com",),
    )
    private_key = ec.generate_private_key(ec.SECP256R1())
    verifier = SupabaseTokenVerifier(settings)
    verifier._jwks = SimpleNamespace(  # type: ignore[attr-defined]
        get_signing_key_from_jwt=lambda _token: SimpleNamespace(
            key=private_key.public_key()
        )
    )
    return verifier, private_key


def make_token(
    private_key: ec.EllipticCurvePrivateKey,
    *,
    issuer: str = "https://example.supabase.co/auth/v1",
    email: str | None = "jw_hoy@naver.com",
) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": USER_ID,
        "aud": "authenticated",
        "iss": issuer,
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    if email is not None:
        claims["email"] = email
    return jwt.encode(claims, private_key, algorithm="ES256")


def test_verifier_accepts_valid_supabase_access_token() -> None:
    verifier, private_key = build_verifier()

    user = verifier.verify(make_token(private_key))

    assert str(user.id) == USER_ID
    assert user.email == "jw_hoy@naver.com"


@pytest.mark.parametrize(
    ("issuer", "email"),
    [
        ("https://wrong.example/auth/v1", "jw_hoy@naver.com"),
        ("https://example.supabase.co/auth/v1", None),
    ],
)
def test_verifier_rejects_invalid_claims(issuer: str, email: str | None) -> None:
    verifier, private_key = build_verifier()

    with pytest.raises(HTTPException) as error:
        verifier.verify(make_token(private_key, issuer=issuer, email=email))

    assert error.value.status_code == 401
