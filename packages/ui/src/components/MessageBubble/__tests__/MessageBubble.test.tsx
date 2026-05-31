import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MessageBubble } from "../MessageBubble.js";
import { SenderType, MessageType } from "@agenthub/shared";
import type { Message } from "@agenthub/shared";

const baseMessage: Message = {
  id: "msg-1",
  conversationId: "conv-1",
  senderType: SenderType.User,
  senderId: "user-1",
  type: MessageType.Text,
  content: "Hello, world!",
  createdAt: "2026-05-27T10:30:00Z",
  updatedAt: "2026-05-27T10:30:00Z",
};

afterEach(cleanup);

describe("MessageBubble", () => {
  it("renders text content", () => {
    render(<MessageBubble message={baseMessage} variant="user" />);
    expect(screen.getByTestId("message-content")).toHaveTextContent(
      "Hello, world!",
    );
  });

  it("user variant has left-aligned styling", () => {
    render(<MessageBubble message={baseMessage} variant="user" />);
    const bubble = screen.getByTestId("message-bubble-user");
    expect(bubble.className).toContain("user");
  });

  it("contact variant has right-aligned styling", () => {
    render(<MessageBubble message={baseMessage} variant="contact" />);
    const bubble = screen.getByTestId("message-bubble-contact");
    expect(bubble.className).toContain("contact");
  });

  it("system variant is centered", () => {
    render(<MessageBubble message={baseMessage} variant="system" />);
    const bubble = screen.getByTestId("message-bubble-system");
    expect(bubble.className).toContain("system");
  });

  it("displays formatted timestamp", () => {
    render(<MessageBubble message={baseMessage} variant="user" />);
    expect(screen.getByTestId("message-timestamp")).toHaveTextContent("18:30");
  });

  it("does not render quote block when parentMessage is undefined", () => {
    render(<MessageBubble message={baseMessage} variant="user" />);
    expect(screen.queryByTestId("message-quote-block")).not.toBeInTheDocument();
  });

  it("does not render quote block when parentMessage is null", () => {
    render(
      <MessageBubble message={baseMessage} variant="user" parentMessage={null} />,
    );
    expect(screen.queryByTestId("message-quote-block")).not.toBeInTheDocument();
  });

  it("truncates long parent message content to 150 characters", () => {
    const longContent = "A".repeat(200);
    const parentMsg: Message = {
      id: "msg-0",
      conversationId: "conv-1",
      senderType: SenderType.Contact,
      senderId: "contact-1",
      type: MessageType.Text,
      content: longContent,
      createdAt: "2026-05-27T10:29:00Z",
      updatedAt: "2026-05-27T10:29:00Z",
    };

    render(
      <MessageBubble
        message={baseMessage}
        variant="contact"
        parentMessage={parentMsg}
      />,
    );

    const quoteBlock = screen.getByTestId("message-quote-block");
    // Content should be truncated (200 -> 150 + "...")
    expect(quoteBlock.textContent).toContain("A".repeat(150) + "...");
    expect(quoteBlock.textContent).not.toContain("A".repeat(151));
  });

  it("renders quote block when parentMessage is provided", () => {
    const parentMsg: Message = {
      id: "msg-0",
      conversationId: "conv-1",
      senderType: SenderType.Contact,
      senderId: "contact-1",
      type: MessageType.Text,
      content: "This is the parent message being replied to",
      createdAt: "2026-05-27T10:29:00Z",
      updatedAt: "2026-05-27T10:29:00Z",
    };

    render(
      <MessageBubble
        message={baseMessage}
        variant="contact"
        parentMessage={parentMsg}
      />,
    );

    const quoteBlock = screen.getByTestId("message-quote-block");
    expect(quoteBlock).toBeInTheDocument();
    expect(quoteBlock).toHaveTextContent("↳ Reply to message");
    expect(quoteBlock).toHaveTextContent(
      "This is the parent message being replied to",
    );
  });
});
