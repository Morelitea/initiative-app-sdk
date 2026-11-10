/**
 * One typed definition of a plug-in.
 *
 * {@link definePlugin} takes everything a plug-in declares and does: its endpoints
 * with their handlers, its hooks and schedules, its widgets and pages, and
 * its listing. The same object routes Initiative's calls (`createPlugin`) and
 * becomes the manifest (`initiative-plugin build`), so nothing is stated twice.
 *
 * {@link defineEndpoint} types one endpoint from its own declaration: its
 * `params` type the handler's arguments and its `returns` type what the
 * handler answers with.
 *
 * A declarative plug-in gives each endpoint a `request` (or `steps`) and a `map`
 * in place of a handler, and names its `hosts`: Initiative then makes the
 * calls and maps the answers itself, and there is no service to run. Its
 * schedules, actions and webhook events say in a `write` how Initiative changes
 * the values it keeps on items. One plug-in is one kind or the other.
 *
 * Endpoints are named by their key. The manifest id is `plugin.<publicId>.<key>`,
 * and everywhere a definition refers to an endpoint (a widget, a sample, a
 * parameter's `options_from`, a bundled dashboard, `communitySummary`, an
 * action, a schedule) it uses the key.
 */

import type { CommunityStatus } from "./tokens.js";
import type {
  Action,
  ActorKind,
  PluginScope,
  BundledDashboard,
  BundledDashboardWidget,
  Connection,
  Page,
  Endpoint,
  EndpointParam,
  EndpointReturn,
  ErrorRule,
  Expression,
  Field,
  ItemKind,
  Manifest,
  Part,
  RequestStep,
  ReturnValueType,
  Scope,
  Setting,
  Vendor,
  VendorAuth,
  VendorRequest,
  WebhookEvent,
  Webhooks,
  Widget,
} from "./contract.js";
import { FEATURES } from "./contract.js";
import type { Client } from "./client.js";

/**
 * What every handler is handed as `context`: the value given to `createPlugin`.
 *
 * Empty until a plug-in says what it holds, by augmenting this interface:
 *
 * ```ts
 * declare module "initiative-plugin-sdk/manifest" {
 *   interface PluginContext { tracker: TrackerClient }
 * }
 * ```
 */
export interface PluginContext {}

/** One declared parameter, keyed by its name. */
export type ParamSpec = Omit<EndpointParam, "key">;

/** One declared return, keyed by its name: its type, or the whole declaration. */
export type ReturnSpec = ReturnValueType | Omit<EndpointReturn, "key">;

type Scalar<T> = T extends "int" ? number : T extends "bool" ? boolean : string;

type ReturnValue<S> = S extends ReturnValueType
  ? Scalar<S>
  : S extends { type: infer T; list: true }
    ? Array<Scalar<T>>
    : S extends { type: infer T }
      ? Scalar<T>
      : never;

/**
 * What an endpoint answers with: its declared returns, by name. A `list`
 * return is an array. Each may be left out or null; a key the endpoint does
 * not declare is refused.
 */
export type Result<R> = { [K in keyof R]?: ReturnValue<R[K]> | null };

/**
 * A parameter as a caller sent it. Initiative sends strings; an automation
 * may send numbers and booleans as they are.
 */
export type ParamValue = string | number | boolean;

/** The parameters a call carries, by their declared names. */
export type Params<P> = { [K in keyof P]?: P[K] extends { list: true } ? ParamValue[] : ParamValue };

/** Whose behalf a call is on: the community, or one of its members by this installation's reference for them. */
export type Actor = { kind: "installation" } | { kind: "member"; member: string };

/** One of Initiative's items, by its kind and id. */
export interface ItemRef {
  type: ItemKind;
  id: number;
}

/** What every handler is handed. */
export interface Call {
  /**
   * The community, by the reference this plug-in knows it by. It survives
   * uninstall and reinstall, so it is what your rows key on.
   */
  installation: string;
  /** Where the community stands. Anything but `active` means hold back. */
  community_status: CommunityStatus;
  /** Initiative, acting as whoever the call is for. */
  client: Client;
  context: PluginContext;
}

