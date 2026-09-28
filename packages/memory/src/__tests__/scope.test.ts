import { describe, it, expect } from "vitest";
import { buildScopeClause } from "../scope.js";

describe("buildScopeClause", () => {
  it("returns an equality clause for a conversation scope", () => {
    const clause = buildScopeClause({ conversationId: "C1" });
    expect(clause.sql).toBe("r.conversation_id = ?");
    expect(clause.params).toEqual(["C1"]);
  });

  it("returns a tautology for allConversations", () => {
    const clause = buildScopeClause({ allConversations: true });
    expect(clause.sql).toBe("1 = 1");
    expect(clause.params).toEqual([]);
  });

  it("treats an empty conversationId as a conversation scope, never allConversations", () => {
    const clause = buildScopeClause({ conversationId: "" });
    expect(clause.sql).toBe("r.conversation_id = ?");
    expect(clause.params).toEqual([""]);
    expect(clause.sql).not.toBe("1 = 1");
  });
});
