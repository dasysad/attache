"""
Bill field extraction — VS-4.1 heuristic path with optional Docling upgrade.

What: turn PDF/image/text bytes into structured bill fields for HITL review.
How: structured key-value parse → PDF text via pypdf → optional Docling layout.
Why: dogfood without GPU; swap engine via ATTACHE_USE_DOCLING=1 when available.
"""

from __future__ import annotations

import base64
import io
import os
import re
from datetime import UTC, datetime, timedelta

from attache_extract.models import BillExtractionResponse, ExtractBillRequest

# Optional Docling — heavy; install with `pip install attache-extract[docling]`.
try:
    from docling.document_converter import DocumentConverter  # type: ignore

    _HAS_DOCLING = True
except ImportError:
    _HAS_DOCLING = False


def extract_bill_from_request(req: ExtractBillRequest) -> BillExtractionResponse:
    """Main entry — decode payload and run extraction pipeline."""
    raw_bytes = base64.b64decode(req.content_base64)
    text, engine = _bytes_to_text(raw_bytes, req.filename, req.mime_type)
    parsed = parse_structured_bill(text)
    if parsed:
        payee, amount, due, cadence, autopay, confidence = parsed
        return BillExtractionResponse(
            payee=payee,
            amount_usd=amount,
            due_date=due,
            cadence=cadence,
            autopay=autopay,
            classifier="bill",
            confidence=confidence,
            raw_text=text[:4000],
            engine=engine,
        )
    heuristic = heuristic_extract(text)
    return BillExtractionResponse(
        payee=heuristic["payee"],
        amount_usd=heuristic["amount_usd"],
        due_date=heuristic["due_date"],
        cadence=heuristic["cadence"],
        autopay=heuristic["autopay"],
        classifier="bill",
        confidence=heuristic["confidence"],
        raw_text=text[:4000],
        engine=engine,
    )


def _bytes_to_text(raw: bytes, filename: str, mime_type: str) -> tuple[str, str]:
    """Extract plain text from upload — Docling → pypdf → raw utf8."""
    lower = filename.lower()
    if os.environ.get("ATTACHE_USE_DOCLING") == "1" and _HAS_DOCLING:
        return _docling_text(raw), "docling"
    if lower.endswith(".pdf") or mime_type == "application/pdf":
        return _pypdf_text(raw), "pypdf"
    try:
        return raw.decode("utf-8"), "utf8"
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="replace"), "latin1"


def _pypdf_text(raw: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw))
    parts: list[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)


def _docling_text(raw: bytes) -> str:
    converter = DocumentConverter()
    result = converter.convert(io.BytesIO(raw))
    return result.document.export_to_markdown()


def parse_structured_bill(text: str) -> tuple[str, float, str, str, bool, float] | None:
    """
    Parse dogfood key-value bills (same format as TS parseTextBill).
    Returns (payee, amount_usd, due_date, cadence, autopay, confidence).
    """
    payee: str | None = None
    amount: float | None = None
    due: str | None = None
    cadence = "once"
    autopay = False

    for line in text.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        match = re.match(r"^([^:]+):\s*(.+)$", trimmed)
        if not match:
            continue
        key = match.group(1).strip().lower()
        val = match.group(2).strip()
        if key in ("payee", "vendor"):
            payee = val
        elif key == "amount":
            amount = _parse_amount(val)
        elif key in ("due", "due date"):
            due = _normalize_date(val)
        elif key == "cadence" and val in ("once", "monthly", "yearly"):
            cadence = val
        elif key == "autopay":
            autopay = val.lower() in ("true", "yes", "1")

    if not payee or amount is None or not due:
        return None
    if amount <= 0:
        return None
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", due):
        return None
    return payee, amount, due, cadence, autopay, 0.92


def heuristic_extract(text: str) -> dict:
    """Best-effort regex extraction when structured parse fails."""
    payee = _find_payee(text)
    amount = _find_amount(text)
    due = _find_due_date(text) or _default_due()
    confidence = 0.55
    if payee and amount:
        confidence = 0.72
    if payee and amount and due:
        confidence = 0.8
    return {
        "payee": payee or "Unknown vendor",
        "amount_usd": amount or 0.01,
        "due_date": due,
        "cadence": "once",
        "autopay": False,
        "confidence": confidence,
    }


def _find_payee(text: str) -> str | None:
    for pattern in (
        r"(?im)^(?:payee|vendor|from|biller)\s*:\s*(.+)$",
        r"(?im)^bill from\s+(.+)$",
    ):
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return lines[0][:80] if lines else None


def _find_amount(text: str) -> float | None:
    for pattern in (
        r"(?im)(?:amount|total|balance due)\s*:\s*\$?\s*([\d,]+\.\d{2})",
        r"\$\s*([\d,]+\.\d{2})",
    ):
        match = re.search(pattern, text)
        if match:
            return _parse_amount(match.group(1))
    return None


def _find_due_date(text: str) -> str | None:
    for pattern in (
        r"(?im)(?:due|due date|payment due)\s*:\s*(\d{4}-\d{2}-\d{2})",
        r"(?im)(?:due|due date|payment due)\s*:\s*(\d{1,2}/\d{1,2}/\d{4})",
    ):
        match = re.search(pattern, text)
        if match:
            return _normalize_date(match.group(1))
    return None


def _parse_amount(raw: str) -> float | None:
    cleaned = raw.replace("$", "").replace(",", "").strip()
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return value if value > 0 else None


def _normalize_date(raw: str) -> str | None:
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", raw)
    if not match:
        return None
    month, day, year = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def _default_due() -> str:
    due = datetime.now(UTC) + timedelta(days=14)
    return due.date().isoformat()
