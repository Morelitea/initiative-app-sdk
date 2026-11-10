/**
 * Initiative, as a plug-in reaches it.
 *
 * A plug-in authenticates with its own key (`private_key_jwt`, RFC 7523) at
 * `POST {baseUrl}/plugin-platform/oauth/token` and acts with one of two tokens:
 *
 * - an **installation token** (`client_credentials` + `installation`), acting as
 *   the community that installed the plug-in, with the scopes it granted;
 * - a **member token** (the JWT-bearer grant, RFC 7523 §2.1), acting for one
 *   member, within what that member consented to.
 *
 * Either can be narrowed to one initiative the plug-in is placed in (RFC 8707) and
 * to fewer scopes (RFC 6749 §3.3). {@link Initiative.asInstallation} and
 * {@link Initiative.asMember} each give a {@link Client} acting that way; a
 * handler is handed one already acting for its call. {@link Client.api} holds
 * a typed method for every route Initiative's plug-in API describes, generated
 * from that description, and {@link Client.metadata} the values the plug-in
 * keeps on Initiative's items.
 *
 * Tokens are opaque and never read. The token response says how long each
 * lives and which scopes it holds: a call needing a scope the token does not
 * hold fails before it is sent, naming the scope. Tokens are cached until 30
 * seconds before they expire, concurrent callers share one request, and a
 * call answered 401 is sent once more on a fresh token.
 */

import { randomUUID } from "node:crypto";

import {
  PluginApi,
  pluginApiOperations,
  type PluginApiArgs,
  type PluginApiOperation,
  type PluginApiOperationId,
} from "./plugin-api.generated.js";
import type { ActorKind, ItemKind, PluginScope, Scope } from "./contract.js";
import type { Actor, ItemRef } from "./define.js";
import { signJwt, type PluginSigningKey } from "./keys.js";
import { SignIn } from "./sign-in.js";
import type { EntitlementStatements } from "./statements.js";

export {
  generatePluginKeys,
  jwkThumbprint,
  loadPrivateKey,
  publicJwks,
  type PluginSigningKey,
  type GeneratedPluginKeys,
  type Jwks,
  type PublicJwk,
} from "./keys.js";
export type { PluginApi, PluginApiSchemas } from "./plugin-api.generated.js";
export {
  AUTHORIZE_PATH,
  SignIn,
  SignInError,
  type PendingSignIn,
  type SignedIn,
} from "./sign-in.js";
export type { IdTokenClaims } from "./tokens.js";
export {
  ENTITLEMENT_ISSUER_KEY_ENV,
  EntitlementStatementError,
  EntitlementStatements,
  entitlementMetrics,
  entitlementMetricsText,
  type EntitlementMetrics,
  type EntitlementRefusal,
  type EntitlementStatementsOptions,
} from "./statements.js";

const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const ASSERTION_LIFETIME_SECONDS = 60;
const TOKEN_EXPIRY_SKEW_SECONDS = 30;

/**
 * Community routes are addressed `/c/{community}/…`. With a plug-in's token the
 * community is the token's and the segment is not read, so the client always
 * writes `0` there.
 */
const COMMUNITY_PREFIX = "/c/0";

export interface InitiativeOptions {
  /** The deployment's API base, such as `https://initiative.example.com/api/v1`. */
  baseUrl: string;
  /** The plug-in's public id: its OAuth client id. */
  publicId: string;
  /** The plug-in's key, as `loadPrivateKey` gives it. */
  key: PluginSigningKey;
  fetch?: typeof fetch;
  /** Milliseconds since the epoch. */
  now?: () => number;
  /**
   * Checks billing's signed entitlement statements, for
   * {@link Client.entitlement}. The plug-in's server gives its own; without
   * one, `entitlement()` cannot be read.
   */
  entitlements?: EntitlementStatements;
}

/** Narrowing for a token: fewer scopes than were granted, and one initiative. */
export interface Narrowing {
  scopes?: ReadonlyArray<Scope | PluginScope>;
  initiative?: number;
}

