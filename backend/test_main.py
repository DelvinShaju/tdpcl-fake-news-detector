"""Backend tests. Run from the repo root:  python -m pytest backend

These never call Gemini: the analyser is swapped for a fake,
so the tests are free, fast and work without internet.
"""
import io
import os

os.environ.setdefault("GEMINI_API_KEY", "test-key-not-real")  # ai/analyzer.py needs a key to import

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import backend.main as main  # noqa: E402

# What ai/analyzer.py returns (AI format)
AI_RESULT = {
    "verdict": "likely_fake",
    "confidence": "high",
    "red_flags": ["Asks you to pay a fee"],
    "explanation": "This looks like a lottery scam.",
    "recommendation": "Do not pay or share any details.",
    "extracted_text": None,
    "language": "en",
}
# What the website should receive for it (website format)
WEBSITE_RESULT = {
    "verdict": "suspicious",
    "confidence": "high",
    "indicators": ["Asks you to pay a fee"],
    "explanation": "This looks like a lottery scam. Do not pay or share any details.",
    "extracted_text": None,
    "language": "en",
}
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 100
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 100
PDF = b"%PDF-1.4" + b"\x00" * 100


class FakeAnalyzer:
    """Stands in for ai/analyzer.py."""
    def __init__(self):
        self.text_result = AI_RESULT
        self.image_result = dict(AI_RESULT, extracted_text="You won Rs 25 lakh")
        self.calls = 0
        self.last_mime = None

    def analyze(self, text):
        self.calls += 1
        if isinstance(self.text_result, Exception):
            raise self.text_result
        return dict(self.text_result)

    def analyze_image(self, image_bytes, mime_type):
        self.calls += 1
        self.last_mime = mime_type
        return dict(self.image_result)


@pytest.fixture
def fake(monkeypatch):
    f = FakeAnalyzer()
    monkeypatch.setattr(main, "analyzer", f)
    main.limiter.reset()
    return f


@pytest.fixture
def client(fake):
    return TestClient(main.app)


def upload(client, data, name="shot.png", field="image"):
    return client.post("/api/analyze-image", files={field: (name, io.BytesIO(data), "image/png")})


def post_text(client, text):
    return client.post("/api/analyze-text", json={"text": text})


# --- translation to the website format ------------------------------------------

def test_text_ok_in_website_format(client):
    r = post_text(client, "You won a lottery!")
    assert r.status_code == 200
    assert r.json() == WEBSITE_RESULT


@pytest.mark.parametrize("ai_verdict, website_verdict", [
    ("likely_real", "likely_legitimate"),
    ("likely_fake", "suspicious"),
    ("misleading", "suspicious"),
    ("unverifiable", "needs_verification"),
])
def test_verdict_translation(client, fake, ai_verdict, website_verdict):
    fake.text_result = dict(AI_RESULT, verdict=ai_verdict)
    assert post_text(client, "hi").json()["verdict"] == website_verdict


def test_empty_recommendation_not_added(client, fake):
    fake.text_result = dict(AI_RESULT, recommendation="")
    assert post_text(client, "hi").json()["explanation"] == "This looks like a lottery scam."


def test_text_forces_extracted_text_null(client, fake):
    fake.text_result = dict(AI_RESULT, extracted_text="something")
    assert post_text(client, "hi").json()["extracted_text"] is None


# --- text input checks -------------------------------------------------------

@pytest.mark.parametrize("payload", [{}, {"text": ""}, {"text": "   "}, {"text": 123}, ["text"], {"txt": "hi"}])
def test_text_empty_or_missing(client, fake, payload):
    r = client.post("/api/analyze-text", json=payload)
    assert r.status_code == 400
    assert r.json()["code"] == "EMPTY_INPUT"
    assert fake.calls == 0   # bad input never reaches the AI


def test_text_not_json(client):
    r = client.post("/api/analyze-text", content="hello", headers={"Content-Type": "text/plain"})
    assert r.status_code == 400
    assert r.json()["code"] == "EMPTY_INPUT"


def test_text_too_long(client, fake):
    r = post_text(client, "a" * (main.MAX_TEXT_CHARS + 1))
    assert r.status_code == 400
    assert r.json()["code"] == "TEXT_TOO_LONG"
    assert fake.calls == 0


# --- image -------------------------------------------------------------------

