/**
 * The plug-in's server: every route Initiative calls, answered from the plug-in's
 * definition.
 *
 * | Route | Who calls it |
 * |---|---|
 * | `GET /healthz`, `GET /readyz` | the container runtime |
 * | `GET /.well-known/jwks.json` | a deployment that registers the plug-in's key by address |
 * | `GET /.well-known/initiative-plugin.json` | a deployment reading the plug-in's manifest document |
 * | `GET, POST /v1/endpoints` | Initiative, with a context token |
 * | `POST /v1/hooks/{name}` | Initiative, with a lifecycle token |
 * | a page's path | a member's browser, inside Initiative's frame |
 *
 * {@link createPlugin} returns a web-standard handler, `(Request) => Promise<Response>`,
 * so the same plug-in runs on any runtime that speaks `Request` and `Response`.
 * {@link serve} runs it on `node:http`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";

import type { ActorKind, ItemKind, Manifest } from "./contract.js";
import {
  COMMUNITY_HOOKS,
  endpointId,
  manifestOf,
  type CommunityHook,
  type AnyPlugin,
  type PluginContext,
  type Call,
  type ConnectionValue,
  type EndpointDeclaration,
  type Handoff,
  type Hooks,
  type ParamValue,
  type PageDeclaration,
} from "./define.js";
import { Initiative } from "./client.js";
import { generatePluginKeys, jwkThumbprint, loadPrivateKey, publicJwks, type PluginSigningKey } from "./keys.js";
import {
  COMMUNITY_STATUSES,
  ContextTokenError,
  JwksCache,
  verifyContextToken,
  verifyHandoffToken,
  verifyLifecycleToken,
  type CommunityStatus,
  type VerifyOptions,
} from "./tokens.js";
import { pluginDocument, MANIFEST_PATH } from "./validate.js";
import { ENTITLEMENT_ISSUER_KEY_ENV, EntitlementStatementError, EntitlementStatements } from "./statements.js";

export {
  ENTITLEMENT_ISSUER_KEY_ENV,
  EntitlementStatementError,
  entitlementMetrics,
  entitlementMetricsText,
  type EntitlementMetrics,
  type EntitlementRefusal,
} from "./statements.js";

export type {
  Actor,
  AfterConnectAnswer,
  AfterConnectCall,
  PluginContext,
  Call,
  ConnectionValue,
  EndpointCall,
  Handoff,
  ItemRef,
  Outcome,
  PageCall,
  RevokeCall,
  ScheduleCall,
  WebhookCall,
} from "./define.js";

const ENDPOINTS_PATH = "/v1/endpoints";
const HOOKS_PATH = "/v1/hooks/";
const JWKS_ROUTE = "/.well-known/jwks.json";

/** The most a request body may carry. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * A handler's refusal: answered with `status` and `{ error: code, detail }`.
 * Anything else a handler throws is answered 500.
 */
export class EndpointError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "EndpointError";
  }
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export type PluginOptions = {
  /** Initiative's API base as the plug-in reaches it. Default: `INITIATIVE_BASE_URL`. */
  baseUrl?: string;
  /**
   * The plug-in's key: a PEM, a PEM with literal `\n`, or base64 of the PEM, and
   * the `kid` it is registered under (default: its thumbprint). Default:
   * `INITIATIVE_PLUGIN_PRIVATE_KEY` and `INITIATIVE_PLUGIN_KEY_ID`, else a key
   * generated on first start and kept in `dataDir`.
   */
  key?: { privateKey: string; kid?: string };
  /** Where a generated key is kept. Default: `INITIATIVE_PLUGIN_DATA_DIR`, else `data`. */
  dataDir?: string;
  /** The built manifest. Default: `manifest.json` in the working directory. */
  manifest?: Manifest;
  /** Default: `process.env`. */
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  /** Milliseconds since the epoch. */
  now?: () => number;
  log?: Logger;
} & ({} extends PluginContext ? { context?: PluginContext } : { context: PluginContext });

export type PluginHandler = (request: Request) => Promise<Response>;

const consoleLogger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message, error) => (error === undefined ? console.error(message) : console.error(message, error)),
};

class TooLarge extends Error {}

