from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Loaded from env vars (audit C8/C9).

    AI_SERVICES_API_KEY: shared secret expected on every protected endpoint
        (Authorization: Bearer <key>). Required in production. When empty,
        the API rejects all requests except /health, so a misconfiguration
        fails closed instead of silently exposing endpoints.

    AI_SERVICES_ALLOWED_ORIGINS: comma-separated list of origins authorized
        by CORS. Defaults to the empty list (no browser is allowed to call
        the API), forcing operators to whitelist explicitly.
    """

    api_key: str = ""
    allowed_origins: str = ""

    model_config = SettingsConfigDict(env_prefix="AI_SERVICES_", env_file=None)

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()
bearer_scheme = HTTPBearer(auto_error=False)


def require_api_key(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)],
) -> None:
    """FastAPI dependency enforcing the shared Bearer secret."""
    if not settings.api_key:
        # Fail closed: refusing every request is safer than serving everyone.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ai-services authentication is not configured",
        )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if credentials.credentials != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )


app = FastAPI(title="ai services", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/", dependencies=[Depends(require_api_key)])
def root() -> dict[str, str]:
    return {"api": app.title}


@app.get("/health")
def health() -> dict[str, str]:
    """Public — used by Docker / Caddy healthchecks."""
    return {"status": "ok"}


@app.get("/version", dependencies=[Depends(require_api_key)])
def version() -> dict[str, str]:
    return {"version": app.version}
