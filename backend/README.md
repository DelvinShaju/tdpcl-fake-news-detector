# Backend

FastAPI server for TruthLens. Follows `docs/api_contract.md` (v2).

## Run it

From the repo root:

```
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open http://127.0.0.1:8000. `GET /api/health` shows whether the analyser loaded and whether it's in mock mode.
Interactive API docs: http://127.0.0.1:8000/docs

Needs `GEMINI_API_KEY` in `.env`. To try the website without using Gemini, also set `USE_MOCK=true` in `.env`
(`ai/analyzer.py` still needs some key to start, even in mock mode; any placeholder works for mock).
The page has its own `USE_MOCK` at the top of `static/script.js`: set it to `false` to make the page call this server.

## What it does

- Serves the website: `/` → `static/index.html`, `/static/...` for CSS and JS.
- `POST /api/analyze-text` → calls `analyze(text)` in `ai/analyzer.py`.
- `POST /api/analyze-image` → calls `analyze_image(image_bytes, mime_type)`. Until that function exists,
  it answers `AI_FAILED` (HTTP 501).
- **Translates** the AI's answer into the website's format (see section 3 of the contract), so neither side
  has to rename anything. All the translation lives in `to_website_format()` and the tables above it.
- Checks the AI's answer is complete and uses allowed values before converting it; anything else becomes `AI_FAILED`.

## Input checks (before the AI is called)

| Situation | Response |
|---|---|
| Missing or empty text, not JSON | `EMPTY_INPUT` (400) |
| Text over 5,000 characters | `TEXT_TOO_LONG` (400) |
| No image, or empty file | `EMPTY_INPUT` (400) |
| Not really a JPG/PNG/WEBP (checked from the file's contents, not its name) | `BAD_FILE_TYPE` (400) |
| Image over 5 MB | `FILE_TOO_LARGE` (413) |
| More than 10 checks a minute or 100 a day from one visitor | `RATE_LIMITED` (429) |

After the AI: a screenshot with no readable text gives `NO_TEXT_FOUND` (422); AI errors, crashes or invalid
answers give `AI_FAILED`.

## Tests

```
python -m pytest backend
```

The tests replace the analyser with a fake, so they never call Gemini and work offline. One test also
checks that every error code and verdict the backend can send has a matching label in `static/script.js`.

## Online (Render)

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
- Environment: set `GEMINI_API_KEY`

`--proxy-headers` matters: without it, every visitor looks like Render's proxy to the rate limiter,
and everyone gets blocked together.
