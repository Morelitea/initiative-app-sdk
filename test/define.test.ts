/**
 * One definition, one manifest: what `definePlugin` declares becomes the
 * contract's manifest with its handlers left out and its keys made ids, and
 * the definition's types refuse what the manifest could not say.
 */

import { describe, expect, it } from "vitest";

import { manifestOf } from "../src/define.js";
import { definePlugin, defineEndpoint, validateManifest } from "../src/manifest.js";
import { issuesPlugin, trackerPlugin } from "./support/plugin.js";

const { plugin } = trackerPlugin();
const manifest = manifestOf(plugin, { "open-count": "globalThis.render = function () {};" });

describe("manifestOf", () => {
  it("writes the contract's manifest, in its order, with every key made an id", () => {
    expect(JSON.stringify(manifest, null, 2)).toBe(
      JSON.stringify(
        {
          plugin_kind: "service",
          service: { public_id: "acme.tracker", protocol: 1, scopes: ["projects:read", "plugins:acme.github"], calls_plugins: true },
          features: ["actions", "dashboards", "endpoints", "fields", "pages", "parts", "widgets"],
          default_name: "Tracker",
          vendor: { fields: [{ key: "client_id", type: "string", required: true, label: { en: "Client id" } }] },
          connections: [
            {
              id: "account",
              scope: "interactive",
              label: { en: "Your account" },
              fields: [],
              flow: {
                type: "oauth2",
                authorize_url: "https://tracker.example/authorize",
                token_url: "https://tracker.example/token",
                client_id: "{vendor.client_id}",
                after_connect: true,
                revoke: "hook",
              },
            },
          ],
          schedules: [{ id: "sweep", every: "15m" }],
          endpoints: [
            {
              id: "plugin.acme.tracker.projects",
              direction: "read",
              label: { en: "Projects" },
              returns: [{ key: "ids", type: "string", list: true }],
            },
            {
              id: "plugin.acme.tracker.open-tickets",
              direction: "read",
              label: { en: "Open tickets" },
              public: true,
              actors: ["installation", "member"],
              cache_ttl_seconds: 60,
              params: [
                {
                  key: "project",
                  type: "string",
                  label: { en: "Project" },
                  options_from: { endpoint: "plugin.acme.tracker.projects", key: "ids" },
                },
                { key: "labels", type: "string", label: { en: "Labels" }, list: true },
              ],
              returns: [
                { key: "titles", type: "string", list: true, label: { en: "Titles" } },
                { key: "total", type: "int" },
              ],
            },
            {
              id: "plugin.acme.tracker.close-ticket",
              direction: "write",
              label: { en: "Close a ticket" },
              public: true,
              actors: ["member"],
              returns: [{ key: "closed", type: "bool" }],
            },
            {
              id: "plugin.acme.tracker.ticket-opened",
              direction: "emit",
              label: { en: "A ticket was opened" },
              returns: [
                { key: "title", type: "string" },
                { key: "number", type: "int" },
              ],
              identity: { kind: "ticket", key: ["number"] },
            },
          ],
          community_summary: "plugin.acme.tracker.projects",
          widgets: [
            {
              id: "open-count",
              meta: { name: { en: "Open tickets" } },
              endpoints: ["plugin.acme.tracker.open-tickets"],
              module_source: "globalThis.render = function () {};",
              sample_data: { "plugin.acme.tracker.open-tickets": { total: 3 } },
            },
          ],
          pages: [{ id: "board", path: "/board", name: { en: "Board" }, scopes: ["initiative"] }],
          dashboards: [
            {
              uid: "M3N4P5Q6R7S8T9",
              public_id: "acme.tracker-overview",
              name: "Overview",
              widgets: [
                {
                  type: "open-count",
                  binding: { endpoint_id: "plugin.acme.tracker.open-tickets", params: { project: "p1" } },
                },
              ],
            },
          ],
          fields: [{ key: "ticket.link", name: { en: "Ticket" }, kind: "link", on: ["task", "post"] }],
          parts: [
            {
              id: "ticket",
              name: { en: "Ticket" },
              on: ["task"],
              tree: { type: "section", children: [{ type: "field", props: { field: "ticket.link" } }, { type: "button", props: { action: "close" } }] },
            },
          ],
          actions: [
            {
              id: "close",
              name: { en: "Close the ticket" },
              endpoint: "plugin.acme.tracker.close-ticket",
              on: ["task"],
              confirm: { en: "Close it?" },
            },
          ],
        },
        null,
        2
      )
    );
  });

  it("is a manifest the SDK's own validation passes", () => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it("declares a feature only for a block that carries something", () => {
    const bare = manifestOf(definePlugin({ publicId: "acme.bare", uid: "K7M2QX8N4TVB9D", name: "Bare", endpoints: {} }));
    expect(bare).toEqual({
      plugin_kind: "service",
      service: { public_id: "acme.bare", protocol: 1 },
      features: [],
      default_name: "Bare",
    });
  });
});

describe("a minimum age", () => {
  it("is written beside the name, by country", () => {
    const aged = manifestOf(
      { ...plugin, minimumAge: { default: 16, US: 13 } },
      { "open-count": "globalThis.render = function () {};" }
    );
    expect(aged.minimum_age).toEqual({ default: 16, US: 13 });
    expect(Object.keys(aged).indexOf("minimum_age")).toBe(Object.keys(aged).indexOf("default_name") + 1);
    expect(validateManifest(aged)).toEqual([]);
  });

  it("is left out when the definition says nothing", () => {
    expect("minimum_age" in manifest).toBe(false);
  });
});

describe("the oldest plug-in API it needs", () => {
  it("is written as min_plugin_api, after the minimum age", () => {
    const needing = manifestOf(
      { ...plugin, minimumAge: { default: 16 }, minPluginApi: "4.1" },
      { "open-count": "globalThis.render = function () {};" }
    );
    expect(needing.min_plugin_api).toBe("4.1");
    expect(Object.keys(needing).indexOf("min_plugin_api")).toBe(Object.keys(needing).indexOf("minimum_age") + 1);
    expect(validateManifest(needing)).toEqual([]);
  });

  it("is left out when the definition says nothing", () => {
    expect("min_plugin_api" in manifest).toBe(false);
  });

  it("fails validation when it is not MAJOR.MINOR", () => {
    const wrong = manifestOf(
      { ...plugin, minPluginApi: "4.1.1" },
      { "open-count": "globalThis.render = function () {};" }
    );
    expect(validateManifest(wrong).map((problem) => problem.where)).toContain("/min_plugin_api");
  });
});

describe("signing in at the plug-in's own address", () => {
  it("is written as sign_in, after the pages", () => {
    const signing = manifestOf(
      { ...plugin, signIn: { page: "board", returnPath: "/signed-in" } },
      { "open-count": "globalThis.render = function () {};" }
    );
    expect(signing.sign_in).toEqual({ page: "board", return_path: "/signed-in" });
    expect(Object.keys(signing).indexOf("sign_in")).toBe(Object.keys(signing).indexOf("pages") + 1);
    expect(validateManifest(signing)).toEqual([]);
  });

  it("is left out when the definition says nothing", () => {
    expect("sign_in" in manifest).toBe(false);
  });
});

describe("a declarative definition", () => {
  const declarative = manifestOf(issuesPlugin());

  it("writes its hosts and scopes and no service block, names each endpoint it names by id, and ends with its settings and help", () => {
    expect(declarative).not.toHaveProperty("service");
    expect(Object.keys(declarative).slice(0, 6)).toEqual(["plugin_kind", "features", "default_name", "hosts", "scopes", "vendor"]);
    expect(declarative.hosts).toEqual(["api.tracker.example", "*.tracker.example"]);
    expect(declarative.scopes).toEqual(["projects:read"]);
    expect(declarative.webhooks?.events?.map((event) => event.emit)).toEqual(["plugin.acme.issues.issue-opened", undefined]);
    expect(declarative.endpoints?.[1]).toMatchObject({ id: "plugin.acme.issues.label", steps: [{ name: "current" }, { name: "set" }] });
    expect(declarative.schedules).toMatchObject([{ id: "sync", every: "1h", endpoint: "plugin.acme.issues.updated-issues" }]);
    expect(declarative.actions?.map((action) => action.endpoint)).toEqual([
      "plugin.acme.issues.create-issue",
      undefined,
      "plugin.acme.issues.link-issue",
      undefined,
    ]);
    expect(Object.keys(declarative).slice(-3)).toEqual(["settings", "permissions", "help"]);
    expect(declarative.settings).toEqual([
      { key: "prefix", type: "string", label: { en: "Reference prefix" }, unique: true, assigned: "community_name" },
    ]);
    expect(declarative.permissions).toEqual([{ id: "unlink", level: "initiative", name: { en: "Unlink issues" } }]);
  });

  it("is a manifest the SDK's own validation passes", () => {
    expect(validateManifest(declarative, { publicId: "acme.issues" })).toEqual([]);
  });
});

describe("the definition's types", () => {
  it("type a handler from its endpoint's params and returns", () => {
    defineEndpoint({
      direction: "read",
      params: { repo: { type: "string", label: { en: "Repository" } }, tags: { type: "string", label: { en: "Tags" }, list: true } },
      returns: { names: { type: "string", list: true }, total: "int", open: "bool" },
      handler: async (call) => {
        const repo: string | number | boolean | undefined = call.params.repo;
        const tags: Array<string | number | boolean> | undefined = call.params.tags;
        // @ts-expect-error an undeclared parameter
        void call.params.branch;
        void repo;
        void tags;
        return { result: { names: ["a"], total: 2, open: null } };
      },
    });
    defineEndpoint({
      direction: "read",
      returns: { total: "int" },
      // @ts-expect-error a return of the wrong type
      handler: async () => ({ result: { total: "two" } }),
    });
    defineEndpoint({
      direction: "read",
      returns: { names: { type: "string", list: true } },
      // @ts-expect-error a single value where a list is declared
      handler: async () => ({ result: { names: "a" } }),
    });
    defineEndpoint({
      direction: "read",
      returns: { total: "int" },
      // @ts-expect-error a return the endpoint does not declare
      handler: async () => ({ result: { count: 1 } }),
    });
  });

  it("keep an endpoint to a handler or a request and a map", () => {
    defineEndpoint({ direction: "read", request: { method: "GET", url: '"https://x.example"', connection: "c" }, map: "{}" });
    // @ts-expect-error a map with nothing to map
    defineEndpoint({ direction: "read", map: "{}" });
    // @ts-expect-error a request beside steps
    defineEndpoint({ direction: "read", request: { method: "GET", url: "u" }, steps: [], map: "{}" });
    defineEndpoint({
      direction: "read",
      request: { method: "GET", url: "u" },
      map: "{}",
      // @ts-expect-error an endpoint with a request has no handler
      handler: async () => ({ result: {} }),
    });
  });

  it("name an event's emission by its key", () => {
    const emitted = defineEndpoint({ direction: "emit", returns: { n: "int" } });
    const read = defineEndpoint({ direction: "read", request: { method: "GET", url: "u", connection: "c" }, map: "{}" });
    const name = { publicId: "acme.x", uid: "K7M2QX8N4TVB9E", name: "X", hosts: ["x.example"] };
    const webhooks = { verify: issuesPlugin().webhooks!.verify, dedup: "X-Delivery", route: { path: "a", connection: "c", field: "f" } };
    definePlugin({ ...name, endpoints: { emitted, read }, webhooks: { ...webhooks, events: [{ when: "true", emit: "emitted", map: "{}" }] } });
    definePlugin({ ...name, endpoints: { emitted, read }, webhooks: { ...webhooks, events: [{ when: "true", write: "[]" }] } });
    // @ts-expect-error a read is not emitted
    definePlugin({ ...name, endpoints: { emitted, read }, webhooks: { ...webhooks, events: [{ when: "true", emit: "read", map: "{}" }] } });
    // @ts-expect-error an emission's payload is mapped
    definePlugin({ ...name, endpoints: { emitted, read }, webhooks: { ...webhooks, events: [{ when: "true", emit: "emitted" }] } });
  });

  it("keep a declarative schedule to a read", () => {
    const read = defineEndpoint({ direction: "read", request: { method: "GET", url: "u", connection: "c" }, map: "{}" });
    const write = defineEndpoint({ direction: "write", request: { method: "POST", url: "u", connection: "c" }, map: "{}" });
    const name = { publicId: "acme.x", uid: "K7M2QX8N4TVB9E", name: "X", hosts: ["x.example"] };
    definePlugin({ ...name, endpoints: { read, write }, schedules: { s: { every: "1h", endpoint: "read", write: "[]" } } });
    // @ts-expect-error a schedule reads
    definePlugin({ ...name, endpoints: { read, write }, schedules: { s: { every: "1h", endpoint: "write", write: "[]" } } });
  });

  it("take an action naming a declared read or write, and refuse neither an endpoint nor a write, or params with no endpoint", () => {
    const read = defineEndpoint({ direction: "read", handler: async () => ({ result: {} }) });
    const write = defineEndpoint({ direction: "write", handler: async () => ({ result: {} }) });
    const name = { publicId: "acme.x", uid: "K7M2QX8N4TVB9E", name: "X" };
    definePlugin({ ...name, endpoints: { read, write }, actions: { a: { name: { en: "A" }, endpoint: "write", on: ["task"] } } });
    definePlugin({ ...name, endpoints: { read, write }, actions: { a: { name: { en: "A" }, write: '{"set": {}}', on: ["task"] } } });
    // A declarative plug-in's action may read what its write keeps; the validator holds a container's to a write.
    definePlugin({ ...name, endpoints: { read, write }, actions: { a: { name: { en: "A" }, endpoint: "read", on: ["task"] } } });
    // @ts-expect-error an action that calls nothing and writes nothing does nothing
    definePlugin({ ...name, endpoints: { read, write }, actions: { a: { name: { en: "A" }, on: ["task"] } } });
    // @ts-expect-error params are asked for the endpoint an action calls
    definePlugin({ ...name, endpoints: { read, write }, actions: { a: { name: { en: "A" }, write: '{"set": {}}', params: ["p"], on: ["task"] } } });
  });

  it("refuse a widget or a summary naming an endpoint that is not a declared read", () => {
    const read = defineEndpoint({ direction: "read", returns: { total: "int" }, handler: async () => ({ result: {} }) });
    const write = defineEndpoint({ direction: "write", handler: async () => ({ result: {} }) });
    const name = { publicId: "acme.x", uid: "K7M2QX8N4TVB9E", name: "X" };
    definePlugin({ ...name, endpoints: { read, write }, widgets: { w: { meta: {}, module: "w.ts", endpoints: ["read"] } } });
    // @ts-expect-error not declared
    definePlugin({ ...name, endpoints: { read, write }, widgets: { w: { meta: {}, module: "w.ts", endpoints: ["missing"] } } });
    // @ts-expect-error a write draws nothing
    definePlugin({ ...name, endpoints: { read, write }, widgets: { w: { meta: {}, module: "w.ts", endpoints: ["write"] } } });
    // @ts-expect-error a summary is a read
    definePlugin({ ...name, endpoints: { read, write }, communitySummary: "write" });
  });
});