/**
 * A standing beyond the plug-in's own reach, which a community grants with its
 * scope: `moderator` (`initiatives:moderate`) in the one initiative the token
 * is narrowed to, or `community_admin` (`community:admin`) across the community.
 */
export type InstallLevel = "moderator" | "community_admin";

export interface InstallationOptions extends Narrowing {
  /** Absent: the plug-in's own reach. */
  level?: InstallLevel;
}

export interface MemberOptions extends Narrowing {
  /** The purpose the member consented to. Absent: consent to the whole plug-in. */
  purpose?: string;
}

/** One community that has installed the plug-in. */
export interface Installation {
  installation: string;
  /** False while it is switched off or its community is on hold: keep what you hold for it. */
  active: boolean;
}

/** What another plug-in answered, through Initiative. */
export interface InvokeOutcome {
  endpoint: string;
  actor: ActorKind;
  result: Record<string, unknown>;
}

/** One member's stored values, by the handle the plug-in knows. */
export interface MemberConnectionConfig {
  connectionId: string;
  connectionRef: string;
  status: string;
  values: Record<string, unknown>;
}

/**
 * The installation's configuration: each community-wide connection's values
 * and the managed values of each member's. Vendor tokens are never in it; ask
 * for one with {@link Client.connectionToken}. Hold it in memory only.
 */
export interface InstallationConfig {
  communityRef: string;
  installId: number;
  listingUid: string;
  listingVersion: string;
  enabled: boolean;
  /** The plug-in's last verdict on this configuration: `unverified`, `ok` or `invalid`. */
  configState: string;
  configStateDetail: string | null;
  /** Whether an admin still has a community-wide connection to fill in. */
  needsConfig: boolean;
  /** Connection id → field key → value. */
  connections: Record<string, Record<string, unknown>>;
  /** Connection id → the handle of each community-wide connection that has one. */
  connectionRefs: Record<string, string>;
  memberConnections: MemberConnectionConfig[];
}

