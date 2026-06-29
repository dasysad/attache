"""Tests for bill extraction heuristics."""

from attache_extract.extract import heuristic_extract, parse_structured_bill
from attache_extract.models import ExtractBillRequest
from attache_extract.extract import extract_bill_from_request
import base64


def test_parse_structured_bill():
    text = "Payee: City Water\nAmount: $64.20\nDue: 2026-07-18\nCadence: monthly"
    result = parse_structured_bill(text)
    assert result is not None
    payee, amount, due, cadence, autopay, confidence = result
    assert payee == "City Water"
    assert amount == 64.20
    assert due == "2026-07-18"
    assert cadence == "monthly"
    assert confidence >= 0.85


def test_extract_bill_request_txt():
    body = b"Payee: PG&E\nAmount: 142.50\nDue: 2026-08-01"
    req = ExtractBillRequest(
        filename="bill.txt",
        mime_type="text/plain",
        content_base64=base64.b64encode(body).decode(),
    )
    out = extract_bill_from_request(req)
    assert out.payee == "PG&E"
    assert out.amount_usd == 142.50
    assert out.confidence >= 0.85


def test_heuristic_fallback():
    text = "Your total balance due is $88.15 by 07/15/2026\nPacific Gas & Electric"
    h = heuristic_extract(text)
    assert h["amount_usd"] == 88.15
    assert h["confidence"] >= 0.7
