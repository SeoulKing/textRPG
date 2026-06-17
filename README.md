# textRPG

Server-driven survival text RPG set in a collapsing Seoul.

The current playable direction is a compact 10-day survival game: gather supplies, reinforce the shelter, collect three radio parts, assemble a rescue signal, and survive until the rescue check on day 10.

The seed world is hand-authored around six fixed regions:

- shelter
- convenience store
- soup kitchen
- hospital
- subway station
- checkpoint

LLM-led world expansion is deferred. It remains in the codebase as an optional development feature, but normal play uses authored/template content.

## Run

```powershell
cd D:\BANG\project\textRPG
npm install
copy .env.example .env
```

Open `.env` only if you want optional remote generation:

```text
GEMINI_API_KEY=your_key_here
```

Then start the server:

```powershell
npm run start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Deploy

This project needs a long-running Node server because the browser talks to `/api/games`.
GitHub Pages can host the static files, but it cannot run the game API.

The root `render.yaml` defines a Render Blueprint for:

- a Node web service that runs `node .server-dist/server.js`
- a Render Postgres database connected through `DATABASE_URL`
- `/api/health` as the deployment health check

Render setup:

1. Push this repository branch to GitHub.
2. In Render, create a new Blueprint from this repository.
3. Select the branch that contains `render.yaml`.
4. Deploy. The public game URL will be the generated `*.onrender.com` web service URL.

The Blueprint uses free Render instances for the first MVP deployment. Upgrade the database plan before inviting many players or relying on long-term saves.

## Optional Gemini Setup

Gemini is not required for normal play.

Optional settings:

- `ENABLE_LLM_WORLD_PLANNER=true`
- `GEMINI_MODEL`
- `GEMINI_API_URL`

Default model: `gemini-3.1-flash-lite-preview`

By default, the world planner uses the safe template planner even when `GEMINI_API_KEY` exists.

To opt into the experimental LLM world planner, set both:

```text
ENABLE_LLM_WORLD_PLANNER=true
GEMINI_API_KEY=your_key_here
```

Narrative/card generation also falls back to templates on request failures so the project remains playable offline or during API errors.

## Other Environment Variables

- `PORT`
- `RUNTIME_DIR`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

If `DATABASE_URL` is empty, the game uses the local file repository under `.runtime` or `RUNTIME_DIR` when set.

## Docs

- Project structure: `OBJECT_MODEL.md`
- World design: `WORLD_DESIGN.md`
- Content ledger: `CONTENT_LEDGER.md`
