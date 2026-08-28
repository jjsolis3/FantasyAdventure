/**
 * A stand-in for Ollama, used by the play E2E test.
 *
 * Deliberately imitates small-model habits — markdown fences round JSON,
 * trailing commas, chatty preambles — so the tests exercise the forgiving
 * extraction path rather than an idealised one.
 *
 *   npx tsx tests/mock-model-server.mts [port]
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 11499);

/**
 * How a test asks for the story to end.
 *
 * A player types END_MARKER, which reaches the narration prompt; the mock then
 * writes a passage containing FINALE, which reaches the extraction prompt and
 * makes it report actComplete. That round trip is deliberate — it drives the
 * real ending path through the real pipeline rather than reaching into the
 * database to fake a finished adventure.
 */
const END_MARKER = "bring the story to its end";
const FINALE = "And that was the end of it.";

/** Set MOCK_UNSAFE=1 to make the first narration trip the safety guard. */
const unsafeFirst = process.env.MOCK_UNSAFE === "1";

/**
 * Which stat the adjudicator asks for. Heart unless told otherwise.
 *
 * Overridable because a check is the only way into the dice, and three of the
 * seven stats had never been through them: the party block feeding the pipeline
 * was written by hand with four keys, so a Grace check reached `statModifier`
 * as `undefined` and every roll came out NaN. Nothing caught it, because
 * nothing had ever asked this mock for a Grace check.
 */
const stat = process.env.MOCK_STAT ?? "heart";

/**
 * Set MOCK_IDLE=1 to play a table going in circles.
 *
 * Nobody rolls anything, nothing is found, no objective finishes, and the
 * storyteller says outright that the party got nowhere — which is the exact
 * shape the act clock is looking for. Without a way to produce it on demand,
 * the only way to test the clock end to end would be to feed a real model
 * nonsense and hope.
 */
const idle = process.env.MOCK_IDLE === "1";

/**
 * Set MOCK_ENCOUNTER=1 to have the first passage put something in front of them.
 *
 * Opened once and only once — an encounter is a scene-sized event, and a mock
 * that opened one every turn would be testing a corridor of obstacles rather
 * than the thing the game actually does.
 */
const encounter = process.env.MOCK_ENCOUNTER === "1";
let encountersOpened = 0;
let narrationCount = 0;

/**
 * The smallest real PNG: one transparent pixel.
 *
 * Enough to prove the whole path — request, bytes, storage, and serving them
 * back with the right content type — without pretending to draw anything.
 */
const PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const server = createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => (raw += chunk));
  request.on("end", () => {
    // The drawing endpoint. A model named "…cannot-draw" refuses, so the
    // "pictures failed and the story carried on regardless" path can be tested.
    if (request.url?.includes("/images/generations")) {
      const asked = JSON.parse(raw || "{}") as { model?: string; prompt?: string };

      if ((asked.model ?? "").includes("cannot-draw")) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "no such model" } }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ b64_json: PIXEL_PNG }] }));
      return;
    }

    const body = JSON.parse(raw || "{}") as {
      messages?: { content: string }[];
      model?: string;
      reasoning_effort?: string;
    };
    const prompt = (body.messages ?? []).map((message) => message.content).join("\n");

    // Any model named "…cannot-load" fails the way Ollama does when a blob is
    // missing, corrupt, or unreadable: a 500 from a server that is otherwise
    // perfectly reachable. This is how the settings test proves it checks
    // every configured model rather than only the first.
    if ((body.model ?? "").includes("cannot-load")) {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          error: {
            message: `unable to load model: /models/blobs/sha256-${"0".repeat(12)}`,
            type: "api_error",
          },
        }),
      );
      return;
    }

    // A model named "…thinks-forever" behaves like Qwen3 under Ollama with
    // thinking left on: it spends the whole output budget reasoning and returns
    // an empty answer, unless the request asks it not to think.
    if ((body.model ?? "").includes("thinks-forever") && body.reasoning_effort !== "none") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          choices: [
            {
              index: 0,
              finish_reason: "length",
              message: {
                role: "assistant",
                content: "",
                reasoning: "Okay, the user wants me to reply with one word. Let me consider…",
              },
            },
          ],
        }),
      );
      return;
    }

    let content: string;

    if (prompt.includes("Give them three nudges")) {
      // Nudges, not actions. These used to be first-person sentences a child
      // could tap straight into the box, which turned the button into the
      // fastest route through the game.
      content =
        '{"suggestions":["The barley is moving against the wind, not with it.",' +
        '"Nobody has asked Rowan what he heard from the gate.",' +
        '"The blackthorn in the hedge is broken outward, not inward."]}';
    } else if (prompt.includes("WHAT THE CHARACTERS SAY TO EACH OTHER")) {
      content =
        "The barley shifts while you talk, and whatever is in there goes very still, as though " +
        "it is listening to every word.";
    } else if (prompt.includes("decide which attempts need a dice roll")) {
      content = idle
        ? '{"checks":[],"automatic":[{"character":"Mira","effect":"wanders about humming"},' +
          '{"character":"Rowan","effect":"kicks a stone"}],"together":[]}'
        : // Fenced, with a preamble — exactly what a 7B model tends to emit.
          `Sure, here you go:\n\`\`\`json\n{"checks":[{"character":"Mira","stat":"${stat}","difficulty":"NORMAL",` +
          '"intent":"Speak with Animals to hum to the frightened creature","practice":"humming"}],' +
          '"automatic":[{"character":"Rowan","effect":"keeps watch"}],' +
          '"together":[{"characters":["Mira","Rowan"],"plan":"one hums while the other keeps watch"}]}\n```';
    } else if (prompt.includes("Who actually listened to whom")) {
      // Two of them, so the listening bond has a real pair to land on.
      content =
        '{"listened":[{"who":"Rowan","to":"Mira","why":"took up her idea about the humming"}]}';
    } else if (prompt.includes("extract what should be remembered")) {
      // A story can be ended on purpose. Nothing else makes the mock report
      // actComplete, and the completion path — the ending, and the people who
      // come home from it — is worth an end-to-end test rather than a
      // hand-replayed one.
      const ending = prompt.includes(FINALE);

      // A storyteller reporting that one of the listed things has happened,
      // which since the Woody fix may be a FIND as well as a DEED. Echoes the
      // first line back — exactly what a real model does when the passage shows
      // the wooden owl riding on somebody's shoulder.
      const ticking = process.env.MOCK_TICK === "1";
      const listed = ticking
        ? (prompt.match(/WHAT THE PARTY IS STILL TRYING TO DO OR GET HOLD OF:\n- ([^\n]+)/)?.[1] ?? "")
        : "";
      const deeds = listed ? JSON.stringify([listed]) : "[]";

      // A storyteller brushing against somebody's long wish, and doing it on
      // every single turn it is given the chance — which is exactly what a real
      // small model does when handed "mention this occasionally", and the
      // reason the cooldown is enforced by the server rather than by asking
      // nicely. The name is read back out of the prompt, so an echo only
      // appears for a dream the context actually offered.
      const wishing = process.env.MOCK_DREAM === "1";
      const dreamer = wishing
        ? (prompt.match(/WHAT THEY HAVE ALWAYS WANTED[\s\S]*?\n- ([^:]+):/)?.[1] ?? "")
        : "";
      const echoes = dreamer
        ? `"dreamEchoes":[{"character":${JSON.stringify(dreamer)},` +
          '"note":"A pedlar mentions a basket left at a door, years ago."}],'
        : "";

      content = idle
        ? '{"sceneTitle":null,"location":null,"memories":[],"bondMoments":[],"itemsGained":[],' +
          '"deedsDone":[],"questsOpened":[],"whatNow":"You are still standing in the barley. Now what?",' +
          '"movedForward":false,"actComplete":false,"sceneComplete":false}'
        : ending
        ? '{"sceneTitle":"The Last of It","location":"the barley field","memories":[],' +
          '"bondMoments":[],"itemsGained":[],' +
          // Two genuinely different ways on, offered exactly where a chapter
          // turns. MOCK_SAMEWAY makes them the same place worded twice — the
          // failure a real small model produces when asked for variety at the
          // moment it has least to go on, and the one `optionsUsable` throws
          // away rather than putting a meaningless choice in front of a child.
          (process.env.MOCK_SAMEWAY === "1"
            ? '"waysOn":[{"where":"the mill","why":"the wheel is still turning"},' +
              '{"where":"The Mill","why":"somebody is up there"}],'
            : '"waysOn":[{"where":"the drowned mill","why":"the wheel is still turning with nobody there"},' +
              '{"where":"the bell-ringer\'s cottage","why":"she kept the old charts"}],') +
          '"actComplete":true,"sceneComplete":true}'
        :
        '{"sceneTitle":"The Barley Field","location":"the barley field","memories":' +
        '[{"kind":"NPC","key":"the creature","content":"It settles when someone hums.","importance":4}],' +
        '"bondMoments":[{"from":"Rowan","to":"Mira","why":"stood between her and the noise"}],' +
        '"itemsGained":[{"character":"Mira","name":"a smooth grey stone","description":"warm to the touch"}],' +
        '"whatNow":"The barley is still moving. Do you go in after it?",' +
        // Three things the passage put within reach — and one of them written
        // as advice on purpose, because a 7B model does that however plainly
        // the prompt forbids it, and the trimming in `cleanTable` is meant to
        // catch it before it reaches a child.
        '"onTheTable":["the flattened track through the barley",' +
        '"You could try the gap in the hedge","Rowan, still holding the lamp"],' +
        // Somewhere worth going next. Repeated every turn on purpose: the
        // storyteller is told to keep a live lead on the list, so the reader
        // has to be the thing that de-duplicates it.
        '"leads":["the bell-ringer keeps the old charts"],' +
        `"deedsDone":${deeds},` +
        echoes +
        (encounter && encountersOpened++ === 0
          ? '"encounterOpened":{"name":"The Angry Customer","want":"to be taken seriously",' +
            '"kind":"PERSON","nerve":"TENSE","works":["admitting it","asking what happened"],' +
            '"backfires":["a clever lie"],' +
            '"wayOut":"leave, and accept that he tells the baker"},'
          : "") +
        '"actComplete":false,"sceneComplete":false,}';
    } else if (prompt.includes('{"whatNow":')) {
      // The opening passage's own question. Asked on its own because the
      // opening runs no extraction to fold it into.
      content =
        '{"whatNow":"Something is moving in the barley. What do you do?",' +
        '"onTheTable":["the barley, moving against the wind","the lamp Rowan is carrying"]}';
    } else if (prompt.includes("aim of their own")) {
      // One per character, echoed back from the names in the request, so the
      // test exercises the real matching rather than a hard-coded party.
      //
      // Read from the party block specifically. The context above it is full of
      // bulleted lines too — act beats, things to find — and a regex loose
      // enough to catch those hands back aims addressed to "She can breathe
      // fire but flinches when she does".
      const block = prompt.split("aim of their own for this chapter:")[1] ?? "";
      const named = [...block.split("\n\nReply with")[0].matchAll(/^- (.+?), /gm)].map(
        (match) => match[1],
      );
      content = JSON.stringify({
        aims: named.map((name) => ({
          character: name,
          title: `${name}'s own errand`,
          summary: `See if you can manage something only you would think of, ${name}.`,
          objective: { kind: "DEED", text: `${name} does the thing only she would do` },
        })),
      });
    } else if (prompt.includes("Summarise this scene")) {
      content = '{"summary":"The family met something frightened in the barley and calmed it."}';
    } else if (prompt.includes("This is the very first scene")) {
      content =
        "The barley is flattened in a wide circle, and something in the middle of it is breathing " +
        "very fast. Mira, you can see one bright eye watching you through the stalks. Rowan, the " +
        "gate behind you swings gently, as though someone came through in a hurry.";
    } else if (prompt.includes(END_MARKER)) {
      // The table asked for an ending, so the passage reads like one — and
      // carries the phrase the extraction step keys on.
      content =
        `${FINALE} The barley settles, the light goes down kindly, and everybody ` +
        "walks home together knowing it is finished.";
    } else {
      narrationCount += 1;
      content =
        unsafeFirst && narrationCount === 1
          ? "The creature dies right there in the barley."
          : "Mira hums, low and steady, and the shaking slows. Rowan sets himself between the " +
            "sound and his sister, and the thing in the barley lifts its head to listen.";
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock model server listening on ${port}`);
});