export interface EndpointCall<P> extends Call {
  /** The endpoint's manifest id. */
  endpoint: string;
  params: Params<P>;
  /** Initiative's own calls, for a widget, are the community's. */
  actor: Actor;
  /** The plug-in that made this call through Initiative, by its public id, or null for Initiative's own. */
  caller: string | null;
  /** The initiative the call is confined to, when it is. */
  initiative: number | null;
  /** Connection id → the handle Initiative gives a token for, where the call depends on one. */
  connections: Record<string, string>;
  /** On a call one of the plug-in's actions made: the reader who ran it, by this installation's reference for them. */
  viewer: string | null;
  /** On a call one of the plug-in's actions made: the item it was run on. */
  subject: ItemRef | null;
}

/** What a handler answers with. `actor` says whose credential ran it; absent, the call's actor. */
export interface Outcome<R> {
  result: Result<R>;
  actor?: ActorKind;
}

type Described = Omit<Endpoint, "id" | "direction" | "params" | "returns" | "request" | "steps" | "map" | "errors">;

/** An endpoint Initiative calls: a `read`, or a `write` another plug-in calls through it. */
export interface CallableEndpoint<P, R, D extends "read" | "write" = "read" | "write"> extends Described {
  direction: D;
  params?: P;
  returns?: R;
  handler: (call: EndpointCall<P>) => Promise<Outcome<R>>;
}

/**
 * An endpoint a declarative plug-in answers without code: Initiative makes the
 * `request`, or each of the `steps` in order, and `map` turns the answer into
 * the endpoint's returns.
 */
export type DeclarativeEndpoint<P, R, D extends "read" | "write" = "read" | "write"> = Described & {
  direction: D;
  params?: P;
  returns?: R;
  map: Expression;
  errors?: ErrorRule[];
} & ({ request: VendorRequest; steps?: never } | { steps: RequestStep[]; request?: never });

/** An announcement the plug-in emits: declared, never called. */
export interface EmittedEndpoint<R> extends Described {
  direction: "emit";
  returns?: R;
}

export type EndpointDeclaration =
  | CallableEndpoint<any, any>
  | DeclarativeEndpoint<any, any>
  | EmittedEndpoint<any>;

/** One endpoint, typed from its own `params` and `returns`. */
export function defineEndpoint<const R extends Record<string, ReturnSpec> = {}>(
  endpoint: EmittedEndpoint<R>
): EmittedEndpoint<R>;
export function defineEndpoint<
  D extends "read" | "write",
  const P extends Record<string, ParamSpec> = {},
  const R extends Record<string, ReturnSpec> = {},
>(endpoint: CallableEndpoint<P, R, D>): CallableEndpoint<P, R, D>;
export function defineEndpoint<
  D extends "read" | "write",
  const P extends Record<string, ParamSpec> = {},
  const R extends Record<string, ReturnSpec> = {},
>(endpoint: DeclarativeEndpoint<P, R, D>): DeclarativeEndpoint<P, R, D>;
export function defineEndpoint(endpoint: EndpointDeclaration): EndpointDeclaration {
  return endpoint;
}

/** What `after_connect` is sent, once a connection's flow has exchanged its code. */
export interface AfterConnectCall extends Call {
  /** The connection's manifest id. */
  connection: string;
  /** `member` for a member's own account, `installation` for the community's. */
  actor: ActorKind;
  /** The access token the flow just obtained, to look the account up with. */
  access_token: string;
  /** The flow's parameters, such as the `installation_id` an install page returned. */
  params: Record<string, string>;
}

/** The connection's managed values and the account's label, or a refusal. */
export type AfterConnectAnswer =
  | { values?: Record<string, unknown>; account_label?: string }
  | { refuse: true };

/** What `revoke` is sent when a connection whose flow says `revoke: "hook"` ends. */
export interface RevokeCall extends Call {
  connection: string;
  access_token: string | null;
  refresh_token: string | null;
}

/** One vendor webhook delivery, which Initiative checked and routed to this installation. */
export interface WebhookCall extends Call {
  /** The static connection the delivery was routed by. */
  connection: string;
  /** The vendor's `x-` headers, lowercased. */
  headers: Record<string, string>;
  /** The body exactly as the vendor sent it. */
  body: string;
}

/** One due schedule, for one installation. */
export interface ScheduleCall extends Call {
  schedule: string;
  /** When this schedule last succeeded for the installation (ISO 8601), or null the first time. */
  since: string | null;
}

