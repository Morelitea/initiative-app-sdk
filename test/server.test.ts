/**
 * The server: every route Initiative calls, answered from the definition, with
 * Initiative's tokens signed here by an Ed25519 test key standing in for the
 * deployment's platform key.
 */

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { manifestOf } from "../src/define.js";
import { generatePluginKeys, jwkThumbprint, loadPrivateKey, signJwt } from "../src/keys.js";
import { createPlugin, entitlementMetrics, entitlementMetricsText, serve, type PluginHandler } from "../src/server.js";
import { CONTEXT_TOKEN_TYPE, HANDOFF_TOKEN_TYPE } from "../src/tokens.js";
import { issuesPlugin, trackerPlugin } from "./support/plugin.js";
import { BILLING_PUBLIC_PEM, OTHER_PRIVATE_KEY, RSA_PUBLIC_PEM, statement } from "./support/statement.js";

const BASE = "https://initiative.example.com/api/v1";
const platform = generatePluginKeys({ kid: "platform-1" });
const stranger = generatePluginKeys({ kid: "platform-1" });
const pluginKeys = generatePluginKeys({ kid: "plugin-1" });
const MODULES = { "open-count": "globalThis.render = function () {};" };

function sign(
  claims: Record<string, unknown>,
  pem = platform.privateKeyPem,
  typ = CONTEXT_TOKEN_TYPE
): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(loadPrivateKey(pem, "platform-1"), {
    jti: randomUUID(),
    iss: "initiative",
    aud: "initiative-plugin:acme.tracker",
    iat: now,
    exp: now + 60,
    community_ref: "gapp_1",
    community_status: "active",
    plugin_install_id: 1,
    ...claims,
  }, typ);
}

const contextToken = (endpoint: string, claims: Record<string, unknown> = {}) =>
  sign({ scope: "endpoint", endpoint_id: `plugin.acme.tracker.${endpoint}`, ...claims });
const hookToken = (hook: string, claims: Record<string, unknown> = {}) => sign({ scope: "lifecycle", hook, ...claims });
const handoffToken = (claims: Record<string, unknown> = {}) =>
  sign({ sub: "uapp_alice", surface_id: "board", initiative_id: 4, community_admin: true, ...claims }, undefined, HANDOFF_TOKEN_TYPE);

const outbound = (async (input: string | URL | Request) => {
  if (String(input) === "https://initiative.example.com/api/v1/plugin-platform/jwks.json") return Response.json(platform.jwks);
  throw new Error(`unexpected call to ${input}`);
}) as typeof fetch;

let handler: PluginHandler;
let seen: ReturnType<typeof trackerPlugin>["seen"];
let logs: string[];
let warnings: string[];

function start(options: Record<string, unknown> = {}): PluginHandler {
  const tracker = trackerPlugin();
  seen = tracker.seen;
  logs = [];
  warnings = [];
  return createPlugin(tracker.plugin, {
    baseUrl: BASE,
    key: { privateKey: pluginKeys.privateKeyPem, kid: "plugin-1" },
    manifest: manifestOf(tracker.plugin, MODULES),
    fetch: outbound,
    log: { info: () => {}, warn: (message) => warnings.push(message), error: (message) => logs.push(message) },
    env: { INITIATIVE_ENTITLEMENT_ISSUER_KEY_PEM: BILLING_PUBLIC_PEM },
    ...options,
  });
}

beforeEach(() => {
  handler = start();
});

const get = (path: string, headers: Record<string, string> = {}) =>
  handler(new Request(`http://plugin.test${path}`, { headers }));

const read = async (response: Response | Promise<Response>): Promise<any> => (await response).json();

