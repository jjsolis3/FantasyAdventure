# Hearthlight

A wholesome, AI-guided fantasy tabletop adventure for families. One shared
screen, a party of characters you build together, and a Game Master that never
gets tired and never says no to a silly idea.

Conflicts resolve through kindness, cleverness and courage. Nobody dies.

---

## Status: Milestone 6 — Growing

Characters now get better at things, collect what they find, and unlock moves
they can only use together. Polish is M7.

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
| ✅ | **M4** Four-stage turn pipeline, memory pyramid, safety guard, CLI harness |
| ✅ | **M5** The table — streaming turn progress, dice reveals, transcript |
| ✅ | **M6** Skill growth, inventory, milestone announcements, Family Moves |
| ✅ | **M6** Adventures now end — the final act closes the story rather than looping |
| ✅ | **M7** Take back the last turn — the whole turn, not just the words |
| ⬜ | M7 printable journal, portraits |

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

**Names can be rolled.** "Surprise me" suggests a name shaped by both the race
and the calling — a Dwarf Guardian tends to come out a Thrain Ironhollow, a
Fox-folk Trickster a Vix Winkwood. It is a pure function rather than an AI
call: this button gets pressed ten times in a row while a child decides whether
they are a Pip or a Poppy, so it has to be instant and has to keep working when
the model server is asleep. Given names are mixed rather than split by gender,
so any name suits anyone, and a race the generator has never heard of still
gets something sensible.

**Family ties are mechanical, not decoration.** Declare that Pip is Mira's
parent and the game stores one row for the pair with a shared **Bond** counter.
Bonds rise when one of them genuinely helps the other, and unlock **Family
Moves** — see below. Storing one row rather than two directions is deliberate: two
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

### Playing

`/campaigns/[id]/play` is the table. Everyone gathers round one screen.

**Beginning.** The storyteller narrates the opening from the storyline's hook,
names each character so everyone knows they are present, and leaves the party
facing a situation.

**A turn.** The game asks each character in turn — "Mira, what do you do?" —
in the order the party was picked. Anything can be typed; nothing is refused.
"Waits and watches" is always an option. A review step shows all the declared
actions before they are sent, so a child who typed something by accident can
change it.

**While the storyteller thinks.** A turn is three model calls and can take a
minute on a local model. Rather than a spinner, each stage is announced as it
starts, and **the dice go out as soon as they are rolled** — which is the part
everyone wants to see anyway. The roll tumbles briefly before settling.

**Narration is not streamed token by token, deliberately.** It is checked
against the safety guard before any of it is shown, and a guard that runs after
the children have already read the text is not a guard. The client types it out
on arrival instead, which reads as live without the risk.

**If the model is unreachable** the table gets a plain explanation and a "Try
again" button. Nothing is lost — the adventure sits exactly where it was.

The transcript, the dice and every player's own words persist, so the game can
be closed mid-scene and picked up next week. Closed chapters collapse into a
"story so far" recap.

### Growing — what play changes

**Experience.** Every roll earns some, even a failed one: a child who rolled
badly should not also be punished with nothing. Levels are always derived from
experience, never set directly.

**Skills improve by being used**, whatever the dice said. A skill the Game
Master picked up on ("Speak with Animals to calm her") earns a point, and ranks
add straight to future rolls.

**Family Moves.** Bonds now unlock something. Each move needs two characters,
so none can be used alone — that is the entire point — and each is spendable
once per scene, which keeps it a moment rather than a routine.

| Move | Bond | Effect |
|---|---|---|
| Lend a Hand | 1 | +2 to what they are trying to do |
| Stand Together | 2 | Roll twice, keep the better |
| Never Alone | 3 | If it goes wrong, try once more |
| Two as One | 4 | A near miss becomes a success |
| Hearthlight | 5 | It simply works |

Effects are applied in `lib/engine/dice.ts`, not in the narration. A move that
only changed the wording would make bonds decoration, and the children would
work that out within two sessions. The move is offered at the review step —
after everyone has spoken — because a move belongs to a pair, not a person.

Bond 1 takes three helpful moments, so helping each other has to become a habit
before it unlocks anything.

**Things you find.** The Game Master can hand out items, which are recorded per
character and shown at the table and on the character sheet. Picking up a
second of something raises the count rather than duplicating the row.

**Growth is announced, not just recorded.** Levelling up, a skill reaching a new
rank, a Family Move unlocking, something picked up — each writes a line into the
transcript. A number quietly ticking up in a database is not a reward; being
told "Mira reached level 2" is.

### How the Game Master works

One party turn runs four stages:

```
1. ADJUDICATE  JSON call  → which declared actions need a dice check
2. ROLL        server     → the model has no say in outcomes
3. NARRATE     prose call → told exactly what the dice decided
4. EXTRACT     JSON call  → what changed, pulled back out of the narration
```