/** The plug-in's server, as a web-standard handler. */
export function createPlugin(
  plugin: AnyPlugin,
  ...[options = {} as PluginOptions]: {} extends PluginContext ? [PluginOptions?] : [PluginOptions]
): PluginHandler {
  if (plugin.hosts) throw new TypeError("a declarative plug-in has no service to run: Initiative answers it from its manifest");
  const env = options.env ?? process.env;
  const baseUrl = options.baseUrl ?? env.INITIATIVE_BASE_URL;
  if (!baseUrl) throw new TypeError("Initiative's address is required: set INITIATIVE_BASE_URL");
  const log = options.log ?? consoleLogger;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const context = (options.context ?? {}) as PluginContext;
  const key = pluginKey(options, env);
  const manifest = builtManifest(plugin, options.manifest);
  const document = JSON.stringify(pluginDocument(manifest, { uid: plugin.uid, name: plugin.name }));
  const served = publicJwks(key);
  for (const jwk of served.keys) log.info(`plug-in key fingerprint: ${jwkThumbprint(jwk)} (kid ${jwk.kid})`);
  const jwks = JSON.stringify(served);

  const entitlements = new EntitlementStatements({
    listingUid: plugin.uid,
    issuerKeyPem: env[ENTITLEMENT_ISSUER_KEY_ENV] ?? null,
    warn: (message) => log.warn(message),
  });
  const initiative = new Initiative({ baseUrl, publicId: plugin.publicId, key, fetch: fetchImpl, now, entitlements });
  const verify: VerifyOptions = { publicId: plugin.publicId, baseUrl, jwks: new JwksCache({ fetchImpl, now }), now };
  const endpoints = new Map<string, Exclude<EndpointDeclaration, { map: string }>>(
    Object.entries(plugin.endpoints ?? {}).flatMap(([name, endpoint]) =>
      "map" in endpoint ? [] : [[endpointId(plugin, name), endpoint] as const]
    )
  );
  // Endpoint id → the item kinds the plug-in's actions run it on.
  const actionKinds = new Map<string, ItemKind[]>();
  for (const action of Object.values(plugin.actions ?? {})) {
    if (action.endpoint === undefined) continue;
    const id = endpointId(plugin, action.endpoint);
    actionKinds.set(id, [...(actionKinds.get(id) ?? []), ...action.on]);
  }
  const pages = Object.entries(plugin.pages ?? {}).filter(([, page]) => page.handler);
  const spent = new Map<string, number>();

  const base = (
    claims: { community_ref: string; community_status: CommunityStatus },
    narrowing: { initiative?: number } = {}
  ): Call => ({
    installation: claims.community_ref,
    community_status: claims.community_status,
    client: initiative.asInstallation(claims.community_ref, narrowing),
    context,
  });

  async function invoke(request: Request): Promise<Response> {
    const claims = await verified(request, (token) => verifyContextToken(token, verify));
    if (claims instanceof Response) return claims;
    const raw = await jsonBody(request);
    if (!isRecord(raw)) return refuse(400, "invalid-request", "expected a json object");
    if (typeof raw.endpoint !== "string" || !raw.endpoint) return refuse(400, "invalid-request", "endpoint is required");
    const id = raw.endpoint;
    const endpoint = endpoints.get(id);
    if (!endpoint) return refuse(400, "invalid-request", `this plug-in does not offer '${id}'`);
    if (endpoint.direction === "emit") {
      return refuse(400, "invalid-request", `'${id}' is emitted rather than called — subscribe to it instead`);
    }
    if (claims.scope !== "endpoint") return refuse(400, "invalid-request", "this token is not for calling an endpoint");
    if (claims.endpoint_id !== id) {
      return refuse(400, "invalid-request", `this token is for '${claims.endpoint_id}', not '${id}'`);
    }
    const params = raw.params ?? {};
    if (!isRecord(params)) return refuse(400, "invalid-request", "params must be an object");

    if (claims.act) {
      if (!endpoint.public) return refuse(403, "endpoint-not-public");
      if (!claims.actor || !endpoint.actors?.includes(claims.actor)) return refuse(403, "actor-not-supported");
    } else if (endpoint.direction === "write" && !(claims.subject && actionKinds.get(id)?.includes(claims.subject.type))) {
      return refuse(
        403,
        "actor-not-supported",
        "a write is called by another plug-in, as one of its actors, or by one of this plug-in's actions, on an item it is offered on"
      );
    }

    const initiativeId = claims.initiative_id;
    const narrowing = initiativeId === undefined ? {} : { initiative: initiativeId };
    const member = claims.actor === "member" ? claims.member : undefined;
    const outcome = await answered(
      () =>
        endpoint.handler({
          endpoint: id,
          params: params as Record<string, ParamValue>,
          installation: claims.community_ref,
          community_status: claims.community_status,
          actor: member === undefined ? { kind: "installation" } : { kind: "member", member },
          caller: claims.act?.sub ?? null,
          initiative: initiativeId ?? null,
          connections: claims.connection_refs ?? {},
          viewer: claims.viewer ?? null,
          subject: claims.subject ?? null,
          client:
            member === undefined
              ? initiative.asInstallation(claims.community_ref, narrowing)
              : initiative.asMember(claims.community_ref, member, narrowing),
          context,
        }),
      id
    );
    if (outcome instanceof Response) return outcome;
    return json(200, { endpoint: id, actor: outcome.actor ?? (member === undefined ? "installation" : "member"), result: outcome.result });
  }

  async function hook(request: Request, name: string): Promise<Response> {
    const known =
      name === "schedule"
        ? Object.keys(plugin.schedules ?? {}).length > 0
        : isHookName(name) && plugin.hooks?.[name] !== undefined;
    if (!known) return refuse(404, "not-found", "no such hook");
    const claims = await verified(request, (token) => verifyLifecycleToken(token, { ...verify, hook: name }));
    if (claims instanceof Response) return claims;
    const raw = await jsonBody(request);
    if (!isRecord(raw)) return refuse(400, "invalid-request", "expected a json object");
    const call = base(claims);
    const hooks = plugin.hooks ?? {};

    if (isCommunityHook(name)) {
      const done = await communityHook(name, raw, call);
      return done instanceof Response ? done : empty(204);
    }
    const subject = name === "schedule" ? "schedule" : "connection";
    if (typeof raw[subject] !== "string" || !raw[subject]) return refuse(400, "invalid-request", `${subject} is required`);

    if (name === "schedule") {
      const schedule = plugin.schedules?.[raw.schedule as string];
      if (!schedule || !("run" in schedule)) return refuse(404, "not-found", `no schedule '${raw.schedule}'`);
      const done = await answered(
        () => schedule.run({ ...call, schedule: raw.schedule as string, since: optionalString(raw.since) }),
        `schedule ${raw.schedule}`
      );
      return done instanceof Response ? done : empty(204);
    }
    if (name === "after_connect") {
      const parsed = afterConnectCall(raw);
      if (!parsed) return refuse(400, "invalid-request", "not an after_connect call");
      const answer = await answered(() => hooks.after_connect!({ ...call, ...parsed }), `after_connect for ${parsed.connection}`);
      return answer instanceof Response ? answer : json(200, answer);
    }
    if (name === "webhook") {
      const parsed = webhookCall(raw);
      if (!parsed) return refuse(400, "invalid-request", "not a webhook call");
      const done = await answered(() => hooks.webhook!({ ...call, ...parsed }), `webhook for ${parsed.connection}`);
      return done instanceof Response ? done : empty(204);
    }
    const done = await answered(
      () =>
        hooks.revoke!({
          ...call,
          connection: raw.connection as string,
          access_token: optionalString(raw.access_token),
          refresh_token: optionalString(raw.refresh_token),
          values: connectionValues(raw.values) ?? {},
        }),
      `revoke for ${raw.connection}`
    );
    return done instanceof Response ? done : empty(204);
  }

  /** A hook about the community's install: its body checked, then its handler run. */
  async function communityHook(name: CommunityHook, raw: Record<string, unknown>, call: Call): Promise<Response | void> {
    const hooks = plugin.hooks ?? {};
    if (name === "community_status") {
      const status = raw.status;
      if (!COMMUNITY_STATUSES.includes(status as CommunityStatus)) {
        return refuse(400, "invalid-request", "not a community_status call");
      }
      return answered(() => hooks.community_status!({ ...call, status: status as CommunityStatus }), "community_status");
    }
    if (name === "entitlement") {
      // Billing's signed statement, checked against billing's key: nothing else in the body is read.
      let verified;
      try {
        verified = entitlements.verify(raw.statement, call.installation);
      } catch (error) {
        if (error instanceof EntitlementStatementError) return refuse(422, "statement-refused", error.reason);
        throw error;
      }
      const { version, values, active, reason } = verified;
      return answered(() => hooks.entitlement!({ ...call, version, values, active, reason }), `entitlement v${version}`);
    }
    return answered(() => hooks[name]!(call), name);
  }

  async function page(request: Request, id: string, declaration: PageDeclaration): Promise<Response> {
    let handoff: Handoff | null = null;
    if (request.headers.has("authorization")) {
      const claims = await verified(request, (token) => verifyHandoffToken(token, verify));
      if (claims instanceof Response) return claims;
      if (claims.surface_id !== id) return refuse(401, "unauthorized", `this token is for '${claims.surface_id}', not '${id}'`);
      const seconds = Math.floor(now() / 1000);
      for (const [jti, exp] of spent) if (exp < seconds) spent.delete(jti);
      if (spent.has(claims.jti)) return refuse(401, "unauthorized", "this handoff token was already used");
      spent.set(claims.jti, claims.exp);
      handoff = {
        ...base(claims, claims.initiative_id === undefined ? {} : { initiative: claims.initiative_id }),
        page: id,
        viewer: claims.sub,
        admin: claims.community_admin === true,
        initiative: claims.initiative_id ?? null,
        permissions: Array.isArray(claims.permissions) ? [...claims.permissions] : [],
      };
    }
    return declaration.handler!({ request, handoff });
  }

  /** The token's claims, or the 401 to answer with. */
  async function verified<T>(request: Request, check: (token: string) => Promise<T>): Promise<T | Response> {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) return refuse(401, "unauthorized", "a bearer token is required");
    try {
      return await check(token);
    } catch (error) {
      if (error instanceof ContextTokenError) return refuse(401, "unauthorized", error.message);
      throw error;
    }
  }

  /** What a handler answered, or the refusal it threw. Anything else is logged and answered 500. */
  async function answered<T>(run: () => Promise<T>, what: string): Promise<T | Response> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof EndpointError) {
        return json(error.status, error.detail === undefined ? { error: error.code } : { error: error.code, detail: error.detail });
      }
      log.error(`${what} failed`, error);
      return refuse(500, "internal");
    }
  }

  async function route(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (method === "GET" && (path === "/healthz" || path === "/readyz")) return json(200, { ok: true });
    if (method === "GET" && path === JWKS_ROUTE) return text(200, jwks);
    if (method === "GET" && path === MANIFEST_PATH) return text(200, document);
    if (path === ENDPOINTS_PATH && method === "GET") return json(200, { endpoints: manifest.endpoints ?? [] });
    if (path === ENDPOINTS_PATH && method === "POST") return invoke(request);
    if (method === "POST" && path.startsWith(HOOKS_PATH)) return hook(request, path.slice(HOOKS_PATH.length));
    for (const [id, declaration] of pages) {
      if (path === declaration.path || path.startsWith(`${declaration.path}/`)) return page(request, id, declaration);
    }
    return refuse(404, "not-found");
  }

  return async (request) => {
    try {
      return await route(request);
    } catch (error) {
      if (error instanceof TooLarge) return refuse(413, "too-large");
      log.error(`${request.method} ${new URL(request.url).pathname} failed`, error);
      return refuse(500, "internal");
    }
  };
}

