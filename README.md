# textRPG

Server-driven survival text RPG set in a collapsing Seoul.

The game keeps authored starter content for the prologue, shelter, convenience store, and kitchen.
Beyond that frontier, the server can expand the world with dynamic regions, people, items, and quests.

## Run

```powershell
cd D:\BANG\project\textRPG
npm install
copy .env.example .env
```

Open `.env` and set:

```text
GEMINI_API_KEY=your_key_here
```

Then start the server:

```powershell
npm run start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Gemini Setup

Only `GEMINI_API_KEY` is required.

Optional settings:

- `GEMINI_MODEL`
- `GEMINI_API_URL`

If `GEMINI_API_KEY` is present, the server uses Gemini for:

- dynamic frontier region generation
- tomorrow world evolution planning
- narrative card generation

If Gemini is not configured, the game falls back to the built-in template generator so the project still runs locally.

## Other Environment Variables

- `PORT`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

If `DATABASE_URL` is empty, the game uses the local file repository under `.runtime`.

## Docs

- Project structure: `OBJECT_MODEL.md`
