import "@testing-library/jest-dom";
import { vi } from "vitest";

// Polyfill scrollIntoView for jsdom
if (typeof window !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
