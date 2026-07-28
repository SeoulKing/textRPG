# textRPG

Server-driven survival text RPG set in a collapsing Seoul.

The current playable direction is a compact 10-day survival game: gather supplies, reinforce the shelter, collect three radio parts, assemble a rescue signal, and survive until the rescue check on day 10.

The seed world is hand-authored around seven fixed regions:

- shelter
- convenience store
- soup kitchen
- forest
- hospital
- subway station
- checkpoint

The subway station also contains a repeatable deep-expedition mode. The concourse remains authored content, while Gemini can direct a run-local mystery and package each underground floor as one major event, all prewritten choice outcomes, and three loot spots. The engine rolls loot from fixed depth tables and gives the model an exact mechanics envelope; output outside those rules is regenerated up to two times and then replaced by a visibly labeled template floor. A template for the next floor is persisted immediately and upgraded in the background with the same loot and mechanics, so starting or descending never waits for generation. Loot only enters the main inventory after a successful return, and run-local story memory is cleared on return.

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

## Content Studio

The local home screen includes a `콘텐츠 스튜디오` button. The studio runs on its own page at
[http://127.0.0.1:3000/content-editor](http://127.0.0.1:3000/content-editor).

Use it to:

- create or edit items and their stat effects
- create or edit crafting and cooking recipes
- build regional stories from scenes and choices
- configure choice conditions and effects without editing TypeScript

The editor separates safe editing from live content:

- `초안 저장` validates IDs and references and keeps the work out of the live game.
- `게임에 공개` stores the same validated document as the published version and refreshes the
  running game registry immediately.

Local development stores the published document in `content/content-studio.json` and the draft under
`.runtime`. Online deployment stores both versions in PostgreSQL so they survive restarts and
redeployments. Production access requires all of:

```text
ENABLE_CONTENT_STUDIO=true
CONTENT_STUDIO_ADMIN_TOKEN=a-long-random-password
NEON_DATABASE_URL=postgresql-connection-string
```

The browser keeps the administrator token only for the current tab session.

## Deploy

This project needs a long-running Node server because the browser talks to `/api/games`.
GitHub Pages can host the static files, but it cannot run the game API.

The root `render.yaml` defines a Render Blueprint for:

- a Node web service that runs `node .server-dist/server.js`
- a PostgreSQL database connected through `NEON_DATABASE_URL` or `DATABASE_URL`
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
- `ENABLE_LLM_SUBWAY_EXPEDITION=false` to disable LLM subway floors and use built-in fallback floors
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

## Optional Kakao Login Setup

Kakao login is optional. Without Kakao settings, the game still supports local browser-based manual saves.

To enable account login and account-based manual saves:

1. Create an app in Kakao Developers.
2. Enable Kakao Login for the app.
3. Add this redirect URI:

```text
https://textrpg-8ic8.onrender.com/api/auth/kakao/callback
```

For local testing, add this redirect URI as well:

```text
http://127.0.0.1:3000/api/auth/kakao/callback
```

Environment variables:

```text
PUBLIC_BASE_URL=https://textrpg-8ic8.onrender.com
AUTH_SECRET=long_random_secret
KAKAO_REST_API_KEY=your_kakao_rest_api_key
KAKAO_CLIENT_SECRET=optional_kakao_client_secret
```

When a user is logged in, `저장하기` writes to that account's single manual save slot. `이어하기` restores that account slot instead of the browser-only save key.

## Other Environment Variables

- `PORT`
- `RUNTIME_DIR`
- `DATABASE_URL`
- `NEON_DATABASE_URL` (takes precedence over `DATABASE_URL`)
- `PUBLIC_BASE_URL`
- `AUTH_SECRET`
- `KAKAO_REST_API_KEY`
- `KAKAO_CLIENT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

If both `NEON_DATABASE_URL` and `DATABASE_URL` are empty, the game uses the local file repository under `.runtime` or `RUNTIME_DIR` when set.

## Docs

- Project structure: `OBJECT_MODEL.md`
- World design: `WORLD_DESIGN.md`
- Subway expedition design and loot tables: `SUBWAY_EXPEDITION.md`
- Content ledger: `CONTENT_LEDGER.md`
