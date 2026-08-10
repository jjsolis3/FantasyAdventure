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

/** Set MOCK_UNSAFE=1 to make the first narration trip the safety guard. */
const unsafeFirst = process.env.MOCK_UNSAFE === "1";
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
        'Sure, here you go:\n```json\n{"checks":[{"character":"Mira","stat":"heart","difficulty":"NORMAL",' +
        '"intent":"Speak with Animals to hum to the frightened creature"}],"automatic":[{"character":"Rowan","effect":"keeps watch"}]}\n```';
    } else if (prompt.includes("extract what should be remembered")) {
      // Trailing comma, and a bond moment naming someone real.
      content =
        '{"sceneTitle":"The Barley Field","location":"the barley field","memories":' +
        '[{"kind":"NPC","key":"the creature","content":"It settles when someone hums.","importance":4}],' +
        '"bondMoments":[{"from":"Rowan","to":"Mira","why":"stood between her and the noise"}],' +
        '"itemsGained":[{"character":"Mira","name":"a smooth grey stone","description":"warm to the touch"}],' +
        '"actComplete":false,"sceneComplete":false,}';
    } else if (prompt.includes("Summarise this scene")) {
      content = '{"summary":"The family met something frightened in the barley and calmed it."}';
    } else if (prompt.includes("This is the very first scene")) {
      content =
        "The barley is flattened in a wide circle, and something in the middle of it is breathing " +
        "very fast. Mira, you can see one bright eye watching you through the stalks. Rowan, the " +
        "gate behind you swings gently, as though someone came through in a hurry.";
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
