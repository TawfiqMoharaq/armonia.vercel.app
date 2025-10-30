# Armonia Coaching Workspace

FastAPI powers the chat assistant backend while Vite/React renders the diagnosis experience and embeds the live chat box.

## Backend (FastAPI)

1. Create and activate a virtual environment, then install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
2. Copy the sample environment file and update the values:
   ```bash
   cp backend/.env.example backend/.env
   # PowerShell:
   # Copy-Item backend/.env.example backend/.env
   ```
   Required keys:
   - `OPENAI_API_KEY` - supply a valid key
   - `OPENAI_MODEL` - defaults to `gpt-4o-mini`
   - `FRONTEND_ORIGIN` - e.g. `http://127.0.0.1:5173`
3. Run the API:
   ```bash
   uvicorn backend.main:app --reload --port 8080
   ```

### Quick checks

```bash
curl http://127.0.0.1:8080/health

curl -X POST http://127.0.0.1:8080/api/analyze ^
  -H "Content-Type: application/json" ^
  -d "{\"side\":\"front\",\"circle\":{\"cx\":0.5,\"cy\":0.45,\"radius\":0.14}}"

curl -X POST http://127.0.0.1:8080/api/chat/send ^
  -H "Content-Type: application/json" ^
  -d "{\"session_id\": null, \"user_message\": \"السلام عليكم\", \"context\": {\"muscles\":[{\"muscle_ar\":\"الدالية الأمامية\",\"muscle_en\":\"Deltoid (Anterior)\",\"region\":\"Shoulder\",\"prob\":0.42}]}, \"language\":\"ar\"}"
```

`/api/analyze` rasterises the configured muscle boxes, applies a Gaussian-weighted circle, and returns the top matches. `/api/chat/send` keeps a 24-message sliding window per session, enriches requests with muscle context, and returns a clickable YouTube suggestion.

## Frontend (Vite + React)

1. Copy the environment template and set the backend URL:
   ```bash
   cp .env.example .env
   # PowerShell:
   # Copy-Item .env.example .env
   ```
   `VITE_API_BASE` should match the FastAPI host (default `http://127.0.0.1:8080`).
2. Install dependencies and start the dev server:
   ```bash
   npm install
   npm run dev
   ```
3. Open `http://127.0.0.1:5173/diagnosis` in the browser.

The diagnosis page now lets you toggle between front/back body maps, drop a circle to mark discomfort, fine-tune the radius, and instantly view the most likely muscles. The chat box reuses the detected muscles and opens with Saudi-dialect tips automatically.

## Notes

- Frontend requests go through `src/lib/api.ts` using Axios with the `VITE_API_BASE` prefix.
- The chat box highlights URLs, shows a typing indicator, and falls back gracefully if the OpenAI call fails.
- Backend environment variables are loaded from either the project root `.env` or `backend/.env` (first one wins).
- `/api/analyze` and the new logic helpers live in `backend/logic.py`, while static bounding boxes are defined in `backend/muscle_data.py` and mirrored for the UI in `src/data/bodyMaps.ts`.