/** What `community_status` is sent, whenever the community's standing changes. */
export interface CommunityStatusCall extends Call {
  /** The standing it changed to. The same value `community_status` now carries. */
  status: CommunityStatus;
}

/**
 * What `entitlement` is sent: billing's statement of what this community holds
 * of the plug-in. Billing signs it, Initiative hands it on verbatim, and the
 * SDK verifies it against billing's key (the runtime fact
 * `entitlement_issuer_key`) before the hook runs; a statement that does not
 * verify never reaches it. On a deployment without billing, it is never sent.
 */
export interface EntitlementCall extends Call {
  /**
   * Rises with every new statement for this community. Keep the highest you
   * have seen and ignore a lower one: statements may arrive more than once and
   * out of order.
   */
  version: number;
  /**
   * The statement itself, replacing the last one whole. Its keys are agreed
   * between your plug-in and billing; Initiative carries them unread.
   */
  values: Record<string, unknown>;
  /** False when billing says the community holds nothing of the plug-in now. */
  active: boolean;
  /** Why, when billing says: `term_full` is a community billing gives no seat. */
  reason: string | null;
}

/** The names of the hooks about a community's install, rather than a connection. */
export const COMMUNITY_HOOKS = ["installed", "uninstalled", "erase", "community_status", "entitlement"] as const;
export type CommunityHook = (typeof COMMUNITY_HOOKS)[number];

/**
 * The hooks Initiative calls while it runs connections and receives the
 * vendor's webhooks, and as a community installs, leaves, erases, changes
 * standing or changes what it holds of the plug-in.
 */
export interface Hooks {
  after_connect?: (call: AfterConnectCall) => Promise<AfterConnectAnswer>;
  revoke?: (call: RevokeCall) => Promise<void>;
  webhook?: (call: WebhookCall) => Promise<void>;
  /** The community installed the plug-in, or installed it again under the same references. */
  installed?: (call: Call) => Promise<void>;
  /** The community uninstalled the plug-in. Its references stand: it may come back. */
  uninstalled?: (call: Call) => Promise<void>;
  /**
   * Delete everything you hold about the community. Once this answers,
   * Initiative forgets the community's references for your plug-in, and a
   * later install starts afresh. Throwing has it asked again.
   */
  erase?: (call: Call) => Promise<void>;
  community_status?: (call: CommunityStatusCall) => Promise<void>;
  entitlement?: (call: EntitlementCall) => Promise<void>;
}

export interface ScheduleDeclaration {
  /** A whole number of minutes (`15m`) or hours (`6h`). */
  every: `${number}${"m" | "h"}`;
  run: (call: ScheduleCall) => Promise<void>;
}

/**
 * A declarative plug-in's schedule: Initiative makes a read endpoint's call as
 * the installation, and changes the plug-in's values from its answer.
 */
export interface DeclarativeScheduleDeclaration<E> extends Pick<ScheduleDeclaration, "every"> {
  /** A read endpoint, by its key, whose `actors` include `installation`. */
  endpoint: ReadName<E>;
  /** The endpoint's params, from `since`, `now`, `connection`, `settings` and `aliases`. */
  params?: Expression;
  /** The targeted changes made from the endpoint's answer, `result`, beside `since`, `now`, `settings` and `aliases`. */
  write: Expression;
}

/** A member opening one of the plug-in's pages, as the handoff token names them. */
export interface Handoff extends Call {
  page: string;
  /** The member, by this installation's reference for them. */
  viewer: string;
  /** Whether the viewer administers the community. For shaping screens; not a grant. */
  admin: boolean;
  /** The initiative the page was opened in, or null for the whole community. */
  initiative: number | null;
}

export interface PageCall {
  request: Request;
  /** Null for a request that carries no handoff token, such as the page's own files. */
  handoff: Handoff | null;
}

/**
 * A page of the plug-in that Initiative frames. The page is the plug-in's own; a
 * request under its path that carries a handoff token reaches the handler with
 * the handoff verified.
 */
export interface PageDeclaration extends Omit<Page, "id"> {
  handler?: (call: PageCall) => Promise<Response>;
}

