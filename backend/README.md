# ContractLens Backend

Agentic AI contract intelligence backend.

## Current stage

Phase 0/1 scaffold:
- FastAPI application
- Health endpoint
- PDF upload endpoint
- Contract, agent, obligation, comparison, and reminder API placeholders
- Service/tool architecture ready for incremental implementation

## Run

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open:
- http://127.0.0.1:8000
- http://127.0.0.1:8000/docs

## Planned phases

1. PDF extraction
2. Gemini contract analysis
3. Database persistence
4. RAG and evidence
5. Agent tool calling
6. Obligation tracking
7. Contract comparison
8. Reminder/action execution
9. End-to-end testing
