# Hearthlight

A wholesome, AI-guided fantasy tabletop adventure for families. One shared
screen, a party of characters you build together, and a Game Master that never
gets tired and never says no to a silly idea.

Conflicts resolve through kindness, cleverness and courage. Nobody dies.

---

## Status: Milestone 0 — Foundations

The stack is stood up and deployable end to end. There is no game yet.

| | |
|---|---|
| ✅ | Next.js 16 (App Router) + TypeScript, standalone output |
| ✅ | Postgres via Prisma 7 with the `@prisma/adapter-pg` driver adapter |
| ✅ | Migrations + idempotent storyline seed on container start |
| ✅ | `/api/health` reporting real database connectivity |
| ✅ | Dockerfile + compose, ready for Coolify |
| ⬜ | M1 accounts and invite codes · M2 character builder · M3 campaign setup · **M4 the Game Master engine** · M5 play UI |

Four starter adventures are seeded, each with a three-act spine the AI
improvises inside of.

---

## Architecture

```
Browser ──HTTPS──> Coolify / Traefik ──> Next.js container ──> Postgres
                                                │
                                                └──LAN──> your local AI (Ollama, vLLM, …)
```

Two design rules already baked into the schema and worth stating up front:

**The server rolls the dice, not the AI.** When the model decides outcomes,
character stats become decoration and it stops being a game.

**Narration and structured state are separate AI calls.** Asking one response
to be both good prose and valid JSON is where local models fall apart.

### A note on exposing your AI

Do **not** port-forward Ollama to the internet. It ships with no
authentication, so anyone who finds the port gets free use of your GPU. Only
the web app needs a public URL — it reaches the AI over your LAN. If the model
ever lives on a different machine, use Tailscale rather than a port-forward.

---

## Local development

Requires Node 22+ and Docker.

```bash
cp .env.example .env          # defaults match the compose Postgres
docker compose up -d db       # Postgres on localhost:5432
npm install
npx prisma migrate deploy     # or `npm run prisma:migrate` to author new ones
npm run seed
npm run dev                   # http://localhost:3000
```

Or run the whole stack the way production does:

```bash
docker compose up --build
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | `prisma generate` then `next build` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run prisma:migrate` | Create + apply a migration from schema changes |
| `npm run prisma:studio` | Browse the database |
| `npm run seed` | Re-seed storylines (idempotent) |

---

## Deploying on Coolify

### 1. Create the Postgres resource

**+ New → Database → PostgreSQL.** Save the generated credentials. Coolify shows
an internal connection URL — that is what the app will use; the database never
needs a public port.

### 2. Create the application

**+ New → Application → Public/Private Repository**, pointed at this repo and
the branch you want to deploy.

> **Set Build Pack to `Dockerfile`.** Coolify defaults to Nixpacks, which will
> not produce the right image here.

### 3. Set environment variables

In the application's **Environment Variables** tab:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The Postgres resource's **internal** URL, e.g. `postgresql://postgres:PASSWORD@postgresql-abc123:5432/postgres` |
| `AI_BASE_URL` | Your AI server's OpenAI-compatible endpoint, e.g. `http://192.168.1.50:11434/v1` |
| `AI_MODEL` | e.g. `llama3.1:8b` |
| `AI_API_KEY` | Usually blank for local servers |
| `APP_VERSION` | Optional; surfaces on `/api/health` so you can tell which build is live |
| `SEED_ON_START` | `true` (set `false` once you manage storylines by hand) |

### 4. Health check and domain

Set the health check path to `/api/health`. Add your domain in **Domains** and
Coolify issues a Let's Encrypt certificate automatically.

### 5. Deploy

Migrations run automatically on container start, so no manual step is needed.

### If the app cannot reach the database

Coolify sometimes places databases on a separate Docker network. Attach the
application to the database's network in the resource's **Connect To
Predefined Network** setting, and make sure you used the *internal* hostname —
containers cannot reach each other over `localhost`.

---

## Project layout

```
app/
  api/health/       Health endpoint — reports real DB connectivity
  page.tsx          Landing page; lists seeded storylines
lib/db.ts           Prisma singleton (adapter-based, hot-reload safe)
prisma/
  schema.prisma     Storyline + StorylineAct
  seed.ts           Four starter adventures
  migrations/
Dockerfile          Multi-stage; standalone runtime
docker-entrypoint.sh  Waits for Postgres, migrates, seeds, starts
docker-compose.yml  Local stack
```

### Prisma 7 notes

Two things changed in v7 that trip up older tutorials:

- The connection string is **not** in `schema.prisma`. The CLI reads it from
  `prisma.config.ts`; the runtime client gets it via the driver adapter.
- There is no bundled query engine — `@prisma/adapter-pg` is required, and the
  generated client is emitted as TypeScript source into `generated/` (gitignored,
  regenerated on every build).
