"""TruthLens backend (FastAPI).

Run from the repo root:
    uvicorn backend.main:app --reload
then open http://127.0.0.1:8000

What this file does:
- serves the website (static/index.html, plus everything in static/)
- POST /api/analyze-text and POST /api/analyze-image (see docs/api_contract.md)
- checks input before it reaches the AI, so bad input never costs a Gemini call
- limits each visitor to a few checks per minute (no logins, so this protects our quota)
- checks the AI's answer is complete and valid
- TRANSLATES between the two formats in docs/api_contract.md:
    ai/analyzer.py answers in the "AI format"  (likely_real / red_flags / ...)
    the website reads the "website format"     (likely_legitimate / indicators / ...)
  so each side can keep its own names and only this file needs to know both.
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
# API answers AI_FAILED with the reason in the server log.
# ---------------------------------------------------------------------------
try:
    import ai.analyzer as analyzer
    ANALYZER_STATUS = "mock" if getattr(analyzer, "USE_MOCK", False) else "gemini"
except Exception as e:  # noqa: BLE001 - any import failure should be reported, not crash the server
    analyzer = None
    ANALYZER_STATUS = f"not loaded: {type(e).__name__}: {e}"
    log.error("Could not load ai/analyzer.py: %s", ANALYZER_STATUS)

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------
MAX_TEXT_CHARS = 5000
MAX_IMAGE_BYTES = 5 * 1024 * 1024
RATE_LIMIT = "10/minute;100/day"   # per visitor (IP address)

# ---------------------------------------------------------------------------
# AI format -> website format
# ---------------------------------------------------------------------------
AI_VERDICTS = {"likely_real", "likely_fake", "misleading", "unverifiable"}
CONFIDENCES = {"high", "medium", "low"}

VERDICT_FOR_WEBSITE = {
    "likely_real": "likely_legitimate",
    "likely_fake": "suspicious",
    "misleading": "suspicious",          # partly true but distorted: still a warning
    "unverifiable": "needs_verification",
}

# Website error codes and their HTTP status
STATUS_FOR_CODE = {
    "EMPTY_INPUT": 400,
    "TEXT_TOO_LONG": 400,
    "BAD_FILE_TYPE": 400,
    "FILE_TOO_LARGE": 413,
    "NO_TEXT_FOUND": 422,
    "RATE_LIMITED": 429,
    "AI_FAILED": 502,
}

# Error codes the analyser may return, translated to website codes
ERROR_FOR_WEBSITE = {
    "BAD_INPUT": "EMPTY_INPUT",
    "FILE_TOO_LARGE": "FILE_TOO_LARGE",
    "RATE_LIMIT": "RATE_LIMITED",
    "AI_FAILURE": "AI_FAILED",
}

# The first bytes of a file reveal its real type, whatever its name says.
def detect_image_type(data: bytes):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def is_valid_ai_result(r) -> bool:
    """True if the analyser's answer is complete and uses the allowed values (AI format)."""
    return (
        isinstance(r, dict)
        and r.get("verdict") in AI_VERDICTS
        and r.get("confidence") in CONFIDENCES
        and isinstance(r.get("red_flags"), list)
        and all(isinstance(flag, str) for flag in r["red_flags"])
        and isinstance(r.get("explanation"), str) and r["explanation"].strip() != ""
        and isinstance(r.get("recommendation"), str)
        and (r.get("extracted_text") is None or isinstance(r.get("extracted_text"), str))
        and isinstance(r.get("language"), str) and r["language"] != ""
    )


def to_website_format(r: dict) -> dict:
    """Converts an analyser result (AI format) into what the website reads."""
    explanation = r["explanation"].strip()
    recommendation = r["recommendation"].strip()
    if recommendation:
        # The page has no separate recommendation box, so it goes after the explanation.
        explanation = f"{explanation} {recommendation}"
    return {
        "verdict": VERDICT_FOR_WEBSITE[r["verdict"]],
        "confidence": r["confidence"],
        "indicators": [flag for flag in r["red_flags"] if flag.strip()],
        "explanation": explanation,
        "extracted_text": r.get("extracted_text"),
        "language": r["language"],
    }


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


def run_analyser(function_name: str, *args) -> JSONResponse | dict:
    """Calls ai/analyzer.py and returns either a website-format result or an error response."""
    function = getattr(analyzer, function_name, None)
    if function is None:
        if analyzer is None:
            log.error("Analyser unavailable: %s", ANALYZER_STATUS)
            return error("AI_FAILED", "The checker isn't available right now. Please try again later.", 503)
        return error("AI_FAILED", "Screenshot checking isn't available yet. Please paste the text instead.", 501)

    try:
        result = function(*args)
    except Exception:  # noqa: BLE001
        log.exception("Analyser raised an error")
        return error("AI_FAILED", "Something went wrong while checking. Please try again.")

    # The analyser reports some problems itself, as {"error": ..., "code": ...}
    if isinstance(result, dict) and "error" in result:
        code = ERROR_FOR_WEBSITE.get(result.get("code"), "AI_FAILED")
        return error(code, str(result["error"]))

    if not is_valid_ai_result(result):
        log.error("Analyser returned an incomplete or invalid result: %r", result)
        return error("AI_FAILED", "Something went wrong while checking. Please try again.")
    return to_website_format(result)


# ---------------------------------------------------------------------------
# Error handlers: make FastAPI's built-in errors use our error shape
# ---------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def bad_request(request: Request, exc: RequestValidationError):
    # Missing "text", wrong type, not JSON, ... : nothing usable was sent.
    return error("EMPTY_INPUT", "Please paste a message or choose a screenshot first.")


@app.exception_handler(RateLimitExceeded)
async def rate_limited(request: Request, exc: RateLimitExceeded):
    return error("RATE_LIMITED", "Too many checks too quickly. Please wait a minute and try again.")


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
        return error("EMPTY_INPUT", "Please paste a message first.")
    if len(text) > MAX_TEXT_CHARS:
        return error("TEXT_TOO_LONG", f"Please paste up to {MAX_TEXT_CHARS:,} characters.")

    result = run_analyser("analyze", text)
    if isinstance(result, JSONResponse):
        return result
    result["extracted_text"] = None   # extracted_text is only for screenshots
    return result


@app.post("/api/analyze-image")
@limiter.limit(RATE_LIMIT)
def analyze_image(request: Request, image: UploadFile | None = File(None), file: UploadFile | None = File(None)):
    upload = image or file   # the website sends "image"; "file" also accepted
    if upload is None:
        return error("EMPTY_INPUT", "Please choose a screenshot first.")

    image_bytes = upload.file.read(MAX_IMAGE_BYTES + 1)   # one byte past the limit detects "too big"
    if len(image_bytes) > MAX_IMAGE_BYTES:
        return error("FILE_TOO_LARGE", "That image is too large. Please use one under 5 MB.")
    if not image_bytes:
        return error("EMPTY_INPUT", "Please choose a screenshot first.")

    mime_type = detect_image_type(image_bytes)
    if mime_type is None:
        return error("BAD_FILE_TYPE", "Please upload a JPG, PNG or WEBP image.")

    result = run_analyser("analyze_image", image_bytes, mime_type)
    if isinstance(result, JSONResponse):
        return result
    if not (result.get("extracted_text") or "").strip():
        return error("NO_TEXT_FOUND", "We couldn't find any text in that image.")
    return result


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