/** One member's connection, with its state and no values. */
export interface InstallationConnection {
  connectionId: string;
  connectionRef: string;
  status: string;
  blocked: boolean;
  accountLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A vendor access token for one connection. Send it to the vendor; never store it. */
export interface ConnectionAccessToken {
  accessToken: string;
  /** Milliseconds since the epoch, or null when the vendor did not say. */
  expiresAt: number | null;
}

export interface ConfigStatusReport {
  state: "ok" | "invalid";
  /** A short code shown beside `invalid`, such as `missing_scope`. */
  detail?: string;
}

export interface ConfigStatus {
  communityRef: string;
  installId: number;
  configState: string;
  configStateDetail: string | null;
}

export interface InstallationEvent {
  /** An `emit` endpoint the plug-in declares, by its manifest id. */
  eventType: string;
  /** At most 8 KiB as JSON. */
  payload?: Record<string, unknown>;
  /** The initiative the event is about, when it is about one. */
  initiativeId?: number;
}

/**
 * What billing says this community holds of the plug-in: the signed statement
 * the `entitlement` hook carries, read on demand, verified, and taken from its
 * claims.
 */
export interface Entitlement {
  /** Rises with every new statement for the community. */
  version: number;
  /** The statement, whole. Its keys are agreed between the plug-in and the issuer. */
  values: Record<string, unknown>;
  /** False when billing says the community holds nothing of the plug-in now. */
  active: boolean;
  /** Why, when billing says: `term_full` is a community billing gives no seat. */
  reason: string | null;
}

export interface UsageReport {
  /** A meter the deployment allows this plug-in to report. */
  meter: string;
  /** The calendar month the usage falls in, `YYYY-MM` in UTC. */
  period: string;
  /**
   * The total for the whole period so far, never an increment. Initiative
   * keeps the highest total it is sent and refuses a lower one, so a report
   * repeated or delayed changes nothing.
   */
  quantity: number;
  /** When the total was counted. Defaults to now. */
  asOf?: Date;
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface ConsentRequest {
  member: string;
  /** The plug-in's own id for what the member is consenting to. Absent: the whole plug-in. */
  purpose?: string;
  /** Shown to the member as the plug-in's own words. */
  label: string;
  initiativeId?: number;
  /** What the plug-in asks for. The member may grant less. */
  access: "read" | "read_write";
}

/** The plug-in's values on one item or on its install, by metadata key. */
export type MetadataValues = Record<string, unknown>;

/**
 * The values the plug-in keeps in Initiative, by metadata key: on items, which
 * its manifest's fields show, and on its own install. Always on the
 * installation's token, narrowed to the client's initiative.
 */
export interface Metadata {
  /** Each item's values, by id. An item holding none is left out. */
  get(itemKind: ItemKind, ids: readonly number[]): Promise<Record<number, MetadataValues>>;
  /** Writes some of one item's values; a null removes its key. Answers the item's values as they now stand. */
  set(itemKind: ItemKind, id: number, values: MetadataValues): Promise<MetadataValues>;
  /** The items holding `value` under `key`. */
  find(key: string, value: string): Promise<ItemRef[]>;
  /** The install's own values. */
  install: {
    get(): Promise<MetadataValues>;
    /** Writes some of the install's values; a null removes its key. Answers them as they now stand. */
    set(values: MetadataValues): Promise<MetadataValues>;
  };
}

/** The token endpoint refused (RFC 6749 §5.2). */
export class InitiativeAuthError extends Error {
  constructor(
    /** `invalid_client`, `invalid_grant`, `invalid_scope`, … */
    readonly error: string,
    readonly errorDescription: string | undefined,
    readonly status: number
  ) {
    super(errorDescription ? `${error}: ${errorDescription}` : error);
    this.name = "InitiativeAuthError";
  }
}

/** The member has not consented to this purpose, or no longer can be acted for. */
export class ConsentRequiredError extends InitiativeAuthError {
  constructor(errorDescription: string | undefined, status: number) {
    super("consent_required", errorDescription, status);
    this.name = "ConsentRequiredError";
  }
}

/** A call to Initiative answered with an error status. */
export class InitiativeApiError extends Error {
  constructor(
    readonly status: number,
    /** Initiative's machine-readable `detail`, when the body carried one. */
    readonly detail: unknown
  ) {
    super(`Initiative answered ${status}${typeof detail === "string" ? `: ${detail}` : ""}`);
    this.name = "InitiativeApiError";
  }
}

/**
 * A call needs a scope the token does not hold. Nothing was sent. When any one
 * of several would do, `scope` lists them, separated by spaces.
 */
export class MissingScopeError extends Error {
  constructor(readonly scope: string) {
    super(`this call needs ${scope.includes(" ") ? `one of ${scope}` : scope}, which the token does not hold`);
    this.name = "MissingScopeError";
  }
}

/** Whether `held` covers `scope`. Writing implies reading. */
export function grants(held: readonly string[], scope: string): boolean {
  if (held.includes(scope)) return true;
  return scope.endsWith(":read") && held.includes(`${scope.slice(0, -":read".length)}:write`);
}

interface Grant {
  installation: string;
  member?: string;
  purpose?: string;
  scopes: string[];
  initiative?: number;
  level?: InstallLevel;
}

interface AccessToken {
  token: string;
  scopes: string[];
  expiresAt: number;
}

/** Issues, caches and spends the plug-in's tokens. */
class Tokens {
  readonly baseUrl: string;
  readonly endpoint: string;
  private readonly cache = new Map<string, AccessToken>();
  private readonly inflight = new Map<string, Promise<AccessToken>>();
  readonly fetch: typeof fetch;
  readonly now: () => number;
  readonly entitlements: EntitlementStatements | undefined;