**The server rolls, never the model.** If the AI decides outcomes, character
stats become decoration and it stops being a game. The Game Master proposes
checks; `lib/engine/dice.ts` decides how they land; the Game Master narrates
the result it is handed.

**Narration and JSON are separate calls.** Asking one response to be both good
prose and valid JSON is where small local models fall apart — they either write
stilted prose to protect the JSON, or produce lovely prose with unusable JSON
stapled on. Two calls cost more and work far better.

**Nothing crashes the table.** Adjudication failing means a turn with no dice,
not an error screen. Extraction failing means nothing is remembered from that
turn, but the story still happened and is still recorded. Every stage has a
defined fallback.

**Set `AI_NARRATION_MODEL`** to use one model for prose and another for JSON —
qwen2.5 is more reliable at structured output while llama3.1 and gemma tend to
narrate better. Leave it unset to use one model for both.

### Memory — how it remembers across sessions

A local model cannot be handed twenty sessions of transcript, so context is a
pyramid, trimmed from the bottom when it exceeds `AI_MAX_CONTEXT_TOKENS`:

| Layer | Dropped when short of room? |
|---|---|
| Campaign premise and current act | Never |
| Party sheet, stats, bonds | Never |
| Location and current scene summary | Never |
| Long-term memories, ranked | Capped at a third of what remains |
| Earlier scene summaries | Capped at a quarter of what remains |
| Recent turns, verbatim | Oldest dropped first |

Memories rank by **importance before recency**, so a central plot thread from
ten turns ago still outranks incidental scenery from last turn. When a scene
closes it is summarised and its turns stop costing context entirely — which is
what makes a long campaign fit in a 7B model's window.

### Trying it against your model

`npm run gm:harness` runs one complete turn — a real scene, two characters,
two declared actions — against your model server and prints every stage: the
assembled context, the adjudication JSON, the dice, the narration, the
extraction, per-call latency, and a verdict calling out anything that went
wrong.

```bash
AI_BASE_URL=http://192.168.1.50:11434/v1 AI_MODEL=qwen2.5:latest npm run gm:harness
```

It needs no database and no running app, so it is the fastest way to compare
models on identical input:

```bash
AI_MODEL=phi3:latest     npm run gm:harness
AI_MODEL=qwen2.5:latest  npm run gm:harness
AI_MODEL=llama3.1:latest npm run gm:harness
```

Watch for `adjudicationFellBack` or `extractionFellBack` in the diagnostics —
those mean the model could not produce usable JSON at all, and dice or memory
were skipped. Repairs above zero mean it needed a second attempt.

`/api/health?ai=1` performs a live probe from inside the container, which is
the quickest way to confirm the app can actually reach your model over the LAN.
Plain `/api/health` only reports whether the model is configured — a live probe
on every Coolify poll would hammer your GPU, and the app is deliberately still
"healthy" with the model down.

### Settings, and switching to a cloud model

`/settings/storyteller` (admin only) configures the storyteller from the
browser, so the model can be changed **without a redeploy**. Presets are
included for Ollama, Anthropic, OpenAI, OpenRouter and Groq.

Settings are stored in the database and take over from the environment
variables once saved. The environment remains the fallback, so a fresh
deployment works before anyone opens the page.

**Two tests, and the second is the one that matters.** A quick check says
whether the model answers at all. *Run a practice turn* drives the real
four-step pipeline against a synthetic scene and reports what would break:
whether it could produce usable JSON for the dice, whether anything would ever
be remembered, how many retries it needed, and how many words it wrote. A model
can pass the quick check and still be unable to run the game.

**API keys are encrypted at rest.** The encryption key lives in
`SETTINGS_SECRET` in the environment, never in the database, so a database dump
or a stray backup does not hand over a working key. Without that variable set,
the page refuses to store a key rather than saving it in the clear — local
models need no key, so everything else still works. The key is never sent back
to the browser; the page shows only a hint like `sk-ant…4f2a`.

Anthropic speaks a different wire format from everything else (`/v1/messages`,
its own auth header, system prompt as a separate field), so it has its own
adapter rather than being bent into the OpenAI shape.

### Choosing a model

**[docs/ollama.md](docs/ollama.md) is the step-by-step runbook** — verifying the
server, making it reachable from the container, the context-window setting that
quietly breaks the pipeline, and the exact `ollama pull` commands per VRAM tier.
Start there if the storyteller cannot be reached or the practice turn is
reporting JSON failures.

The model matters more than anything else in this repo. The pipeline assumes it
can hold a scene in its head and return schema-valid JSON on request.

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

