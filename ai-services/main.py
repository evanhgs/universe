from fastapi import FastAPI

app = FastAPI(title="ai services", version="0.1.0")

@app.get("/")
def root() -> dict[str, str]:
    return {"api" : app.title}

@app.get("/health")
def health() -> dict[str, str]:
    return {"status" : "ok"}

@app.get("/version")
def version() -> dict[str, str]:
    return {"version" : app.version}