  constructor(private readonly options: InitiativeOptions) {
    if (!options.publicId) throw new TypeError("publicId is the plug-in's public id");
    this.entitlements = options.entitlements;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.endpoint = `${this.baseUrl}/plugin-platform/oauth/token`;
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /** A token for the grant, from the cache while it is fresh. */
  token(grant: Grant | null): Promise<AccessToken> {
    const key = JSON.stringify(grant);
    const hit = this.cache.get(key);
    if (hit && this.now() < hit.expiresAt - TOKEN_EXPIRY_SKEW_SECONDS * 1000) return Promise.resolve(hit);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const request = this.issue(grant)
      .then((token) => {
        this.cache.set(key, token);
        return token;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }

  /**
   * `fetch` against the API on the grant's token. A 401 drops the token and the
   * call is sent once more on a fresh one.
   */
  async send(grant: Grant | null, url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      const { token } = await this.token(grant);
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      const response = await this.fetch(url.startsWith("http") ? url : `${this.baseUrl}${url}`, { ...init, headers });
      if (response.status !== 401 || attempt > 0) return response;
      this.cache.delete(JSON.stringify(grant));
    }
  }

  private async issue(grant: Grant | null): Promise<AccessToken> {
    const form: Array<[string, string]> = [];
    if (grant?.member !== undefined) {
      form.push(
        ["grant_type", JWT_BEARER_GRANT],
        [
          "assertion",
          this.assertion(grant.member, {
            installation: grant.installation,
            ...(grant.purpose !== undefined ? { purpose: grant.purpose } : {}),
          }),
        ]
      );
    } else {
      form.push(["grant_type", "client_credentials"], ...this.clientAuthentication());
      if (grant) form.push(["installation", grant.installation]);
    }
    if (grant?.scopes.length) form.push(["scope", grant.scopes.join(" ")]);
    if (grant?.initiative !== undefined) form.push(["resource", `urn:initiative:initiative:${grant.initiative}`]);
    if (grant?.level !== undefined) form.push(["level", grant.level]);

    const issuedAt = this.now();
    const body = await this.request(form);
    const lifetime = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 0;
    return {
      token: body.access_token as string,
      scopes: typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [...(grant?.scopes ?? [])],
      expiresAt: issuedAt + lifetime * 1000,
    };
  }

  /**
   * One token request, authenticating as the plug-in unless the form already
   * carries its own assertion, answered with the response body: an access
   * token, or an {@link InitiativeAuthError} for the endpoint's refusal.
   */
  async request(form: Array<[string, string]>): Promise<Record<string, unknown>> {
    const response = await this.fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
    });
    const body = (await readJson(response)) as Record<string, unknown> | null;
    if (!response.ok) {
      const error = typeof body?.error === "string" ? body.error : "invalid_response";
      const description =
        typeof body?.error_description === "string"
          ? body.error_description
          : typeof body?.error === "string"
            ? undefined
            : `token endpoint answered ${response.status}`;
      if (error === "consent_required") throw new ConsentRequiredError(description, response.status);
      throw new InitiativeAuthError(error, description, response.status);
    }
    if (typeof body?.access_token !== "string" || !body.access_token) {
      throw new InitiativeAuthError("invalid_response", "token response carried no access_token", response.status);
    }
    if (typeof body.token_type === "string" && body.token_type.toLowerCase() !== "bearer") {
      throw new InitiativeAuthError("invalid_response", `unexpected token_type ${body.token_type}`, response.status);
    }
    return body;
  }

  /** The form fields that authenticate the plug-in itself (RFC 7523 §2.2). */
  clientAuthentication(): Array<[string, string]> {
    return [
      ["client_assertion_type", CLIENT_ASSERTION_TYPE],
      ["client_assertion", this.assertion(this.options.publicId, {})],
    ];
  }

  /** A signed assertion addressed to the token endpoint. */
  private assertion(subject: string, extra: Record<string, string>): string {
    const iat = Math.floor(this.now() / 1000);
    return signJwt(this.options.key, {
      iss: this.options.publicId,
      sub: subject,
      aud: this.endpoint,
      jti: randomUUID(),
      iat,
      exp: iat + ASSERTION_LIFETIME_SECONDS,
      ...extra,
    });
  }
}

/** Initiative, for one plug-in on one deployment. */
export class Initiative {
  private readonly tokens: Tokens;
  /** Sign in with Initiative, for the plug-in's own address. */
  readonly signIn: SignIn;

