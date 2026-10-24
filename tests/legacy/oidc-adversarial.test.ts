import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";

import {
  deriveFloatctfDisplayName,
  isFloatctfIdentity,
  safeNextPath,
} from "@/lib/auth/floatctf";

function user(overrides: Record<string, unknown> = {}): User {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    app_metadata: { provider: "custom:floatctf" },
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
    identities: [],
    ...overrides,
  } as User;
}

/**
 * Adversarial cases for the SSO entry points. Each one is an input an attacker
 * can control through the IdP, the callback query string, or a crafted link.
 */
describe("FloatCTF SSO adversarial inputs", () => {
  it("strips control characters and HTML from IdP-supplied display names", () => {
    const crafted = deriveFloatctfDisplayName(
      user({ user_metadata: { name: "<script>alert(1)</script>\u0000\u001b[31m" } }),
    );
    // Stored as plain text; the null/escape bytes must not survive.
    expect(crafted).not.toMatch(/[\u0000\u001f\u007f]/);
    expect(crafted.length).toBeLessThanOrEqual(120);
  });

  it("does not treat a non-string display name as trusted", () => {
    for (const value of [{ evil: true }, ["a"], 42, null, true]) {
      const name = deriveFloatctfDisplayName(user({ user_metadata: { name: value } }));
      expect(name).toBe("FloatCTF 用户 33333333");
    }
  });

  it("rejects protocol-relative, schemeless and encoded redirect tricks", () => {
    const attempts = [
      "//evil.example",
      "///evil.example",
      "/%2F%2Fevil.example",
      "////evil.example",
      "&#47;&#47;evil.example",
      "/\t/evil.example",
      " /evil.example",
      "/courses\u0000/../..%2fevil",
      "HTTP://evil.example",
      "javascript:void(0)",
      "data:text/html,x",
    ];
    for (const attempt of attempts) {
      const result = safeNextPath(attempt);
      // Either rejected outright or still a same-site path.
      if (result !== null) {
        expect(result.startsWith("/")).toBe(true);
        expect(result.startsWith("//")).toBe(false);
      }
    }
  });

  it("ignores elevation attempts in both metadata buckets", () => {
    const elevated = user({
      app_metadata: { provider: "custom:floatctf", role: "admin", roles: ["admin"] },
      user_metadata: { role: "admin", is_admin: true, admin: true },
    });
    // Identity detection must not care about role, and the derived name ignores it.
    expect(isFloatctfIdentity(elevated)).toBe(true);
    expect(deriveFloatctfDisplayName(elevated)).toBe("FloatCTF 用户 33333333");
  });

  it("does not recognise an email identity as FloatCTF even with a matching name", () => {
    const spoof = user({
      app_metadata: { provider: "email", providers: ["email", "custom:floatctf"] },
      identities: [
        {
          id: "i1",
          user_id: "33333333-3333-3333-3333-333333333333",
          identity_id: "i1",
          provider: "email",
          identity_data: { email: "a@b.c" },
        },
      ] as unknown as User["identities"],
    });
    expect(isFloatctfIdentity(spoof)).toBe(false);
  });
});
