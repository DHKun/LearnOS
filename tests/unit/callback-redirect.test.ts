import { describe, expect, it } from "vitest";

/**
 * Mirrors app/auth/callback/route.ts redirect(). The browser's Host header is the
 * only reliable origin behind a proxy: Next normalises request.url to the
 * configured public origin, and a session cookie is bound to the host that set
 * it, so redirecting to the configured host drops the user's session.
 */
function resolveRedirect(
  requestUrl: string,
  headers: Record<string, string>,
  path: string,
  appUrl = "http://10.66.66.2:3000",
): string {
  const host = headers.host;
  const proto =
    headers["x-forwarded-proto"] ?? (appUrl.startsWith("https://") ? "https" : "http");
  const base = host ? `${proto}://${host}` : requestUrl;
  const target = new URL(path, base);
  const origin = new URL(base);
  if (target.origin !== origin.origin) {
    return new URL("/login?reason=oauth_failed", base).toString();
  }
  return target.toString();
}

describe("callback redirect origin", () => {
  it("keeps the origin the browser used instead of the configured one", () => {
    expect(
      resolveRedirect(
        "http://10.66.66.2:3000/auth/callback?error=denied",
        { host: "127.0.0.1:3010" },
        "/login?reason=oauth_failed",
      ),
    ).toBe("http://127.0.0.1:3010/login?reason=oauth_failed");
  });

  it("honours the forwarded protocol behind TLS termination", () => {
    expect(
      resolveRedirect(
        "http://10.66.66.2:3000/auth/callback",
        { host: "learn.example.com", "x-forwarded-proto": "https" },
        "/courses",
      ),
    ).toBe("https://learn.example.com/courses");
  });

  it("falls back to the request URL when no Host header exists", () => {
    expect(
      resolveRedirect("http://127.0.0.1:3000/auth/callback", {}, "/login"),
    ).toBe("http://127.0.0.1:3000/login");
  });

  it("never lets a path escape to another origin", () => {
    for (const path of ["//evil.example/x", "/\\evil.example"]) {
      const result = resolveRedirect("http://host.test/auth/callback", { host: "host.test" }, path);
      expect(result.startsWith("http://host.test/")).toBe(true);
      expect(result).not.toContain("evil.example");
      expect(result).toContain("/login?reason=oauth_failed");
    }
  });
});