  constructor(options: InitiativeOptions) {
    this.tokens = new Tokens(options);
    this.signIn = new SignIn(this.tokens, options);
  }

  /**
   * Every community that has installed the plug-in, following Initiative's
   * `Link` pages to the end. One that is gone is not listed.
   */
  async installations(): Promise<Installation[]> {
    const installations: Installation[] = [];
    let url: string | null = `${this.tokens.baseUrl}/plugin-platform/installations`;
    while (url !== null) {
      const response: Response = await this.tokens.send(null, url, { headers: { Accept: "application/json" } });
      const body = await readJson(response);
      if (!response.ok) throw new InitiativeApiError(response.status, detailOf(body));
      if (!Array.isArray(body)) throw new InitiativeApiError(response.status, "installations: expected an array");
      for (const item of body as Array<Record<string, unknown>>) {
        installations.push({ installation: String(item.installation ?? ""), active: item.active !== false });
      }
      const next = nextLink(response.headers.get("link"));
      url = next === null ? null : new URL(next, url).toString();
    }
    return installations;
  }

  /** The plug-in acting as the community that installed it. */
  asInstallation(installation: string, options: InstallationOptions = {}): Client {
    const grant = grantOf(installation, options);
    if (options.level === undefined) return new Client(this.tokens, grant);
    if ((options.level === "moderator") !== (grant.initiative !== undefined)) {
      throw new TypeError(
        options.level === "moderator"
          ? "a moderator token is narrowed to one initiative"
          : "a community_admin token is not narrowed to an initiative"
      );
    }
    return new Client(this.tokens, { ...grant, level: options.level });
  }

  /** The plug-in acting for one member, within what they consented to. */
  asMember(installation: string, member: string, options: MemberOptions = {}): Client {
    if (!member) throw new TypeError("member is required");
    return new Client(this.tokens, {
      ...grantOf(installation, options),
      member,
      ...(options.purpose !== undefined ? { purpose: options.purpose } : {}),
    });
  }
}

function grantOf(installation: string, narrowing: Narrowing): Grant {
  if (!installation) throw new TypeError("installation is required");
  const initiative = narrowing.initiative;
  if (initiative !== undefined && (!Number.isInteger(initiative) || initiative <= 0)) {
    throw new TypeError(`an initiative id is a positive whole number, not ${initiative}`);
  }
  return {
    installation,
    scopes: [...new Set(narrowing.scopes ?? [])].sort(),
    ...(initiative !== undefined ? { initiative } : {}),
  };
}

/**
 * Initiative, acting as one actor in one installation.
 *
 * Content calls ({@link Client.request}, {@link Client.callPlugin}) go on the
 * actor's own token. The installation's own configuration, connections, status
 * and events go on the installation's token, narrowed to the same initiative.
 */
export class Client {
  private pluginApi?: PluginApi;
  private metadataStore?: Metadata;

  constructor(
    private readonly tokens: Tokens,
    private readonly grant: Grant
  ) {}

  /**
   * Every route Initiative's plug-in API describes, as a typed method on the
   * actor's token: `client.api.updateTask({ path: { task_id: 7 }, body })`.
   * Each is checked against the token's scopes before it is sent, like
   * {@link Client.request}.
   */
  get api(): PluginApi {
    return (this.pluginApi ??= new PluginApi((operation, args) => this.operation(operation, args)));
  }

