# Backend

FastAPI server for TruthLens. Follows `docs/api_contract.md`.

## Run it

From the repo root:

```
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open http://127.0.0.1:8000. `GET /api/health` shows whether the analyser loaded and whether it's in mock mode.

Needs `GEMINI_API_KEY` in `.env`. To build the frontend without using Gemini, also set `USE_MOCK=true` in `.env`.
(`ai/analyzer.py` still needs some key to start, even in mock mode; any placeholder works for mock.)

Interactive API docs: http://127.0.0.1:8000/docs

## How it uses the analyser

| Endpoint | Calls in `ai/analyzer.py` |
|---|---|
| `POST /api/analyze-text` | `analyze(text)` |
| `POST /api/analyze-image` | `analyze_image(image_bytes, mime_type)`, with `mime_type` either `"image/png"` or `"image/jpeg"` |

Until `analyze_image` exists, the image endpoint answers `AI_FAILURE` (HTTP 501) with "Screenshot checking isn't available yet".

## What the server checks

| Situation | Response |
|---|---|
| Missing/empty text, over 5,000 characters, or not JSON | `BAD_INPUT` (400) |
| No file, wrong field name (must be `file`), empty, or not a real JPG/PNG | `BAD_INPUT` (400) |
| Image over 5 MB | `FILE_TOO_LARGE` (413) |
| More than 10 checks a minute or 100 a day from one visitor | `RATE_LIMIT` (429) |
| Gemini's own rate limit (reported by the analyser) | `RATE_LIMIT` (429) |
| Analyser crashes, returns `AI_FAILURE`, or returns something not matching the contract | `AI_FAILURE` (502) |
| Analyser couldn't load (e.g. no API key) | `AI_FAILURE` (503) |

Bad input is rejected before it reaches the analyser, so it never costs a Gemini call.
The image type is checked from the file's contents, not its name.

## Tests

```
python -m pytest backend
```

The tests replace the analyser with a fake, so they never call Gemini and work offline.

## Online (Render)

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
- Environment: set `GEMINI_API_KEY`

`--proxy-headers` matters: without it, every visitor looks like Render's proxy to the rate limiter,
and everyone gets blocked together.
