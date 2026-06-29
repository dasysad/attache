# Attache extract sidecar

Litestar service for bill field extraction. Default engine: structured parse + pypdf heuristics.

Optional Docling: `pip install attache-extract[docling]` and `ATTACHE_USE_DOCLING=1`.

```bash
cd packages/extract
python -m venv .venv && source .venv/bin/activate
pip install -e .
attache-extract   # listens on :8790
```

Point core at it: `ATTACHE_EXTRACT_URL=http://127.0.0.1:8790`