  /**
   * The values the plug-in keeps on Initiative's items and on its install:
   * `client.metadata.set("task", 7, { "demo.opened": 3 })`.
   */
  get metadata(): Metadata {
    const read = async (entityType: ItemKind | "plugin", ids: readonly number[]) => {
      const body = (await this.installationCall(
        "GET",
        `/metadata${queryOf({ entity_type: entityType, entity_ids: ids })}`
      )) as Record<string, unknown>;
      return Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
    };
    const write = async (entity: Record<string, unknown>, values: MetadataValues) => {
      const body = (await this.installationCall("PUT", "/metadata", { ...entity, values })) as Record<string, unknown>;
      return isRecord(body.values) ? body.values : {};
    };
    const valuesOf = (item: Record<string, unknown> | undefined) => (isRecord(item?.values) ? item.values : {});
    return (this.metadataStore ??= {
      get: async (itemKind, ids) =>
        ids.length
          ? Object.fromEntries((await read(itemKind, ids)).map((item) => [Number(item.entity_id), valuesOf(item)]))
          : {},
      set: (itemKind, id, values) => write({ entity_type: itemKind, entity_id: id }, values),
      find: async (key, value) => {
        const body = (await this.installationCall("GET", `/metadata/lookup${queryOf({ key, value })}`)) as Record<string, unknown>;
        return Array.isArray(body.items)
          ? body.items.map((item: Record<string, unknown>) => ({ type: item.entity_type as ItemKind, id: Number(item.entity_id) }))
          : [];
      },
      install: {
        get: async () => valuesOf((await read("plugin", []))[0]),
        set: (values) => write({ entity_type: "plugin" }, values),
      },
    });
  }

  get installation(): string {
    return this.grant.installation;
  }

  get actor(): Actor {
    return this.grant.member === undefined
      ? { kind: "installation" }
      : { kind: "member", member: this.grant.member };
  }

  get initiative(): number | null {
    return this.grant.initiative ?? null;
  }

  /** The scopes the actor's token holds. */
  async scopes(): Promise<string[]> {
    return (await this.tokens.token(this.grant)).scopes;
  }

  /**
   * One call to a community route, the path after `/c/{community}`, on the actor's
   * token. It is not sent unless the token holds `scope`. Answers the parsed
   * JSON body (a `Blob` when the answer is not JSON), or throws
   * {@link InitiativeApiError}.
   */
  async request<T = unknown>(
    method: string,
    path: string,
    options: { scope: Scope | PluginScope; body?: unknown }
  ): Promise<T> {
    return (await this.call(method, `${COMMUNITY_PREFIX}${path.startsWith("/") ? path : `/${path}`}`, options)) as T;
  }

  /**
   * Call another plug-in's public endpoint through Initiative, as this actor. Needs
   * `plugins:<publicId>`. A write is sent once and never retried by Initiative.
   */
  async callPlugin(publicId: string, endpointId: string, params: Record<string, unknown> = {}): Promise<InvokeOutcome> {
    const path = `/plugin-platform/plugins/${encodeURIComponent(publicId)}/endpoints/${encodeURIComponent(endpointId)}`;
    const body = await this.call("POST", path, { scope: `plugins:${publicId}`, body: { params } });
    if (!isRecord(body) || !isRecord(body.result)) {
      throw new InitiativeApiError(200, "call: the plug-in answered without a result");
    }
    return body as unknown as InvokeOutcome;
  }

  /** The installation's configuration. */
  async config(): Promise<InstallationConfig> {
    const body = (await this.installationCall("GET", "/config")) as Record<string, unknown>;
    return {
      communityRef: String(body.community_ref ?? ""),
      installId: Number(body.install_id),
      listingUid: String(body.listing_uid ?? ""),
      listingVersion: String(body.listing_version ?? ""),
      enabled: body.enabled === true,
      configState: String(body.config_state ?? "unverified"),
      configStateDetail: nullableString(body.config_state_detail),
      needsConfig: body.needs_config === true,
      connections: isRecord(body.connections) ? (body.connections as Record<string, Record<string, unknown>>) : {},
      connectionRefs: isRecord(body.connection_refs)
        ? Object.fromEntries(
            Object.entries(body.connection_refs).filter((entry): entry is [string, string] => typeof entry[1] === "string")
          )
        : {},
      memberConnections: Array.isArray(body.member_connections)
        ? body.member_connections.map((raw: Record<string, unknown>) => ({
            connectionId: String(raw.connection_id ?? ""),
            connectionRef: String(raw.connection_ref ?? ""),
            status: String(raw.status ?? ""),
            values: isRecord(raw.values) ? raw.values : {},
          }))
        : [],
    };
  }

