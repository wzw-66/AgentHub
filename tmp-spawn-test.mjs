const { spawn } = require("child_process");
const { createInterface } = require("readline");

async function test() {
  const command =
    "C:/Program Files/nodejs/nodejs/node_modules/opencode-ai/bin/opencode.exe";
  const args = ["run", "--format", "json", "Say exactly: hello test"];

  console.log("Spawning:", command, args.join(" "));
  const proc = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
  proc.stdin.end();

  proc.stderr.on("data", (d) => console.log("STDERR:", d.toString()));

  const rl = createInterface({ input: proc.stdout });
  let count = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    count++;
    try {
      const parsed = JSON.parse(line);
      console.log(
        "LINE",
        count,
        ":",
        parsed.type,
        parsed.type === "text" ? parsed.part?.text?.slice(0, 50) : "",
      );
    } catch {
      console.log("LINE", count, "(raw):", line.slice(0, 100));
    }
  }

  const code = await new Promise((r) => proc.on("close", r));
  console.log("Exit code:", code);
}

test().catch(console.error);
