/**
 * Verifying the tokens Initiative signs when it reaches the plug-in.
 *
 * Both kinds are EdDSA JWTs (RFC 8037) signed with the deployment's Ed25519
 * key and published in its JWKS at `/api/v1/plugin-platform/jwks.json`:
 *
 * - **Context token**, on every call to the plug-in (`Authorization: Bearer …`).
 *   Scope `endpoint` is a call to one endpoint, named by `endpoint_id`; scope
 *   `lifecycle` is a call to one hook, named by `hook`. When another plug-in made
 *   the call through Initiative it also carries `act` (that plug-in), `actor`,
 *   `member` and, when the caller was confined to one, `initiative_id`. When
 *   one of the plug-in's actions made the call, it carries `viewer` (the reader
 *   who ran it) and `subject` (the item it was run on).
 * - **Handoff token**, when a member opens one of the plug-in's pages. It names
 *   the member (`sub`), the page, and the initiative it was opened in. It is
 *   for one use.
 *
 * Each is checked the same way: `alg` = `EdDSA`, the `kid` against the
 * deployment's JWKS (only its OKP/Ed25519 keys are read), the signature,
 * `iss` = `initiative`, `aud` = `initiative-plugin:<public id>`, and `exp`/`iat`
 * against the clock with a small leeway. Any other algorithm is refused.
 */

import { createPublicKey, verify, type KeyObject } from "node:crypto";

import { ACTOR_KINDS, ITEM_KINDS, type ActorKind, type ItemKind } from "./contract.js";
import type { ItemRef } from "./define.js";

/**
 * What a context token authorizes.
 *
 * `endpoint` covers every call to an endpoint your plug-in declares; the id says
 * which. `lifecycle` is Initiative calling one of your hooks about an
 * installation; `hook` says which.
 */
export type ContextScope = "endpoint" | "lifecycle";

/** Where the deployment publishes its verification keys. */
export const JWKS_PATH = "/api/v1/plugin-platform/jwks.json";

/** How long a fetched key set is reused before a refetch is considered. */
export const JWKS_CACHE_SECONDS = 300;

/** The `iss` every token from Initiative carries. */
export const INITIATIVE_ISSUER = "initiative";

/** `typ` on a call to an endpoint or a hook (RFC 8725 §3.11). */
export const CONTEXT_TOKEN_TYPE = "initiative-context+jwt";
/** `typ` on a page handoff. */
export const HANDOFF_TOKEN_TYPE = "initiative-handoff+jwt";
/** `typ` on an ID token from Sign in with Initiative. */
export const ID_TOKEN_TYPE = "JWT";

/**
 * Where a community stands, as Initiative states it. Anything but `active`
 * means the community is paused: hold back work you would do on its behalf.
 */
export const COMMUNITY_STATUSES = ["active", "read_only", "suspended", "on_hold", "deleted"] as const;
export type CommunityStatus = (typeof COMMUNITY_STATUSES)[number];

/** Claims every token from Initiative carries. */
export interface InitiativeTokenClaims {
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  /**
   * The community, by the reference your plug-in knows it by. Stable for your
   * plug-in in that community, across uninstall and reinstall, until the
   * community erases your data (the `erase` hook), so it is what your own
   * rows key on. The same holds for every member reference.
   */
  community_ref: string;
  /**
   * The installation within that community. It changes when the plug-in is
   * reinstalled, so never key anything on it.
   */
  plugin_install_id: number;
  /** Where the community stands now. */
  community_status: CommunityStatus;
}

