/**
 * Sign in with Initiative: the client half, for a plug-in that people may open
 * at its own address as well as inside Initiative.
 *
 * It is OpenID Connect's authorization code flow, with PKCE (`S256`) and a
 * nonce on every request, and the plug-in authenticating at the token endpoint
 * with its own key, as it does for every other token (`private_key_jwt`). The
 * manifest names the page somebody lands in and the path Initiative sends them
 * back to (`sign_in`).
 *
 * 1. {@link SignIn.begin} gives the address to send the person to, and what to
 *    keep until they come back (in the plug-in's own session, never the URL).
 * 2. Initiative signs them in, and they choose the community, or the
 *    initiative, to open the plug-in in.
 * 3. {@link SignIn.complete} takes the address they came back to, spends the
 *    code and checks the ID token: the handoff's claims for that place.
 * 4. {@link SignIn.refresh} renews on the server, with no redirect. Initiative
 *    answers it only while the person is still signed in to Initiative and
 *    still may open the page there, so a refusal ends the plug-in's session.
 */

import { createHash, randomBytes } from "node:crypto";

import type { InitiativeOptions } from "./client.js";
import { JwksCache, verifyIdToken, type IdTokenClaims } from "./tokens.js";

/** Where the authorize request goes, on the deployment's own address. */
export const AUTHORIZE_PATH = "/oauth/authorize";

const AUTHORIZATION_CODE_GRANT = "authorization_code";
const REFRESH_TOKEN_GRANT = "refresh_token";

/** What Initiative's token endpoint client gives this module. */
interface TokenEndpoint {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly now: () => number;
  request(form: Array<[string, string]>): Promise<Record<string, unknown>>;
  clientAuthentication(): Array<[string, string]>;
}

/** A sign-in started, and what to keep until the person comes back. */
export interface PendingSignIn {
  /** Send the person here. */
  url: string;
  /** Keep these in the plug-in's own session; {@link SignIn.complete} needs them. */
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}

/** A sign-in completed or renewed. */
export interface SignedIn {
  claims: IdTokenClaims;
  idToken: string;
  /** Keep this on the server only; it is spent with the plug-in's key. */
  refreshToken: string;
  /** When the ID token stops being good, in milliseconds since the epoch: renew before then. */
  expiresAt: number;
}

/**
 * Initiative refused or abandoned the sign-in. `error` is the protocol's own
 * code: `access_denied` when the person cancelled, `invalid_grant` for a code
 * or refresh token Initiative no longer honours (sign the person in again).
 */
export class SignInError extends Error {
  constructor(
    readonly error: string,
    readonly errorDescription?: string
  ) {
    super(errorDescription ? `${error}: ${errorDescription}` : error);
    this.name = "SignInError";
  }
}

export class SignIn {
  /** The deployment's own address: the ID token's issuer. */
  readonly issuer: string;
  private readonly jwks: JwksCache;

  constructor(
    private readonly tokens: TokenEndpoint,
    private readonly options: Pick<InitiativeOptions, "publicId">
  ) {
    this.issuer = tokens.baseUrl.replace(/\/api\/v1$/, "");
    this.jwks = new JwksCache({ fetchImpl: tokens.fetch, now: tokens.now });
  }

  /**
   * Start a sign-in. `redirectUri` is the manifest's `return_path` on the
   * origin the plug-in's pages are served from, exactly.
   */
  begin({ redirectUri }: { redirectUri: string }): PendingSignIn {
    const state = token();
    const nonce = token();
    const codeVerifier = token();
    const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const url = new URL(AUTHORIZE_PATH, this.issuer);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.options.publicId,
      redirect_uri: redirectUri,
      scope: "openid",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return { url: url.toString(), state, nonce, codeVerifier, redirectUri };
  }

  /**
   * Finish a sign-in from the address the person came back to (its query, or
   * the whole URL), with what {@link SignIn.begin} gave.
   */
  async complete(
    returned: string | URL | URLSearchParams,
    pending: Omit<PendingSignIn, "url">
  ): Promise<SignedIn> {
    const params =
      returned instanceof URLSearchParams
        ? returned
        : new URL(returned.toString(), "http://returned.invalid").searchParams;
    // RFC 9207: the response names who answered it.
    const issuer = params.get("iss");
    if (issuer !== null && issuer !== this.issuer) {
      throw new SignInError("invalid_request", `the response is from ${issuer}, not ${this.issuer}`);
    }
    if (params.get("state") !== pending.state) {
      throw new SignInError("invalid_request", "the response is not for this sign-in");
    }
    const error = params.get("error");
    if (error !== null) {
      throw new SignInError(error, params.get("error_description") ?? undefined);
    }
    const code = params.get("code");
    if (!code) throw new SignInError("invalid_request", "the response carries no code");
    return this.redeem(
      [
        ["grant_type", AUTHORIZATION_CODE_GRANT],
        ["code", code],
        ["redirect_uri", pending.redirectUri],
        ["code_verifier", pending.codeVerifier],
      ],
      pending.nonce
    );
  }

  /**
   * Renew on the server. Initiative answers with the claims as they stand now;
   * an `invalid_grant` means the person is signed out of Initiative or may no
   * longer open the page there, and the plug-in's session ends.
   */
  refresh(refreshToken: string): Promise<SignedIn> {
    return this.redeem([
      ["grant_type", REFRESH_TOKEN_GRANT],
      ["refresh_token", refreshToken],
    ]);
  }

  private async redeem(grant: Array<[string, string]>, nonce?: string): Promise<SignedIn> {
    let body: Record<string, unknown>;
    try {
      body = await this.tokens.request([...grant, ...this.tokens.clientAuthentication()]);
    } catch (error) {
      const refusal = error as { error?: unknown; errorDescription?: string };
      if (typeof refusal.error === "string") throw new SignInError(refusal.error, refusal.errorDescription);
      throw error;
    }
    const idToken = body.id_token;
    const refreshToken = body.refresh_token;
    if (typeof idToken !== "string" || typeof refreshToken !== "string") {
      throw new SignInError("invalid_response", "the token response carries no ID token or refresh token");
    }
    const claims = await verifyIdToken(idToken, {
      publicId: this.options.publicId,
      baseUrl: this.issuer,
      jwks: this.jwks,
      issuer: this.issuer,
      now: this.tokens.now,
      ...(nonce !== undefined ? { nonce } : {}),
    });
    return { claims, idToken, refreshToken, expiresAt: claims.exp * 1000 };
  }
}

/** 32 random bytes, base64url: a state, a nonce or a PKCE verifier (RFC 7636 §4.1). */
function token(): string {
  return randomBytes(32).toString("base64url");
}