@pytest.mark.parametrize("data, mime", [(PNG, "image/png"), (JPEG, "image/jpeg"), (WEBP, "image/webp")])
def test_image_ok(client, fake, data, mime):
    r = upload(client, data)
    assert r.status_code == 200
    assert r.json()["extracted_text"] == "You won Rs 25 lakh"
    assert r.json()["verdict"] == "suspicious"
    assert fake.last_mime == mime


def test_image_field_name_file_also_works(client):
    assert upload(client, PNG, field="file").status_code == 200


def test_image_pdf_renamed_to_png(client, fake):
    r = upload(client, PDF, name="sneaky.png")
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_FILE_TYPE"
    assert fake.calls == 0


@pytest.mark.parametrize("request_kwargs", [{}, {"files": {"other": ("a.png", io.BytesIO(PNG), "image/png")}}])
def test_image_missing(client, request_kwargs):
    r = client.post("/api/analyze-image", **request_kwargs)
    assert r.status_code == 400
    assert r.json()["code"] == "EMPTY_INPUT"


def test_image_empty_file(client):
    assert upload(client, b"").json()["code"] == "EMPTY_INPUT"


def test_image_too_large(client, fake):
    r = upload(client, PNG + b"\x00" * main.MAX_IMAGE_BYTES)
    assert r.status_code == 413
    assert r.json()["code"] == "FILE_TOO_LARGE"
    assert fake.calls == 0


@pytest.mark.parametrize("extracted", [None, "", "   "])
def test_image_without_text(client, fake, extracted):
    fake.image_result = dict(AI_RESULT, extracted_text=extracted)
    r = upload(client, PNG)
    assert r.status_code == 422
    assert r.json()["code"] == "NO_TEXT_FOUND"


def test_image_not_built_yet(client, monkeypatch):
    class TextOnly:
        def analyze(self, text):
            return dict(AI_RESULT)
    monkeypatch.setattr(main, "analyzer", TextOnly())
    r = upload(client, PNG)
    assert r.status_code == 501
    assert r.json()["code"] == "AI_FAILED"


# --- analyser problems ----------------------------------------------------------

@pytest.mark.parametrize("ai_code, website_code, status", [
    ("RATE_LIMIT", "RATE_LIMITED", 429),
    ("AI_FAILURE", "AI_FAILED", 502),
    ("BAD_INPUT", "EMPTY_INPUT", 400),
    ("SOMETHING_ELSE", "AI_FAILED", 502),
])
def test_analyser_errors_translated(client, fake, ai_code, website_code, status):
    fake.text_result = {"error": "something", "code": ai_code}
    r = post_text(client, "hi")
    assert r.status_code == status
    assert r.json() == {"error": "something", "code": website_code}


def test_analyser_crash(client, fake):
    fake.text_result = RuntimeError("network down")
    r = post_text(client, "hi")
    assert r.status_code == 502
    assert r.json()["code"] == "AI_FAILED"


@pytest.mark.parametrize("bad", [
    {"verdict": "probably fake"},
    dict(AI_RESULT, verdict="suspicious"),        # website value instead of AI value
    dict(AI_RESULT, red_flags="not a list"),
    dict(AI_RESULT, explanation=""),
    None,
])
def test_analyser_invalid_result(client, fake, bad):
    fake.text_result = bad
    assert post_text(client, "hi").json()["code"] == "AI_FAILED"


def test_analyser_not_loaded(client, monkeypatch):
    monkeypatch.setattr(main, "analyzer", None)
    r = post_text(client, "hi")
    assert r.status_code == 503
    assert r.json()["code"] == "AI_FAILED"


# --- rate limit, health, website ----------------------------------------------

def test_rate_limit(client):
    assert [post_text(client, "hi").status_code for _ in range(10)] == [200] * 10
    r = post_text(client, "hi")
    assert r.status_code == 429
    assert r.json()["code"] == "RATE_LIMITED"


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_home_page_and_static_files(client):
    assert client.get("/").status_code == 200
    if (main.STATIC_DIR / "script.js").is_file():
        assert client.get("/static/script.js").status_code == 200


def test_every_website_code_matches_the_page():
    """Every error code the backend can send has a message in static/script.js."""
    script = main.STATIC_DIR / "script.js"
    if not script.is_file():
        pytest.skip("no frontend yet")
    source = script.read_text(encoding="utf-8")
    for code in main.STATUS_FOR_CODE:
        assert f"{code}:" in source, f"{code} has no message in script.js"
    for verdict in main.VERDICT_FOR_WEBSITE.values():
        assert f"{verdict}:" in source, f"{verdict} has no label in script.js"
