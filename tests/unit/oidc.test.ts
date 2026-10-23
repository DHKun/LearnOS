import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";

import {
  deriveFloatctfDisplayName,
  isFloatctfIdentity,
  safeNextPath,
} from "@/lib/auth/floatctf";

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    app_metadata: { provider: "custom:floatctf" },
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
    identities: [],
    ...overrides,
  } as User;
}

describe("FloatCTF OIDC helpers", () => {
  it("only accepts same-origin absolute next paths", () => {
    expect(safeNextPath("/courses")).toBe("/courses");
    expect(safeNextPath("/learn/abc?lesson=1")).toBe("/learn/abc?lesson=1");
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("/\\evil")).toBeNull();
    expect(safeNextPath("/x\nLocation: y")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });

  it("recognizes the custom provider from app metadata or identities", () => {
    expect(isFloatctfIdentity(fakeUser())).toBe(true);
    expect(
      isFloatctfIdentity(
        fakeUser({
          app_metadata: { provider: "email" },
          identities: [{ provider: "custom:floatctf" }] as User["identities"],
        }),
      ),
    ).toBe(true);
    expect(
      isFloatctfIdentity(
        fakeUser({ app_metadata: { provider: "email" }, identities: [] }),
      ),
    ).toBe(false);
  });

  it("derives a bounded display name without trusting role data", () => {
    expect(deriveFloatctfDisplayName(fakeUser({ user_metadata: { name: "Alice" } }))).toBe(
      "Alice",
    );
    expect(
      deriveFloatctfDisplayName(fakeUser({ user_metadata: { preferred_username: "1000000" } })),
    ).toBe("1000000");
    expect(deriveFloatctfDisplayName(fakeUser())).toBe("FloatCTF 用户 11111111");
    const long = deriveFloatctfDisplayName(fakeUser({ user_metadata: { name: "x".repeat(300) } }));
    expect(long).toHaveLength(120);
  });
});