  /** The installation's member connections: which handles are live, with no values. */
  async connections(): Promise<InstallationConnection[]> {
    const body = (await this.installationCall("GET", "/connections")) as Record<string, unknown>;
    return Array.isArray(body.items)
      ? body.items.map((item: Record<string, unknown>) => ({
          connectionId: String(item.connection_id ?? ""),
          connectionRef: String(item.connection_ref ?? ""),
          status: String(item.status ?? ""),
          blocked: item.blocked === true,
          accountLabel: nullableString(item.account_label),
          createdAt: String(item.created_at ?? ""),
          updatedAt: String(item.updated_at ?? ""),
        }))
      : [];
  }

  /**
   * A usable vendor access token for one connection, by its handle. Initiative
   * refreshes it, or mints it for a `jwt_bearer` connection. Ask each time.
   */
  async connectionToken(connectionRef: string): Promise<ConnectionAccessToken> {
    if (!connectionRef) throw new TypeError("connectionRef is required");
    const body = (await this.installationCall(
      "POST",
      `/connections/${encodeURIComponent(connectionRef)}/token`
    )) as Record<string, unknown>;
    if (typeof body.access_token !== "string" || !body.access_token) {
      throw new InitiativeApiError(200, "connection token: no access_token");
    }
    return {
      accessToken: body.access_token,
      expiresAt: typeof body.expires_at === "number" ? body.expires_at * 1000 : null,
    };
  }

  /** Tell Initiative whether the configuration the plug-in was handed works. */
  async reportConfigStatus(report: ConfigStatusReport): Promise<ConfigStatus> {
    const body = (await this.installationCall("POST", "/config-status", {
      state: report.state,
      ...(report.detail !== undefined ? { detail: report.detail } : {}),
    })) as Record<string, unknown>;
    return {
      communityRef: String(body.community_ref ?? ""),
      installId: Number(body.install_id),
      configState: String(body.config_state ?? ""),
      configStateDetail: nullableString(body.config_state_detail),
    };
  }

  /** Emit one of the plug-in's declared events, for Initiative to keep and deliver. */
  async emitEvent(event: InstallationEvent): Promise<void> {
    await this.installationCall("POST", "/events", {
      event_type: event.eventType,
      payload: event.payload ?? {},
      ...(event.initiativeId === undefined ? {} : { initiative_id: event.initiativeId }),
    });
  }

  /**
   * The current entitlement statement for this community, or null when billing
   * has made none. The same signed statement the `entitlement` hook delivers,
   * verified the same way: read it to catch up after a restart, or when the
   * hook has not come. A statement that does not verify throws
   * {@link EntitlementStatementError}.
   */
  async entitlement(): Promise<Entitlement | null> {
    const statements = this.tokens.entitlements;
    if (!statements) throw new TypeError("reading an entitlement needs `entitlements` on the Initiative options");
    let body: unknown;
    try {
      body = await this.installationCall("GET", "/entitlement");
    } catch (error) {
      if (error instanceof InitiativeApiError && error.status === 404) return null;
      throw error;
    }
    return statements.verify(isRecord(body) ? body.statement : undefined, this.grant.installation);
  }

  /**
   * Report a meter's total for one period. Only a meter the deployment allows
   * this plug-in to report is accepted; any other is refused with 403, which is
   * every meter on a deployment that bills nothing.
   */
  async reportUsage(report: UsageReport): Promise<void> {
    if (!report.meter) throw new TypeError("meter is required");
    if (!PERIOD.test(report.period)) throw new TypeError(`period is YYYY-MM, not ${report.period}`);
    if (!Number.isSafeInteger(report.quantity) || report.quantity < 0) {
      throw new TypeError("quantity is a whole number, zero or more");
    }
    await this.installationCall(
      "PUT",
      `/usage/${encodeURIComponent(report.meter)}/${encodeURIComponent(report.period)}`,
      { quantity: report.quantity, as_of: (report.asOf ?? new Date()).toISOString() }
    );
  }