type ReadName<E> = {
  [K in keyof E]: E[K] extends { direction: "read" } ? K : never;
}[keyof E] &
  string;

type WriteName<E> = {
  [K in keyof E]: E[K] extends { direction: "write" } ? K : never;
}[keyof E] &
  string;

type EmitName<E> = {
  [K in keyof E]: E[K] extends { direction: "emit" } ? K : never;
}[keyof E] &
  string;

/**
 * The vendor's webhooks. A declarative plug-in's event rows name the emit
 * endpoint by its key, beside the `map` of its payload, and may `write` the
 * plug-in's values; a row does one or both.
 */
export type WebhooksDeclaration<E> = Omit<Webhooks, "events"> & {
  events?: Array<
    Omit<WebhookEvent, "emit" | "map" | "write"> &
      ({ emit: EmitName<E>; map: Expression; write?: Expression } | { emit?: never; map?: never; write: Expression })
  >;
};

type ReturnsOf<X> = X extends { returns?: infer R } ? NonNullable<R> : {};

/** A dashboard tile the plug-in contributes. `module` is the widget's source file. */
export interface WidgetDeclaration<E> extends Omit<Widget, "id" | "module_source" | "endpoints" | "sample_data"> {
  /** Read endpoints the widget may be bound to. */
  endpoints?: readonly ReadName<E>[];
  /**
   * The widget's TypeScript module, relative to the plug-in's package: it exports
   * `render(data)`. The build bundles it into the manifest's `module_source`.
   */
  module: string;
  /** What each endpoint would answer, for a preview with no network call. */
  sample_data?: { [K in ReadName<E>]?: Result<ReturnsOf<E[K]>> };
}

/**
 * Something a reader runs on one item. `endpoint` names an endpoint by its key,
 * and `params` the endpoint's params Initiative asks the reader for. A
 * container's action names a write; a declarative plug-in's names a read or a
 * write, a `write`, or both.
 */
export type ActionDeclaration<E> = Omit<Action, "id" | "endpoint" | "params" | "write"> &
  (
    | { endpoint: WriteName<E> | ReadName<E>; params?: Action["params"]; write?: Expression }
    | { endpoint?: never; params?: never; write: Expression }
  );

export interface DashboardDeclaration<E, W> extends Omit<BundledDashboard, "widgets"> {
  widgets: Array<
    Omit<BundledDashboardWidget, "type" | "binding"> & {
      type: keyof W & string;
      binding: Omit<BundledDashboardWidget["binding"], "endpoint_id"> & { endpoint_id: ReadName<E> };
    }
  >;
}

/**
 * The plug-in's registry listing. `initiative-plugin build --registry <dir>` writes it
 * while `version` is the package's own version.
 */
export interface ListingDeclaration {
  /** The publisher's prefix, the part of the public id before the first dot. */
  publisher: string;
  /** One or two sentences for the listing's card. */
  summary: string;
  /** The listing page's longer text. Markdown. */
  description?: string;
  /** The listing's picture, relative to the plug-in's package. */
  avatar: string;
  /**
   * Screenshots for the listing page, in order: at most 12, each a PNG, JPEG,
   * WebP, GIF, AVIF or SVG file relative to the plug-in's package, with `alt`
   * text of 1 to 300 characters describing it for someone who cannot see it.
   * The registry signs each one, like the avatar. Only a registry listing
   * carries them; `pack` leaves them out.
   */
  images?: Array<{ path: string; alt: string }>;
  version: string;
  /** The oldest Initiative release this version runs on. */
  minAppVersion?: string;
  releaseNotes?: string;
  /**
   * A container plug-in's image for this version, pinned by digest. Every
   * deployment runs its own copy and gives the key it signs with, so a listing
   * names no keys. A declarative plug-in has none.
   */
  image?: string;
  /** The most the plug-in may ever be granted. Absent: its `scopes`. */
  scopeCeiling?: Array<Scope | PluginScope>;
  /**
   * The Docker Compose service an operator copies to run the image beside
   * Initiative. `service` is the fragment, YAML text of at most 4096
   * characters. Initiative fills two placeholders when it shows it: `${IMAGE}`,
   * `image` above, and `${INITIATIVE_URL}`, the deployment's public address;
   * any other `${…}` is refused. `baseUrl` is where the service answers on the
   * Compose network, such as `http://tracker:8080`: an http or https URL of at
   * most 512 characters. A container plug-in's only.
   */
  compose?: { service: string; baseUrl: string };
  /**
   * What a deployment needs to run the container on its own, without code of
   * its own for it. A container plug-in's only, and only in a package somebody
   * reviewed: the public registry refuses a listing that carries one. It holds
   * nothing that raises a privilege; resources, network rules, hostnames and
   * every key stay the deployment's. See {@link RuntimeDeclaration}.
   */
  runtime?: RuntimeDeclaration;
}