/**
 * The plug-in's handler on `node:http`, listening on `port` (default: `PORT`, else
 * 8080). Close the returned server to stop.
 */
export function serve(handler: PluginHandler, options: { port?: number; hostname?: string } = {}): Server {
  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
        method,
        headers: headersOf(req.headers),
        ...(method === "GET" || method === "HEAD" ? {} : { body: Readable.toWeb(req) as ReadableStream, duplex: "half" }),
      } as RequestInit);
      const response = await handler(request);
      const cookies = response.headers.getSetCookie();
      for (const [name, value] of response.headers) if (name !== "set-cookie") res.setHeader(name, value);
      if (cookies.length) res.setHeader("set-cookie", cookies);
      res.writeHead(response.status);
      if (response.body) for await (const chunk of response.body) res.write(chunk);
      res.end();
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  server.listen(options.port ?? (Number(process.env.PORT) || 8080), options.hostname);
  return server;
}

function headersOf(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, one);
  }
  return headers;
}

/** The plug-in's key: given, from the environment, or generated once and kept. */
function pluginKey(options: PluginOptions, env: Record<string, string | undefined>): PluginSigningKey {
  const given = options.key?.privateKey ?? env.INITIATIVE_PLUGIN_PRIVATE_KEY;
  if (given) return loadPrivateKey(pemText(given), options.key?.kid ?? env.INITIATIVE_PLUGIN_KEY_ID);
  const dir = options.dataDir ?? env.INITIATIVE_PLUGIN_DATA_DIR ?? "data";
  const path = join(dir, "plugin-key.pem");
  if (!existsSync(path)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, generatePluginKeys().privateKeyPem, { mode: 0o600, flag: "wx" });
  }
  return loadPrivateKey(readFileSync(path, "utf-8"));
}

