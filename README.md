# initiative-plugin-sdk

Build a plug-in for [Initiative](https://github.com/beyonders-studio/initiative): a
service that reads and writes a community's content, answers Initiative's
calls, and draws tiles on its dashboards.

A plug-in is its logic. You write one typed definition of its endpoints, hooks,
schedules, widgets and listing; the SDK serves it, verifies Initiative's calls,
holds its tokens, and builds its manifest.

| Import | Holds |
|---|---|
| `initiative-plugin-sdk/manifest` | `definePlugin`, `defineEndpoint`, the contract's types, `validateManifest`, `pluginApiCompatible` |
| `initiative-plugin-sdk/server` | `createPlugin`, `serve`, `EndpointError` |
| `initiative-plugin-sdk/client` | `Initiative` and the `Client` it gives, acting as the community or a member; plug-in keys |
| `initiative-plugin-sdk/widget` | What a widget is handed, and the scenes it returns |
| `initiative-plugin-sdk/parts` | The components a part's tree is built from: `Section`, `Stack`, `Field`, `Value`, `Text`, `Button` |
| `initiative-plugin-sdk/jsx-runtime` | JSX for a part's tree, with no React |
| `initiative-plugin-sdk/testing` | A declarative plug-in's requests, maps and writes, run against recorded vendor answers |
| `initiative-plugin-sdk/plugin-api.json` | The plug-in API contract: the OpenAPI document of every route a plug-in may call |
| bin `initiative-plugin` | `init`, `build`, `pack`, `dev`, `validate`, `keygen`, `uid`, `schema` |

Node 20 or later. Two runtime dependencies, `ajv` and `jsonata`; everything
cryptographic uses `node:crypto`. `initiative-plugin build` bundles widgets with
[esbuild](https://esbuild.github.io/), which you install beside the SDK:

```sh
npm install initiative-plugin-sdk
npm install --save-dev esbuild
```

## 1. Define the plug-in

```ts
// src/plugin.ts
import { definePlugin, defineEndpoint } from "initiative-plugin-sdk/manifest";

export const openTickets = defineEndpoint({
  direction: "read",
  label: { en: "Open tickets" },
  params: { project: { type: "string", label: { en: "Project" } } },
  returns: {
    titles: { type: "string", list: true },
    total: "int",
  },
  handler: async ({ params, installation, client }) => {
    const tickets = await lookUp(installation, params.project);
    return { result: { titles: tickets.map((ticket) => ticket.title), total: tickets.length } };
  },
});

export default definePlugin({
  publicId: "acme.tracker",
  uid: "K7M2QX8N4TVB9C", // npx initiative-plugin uid, once
  name: "Acme Tracker",
  scopes: ["projects:read", "comments:write"],
  endpoints: { "open-tickets": openTickets },
  schedules: {
    sweep: { every: "15m", run: async ({ since, installation, client }) => { /* … */ } },
  },
  widgets: {
    "open-count": {
      meta: { name: { en: "Open tickets" } },
      endpoints: ["open-tickets"],
      module: "src/widgets/open-count.ts",
      sample_data: { "open-tickets": { total: 12 } },
    },
  },
});
```

- **Types come from the definition.** An endpoint's `params` type what its
  handler is handed, and its `returns` type what the handler answers with: a
  return of the wrong type, or one the endpoint does not declare, does not
  compile. A widget or a summary naming an endpoint that is not a declared read
  does not compile either.
- **Endpoints are named by their key.** The manifest id is
  `plugin.<publicId>.<key>`, and everywhere the definition refers to an endpoint
  (a widget, a sample, a parameter's `options_from`, a bundled dashboard, an
  action) it uses the key.
- **Everything else is the contract's own shape**, from
  [`manifest.contract.json`](manifest.contract.json): `vendor`, `connections`
  (keyed by id), `webhooks`, `pages` (keyed by id),
  `dashboards`, `fields` (keyed by metadata key), `parts` and `actions` (keyed
  by id), `settings` (keyed by setting key) and `help`. The types are
  generated from the contract, so every term the contract declares has a type
  here.
- **Features follow from what is filled in.** A plug-in with widgets declares
  `widgets`, and so on.

### What a handler is handed

| | |
|---|---|
| `params` | What the caller sent, by the declared names. Initiative sends strings; an automation may send numbers and booleans as they are. |
| `installation` | The community, by the reference this plug-in knows it by. It stays the same across uninstall and reinstall, until the community erases the plug-in's data, so it is what your own rows key on. Member references hold the same way. |
| `community_status` | Where the community stands: `active`, `read_only`, `suspended`, `on_hold` or `deleted`. Anything but `active` means hold back work done on its behalf. |
| `actor` | `{ kind: "installation" }`, or `{ kind: "member", member }` when another plug-in called as one of the community's members. |
| `caller` | The plug-in that made the call through Initiative, or null for Initiative's own. |
| `initiative` | The initiative the call is confined to, or null. |
| `connections` | Connection id → the handle Initiative gives a vendor token for. |
| `viewer` | On a call one of the plug-in's actions made: the reader who ran it, by this installation's reference for them. Otherwise null. |
| `subject` | On a call one of the plug-in's actions made: the item it was run on, `{ type, id }`. Otherwise null. |
| `client` | Initiative, already acting as `actor` and narrowed to `initiative`. |
| `context` | What you gave `createPlugin` (below). |

A handler answers `{ result }`, and `actor` too when the call ran on another
credential than the call's own (a read that always uses the community's
installation, say). To refuse, throw `new EndpointError(status, code, detail)`;
anything else thrown is answered 500 and logged.

A `write` is reachable through another plug-in, as one of the actors it
declares, and only when it is `public`; or through one of the plug-in's own
actions, on an item kind the action is offered on, as the installation. The
SDK refuses anything else before the handler runs.

### Hooks

```ts
hooks: {
  after_connect: async ({ connection, actor, access_token, params, client }) => {
    const login = await vendorLogin(access_token);
    return { values: { login }, account_label: `@${login}` }; // or { refuse: true }
  },
  revoke: async ({ connection, access_token, refresh_token, values }) => { /* end the grant */ },
  webhook: async ({ connection, headers, body, client }) => {
    await client.emitEvent({ eventType: "plugin.acme.tracker.ticket-opened", payload: { number: 7 } });
  },
},
```

- `after_connect` runs once a connection's flow has exchanged its code, when
  the flow sets `after_connect`.
- It also runs when an admin saves a static connection without a flow that
  sets `after_connect: true` beside its `fields`, before anything is stored:
  `access_token` is null and `values` holds what they typed, secrets included.
  Check them at the vendor and answer the connection's managed values and an
  account label, or `{ refuse: true }` to store nothing. This is where a
  plug-in makes the vendor's webhooks for the connection, with a secret of 32
  random bytes kept in a managed `secret` field.
- `revoke` runs when a connection whose flow says `revoke: "hook"` ends. A
  flow can instead have Initiative end the grant itself: `rfc7009` posts to
  `revoke_url`, and `github_grant` sends GitHub's "Delete an app authorization"
  (`DELETE` with the client's credentials and the access token) to it.
- `revoke` also runs when a connection with `after_connect: true` beside its
  `fields` is cleared or replaced, or a value it checked is not kept, with the
  `values` it held, so you can remove what you made at the vendor.
- `webhook` runs once per community for each vendor delivery Initiative
  received, checked and routed; `headers` are the vendor's `x-` headers,
  lowercased, and `body` is exactly what the vendor sent. Initiative checks a
  delivery under `webhooks.verify.secret`: one vendor value,
  `{vendor.<key>}`, or a managed `secret` field of the routed connection,
  `{<key>}`. With a connection's secret, it routes the delivery first and
  checks it under the secret of each connection its route value names. A
  delivery whose body a community already has is not handed on again.
- Each schedule's `run` is called once per community each interval, with
  `since`: when it last succeeded there, or null the first time.

A hook that throws is answered 500: a connection is then not recorded, and a
delivery or a schedule is tried again.

### The community's own hooks

Five hooks are about the community's install rather than a connection. Each
is optional; a plug-in that defines none is answered 404, and Initiative stops
sending that hook.

```ts
hooks: {
  installed: async ({ installation }) => { /* a first install, or a return */ },
  uninstalled: async ({ installation }) => { /* keep what you hold: it may come back */ },
  erase: async ({ installation }) => { /* delete everything about this community */ },
  community_status: async ({ installation, status }) => { /* pause unless active */ },
  entitlement: async ({ installation, version, values }) => { /* keep the newest */ },
},
```

- `installed` runs when the community installs the plug-in, and again if it
  returns after an uninstall. It comes back under the same `installation`
  and the same member references, so whatever you kept for it still fits.
- `uninstalled` runs when it removes the plug-in. Its references stand.
- `erase` runs when the community asks for the plug-in's data to be deleted,
  or is itself purged. Delete everything you hold for it. Once the hook
  answers, Initiative forgets the references, and a later install starts
  afresh under new ones. A hook that throws is asked again.
- `community_status` runs whenever the community's standing changes. The same
  value rides every call as `community_status`, so a missed hook is caught up
  on the next call.
- `entitlement` carries billing's statement of what this community holds of
  the plug-in: `values`, whose keys are agreed between the plug-in and
  billing, and a `version` that rises with each statement. Statements can
  repeat or arrive out of order, so keep the highest version you have seen and
  ignore a lower one. A deployment with no billing never sends one. The SDK
  verifies each statement before your hook sees it: see
  [Entitlement statements](#entitlement-statements).

### Entitlement statements

What a community holds of a plug-in (its allowance, the packs it bought) is
decided by billing, not by Initiative. So that a compromised Initiative cannot
grant itself an entitlement, billing signs each statement with a key of its
own, Initiative stores the statement and hands it on verbatim, and your
plug-in checks billing's signature. Initiative can withhold a statement; it
cannot mint or change one.

A statement is a compact JWS. Its header is
`{"alg": "EdDSA", "typ": "initiative-entitlement+jwt", "kid": …}`, and its
claims are `{"iss": "initiative-billing", "listing_uid", "community_ref",
"version", "values", "iat"}`. It has no expiry: it holds until a higher
version replaces it. The `entitlement` hook's body, and what
`client.entitlement()` reads, are both `{"statement": "<jws>"}`.

Billing's public key reaches your plug-in from the deployment, never from
Initiative: it is the runtime fact `entitlement_issuer_key`, an SPKI PEM in
`INITIATIVE_ENTITLEMENT_ISSUER_KEY_PEM`. `initiative-plugin build` adds that
fact to the runtime of every plug-in with an `entitlement` hook, so you need
not declare it, and refuses it under any other variable name.

The SDK checks every statement, on the hook and on `client.entitlement()`, in
this order, and refuses it at the first failure:

1. the key is configured and is Ed25519; without one, every statement is
   refused, and the plug-in logs why once;
2. the header's `alg` is exactly `EdDSA` and its `typ` exactly
   `initiative-entitlement+jwt`: the header never chooses the algorithm, so
   `alg: none` or an HMAC trick goes nowhere;
3. the Ed25519 signature over the JWS signing input;
4. `iss` is `initiative-billing`, `listing_uid` is your plug-in's own `uid`,
   `version` is a whole number of one or more, and `values` is an object.

Only then is your hook called, with `version` and `values` taken from the
verified claims and nothing else in the body. A refused statement is answered
`422 {"error": "statement-refused", "detail": "<reason>"}` and never reaches
your hook; `client.entitlement()` throws `EntitlementStatementError`, whose
`reason` is one of `no-key`, `bad-key`, `malformed`, `alg`, `typ`,
`signature`, `iss`, `listing` or `claims`.

**What it does not cover.** `community_ref` is billing's own pairwise
reference for the community, which your plug-in cannot relate to the
`installation` Initiative names. Initiative still vouches for which community a
statement is for, so a compromised Initiative could at worst copy a real,
signed statement from one community onto another. That gap is accepted.

**Alerts.** The SDK counts, for the process's life:

- every statement by outcome, `applied` (verified and handed on) or
  `refused-<reason>`;
- every grant of an unlimited allowance (`monthly_allowance: null`) to a
  community whose last statement the process saw did not grant one. The memory
  is the process's own, so after a restart the first such statement counts
  again.

`entitlementMetrics()` answers them as an object, and `entitlementMetricsText()`
in the Prometheus text format, to append to what your metrics endpoint serves:
`initiative_plugin_entitlement_statements_total{outcome="…"}` and
`initiative_plugin_entitlement_unlimited_grants_total`. Alert on any
`refused-*` and on any rise in unlimited grants. Neither ever refuses a
correctly signed statement.

**If you self-host.** A deployment that runs billing mints its statement
keypair and fills `INITIATIVE_ENTITLEMENT_ISSUER_KEY_PEM` for each plug-in that
declares the fact. A deployment with no billing leaves it unset: it sends no
statements, and any that did arrive would be refused.

### The vendor's own setup

`vendor.fields` are the values an operator gives once per deployment for the
vendor's client. When the vendor can create that client itself, `vendor.setup`
says how, and Initiative runs it from the operator's browser and writes what
the vendor answers into those fields. One kind exists, `github_app_manifest`
(GitHub's app manifest flow):

```ts
vendor: {
  fields: [
    { key: "app_id", type: "string", required: true, label: { en: "App id" } },
    { key: "private_key", type: "secret", required: true, label: { en: "Private key" } },
    // …
  ],
  setup: {
    kind: "github_app_manifest",
    app: {
      name: "Acme Tracker",
      url: "https://tracker.acme.example",
      default_permissions: { issues: "write", metadata: "read" },
      default_events: ["issues"],
    },
    values: { app_id: "id", private_key: "pem" /* , … */ },
  },
},
```

- `app` is what GitHub is asked to create: its name, its homepage (https),
  whether any account may install it (`public`, default false), and its
  permissions and events by GitHub's names. Initiative fills in the callback,
  setup, webhook and redirect URLs itself, so `app` names none.
- `values` maps each of your vendor field keys to one field of GitHub's answer:
  `id`, `slug`, `client_id`, `client_secret`, `pem` or `webhook_secret`. Each
  key must be a vendor field, each answer is written at most once, and
  `client_secret`, `pem` and `webhook_secret` go to `secret` fields.

### A token minted on demand

A static connection's `token` has Initiative mint its access token rather than
store one: it signs a JWT with a vendor key, posts it to the vendor's
`exchange_url`, and caches the answer until shortly before it expires.
`exchange_body` is a JSON body posted with it, such as the narrower
permissions a token is asked for:

```ts
token: {
  type: "jwt_bearer",
  exchange_url: "https://api.tracker.example/installations/{installation_id}/tokens",
  exchange_body: { permissions: { issues: "write", contents: "read" } },
  iss: "{vendor.app_id}",
  key: "{vendor.private_key}",
},
```

`exchange_url`, `iss` and every string in `exchange_body` may name a vendor
value as `{vendor.<key>}` and one of the connection's own fields as `{<key>}`;
`validateManifest` refuses a name that neither declares.

`exchange_body` may instead be an expression answering the body from
`connection` alone, the connection's own non-secret fields, managed ones
included, so the body can differ by connection: a vendor may refuse a token
request naming a permission the installation does not hold. A body that names a
vendor value stays an object. An answer that is not an object fails the token
request, so the connection cannot be used until the expression answers one.
`runExchangeBody` from `initiative-plugin-sdk/testing` answers the body
Initiative posts for a connection's `fields` and `vendor` values.

```ts
// account_type is a managed field; only an organization's installation holds "members"
exchange_body:
  '{"permissions": $merge([{"issues": "write"}, connection.account_type = "organization" ? {"members": "read"} : {}])}',
```

### Pages

A page is one of your plug-in's screens, framed by Initiative:

```ts
pages: {
  board: {
    path: "/board",
    name: { en: "Board" },
    scopes: ["initiative"],
    handler: async ({ request, handoff }) => {
      if (!handoff) return servePage(request); // the page's own files
      return startSession(handoff.viewer, handoff.initiative);
    },
  },
},
```

Initiative hands the frame a one-use handoff token. Send it from the page to
any path under the page's as `Authorization: Bearer …`: the SDK verifies it
(type, signature, audience, page, and that it was not used before) and hands the
handler `viewer`, `admin`, `initiative` and a `client` acting as the
installation, narrowed to that initiative.

### Sign in with Initiative

A plug-in with pages may also be opened at its own address, full-window.
People sign in there with their Initiative account and land in one of your
pages; your plug-in keeps no accounts of its own. Name the page and the path
Initiative sends them back to:

```ts
signIn: { page: "board", returnPath: "/signed-in" },
```

The return address is that path on the origin your pages are served from,
matched exactly. The flow is OpenID Connect's authorization code flow, and
`initiative.signIn` is the whole client half:

```ts
const initiative = new Initiative({ baseUrl, publicId, key });

// 1. Send the person to Initiative; keep the rest in your own session.
const { url, ...pending } = initiative.signIn.begin({ redirectUri: "https://board.example.com/signed-in" });
session.pending = pending;
return Response.redirect(url, 302);

// 2. They come back to /signed-in, having chosen where to open the page.
const signedIn = await initiative.signIn.complete(request.url, session.pending);
startSession(signedIn.claims, signedIn.refreshToken); // the handoff's claims for that place

// 3. Before signedIn.expiresAt, renew on the server.
const renewed = await initiative.signIn.refresh(refreshToken);
```

The ID token carries what a handoff carries for the place they chose (`sub`,
`community_ref`, `surface_id`, `community_admin`, and `initiative_id` with
`initiative_moderator` inside an initiative), and nothing about their name,
address or other communities. Its issuer is the deployment's own address, so a
handoff is never accepted as an ID token, nor the other way round. Every
renewal asks Initiative again whether the person is still signed in there and
may still open the page in that place: an `invalid_grant` (`SignInError`) ends
your session. Another community is another sign-in.

### Where a community stands

`communitySummary` names a read whose returns say what a community has used and
is allowed. A deployment may draw them on the community's settings page, each
under its own `label`. A return with `of` is counted against another, so the two
are drawn as one measure:

```ts
returns: {
  runs_used: { type: "int", label: { en: "Runs this month" }, of: "allowance" },
  allowance: { type: "int", label: { en: "Monthly allowance" } }, // null: no ceiling
  pack_credits: { type: "int", label: { en: "Credits left" } },
  resets_on: { type: "datetime", label: { en: "Resets" } },
},
```

### Minimum age

`minimumAge` says how old somebody must be to use the plug-in, by ISO 3166-1
alpha-2 country, with `default` for every country not listed:
`{ default: 16, US: 13 }`. It is a declaration; whether a deployment enforces
it is the deployment's decision.

### Fields, parts and actions

What a plug-in adds to the views and pages of Initiative's items: tasks,
calendar events, counters and posts
(`ITEM_KINDS`). Initiative draws all of it with its own components, so no
plug-in code runs in a reader's browser, and the community's managers place
it; a plug-in never places itself. Any plug-in may declare them, container or
declarative.

**Metadata** is what the plug-in keeps on an item or on its own install: values
by key (a lowercase letter, then lowercase letters, digits, `_` and `.`), held
by Initiative. A container writes them with its installation token
(`client.metadata`, below); for a declarative plug-in, Initiative writes them
from the plug-in's expressions ([Declarative integrations](#declarative-integrations)).
Initiative enforces its sizes: a value of at most 8192 bytes as JSON,
32 keys and 64 KiB on one item, and 256 keys and 1 MiB on the install. A
string of at most 255 characters can be found by.

**A field** says how one metadata key is shown. Initiative draws the value with
its own component for `kind` and computes its plain text itself, so a field
filters, sorts and exports with no call to the plug-in.

| `kind` | The value |
|---|---|
| `text` | a string |
| `number` | a number |
| `date` | `"YYYY-MM-DD"` |
| `datetime` | ISO 8601, with its offset |
| `link` | `{ url, text? }` |
| `badge` | `{ text, tone? }` |
| `scale` | a number from 0 to 100, or `{ value, max }` |
| `checkbox` | a boolean |
| `url` | an address, as a string |
| `currency` | a number, in the field's `currency` |
| `select` | the `value` of one of the field's `options` |
| `multi_select` | a list of them |
| `user_reference` | a person: the install's own reference for them |

A `scale` is drawn as a number, stars or a bar. Written as `{ value, max }`, it
is kept as value ÷ max × 100: `{ value: 3, max: 5 }` is 60. A
`user_reference` is the `id` Initiative gives the person wherever the plug-in
reads one, such as a task's assignees or the community's roster.

```ts
fields: {
  "demo.link": { name: { en: "Demo" }, kind: "link", on: ["task"], description: { en: "The task's demo" } },
  "demo.opened": { name: { en: "Opened" }, kind: "number", on: ["task"] },
  "demo.budget": { name: { en: "Budget" }, kind: "currency", currency: "EUR", on: ["task"] },
  "demo.stage": {
    name: { en: "Stage" },
    kind: "select",
    on: ["task"],
    options: [
      { value: "draft", label: { en: "Draft" } },
      { value: "live", label: { en: "Live" }, color: "#2f9e44" },
    ],
  },
},
```

`on` is the item kinds it is offered on; `description` is the line the view
editor's Add picker shows; `tone` is a badge's tone when its value names none
(`accent`, `positive`, `negative`, `warning`, `neutral`, `muted`). A `currency`
field names its ISO 4217 code in `currency`. A `select` or `multi_select` field
lists its `options`, up to 24, each a `value` (a letter or a digit, then up to
63 letters, digits, `_` and `-`, unique among them), a
`label` in the reader's language and an optional `color` as `#rrggbb`.

**A list field**, `list: true`, holds several values: its value is a list of
elements, each one value of the field's `kind` with a `ref` of 1 to 255
characters that tells it from the others. Any kind but `multi_select`, whose
one value is already several, may be a list. A `link` or `badge` element is the
kind's own object with its `ref`, such as `{ ref, url, text? }`; a `scale`
element is `{ ref, value, max? }`, out of 100 without `max`; every other kind's
element is `{ ref, value }`. Initiative keeps each element as a value of its
own, held to the size of one value, and finds an element by its `ref`.

**States** say what state a value is in, in the plug-in's own words: up to 4
facets, each with up to 12 keys. A value names a key of each facet it is in as
`state`, and Initiative draws one badge per facet, labelled in the reader's
language. A list element, and a `link`, `badge` or `{ value, max }` `scale`
value, carries `state` beside its other properties; any other value that
carries one is written as an element is, without the `ref`: `{ value, state }`.

```ts
fields: {
  "tracker.issues": {
    name: { en: "Issues" },
    kind: "link",
    list: true,
    on: ["task"],
    states: {
      status: {
        name: { en: "Status" },
        values: { open: { label: { en: "Open" }, tone: "positive" }, closed: { label: { en: "Closed" }, tone: "muted" } },
      },
    },
    actions: ["unlink"],
  },
},
// an element: { ref: "12", url: "https://tracker.example/issues/12", text: "#12", state: { status: "open" } }
```

A list field's `actions` are offered on each of its elements, and each is
offered on every item kind the field is. They are a declarative plug-in's: an
action run from an element reads the element's `ref` as `element`, and a
container's handler is told the item alone.

**An action** runs on one item, from a part's button, from the item's own menu
with `menu: true`, or from an element of a list field that offers it. A
container plug-in's action names one of its write endpoints: Initiative calls
it as the installation, with `viewer` and `subject` set, and the handler does
the work, usually writing metadata. A declarative plug-in's names an endpoint,
a `write`, or both, and Initiative does the work itself. Either way Initiative
then answers the reader with the item's metadata as it stands. With `confirm`,
Initiative asks first; with `admin_only: true`, only the community's admins may
run it.

`params` names the endpoint's params Initiative asks the reader for before it
runs the action, in a form drawn from their own declarations: each one's type,
label, and `options` or `options_from`. The endpoint is sent the reader's
answers and nothing else, so every param it requires is among them.

```ts
actions: {
  "new-link": { name: { en: "New link" }, endpoint: "create-link", params: ["url"], on: ["task"], menu: true },
},
```

**A part** is a tree of Initiative's components bound to the plug-in's fields
and actions, at most 50 nodes and 4 deep. Initiative places at most 3 of a
plug-in's parts on one item.

| Component | Props | Holds nodes |
|---|---|---|
| `section` | `title?`, `collapsed?` | yes |
| `stack` | `direction?` (`row`, `column`), `gap?` (`none`, `small`, `medium`, `large`), `wrap?` | yes |
| `field` | `field`: a field's key. Its label and value. | no |
| `value` | `field`: a field's key. Its value alone. | no |
| `text` | `text`, `tone?` | no |
| `button` | `action`: an action's id; `variant?` (`primary`, `secondary`, `ghost`) | no |

Every field and action a part names must be offered on each kind in the
part's `on`. A `text` node's text may name `{item.id}`, the item's id, and
`{settings.<key>}`, one of the plug-in's [settings](#settings-and-help), which
Initiative fills in when it draws the part; `validateManifest` refuses any
other `{…}`. A tree is plain data, `{ type, props?, children? }`, or JSX
through the SDK's runtime, which the build turns into the same data:

```tsx
/** @jsxImportSource initiative-plugin-sdk */
import { Button, Field, Section, Stack, Text, Value } from "initiative-plugin-sdk/parts";

parts: {
  demo: {
    name: { en: "Demo" },
    on: ["task"],
    tree: (
      <Section title={{ en: "Demo" }}>
        <Field field="demo.link" />
        <Stack direction="row" gap="small">
          <Value field="demo.opened" />
          <Text text={{ en: "times opened" }} tone="muted" />
        </Stack>
        <Button action="new-link" />
      </Section>
    ),
  },
},
```

The pragma, or `"jsx": "react-jsx"` and `"jsxImportSource":
"initiative-plugin-sdk"` in `tsconfig.json`, selects the runtime. A fragment's
children join the node that holds it, and `null` and `false` children are left
out. `key` is JSX's own and is not passed on, which is why a field is named by
`field`.

### Settings and help

**Settings** are values the community's admins see and may change on the
install, keyed by setting key, at most 16. A part's text names one as
`{settings.<key>}`, and a declarative plug-in's expressions read them as
`settings.<key>`.

```ts
settings: {
  prefix: { type: "string", label: { en: "Reference prefix" }, unique: true, assigned: "community_name" },
},
```

A `unique` setting's value is held by no other community on the deployment for
this plug-in, and is a lowercase letter, then lowercase letters and digits, 2
to 16 characters in all (`^[a-z][a-z0-9]{1,15}$`), so a reference such as
`acme-7` reads one way. With `assigned: "community_name"`, Initiative gives it a
value when the community installs the plug-in: the letters and digits of the
community's name, in lowercase, with a short random suffix when another
community holds that value. An admin may rename it. The earlier values stay the
community's, and expressions read them as `aliases.<key>`, so a reference made
under one still resolves.

**Help** is markdown, by language tag, at most 2000 characters in each.
Initiative shows it behind a "?" on the headers of the plug-in's parts and on
its settings:

```ts
help: { en: "Links issues to tasks. Name a task's reference, such as **acme-7**, in an issue's title to link it." },
```

## 2. Widgets

A widget is a module exporting `render`, typed from the endpoint it draws:

```ts
// src/widgets/open-count.ts
import type { Scene, WidgetData } from "initiative-plugin-sdk/widget";
import type { openTickets } from "../plugin.js";

export function render(data: WidgetData<typeof openTickets>): Scene {
  return { v: 1, scene: { kind: "metric", value: data.values.total ?? 0, label: "Open" } };
}
```

`data.rows` holds one entry per index across the endpoint's `list` returns,
and `data.values` its single-valued returns. `render` also receives the tile's
options and `{ locale, slots }`.

The build bundles each widget, with everything it imports, into the one script
Initiative runs in a sandbox with no network, DOM or timers, and checks the
contract's size cap. A widget imports nothing at run time.

## 3. Build

```sh
npx initiative-plugin build              # writes manifest.json
npx initiative-plugin build --check      # CI: fails if manifest.json is stale
```

`build` reads `src/plugin.ts` (`--plugin <file>` for another), bundles the widgets,
checks the result with `validateManifest`, and writes `manifest.json`. Commit
it and ship it with the plug-in: the server serves it, and refuses to start if it
no longer matches the definition.

## 4. Serve

```ts
// src/main.ts
import plugin from "./plugin.js";
import { createPlugin, serve } from "initiative-plugin-sdk/server";

serve(createPlugin(plugin));
```

`createPlugin(plugin, options)` returns a web-standard `(Request) => Promise<Response>`
handler, so the same plug-in runs on any runtime, or behind any framework, that
speaks `Request` and `Response`. `serve` runs it on `node:http`, on `PORT`
(default 8080).

| Route | |
|---|---|
| `GET /healthz`, `GET /readyz` | Answer once the process is up. |
| `GET /.well-known/jwks.json` | The plug-in's public key. |
| `GET /.well-known/initiative-plugin.json` | The manifest document: the manifest with the plug-in's id, uid and name. |
| `GET, POST /v1/endpoints` | What the plug-in declares; Initiative's endpoint calls, on a context token. |
| `POST /v1/hooks/{name}` | Initiative's hook calls, on a lifecycle token for that hook. |
| a page's path | The page's handler. |

Every call's token is an EdDSA JWT, verified against the deployment's JWKS,
which is cached and refetched once for a key it does not know. Only the set's
Ed25519 keys are read, and a token signed any other way (RS256, ES256, `none`) is
refused. Each kind carries its own `typ`
(`initiative-context+jwt` on endpoint and hook calls, `initiative-handoff+jwt` on
a page handoff), and each path takes only its own kind. Bodies are capped at 5 MiB. A
refusal answers `{ "error": code, "detail": sentence }`.

| Option | Default | |
|---|---|---|
| `baseUrl` | `INITIATIVE_BASE_URL` | Initiative's API as the plug-in reaches it, such as `http://initiative:8173/api/v1`. |
| `key` | `INITIATIVE_PLUGIN_PRIVATE_KEY`, `INITIATIVE_PLUGIN_KEY_ID` | The plug-in's key: PEM, PEM with literal `\n`, or base64 of the PEM, and the `kid` it is registered under (default: its RFC 7638 thumbprint). |
| `dataDir` | `INITIATIVE_PLUGIN_DATA_DIR`, else `data` | With no key given, one is generated on first start and kept here as `plugin-key.pem`. |
| `manifest` | `manifest.json` | The built manifest. |
| `context` | | Handed to every handler as `context`. |
| `fetch`, `now`, `log`, `env` | | For tests and other runtimes. |

**The plug-in's key.** With no key given, the plug-in generates an Ed25519 key the first
time it starts, keeps it, and serves its public half at
`/.well-known/jwks.json`. The deployment running it registers that JWKS with
Initiative, beside where the plug-in runs, in its `PLUGIN_SERVICES_CONFIG` entry or
under **Settings → Platform → Integrations → Plug-in services**. At every start
the plug-in logs each key it serves:

```text
plug-in key fingerprint: <thumbprint> (kid <kid>)
```

The fingerprint is the key's RFC 7638 SHA-256 thumbprint, base64url without
padding, the value Initiative shows when the operator connects the plug-in, so the
two can be compared. `jwkThumbprint` from `initiative-plugin-sdk/client` computes
it for a JWKS entry. To bring your own key:

```sh
npx initiative-plugin keygen --out ./secrets
```

`private-key.pem` (mode 0600) stays with the plug-in; `jwks.json` is its public
half. To rotate, publish a JWKS holding both keys, switch the plug-in to the new
one, then drop the old entry.

Every plug-in key is Ed25519, signing EdDSA, as is the deployment's own key. Its signatures are deterministic,
so there is no per-signature nonce whose reuse or bias would give the key away.
`loadPrivateKey` refuses any other kind of key. A deployment that runs the
plug-in from its package mints the key for it.

**Context.** Your own services reach handlers as `context`. Say what it holds
once:

```ts
declare module "initiative-plugin-sdk/manifest" {
  interface PluginContext {
    tracker: TrackerClient;
  }
}

serve(createPlugin(plugin, { context: { tracker: new TrackerClient() } }));
```

## 5. Call Initiative

A handler's `client` already acts for its call. Outside a call, make one:

```ts
import { Initiative, loadPrivateKey } from "initiative-plugin-sdk/client";

const initiative = new Initiative({
  baseUrl: "https://initiative.example.com/api/v1",
  publicId: "acme.tracker",
  key: loadPrivateKey(pem, "plugin-1"),
});

for (const { installation, active } of await initiative.installations()) {
  if (!active) continue; // paused: keep what you hold for it
  const client = initiative.asInstallation(installation);
  const { items } = await client.api.listProjects({ query: { initiative_id: 12 } });
}
```

An `Initiative` made by hand reads `client.entitlement()` only when it is given
something to check statements with: `entitlements: new EntitlementStatements({
listingUid: plugin.uid })`, which reads billing's key from
`INITIATIVE_ENTITLEMENT_ISSUER_KEY_PEM`. The server's own client has one.

- `asInstallation(installation, { initiative, scopes })` acts as the community,
  optionally narrowed to one initiative the plug-in is placed in and fewer scopes.
- `asMember(installation, member, { purpose, initiative })` acts for one
  member, within what they consented to (`client.requestConsent(…)`);
  `ConsentRequiredError` says they have not.
- `client.api` has a typed method for every route Initiative's plug-in API
  describes, named after the route's operation id in camel case. A call takes
  its arguments by where they go, and answers the route's typed response:

  ```ts
  const task = await client.api.updateTask({ path: { task_id: 7 }, body: { title: "Ship it" } });
  await client.api.archiveEntity({ path: { entity_type: "file", entity_id: 3 } });
  ```

  No call is sent unless the token holds the scope it needs: the route's own,
  the one its argument picks (`archiveEntity` on a `file` needs
  `files:write`), or, where Initiative checks each item, at least one of
  them. `MissingScopeError` names the scope instead. Writing implies reading.

  `client.api` is generated from the plug-in API contract this SDK publishes
  ([The plug-in API contract](#the-plug-in-api-contract)), so it changes as
  the contract does: a minor release adds routes and fields, and only a major
  release removes or changes one.
  `PluginApiSchemas["TaskRead"]` names a schema's type.
- `client.request(method, path, { scope, body })` calls a community route (the
  path after `/c/{community}`) by hand, with the same scope check.
- `client.callPlugin(publicId, endpointId, params)` calls another plug-in's public
  endpoint through Initiative. It needs `plugins:<publicId>` among the plug-in's
  scopes, granted by the community. A plug-in that uses whichever plug-ins a
  community lets it sets `callsPlugins: true` (the manifest's
  `service.calls_plugins`) instead of naming each: a community that installs
  another plug-in is asked there whether this one may use it, which grants the
  scope.
- `client.metadata`, the plug-in's metadata, always on the installation's
  token: `get(itemKind, ids)` answers each item's values by id;
  `set(itemKind, id, values)` writes some of one item's values, a null
  removing its key, and answers them as they now stand; `find(key, value)`
  answers the items holding `value` under `key`, as `{ type, id }`.
  `metadata.install.get()` and `metadata.install.set(values)` do the same for
  the install's own values.
- The installation itself, on any installation token: `client.config()`,
  `client.connections()`, `client.connectionToken(ref)` for a usable vendor
  token, `client.reportConfigStatus({ state, detail })`, and
  `client.emitEvent({ eventType, payload, initiativeId })`.
- What the community holds of the plug-in: `client.entitlement()` reads the
  statement the `entitlement` hook delivers, verified the same way, or null
  when there is none, and
  `client.reportUsage({ meter, period, quantity })` reports a meter's total
  for one `YYYY-MM` period. The total is the whole period's, never an
  increment, so repeating a report is harmless. Only meters the deployment
  allows the plug-in are accepted.

The plug-in authenticates with its key (`private_key_jwt`, RFC 7523). Tokens are
opaque; the client caches each until shortly before it expires, shares one
request between concurrent callers, and sends a call answered 401 once more on
a fresh token. A refusal raises `InitiativeApiError` with Initiative's
`detail`; the token endpoint's own refusal raises `InitiativeAuthError`.

## 6. Publish

Initiative installs plug-ins from signed registries. A listing names the plug-in, its
versions, the container image each runs (pinned by digest) and the most it may
ever be granted. It names no keys: each deployment runs its own copy of the
image and registers the key that copy signs with. Declare it in the definition:

```ts
listing: {
  publisher: "acme",
  summary: "Your tracker's tickets on a dashboard and in your automations.",
  description: "…",
  avatar: "assets/avatar.png",
  images: [{ path: "assets/board.png", alt: "Open tickets on a dashboard" }],
  version: "1.2.0",
  minAppVersion: "0.72.0",
  releaseNotes: "…",
  image: "ghcr.io/acme/tracker@sha256:…",
  compose: {
    service: `tracker:
  image: \${IMAGE}
  environment:
    INITIATIVE_URL: \${INITIATIVE_URL}
  volumes: [tracker-keys:/data]`,
    baseUrl: "http://tracker:8080",
  },
},
```

`images` is optional: the screenshots on the listing page, in order, at most
12. Each is a PNG, JPEG, WebP, GIF, AVIF or SVG file with `alt` text of 1 to
300 characters for someone who cannot see it, and a file name of its own (the
avatar sits beside them in the registry source). The registry signs each one
by its digest, as it does the avatar. `pack` leaves them out: a deployment's
own listing upload takes only the avatar.

`compose` is optional: the Docker Compose service an operator copies to run
your image beside Initiative, which Initiative shows on the plug-in's settings
page. `service` is the fragment, YAML text of at most 4096 characters, with two
placeholders Initiative fills: `${IMAGE}` (`image`, pinned by its digest) and
`${INITIATIVE_URL}` (the deployment's public address). Any other `${…}` fails
the build, so a misspelt placeholder cannot ship. `baseUrl` is where the
service answers on the Compose network, an http or https URL of at most 512
characters; Initiative pre-fills the deployment's base URL with it.

`runtime` is optional too, and is for a plug-in a deployment runs for its
operator from a reviewed package. It says what the container needs, so the
deployment can run it with no code of its own:

```ts
runtime: {
  name: "tracker",
  port: 8080,
  health: { ready: "/readyz", live: "/healthz" },
  facts: { INITIATIVE_API_URL: "app_api_internal" },
  settings: [{ env: "TRACKER_MODE", required: true }],
  signingKey: { env: "TRACKER_PRIVATE_KEY_PEM" },
  database: {
    roles: [{ id: "owner", login: "tracker_owner", env: "DATABASE_URL" }],
    provisionSql: "/app/provision.sql",
  },
},
```

It holds nothing that raises a privilege. Resources, network rules, hostnames
and every key and password stay the deployment's:

- `facts` come from a fixed list: `app_url`, `app_origin`, `app_api_public`,
  `app_api_internal`, `page_origin`, `port` and `entitlement_issuer_key`
  (billing's statement key, added for you with an `entitlement` hook; see
  [Entitlement statements](#entitlement-statements)). There is no other
  channel to Initiative's own services: billing reaches a plug-in only through
  Initiative.
- `settings` are names the operator fills.
- `secrets` are generated by the deployment and kept.

The public registry refuses a listing that carries a runtime.

`minAppVersion` is the oldest Initiative release a version runs on. Beside it,
the definition's `minPluginApi` (the manifest's `min_plugin_api`) is the
oldest [plug-in API contract](#the-plug-in-api-contract) the plug-in calls, as
`"MAJOR.MINOR"`: the SDK version its `client.api` was written against.

```ts
definePlugin({ publicId: "acme.tracker", /* … */ minPluginApi: "4.1" });
```

A deployment serving contract `4.3.2` runs it; one serving `4.0.5` or `5.0.0`
does not. Leave it out and the plug-in makes no claim: it is offered on any
contract, as listings written before the field were.

```sh
npx initiative-plugin build --registry ../registry/sources
```

writes the plug-in's registry source under `<publisher>/<uid>/`: `listing.json`,
this version's `<version>/manifest.json` and the avatar. It is written only
while `listing.version` is the package's own version: between releases the
package runs ahead of its listing, and a new version is listed at its release,
with its image's digest. The registry's CI checks and signs what is merged.

A plug-in written in another language builds its manifest itself and hands the
SDK a JSON file in place of `src/plugin.ts`: its `publicId`, `uid` and `name`,
its `manifest`, and its `listing` as declared above. The manifest is checked as
a definition's is, and the listing states the version it lists:

```sh
npx initiative-plugin build --manifest plugin.json --registry ../registry/sources
npx initiative-plugin pack --manifest plugin.json
```

A self-hosted deployment can also publish a plug-in that is in no registry, from
its listing file: see [A private plug-in](#a-private-plug-in).

## Declarative integrations

A plug-in that only calls a vendor's API and reshapes the answer needs no
container. Name the `hosts` it calls and give each endpoint a `request` and a
`map` in place of a handler: Initiative makes the call with the connection's
credential, and maps the answer itself. The plug-in has no `service` block, no
image and nothing to run, and its listing registers it as `declarative`. It
may still keep values on Initiative's items, which its webhook events,
schedules and actions write and its fields and parts show.

```ts
// src/plugin.ts
import { definePlugin, defineEndpoint } from "initiative-plugin-sdk/manifest";

export const openIssues = defineEndpoint({
  direction: "read",
  label: { en: "Open issues" },
  params: { repo: { type: "string", label: { en: "Repository" }, required: true } },
  requires: { all_of: ["account"] },
  returns: { titles: { type: "string", list: true }, total: "int" },
  request: {
    method: "GET",
    url: '"https://api.tracker.example/repos/" & params.repo & "/issues"',
    query: { state: '"open"' },
    connection: "account",
  },
  map: '{"titles": response.body.title[], "total": $count(response.body)}',
});

export default definePlugin({
  publicId: "acme.tracker",
  uid: "K7M2QX8N4TVB9C",
  name: "Acme Tracker",
  hosts: ["api.tracker.example"],
  connections: {
    account: {
      scope: "interactive",
      label: { en: "Your account" },
      fields: [],
      flow: {
        type: "oauth2",
        authorize_url: "https://tracker.example/oauth/authorize",
        token_url: "https://tracker.example/oauth/token",
        client_id: "{vendor.client_id}",
      },
    },
  },
  vendor: { fields: [{ key: "client_id", type: "string", required: true, label: { en: "Client id" } }] },
  endpoints: { "open-issues": openIssues },
  listing: { publisher: "acme", summary: "Your tracker's issues.", avatar: "assets/avatar.png", version: "1.0.0" },
});
```

```ts
// test/open-issues.test.ts
import { expect, it } from "vitest";
import { runEndpoint } from "initiative-plugin-sdk/testing";
import plugin from "../src/plugin.js";
import issues from "./fixtures/issues.json" with { type: "json" };

it("lists a repository's open issues", async () => {
  const run = await runEndpoint(plugin, "open-issues", {
    params: { repo: "acme/web" },
    now: "2026-10-01T12:00:00Z",
    responses: [{ status: 200, body: issues }],
  });
  expect(run.requests).toEqual([
    {
      method: "GET",
      url: "https://api.tracker.example/repos/acme/web/issues?state=open",
      headers: {},
      connection: "account",
    },
  ]);
  expect(run).toMatchObject({ result: { titles: ["Broken build"], total: 1 } });
});
```

- **Every expression is [JSONata](https://jsonata.org)**, standard, with no
  functions added: the URL, each query parameter and header, the body or a
  GraphQL request's `variables`, and the map. An expression reads `params`,
  `connection` (the non-secret fields of the connection its request names),
  `connections` (on an endpoint, each connection its `requires` names that the
  call has, by id: `connections.workspace.owner`), `now`, and once a call has
  been answered `response` (`status`, `headers`, `body`). Every expression
  also reads `settings`, the install's [settings](#settings-and-help) by key,
  and `aliases`, each unique setting's earlier values. `build` parses every
  one and fails with its place in the manifest when one does not parse.
- **Each evaluation is bounded** by the contract's `CAPS.expressionTimeMs`,
  `CAPS.expressionDepth` and `CAPS.expressionOutputBytes`; past one, or on an
  error, the call answers `unavailable: mapping-failed`. `evaluate` from
  `initiative-plugin-sdk/testing` runs an expression within the same bounds.
- **Credentials never enter an expression.** Initiative adds the one the
  request's `connection` names, as `auth` says: `Authorization: Bearer
  <token>` unless `auth: { header, prefix }` says otherwise. Every address
  must be https on one of `hosts`, exact or with one leading `*.` label. A
  request or step naming an `interactive` connection for every call names it
  in the endpoint's `requires` too, and is on no endpoint whose `actors`
  include `installation`, or `build` fails: a call made as the installation
  has no member's credential. A call made as a member carries a `static`
  connection's credential only when `requires` names it, and is refused
  otherwise.
- **A connection per actor.** A read's or write's request or step may name
  one connection for each of the endpoint's `actors` in place of one for
  every call, so a call made as the member carries the member's own
  credential and one made as the installation the community's:

  ```ts
  export const comment = defineEndpoint({
    direction: "write",
    actors: ["member", "installation"],
    params: {
      number: { type: "int", label: { en: "Issue" }, required: true },
      text: { type: "string", label: { en: "Comment" }, required: true },
    },
    returns: { id: "int" },
    request: {
      method: "POST",
      url: '"https://api.tracker.example/issues/" & params.number & "/comments"',
      body: '{"body": params.text}',
      connection: { member: "account", installation: "workspace" },
    },
    map: '{"id": response.body.id}',
  });
  ```

  `member` names an `interactive` connection and `installation` a `static`
  one, for exactly the actors the endpoint declares. The member's needs no
  `requires`: a call made as the member requires it. An expression's
  `connection` holds the fields of the one the call carries.
- **`steps`** in place of `request` makes up to three calls in order; each
  reads the earlier ones as `steps.<name>`, and so does the map.
- **`paging`** on a request reads more pages before the map runs:
  `page_number`, `link_header` or `cursor`, each with `max_pages` (at most 10)
  and `on_limit`, `truncate` or `refuse`.
- **Errors.** 401 and 403 answer `unavailable: not-authorized`, 404
  `not-found`, other 4xx `invalid`, and 429, 3xx and 5xx are transient.
  `errors` rows match a status (`404` or `"4xx"`) and an optional `when`, such
  as a GraphQL error inside a 200, to a code the endpoint declares in
  `unavailable`, or to `transient`. A map may answer
  `{"unavailable": "<code>"}` itself.
- **Connections** take a declarative `after_connect` (a request or up to
  three `steps`, a map to `{values, account_label}`, and `refuse_when` with
  its `code`, which read each step as `steps.<name>`) and a
  `health` check run on an interval. **Webhooks** take `events`, each mapping
  a delivery to one of the plug-in's emissions, changes to its values, or
  both, and `status` rows that set a connection's state; a delivery may be
  routed by a `header` instead of a body `path`.
- **Scopes** are read scopes alone, at the manifest's top level, and
  `validateManifest` refuses any other: a declarative plug-in keeps its own
  values on items it can read, and does not call Initiative. Initiative keeps
  its values only on items those scopes read, such as tasks with
  `projects:read`.
- **Values** are written from a `write` expression: Initiative makes the
  changes it answers, as the install. A **change** sets values by key,
  `{"set": {"<key>": <value>}}`, the shape of `client.metadata.set`: a null
  removes its key, and every value is held to the metadata caps. A list
  field's value is its whole list of elements; its elements change by their
  `ref` with `{"upsert": {"<key>": [<element>]}}`, which adds each element or
  merges it into the one with its `ref` (the properties it gives replace that
  element's, the rest stay, and its `state` merges by facet, so a write that
  knows one fact changes that fact alone), and `{"remove": {"<key>": ["<ref>"]}}`. A
  change gives at least one of `set`, `upsert` and `remove`, and changes each
  key with only one. A **targeted change** adds its `target`:
  `{"kind": "task", "id": 7}` for one item, `{"install": true}` for the
  install, or `{"holding": {"key": "<key>", "value": "<text>"}}` for every item
  on which the install holds that value under that key (a number or a boolean
  as JSON writes it, a list element by its `ref`). A target the install cannot
  read is skipped, one `write` answers at most 100 targeted changes
  (`CAPS.writeTargets`), and a `write` answering nothing changes nothing.
  - An **event** row's `write`, beside its `emit` and `map` or in their place,
    answers targeted changes from `headers`, `payload`, `connection`, `now`,
    `settings` and `aliases`. The first row whose `when` holds applies, its
    emission and its write both.
  - An **action** names an `endpoint`, a `write`, or both. The endpoint may be
    a read, fetching what the `write` keeps, or a write that changes something
    at the vendor. Initiative makes the endpoint's call with the `params` the
    reader answered, on the credential its `actors` say, its expressions also
    reading `item` (`{kind, id, title}`) and `element` (the `ref` of the list
    element it was run from, if any), then the one change `write` answers from
    `item`, `held` (the install's values on the item), `result` (the
    endpoint's mapped answer), `params`, `element`, `settings`, `aliases` and
    `now`.
  - A **schedule** makes a read as the installation on an interval: `endpoint`
    names a read endpoint whose `actors` include `installation`, `params`
    answers its params from `since` (when the schedule last succeeded, or
    null), `now`, `connection`, `settings` and `aliases`, and `write` answers
    targeted changes from `result`, `since`, `now`, `settings` and `aliases`.
    Its id is none of the plug-in's connections': Initiative keys connection
    health checks by connection id.

  ```ts
  schedules: {
    sync: {
      every: "1h",
      endpoint: "updated-issues", // returns numbers: int list, states: string list
      params: '{"since": since}',
      write:
        '[$map(result.numbers, function($n, $i) { {"target": {"holding": {"key": "issue.number", "value": $string($n)}}, "set": {"issue.state": result.states[$i]}} })]',
    },
  },
  actions: {
    create: {
      name: { en: "Create an issue" },
      endpoint: "create-issue", // returns number: int, url: string
      on: ["task"],
      write: '{"set": {"issue.number": result.number, "issue.link": {"url": result.url, "text": "#" & result.number}}}',
    },
    link: {
      name: { en: "Link an issue" },
      endpoint: "link-issue", // takes number: int; returns number: int, url: string, state: string
      params: ["number"],
      on: ["task"],
      write: '{"upsert": {"issues.linked": [{"ref": $string(result.number), "url": result.url, "state": {"status": result.state}}]}}',
    },
    unlink: { name: { en: "Unlink" }, on: ["task"], write: '{"remove": {"issues.linked": [element]}}' }, // a list field's element action
  },
  ```

  Wrap a list a `write` answers in `[ ]`: a JSONata path matching one item
  answers it alone, and a run refuses a lone change where a list belongs.
- **One plug-in is one kind.** A declarative plug-in is a manifest Initiative
  runs, with no plug-in code: it has no handlers, hooks or pages. A container
  plug-in ships code, which Initiative calls, and uses none of the declarative
  terms. Any plug-in may keep values on items in Initiative: a container
  writes them with its installation token, and for a declarative plug-in
  Initiative writes them from the plug-in's expressions. `validateManifest`
  and `build` refuse a mix.

`runEndpoint`, `runAfterConnect`, `runHealth`, `runAction` and `runSchedule`
render each request as Initiative sends it, less the credential, answer it from
the recorded `responses` in order, and return the requests beside the result or
the code the run answered. `runEndpoint` takes each connection's fields by id
in `connections`, and the `actor` the call is made as, by default the
endpoint's first: a request naming a connection per actor carries that
actor's. It does not refuse a call the way Initiative would for who is making
it. `runAction` takes the `item`, what the install `held` on it, the `params`
the reader answered, the `element` it was run from and its endpoint's `actor`,
and answers the endpoint's `result` and the `change`; `runSchedule` takes
`since`, makes its read as the installation, and answers the endpoint's
`result` and the `writes`;
`runWebhook` answers a delivery's `event`, `writes` and `status`. Every runner
but `runExchangeBody` takes the install's `settings` and `aliases`. A run fails
when a request has no recorded answer left, when an answer is left over, when
the map's answer does not fit the declared returns, or when a `write` answers
what is not a change: one that changes a key twice, gives a list field anything
but a list of elements, or upserts or removes elements of a field that is not a
list.

## A private plug-in

A deployment's owner can publish a plug-in of their own, which then sits on that
deployment's shelf beside the registry's. Start one from the example, a
declarative plug-in with one read and one widget:

```sh
npx initiative-plugin-sdk init my-plugin      # copies examples/minimal, with a uid of its own
cd my-plugin && npm install && npm test
```

```sh
npx initiative-plugin pack                 # writes <publicId>-<version>.json
```

`pack` builds the plug-in as `build` does, checks it the same way, and writes its
**listing file**: what the catalogue shows, this version's manifest, and the
plug-in's registration. The deployment publishes it as it is, from
`POST /api/v1/marketplace/local/upload` (the file as `{"manifest": …}`) or from
its catalog directory (`MARKETPLACE_EXTRA_CATALOG_DIR`). The listing's picture
is named by its digest, so upload it beside the file, to
`POST /api/v1/marketplace/local/media`; PNG, JPEG, GIF and WebP are kept, and
any other picture leaves the deployment's default mark. Both routes take the
owner's session or personal API key. A container plug-in packs too, and is live
once its service is registered on the deployment.

```sh
npx initiative-plugin dev --initiative https://initiative.example.com --api-key ppk_…
```

`dev` packs a declarative plug-in and uploads it, with its picture, to your
deployment, then again a moment after each change in the directory holding
`src/plugin.ts`. The key may be given as `INITIATIVE_API_KEY` instead. It prints
each upload and the deployment's answer:

```text
uploaded example.gitlab-issues 1.0.0-dev.3f9a2c1b (uid ZNV2THEZGPHXXG): 201 {"uid":"ZNV2THEZGPHXXG","public_id":"example.gitlab-issues","version":"1.0.0-dev.3f9a2c1b"}
watching src for changes
```

A deployment publishes each version once, so each upload is versioned
`<listing version>-dev.<digest>`. A community that installed the plug-in moves to
it from its Update button, or on its own if it follows updates. The plug-in is
offered once the vendor values its manifest requires are set under the
deployment's plug-in services.

## Validating by hand

```sh
npx initiative-plugin validate manifest.json   # a manifest, or a served manifest document
npx initiative-plugin schema                   # the JSON Schema it checks against
```

`validateManifest` runs the bundled JSON Schema, then the checks a schema
cannot express: features against the blocks present, ids that must name
something the manifest declares, connection, vendor setup and schedule rules,
what a part's nodes, a list field's element actions and an action's `params`
name, the placeholders in a part's text, a part's size and depth, and every
term the contract does not declare (a deployment discards those without saying
so). The deployment also enforces byte-size caps.

## The contract

`manifest.contract.json` is the one hand-written statement of what a manifest
may say. `schemas/plugin-manifest.json` and `src/contract.ts` (its types) are
generated from it with `npm run generate`; `npm run check:generated` fails when
either is stale. Initiative vendors the contract from this repository's tags.

## The plug-in API contract

A plug-in and Initiative release on their own schedules. What they share is
one file this package publishes, `schemas/plugin-api.json`, exported as
`initiative-plugin-sdk/plugin-api.json`: the OpenAPI document of every route a
plug-in may call, as Initiative describes it. A plug-in depends on an SDK
version and nothing else.

- **The contract version is this package's version.** The file's
  `info.version` is the SDK's version, and `info["x-initiative-source"]` names
  the Initiative release and commit the document was taken from. A minor
  release adds operations, fields or optional parameters; removing or changing
  anything is a major release.
- **Every client comes from the file.** `src/plugin-api.generated.ts`, behind
  `client.api`, is generated from `schemas/plugin-api.json`, never from
  Initiative directly. A plug-in in another language generates its own client
  from the same file, at the SDK version it targets.
- **A deployment serves the contract it vendors.** Initiative carries a copy of
  this file from an SDK release, serves that SDK version as its plug-in API
  version, and checks in its own CI that what it serves still holds every
  route, parameter and response field the copy has. It may serve more.
- **A plug-in names the oldest contract it needs**, as `min_plugin_api`
  (`"MAJOR.MINOR"`) in its manifest. A deployment serving contract `S` runs a
  plug-in needing `N` when they share a major version and `S`'s minor is at
  least `N`'s. A manifest without the field runs on any contract.
  Initiative, the registry and the SDK decide with the same rule, exported as
  `pluginApiCompatible`:

  ```ts
  import { pluginApiCompatible } from "initiative-plugin-sdk/manifest";

  pluginApiCompatible("4.3.2", "4.1"); // true
  pluginApiCompatible("5.0.0", "4.1"); // false: another major
  pluginApiCompatible("4.3.2", undefined); // true: no claim
  ```

The file is never edited by hand. Take it again when Initiative's plug-in API
grows, from a checkout, a release or a running deployment; this rewrites the
file at the package's version and then the client from it:

```sh
npm run generate:plugin-api -- --checkout ../initiative   # runs its export with uv
npm run generate:plugin-api -- --release v0.75.0
npm run generate:plugin-api -- --url https://initiative.example.com
```

With no source, `npm run generate:plugin-api` regenerates the client from the
file and restamps its `info.version` with the package's; the Promote workflow
does this when it bumps the version. `npm run check:generated` fails when
either the file's version or the client is stale.

## Scopes

| Scope | Grants |
|---|---|
| `projects:read`, `projects:write` | Projects and what belongs to them: tasks, statuses, task types, checklists. |
| `files:read`, `files:write` | Files: text documents, whiteboards, spreadsheets, links and uploads, and the collections they are in. |
| `counter_groups:read`, `counter_groups:write` | Counter groups, their counters and commands. |
| `calendars:read`, `calendars:write` | Calendars, events and attendees. |
| `dashboards:read`, `dashboards:write` | Dashboards. |
| `posts:read`, `posts:write` | Posts, including pinning. |
| `wikis:read`, `wikis:write` | Wikis and their pages. |
| `comments:read`, `comments:write` | Comments on what the plug-in can read. |
| `relationships:read`, `relationships:write` | Links between items the plug-in can reach. |
| `tags:read`, `tags:write` | Reading, creating and applying tags. |
| `properties:read`, `properties:write` | Reading an initiative's custom property definitions and their options, and creating, changing and removing them. Setting a value on an item takes that item's own scope instead: a task's with `projects:write`. |
| `sharing:read`, `sharing:write` | Seeing who has access to something, and changing it where the plug-in's own access allows it. |
| `members:read` | The roster, as references, display names and avatars. |
| `initiatives:read` | The initiatives the plug-in is placed in. |
| `initiatives:moderate` | Acting as a moderator in an initiative it is placed in: everything there, within the plug-in's other scopes. Only on a token that asks for it (`level=moderator`) and is narrowed to that initiative. |
| `community:admin` | Acting with a community admin's standing across the community, within the plug-in's other scopes. Only on a token that asks for it (`level=community_admin`) and is not narrowed to an initiative. |
| `plugins:<public id>` | Calling that plug-in's public endpoints through Initiative, and reading the values it shows on items the plug-in can read. One per plug-in. |

A container plug-in's `scopes` go in its manifest's `service` block. A
declarative plug-in asks for read scopes alone, at the manifest's top level: it
keeps its own values on items those scopes read, and does not call Initiative.
A container plug-in with `callsPlugins: true` needs no `plugins:` scope in its
manifest: a community that installs another plug-in is asked there whether
this one may use it, and that grants `plugins:<public id>` for it.

Writing implies reading. Within its scopes a plug-in still sees only what is open
to the initiative, shared with the plug-in, or created by it — unless a token asks
for one of the two standings above. Those are never on a token by default: ask
for one with `asInstallation(installation, { initiative, level: "moderator" })`
or `asInstallation(installation, { level: "community_admin" })`, and Initiative
refuses it unless the community granted the matching scope. A member token
takes no `level`.

## Licence

MIT
