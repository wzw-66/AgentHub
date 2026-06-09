/**
 * 实验脚本：验证 Claude Code CLI 在去掉 --dangerously-skip-permissions 后的交互行为
 *
 * 测试内容：
 * 1. Claude 在需要执行命令时输出什么事件？
 * 2. AskUserQuestion 的输出格式是什么？
 * 3. stdin 是否需要特定格式的回复？
 * 4. stdout 和 stderr 分别输出了什么？
 *
 * 用法：
 *   node scripts/claude-interactive-test.mjs
 *   node scripts/claude-interactive-test.mjs --resume  # 用 session id 恢复
 *
 * 环境变量：
 *   CLAUDE_TEST_PROMPT  - 自定义测试 prompt（可选）
 *   CLAUDE_SESSION_ID   - 恢复已有 session（可选）
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, accessSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 配置 ──────────────────────────────────────────────────────────────

const TEST_PROMPT =
  process.env.CLAUDE_TEST_PROMPT ||
  `请帮我完成以下任务：

1. 读取当前目录下的 package.json 文件（使用 Bash: cat package.json）
2. 告诉我里面有多少行
3. 然后问我一个问题：你想让我继续分析其他文件吗？给我 Yes/No 两个选项

注意：在执行命令前，请先询问我是否允许。`;

const SESSION_ID = process.env.CLAUDE_SESSION_ID;

// ─── 颜色 ──────────────────────────────────────────────────────────────

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

function tag(label, color) {
  return `${color}[${label}]${colors.reset}`;
}

// ─── 解析 Windows .cmd 包装 ───────────────────────────────────────────

function resolveGitBashPath() {
  if (process.platform !== "win32") return undefined;
  if (process.env.CLAUDE_CODE_GIT_BASH_PATH) return process.env.CLAUDE_CODE_GIT_BASH_PATH;
  const pathDirs = (process.env.PATH || "").split(";");
  for (const dir of pathDirs) {
    try {
      const candidate = resolve(dir.trim(), "bash.exe");
      accessSync(candidate);
      return candidate;
    } catch { /* continue */ }
  }
  // Check common Git installation paths on all drives
  const drives = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const drive of drives) {
    for (const p of [`${drive}:\\Program Files\\Git\\bin\\bash.exe`, `${drive}:\\Program Files (x86)\\Git\\bin\\bash.exe`]) {
      try { accessSync(p); return p; } catch { /* continue */ }
    }
  }
  return undefined;
}

function resolveWindowsCommand(name) {
  if (process.platform !== "win32") return { command: name, prefixArgs: [] };
  const pathDirs = (process.env.PATH || "").split(";");
  const extensions = [".cmd", ".bat", ".exe"];
  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = resolve(dir.trim(), name + ext);
      try { accessSync(fullPath); return parseCmdEntry(fullPath); }
      catch { /* continue */ }
    }
  }
  return { command: name, prefixArgs: [] };
}
function parseCmdEntry(cmdPath) {
  const dir = dirname(cmdPath);
  const content = readFileSync(cmdPath, "utf8").replace(/%dp0%/gi, dir + "\\").replace(/%_prog%/g, process.execPath);
  const lines = content.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const matches = [...lines[i].matchAll(/"([^"]+\.(?:js|exe))"/g)];
    if (matches.length === 0) continue;
    const target = resolve(matches[matches.length - 1][1].replace(/\\\\/g, "\\"));
    if (target.endsWith(".js")) return { command: process.execPath, prefixArgs: [target] };
    return { command: target, prefixArgs: [] };
  }
  return { command: cmdPath, prefixArgs: [] };
}

// ─── 主逻辑 ────────────────────────────────────────────────────────────