export interface ContextClaims extends InitiativeTokenClaims {
  scope: ContextScope;
  /** Which endpoint this call is for. Present when the scope is `endpoint`. */
  endpoint_id?: string;
  /** Which hook this call is for. Present when the scope is `lifecycle`. */
  hook?: string;
  /**
   * Connection id → the opaque handle you ask Initiative for an access token
   * with. Present only where the call depends on a connection. On a call from
   * another plug-in it holds only what the actor may use: the member's own
   * connections for a `member` call, the community's for an `installation`
   * one.
   */
  connection_refs?: Record<string, string>;
  /**
   * Present when another plug-in made this call through Initiative: that plug-in's
   * public id, as `act.sub` (RFC 8693 §4.1). Absent when Initiative itself
   * called, for a widget.
   */
  act?: { sub: string };
  /**
   * On a call from another plug-in: whose behalf it is on. `installation` is the
   * community; `member` is the member named in {@link ContextClaims.member}.
   */
  actor?: ActorKind;
  /**
   * On a `member` call: the member, by the reference your installation knows
   * them by. The calling plug-in never sees it.
   */
  member?: string;
  /**
   * On a call from another plug-in whose token is confined to one initiative: that
   * initiative. Your plug-in is placed there too.
   */
  initiative_id?: number;
  /**
   * On a call one of your actions made: the reader who ran it, by the
   * reference your installation knows them by.
   */
  viewer?: string;
  /** On a call one of your actions made: the item it was run on. */
  subject?: ItemRef;
}

export interface HandoffClaims extends InitiativeTokenClaims {
  /** The member, by their reference for your installation. */
  sub: string;
  /** Which of your pages was opened. */
  surface_id: string;
  /** The initiative it was opened in. Absent when opened for the whole community. */
  initiative_id?: number;
  /** Whether the member administers the community. */
  community_admin?: boolean;
  /** With `initiative_id`: whether the member's role there manages it with full access, as a moderator's does. */
  initiative_moderator?: boolean;
}

/**
 * An ID token from Sign in with Initiative: the handoff's claims for the place
 * the member chose, from an issuer that is the deployment's own address.
 */
export interface IdTokenClaims extends HandoffClaims {
  /** The `nonce` the sign-in was started with. Absent on a renewal. */
  nonce?: string;
  /** When the member signed in to Initiative, in seconds since the epoch. */
  auth_time?: number;
}

export class ContextTokenError extends Error {}

/** The audience a token for `publicId` names. */
export function audienceFor(publicId: string): string {
  return `initiative-plugin:${publicId}`;
}

interface Jwk {
  kty: string;
  crv?: string;
  kid?: string;
  x?: string;
}

interface CacheEntry {
  keys: Map<string, KeyObject>;
  fetchedAt: number;
  /** Whether this set was itself fetched to answer a miss in its window. */
  refetched: boolean;
}

/**
 * Fetches and caches a deployment's published verification keys, by `kid`.
 *
 * An unknown `kid` refetches the set once, so a key rotation (which publishes
 * both keys for a while) resolves without a restart. A second miss inside the
 * same window does not refetch again.
 */
export class JwksCache {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly options: {
      /** Injectable for tests and for a runtime with its own fetch. */
      fetchImpl?: typeof fetch;
      /** Milliseconds since the epoch. */
      now?: () => number;
      cacheSeconds?: number;
      /** Which document to read. Defaults to {@link JWKS_PATH}. */
      path?: string;
    } = {}
  ) {}

  /** The key for `kid`, fetching the set if it is unknown or stale. */
  async keyFor(baseUrl: string, kid: string): Promise<KeyObject> {
    const document = new URL(this.options.path ?? JWKS_PATH, baseUrl).toString();
    const entry = this.cache.get(document);
    const now = this.options.now?.() ?? Date.now();
    const ttl = (this.options.cacheSeconds ?? JWKS_CACHE_SECONDS) * 1000;
    const fresh = entry !== undefined && now - entry.fetchedAt < ttl;

    if (fresh) {
      const cached = entry!.keys.get(kid);
      if (cached) return cached;
      if (entry!.refetched) return missing(document, entry!.keys, kid);
    }
    const keys = await this.load(document);
    this.cache.set(document, { keys, fetchedAt: now, refetched: fresh });
    const found = keys.get(kid);
    if (!found) return missing(document, keys, kid);
    return found;
  }

  private async load(document: string): Promise<Map<string, KeyObject>> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const response = await doFetch(document);
    if (response.status === 404) return new Map();
    if (!response.ok) {
      throw new ContextTokenError(`jwks fetch failed with ${response.status}`);
    }
    const parsed = (await response.json()) as { keys?: Jwk[] };
    const keys = new Map<string, KeyObject>();
    for (const jwk of parsed.keys ?? []) {
      if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.kid || !jwk.x) continue;
      keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: "jwk" }));
    }
    return keys;
  }
}

