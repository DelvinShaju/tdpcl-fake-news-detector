"""TruthLens backend (FastAPI).

Run from the repo root:
    uvicorn backend.main:app --reload
then open http://127.0.0.1:8000

What this file does:
- serves the website (static/index.html, plus everything in static/)
- POST /api/analyze-text and POST /api/analyze-image, following docs/api_contract.md
- checks input before it reaches the AI, so bad input never costs a Gemini call
- limits each visitor to a few checks per minute (no logins, so this protects our quota)
- turns every failure into the contract's error shape, with a proper HTTP status
- checks the AI's answer matches the contract before sending it to the page
"""
import logging
from pathlib import Path

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

log = logging.getLogger("truthlens")

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"

# ---------------------------------------------------------------------------
# The analyser (ai/analyzer.py). If it can't load (most often: GEMINI_API_KEY
# missing from .env), the server still starts, so the website loads, and the
# API answers AI_FAILURE with the reason in the server log.
# ---------------------------------------------------------------------------
try:
    import ai.analyzer as analyzer
    ANALYZER_STATUS = "mock" if getattr(analyzer, "USE_MOCK", False) else "gemini"
except Exception as e:  # noqa: BLE001 - any import failure should be reported, not crash the server
    analyzer = None
    ANALYZER_STATUS = f"not loaded: {type(e).__name__}: {e}"
    log.error("Could not load ai/analyzer.py: %s", ANALYZER_STATUS)

# ---------------------------------------------------------------------------
# Limits and allowed values (from docs/api_contract.md)
# ---------------------------------------------------------------------------
MAX_TEXT_CHARS = 5000
MAX_IMAGE_BYTES = 5 * 1024 * 1024
RATE_LIMIT = "10/minute;100/day"   # per visitor (IP address)

VERDICTS = {"likely_real", "likely_fake", "misleading", "unverifiable"}
CONFIDENCES = {"high", "medium", "low"}

# Which HTTP status goes with each contract error code
STATUS_FOR_CODE = {"BAD_INPUT": 400, "FILE_TOO_LARGE": 413, "RATE_LIMIT": 429, "AI_FAILURE": 502}

# The first bytes of a file reveal its real type, whatever its name says.
IMAGE_SIGNATURES = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="TruthLens API")
app.state.limiter = limiter

# Lets the frontend call the API while running on a different port (e.g. VS Code Live Server).
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])

if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def error(code: str, message: str, status: int | None = None) -> JSONResponse:
    """Every error has the same shape: {"error": ..., "code": ...}."""
    return JSONResponse({"error": message, "code": code}, status_code=status or STATUS_FOR_CODE[code])


def is_valid_result(r) -> bool:
    """True if the analyser's answer matches the success format in the contract."""
    return (
        isinstance(r, dict)
        and r.get("verdict") in VERDICTS
        and r.get("confidence") in CONFIDENCES
        and isinstance(r.get("red_flags"), list)
        and all(isinstance(flag, str) for flag in r["red_flags"])
        and isinstance(r.get("explanation"), str) and r["explanation"].strip() != ""
        and isinstance(r.get("recommendation"), str)
        and (r.get("extracted_text") is None or isinstance(r.get("extracted_text"), str))
        and isinstance(r.get("language"), str) and r["language"] != ""
    )


def run_analyser(function_name: str, *args) -> JSONResponse | dict:
    """Calls ai/analyzer.py and turns every kind of failure into the contract's error shape."""
    function = getattr(analyzer, function_name, None)
    if function is None:
        if analyzer is None:
            log.error("Analyser unavailable: %s", ANALYZER_STATUS)
            return error("AI_FAILURE", "The checker isn't available right now. Please try again later.", 503)
        return error("AI_FAILURE", "Screenshot checking isn't available yet. Please paste the text instead.", 501)

    try:
        result = function(*args)
    except Exception:  # noqa: BLE001
        log.exception("Analyser raised an error")
        return error("AI_FAILURE", "Something went wrong while checking. Please try again.")

    # The analyser reports some problems itself, as {"error": ..., "code": ...}
    if isinstance(result, dict) and "error" in result:
        code = result.get("code") if result.get("code") in STATUS_FOR_CODE else "AI_FAILURE"
        return error(code, str(result["error"]))

    if not is_valid_result(result):
        log.error("Analyser returned a result that doesn't match the contract: %r", result)
        return error("AI_FAILURE", "Something went wrong while checking. Please try again.")
    return dict(result)


# ---------------------------------------------------------------------------
# Error handlers: make FastAPI's built-in errors use our contract shape
# ---------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def bad_request(request: Request, exc: RequestValidationError):
    # Missing "text", wrong type, not JSON, missing "file", ... all count as BAD_INPUT.
    return error("BAD_INPUT", "The request was missing something or wasn't in the right format.")


@app.exception_handler(RateLimitExceeded)
async def rate_limited(request: Request, exc: RateLimitExceeded):
    return error("RATE_LIMIT", "Too many checks too quickly. Please wait a minute and try again.")


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------
class TextRequest(BaseModel):
    text: str


@app.post("/api/analyze-text")
@limiter.limit(RATE_LIMIT)
def analyze_text(request: Request, body: TextRequest):
    text = body.text.strip()
    if not text:
        return error("BAD_INPUT", "Please paste a message first.")
    if len(text) > MAX_TEXT_CHARS:
        return error("BAD_INPUT", f"Please paste up to {MAX_TEXT_CHARS:,} characters.")

    result = run_analyser("analyze", text)
    if isinstance(result, JSONResponse):
        return result
    result["extracted_text"] = None   # contract: extracted_text is for images only
    return result


@app.post("/api/analyze-image")
@limiter.limit(RATE_LIMIT)
def analyze_image(request: Request, file: UploadFile = File(...)):
    image_bytes = file.file.read(MAX_IMAGE_BYTES + 1)   # read one byte past the limit to detect "too big"
    if len(image_bytes) > MAX_IMAGE_BYTES:
        return error("FILE_TOO_LARGE", "That image is too large. Please use one under 5 MB.")
    if not image_bytes:
        return error("BAD_INPUT", "Please choose a screenshot first.")

    mime_type = next((m for sig, m in IMAGE_SIGNATURES.items() if image_bytes.startswith(sig)), None)
    if mime_type is None:
        return error("BAD_INPUT", "Please upload a JPG or PNG image.")

    return run_analyser("analyze_image", image_bytes, mime_type)


@app.get("/api/health")
def health():
    """Quick check that the server is up, and whether the analyser loaded."""
    return {"status": "ok", "analyzer": ANALYZER_STATUS}


# ---------------------------------------------------------------------------
# Website
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def home():
    index = STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    return HTMLResponse("<h1>TruthLens backend is running</h1><p>No static/index.html yet.</p>")
