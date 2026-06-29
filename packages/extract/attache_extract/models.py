"""Pydantic models for the extract sidecar API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ExtractBillRequest(BaseModel):
    """Binary document payload from @attache/core RemoteDocumentAdapter."""

    filename: str
    mime_type: str
    content_base64: str


class BillExtractionResponse(BaseModel):
    """Mirrors TypeScript BillExtraction — camelCase in JSON responses."""

    model_config = ConfigDict(populate_by_name=True)

    payee: str
    amount_usd: float = Field(serialization_alias="amountUsd")
    due_date: str = Field(serialization_alias="dueDate")
    cadence: Literal["once", "monthly", "yearly"] = "once"
    autopay: bool = False
    classifier: Literal["bill", "statement", "notice", "other"] = "bill"
    confidence: float
    raw_text: str | None = Field(default=None, serialization_alias="rawText")
    engine: str

    def to_json_dict(self) -> dict:
        return self.model_dump(by_alias=True)