async function post(path: string, body: unknown, token?: string) {
  const response = await handler(
    new Request(`http://plugin.test${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const invoke = (endpoint: string, params: Record<string, unknown>, token = contextToken(endpoint)) =>
  post("/v1/endpoints", { endpoint: `plugin.acme.tracker.${endpoint}`, params }, token);

const asMember = { act: { sub: "acme.github" }, actor: "member", member: "uref_alice", initiative_id: 5 };
const fromAction = { viewer: "uref_alice", subject: { type: "task", id: 7 }, initiative_id: 5 };

describe("what the plug-in publishes", () => {
  it("answers health checks", async () => {
    expect((await get("/healthz")).status).toBe(200);
    expect((await get("/readyz")).status).toBe(200);
  });

  it("serves its public key, and nothing private", async () => {
    const jwks = await read(get("/.well-known/jwks.json"));
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kid: "plugin-1", kty: "OKP", crv: "Ed25519", alg: "EdDSA" });
    expect(jwks.keys[0]).not.toHaveProperty("d");
  });

  it("serves its manifest document at the well-known path", async () => {
    const tracker = trackerPlugin();
    expect(await read(get("/.well-known/initiative-plugin.json"))).toEqual({
      protocol_version: 1,
      public_id: "acme.tracker",
      kind: "plugin",
      uid: "K7M2QX8N4TVB9C",
      name: "Tracker",
      definition: manifestOf(tracker.plugin, MODULES),
    });
  });

  it("lists what it declares", async () => {
    const body = await read(get("/v1/endpoints"));
    expect(body.endpoints.map((endpoint: { id: string }) => endpoint.id)).toEqual([
      "plugin.acme.tracker.projects",
      "plugin.acme.tracker.open-tickets",
      "plugin.acme.tracker.close-ticket",
      "plugin.acme.tracker.ticket-opened",
    ]);
  });
});

describe("endpoint calls", () => {
  it("hands Initiative's own call to the handler as the community's", async () => {
    const { status, body } = await invoke("open-tickets", { project: "p1", labels: ["bug"] }, contextToken("open-tickets", {
      connection_refs: { account: "cref_alice" },
    }));
    expect(status).toBe(200);
    expect(body).toEqual({
      endpoint: "plugin.acme.tracker.open-tickets",
      actor: "installation",
      result: { titles: ["Broken build"], total: 1 },
    });
    const [{ call }] = seen;
    expect(call).toMatchObject({
      endpoint: "plugin.acme.tracker.open-tickets",
      params: { project: "p1", labels: ["bug"] },
      installation: "gapp_1",
      actor: { kind: "installation" },
      caller: null,
      initiative: null,
      connections: { account: "cref_alice" },
      viewer: null,
      subject: null,
    });
    expect(call.client.installation).toBe("gapp_1");
    expect(call.client.actor).toEqual({ kind: "installation" });
  });

  it("hands another plug-in's call to the handler as the member it is for, confined to its initiative", async () => {
    const { body } = await invoke("close-ticket", {}, contextToken("close-ticket", asMember));
    expect(body).toEqual({ endpoint: "plugin.acme.tracker.close-ticket", actor: "member", result: { closed: true } });
    const [{ call }] = seen;
    expect(call).toMatchObject({ actor: { kind: "member", member: "uref_alice" }, caller: "acme.github", initiative: 5 });
    expect(call.client.actor).toEqual({ kind: "member", member: "uref_alice" });
    expect(call.client.initiative).toBe(5);
  });

  it("hands an action's write to the handler as the community's, naming the reader and the item", async () => {
    const { status, body } = await invoke("close-ticket", {}, contextToken("close-ticket", fromAction));
    expect(status).toBe(200);
    expect(body.actor).toBe("installation");
    const [{ call }] = seen;
    expect(call).toMatchObject({ actor: { kind: "installation" }, caller: null, viewer: "uref_alice", subject: { type: "task", id: 7 }, initiative: 5 });
    expect(call.client.actor).toEqual({ kind: "installation" });
  });

  it("reports the actor the handler says ran the call", async () => {
    const { body } = await invoke("open-tickets", { project: "mine" });
    expect(body.actor).toBe("member");
  });

  it("answers a handler's refusal with its status and code", async () => {
    const { status, body } = await invoke("open-tickets", { project: "refuse" });
    expect(status).toBe(409);
    expect(body).toEqual({ error: "not-configured", detail: "no project yet" });
  });

  it("answers a handler that fails with 500, and logs it", async () => {
    const { status, body } = await invoke("open-tickets", { project: "fail" });
    expect(status).toBe(500);
    expect(body).toEqual({ error: "internal" });
    expect(logs).toEqual(["plugin.acme.tracker.open-tickets failed"]);
  });

  const refusals: Array<[string, () => Promise<{ status: number; body: Record<string, string> }>, number, string]> = [
    ["no token", () => invoke("open-tickets", {}, ""), 401, "unauthorized"],
    ["a key the deployment never published", () => invoke("open-tickets", {}, sign({ scope: "endpoint", endpoint_id: "plugin.acme.tracker.open-tickets" }, stranger.privateKeyPem)), 401, "unauthorized"],
    ["a token for another plug-in", () => invoke("open-tickets", {}, contextToken("open-tickets", { aud: "initiative-plugin:acme.other" })), 401, "unauthorized"],
    ["a token for another endpoint", () => invoke("open-tickets", {}, contextToken("projects")), 400, "this token is for 'plugin.acme.tracker.projects'"],
    ["a lifecycle token", () => invoke("open-tickets", {}, hookToken("webhook")), 400, "this token is not for calling an endpoint"],
    ["an endpoint the plug-in does not declare", () => invoke("delete-everything", {}), 400, "does not offer"],
    ["an announcement", () => invoke("ticket-opened", {}), 400, "emitted rather than called"],
    ["parameters that are not an object", () => invoke("open-tickets", ["p1"] as never), 400, "params must be an object"],
    ["a body that is not JSON", () => post("/v1/endpoints", "{", contextToken("open-tickets")), 400, "expected a json object"],
    ["another plug-in, on an endpoint that is not public", () => invoke("projects", {}, contextToken("projects", asMember)), 403, "endpoint-not-public"],
    ["another plug-in, as an actor the endpoint does not take", () => invoke("close-ticket", {}, contextToken("close-ticket", { act: { sub: "acme.github" }, actor: "installation" })), 403, "actor-not-supported"],
    ["a write that no plug-in asked for", () => invoke("close-ticket", {}), 403, "actor-not-supported"],
    ["an action on an item kind it is not offered on", () => invoke("close-ticket", {}, contextToken("close-ticket", { ...fromAction, subject: { type: "post", id: 7 } })), 403, "actor-not-supported"],
    ["an action naming no reader", () => invoke("close-ticket", {}, contextToken("close-ticket", { subject: { type: "task", id: 7 } })), 401, "unauthorized"],
    ["an action on something that is not an item", () => invoke("close-ticket", {}, contextToken("close-ticket", { ...fromAction, subject: { type: "widget", id: 7 } })), 401, "unauthorized"],
    ["an action another plug-in claims to make", () => invoke("close-ticket", {}, contextToken("close-ticket", { ...asMember, ...fromAction })), 401, "unauthorized"],
  ];

  for (const [what, call, status, says] of refusals) {
    it(`refuses ${what}`, async () => {
      const answer = await call();
      expect(answer.status).toBe(status);
      expect(`${answer.body.error} ${answer.body.detail ?? ""}`).toContain(says);
      expect(seen).toHaveLength(0);
    });
  }

  it("refuses a body over the cap", async () => {
    const { status, body } = await post("/v1/endpoints", { endpoint: "x", filler: "x".repeat(6 * 1024 * 1024) }, contextToken("x"));
    expect(status).toBe(413);
    expect(body).toEqual({ error: "too-large" });
  });
});

describe("hooks", () => {
  const connected = { connection: "account", actor: "member", access_token: "vendor-token", params: { state: "x", n: 1 } };

  it("answers after_connect with the handler's answer, or its refusal", async () => {
    expect(await post("/v1/hooks/after_connect", connected, hookToken("after_connect"))).toEqual({
      status: 200,
      body: { account_label: "@alice" },
    });
    expect(seen[0].call).toMatchObject({ connection: "account", actor: "member", access_token: "vendor-token", params: { state: "x" }, installation: "gapp_1" });
    const refused = await post("/v1/hooks/after_connect", { ...connected, access_token: "stranger" }, hookToken("after_connect"));
    expect(refused.body).toEqual({ refuse: true });
  });

  it("hands after_connect what was typed into a connection without a flow", async () => {
    const typed = { connection: "shop", actor: "installation", values: { url: "https://shop.example", key: "k", stray: {} } };
    expect((await post("/v1/hooks/after_connect", typed, hookToken("after_connect"))).status).toBe(200);
    expect(seen[0].call).toMatchObject({
      connection: "shop",
      access_token: null,
      values: { url: "https://shop.example", key: "k" },
      params: {},
    });
    expect(seen[0].call).not.toHaveProperty("values.stray");
  });

  it("answers a failed hook with 500, and logs which", async () => {
    const { status } = await post("/v1/hooks/after_connect", { ...connected, access_token: "fail" }, hookToken("after_connect"));
    expect(status).toBe(500);
    expect(logs).toEqual(["after_connect for account failed"]);
  });

  it("runs a schedule by its id, with when it last succeeded", async () => {
    const { status } = await post("/v1/hooks/schedule", { schedule: "sweep", since: "2026-09-01T00:00:00Z" }, hookToken("schedule"));
    expect(status).toBe(204);
    expect(seen[0]).toMatchObject({ name: "sweep", call: { schedule: "sweep", since: "2026-09-01T00:00:00Z" } });
    const unknown = await post("/v1/hooks/schedule", { schedule: "other", since: null }, hookToken("schedule"));
    expect(unknown.status).toBe(404);
  });

  it("hands on a vendor delivery with its headers lowercased, and a revocation", async () => {
    const delivery = { connection: "workspace", headers: { "X-Vendor-Event": "opened" }, body: '{"a":1}' };
    expect((await post("/v1/hooks/webhook", delivery, hookToken("webhook"))).status).toBe(204);
    expect(seen[0].call).toMatchObject({ headers: { "x-vendor-event": "opened" }, body: '{"a":1}' });
    const revoked = await post("/v1/hooks/revoke", { connection: "account", access_token: "t" }, hookToken("revoke"));
    expect(revoked.status).toBe(204);
    expect(seen[1].call).toMatchObject({ access_token: "t", refresh_token: null, values: {} });
    const ended = await post("/v1/hooks/revoke", { connection: "shop", values: { key: "k", hook_id: 7 } }, hookToken("revoke"));
    expect(ended.status).toBe(204);
    expect(seen[2].call).toMatchObject({ access_token: null, values: { key: "k", hook_id: 7 } });
  });

  it("refuses a token minted for another hook, an endpoint token, and none", async () => {
    for (const token of [hookToken("revoke"), contextToken("projects"), ""]) {
      expect((await post("/v1/hooks/after_connect", connected, token)).status).toBe(401);
    }
    expect(seen).toHaveLength(0);
  });

  it("answers 404 for a hook the plug-in does not have, and 400 for a body that is not the hook's", async () => {
    expect((await post("/v1/hooks/before_connect", connected, hookToken("before_connect"))).status).toBe(404);
    const bad = await post("/v1/hooks/after_connect", { connection: "account", actor: "nobody" }, hookToken("after_connect"));
    expect(bad).toEqual({ status: 400, body: { error: "invalid-request", detail: "not an after_connect call" } });
    const empty = await post("/v1/hooks/after_connect", { connection: "shop", actor: "installation" }, hookToken("after_connect"));
    expect(empty.status).toBe(400);
  });
});

describe("community hooks", () => {
  it("tells the plug-in the community installed, left, and came back under the same reference", async () => {
    for (const hook of ["installed", "uninstalled", "installed"]) {
      expect((await post(`/v1/hooks/${hook}`, {}, hookToken(hook))).status).toBe(204);
    }
    expect(seen.map((entry) => entry.name)).toEqual(["installed", "uninstalled", "installed"]);
    expect(seen.map((entry) => entry.call.installation)).toEqual(["gapp_1", "gapp_1", "gapp_1"]);
    expect(seen[0].call).toMatchObject({ community_status: "active" });
  });

  it("asks for an erase again when the plug-in could not finish it", async () => {
    expect((await post("/v1/hooks/erase", {}, hookToken("erase"))).status).toBe(204);
    const stuck = await post("/v1/hooks/erase", {}, hookToken("erase", { community_ref: "gapp_stuck" }));
    expect(stuck.status).toBe(500);
    expect(logs).toEqual(["erase failed"]);
  });

  it("hands on a change of standing, and refuses one it does not know", async () => {
    const held = await post("/v1/hooks/community_status", { status: "on_hold" }, hookToken("community_status", { community_status: "on_hold" }));
    expect(held.status).toBe(204);
    expect(seen[0].call).toMatchObject({ status: "on_hold", community_status: "on_hold" });
    const unknown = await post("/v1/hooks/community_status", { status: "archived" }, hookToken("community_status"));
    expect(unknown).toEqual({ status: 400, body: { error: "invalid-request", detail: "not a community_status call" } });
  });

  it("hands on a verified statement's version and values, from its claims alone", async () => {
    const before = entitlementMetrics().statements.applied ?? 0;
    const body = { statement: statement(), version: 99, values: { monthly_allowance: null } };
    expect((await post("/v1/hooks/entitlement", body, hookToken("entitlement"))).status).toBe(204);
    expect(seen[0].call).toMatchObject({
      version: 4,
      values: { monthly_allowance: 30000, packs_purchased: 0 },
      active: true,
      reason: null,
    });
    expect(seen[0].call).not.toHaveProperty("statement");
    expect(entitlementMetrics().statements.applied).toBe(before + 1);
    expect(warnings).toEqual([]);
  });

  const refusals: Array<[string, () => unknown, string, Record<string, string>?]> = [
    ["a wrong alg", () => statement({}, { alg: "ES256" }), "alg"],
    ["alg none", () => statement({}, { alg: "none" }, null), "alg"],
    ["a wrong typ", () => statement({}, { typ: "JWT" }), "typ"],
    ["no typ", () => statement({}, { typ: undefined }), "typ"],
    ["another Ed25519 key's signature", () => statement({}, {}, OTHER_PRIVATE_KEY), "signature"],
    ["claims changed after signing", () => {
      const [header, , signature] = statement().split(".");
      const forged = Buffer.from(JSON.stringify({ iss: "initiative-billing", listing_uid: "K7M2QX8N4TVB9C", version: 9, values: {} })).toString("base64url");
      return `${header}.${forged}.${signature}`;
    }, "signature"],
    ["an RSA issuer key", () => statement(), "bad-key", { INITIATIVE_ENTITLEMENT_ISSUER_KEY_PEM: RSA_PUBLIC_PEM }],
    ["no issuer key", () => statement(), "no-key", {}],
    ["a wrong iss", () => statement({ iss: "initiative" }), "iss"],
    ["another listing's uid", () => statement({ listing_uid: "M3N4P5Q6R7S8T9" }), "listing"],
    ["a version that is a string", () => statement({ version: "4" }), "claims"],
    ["a version below one", () => statement({ version: 0 }), "claims"],
    ["a version that is not whole", () => statement({ version: 1.5 }), "claims"],
    ["values that are not an object", () => statement({ values: [1] }), "claims"],
    ["no values", () => statement({ values: undefined }), "claims"],
    ["no statement at all", () => undefined, "malformed"],
    ["a statement that is not a JWS", () => "version.4", "malformed"],
  ];
  for (const [what, make, reason, env] of refusals) {
    it(`refuses a statement with ${what}, 422, and counts it`, async () => {
      if (env) handler = start({ env });
      const before = entitlementMetrics().statements[`refused-${reason}`] ?? 0;
      const answer = await post("/v1/hooks/entitlement", { statement: make() }, hookToken("entitlement"));
      expect(answer).toEqual({ status: 422, body: { error: "statement-refused", detail: reason } });
      expect(seen).toHaveLength(0);
      expect(entitlementMetrics().statements[`refused-${reason}`]).toBe(before + 1);
    });
  }

  it("refuses every statement without an issuer key, and says why once", async () => {
    handler = start({ env: {} });
    for (let i = 0; i < 2; i += 1) {
      expect((await post("/v1/hooks/entitlement", { statement: statement() }, hookToken("entitlement"))).status).toBe(422);
    }
    expect(warnings).toEqual([
      "entitlement statements are all refused: no entitlement issuer key is configured (INITIATIVE_ENTITLEMENT_ISSUER_KEY_PEM)",
    ]);
    expect(seen).toHaveLength(0);
  });

  it("counts a grant of an unlimited allowance once per community, until it is taken away", async () => {
    const unlimited = (version: number, community = "gapp_1") =>
      post(
        "/v1/hooks/entitlement",
        { statement: statement({ version, values: { monthly_allowance: null } }) },
        hookToken("entitlement", { community_ref: community })
      );
    const before = entitlementMetrics().unlimitedGrants;
    await unlimited(1, "gapp_unlimited");
    await unlimited(2, "gapp_unlimited");
    expect(entitlementMetrics().unlimitedGrants).toBe(before + 1);
    await post("/v1/hooks/entitlement", { statement: statement({ version: 3 }) }, hookToken("entitlement", { community_ref: "gapp_unlimited" }));
    await unlimited(4, "gapp_unlimited");
    await unlimited(1, "gapp_other");
    expect(entitlementMetrics().unlimitedGrants).toBe(before + 3);
    const text = entitlementMetricsText();
    expect(text).toContain('initiative_plugin_entitlement_statements_total{outcome="applied"} ');
    expect(text).toContain(`initiative_plugin_entitlement_unlimited_grants_total ${before + 3}\n`);
  });

  it("answers 404 for a community hook the plug-in does not define, so Initiative stops sending it", async () => {
    const tracker = trackerPlugin();
    const { entitlement: _dropped, ...hooks } = tracker.plugin.hooks!;
    const plugin = { ...tracker.plugin, hooks };
    handler = createPlugin(plugin, {
      baseUrl: BASE,
      key: { privateKey: pluginKeys.privateKeyPem, kid: "plugin-1" },
      manifest: manifestOf(plugin, MODULES),
      fetch: outbound,
      env: {},
    });
    const answer = await post("/v1/hooks/entitlement", { statement: statement() }, hookToken("entitlement"));
    expect(answer.status).toBe(404);
    expect(tracker.seen).toHaveLength(0);
  });
});

describe("pages", () => {
  it("serves the page's own requests with no handoff", async () => {
    expect(await read(get("/board"))).toEqual({ viewer: null, initiative: null, admin: null, permissions: null });
  });

  it("hands a verified handoff to the page, once", async () => {
    const token = handoffToken({ permissions: ["use", "prices"] });
    const opened = await get("/board/session", { Authorization: `Bearer ${token}` });
    expect(await read(opened)).toEqual({ viewer: "uapp_alice", initiative: 4, admin: true, permissions: ["use", "prices"] });
    expect((await get("/board/session", { Authorization: `Bearer ${token}` })).status).toBe(401);
  });

  it("refuses a handoff for another page, or one not signed by the deployment", async () => {
    expect((await get("/board", { Authorization: `Bearer ${handoffToken({ surface_id: "settings" })}` })).status).toBe(401);
    const foreign = sign({ sub: "uapp_alice", surface_id: "board" }, stranger.privateKeyPem);
    expect((await get("/board", { Authorization: `Bearer ${foreign}` })).status).toBe(401);
  });
});

describe("starting", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "initiative-plugin-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("generates a key on first start, keeps it, and uses it again", async () => {
    const first = start({ key: undefined, dataDir: dir });
    const kid = (await read(first(new Request("http://plugin.test/.well-known/jwks.json")))).keys[0].kid;
    expect(statSync(join(dir, "plugin-key.pem")).mode & 0o777).toBe(0o600);
    const again = start({ key: undefined, env: { INITIATIVE_PLUGIN_DATA_DIR: dir } });
    expect((await read(again(new Request("http://plugin.test/.well-known/jwks.json")))).keys[0].kid).toBe(kid);
  });

  it("reads Initiative's address and the key from the environment, and logs its fingerprint", async () => {
    const infos: string[] = [];
    const fromEnv = start({
      baseUrl: undefined,
      key: undefined,
      log: { info: (message: string) => infos.push(message), warn: () => {}, error: () => {} },
      env: {
        INITIATIVE_BASE_URL: BASE,
        INITIATIVE_PLUGIN_PRIVATE_KEY: Buffer.from(pluginKeys.privateKeyPem).toString("base64"),
        INITIATIVE_PLUGIN_KEY_ID: "env-1",
      },
    });
    expect((await read(fromEnv(new Request("http://plugin.test/.well-known/jwks.json")))).keys[0].kid).toBe("env-1");
    expect(infos).toEqual([`plug-in key fingerprint: ${jwkThumbprint(pluginKeys.jwks.keys[0])} (kid env-1)`]);
    expect(() => start({ baseUrl: undefined })).toThrow(/INITIATIVE_BASE_URL/);
  });

  it("refuses a built manifest the definition no longer matches", () => {
    const stale = manifestOf(trackerPlugin().plugin, MODULES);
    stale.endpoints = stale.endpoints!.slice(1);
    expect(() => start({ manifest: stale })).toThrow(/run initiative-plugin build/);
  });

  it("refuses a declarative plug-in, which Initiative answers from its manifest", () => {
    expect(() => createPlugin(issuesPlugin(), { baseUrl: BASE })).toThrow(/declarative plug-in has no service to run/);
  });

  it("serves on node:http", async () => {
    const server = serve(handler, { port: 0, hostname: "127.0.0.1" });
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      expect((await fetch(`${url}/healthz`)).status).toBe(200);
      const response = await fetch(`${url}/v1/endpoints`, {
        method: "POST",
        headers: { Authorization: `Bearer ${contextToken("projects")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "plugin.acme.tracker.projects", params: {} }),
      });
      expect(await read(response)).toMatchObject({ result: { ids: ["p1", "p2"] } });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
