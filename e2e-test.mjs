/**
 * End-to-end test for agent execution fixes.
 *
 * Tests:
 * 1. Login with demo account
 * 2. Create a conversation with Claude agent
 * 3. Send a message requesting a simple HTML file
 * 4. Wait for agent response via SSE
 * 5. Validate output: no duplicates, no "Unknown tool" errors
 */

const API = "http://localhost:3001";

async function main() {
  console.log("=".repeat(60));
  console.log("🧪 AgentHub E2E Test");
  console.log("=".repeat(60));
  console.log();

  // ─── Step 1: Login ──────────────────────────────────────────────────
  console.log("1️⃣  Login with demo account...");
  const loginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@agenthub.dev", password: "demo123456" }),
  });
  if (!loginRes.ok) {
    const err = await loginRes.text();
    console.error(`❌ Login failed: ${err}`);
    process.exit(1);
  }
  const { accessToken, user } = await loginRes.json();
  console.log(`   ✅ Logged in as ${user.email} (userId: ${user.id})`);
  console.log();

  // ─── Step 2: Find or create a single conversation ────────────────────
  console.log("2️⃣  Finding agents...");
  const agentsRes = await fetch(`${API}/api/contacts/list`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const agents = await agentsRes.json();
  const claude = agents.find((a) => a.provider === "Claude");
  if (!claude) {
    console.error("❌ Claude agent not found in contacts");
    process.exit(1);
  }
  console.log(`   ✅ Found agent: ${claude.name} (${claude.id})`);

  // Create new single conversation
  console.log("3️⃣  Creating conversation...");
  const convRes = await fetch(`${API}/api/conversations/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      title: "Test: write an HTML file",
      type: "single",
      contactIds: [claude.id],
    }),
  });
  if (!convRes.ok) {
    const err = await convRes.text();
    console.error(`❌ Create conversation failed: ${err}`);
    process.exit(1);
  }
  const conv = await convRes.json();
  console.log(`   ✅ Conversation created: ${conv.id}`);
  console.log();

  // ─── Step 4: Send a test message ─────────────────────────────────────
  console.log("4️⃣  Sending test message (requesting an HTML file)...");
  const msgRes = await fetch(
    `${API}/api/conversations/${conv.id}/messages/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        content: "请帮我写一个简单的自我介绍 HTML 页面，包含名字、技能和联系方式",
      }),
    },
  );
  if (!msgRes.ok) {
    const err = await msgRes.text();
    console.error(`❌ Send message failed: ${err}`);
    process.exit(1);
  }
  const msg = await msgRes.json();
  console.log(`   ✅ Message sent: ${msg.id}`);
  console.log();

  // ─── Step 5: Listen for SSE events ──────────────────────────────────
  console.log("5️⃣  Waiting for agent response via SSE...");
  console.log("   (timeout: 120 seconds)");
  console.log();

  // Connect SSE to this specific conversation
  const sseUrl = `${API}/sse/conversations/${conv.id}/stream?token=${encodeURIComponent(accessToken)}`;
  console.log(`   SSE URL: ${sseUrl}`);
  const response = await fetch(sseUrl);
  if (!response.ok || !response.body) {
    console.error("❌ SSE connection failed");
    process.exit(1);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let agentResponse = "";
  let errors = [];
  let toolCalls = [];
  let done = false;
  const startTime = Date.now();
  const TIMEOUT = 120_000;

  while (!done && Date.now() - startTime < TIMEOUT) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data || !currentEvent) continue;

        try {
          const payload = JSON.parse(data);

          switch (currentEvent) {
            case "chunk": {
              if (payload.content) {
                agentResponse += payload.content;
                process.stdout.write(".");
              }
              break;
            }
            case "tool_status": {
              toolCalls.push(payload.toolName || "unknown");
              process.stdout.write("🔧");
              break;
            }
            case "error": {
              errors.push(payload.message || "Unknown error");
              process.stdout.write("❌");
              break;
            }
            case "done": {
              done = true;
              process.stdout.write("✅");
              break;
            }
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  }

  reader.releaseLock();
  console.log("\n\n");

  // ─── Step 6: Validate results ─────────────────────────────────────
  console.log("=".repeat(60));
  console.log("📊 Test Results");
  console.log("=".repeat(60));
  console.log();

  // Check 1: No "Unknown tool" errors
  const unknownToolErrors = errors.filter((e) => e.includes("Unknown tool"));
  if (unknownToolErrors.length > 0) {
    console.log(`❌ [FAIL] Found ${unknownToolErrors.length} Unknown tool errors:`);
    unknownToolErrors.forEach((e) => console.log(`       ${e}`));
  } else {
    console.log(`✅ [PASS] No Unknown tool errors`);
  }
  console.log();

  // Check 2: No other errors
  const otherErrors = errors.filter((e) => !e.includes("Unknown tool"));
  if (otherErrors.length > 0) {
    console.log(`⚠️  [INFO] ${otherErrors.length} other errors found (non-critical)`);
    otherErrors.forEach((e) => console.log(`       ${e}`));
  } else {
    console.log(`✅ [PASS] No execution errors`);
  }
  console.log();

  // Check 3: Response has no duplicated paragraphs
  const paragraphs = agentResponse.split(/\n{2,}/).filter(Boolean);
  let duplicateCount = 0;
  for (let i = 1; i < paragraphs.length; i++) {
    if (paragraphs[i].trim() === paragraphs[i - 1].trim()) {
      duplicateCount++;
    }
  }
  if (duplicateCount > 0) {
    console.log(`❌ [FAIL] Found ${duplicateCount} consecutive duplicate paragraphs`);
    console.log(`       Tip: The persistence dedup filter should have caught these`);
  } else {
    console.log(`✅ [PASS] No consecutive duplicate paragraphs`);
  }
  console.log();

  // Check 4: Agent produced meaningful output
  if (agentResponse.length > 50) {
    console.log(`✅ [PASS] Agent response is meaningful (${agentResponse.length} chars)`);
  } else {
    console.log(`❌ [FAIL] Agent response too short: "${agentResponse}"`);
  }
  console.log();

  // Check 5: Tool calls were tracked
  if (toolCalls.length > 0) {
    const uniqueTools = [...new Set(toolCalls)];
    console.log(`✅ [PASS] ${toolCalls.length} tool calls tracked: ${uniqueTools.join(", ")}`);
  } else {
    console.log(`⚠️  [INFO] No tool calls were made`);
  }
  console.log();

  // ─── Summary ──────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed = unknownToolErrors.length === 0 && duplicateCount === 0 && agentResponse.length > 50;

  console.log("=".repeat(60));
  console.log(passed ? "🎉 ALL TESTS PASSED" : "❌ SOME TESTS FAILED");
  console.log(`   Duration: ${elapsed}s`);
  console.log(`   Response length: ${agentResponse.length} chars`);
  console.log(`   Tool calls: ${toolCalls.length}`);
  console.log(`   Errors: ${errors.length}`);
  console.log();

  if (agentResponse) {
    console.log("📝 Agent response preview:");
    console.log(agentResponse.slice(0, 500));
    console.log(agentResponse.length > 500 ? "..." : "");
  }

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
