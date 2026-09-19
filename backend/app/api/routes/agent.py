from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.agents.contract_agent import ContractAgent


router = APIRouter(
    prefix="/agent",
    tags=["Agent"]
)

contract_agent = ContractAgent()


class QuestionRequest(BaseModel):
    question: str


@router.post("/{contract_id}/ask")
def ask_contract(
    contract_id: str,
    request: QuestionRequest,
    db: Session = Depends(get_db)
):

    if not request.question.strip():
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty."
        )

    try:

        result = contract_agent.run(
            contract_id=contract_id,
            question=request.question,
            db=db
        )

        return result

    except ValueError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Agent execution failed: {str(e)}"
        )