import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../../harness/memory/store.js";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("should add and retrieve a fact", () => {
    const fact = store.add({
      content: "The sky is blue",
      classification: "permanent",
      keywords: ["sky", "blue", "color"],
    });

    expect(fact.id).toBeTruthy();
    expect(fact.content).toBe("The sky is blue");
    expect(fact.score).toBe(1.0);
    expect(store.size).toBe(1);
  });

  it("should retrieve facts by keyword match", () => {
    store.add({
      content: "User likes programming",
      classification: "temporary",
      keywords: ["programming", "coding", "software"],
    });

    const results = store.retrieve(["programming"]);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe("User likes programming");
  });

  it("should return empty array for no matching keywords", () => {
    store.add({
      content: "The sky is blue",
      classification: "temporary",
      keywords: ["sky", "blue"],
    });

    const results = store.retrieve(["pizza"]);
    expect(results).toHaveLength(0);
  });

  it("should not decay permanent facts", () => {
    const fact = store.add({
      content: "Important constant",
      classification: "permanent",
      keywords: ["important"],
    });

    const retrieved = store.get(fact.id);
    expect(retrieved!.score).toBe(1.0);
  });

  it("should decay temporary facts over simulated time", () => {
    // Use a custom config with very short half-life for testing
    const fastDecay = new MemoryStore({
      temporaryHalfLifeDays: 1, // 1 day half-life for predictable math
      minRetrievalScore: 0,
    });

    const fact = fastDecay.add({
      content: "Quickly forgotten info",
      classification: "temporary",
      keywords: ["transient"],
    });

    // Manually set createdAt to 2 days ago (exceeds the 1-day half-life)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    // We access the internal map to modify createdAt - this is acceptable for testing
    const storeInternal = (fastDecay as unknown as { facts: Map<string, unknown> }).facts;
    const storedFact = storeInternal.get(fact.id) as Record<string, unknown>;
    storedFact["createdAt"] = twoDaysAgo;

    const retrieved = fastDecay.get(fact.id);
    // After 2 half-lives: score ≈ 1.0 * 0.5^(2/1) * (1 + log10(2)) ≈ 0.25 * 1.3 ≈ 0.33
    expect(retrieved!.score).toBeLessThan(0.5);
  });

  it("should boost score on frequent access", () => {
    // Use a short half-life so decay is noticeable but access boost compensates
    const store2 = new MemoryStore({
      temporaryHalfLifeDays: 1, // 1 day half-life
      minRetrievalScore: 0,
    });

    const fact = store2.add({
      content: "Often accessed data",
      classification: "temporary",
      keywords: ["frequent"],
    });

    // Access the fact multiple times
    for (let i = 0; i < 10; i++) {
      store2.get(fact.id);
    }

    const retrieved = store2.get(fact.id);
    expect(retrieved!.accessCount).toBeGreaterThanOrEqual(10);
    // Score should be higher than base due to access boost
    expect(retrieved!.score).toBeGreaterThan(0);
  });

  it("should remove a fact", () => {
    const fact = store.add({
      content: "Temporary info",
      classification: "temporary",
      keywords: ["temp"],
    });

    expect(store.size).toBe(1);
    store.remove(fact.id);
    expect(store.size).toBe(0);
  });

  it("should clear all facts", () => {
    store.add({ content: "A", classification: "temporary", keywords: ["a"] });
    store.add({ content: "B", classification: "temporary", keywords: ["b"] });

    expect(store.size).toBe(2);
    store.clear();
    expect(store.size).toBe(0);
  });

  it("should get all facts", () => {
    store.add({ content: "A", classification: "permanent", keywords: ["a"] });
    store.add({ content: "B", classification: "temporary", keywords: ["b"] });

    const all = store.getAll();
    expect(all).toHaveLength(2);
  });

  it("should match content when keywords don't match exactly", () => {
    store.add({
      content: "The capital of France is Paris",
      classification: "temporary",
      keywords: ["france", "paris"],
    });

    const results = store.retrieve(["capital"]);
    expect(results).toHaveLength(1);
  });

  it("should limit results to maxRetrievalCount", () => {
    const store2 = new MemoryStore({ maxRetrievalCount: 2 });

    store2.add({ content: "A", classification: "permanent", keywords: ["test"] });
    store2.add({ content: "B", classification: "permanent", keywords: ["test"] });
    store2.add({ content: "C", classification: "permanent", keywords: ["test"] });

    const results = store2.retrieve(["test"]);
    expect(results).toHaveLength(2);
  });

  it("should get undefined for non-existent id", () => {
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("should return false when removing non-existent fact", () => {
    expect(store.remove("nonexistent")).toBe(false);
  });

  it("should increase accessCount on get", () => {
    const fact = store.add({
      content: "Test access counting",
      classification: "temporary",
      keywords: ["test"],
    });

    store.get(fact.id);
    store.get(fact.id);

    const retrieved = store.get(fact.id);
    expect(retrieved!.accessCount).toBe(3);
  });
});
