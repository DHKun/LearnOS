import { describe, expect, it } from "vitest";
import {
  deriveFloatctfDisplayName,
  isFloatctfIdentity,
  safeNextPath,
} from "@/lib/auth/floatctf";
import type { User } from "@supabase/supabase-js";

/**
 * Contracts the FloatCTF SSO path must keep regardless of provider quirks.
 * These are the security-relevant invariants from the integration spec.
 */
function oidcUser(metadata: Record<string, unknown> = {}): User {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    app_metadata: { provider: "custom:floatctf" },
    user_metadata: metadata,
    aud: "authenticated",
    created_at: "",
    identities: [],
  } as User;
}

describe("FloatCTF SSO security invariants", () => {
  it("never derives a role or elevation from provider metadata", () => {
    const user = oidcUser({ role: "admin", is_admin: true, display_name: "Eve" });
    const name = deriveFloatctfDisplayName(user);
    expect(name).toBe("Eve");
    // Role is not part of the derived value at all.
    expect(name.toLowerCase()).not.toContain("admin");
  });

  it("keeps post-login redirects on the same origin", () => {
    for (const payload of [
      "//evil.example/x",
      "https://evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/a\nb",
    ]) {
      expect(safeNextPath(payload)).toBeNull();
    }
    expect(safeNextPath("/account/connections")).toBe("/account/connections");
  });

  it("only treats the custom provider as FloatCTF", () => {
    expect(isFloatctfIdentity(oidcUser())).toBe(true);
    expect(
      isFloatctfIdentity({ ...oidcUser(), app_metadata: { provider: "email" } } as User),
    ).toBe(false);
  });

  it("falls back to a bounded display name when the IdP sends no profile claims", () => {
    // GoTrue does not read UserInfo, so nickname/preferred_username can be absent.
    expect(deriveFloatctfDisplayName(oidcUser())).toBe("FloatCTF 用户 22222222");
  });
});
