from pydantic import BaseModel
from typing import Optional

class Obligation(BaseModel):
    title: str
    due_date: Optional[str] = None
    responsible_party: Optional[str] = None
    status: str = "pending"
