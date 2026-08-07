# Hearthlight

A wholesome, AI-guided fantasy tabletop adventure for families. One shared
screen, a party of characters you build together, and a Game Master that never
gets tired and never says no to a silly idea.

Conflicts resolve through kindness, cleverness and courage. Nobody dies.

---

## Status: Milestone 3 — Campaign setup

The family can be built and an adventure can be prepared. The storyteller
itself arrives in M4 — that is the milestone that makes it a game.

| | |
|---|---|
| ✅ | **M0** Next.js 16 (App Router) + TypeScript, standalone output |
| ✅ | **M0** Postgres via Prisma 7 with the `@prisma/adapter-pg` driver adapter |
| ✅ | **M0** Migrations + idempotent storyline seed on container start |
| ✅ | **M0** `/api/health` reporting real database connectivity |
| ✅ | **M0** Dockerfile + compose, ready for Coolify |
| ✅ | **M1** Invite-only registration, password sign-in, server-side sessions |
| ✅ | **M1** Admin invite management, profile and table preferences |
| ✅ | **M2** Character builder — stats, skills, race and calling |
| ✅ | **M2** Family ties and the Bond mechanic |
| ✅ | **M3** Campaign setup — storyline, party, tone and reading level |
| ⬜ | **M4 the Game Master engine** · M5 play UI · M6 progression |

Seven starter adventures are seeded, each with a three-act spine the AI
improvises inside of.

### Creating the first account

Registration is invite-only, so the first account needs a code that nobody has
yet. While the database has no users, every container start prints one to the
logs:

```
══════════════════════════════════════════════════════════
  No accounts exist yet. Register the first one at /register
  using this invite code:   HEARTH-XXXX-XXXX   <- yours will differ
  That account becomes the administrator.
══════════════════════════════════════════════════════════
```

Open the **Logs** tab in Coolify, copy the code, and register at `/register`.
That account becomes the administrator and can issue invites from `/invites`.
Once anyone has registered, bootstrap codes stop being generated.

### Characters and the family twist

Build everyone at `/characters` — you choose who actually travels when an
adventure begins, so it is fine to add the whole household.

**Four stats, twelve points.** Might, Wits, Heart and **Spark**. Each runs 1–5
and the twelve-point budget averages 3, so a character is competent everywhere
unless you deliberately specialise. `Heart` is a first-class stat, not a
throwaway — comforting someone is as valid a way through a scene as lifting a
gate. The budget is enforced server-side, not just in the builder.

**Race and calling are free text.** The lists are suggestions with a stat
affinity attached; a child who wants to be a Cloud Baker can be one, and the
Game Master will take it seriously.

**Family ties are mechanical, not decoration.** Declare that Pip is Mira's
parent and the game stores one row for the pair with a shared **Bond** counter.
Bonds rise when characters help each other and unlock Family Moves that neither
can use alone. Storing one row rather than two directions is deliberate: two
counters for one relationship drift apart the moment anything writes to only
one of them. The pair is keyed on the smaller character id, and each side reads
the relationship from its own perspective.

### Setting up an adventure

At `/campaigns/new`: pick a storyline, choose who is coming, and decide how it
should be told. Tone and reading level are **copied onto the campaign**, not
referenced from your profile — changing your preferences later must not
silently rewrite a story already in progress.

The order you pick the party in is the order the game asks "what do you do?"
around the table. Party size is checked against the storyline's range, and the
party is settled once the adventure leaves `SETUP`, so the transcript can never
refer to somebody who is no longer there.

### Choosing a model

The Game Master lands in M4, and the model matters more than anything else in
this repo. The prompt work assumes the model can hold a scene in its head and
return schema-valid JSON on request.

**Small instruct models (≈3–4B, such as `phi3:mini`) will struggle here.** Not
because they are bad, but because this is close to the hardest thing you can
ask of a local model: long context, consistent characterisation across many
turns, a tone contract, and structured output. Expect flat prose, forgotten
details and frequent JSON repairs.

For a table reading Harry Potter and Wings of Fire, the narration has to clear a
real bar. Recommended, in rough order of preference given a single consumer GPU:

| Model | Notes |
|---|---|
| `qwen2.5:14b-instruct` | Best structured-output reliability in this size class |
| `mistral-nemo:12b` | Strong long-context prose, 128k window |
| `gemma2:9b` | Good narration; watch its shorter context window |
| `llama3.1:8b` | The safe floor — competent, widely tested |

Whatever you run, check the **context window** Ollama is actually using.
`phi3:mini` defaults to 4k, which the memory pyramid will exhaust within a few
scenes. `ollama show <model>` reports it.

Because the provider is just an OpenAI-compatible base URL, a hosted model can
be dropped in by changing `AI_BASE_URL` and `AI_API_KEY` — useful for comparing
what "good" looks like before deciding how hard to tune the local one.

### How sign-in works

