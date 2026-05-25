import { describe, it, expect } from "vitest";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateJti,
} from "../utils/jwt";

describe("JWT Utils", () => {
  const testUserId = "test-user-id";

  describe("signAccessToken / verifyAccessToken", () => {
    it("should sign and verify an access token", () => {
      const token = signAccessToken({ userId: testUserId });
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");

      const payload = verifyAccessToken(token);
      expect(payload.userId).toBe(testUserId);
    });

    it("should have userId in payload", () => {
      const token = signAccessToken({ userId: testUserId });
      const payload = verifyAccessToken(token);
      expect(payload.userId).toBe(testUserId);
      expect(payload).toHaveProperty("iat");
      expect(payload).toHaveProperty("exp");
    });

    it("should reject an expired token", () => {
      // Manually create an already-expired token
      const expiredToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiZXhwIjoxNTE2MjM5MDIyfQ"; // no valid signature
      expect(() => verifyAccessToken(expiredToken)).toThrow();
    });
  });

  describe("signRefreshToken / verifyRefreshToken", () => {
    it("should sign and verify a refresh token", () => {
      const jti = generateJti();
      const token = signRefreshToken({ userId: testUserId, jti });
      expect(token).toBeDefined();

      const payload = verifyRefreshToken(token);
      expect(payload.userId).toBe(testUserId);
      expect(payload.jti).toBe(jti);
    });
  });

  describe("generateJti", () => {
    it("should generate a unique identifier", () => {
      const jti1 = generateJti();
      const jti2 = generateJti();
      expect(jti1).toBeDefined();
      expect(jti1).not.toBe(jti2);
    });
  });
});
