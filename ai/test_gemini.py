import os
from dotenv import load_dotenv
from google import genai

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
resp = client.models.generate_content(
    model="gemini-3.6-flash",
    contents="Say hi in one word"
)
print(resp.text)