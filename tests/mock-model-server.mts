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

const server = createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => (raw += chunk));
  request.on("end", () => {
    const body = JSON.parse(raw || "{}") as { messages?: { content: string }[] };
    const prompt = (body.messages ?? []).map((message) => message.content).join("\n");

    let content: string;

    if (prompt.includes("decide which attempts need a dice roll")) {
      // Fenced, with a preamble — exactly what a 7B model tends to emit.
      content =
        'Sure, here you go:\n```json\n{"checks":[{"character":"Mira","stat":"heart","difficulty":"NORMAL",' +
        '"intent":"hum to the frightened creature"}],"automatic":[{"character":"Rowan","effect":"keeps watch"}]}\n```';
    } else if (prompt.includes("extract what should be remembered")) {
      // Trailing comma, and a bond moment naming someone real.
      content =
        '{"sceneTitle":"The Barley Field","location":"the barley field","memories":' +
        '[{"kind":"NPC","key":"the creature","content":"It settles when someone hums.","importance":4}],' +
        '"bondMoments":[{"from":"Rowan","to":"Mira","why":"stood between her and the noise"}],' +
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