/** What the deployment fills a {@link RuntimeDeclaration.facts} variable with. */
export type RuntimeFact =
  /** Initiative's public URL. */
  | "app_url"
  /** Initiative's public origin. */
  | "app_origin"
  /** Initiative's API, as outside callers reach it. */
  | "app_api_public"
  /** Initiative's API, from inside the deployment. */
  | "app_api_internal"
  /** This plug-in's own origin, where it serves framed pages (needs `pages`). */
  | "page_origin"
  /** The port below. */
  | "port"
  /**
   * Billing's public key for entitlement statements (SPKI PEM), absent when the
   * deployment runs no billing. Added by the build, under
   * `INITIATIVE_ENTITLEMENT_ISSUER_KEY_PEM`, to every plug-in with an
   * `entitlement` hook.
   */
  | "entitlement_issuer_key";

export interface RuntimeDeclaration {
  /** Its short name in a deployment: a DNS label of at most 20 characters, unique in a package. */
  name: string;
  /** The port it serves HTTP on, 1024 or higher. */
  port: number;
  health: { ready: string; live: string; startupSeconds?: number };
  /** How long it needs to drain after SIGTERM, 5 to 300 seconds. */
  stopGraceSeconds?: number;
  /** It changes its database schema as it starts, so two copies never start together. */
  migratesOnStart?: boolean;
  /** It serves pages Initiative frames, at an origin of its own. */
  pages?: boolean;
  /** Paths outside callers reach on the deployment's shared plug-in host. */
  publicPaths?: string[];
  /** Environment variables the deployment fills with what it knows of itself. */
  facts?: Record<string, RuntimeFact>;
  /** Environment variables only the operator fills, by name. */
  settings?: Array<{ env: string; required?: boolean }>;
  /** Where the private key its copy signs with goes. */
  signingKey?: { env: string };
  /**
   * Its own Postgres. The deployment runs it, backs it up, and gives each role
   * a login; `provisionSql`, a file in the image, creates them, given each
   * role's password as the psql variable `<id>_password`.
   */
  database?: {
    minMajor?: number;
    dsnScheme?: "postgresql" | "postgresql+asyncpg" | "postgresql+psycopg" | "postgres";
    roles: Array<{ id: string; login: string; env: string }>;
    provisionSql: string;
  };
  /** Values the deployment generates once and keeps. */
  secrets?: Array<{ id: string; kind: "random_alnum_32" | "random_bytes_32" | "hex_32" | "ed25519_private_key_pem"; env: string }>;
  metrics?: { path: string; tokenEnv: string };
}

