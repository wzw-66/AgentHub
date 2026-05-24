import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Create default user ──────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: "demo@agenthub.dev" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo@agenthub.dev",
      passwordHash: "$2b$10$placeholder", // Replace with real hash in production
      avatarUrl: null,
    },
  });
  console.log(`  ✓ User: ${user.name} (${user.email})`);

  // ─── Create preset agents ─────────────────────────────────────────────
  const claudeAgent = await prisma.agent.upsert({
    where: { id: "seed-agent-claude" },
    update: {},
    create: {
      id: "seed-agent-claude",
      name: "Claude Assistant",
      provider: "Claude",
      model: "claude-sonnet-4-6",
      systemPrompt: "You are Claude, a helpful AI assistant built by Anthropic.",
      config: { temperature: 0.7, maxTokens: 4096 },
    },
  });
  console.log(`  ✓ Agent: ${claudeAgent.name} (${claudeAgent.provider})`);

  const openCodeAgent = await prisma.agent.upsert({
    where: { id: "seed-agent-opencode" },
    update: {},
    create: {
      id: "seed-agent-opencode",
      name: "OpenCode Coder",
      provider: "OpenCode",
      model: null,
      systemPrompt: "You are an AI coding assistant that generates code via OpenCode CLI.",
      config: null,
    },
  });
  console.log(`  ✓ Agent: ${openCodeAgent.name} (${openCodeAgent.provider})`);

  const customAgent = await prisma.agent.upsert({
    where: { id: "seed-agent-custom" },
    update: {},
    create: {
      id: "seed-agent-custom",
      name: "Custom GPT",
      provider: "Custom",
      model: "gpt-4o",
      systemPrompt: "You are a custom-configured AI assistant.",
      config: { temperature: 0.5, apiEndpoint: "https://api.openai.com/v1" },
    },
  });
  console.log(`  ✓ Agent: ${customAgent.name} (${customAgent.provider})`);

  // ─── Create contacts ──────────────────────────────────────────────────
  const contact1 = await prisma.contact.upsert({
    where: { userId_agentId: { userId: user.id, agentId: claudeAgent.id } },
    update: {},
    create: {
      userId: user.id,
      agentId: claudeAgent.id,
      displayName: "Claude (my assistant)",
      tags: ["favorite", "coding"],
      isPinned: true,
    },
  });
  console.log(`  ✓ Contact: ${contact1.displayName}`);

  // ─── Create example conversations ─────────────────────────────────────
  const conversation = await prisma.conversation.create({
    data: {
      title: "Hello, Claude!",
      type: "Single",
      ownerId: user.id,
      contactIds: [claudeAgent.id],
      lastActiveAt: new Date(),
    },
  });
  console.log(`  ✓ Conversation: ${conversation.title}`);

  const conv2 = await prisma.conversation.create({
    data: {
      title: "Help me debug a React component",
      type: "Single",
      ownerId: user.id,
      contactIds: [claudeAgent.id],
      lastActiveAt: new Date(Date.now() - 3600000), // 1 hour ago
    },
  });
  console.log(`  ✓ Conversation: ${conv2.title}`);

  // ─── Create example messages ──────────────────────────────────────────
  const messages = [
    {
      conversationId: conversation.id,
      senderType: "User" as const,
      senderId: user.id,
      type: "Text" as const,
      content: "Hello! Can you help me with a coding question?",
    },
    {
      conversationId: conversation.id,
      senderType: "Contact" as const,
      senderId: claudeAgent.id,
      type: "Text" as const,
      content:
        "Hi! I'd be happy to help you with your coding question. What are you working on?",
    },
    {
      conversationId: conversation.id,
      senderType: "User" as const,
      senderId: user.id,
      type: "Code" as const,
      content:
        "Here's my React component:\n\n```tsx\nfunction Counter() {\n  const [count, setCount] = useState(0);\n  return <button onClick={() => setCount(count + 1)}>{count}</button>;\n}\n```\n\nWhy doesn't the count update correctly?",
    },
    {
      conversationId: conversation.id,
      senderType: "Contact" as const,
      senderId: claudeAgent.id,
      type: "Text" as const,
      content:
        "Your code looks correct! The issue might be that you forgot to import `useState` from React. Make sure you have:\n\n```tsx\nimport { useState } from 'react';\n```",
    },
    {
      conversationId: conversation.id,
      senderType: "User" as const,
      senderId: user.id,
      type: "Diff" as const,
      content: "That was it! Thanks for the help.",
    },
  ];

  for (const msg of messages) {
    const created = await prisma.message.create({
      data: {
        conversationId: msg.conversationId,
        senderType: msg.senderType,
        senderId: msg.senderId,
        type: msg.type,
        content: msg.content,
      },
    });
    console.log(`  ✓ Message: ${created.id.slice(0, 8)}... (${msg.type})`);
  }

  console.log("\n✅ Seed complete!");
  console.log(`  Users: 1`);
  console.log(`  Agents: 3`);
  console.log(`  Contacts: 1`);
  console.log(`  Conversations: 2`);
  console.log(`  Messages: 5`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
