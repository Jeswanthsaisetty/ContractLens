from pydantic import BaseModel
from typing import Optional

class ContractResponse(BaseModel):
    contract_id: str
    filename: str
    status: str
    effective_date: Optional[str] = None
    expiration_date: Optional[str] = None
