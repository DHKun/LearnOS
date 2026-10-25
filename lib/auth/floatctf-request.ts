/**
 * FloatCTF OIDC request shapes shared by the browser buttons and the callback
 * route. Client-safe: no server-only imports.
 *
 * Better Auth owns the protocol (state, PKCE S256, nonce, redirect_uri, scope);
 * its `additionalParams` cannot override those reserved keys, so the only thing
 * LearnOS adds is `prompt=select_account`.
 */

export const FLOATCTF_PROVIDER_ID = "floatctf";

/**
 * Parameters for a sign-in or link the user started by clicking a button.
 *
 * LearnOS sign-out only ends the LearnOS session; the FloatCTF SSO session in
 * the browser stays valid. `select_account` makes FloatCTF show its account
 * chooser so the user can explicitly continue as the current account (no
 * password) or switch to another one (password required). Do not use it for
 * silent, non-interactive re-authentication.
 */
export const FLOATCTF_INTERACTIVE_AUTH_PARAMS: Readonly<Record<string, string>> = Object.freeze({
  prompt: "select_account",
});

const CALLBACK_PATH = "/auth/callback";

export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export type FloatctfAuthRequest = {
  provider: typeof FLOATCTF_PROVIDER_ID;
  callbackURL: string;
  errorCallbackURL: string;
  additionalParams: Record<string, string>;
};

/** Body for `authClient.signIn.social` from the LearnOS login page. */
export function floatctfSignInRequest(origin: string, next?: string | null): FloatctfAuthRequest {
  const callback = new URL(CALLBACK_PATH, origin);
  const safeNext = safeNextPath(next);
  if (safeNext) callback.searchParams.set("next", safeNext);
  // Relative: Better Auth appends ?error=… and the browser resolves it against
  // the LearnOS origin it is already on (multi-host deployments keep their host).
  return {
    provider: FLOATCTF_PROVIDER_ID,
    callbackURL: callback.toString(),
    errorCallbackURL: CALLBACK_PATH,
    additionalParams: { ...FLOATCTF_INTERACTIVE_AUTH_PARAMS },
  };
}

/** Body for `authClient.linkSocial` from 账号与登录方式. */
export function floatctfLinkRequest(origin: string): FloatctfAuthRequest {
  const callback = new URL(CALLBACK_PATH, origin);
  callback.searchParams.set("intent", "link");
  callback.searchParams.set("next", "/account/connections");
  return {
    provider: FLOATCTF_PROVIDER_ID,
    callbackURL: callback.toString(),
    errorCallbackURL: `${CALLBACK_PATH}?intent=link`,
    additionalParams: { ...FLOATCTF_INTERACTIVE_AUTH_PARAMS },
  };
}

/**
 * Where /auth/callback sends the browser when the OIDC round trip did not
 * produce a usable session. Cancelling at FloatCTF (`access_denied`) is not a
 * failure the user needs to retry differently, so it gets its own message.
 */
export function callbackFailurePath(input: {
  error: string | null;
  intent: string | null;
  signedIn: boolean;
}): string {
  const cancelled = input.error === "access_denied";
  if (input.intent === "link") {
    if (!input.signedIn) return "/login?reason=link_failed";
    return cancelled
      ? "/account/connections?error=link_cancelled"
      : "/account/connections?error=link_failed";
  }
  return cancelled ? "/login?reason=oauth_denied" : "/login?reason=oauth_failed";
}
