# API Contract (v2)

There are two formats. The backend (`backend/main.py`) converts between them, so the website and the AI
each keep their own names and only the backend needs to know both.

```
website (static/)  ⇄  backend (backend/main.py)  ⇄  AI (ai/analyzer.py)
   "website format"                                     "AI format"
```

---

## 1. Website ⇄ backend (what static/script.js sends and receives)

### POST /api/analyze-text
Request: `{ "text": "string" }` (max 5,000 characters)

### POST /api/analyze-image
Request: multipart/form-data, field `"image"` (JPG, PNG or WEBP, max 5 MB). Field `"file"` is also accepted.

### Success response (both endpoints)
```
{
  "verdict": "likely_legitimate | needs_verification | suspicious",
  "confidence": "high | medium | low",
  "indicators": ["string", "..."],
  "explanation": "2-3 simple sentences, followed by what the user should do",
  "extracted_text": "string or null (image only)",
  "language": "en | hi | kn | ..."
}
```
An optional `"category": "misinformation | scam | spam | none"` may be added later; the page hides the badge when it's missing.

### Error response
```
{ "error": "short message", "code": "..." }
```

| Code | When | HTTP |
|---|---|---|
| `EMPTY_INPUT` | No text / no image sent | 400 |
| `TEXT_TOO_LONG` | Text over 5,000 characters | 400 |
| `BAD_FILE_TYPE` | File isn't really a JPG, PNG or WEBP (checked from its contents) | 400 |
| `FILE_TOO_LARGE` | Image over 5 MB | 413 |
| `NO_TEXT_FOUND` | Screenshot has no readable text | 422 |
| `RATE_LIMITED` | Too many checks (10/minute, 100/day per visitor), or Gemini's own limit | 429 |
| `AI_FAILED` | AI failed, gave an invalid answer, or isn't available | 502 / 501 / 503 |

---

## 2. Backend ⇄ AI (what ai/analyzer.py provides)

```
analyze(text: str) -> dict
analyze_image(image_bytes: bytes, mime_type: str) -> dict    # mime_type: image/png, image/jpeg or image/webp
```

### Result
```
{
  "verdict": "likely_real | likely_fake | misleading | unverifiable",
  "confidence": "high | medium | low",
  "red_flags": ["string", "..."],
  "explanation": "2-3 simple sentences",
  "recommendation": "what the user should do next",
  "extracted_text": "string or null (image only)",
  "language": "en | hi | kn | ..."
}
```

### Errors
Return `{ "error": "short message", "code": "BAD_INPUT | FILE_TOO_LARGE | RATE_LIMIT | AI_FAILURE" }`, or raise an exception (treated as `AI_FAILURE`).

---

## 3. How the backend converts AI format → website format

| AI | Website |
|---|---|
| `likely_real` | `likely_legitimate` |
| `likely_fake` | `suspicious` |
| `misleading` | `suspicious` |
| `unverifiable` | `needs_verification` |
| `red_flags` | `indicators` |
| `explanation` + `recommendation` | `explanation` (recommendation added at the end) |
| `RATE_LIMIT` | `RATE_LIMITED` |
| `AI_FAILURE` | `AI_FAILED` |
| `BAD_INPUT` | `EMPTY_INPUT` |

`confidence`, `extracted_text` and `language` pass through unchanged.

## Rules
- Confidence is high/medium/low, NOT a percentage. A percentage from an LLM is made up.
- "unverifiable" / "needs_verification" is a valid, normal verdict.
- This file changes only via Pull Request approved by all of: frontend, backend, AI.
