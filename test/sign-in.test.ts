/**
 * Sign in with Initiative, the client half: the authorize request it builds,
 * the code it spends and the ID token it checks, and renewal, against a
 * stand-in for Initiative's token endpoint and key set.
 */

import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { AUTHORIZE_PATH, generatePluginKeys, Initiative, loadPrivateKey, SignInError } from "../src/client.js";
import { signJwt } from "../src/keys.js";
import { JWKS_PATH, audienceFor } from "../src/tokens.js";

const ISSUER = "https://initiative.example.com";
const BASE = `${ISSUER}/api/v1`;
const TOKEN_URL = `${BASE}/plugin-platform/oauth/token`;
const PUBLIC_ID = "acme.hoard";
const REDIRECT = "https://hoard.example.com/signed-in";
const NOW = 1_780_000_000_000;

const plugin = generatePluginKeys({ kid: "plugin-1" });
const platform = generatePluginKeys({ kid: "platform-1" });
const platformKey = loadPrivateKey(platform.privateKeyPem, "platform-1");

let forms: URLSearchParams[];
let idTokenClaims: Record<string, unknown>;
let refusal: { error: string; error_description: string } | null;

beforeEach(() => {
  forms = [];
  refusal = null;
  idTokenClaims = {};
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function idToken(extra: Record<string, unknown> = {}, typ = "JWT"): string {
  const iat = Math.floor(NOW / 1000);
  return signJwt(
    platformKey,
    {
      jti: "id-1",
      iss: ISSUER,
      aud: PUBLIC_ID,
      sub: "uapp_member",
      iat,
      exp: iat + 600,
      community_ref: "gapp_community",
      community_status: "active",
      plugin_install_id: 4,
      surface_id: "inventory",
      community_admin: false,
      ...extra,
    },
    typ
  );
}

const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (url === `${ISSUER}${JWKS_PATH}`) return json(200, platform.jwks);
  if (url === TOKEN_URL) {
    const form = new URLSearchParams(String(init.body ?? ""));
    forms.push(form);
    if (refusal) return json(400, refusal);
    return json(200, {
      access_token: "iat_plugin",
      token_type: "Bearer",
      expires_in: 600,
      scope: "openid",
      id_token: idToken(idTokenClaims),
      refresh_token: "irt_next",
    });
  }
  return json(404, { detail: "not_found" });
}) as typeof fetch;

const initiative = () =>
  new Initiative({
    baseUrl: BASE,
    publicId: PUBLIC_ID,
    key: loadPrivateKey(plugin.privateKeyPem, "plugin-1"),
    fetch: fetchImpl,
    now: () => NOW,
  });

describe("SignIn.begin", () => {
  it("sends the person to the deployment's authorize address with PKCE, state and nonce", () => {
    const pending = initiative().signIn.begin({ redirectUri: REDIRECT });
    const url = new URL(pending.url);
    expect(url.origin + url.pathname).toBe(`${ISSUER}${AUTHORIZE_PATH}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: PUBLIC_ID,
      redirect_uri: REDIRECT,
      scope: "openid",
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: createHash("sha256").update(pending.codeVerifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    const again = initiative().signIn.begin({ redirectUri: REDIRECT });
    expect(again.state).not.toBe(pending.state);
    expect(again.codeVerifier).not.toBe(pending.codeVerifier);
  });
});

describe("SignIn.complete", () => {
  it("spends the code with the verifier and the plug-in's key, and checks the ID token", async () => {
    const client = initiative().signIn;
    const pending = client.begin({ redirectUri: REDIRECT });
    idTokenClaims = { nonce: pending.nonce, initiative_id: 12, initiative_moderator: true };
    const signedIn = await client.complete(`${REDIRECT}?code=icd_1&state=${pending.state}&iss=${ISSUER}`, pending);

    expect(signedIn.claims).toMatchObject({ sub: "uapp_member", surface_id: "inventory", initiative_id: 12 });
    expect(signedIn.refreshToken).toBe("irt_next");
    expect(signedIn.expiresAt).toBe(NOW + 600_000);
    const [form] = forms;
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("icd_1");
    expect(form.get("redirect_uri")).toBe(REDIRECT);
    expect(form.get("code_verifier")).toBe(pending.codeVerifier);
    expect(form.get("client_assertion_type")).toBe("urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    const assertion = JSON.parse(Buffer.from(form.get("client_assertion")!.split(".")[1], "base64url").toString());
    expect(assertion).toMatchObject({ iss: PUBLIC_ID, sub: PUBLIC_ID, aud: TOKEN_URL });
  });

  it("refuses a response for another sign-in, or from another issuer, before spending anything", async () => {
    const client = initiative().signIn;
    const pending = client.begin({ redirectUri: REDIRECT });
    await expect(client.complete(`${REDIRECT}?code=icd_1&state=other`, pending)).rejects.toThrow(SignInError);
    await expect(
      client.complete(`${REDIRECT}?code=icd_1&state=${pending.state}&iss=https://elsewhere.example`, pending)
    ).rejects.toThrow(SignInError);
    expect(forms).toHaveLength(0);
  });

  it("reports the person cancelling as the protocol's error", async () => {
    const client = initiative().signIn;
    const pending = client.begin({ redirectUri: REDIRECT });
    await expect(
      client.complete(`${REDIRECT}?error=access_denied&state=${pending.state}`, pending)
    ).rejects.toMatchObject({ error: "access_denied" });
  });

  it("refuses an ID token without this sign-in's nonce, and a handoff's issuer or audience", async () => {
    const client = initiative().signIn;
    const pending = client.begin({ redirectUri: REDIRECT });
    idTokenClaims = { nonce: "someone-elses" };
    await expect(client.complete(`${REDIRECT}?code=icd_1&state=${pending.state}`, pending)).rejects.toThrow(/nonce/);

    idTokenClaims = { nonce: pending.nonce, iss: "initiative" };
    await expect(client.complete(`${REDIRECT}?code=icd_2&state=${pending.state}`, pending)).rejects.toThrow(
      /from initiative/
    );

    idTokenClaims = { nonce: pending.nonce, aud: audienceFor(PUBLIC_ID) };
    await expect(client.complete(`${REDIRECT}?code=icd_3&state=${pending.state}`, pending)).rejects.toThrow(
      /token is for initiative-plugin:/
    );
  });
});

describe("SignIn.refresh", () => {
  it("renews with the refresh token and the plug-in's key", async () => {
    const signedIn = await initiative().signIn.refresh("irt_first");
    expect(signedIn.refreshToken).toBe("irt_next");
    expect(forms[0].get("grant_type")).toBe("refresh_token");
    expect(forms[0].get("refresh_token")).toBe("irt_first");
    expect(forms[0].get("client_assertion")).toBeTruthy();
  });

  it("ends the session when Initiative no longer honours the refresh token", async () => {
    refusal = { error: "invalid_grant", error_description: "signed out" };
    await expect(initiative().signIn.refresh("irt_first")).rejects.toMatchObject({
      name: "SignInError",
      error: "invalid_grant",
    });
  });
});
