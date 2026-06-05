import { spawn } from "node:child_process";

const cmd =
  "C:/Program Files/nodejs/nodejs/node_modules/opencode-ai/bin/opencode.exe";
const args = [
  "run",
  "--format",
  "json",
  "-m",
  "anthropic/claude-sonnet-4-6",
  "Say exactly: hello from opencode adapter",
];

console.log("Command:", cmd);
console.log("Args:", args);

const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
proc.stdin.end();

let stdout = "";
let stderr = "";

proc.stdout.on("data", (d) => {
  stdout += d.toString();
  console.log("STDOUT piece:", JSON.stringify(d.toString()));
});

proc.stderr.on("data", (d) => {
  stderr += d.toString();
  console.log("STDERR piece:", JSON.stringify(d.toString()));
});

proc.on("close", (code) => {
  console.log("\n=== RESULT ===");
  console.log("Exit code:", code);
  console.log("Full STDOUT:", JSON.stringify(stdout));
  console.log("Full STDERR:", JSON.stringify(stderr));
});
