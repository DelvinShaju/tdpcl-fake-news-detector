# API Contract (v1)

## POST /api/analyze-text
Request: { "text": "string" }

## POST /api/analyze-image
Request: multipart/form-data, field "file" (jpg/png, max 5 MB)

## Success response (both endpoints)
{
  "verdict": "likely_real | likely_fake | misleading | unverifiable",
  "confidence": "high | medium | low",
  "red_flags": ["string", "..."],
  "explanation": "2-3 simple sentences",
  "recommendation": "what the user should do next",
  "extracted_text": "string or null (image only)",
  "language": "en | hi | kn | ..."
}

## Error response
{ "error": "short message", "code": "RATE_LIMIT | BAD_INPUT | FILE_TOO_LARGE | AI_FAILURE" }

## Rules
- Confidence is high/medium/low, NOT a percentage. A percentage from an LLM is made up.
- "unverifiable" is a valid, normal verdict.
- This file changes only via Pull Request approved by all of: frontend, backend, AI.