export interface PluginDefinition<E, W> {
  /** `<publisher>.<slug>`. */
  publicId: string;
  /** The catalog id: 14 characters of Crockford base32, minted once (`initiative-plugin uid`). */
  uid: string;
  name: string;
  /** How old somebody must be to use it, by ISO 3166-1 alpha-2 country, with `default` for the rest: `{ default: 16, US: 13 }`. */
  minimumAge?: Record<string, number>;
  /**
   * The oldest plug-in API contract the plug-in needs, as `"MAJOR.MINOR"`: the
   * SDK version whose `client.api` it was written against, such as `"4.1"`. A
   * deployment serving a contract of the same major version and at least this
   * minor runs it (`pluginApiCompatible`). Absent: no claim. Beside
   * `listing.minAppVersion`, the oldest Initiative release it runs on.
   */
  minPluginApi?: string;
  /** The scopes it asks a community to grant. A declarative plug-in asks only for read scopes. */
  scopes?: Array<Scope | PluginScope>;
  /**
   * A container plug-in may act through any plug-in the community lets it use,
   * not only those its `plugins:` scopes name (the manifest's
   * `service.calls_plugins`).
   */
  callsPlugins?: boolean;
  /** A declarative plug-in's hosts: every host its requests may reach. Naming them makes the plug-in declarative. */
  hosts?: string[];
  /** How a declarative plug-in's requests carry their credential. Absent: `Authorization: Bearer <token>`. */
  auth?: VendorAuth;
  vendor?: Vendor;
  /** Keyed by connection id. */
  connections?: Record<string, Omit<Connection, "id">>;
  webhooks?: WebhooksDeclaration<E>;
  /**
   * Keyed by schedule id. A container's runs through the `schedule` hook; a
   * declarative plug-in's is a read and a write Initiative makes.
   */
  schedules?: Record<string, ScheduleDeclaration | DeclarativeScheduleDeclaration<E>>;
  endpoints?: E;
  /** A read endpoint describing the community's standing with the plug-in's service. */
  communitySummary?: ReadName<E>;
  hooks?: Hooks;
  widgets?: W;
  /** Pages and panels, keyed by page id. */
  pages?: Record<string, PageDeclaration>;
  /**
   * Sign in with Initiative: people may also open the plug-in at its own
   * address, signing in with their Initiative account. `page` is the page they
   * land in (a key of `pages`); `returnPath` is where Initiative sends them back
   * with a code, on the origin the plug-in's pages are served from. The client
   * half is `Initiative.signIn`.
   */
  signIn?: { page: string; returnPath: string };
  dashboards?: DashboardDeclaration<E, W>[];
  /** How the plug-in's metadata is shown on items, keyed by metadata key. */
  fields?: Record<string, Omit<Field, "key">>;
  /** Pieces of items' pages and views, keyed by part id. A `tree` may be written as JSX (`initiative-plugin-sdk/parts`). */
  parts?: Record<string, Omit<Part, "id">>;
  /** What a reader may run on an item, keyed by action id. */
  actions?: Record<string, ActionDeclaration<E>>;
  /** Values the community's admins set on the install, keyed by setting key. */
  settings?: Record<string, Omit<Setting, "key">>;
  /** Help with the plug-in's parts and settings: markdown, keyed by language tag. */
  help?: Manifest["help"];
  listing?: ListingDeclaration;
}

/** Any plug-in's definition, as the server and the build read it. */
export type AnyPlugin = Omit<PluginDefinition<any, any>, "endpoints" | "widgets"> & {
  endpoints?: Record<string, EndpointDeclaration>;
  widgets?: Record<string, WidgetDeclaration<any>>;
};

/** The plug-in, declared once. */
export function definePlugin<
  const E extends Record<string, EndpointDeclaration> = {},
  const W extends Record<string, WidgetDeclaration<E>> = {},
>(definition: PluginDefinition<E, W>): PluginDefinition<E, W> {
  return definition;
}

/** An endpoint's manifest id. */
export function endpointId(plugin: { publicId: string }, name: string): string {
  return `plugin.${plugin.publicId}.${name}`;
}

/**
 * The manifest a definition declares: its handlers left out, its keys made
 * ids, in the contract's order. Each widget's `module_source` is taken from
 * `modules` by widget id. A definition naming `hosts` is declarative: its
 * manifest has no `service` block, and its `scopes` stand at the top level.
 * A container's `callsPlugins` is its service block's `calls_plugins`.
 */
