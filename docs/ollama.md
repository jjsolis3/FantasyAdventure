# Setting up Ollama for Hearthlight

Everything here is run **on the Ubuntu server where Ollama lives**, over SSH,
unless a step says otherwise. Work through it in order — each section assumes
the one before it passed.

If you only read one section, read [Context window](#4-context-window--the-one-that-actually-bites).
It is the setting most likely to make the game misbehave in a way that looks
like a bad model rather than a bad configuration.

---

## 0. First: what is your server's real IP address?

`http://192.168.1.50:11434/v1` is the **example value** shipped in
`.env.example`. If that address is what the settings page shows, confirm it is
genuinely your server before debugging anything else — a wrong IP produces
exactly the "could not reach the model server" error, and no amount of Ollama
tuning fixes it.

```bash
hostname -I
```

The first address on that line is normally the LAN address. Use it everywhere
below in place of `<SERVER_IP>`.

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

> **Do not port-forward 11434 through your router.** Ollama has no
> authentication of any kind. Anyone who finds the port gets unrestricted use of
> your GPU and can read every model you have pulled. Only the Hearthlight web
> app needs a public address. If the AI ever moves to a different machine,
> connect them with [Tailscale](https://tailscale.com) rather than a
> port-forward.

---

## 3. Test the exact path the app uses

Hearthlight talks to the **OpenAI-compatible** API under `/v1`, not Ollama's
native `/api` routes. It is possible for `/api/tags` to work while `/v1` does
not, so test the one that matters.

### From another machine on the LAN

```bash
# Native API — confirms reachability and lists installed models
curl http://<SERVER_IP>:11434/api/tags

# The OpenAI-compatible path the app actually calls
curl http://<SERVER_IP>:11434/v1/models

# A real completion through that path
curl http://<SERVER_IP>:11434/v1/chat/completions \
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
node -e "fetch('http://<SERVER_IP>:11434/v1/models').then(r=>r.text()).then(console.log).catch(e=>console.log('FAIL',e.message))"
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
| Address | `http://<SERVER_IP>:11434/v1` — note the `/v1` |
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
AI_BASE_URL=http://<SERVER_IP>:11434/v1 AI_MODEL=hearth-gm npm run gm:harness
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Could not reach the model server` | Wrong IP, or bound to loopback | Sections 0 and 2 |
| Works from the server, not from the container | `OLLAMA_HOST` still `127.0.0.1`, or firewall | Section 2 |
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
