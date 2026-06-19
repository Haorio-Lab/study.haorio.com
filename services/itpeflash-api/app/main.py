from __future__ import annotations

import logging

import psycopg
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .auth import SupabaseTokenVerifier, create_current_user_dependency
from .config import Settings
from .db import SnapshotRepository
from .models import AuthenticatedUser, Snapshot


logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    repository = SnapshotRepository(settings.database_url)
    current_user = create_current_user_dependency(SupabaseTokenVerifier(settings))

    app = FastAPI(
        title="ITPE Flash API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "PUT", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz() -> dict[str, str]:
        try:
            repository.ping()
            return {"status": "ready"}
        except psycopg.Error:
            logger.exception("Database readiness check failed")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database is unavailable",
            ) from None

    @app.get("/v1/data", response_model=Snapshot)
    def get_data(
        user: AuthenticatedUser = Depends(current_user),
    ) -> Snapshot:
        try:
            return repository.load(user)
        except psycopg.Error:
            logger.exception("Failed to load snapshot for user %s", user.id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Data store is unavailable",
            ) from None

    @app.put("/v1/data", response_model=Snapshot)
    def put_data(
        snapshot: Snapshot,
        user: AuthenticatedUser = Depends(current_user),
    ) -> Snapshot:
        try:
            return repository.save(user, snapshot)
        except psycopg.Error:
            logger.exception("Failed to save snapshot for user %s", user.id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Data store is unavailable",
            ) from None

    return app


app = create_app()
