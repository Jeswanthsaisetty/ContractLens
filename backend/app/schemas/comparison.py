from pydantic import BaseModel


class ComparisonChange(BaseModel):
    change_type: str
    category: str
    old_text: str
    new_text: str
    summary: str
    impact: str | None = None
    source_version: int
    target_version: int


class ContractComparisonResponse(BaseModel):
    contract_id: str
    old_version: int
    new_version: int
    total_changes: int
    changes: list[ComparisonChange]