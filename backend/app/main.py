from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import Base, engine
from app.models.contract import Contract
from app.models.obligation import Obligation
from app.models.reminder import Reminder
from app.models.contract_version import ContractVersion

from app.api.routes import (
    health,
    contracts,
    agent,
    obligations,
    compare,
    reminders,
)

app = FastAPI(
    title="ContractLens API",
    description="Agentic AI Contract Intelligence Platform",
    version="0.1.0",
)

# Allow the React/Vite frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://contract-lens-kjbl3rlm4-jeswanthsaisettys-projects.vercel.app/",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create database tables
Base.metadata.create_all(bind=engine)

# API routes
app.include_router(health.router, prefix="/api")
app.include_router(contracts.router, prefix="/api")
app.include_router(agent.router, prefix="/api")
app.include_router(obligations.router, prefix="/api")
app.include_router(compare.router, prefix="/api")
app.include_router(reminders.router, prefix="/api")


@app.get("/")
def root():
    return {
        "app": "ContractLens",
        "status": "running",
        "version": "0.1.0",
    }