# Fastapi service setup

## Prerequies

[Python 3.14.4](https://www.python.org/downloads/release/python-3144/)

[UV package manager](https://docs.astral.sh/uv/getting-started/installation/)

## Start

```bash
uv run fastapi dev
```

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Docker

Development:

```bash
docker compose -f ../infrastructure-compose/compose.ai-services.dev.yml --env-file ../infrastructure-compose/env/dev/ai-services-stack.env.example up --build --watch
```

Staging:

```bash
docker compose -f ../infrastructure-compose/compose.ai-services.staging.yml --env-file ../infrastructure-compose/env/staging/ai-services-stack.env.example up --build -d
```

Production:

```bash
docker compose -f ../infrastructure-compose/compose.ai-services.prod.yml --env-file ../infrastructure-compose/env/prod/ai-services-stack.env.example up --build -d
```
