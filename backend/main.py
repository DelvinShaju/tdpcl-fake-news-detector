from fastapi import FastAPI
from pydantic import BaseModel
from ai.analyzer import analyze

app = FastAPI()

class TextRequest(BaseModel):
    text: str

@app.post("/api/analyze-text")
def analyze_text(req: TextRequest):
    return analyze(req.text)