/** A PEM as written, with `\n` typed literally, or base64 of the PEM. */
function pemText(raw: string): string {
  return raw.includes("-----BEGIN") ? raw.replaceAll("\\n", "\n") : Buffer.from(raw, "base64").toString("utf-8");
}

/**
 * The manifest the plug-in serves: what `initiative-plugin build` wrote, held to the
 * definition so a stale build is refused at start.
 */
function builtManifest(plugin: AnyPlugin, given: Manifest | undefined): Manifest {
  const path = "manifest.json";
  const built: Manifest | undefined = given ?? (existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : undefined);
  if (!built) {
    if (Object.keys(plugin.widgets ?? {}).length) throw new Error("no manifest.json: run initiative-plugin build");
    return manifestOf(plugin);
  }
  const modules = Object.fromEntries((built.widgets ?? []).map((widget) => [widget.id, widget.module_source]));
  if (JSON.stringify(manifestOf(plugin, modules)) !== JSON.stringify(built)) {
    throw new Error("manifest.json does not match the plug-in's definition: run initiative-plugin build");
  }
  return built;
}

async function jsonBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new TooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    for await (const chunk of request.body) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new TooLarge();
      chunks.push(chunk);
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return undefined;
  }
}

function afterConnectCall(raw: Record<string, unknown>): {
  connection: string;
  actor: ActorKind;
  access_token: string | null;
  values: Record<string, ConnectionValue>;
  params: Record<string, string>;
} | null {
  if (raw.actor !== "installation" && raw.actor !== "member") return null;
  // A flow's call carries the token it obtained; a typed connection's, what was typed.
  const access_token = optionalString(raw.access_token);
  const values = connectionValues(raw.values);
  if (access_token === null && values === null) return null;
  if (raw.params !== undefined && raw.params !== null && !isRecord(raw.params)) return null;
  const params = Object.fromEntries(
    Object.entries((raw.params ?? {}) as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  return { connection: raw.connection as string, actor: raw.actor, access_token, values: values ?? {}, params };
}

/** A connection's values as a hook is sent them, or null when there are none. */
function connectionValues(value: unknown): Record<string, ConnectionValue> | null {
  if (!isRecord(value)) return null;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, ConnectionValue] =>
        typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean"
    )
  );
}

function webhookCall(raw: Record<string, unknown>) {
  if (typeof raw.body !== "string" || !isRecord(raw.headers)) return null;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.headers)) {
    if (typeof value === "string") headers[key.toLowerCase()] = value;
  }
  return { connection: raw.connection as string, headers, body: raw.body };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function json(status: number, body: unknown): Response {
  return text(status, JSON.stringify(body));
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function empty(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

function refuse(status: number, code: string, detail?: string): Response {
  return json(status, detail === undefined ? { error: code } : { error: code, detail });
}

/** A hook the plug-in may define, other than a schedule. */
function isHookName(name: string): name is keyof Hooks & string {
  return name === "after_connect" || name === "revoke" || name === "webhook" || isCommunityHook(name);
}

function isCommunityHook(name: string): name is CommunityHook {
  return (COMMUNITY_HOOKS as readonly string[]).includes(name);
}
