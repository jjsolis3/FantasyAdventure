# Setting up Ollama for Hearthlight

Everything here is run **on the machine where Ollama lives**, over SSH, unless a
step says otherwise. That is not necessarily the Coolify server — in a typical
setup Coolify runs the app and the database on one box, and Ollama runs on
whichever machine has the GPU.

Work through it in order; each section assumes the one before it passed.

If you only read one section, read [Context window](#4-context-window--the-one-that-actually-bites).
It is the setting most likely to make the game misbehave in a way that looks
like a bad model rather than a bad configuration.

---

## 0. First: which address, and is it private?

`http://192.168.1.50:11434/v1` is the **example value** shipped in
`.env.example`. If that address is what the settings page shows, confirm it is
genuinely your machine before debugging anything else — a wrong address produces
exactly the "could not reach the model server" error, and no amount of Ollama
tuning fixes it.

On the Ollama machine:

```bash
hostname -I        # its address(es) on the local network
curl -s ifconfig.me; echo    # the public address the internet sees
```

**These two answer different questions, and which one you should use depends on
whether they match.**

| What you see | What it means | Which address to use |
|---|---|---|
| `hostname -I` gives `192.168.x.x` / `10.x.x.x` / `172.16–31.x.x`, and `ifconfig.me` gives something different | Normal home or office network. The machine is behind a router. | The **private** one from `hostname -I` — if the Coolify server is on the same network |
| Both give the same public address | A cloud VPS or a directly-connected machine | See [Section 2b](#2b-when-ollama-is-on-a-different-network) — it needs protecting |

### The private ranges, for reference

Only these three blocks are private. Everything else is internet-routable:

```
10.0.0.0     – 10.255.255.255
172.16.0.0   – 172.31.255.255
192.168.0.0  – 192.168.255.255
```

If the address you are about to put in the settings page is **not** in one of
those ranges, stop and read section 2b before going further. A public address
means either the traffic leaves your network, or the address is your router's
and Ollama is not actually there.

### If the Coolify server and Ollama are on the same network

Use the private address, not the public one. Two reasons:

1. Traffic stays inside your network — no port-forward, nothing exposed.
2. **Many routers cannot route a request from inside back to their own public
   address** (this is called NAT hairpinning, and consumer routers often drop
   it). So pointing the app at your own WAN IP frequently fails even when
   everything is configured correctly, in a way that is genuinely baffling to
   debug.

Use the private address everywhere below in place of `<AI_HOST>`.

---

## Windows Server — read this instead of sections 1, 2 and 6

Sections 1, 2 and 6 assume Linux. On Windows Server the same three things have to
be true — the process runs, it listens on more than loopback, and it uses the
GPU if there is one — but the commands differ, and Windows adds one failure mode
Linux does not have.

A quick tell that you are on Windows: `hostname -I` replies

```
hostname: Using the hostname command to set the hostname of the machine is not
supported. Use the Network control panel application to set the hostname.
```

Windows' `hostname.exe` reads *any* argument as an attempt to rename the machine.
Use `ipconfig` instead.

### The Windows-only failure: Ollama is not a service

**On Windows, Ollama installs as a tray application that runs under the logged-in
user, not as a Windows service.** On a server you administer over RDP, this means
Ollama stops when you log off — the game works while you are connected and breaks
after you disconnect, which is a genuinely confusing way to fail.

Install [NSSM](https://nssm.cc/download), then register it properly. In an
elevated PowerShell:

```powershell
# Find where Ollama actually installed
Get-Command ollama | Select-Object -ExpandProperty Source

nssm install Ollama "C:\Users\<you>\AppData\Local\Programs\Ollama\ollama.exe" serve
nssm set Ollama AppEnvironmentExtra `
    OLLAMA_HOST=0.0.0.0:11434 `
    OLLAMA_MODELS=C:\ollama\models `
    OLLAMA_KEEP_ALIVE=30m
nssm start Ollama

Get-Service Ollama
```

`OLLAMA_MODELS` is not optional here. Models default to
`C:\Users\<you>\.ollama\models`, but a service running as LocalSystem looks in
`C:\Windows\System32\config\systemprofile\.ollama` instead — so models you
already pulled appear to vanish the moment Ollama becomes a service. Setting an
explicit path avoids that, and lets you put the models on whichever volume has
room.

Task Scheduler with *Run whether user is logged on or not* also works if you
would rather not install NSSM.

### Checking it, on Windows

```powershell
ollama --version
Get-Service Ollama

# What address is it bound to? 0.0.0.0 good, 127.0.0.1 unreachable from outside
Get-NetTCPConnection -LocalPort 11434 | Select-Object LocalAddress, State

# Does it answer locally?
Invoke-RestMethod http://localhost:11434/api/tags
```

`curl.exe` also exists on Windows Server 2019 and behaves like Linux `curl` — but
plain `curl` in PowerShell is an alias for `Invoke-WebRequest`, which takes
different arguments. Type `curl.exe` explicitly, or use `Invoke-RestMethod`.

### Environment variables without NSSM

If Ollama runs as a tray app rather than a service, set the variables machine-wide
and restart it:

```powershell
[Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0:11434','Machine')
[Environment]::SetEnvironmentVariable('OLLAMA_KEEP_ALIVE','30m','Machine')
```

Then quit Ollama from the system tray and start it again — the process reads these
only at launch.

### Firewall

```powershell
New-NetFirewallRule -DisplayName "Ollama (Hearthlight)" `
    -Direction Inbound -Protocol TCP -LocalPort 11434 `
    -RemoteAddress <COOLIFY_SERVER_IP> -Action Allow
```

**`-RemoteAddress` is the important part.** Without it the rule allows the port
from anywhere the machine is reachable, which on a public-facing server is the
whole internet. If the machine already sits behind a source-restricted perimeter
firewall, confirm that restriction covers **port 11434 specifically** and not just
80 and 443 — a rule that opens a new port is a new rule, and it does not inherit
the old one's source list.

### GPU check

```powershell
Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM
nvidia-smi          # if an NVIDIA GPU is present
ollama ps           # PROCESSOR column: 100% GPU is what you want
```

On a virtual machine without GPU passthrough there is no GPU, and everything runs
on the CPU. Read the next section before choosing a model — it changes the answer
completely.

---

## 1. Is Ollama running at all?

```bash
# Is the service up, and has it crashed recently?
systemctl status ollama --no-pager

# What version?
ollama --version

# Does it answer on the machine itself?
curl http://localhost:11434
```

That last command should print `Ollama is running`.

If the service is dead or missing:

```bash
sudo systemctl enable --now ollama
journalctl -u ollama -n 50 --no-pager   # read this if it will not start
```

---

## 2. Can anything *else* on the network reach it?

This is the step that fails most often, and the symptom is exactly the error
the play screen showed.

**By default Ollama listens only on `127.0.0.1`.** It answers on the server
itself and refuses every connection from anywhere else — including the
Hearthlight container, even when that container runs on the same physical
machine, because Docker gives it its own network namespace.

Check what it is bound to:

```bash
sudo ss -ltnp | grep 11434
```

- `127.0.0.1:11434` → **loopback only.** Nothing outside the host can connect. Fix it below.
- `0.0.0.0:11434` or `*:11434` → listening on all interfaces. Good.

### Making it listen on the LAN

```bash
sudo systemctl edit ollama
```

An editor opens on an empty override file. Add:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_KEEP_ALIVE=30m"
Environment="OLLAMA_NUM_PARALLEL=2"
```

Save, then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
sudo ss -ltnp | grep 11434     # should now show 0.0.0.0:11434
```

Why the other two:

- **`OLLAMA_KEEP_ALIVE=30m`** — Ollama unloads a model from VRAM after five
  minutes idle by default. One Hearthlight turn is *three* calls, and a family
  takes minutes to decide what to do between turns, so the default means paying
  the model-load cost repeatedly. Thirty minutes keeps it warm across a session.
- **`OLLAMA_NUM_PARALLEL=2`** — the turn pipeline is sequential, but the
  settings page can be testing while a turn runs. Two avoids the second request
  queueing behind the first.

### Firewall

If `ufw` is active, the port needs to be open to the LAN only — never to the
internet:

```bash
sudo ufw status
sudo ufw allow from 192.168.1.0/24 to any port 11434 proto tcp
```

Adjust `192.168.1.0/24` to match your own subnet.

If the Coolify server is on the same network, that is everything — skip to
section 3. If it is not, read on.

---

## 2b. When Ollama is on a different network

`OLLAMA_HOST=0.0.0.0` opens the port to whatever can route to that machine. On a
home LAN behind a router, that is your own devices. On a machine with a public
address, **that is the entire internet.**

Ollama has no authentication of any kind. Not a password, not a token, not an
allowlist. Anyone who connects to port 11434 can:

- run unlimited inference on your GPU, indefinitely, at your electricity cost
- list every model you have pulled
- **pull new models**, filling your disk
- **delete your models** (`DELETE /api/delete`)

Port 11434 is in every internet-wide scanner's default list. Exposed instances
get found in hours, not months. There is also no TLS: prompts travel in
plaintext, and Hearthlight's prompts contain your children's character names and
everything that happens in your family's story.

So: **do not port-forward 11434, and do not leave a public-IP Ollama open.**
Pick one of the two options below instead.

### Option A — Tailscale (recommended)

A private encrypted network between just your machines. No port-forward, no
open ports, nothing exposed to scanners. Free for personal use, and about ten
minutes of work.

On **both** the Ollama machine and the Coolify server:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Each prints a URL — open it, sign in with the same account for both. Then:

```bash
tailscale ip -4        # this machine's tailnet address, a 100.x.x.x
tailscale status       # confirms both machines see each other
```

On the Ollama machine, bind Ollama to the tailnet address specifically rather
than to everything, and firewall the rest:

```bash
sudo systemctl edit ollama
```

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_KEEP_ALIVE=30m"
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart ollama

# Only the tailnet may reach the port
sudo ufw allow in on tailscale0 to any port 11434 proto tcp
sudo ufw deny 11434/tcp
sudo ufw enable
```

Then use the Ollama machine's `100.x.x.x` address in the settings page:

```
http://100.x.x.x:11434/v1
```

The app's container reaches it through the Coolify host's routing table, since
bridge-networked containers route outbound traffic via the host. Confirm from
the container's Terminal in Coolify with the `node -e` command in section 3.

If that fails, the container is not picking up the host's tailnet route. The
reliable fix is to bind the app's traffic to the host network, or to run
Tailscale as a sidecar container next to the app — but test first, because the
default usually works.

### Option B — an authenticated reverse proxy

If Tailscale is not an option, put something in front of Ollama that checks a
token, and let nothing reach Ollama directly.

This works neatly because **Hearthlight already sends
`Authorization: Bearer <key>`** whenever an API key is configured. So a proxy
that validates that header needs no application changes at all — set the key on
the settings page and it is sent with every call.

On the Ollama machine, with [Caddy](https://caddyserver.com) installed:

```caddy
# /etc/caddy/Caddyfile
ai.example.com {
    @unauthorized not header Authorization "Bearer PUT_A_LONG_RANDOM_STRING_HERE"
    respond @unauthorized 401

    reverse_proxy 127.0.0.1:11434
}
```

```bash
sudo systemctl reload caddy
```

Generate the token with `openssl rand -base64 32`.

Then lock Ollama itself to loopback so the proxy is the only way in — this is
the default, so simply **do not** set `OLLAMA_HOST=0.0.0.0` in this
configuration — and firewall accordingly:

```bash
sudo ufw allow 443/tcp
sudo ufw deny 11434/tcp
```

In the settings page use `https://ai.example.com/v1` and paste the token into
the API key field. Caddy obtains a TLS certificate automatically, so the traffic
is encrypted, which plain Ollama never is.

> Storing that key requires `SETTINGS_SECRET` to be set in Coolify's environment
> variables — the app encrypts keys at rest and refuses to store one otherwise.
> Generate it with `openssl rand -base64 32`.

Narrow it further if the Coolify server has a fixed address:

```bash
sudo ufw allow from <COOLIFY_SERVER_IP> to any port 443 proto tcp
```

### What not to do

| Approach | Why not |
|---|---|
| Port-forward 11434 on the router | No auth, no TLS, found by scanners within hours |
| Public IP + `OLLAMA_HOST=0.0.0.0`, no proxy | Same, minus the router |
| Cloudflare Tunnel to Ollama with no access policy | Hides the IP, still unauthenticated |
| Firewall allowlist by IP alone, on a residential connection | Home IPs change; the game breaks at renewal |

---

## 3. Test the exact path the app uses

Hearthlight talks to the **OpenAI-compatible** API under `/v1`, not Ollama's
native `/api` routes. It is possible for `/api/tags` to work while `/v1` does
not, so test the one that matters.

### From another machine on the LAN

```bash
# Native API — confirms reachability and lists installed models
curl http://<AI_HOST>:11434/api/tags

# The OpenAI-compatible path the app actually calls
curl http://<AI_HOST>:11434/v1/models

# A real completion through that path
curl http://<AI_HOST>:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:latest",
    "messages": [{"role": "user", "content": "Reply with the single word: ready"}],
    "max_tokens": 10
  }'
```

The last one should return JSON containing `"content": "ready"` or similar.
That is precisely what the settings page's **Quick check** does.

### From inside the Hearthlight container

This is the definitive test — it is the only network path that matters. Open
the container's **Terminal** in Coolify and run:

```sh
node -e "fetch('http://<AI_HOST>:11434/v1/models').then(r=>r.text()).then(console.log).catch(e=>console.log('FAIL',e.message))"
```

`node` is used rather than `curl` because the runtime image is
`node:22-alpine`, which has no `curl` installed.

A JSON list of models means the app can reach Ollama and the address in the
settings page is correct. `FAIL` plus a connection error means the container
cannot get out to that address — recheck the bind address in step 2 and the
firewall.

---

## 4. Context window — the one that actually bites

**Ollama does not use a model's full context window by default.** It caps
`num_ctx` at a small value (2048 on older builds, 4096 on newer ones) no matter
what the model supports.

Hearthlight budgets `AI_MAX_CONTEXT_TOKENS=3000` for the prompt *content*, and
then adds the system prompt, the tone contract, the output-format instructions
and the party sheet on top. At a 2048 or 4096 cap, Ollama silently truncates
from the front of the prompt — which is where the rules and the JSON format
instructions live. The model then returns prose where JSON was expected, or
forgets who is in the party.

This looks exactly like "the model is not good enough". It is not.

Check what a model is configured for:

```bash
ollama show qwen2.5:latest
```

Look at the `context length` line under Model, and at any `num_ctx` under
Parameters.

### Fixing it

The `/v1` endpoint gives no way to set `num_ctx` per request, so it has to be
baked into a model variant. On the server:

```bash
cat > Modelfile.hearthlight <<'EOF'
FROM qwen2.5:latest
PARAMETER num_ctx 8192
PARAMETER temperature 0.7
EOF

ollama create qwen2.5-hearth -f Modelfile.hearthlight
ollama show qwen2.5-hearth        # confirm 8192
```

Then set the model in `/settings/storyteller` to `qwen2.5-hearth`.

Do the same for whichever model you settle on. 8192 is comfortable for this
pipeline; raise it only if you have VRAM to spare, since context costs memory.

---

## 4b. Will it be fast enough? Measure before you choose a model

**Without a GPU, this pipeline is slow enough to change the answer about whether
to self-host at all.** Not broken — slow. Worth knowing before you spend an
evening tuning Modelfiles.

One Hearthlight turn is **three** model calls (adjudicate → narrate → extract),
and each one re-reads the whole assembled prompt. So a turn costs three prompt
reads plus three generations, not one of each.

### Measure it, don't estimate it

```bash
ollama run qwen2.5:latest --verbose "Write three sentences about a fox."
```

The `--verbose` output ends with the two numbers that matter:

- **`prompt eval rate`** — how fast it reads the prompt. The memory pyramid sends
  roughly 3000 tokens per call, so 3000 ÷ this rate is the read time per call.
- **`eval rate`** — how fast it writes. Narration is ~500 tokens.

Rough per-turn arithmetic:

```
turn ≈ 3 × (3000 / prompt_eval_rate)  +  (250 + 500 + 250) / eval_rate
```

Also check `ollama ps` immediately afterwards. If the PROCESSOR column says
anything other than `100% GPU`, you are on CPU.

### What the numbers mean

| Combined per-turn time | What it feels like at the table |
|---|---|
| Under 30s | Fine. The pause is part of the drama. |
| 30–90s | Workable, but expect the kids to wander off between turns. |
| 2–5 min | Frustrating. One scene takes an evening. |
| Over 5 min | Not playable with children. |

### What to expect on a CPU-only server

On a mid-2010s server Xeon — 8 cores, quad-channel DDR4, no GPU — token
generation is limited by memory bandwidth rather than clock speed, and prompt
reading is limited by cores. A 7–8B model at Q4 typically lands around 4–6
tokens/second generating and 15–30 tokens/second reading, which works out to
**roughly 6–12 minutes per turn**. A 3B model roughly halves that and is still
too slow, while being too small to hold the tone contract and return valid JSON.

Treat those figures as a starting hypothesis, not a verdict — run the command
above and use your own numbers. But if they land anywhere near that range, the
honest options are:

1. **Add a GPU** to the machine (or move Ollama to a machine that has one). Even
   a modest 8GB card takes a 7B model from minutes to seconds.
2. **Use a cloud model.** The settings page already supports this, and for a
   family game the cost is small — see [Cost, if you use a cloud model](#cost-if-you-use-a-cloud-model)
   below.
3. **Play asynchronously.** Turns resolve over minutes rather than seconds. This
   is a real option for a slower, letter-writing style of game, but it is not the
   around-the-table experience the app was built for.

There is no prompt tuning that recovers a 10× speed gap. Do not spend time on
Modelfiles until the measurement says the hardware can keep up.

---

## 4c. Thinking models return nothing unless you turn thinking off

A model can pass every reachability test and still hand back an empty answer.
The symptom is the game hanging at *Writing what happens next…*, or a practice
turn that reports a reply of `""`.

**Ollama enables thinking by default for models that support it** — Qwen3,
DeepSeek-R1 and similar hybrid reasoning models. The thinking does not come out
of a separate allowance: it is charged against the same output budget as the
answer, and it is returned in a separate `reasoning` field that no
OpenAI-compatible client reads. Hearthlight gives each call 700 output tokens.
A model that thinks for 700 tokens has nothing left, so it returns:

```json
{ "message": { "content": "", "reasoning": "Okay, the user wants…" },
  "finish_reason": "length" }
```

Reachable, responding, and useless.

### Check whether your model does it

On the Ollama machine, with and without the setting:

```bat
curl.exe http://localhost:11434/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"qwen3:8b\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with only the word ready\"}],\"max_tokens\":20,\"stream\":false}"
```

If `content` comes back empty — or the reply is wrapped in `<think>` tags — add
`\"reasoning_effort\":\"none\"` to that body and run it again. Ollama's
OpenAI-compatible layer maps that to thinking disabled, and the answer should
become a plain `"content":"ready"`.

### Then set it in the app

`/settings/storyteller` has a **Reasoning** field. Choose **None** for Ollama;
the Ollama preset now fills that in for you. It is sent as `reasoning_effort` on
every request.

Leave it on the first option for OpenAI, which rejects values it does not
recognise — blank means the field is left off the request entirely. The
environment equivalent is `AI_REASONING_EFFORT=none`.

**This game does not need chain-of-thought.** The pipeline already separates
judgement from prose: the model decides whether an action needs a roll, the
*server* rolls the dice, and the model then narrates a result it has been
handed. Thinking adds latency to all three stages and improves none of them.

### The simpler alternative

`qwen2.5:7b-instruct` does not think at all, and is the more reliable choice for
the JSON stages regardless:

```bash
ollama pull qwen2.5:7b-instruct
```

Getting the whole pipeline working on one predictable model first, then changing
only the narration model, isolates problems instead of moving several at once.

---

## 5. Which models to pull

You already have `phi3:latest`, `gemma3`, `qwen2.5:latest` and `llama3.1`.
`ollama list` shows what is installed with sizes.

Two jobs are being asked of the model, and they are not the same job:

- **Structured output** — the adjudication and extraction stages must return
  valid JSON. Failures here cost you dice and memory.
- **Narration** — prose your daughters will actually enjoy reading. This is the
  higher bar of the two.

Hearthlight can use **different models for each** (`AI_NARRATION_MODEL`, or the
Narration field on the settings page), which is worth doing.

### Check your VRAM first

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv    # NVIDIA
# or, if there is no GPU:
free -h                                                  # CPU + system RAM
```

### Pull commands

**If you have 12GB+ VRAM** — the best experience:

```bash
ollama pull qwen2.5:14b-instruct    # ~9GB · structured output + general use
ollama pull mistral-nemo:12b        # ~7GB · the better storyteller, 128k context
```

Set the main model to the `qwen2.5:14b-instruct` variant and Narration to the
`mistral-nemo` variant. That is the split this pipeline was designed for.

**If you have 8GB VRAM** — the practical sweet spot:

```bash
ollama pull qwen2.5:7b-instruct     # ~4.7GB · this is what qwen2.5:latest already is
ollama pull mistral-nemo:12b-instruct-2407-q4_0   # ~7GB · quantised, still fits
```

**If you have 6GB or less, or no GPU at all:**

```bash
ollama pull llama3.1:8b             # ~4.7GB · competent floor, widely tested
ollama pull gemma2:9b               # ~5.4GB · nicer prose, shorter context
```

On CPU only, expect 30–90 seconds per stage — three stages per turn. Playable
but slow enough that the table will feel it. This is the case where a cloud
model earns its keep.

**What to drop:** `phi3:latest` is ~3.8B and defaults to a 4k window. It is a
good small model and a poor fit for this specific job — long context, a tone
contract, consistent characters across many turns, and schema-valid JSON. Keep
it for comparison, do not run the family game on it.

### Then wrap each in a Modelfile

Every model you intend to use needs the `num_ctx` treatment from section 4:

```bash
cat > Modelfile.gm <<'EOF'
FROM qwen2.5:14b-instruct
PARAMETER num_ctx 8192
EOF
ollama create hearth-gm -f Modelfile.gm

cat > Modelfile.narrator <<'EOF'
FROM mistral-nemo:12b
PARAMETER num_ctx 8192
PARAMETER temperature 0.85
EOF
ollama create hearth-narrator -f Modelfile.narrator
```

The higher temperature on the narrator is deliberate — prose benefits from it,
JSON does not.

---

## 6. Confirm it is running on the GPU

A model quietly falling back to CPU is the usual reason turns take minutes.

```bash
# Load a model, then immediately check where it went
ollama run qwen2.5:latest "hello" --verbose
ollama ps
```

`ollama ps` prints a **PROCESSOR** column. `100% GPU` is what you want.
Anything showing CPU means the model did not fit in VRAM and was partly or
wholly offloaded — pull a smaller or more heavily quantised variant.

`--verbose` also prints tokens/second. Below roughly 15 tok/s, narration will
feel slow at the table.

---

## 7. Point Hearthlight at it

In `/settings/storyteller`:

| Field | Value |
|---|---|
| Provider | Ollama (local) |
| Address | `http://<AI_HOST>:11434/v1` — note the `/v1` |
| Model | `hearth-gm` (your Modelfile variant, not the base name) |
| Narration model | `hearth-narrator`, or blank to use the same one |
| API key | leave empty — Ollama needs none |

Save, then run **Quick check**. If that passes, run **Run a practice turn** —
it drives the real four-stage pipeline and reports what would actually break in
a game. A model can pass the quick check and still be unable to run the game.

Read the narration it produces as though you were ten years old. If it is flat
or repetitive, that is the model, and the fix is a bigger model or a cloud one —
not more configuration.

You can also compare models from a shell without touching the UI:

```bash
AI_BASE_URL=http://<AI_HOST>:11434/v1 AI_MODEL=hearth-gm npm run gm:harness
```

---

## Cost, if you use a cloud model

If section 4b says the hardware cannot keep up, this is the alternative — and for
a family game it is cheaper than people expect. The settings page already supports
it; nothing needs redeploying.

### What one turn costs

A turn is three calls. The memory pyramid budgets ~3000 tokens of content per
call, and with the system prompt, tone contract and output-format instructions on
top, a turn comes to roughly **10,500 input tokens and 1,100 output tokens**.

| Configuration | Per turn | 20-turn session | Weekly play, per month |
|---|---|---|---|
| Haiku 4.5 throughout | ~$0.016 | ~$0.32 | ~$1.30 |
| Haiku for dice + memory, Sonnet 5 for narration | ~$0.029 | ~$0.58 | ~$2.30 |
| Sonnet 5 throughout | ~$0.048 | ~$0.96 | ~$3.80 |

Prices used: Haiku 4.5 at $1 / $5 per million input / output tokens; Sonnet 5 at
$3 / $15. Sonnet 5 has introductory pricing of $2 / $10 through 31 August 2026,
so it is cheaper than the table until then.

### The split configuration is the one to use

Hearthlight already routes the two jobs separately, which fits this well: the
adjudication and extraction stages need reliable JSON and nothing else, while
narration is the part your daughters actually read.

In `/settings/storyteller`:

| Field | Value |
|---|---|
| Provider | Anthropic (Claude) |
| Address | `https://api.anthropic.com/v1` |
| Model | `claude-haiku-4-5` — the dice and memory stages |
| Narration model | `claude-sonnet-5` — the story text |
| API key | your key from console.anthropic.com |

That is about **60 cents for an evening's play**, with narration written by a
model that clears the Wings of Fire bar comfortably.

### Before the key will save

`SETTINGS_SECRET` must be set in Coolify's environment variables. The app
encrypts API keys at rest and refuses to store one otherwise rather than saving
it in the clear.

```bash
openssl rand -base64 32
```

Add it as `SETTINGS_SECRET`, redeploy once, then paste the key into the settings
page. The key is never sent back to the browser afterwards — the page shows only
a hint like `sk-ant…4f2a`.

### Keeping the local model too

These are not exclusive. Leaving Ollama installed lets you compare: run **Run a
practice turn** against each and read the narration side by side. The local model
costs nothing but time; the cloud one costs a few cents and answers in seconds.
For a weekly family game, the cloud model is very likely the better trade — but
the comparison takes five minutes and settles it with evidence rather than my
estimate.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Could not reach the model server` | Wrong IP, or bound to loopback | Sections 0 and 2 |
| Works from the server, not from the container | `OLLAMA_HOST` still `127.0.0.1`, or firewall | Section 2 |
| Works while you are logged in over RDP, stops afterwards | Windows: Ollama is a tray app, not a service | Windows Server section |
| Models "disappeared" after making it a service | Windows: LocalSystem looks in a different profile | Set `OLLAMA_MODELS` explicitly |
| `hostname -I` says to use the network control panel | You are on Windows, not Linux | Use `ipconfig`; Windows Server section |
| Turns take 5+ minutes and `ollama ps` shows CPU | No GPU — this is the hardware, not the config | Section 4b |
| `404` from `/v1/chat/completions` | Missing `/v1` on the address, or model name not installed | Section 7; `ollama list` |
| `model 'x' not found` | Name mismatch — tags matter | `ollama list`, use the exact name including the tag |
| Practice turn reports JSON failures | Context truncated by a low `num_ctx` | Section 4 |
| Turns take minutes | Running on CPU, or reloading each call | Sections 2 (`KEEP_ALIVE`) and 6 |
| First turn slow, rest fast | Normal — model loading into VRAM | Raise `OLLAMA_KEEP_ALIVE` |
| Timeouts at 120s | Large model on modest hardware | Raise `AI_TIMEOUT_MS`, or use a smaller model |

---

## Useful commands, collected

```bash
ollama list                     # installed models and sizes
ollama ps                       # what is loaded now, and on GPU or CPU
ollama show <model>             # context length, parameters, licence
ollama pull <model>             # download or update
ollama rm <model>               # reclaim disk
journalctl -u ollama -f         # live server log — watch this while testing
sudo ss -ltnp | grep 11434      # what address it is bound to
nvidia-smi                      # GPU memory in use
```

Keeping `journalctl -u ollama -f` open in a second terminal while you press
**Run a practice turn** is the fastest way to see whether requests are arriving
at all, and what Ollama makes of them.
