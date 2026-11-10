/** A plug-in declaring one of everything, recording what each handler was handed. */

import { definePlugin, defineEndpoint, type Call } from "../../src/manifest.js";
import { EndpointError } from "../../src/server.js";

export function trackerPlugin() {
  const seen: Array<{ name: string; call: Call & Record<string, unknown> }> = [];
  const record = (name: string, call: Call) => seen.push({ name, call: call as Call & Record<string, unknown> });

  const projects = defineEndpoint({
    direction: "read",
    label: { en: "Projects" },
    returns: { ids: { type: "string", list: true } },
    handler: async (call) => {
      record("projects", call);
      return { result: { ids: ["p1", "p2"] } };
    },
  });

  const openTickets = defineEndpoint({
    direction: "read",
    label: { en: "Open tickets" },
    public: true,
    actors: ["installation", "member"],
    cache_ttl_seconds: 60,
    params: {
      project: { type: "string", label: { en: "Project" }, options_from: { endpoint: "projects", key: "ids" } },
      labels: { type: "string", label: { en: "Labels" }, list: true },
    },
    returns: { titles: { type: "string", list: true, label: { en: "Titles" } }, total: "int" },
    handler: async (call) => {
      record("open-tickets", call);
      if (call.params.project === "refuse") throw new EndpointError(409, "not-configured", "no project yet");
      if (call.params.project === "fail") throw new Error("the vendor fell over");
      return { result: { titles: ["Broken build"], total: 1 }, ...(call.params.project === "mine" ? { actor: "member" as const } : {}) };
    },
  });

  const closeTicket = defineEndpoint({
    direction: "write",
    label: { en: "Close a ticket" },
    public: true,
    actors: ["member"],
    returns: { closed: "bool" },
    handler: async (call) => {
      record("close-ticket", call);
      return { result: { closed: true } };
    },
  });

  const ticketOpened = defineEndpoint({
    direction: "emit",
    label: { en: "A ticket was opened" },
    returns: { title: "string", number: "int" },
    identity: { kind: "ticket", key: ["number"] },
  });

  const plugin = definePlugin({
    publicId: "acme.tracker",
    uid: "K7M2QX8N4TVB9C",
    name: "Tracker",
    scopes: ["projects:read", "plugins:acme.github"],
    callsPlugins: true,
    vendor: { fields: [{ key: "client_id", type: "string", required: true, label: { en: "Client id" } }] },
    connections: {
      account: {
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
    },
    schedules: {
      sweep: {
        every: "15m",
        run: async (call) => {
          record("sweep", call);
        },
      },
    },
    endpoints: {
      projects,
      "open-tickets": openTickets,
      "close-ticket": closeTicket,
      "ticket-opened": ticketOpened,
    },
    communitySummary: "projects",
    hooks: {
      after_connect: async (call) => {
        record("after_connect", call);
        if (call.access_token === "fail") throw new Error("the vendor would not say");
        return call.access_token === "stranger" ? { refuse: true } : { account_label: "@alice" };
      },
      revoke: async (call) => {
        record("revoke", call);
      },
      webhook: async (call) => {
        record("webhook", call);
      },
      installed: async (call) => {
        record("installed", call);
      },
      uninstalled: async (call) => {
        record("uninstalled", call);
      },
      erase: async (call) => {
        record("erase", call);
        if (call.installation === "gapp_stuck") throw new Error("the database is down");
      },
      community_status: async (call) => {
        record("community_status", call);
      },
      entitlement: async (call) => {
        record("entitlement", call);
      },
    },
    widgets: {
      "open-count": {
        meta: { name: { en: "Open tickets" } },
        endpoints: ["open-tickets"],
        module: "widgets/open-count.ts",
        sample_data: { "open-tickets": { total: 3 } },
      },
    },
    pages: {
      board: {
        path: "/board",
        name: { en: "Board" },
        scopes: ["initiative"],
        handler: async ({ handoff }) =>
          Response.json({
            viewer: handoff?.viewer ?? null,
            initiative: handoff?.initiative ?? null,
            admin: handoff?.admin ?? null,
            permissions: handoff?.permissions ?? null,
          }),
      },
    },
    dashboards: [
      {
        uid: "M3N4P5Q6R7S8T9",
        public_id: "acme.tracker-overview",
        name: "Overview",
        widgets: [{ type: "open-count", binding: { endpoint_id: "open-tickets", params: { project: "p1" } } }],
      },
    ],
    fields: { "ticket.link": { name: { en: "Ticket" }, kind: "link", on: ["task", "post"] } },
    parts: {
      ticket: {
        name: { en: "Ticket" },
        on: ["task"],
        tree: { type: "section", children: [{ type: "field", props: { field: "ticket.link" } }, { type: "button", props: { action: "close" } }] },
      },
    },
    actions: { close: { name: { en: "Close the ticket" }, endpoint: "close-ticket", on: ["task"], confirm: { en: "Close it?" } } },
  });
  return { plugin, seen };
}

/** A declarative plug-in using each of its terms: no handler, hook or service. */
export function issuesPlugin() {
  const api = (path: string) => JSON.stringify(`https://api.tracker.example${path}`);

  const openIssues = defineEndpoint({
    direction: "read",
    label: { en: "Open issues" },
    params: { state: { type: "select", options: ["Open", "Closed"], label: { en: "State" } } },
    returns: { titles: { type: "string", list: true }, total: "int" },
    request: {
      method: "GET",
      url: `${api("/repos/")} & connection.owner & "/issues"`,
      query: { state: "$lowercase(params.state)", labels: "params.labels" },
      headers: { Accept: '"application/json"' },
      connection: "workspace",
      paging: { kind: "page_number", page_param: "page", per_page_param: "per_page", per_page: 2, max_pages: 2, on_limit: "refuse" },
    },
    map: '{"titles": response.body.title[], "total": $count(response.body)}',
  });

  const label = defineEndpoint({
    direction: "write",
    actors: ["installation"],
    public: true,
    params: { number: { type: "int", label: { en: "Issue" }, required: true }, label: { type: "string", label: { en: "Label" } } },
    returns: { labels: { type: "string", list: true } },
    unavailable: ["locked"],
    steps: [
      { name: "current", request: { method: "GET", url: `${api("/issues/")} & params.number & "/labels"`, connection: "workspace" } },
      {
        name: "set",
        request: {
          method: "PUT",
          url: `${api("/issues/")} & params.number & "/labels"`,
          body: '{"labels": $append(steps.current.body.name, params.label)}',
          connection: "workspace",
        },
      },
    ],
    map: '{"labels": steps.set.body.name[]}',
    errors: [{ status: 422, when: 'response.body.message = "locked"', code: "locked" }],
  });

  const search = defineEndpoint({
    direction: "read",
    requires: { all_of: ["account"] },
    returns: { ids: { type: "string", list: true } },
    request: {
      method: "POST",
      url: api("/graphql"),
      graphql: { query: "query($after: String) { issues(after: $after) { nodes { id } pageInfo { endCursor hasNextPage } } }", variables: '{"after": null}' },
      connection: "account",
      paging: {
        kind: "cursor",
        next: "response.body.data.issues.pageInfo.endCursor",
        more: "response.body.data.issues.pageInfo.hasNextPage",
        variable: "after",
        items: "response.body.data.issues.nodes",
        max_pages: 3,
        on_limit: "truncate",
      },
    },
    map: '{"ids": response.body.id[]}',
  });

  const assign = defineEndpoint({
    direction: "write",
    actors: ["member", "installation"],
    public: true,
    requires: { all_of: ["workspace"] },
    params: { number: { type: "int", label: { en: "Issue" }, required: true } },
    returns: { assignee: "string" },
    request: {
      method: "POST",
      url: `${api("/repos/")} & connections.workspace.owner & "/issues/" & params.number & "/assignees"`,
      body: '{"assignee": "me", "seen": [$keys(connections)], "own": connection}',
      connection: { member: "account", installation: "workspace" },
    },
    map: '{"assignee": response.body.assignee}',
  });

  const issueOpened = defineEndpoint({
    direction: "emit",
    label: { en: "An issue was opened" },
    returns: { number: "int", title: "string" },
    identity: { kind: "issue", key: ["number"] },
  });

  const createIssue = defineEndpoint({
    direction: "write",
    actors: ["installation"],
    returns: { number: "int", url: "string" },
    request: {
      method: "POST",
      url: `${api("/repos/")} & connection.owner & "/issues"`,
      body: '{"title": item.title, "body": "From " & settings.prefix & "-" & item.id}',
      connection: "workspace",
    },
    map: '{"number": response.body.number, "url": response.body.html_url}',
  });

  const updatedIssues = defineEndpoint({
    direction: "read",
    actors: ["installation"],
    params: { since: { type: "datetime", label: { en: "Since" } } },
    returns: { numbers: { type: "int", list: true }, states: { type: "string", list: true } },
    request: {
      method: "GET",
      url: `${api("/repos/")} & connection.owner & "/issues"`,
      query: { since: "params.since", state: '"all"' },
      connection: "workspace",
    },
    map: '{"numbers": response.body.number[], "states": response.body.state[]}',
  });

  const linkIssue = defineEndpoint({
    direction: "write",
    actors: ["installation"],
    params: { number: { type: "int", label: { en: "Issue" }, required: true } },
    returns: { number: "int", title: "string", url: "string", state: "string" },
    request: { method: "GET", url: `${api("/repos/")} & connection.owner & "/issues/" & params.number`, connection: "workspace" },
    map: '{"number": response.body.number, "title": response.body.title, "url": response.body.html_url, "state": response.body.state}',
  });

  return definePlugin({
    publicId: "acme.issues",
    uid: "K7M2QX8N4TVB9F",
    name: "Issues",
    hosts: ["api.tracker.example", "*.tracker.example"],
    scopes: ["projects:read"],
    vendor: {
      fields: [
        { key: "client_id", type: "string", required: true, label: { en: "Client id" } },
        { key: "webhook_secret", type: "secret", required: true, label: { en: "Webhook secret" } },
      ],
    },
    connections: {
      workspace: {
        scope: "static",
        label: { en: "Workspace" },
        fields: [{ key: "owner", type: "string", label: { en: "Owner" }, managed: true }],
        flow: {
          type: "oauth2",
          authorize_url: "https://tracker.example/authorize",
          token_url: "https://tracker.example/token",
          client_id: "{vendor.client_id}",
          after_connect: {
            request: {
              method: "GET",
              url: api("/user/installations"),
              paging: { kind: "link_header", items: "response.body.installations", max_pages: 3, on_limit: "truncate" },
            },
            map: '($found := response.body[id = $$.params.installation_id]; {"values": {"owner": $found.account}, "account_label": $found.account})',
            refuse_when: "$not($exists(result.values.owner))",
            code: "not-installed",
          },
        },
        health: {
          request: { method: "GET", url: `${api("/installations/")} & connection.owner` },
          every: "15m",
          states: [
            { status: 404, state: "removed" },
            { status: 403, when: 'response.body.reason = "suspended"', state: "suspended" },
          ],
        },
      },
      account: {
        scope: "interactive",
        label: { en: "Your account" },
        fields: [],
        flow: {
          type: "oauth2",
          authorize_url: "https://tracker.example/authorize",
          token_url: "https://tracker.example/token",
          client_id: "{vendor.client_id}",
        },
      },
    },
    webhooks: {
      verify: { scheme: "hmac_sha256", header: "X-Signature", prefix: "sha256=", encoding: "hex", secret: "{vendor.webhook_secret}" },
      dedup: "X-Delivery",
      route: { path: "installation.account", connection: "workspace", field: "owner" },
      events: [
        {
          when: 'headers."x-event" = "issues" and payload.action = "opened"',
          emit: "issue-opened",
          map: '{"number": payload.issue.number, "title": payload.issue.title}',
          // The install's own value, and a link on each task the title names by the prefix or an earlier one.
          write:
            '[{"target": {"install": true}, "set": {"issues.last_opened": payload.issue.number}}, ' +
            '$match(payload.issue.title, /\\b([a-z][a-z0-9]*)-([0-9]+)\\b/i)[$lowercase(groups[0]) in $append($$.settings.prefix, $$.aliases.prefix)]' +
            '.{"target": {"kind": "task", "id": $number(groups[1])}, "upsert": {"issues.linked": [{"ref": $string($$.payload.issue.number), ' +
            '"url": $$.payload.issue.html_url, "text": "#" & $$.payload.issue.number, "state": {"status": "open"}}]}}]',
        },
        {
          when: 'headers."x-event" = "issues" and payload.action = "closed"',
          write: '[{"target": {"holding": {"key": "issue.number", "value": $string(payload.issue.number)}}, "set": {"issue.state": "closed"}}]',
        },
      ],
      status: [{ when: 'headers."x-event" = "installation" and payload.action = "suspend"', connection: "workspace", state: "suspended" }],
    },
    schedules: {
      sync: {
        every: "1h",
        endpoint: "updated-issues",
        params: '{"since": since}',
        write:
          '[$map(result.numbers, function($n, $i) { {"target": {"holding": {"key": "issue.number", "value": $string($n)}}, "set": {"issue.state": result.states[$i]}} })]',
      },
    },
    endpoints: {
      "open-issues": openIssues,
      label,
      search,
      assign,
      "issue-opened": issueOpened,
      "create-issue": createIssue,
      "updated-issues": updatedIssues,
      "link-issue": linkIssue,
    },
    fields: {
      "issue.link": { name: { en: "Issue" }, kind: "link", on: ["task"] },
      "issue.state": { name: { en: "State" }, kind: "text", on: ["task"] },
      "issues.linked": {
        name: { en: "Linked issues" },
        kind: "link",
        list: true,
        on: ["task"],
        states: {
          status: { name: { en: "Status" }, values: { open: { label: { en: "Open" }, tone: "positive" }, closed: { label: { en: "Closed" }, tone: "muted" } } },
        },
        actions: ["unlink-one"],
      },
    },
    parts: {
      issue: {
        name: { en: "Issue" },
        on: ["task"],
        tree: {
          type: "section",
          children: [
            { type: "field", props: { field: "issue.link" } },
            { type: "value", props: { field: "issue.state" } },
            { type: "button", props: { action: "create" } },
            { type: "text", props: { text: { en: "Name {settings.prefix}-{item.id} in an issue's title to link it." }, tone: "muted" } },
          ],
        },
      },
    },
    actions: {
      create: {
        name: { en: "Create an issue" },
        endpoint: "create-issue",
        on: ["task"],
        write: '{"set": {"issue.number": result.number, "issue.link": {"url": result.url, "text": "#" & result.number}, "issue.state": "open"}}',
      },
      unlink: {
        name: { en: "Unlink the issue" },
        on: ["task"],
        menu: true,
        permission: "unlink",
        write: '$exists(held."issue.number") ? {"set": {"issue.number": null, "issue.link": null, "issue.state": null}}',
      },
      link: {
        name: { en: "Link an issue" },
        endpoint: "link-issue",
        params: ["number"],
        on: ["task"],
        write:
          '{"upsert": {"issues.linked": [{"ref": $string(result.number), "url": result.url, "text": "#" & result.number & " " & result.title, "state": {"status": result.state}}]}}',
      },
      "unlink-one": { name: { en: "Unlink" }, on: ["task"], write: '{"remove": {"issues.linked": [element]}}' },
    },
    settings: { prefix: { type: "string", label: { en: "Reference prefix" }, unique: true, assigned: "community_name" } },
    permissions: [{ id: "unlink", level: "initiative", name: { en: "Unlink issues" } }],
    help: { en: "Links issues to tasks. Name a task's reference in an issue's title, such as **acme-7**, to link it." },
  });
}
