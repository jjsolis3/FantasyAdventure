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

    if (prompt.includes("Suggest three different things")) {
      content =
        '{"suggestions":["I creep closer and hold out my hand.",' +
        '"I call out to it, loud and friendly.",' +
        '"I look for what frightened it in the first place."]}';
    } else if (prompt.includes("WHAT THE CHARACTERS SAY TO EACH OTHER")) {
      content =
        "The barley shifts while you talk, and whatever is in there goes very still, as though " +
        "it is listening to every word.";
    } else if (prompt.includes("decide which attempts need a dice roll")) {
      // Fenced, with a preamble — exactly what a 7B model tends to emit.
      content =
        `Sure, here you go:\n\`\`\`json\n{"checks":[{"character":"Mira","stat":"${stat}","difficulty":"NORMAL",` +
        '"intent":"Speak with Animals to hum to the frightened creature","practice":"humming"}],' +
        '"automatic":[{"character":"Rowan","effect":"keeps watch"}]}\n```';
    } else if (prompt.includes("extract what should be remembered")) {
      // A story can be ended on purpose. Nothing else makes the mock report
      // actComplete, and the completion path — the ending, and the people who
      // come home from it — is worth an end-to-end test rather than a
      // hand-replayed one.
      const ending = prompt.includes(FINALE);

      content = ending
        ? '{"sceneTitle":"The Last of It","location":"the barley field","memories":[],' +
          '"bondMoments":[],"itemsGained":[],"actComplete":true,"sceneComplete":true}'
        :
        '{"sceneTitle":"The Barley Field","location":"the barley field","memories":' +
        '[{"kind":"NPC","key":"the creature","content":"It settles when someone hums.","importance":4}],' +
        '"bondMoments":[{"from":"Rowan","to":"Mira","why":"stood between her and the noise"}],' +
        '"itemsGained":[{"character":"Mira","name":"a smooth grey stone","description":"warm to the touch"}],' +
        '"whatNow":"The barley is still moving. Do you go in after it?",' +
        '"actComplete":false,"sceneComplete":false,}';
    } else if (prompt.includes('{"whatNow":')) {
      // The opening passage's own question. Asked on its own because the
      // opening runs no extraction to fold it into.
      content = '{"whatNow":"Something is moving in the barley. What do you do?"}';
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