  /** Ask a member to let the plug-in act for them, on Initiative's own consent screen. */
  async requestConsent(request: ConsentRequest): Promise<Record<string, unknown>> {
    const body = await this.send(this.installationGrant(), "POST", "/plugin-platform/consent-requests", {
      member: request.member,
      label: request.label,
      access: request.access,
      ...(request.purpose !== undefined ? { purpose: request.purpose } : {}),
      ...(request.initiativeId !== undefined ? { initiative_id: request.initiativeId } : {}),
    });
    return (body ?? {}) as Record<string, unknown>;
  }

  /** One operation of the plug-in API, its scope resolved from the operations table. */
  private async operation(id: PluginApiOperationId, args: PluginApiArgs = {}): Promise<unknown> {
    const operation: PluginApiOperation = pluginApiOperations[id];
    const { method, path, scope } = operation;
    const values = args.path ?? {};
    let needs: Scope;
    if (typeof scope === "string") {
      needs = scope;
    } else if ("by" in scope) {
      const value = String(values[scope.by]);
      const picked = (scope.scopes as Readonly<Record<string, Scope>>)[value];
      if (picked === undefined) {
        throw new TypeError(`${id}: ${scope.by} is one of ${Object.keys(scope.scopes).join(", ")}, not ${value}`);
      }
      needs = picked;
    } else {
      // Initiative checks each item; the token needs at least one of them.
      const held = await this.scopes();
      const found = scope.any_of.find((one) => grants(held, one));
      if (found === undefined) throw new MissingScopeError(scope.any_of.join(" "));
      needs = found;
    }
    const filled = path.replace(/\{(\w+)\}/g, (_, name: string) => {
      if (values[name] === undefined) throw new TypeError(`${id} needs ${name}`);
      return encodeURIComponent(String(values[name]));
    });
    return this.request(method, `${filled}${queryOf(args.query, operation.json)}`, { scope: needs, body: args.body });
  }

  private installationGrant(): Grant {
    const { member: _member, purpose: _purpose, ...installation } = this.grant;
    return { ...installation, scopes: [] };
  }

  private async installationCall(method: string, path: string, payload?: Record<string, unknown>): Promise<unknown> {
    return (await this.send(this.installationGrant(), method, `/plugin-platform/installation${path}`, payload)) ?? {};
  }

  private async call(method: string, path: string, options: { scope: string; body?: unknown }): Promise<unknown> {
    const { scopes } = await this.tokens.token(this.grant);
    if (!grants(scopes, options.scope)) throw new MissingScopeError(options.scope);
    return this.send(this.grant, method, path, options.body);
  }

  private async send(grant: Grant, method: string, path: string, payload?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    // A form goes as it is, so fetch writes its multipart boundary.
    const form = payload instanceof FormData;
    if (payload !== undefined && !form) headers["Content-Type"] = "application/json";
    const response = await this.tokens.send(grant, path, {
      method,
      headers,
      ...(payload !== undefined ? { body: form ? payload : JSON.stringify(payload) } : {}),
    });
    const type = response.headers.get("content-type");
    if (response.ok && type && !/json/i.test(type)) return response.blob();
    const body = await readJson(response);
    if (!response.ok) throw new InitiativeApiError(response.status, detailOf(body));
    return body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A query string as the operation describes it: a parameter it takes as JSON
 * is sent as one JSON string, a list of values repeats its key, and an absent
 * value is left out.
 */
function queryOf(query: Record<string, unknown> = {}, json: readonly string[] = []): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (json.includes(key)) {
      params.append(key, JSON.stringify(value));
    } else if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.append(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** The `rel="next"` target of a `Link` header (RFC 8288), or null. */
function nextLink(header: string | null): string | null {
  for (const part of (header ?? "").split(",")) {
    const match = /^\s*<([^>]*)>\s*;\s*rel="?next"?\s*$/i.exec(part);
    if (match) return match[1] ?? null;
  }
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function detailOf(body: unknown): unknown {
  return isRecord(body) && "detail" in body ? body.detail : body;
}