export function manifestOf(plugin: AnyPlugin, modules: Record<string, string> = {}): Manifest {
  const id = (name: string) => endpointId(plugin, name);
  const blocks: Partial<Manifest> = {
    vendor: plugin.vendor,
    connections: listOf(plugin.connections, (key, connection) => ({ id: key, ...connection })),
    webhooks: plugin.webhooks && {
      ...plugin.webhooks,
      ...(plugin.webhooks.events
        ? { events: plugin.webhooks.events.map((event) => (event.emit === undefined ? event : { ...event, emit: id(event.emit) })) }
        : {}),
    },
    schedules: listOf(plugin.schedules, (key, schedule) =>
      "run" in schedule ? { id: key, every: schedule.every } : { id: key, ...schedule, endpoint: id(schedule.endpoint) }
    ),
    endpoints: listOf(plugin.endpoints, (key, endpoint) => endpointOf(id(key), endpoint, id)),
    community_summary: plugin.communitySummary === undefined ? undefined : id(plugin.communitySummary),
    widgets: listOf(plugin.widgets, (key, widget) => widgetOf(key, widget, modules[key] ?? "", id)),
    pages: listOf(plugin.pages, (key, page) => {
      const { handler: _handler, ...declared } = page;
      return { id: key, ...declared };
    }),
    sign_in: plugin.signIn && { page: plugin.signIn.page, return_path: plugin.signIn.returnPath },
    dashboards: plugin.dashboards?.map((dashboard) => ({
      ...dashboard,
      widgets: dashboard.widgets.map((widget) => ({
        ...widget,
        binding: { ...widget.binding, endpoint_id: id(widget.binding.endpoint_id) },
      })),
    })),
    fields: listOf(plugin.fields, (key, field) => ({ key, ...field })),
    parts: listOf(plugin.parts, (key, part) => ({ id: key, ...part })),
    actions: listOf(plugin.actions, (key, action) => ({
      id: key,
      ...action,
      ...(action.endpoint === undefined ? {} : { endpoint: id(action.endpoint) }),
    })),
    settings: listOf(plugin.settings, (key, setting) => ({ key, ...setting })),
    help: plugin.help,
  };
  const present = Object.fromEntries(
    Object.entries(blocks).filter(([, value]) => value !== undefined)
  ) as Partial<Manifest>;
  return {
    plugin_kind: "service",
    ...(plugin.hosts
      ? {}
      : {
          service: {
            public_id: plugin.publicId,
            protocol: 1,
            ...(plugin.scopes ? { scopes: [...plugin.scopes] } : {}),
            ...(plugin.callsPlugins !== undefined ? { calls_plugins: plugin.callsPlugins } : {}),
          },
        }),
    features: FEATURES.filter((feature) => present[feature] !== undefined),
    default_name: plugin.name,
    ...(plugin.minimumAge ? { minimum_age: { ...plugin.minimumAge } } : {}),
    ...(plugin.minPluginApi !== undefined ? { min_plugin_api: plugin.minPluginApi } : {}),
    ...(plugin.hosts ? { hosts: [...plugin.hosts] } : {}),
    ...(plugin.auth ? { auth: plugin.auth } : {}),
    ...(plugin.hosts && plugin.scopes ? { scopes: [...plugin.scopes] } : {}),
    ...present,
  };
}

/** A record's entries as a list, or undefined when it holds none. */
function listOf<T, U>(record: Record<string, T> | undefined, build: (key: string, value: T) => U): U[] | undefined {
  const entries = Object.entries(record ?? {});
  return entries.length ? entries.map(([key, value]) => build(key, value)) : undefined;
}

/** The declaration in the author's own order, with its keys made ids. */
function endpointOf(endpointIdValue: string, endpoint: EndpointDeclaration, id: (name: string) => string): Endpoint {
  const out: Record<string, unknown> = { id: endpointIdValue };
  for (const [key, value] of Object.entries(endpoint)) {
    if (key === "handler") continue;
    if (key === "params") {
      out.params = Object.entries(value as Record<string, ParamSpec>).map(([name, param]) => ({
        key: name,
        ...param,
        ...(param.options_from ? { options_from: { ...param.options_from, endpoint: id(param.options_from.endpoint) } } : {}),
      }));
    } else if (key === "returns") {
      out.returns = Object.entries(value as Record<string, ReturnSpec>).map(([name, spec]) =>
        typeof spec === "string" ? { key: name, type: spec } : { key: name, ...spec }
      );
    } else out[key] = value;
  }
  return out as unknown as Endpoint;
}

function widgetOf(
  key: string,
  widget: WidgetDeclaration<any>,
  source: string,
  id: (name: string) => string
): Widget {
  const out: Record<string, unknown> = { id: key };
  for (const [field, value] of Object.entries(widget)) {
    if (field === "module") out.module_source = source;
    else if (field === "endpoints") out.endpoints = (value as string[]).map(id);
    else if (field === "sample_data") {
      out.sample_data = Object.fromEntries(Object.entries(value as object).map(([name, sample]) => [id(name), sample]));
    } else out[field] = value;
  }
  return out as unknown as Widget;
}