/** The same refusal for "no keys published" and "no such key". */
function missing(document: string, keys: Map<string, unknown>, kid: string): never {
  throw new ContextTokenError(
    keys.size === 0
      ? `${document} published no keys`
      : `no verification key published for kid ${kid}`
  );
}

export interface VerifyOptions {
  /** Your plug-in's public id. The audience must name it. */
  publicId: string;
  /** The deployment, for key lookup: its origin or its API base. */
  baseUrl: string;
  jwks: JwksCache;
  /** Defaults to {@link INITIATIVE_ISSUER}. */
  issuer?: string;
  /** Milliseconds since the epoch. */
  now?: () => number;
  /** Tolerance for clock skew, in seconds. Default 30. */
  leewaySeconds?: number;
}

/** Verify a context token and return its claims. */
export async function verifyContextToken(
  token: string,
  options: VerifyOptions
): Promise<ContextClaims> {
  const claims = (await verifyInitiativeToken(token, options, CONTEXT_TOKEN_TYPE)) as ContextClaims;
  if (claims.scope !== "endpoint" && claims.scope !== "lifecycle") {
    throw new ContextTokenError(`not a context token (scope ${String(claims.scope)})`);
  }
  checkCaller(claims);
  return claims;
}

/**
 * The claims naming who a call is for, checked for shape: an `act` names the
 * caller, an `actor` is one of the two kinds, a `member` call names its
 * member, and an action's call names both its viewer and its item.
 */
function checkCaller(claims: ContextClaims): void {
  if (claims.act !== undefined) {
    const act = claims.act as unknown;
    if (
      typeof act !== "object" ||
      act === null ||
      typeof (act as { sub?: unknown }).sub !== "string" ||
      !(act as { sub: string }).sub
    ) {
      throw new ContextTokenError("act names no calling plug-in");
    }
  }
  if (claims.actor !== undefined && !ACTOR_KINDS.includes(claims.actor)) {
    throw new ContextTokenError(`unknown actor ${String(claims.actor)}`);
  }
  if (claims.actor === "member" && (typeof claims.member !== "string" || !claims.member)) {
    throw new ContextTokenError("a member call names no member");
  }
  if (
    claims.initiative_id !== undefined &&
    (!Number.isInteger(claims.initiative_id) || claims.initiative_id <= 0)
  ) {
    throw new ContextTokenError("initiative_id is not an initiative");
  }
  if ((claims.viewer === undefined) !== (claims.subject === undefined)) {
    throw new ContextTokenError("an action call names both its viewer and its item");
  }
  if (claims.act !== undefined && claims.viewer !== undefined) {
    throw new ContextTokenError("an action call is Initiative's own, not another plug-in's");
  }
  if (claims.viewer !== undefined && (typeof claims.viewer !== "string" || !claims.viewer)) {
    throw new ContextTokenError("viewer names no member");
  }
  if (claims.subject !== undefined) {
    const subject = claims.subject as unknown as Record<string, unknown> | null;
    if (
      typeof subject !== "object" ||
      subject === null ||
      !ITEM_KINDS.includes(subject.type as ItemKind) ||
      !Number.isInteger(subject.id) ||
      (subject.id as number) <= 0
    ) {
      throw new ContextTokenError("subject is not an item");
    }
  }
}

/**
 * Verify a handoff token and return its claims.
 *
 * Single use is yours to enforce: record `jti` until `exp` and refuse a token
 * whose `jti` you have already seen.
 */
export async function verifyHandoffToken(
  token: string,
  options: VerifyOptions
): Promise<HandoffClaims> {
  const claims = (await verifyInitiativeToken(token, options, HANDOFF_TOKEN_TYPE)) as HandoffClaims;
  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new ContextTokenError("handoff token names no member");
  }
  if (typeof claims.surface_id !== "string" || !claims.surface_id) {
    throw new ContextTokenError("handoff token names no page");
  }
  return claims;
}