Whatever you run, check the **context window** Ollama is actually using — this
is the single most common cause of a model looking worse than it is. Ollama caps
`num_ctx` at 2048–4096 regardless of what the model supports, and truncates from
the front of the prompt, which is where the rules and JSON instructions live.
`ollama show <model>` reports it; [docs/ollama.md](docs/ollama.md) has the fix.

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

Do **not** port-forward Ollama to the internet, and do not leave it listening on
a public address. It ships with **no authentication of any kind** — anyone who
reaches port 11434 gets unlimited use of your GPU, can list your models, and can
delete them. Port 11434 is on every scanner's default list; exposed instances get
found in hours. There is no TLS either, so prompts — which here contain your
family's characters and story — travel in plaintext.

Only the web app needs a public URL. If the model lives on a different machine,
connect the two with [Tailscale](https://tailscale.com), or put an
authenticating reverse proxy in front of Ollama. The app already sends
`Authorization: Bearer <key>` when an API key is set, so a token-checking proxy
needs no code changes. [docs/ollama.md § 2b](docs/ollama.md#2b-when-ollama-is-on-a-different-network)
has both, with the exact commands.

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
| `npm test` | Unit tests — hashing, rules, dice, prompts, provider |
| `npm run gm:harness` | Run one Game Master turn against your model — see below |
| `npm run mock:model` | A fake Ollama on :11499, so the play tests need no GPU |
| `npm run test:e2e` | Browser-driven auth, characters and campaigns — see below |

### Tests

`npm test` runs standalone unit tests and needs nothing else.

`npm run test:e2e` drives a real browser through registration, sign-in, invite
handling, lockout, session revocation, the character builder, family ties,
campaign setup and a complete played turn. The play suite talks to
`npm run mock:model` rather than a real model, so it needs no GPU — start that
on :11499 and point the app at `AI_BASE_URL=http://127.0.0.1:11499/v1`. It needs a running app **and a database with no accounts in
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
| `AI_MODEL` | e.g. `qwen2.5:latest` — also used for JSON stages |
| `AI_NARRATION_MODEL` | Optional. A second model for prose only |
| `AI_API_KEY` | Usually blank for local servers |
| `AI_MAX_CONTEXT_TOKENS` | Default 3000. Lower it if your model's window is small |
| `AI_TIMEOUT_MS` | Default 120000. Raise for a large model on modest hardware |
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
  campaigns/        Adventure list, setup flow, campaign page, and the table
  api/campaigns/[id]/turn/  SSE endpoint that runs and streams a turn
  page.tsx          Landing page; lists seeded storylines
lib/
  db.ts             Prisma singleton (adapter-based, hot-reload safe)
  settings/
    secret-box.ts   AES-256-GCM for keys stored in the database
  auth/
    password.ts     scrypt hashing, parameters embedded per hash
    session.ts      Server-side sessions, requireUser / requireAdmin
    invites.ts      Code validation and redemption
    invite-code.ts  Pure generator — import-free so the seed can use it
    actions.ts      Server actions for every auth form
  ai/
    provider.ts     OpenAI-compatible and Anthropic clients
    settings.ts     Resolves config: database first, environment as fallback
    prompts.ts      The tone contract and every stage's prompt
    context.ts      The memory pyramid and token budgeting
    schemas.ts      Zod contracts the model must satisfy
    json.ts         Forgiving extraction plus the repair loop
    safety.ts       Last-line content guard
  engine/
    dice.ts         Checks and outcomes — the server rolls, not the model
    gm.ts           The four-stage pipeline, no database or HTTP
    play.ts         Wires the pipeline to the database
  game/
    rules.ts        Stat budget, bonds, levels, skills, Family Moves
    names.ts        Name suggestions shaped by race and calling
    character-options.ts  Races, callings and skills offered by the builder
    actions.ts      Server actions for characters and family ties
    campaign-actions.ts  Server actions for campaigns and party
components/         Shared UI, site header, character builder
scripts/
  gm-harness.ts     Drive one turn against a real model server
tests/
  password.test.ts  Unit tests — hashing
  rules.test.ts     Unit tests — stats, bonds, relationships
  names.test.ts     Unit tests — the name generator
  engine.test.ts    Unit tests — dice, JSON repair, context, safety
  gm.test.ts        Unit tests — the pipeline, with a stubbed model
  provider.test.ts  Unit tests — wire format, against a mock server
  auth.e2e.mts      Browser-driven auth flow
  characters.e2e.mts  Browser-driven character builder
  campaigns.e2e.mts   Browser-driven campaign setup
  play.e2e.mts        Browser-driven play, against the mock model
  progression.e2e.mts Browser-driven skills, items, milestones, Family Moves
  settings.e2e.mts    Browser-driven storyteller settings and connection test
  settings.test.ts    Unit tests — key encryption and the Anthropic adapter
  mock-model-server.mts  Fake Ollama for the play tests
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
