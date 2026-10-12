"""Backend tests. Run from the repo root:  python -m pytest backend

These never call Gemini: the analyser functions are swapped for fakes,
so the tests are free, fast and work without internet.
"""
import io
import os

os.environ.setdefault("GEMINI_API_KEY", "test-key-not-real")  # ai/analyzer.py needs a key to import

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import backend.main as main  # noqa: E402

GOOD_RESULT = {
    "verdict": "likely_fake",
    "confidence": "high",
    "red_flags": ["Asks you to pay a fee"],
    "explanation": "This looks like a lottery scam.",
    "recommendation": "Do not pay or share any details.",
    "extracted_text": None,
    "language": "en",
}
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 100
PDF = b"%PDF-1.4" + b"\x00" * 100


class FakeAnalyzer:
    """Stands in for ai/analyzer.py."""
    def __init__(self, text_result=GOOD_RESULT, image_result=None):
        self.text_result = text_result
        self.image_result = image_result or dict(GOOD_RESULT, extracted_text="You won Rs 25 lakh")
        self.calls = 0

    def analyze(self, text):
        self.calls += 1
        if isinstance(self.text_result, Exception):
            raise self.text_result
        return dict(self.text_result)

    def analyze_image(self, image_bytes, mime_type):
        self.calls += 1
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


def upload(client, data, name="shot.png", field="file"):
    return client.post("/api/analyze-image", files={field: (name, io.BytesIO(data), "image/png")})


# --- text ---------------------------------------------------------------

def test_text_ok(client):
    r = client.post("/api/analyze-text", json={"text": "You won a lottery!"})
    assert r.status_code == 200
    assert r.json() == GOOD_RESULT


def test_text_forces_extracted_text_null(client, fake):
    fake.text_result = dict(GOOD_RESULT, extracted_text="something")
    assert client.post("/api/analyze-text", json={"text": "hi"}).json()["extracted_text"] is None


@pytest.mark.parametrize("payload", [{}, {"text": ""}, {"text": "   "}, {"text": 123}, ["text"], {"txt": "hi"}])
def test_text_bad_input(client, fake, payload):
    r = client.post("/api/analyze-text", json=payload)
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_INPUT"
    assert fake.calls == 0   # bad input never reaches the AI


def test_text_not_json(client):
    r = client.post("/api/analyze-text", content="hello", headers={"Content-Type": "text/plain"})
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_INPUT"


def test_text_too_long(client, fake):
    r = client.post("/api/analyze-text", json={"text": "a" * (main.MAX_TEXT_CHARS + 1)})
    assert r.json()["code"] == "BAD_INPUT"
    assert fake.calls == 0


# --- image --------------------------------------------------------------

@pytest.mark.parametrize("data", [PNG, JPEG])
def test_image_ok(client, data):
    r = upload(client, data)
    assert r.status_code == 200
    assert r.json()["extracted_text"] == "You won Rs 25 lakh"


def test_image_pdf_renamed_to_png(client, fake):
    r = upload(client, PDF, name="sneaky.png")
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_INPUT"
    assert fake.calls == 0


def test_image_missing(client):
    r = client.post("/api/analyze-image")
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_INPUT"


def test_image_wrong_field_name(client):
    r = upload(client, PNG, field="image")
    assert r.json()["code"] == "BAD_INPUT"


def test_image_empty_file(client):
    assert upload(client, b"").json()["code"] == "BAD_INPUT"


def test_image_too_large(client, fake):
    r = upload(client, PNG + b"\x00" * main.MAX_IMAGE_BYTES)
    assert r.status_code == 413
    assert r.json()["code"] == "FILE_TOO_LARGE"
    assert fake.calls == 0


def test_image_not_built_yet(client, monkeypatch):
    class TextOnly:
        def analyze(self, text):
            return dict(GOOD_RESULT)
    monkeypatch.setattr(main, "analyzer", TextOnly())
    r = upload(client, PNG)
    assert r.status_code == 501
    assert r.json()["code"] == "AI_FAILURE"


# --- analyser problems ------------------------------------------------------

@pytest.mark.parametrize("code, status", [("RATE_LIMIT", 429), ("AI_FAILURE", 502), ("BAD_INPUT", 400)])
def test_analyser_error_gets_right_status(client, fake, code, status):
    fake.text_result = {"error": "something", "code": code}
    r = client.post("/api/analyze-text", json={"text": "hi"})
    assert r.status_code == status
    assert r.json() == {"error": "something", "code": code}


def test_analyser_unknown_error_code_becomes_ai_failure(client, fake):
    fake.text_result = {"error": "weird", "code": "SOMETHING_ELSE"}
    assert client.post("/api/analyze-text", json={"text": "hi"}).json()["code"] == "AI_FAILURE"


def test_analyser_crash(client, fake):
    fake.text_result = RuntimeError("network down")
    r = client.post("/api/analyze-text", json={"text": "hi"})
    assert r.status_code == 502
    assert r.json()["code"] == "AI_FAILURE"


def test_analyser_wrong_format(client, fake):
    fake.text_result = {"verdict": "probably fake"}
    assert client.post("/api/analyze-text", json={"text": "hi"}).json()["code"] == "AI_FAILURE"


def test_analyser_not_loaded(client, monkeypatch):
    monkeypatch.setattr(main, "analyzer", None)
    r = client.post("/api/analyze-text", json={"text": "hi"})
    assert r.status_code == 503
    assert r.json()["code"] == "AI_FAILURE"


# --- rate limit, health, website ---------------------------------------------

def test_rate_limit(client):
    codes = [client.post("/api/analyze-text", json={"text": "hi"}).status_code for _ in range(10)]
    assert codes == [200] * 10
    r = client.post("/api/analyze-text", json={"text": "hi"})
    assert r.status_code == 429
    assert r.json()["code"] == "RATE_LIMIT"


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_home_page_and_static_files(client):
    assert client.get("/").status_code == 200
    if (main.STATIC_DIR / "script.js").is_file():
        assert client.get("/static/script.js").status_code == 200