/**
 * Verify an ID token from Sign in with Initiative and return its claims.
 *
 * `issuer` is the deployment's own address (the authorize request's), never
 * `initiative`, and the audience is the plug-in's public id, its `client_id`,
 * not `initiative-plugin:<public id>`: a handoff is not an ID token, nor an ID
 * token a handoff. When `nonce` is given the token must carry it.
 */
export async function verifyIdToken(
  token: string,
  options: VerifyOptions & { issuer: string; nonce?: string }
): Promise<IdTokenClaims> {
  // OpenID Connect Core §2: the audience is the client_id, the bare public id.
  const claims = (await verifyInitiativeToken(
    token,
    options,
    ID_TOKEN_TYPE,
    options.publicId
  )) as IdTokenClaims;
  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new ContextTokenError("ID token names no member");
  }
  if (typeof claims.surface_id !== "string" || !claims.surface_id) {
    throw new ContextTokenError("ID token names no page");
  }
  if (options.nonce !== undefined && claims.nonce !== options.nonce) {
    throw new ContextTokenError("ID token does not carry this sign-in's nonce");
  }
  return claims;
}

/**
 * Verify the token on a call to one of your hooks, and return its claims.
 *
 * Refuses anything but a `lifecycle` token, and, when `hook` is given, one
 * minted for another hook: a token for `revoke` cannot be spent on
 * `after_connect`.
 */
export async function verifyLifecycleToken(
  token: string,
  options: VerifyOptions & { hook?: string }
): Promise<ContextClaims> {
  const claims = await verifyContextToken(token, options);
  if (claims.scope !== "lifecycle") {
    throw new ContextTokenError(`not a lifecycle token (scope ${String(claims.scope)})`);
  }
  if (options.hook !== undefined && claims.hook !== options.hook) {
    throw new ContextTokenError(
      `token is for hook ${String(claims.hook)}, not ${options.hook}`
    );
  }
  return claims;
}

/** Type, signature, issuer, audience and time: everything the kinds share. */
async function verifyInitiativeToken(
  token: string,
  options: VerifyOptions,
  typ: string,
  audience: string = audienceFor(options.publicId)
): Promise<InitiativeTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new ContextTokenError("not a JWT");
  }
  const [rawHeader, rawPayload, rawSignature] = parts;

  const header = decodeJson(rawHeader) as { alg?: string; kid?: string; typ?: string };
  if (header.typ !== typ) {
    throw new ContextTokenError(`token is typed ${String(header.typ)}, not ${typ}`);
  }
  if (header.alg !== "EdDSA") {
    throw new ContextTokenError(`unexpected algorithm ${header.alg}`);
  }
  if (!header.kid) {
    throw new ContextTokenError("token names no key");
  }

  const key = await options.jwks.keyFor(options.baseUrl, header.kid);
  const input = Buffer.from(`${rawHeader}.${rawPayload}`);
  if (!verify(null, input, key, Buffer.from(rawSignature, "base64url"))) {
    throw new ContextTokenError("signature did not verify");
  }

  const claims = decodeJson(rawPayload) as InitiativeTokenClaims;
  if (claims.aud !== audience) {
    throw new ContextTokenError(`token is for ${claims.aud}, not ${audience}`);
  }
  const issuer = options.issuer ?? INITIATIVE_ISSUER;
  if (claims.iss !== issuer) {
    throw new ContextTokenError(`token is from ${claims.iss}, not ${issuer}`);
  }

  const seconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const leeway = options.leewaySeconds ?? 30;
  if (typeof claims.exp !== "number" || claims.exp + leeway < seconds) {
    throw new ContextTokenError("token has expired");
  }
  if (typeof claims.iat === "number" && claims.iat - leeway > seconds) {
    throw new ContextTokenError("token is not valid yet");
  }
  if (!COMMUNITY_STATUSES.includes(claims.community_status)) {
    throw new ContextTokenError(`unknown community status ${String(claims.community_status)}`);
  }
  return claims;
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf-8"));
  } catch {
    throw new ContextTokenError("not a JWT");
  }
}