- Passwords are hashed with **scrypt** (`N=2^15`), using Node's built-in
  implementation. argon2id is the better algorithm on paper, but every Node
  binding for it is a native module, and this image is Alpine/musl — the exact
  packaging surface that already broke one deploy. The cost parameters are
  stored inside each hash, so they can be raised later without invalidating
  existing passwords.
- Sessions are **server-side and revocable**. The cookie holds an opaque random
  token; only its SHA-256 hash is stored, so a database dump cannot be replayed
  as a login. Changing a password ends every other session.
- Sign-in failures are **deliberately vague** ("Email or password is incorrect")
  and take the same time whether or not the account exists, so the form cannot
  be used to discover who has an account. Eight failures lock an account for
  15 minutes.
- The session cookie's `Secure` flag follows the proxy's `X-Forwarded-Proto`
  rather than `NODE_ENV`. A fresh Coolify deployment is served over plain http
  on an sslip.io domain, and a `Secure` cookie is silently dropped over http —
  sign-in would appear to work and then bounce straight back to the login page.
  Set `COOKIE_SECURE=true` to force it on.

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

> **Not a deployment step.** This section is for running the app on your own
> laptop while writing code. Do **not** run these commands over SSH on the
> Coolify server — Coolify builds the image, applies migrations and seeds the
> database by itself when you click Deploy. If you only want the game running
> on the server, skip straight to [Deploying on Coolify](#deploying-on-coolify).

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
| `npm test` | Unit tests — hashing and game rules |
| `npm run test:e2e` | Browser-driven auth, characters and campaigns — see below |

### Tests

`npm test` runs standalone unit tests and needs nothing else.

`npm run test:e2e` drives a real browser through registration, sign-in, invite
handling, lockout, session revocation, the character builder, family ties and
campaign setup. It needs a running app **and a database with no accounts in
it**, so it is destructive — point it at a scratch database, never your real
one. Each suite assumes it starts from an empty accounts table, so reset
between runs:

```bash
npm run build && npm start        # app on :3000
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

Playwright's browsers are not downloaded during `npm ci` (the Dockerfile sets
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, since the image never runs them). To run
the E2E tests locally, install one with `npx playwright install chromium`, or
point `CHROMIUM_PATH` at an existing Chromium binary.

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
| `COOKIE_SECURE` | Optional. Leave unset — it follows `X-Forwarded-Proto` automatically. Set `true` to force secure cookies once you are on https. |

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
  login/ register/  Sign-in and invite-gated sign-up
  profile/          Display name, reading level, tone, password change
  invites/          Admin-only invite management
  characters/       Party list, builder, and per-character editing
  campaigns/        Adventure list, setup flow, and campaign page
  page.tsx          Landing page; lists seeded storylines
lib/
  db.ts             Prisma singleton (adapter-based, hot-reload safe)
  auth/
    password.ts     scrypt hashing, parameters embedded per hash
    session.ts      Server-side sessions, requireUser / requireAdmin
    invites.ts      Code validation and redemption
    invite-code.ts  Pure generator — import-free so the seed can use it
    actions.ts      Server actions for every auth form
  game/
    rules.ts        Stat budget, bonds, levels, relationship algebra
    character-options.ts  Races, callings and skills offered by the builder
    actions.ts      Server actions for characters and family ties
    campaign-actions.ts  Server actions for campaigns and party
components/         Shared UI, site header, character builder
tests/
  password.test.ts  Unit tests — hashing
  rules.test.ts     Unit tests — stats, bonds, relationships
  auth.e2e.mts      Browser-driven auth flow
  characters.e2e.mts  Browser-driven character builder
  campaigns.e2e.mts   Browser-driven campaign setup
prisma/
  schema.prisma     Accounts, characters, relationships, campaigns, storylines
  seed.ts           Starter adventures + bootstrap invite
  migrations/
Dockerfile          Multi-stage; standalone runtime
docker-entrypoint.sh  Waits for Postgres, migrates, seeds, starts
docker-compose.yml  Local stack
```

### Prisma 7 notes

Three things changed in v7 that trip up older tutorials:

- The connection string is **not** in `schema.prisma`. The CLI reads it from
  `prisma.config.ts`; the runtime client gets it via the driver adapter.
- There is no bundled query engine — `@prisma/adapter-pg` is required, and the
  generated client is emitted as TypeScript source into `generated/` (gitignored,
  regenerated on every build).
- **Do not prune `@prisma/studio-core` or `@prisma/dev` from a production
  image.** They look development-only and are large, but `prisma/build/cli.js`
  requires studio-core eagerly at module load — removing it breaks
  `migrate deploy` with `MODULE_NOT_FOUND` before it ever contacts the database.

The runtime stage installs `@prisma/client` and `@prisma/adapter-pg` explicitly
rather than relying on Next's standalone output. Next inlines the adapter into
the server bundle and only traces what the server imports, so the seed script —
which runs under `tsx`, outside that bundle — cannot resolve them otherwise.
