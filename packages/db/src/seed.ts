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
      passwordHash: "$2a$10$UjWS/0yNh5gsX6YEsYG7C.BWJ/OafYqv2Fu50YvVU6ZlWNP4w65sC", // demo123456
      avatarUrl: null,
    },
  });
  console.log(`  ✓ User: ${user.name} (${user.email})`);

  // Clean existing contacts for this user (idempotent seed)
  await prisma.contact.deleteMany({ where: { userId: user.id } });

  // ─── Create preset contacts (was agents) ──────────────────────────────
  const claude = await prisma.contact.create({
    data: {
      userId: user.id,
      name: "Claude Assistant",
      provider: "Claude",
      model: "claude-sonnet-4-6",
      systemPrompt: "You are Claude, a helpful AI assistant built by Anthropic.",
      displayName: "Claude (my assistant)",
      tags: ["favorite", "coding"],
      isPinned: true,
      config: { temperature: 0.7, maxTokens: 4096 },
    },
  });
  console.log(`  ✓ Contact: ${claude.name} (${claude.provider})`);

  const openCode = await prisma.contact.create({
    data: {
      userId: user.id,
      name: "OpenCode Coder",
      provider: "OpenCode",
      systemPrompt: "You are an AI coding assistant that generates code via OpenCode CLI.",
      displayName: "OpenCode Coder",
      tags: [],
    },
  });
  console.log(`  ✓ Contact: ${openCode.name} (${openCode.provider})`);

  const custom = await prisma.contact.create({
    data: {
      userId: user.id,
      name: "Custom GPT",
      provider: "Custom",
      model: "gpt-4o",
      systemPrompt: "You are a custom-configured AI assistant.",
      displayName: "Custom GPT",
      tags: [],
      config: { temperature: 0.5, apiEndpoint: "https://api.openai.com/v1" },
    },
  });
  console.log(`  ✓ Contact: ${custom.name} (${custom.provider})`);

  // ─── Create example conversations ─────────────────────────────────────
  const conversation = await prisma.conversation.create({
    data: {
      title: "Hello, Claude!",
      type: "single",
      ownerId: user.id,
      contactIds: [claude.id],
      lastActiveAt: new Date(),
    },
  });
  console.log(`  ✓ Conversation: ${conversation.title}`);

  const conv2 = await prisma.conversation.create({
    data: {
      title: "Help me debug a React component",
      type: "single",
      ownerId: user.id,
      contactIds: [claude.id],
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
      senderId: claude.id,
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
      senderId: claude.id,
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
  console.log(`  Contacts: 3`);
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