async function main() {
  const { command: claudeBin, prefixArgs } = resolveWindowsCommand("claude");
  const args = [...prefixArgs,
    "-p",
    TEST_PROMPT,
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--max-turns",
    "25",
  ];

  if (SESSION_ID) {
    args.push("--resume", SESSION_ID);
  }

  // 注意：故意不传 --dangerously-skip-permissions

  console.log(`\n${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║     Claude Code 交互协议实验                            ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚══════════════════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`${colors.dim}Prompt:${colors.reset} ${TEST_PROMPT.slice(0, 120)}...\n`);

  console.log(`${colors.dim}Binary:${colors.reset} ${claudeBin} ${colors.dim}Args:${colors.reset} ${args.join(" ")}\n`);

  const bashPath = resolveGitBashPath();
  const env = { ...process.env };
  if (bashPath) {
    env["CLAUDE_CODE_GIT_BASH_PATH"] = bashPath;
    const bashDir = dirname(bashPath);
    if (!env["PATH"].split(";").some((p) => p.toLowerCase() === bashDir.toLowerCase())) {
      env["PATH"] = `${bashDir};${env["PATH"] || ""}`;
    }
    console.log(`${colors.dim}Git Bash:${colors.reset} ${bashPath}\n`);
  }

  const proc = spawn(claudeBin, args, {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: process.cwd(),
    env,
    windowsHide: true,
  });

  // ─── 记录 stderr ──────────────────────────────────────────────────

  const stderrLines = [];
  const stderrRI = createInterface({ input: proc.stderr });
  stderrRI.on("line", (line) => {
    stderrLines.push(line);
    process.stderr.write(`${tag("STDERR", colors.yellow)} ${line}\n`);
  });

  // ─── 解析 stdout ──────────────────────────────────────────────────

  let lineCount = 0;
  let toolUseCount = 0;
  let sessionId = null;
  let pendingToolUse = null; // { id, name, input, resolve }

  const stdoutRI = createInterface({ input: proc.stdout });

  // 读取一行 -> 解析并处理
  for await (const line of stdoutRI) {
    if (!line.trim()) continue;
    lineCount++;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.log(`${tag("RAW", colors.dim)} ${line.slice(0, 200)}`);
      continue;
    }

    // ── 格式化输出事件 ──────────────────────────────────────────────

    switch (parsed.type) {
      case "system": {
        if (parsed.subtype === "init") {
          sessionId = parsed.session_id;
          const model = parsed.model ?? "unknown";
          const tools = parsed.tools?.length ?? 0;
          console.log(`${tag("INIT", colors.green)} session=${colors.bold}${sessionId?.slice(0, 8)}${colors.reset} model=${model} tools=${tools}`);
          if (tools > 0) {
            const toolNames = parsed.tools.map((t) => t.name || t).join(", ");
            console.log(`  ${colors.dim}tools: ${toolNames}${colors.reset}`);
          }
        }
        break;
      }

      case "assistant": {
        const content = parsed.message?.content ?? [];
        const role = parsed.message?.role ?? "";

        for (const block of content) {
          switch (block.type) {
            case "text": {
              const text = block.text ?? "";
              if (text.length > 0) {
                console.log(`${tag("TEXT", colors.blue)} ${colors.dim}(${text.length} chars)${colors.reset}`);
                // 打印前 300 字符
                console.log(`  ${text.slice(0, 300).replace(/\n/g, "\n  ")}`);
                if (text.length > 300) {
                  console.log(`  ${colors.dim}... (${text.length - 300} more chars)${colors.reset}`);
                }
              }
              break;
            }
            case "thinking": {
              const think = block.thinking ?? block.text ?? "";
              if (think.length > 0) {
                console.log(`${tag("THINK", colors.magenta)} ${colors.dim}(${think.length} chars)${colors.reset}`);
              }
              break;
            }
            case "tool_use": {
              toolUseCount++;
              const toolName = block.name ?? "unknown";
              const toolId = block.id ?? "no-id";
              const input = block.input ?? {};
              const inputStr = JSON.stringify(input, null, 2);

              console.log(`${tag(`TOOL_USE#${toolUseCount}`, colors.cyan)} ${colors.bold}${toolName}${colors.reset} id=${toolId.slice(0, 20)}`);
              console.log(`  ${colors.dim}Input:${colors.reset}\n${inputStr.split("\n").map(l => `  ${l}`).join("\n")}`);

              // ── 自动回复策略 ──────────────────────────────────────
              if (!pendingToolUse) {
                pendingToolUse = { id: toolId, name: toolName, input };
                await handleToolUse(proc, toolId, toolName, input);
                pendingToolUse = null;
              }
              break;
            }
            default: {
              console.log(`${tag("BLOCK", colors.dim)} type=${block.type}`);
              break;
            }
          }
        }
        break;
      }

      case "user": {
        const contentBlocks = parsed.message?.content ?? [];
        for (const block of contentBlocks) {
          if (block.type === "tool_result") {
            console.log(`${tag("TOOL_RESULT", colors.yellow)} tool_use_id=${block.tool_use_id?.slice(0, 20) ?? "?"} is_error=${block.is_error ?? false}`);
          }
        }
        break;
      }

      case "result": {
        const resultInfo = {
          subtype: parsed.subtype,
          cost: parsed.total_cost_usd,
          turns: parsed.num_turns,
          duration: parsed.duration_ms,
          session_id: parsed.session_id,
          is_error: parsed.is_error,
        };
        console.log(`${tag("RESULT", colors.green)} ${JSON.stringify(resultInfo, null, 2).split("\n").map(l => `  ${l}`).join("\n")}`);
        break;
      }

      case "message_delta": {
        // 通常忽略，或只记录引用信息
        break;
      }

      case "progress":
      case "rate_limit_event": {
        // 忽略进度/限流事件
        break;
      }

      default: {
        console.log(`${tag("EVENT", colors.dim)} type=${parsed.type}${parsed.subtype ? ` subtype=${parsed.subtype}` : ""}`);
        break;
      }
    }
  }

  // ─── 进程退出 ────────────────────────────────────────────────────

  const exitCode = await new Promise((resolve) => proc.on("close", resolve));

  console.log(`\n${colors.bold}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}实验结果:${colors.reset}`);
  console.log(`  ${tag("LINES", colors.green)}  ${lineCount} 行 stdout`);
  console.log(`  ${tag("TOOLS", colors.cyan)}  ${toolUseCount} 个 tool_use`);
  console.log(`  ${tag("EXIT", colors.green)}  退出码 ${exitCode}`);
  console.log(`  ${tag("STDERR", colors.yellow)} ${stderrLines.length} 行 stderr`);
  if (sessionId) {
    console.log(`\n  恢复命令: node scripts/claude-interactive-test.mjs --resume ${sessionId}`);
  }
  console.log();
}

// ─── 交互处理 ──────────────────────────────────────────────────────────

async function handleToolUse(proc, toolId, toolName, input) {
  // AskUserQuestion → 模拟用户选择第一个选项
  if (toolName === "AskUserQuestion") {
    const questions = input?.questions ?? [];
    if (questions.length === 0) {
      console.log(`  ${tag("AUTO", colors.yellow)} AskUserQuestion 但没有问题数组，回复默认`);
      const response = JSON.stringify({
        type: "tool_result",
        tool_use_id: toolId,
        content: { response: "Yes, please continue" },
      }) + "\n";
      proc.stdin.write(response);
      console.log(`  ${tag("STDIN", colors.green)} ${colors.dim}Sent: tool_result (default reply)${colors.reset}`);
      return;
    }

    // 为简化：自动选择第一个选项
    const answers = {};
    for (const q of questions) {
      if (q.options && q.options.length > 0) {
        answers[q.question] = q.options[0].label;
        console.log(`  ${tag("AUTO", colors.yellow)} 问题 "${q.question}" → 自动选择 "${q.options[0].label}"`);
      } else {
        answers[q.question] = "Yes";
        console.log(`  ${tag("AUTO", colors.yellow)} 问题 "${q.question}" → 自动回复 "Yes"`);
      }
    }

    const response = JSON.stringify({
      type: "tool_result",
      tool_use_id: toolId,
      content: { questions, answers },
    }) + "\n";

    proc.stdin.write(response);
    console.log(`  ${tag("STDIN", colors.green)} ${colors.dim}Sent: tool_result (answers)${colors.reset}`);
    return;
  }

  // Bash/Write/Read 等 → 自动批准
  if (["Bash", "Write", "Read", "Edit", "execute_command", "write_file", "read_file"].includes(toolName)) {
    const response = JSON.stringify({
      type: "approve",
      tool_use_id: toolId,
    }) + "\n";

    proc.stdin.write(response);
    console.log(`  ${tag("STDIN", colors.green)} ${colors.dim}Sent: approve${colors.reset}`);
    return;
  }

  // 未知工具 → 自动批准
  console.log(`  ${tag("AUTO", colors.yellow)} 未知工具 ${toolName}，自动批准`);
  const response = JSON.stringify({
    type: "approve",
    tool_use_id: toolId,
  }) + "\n";
  proc.stdin.write(response);
  console.log(`  ${tag("STDIN", colors.green)} ${colors.dim}Sent: approve${colors.reset}`);
}

// ─── 启动 ──────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`${tag("FATAL", colors.red)} ${err.message}`);
  process.exit(1);
});
