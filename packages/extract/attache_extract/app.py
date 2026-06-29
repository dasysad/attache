"""Litestar HTTP app — POST /extract/bill for @attache/core RemoteDocumentAdapter."""

from __future__ import annotations

from litestar import Litestar, get, post
from litestar.status_codes import HTTP_200_OK

from attache_extract.extract import extract_bill_from_request
from attache_extract.models import ExtractBillRequest


@get("/health", status_code=HTTP_200_OK)
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "attache-extract"}


@post("/extract/bill")
async def extract_bill(data: ExtractBillRequest) -> dict:
    result = extract_bill_from_request(data)
    return result.to_json_dict()


app = Litestar(route_handlers=[health, extract_bill])


def run() -> None:
    import uvicorn

    port = int(__import__("os").environ.get("PORT", "8790"))
    uvicorn.run("attache_extract.app:app", host="127.0.0.1", port=port, reload=False)


if __name__ == "__main__":
    run()
