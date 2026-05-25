import { describe, it, expect } from "vitest";
import { hashPassword, comparePassword } from "../utils/password";

describe("Password Utils", () => {
  it("should hash a password", async () => {
    const hash = await hashPassword("myPassword123");
    expect(hash).toBeDefined();
    expect(hash).not.toBe("myPassword123");
  });

  it("should verify a correct password", async () => {
    const password = "myPassword123";
    const hash = await hashPassword(password);

    const isValid = await comparePassword(password, hash);
    expect(isValid).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const hash = await hashPassword("correctPassword");
    const isValid = await comparePassword("wrongPassword", hash);
    expect(isValid).toBe(false);
  });
});
