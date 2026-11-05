/**
 * The plug-in contract, as TypeScript.
 *
 * GENERATED from `manifest.contract.json` by `scripts/generate.mjs`. Do not
 * edit it: change the contract and run `npm run generate`.
 *
 * These are the enums, caps and character sets the bundled JSON Schema is built
 * from, and the shape of every object it defines, so this package's types
 * cannot describe a manifest the schema refuses, nor miss a term it allows.
 */

export type Feature = "actions" | "dashboards" | "endpoints" | "fields" | "pages" | "parts" | "widgets";
export const FEATURES: readonly Feature[] = ["actions", "dashboards", "endpoints", "fields", "pages", "parts", "widgets"];

export type Protocol = 1;
export const PROTOCOLS: readonly Protocol[] = [1];

export type ConnectionScope = "interactive" | "static";
export const CONNECTION_SCOPES: readonly ConnectionScope[] = ["interactive", "static"];

export type FlowType = "oauth2";
export const FLOW_TYPES: readonly FlowType[] = ["oauth2"];

export type TokenType = "jwt_bearer";
export const TOKEN_TYPES: readonly TokenType[] = ["jwt_bearer"];

export type RevokeMethod = "github_grant" | "hook" | "rfc7009";
export const REVOKE_METHODS: readonly RevokeMethod[] = ["github_grant", "hook", "rfc7009"];

export type JwtAlgorithm = "ES256" | "RS256";
export const JWT_ALGORITHMS: readonly JwtAlgorithm[] = ["ES256", "RS256"];

export type FieldType = "bool" | "int" | "secret" | "select" | "string" | "url";
export const FIELD_TYPES: readonly FieldType[] = ["bool", "int", "secret", "select", "string", "url"];

export type VendorFieldType = "secret" | "string" | "url";
export const VENDOR_FIELD_TYPES: readonly VendorFieldType[] = ["secret", "string", "url"];

export type GithubPermissionLevel = "read" | "write";
export const GITHUB_PERMISSION_LEVELS: readonly GithubPermissionLevel[] = ["read", "write"];

export type GithubAppValue = "client_id" | "client_secret" | "id" | "pem" | "slug" | "webhook_secret";
export const GITHUB_APP_VALUES: readonly GithubAppValue[] = ["client_id", "client_secret", "id", "pem", "slug", "webhook_secret"];

export type WebhookScheme = "hmac_sha1" | "hmac_sha256";
export const WEBHOOK_SCHEMES: readonly WebhookScheme[] = ["hmac_sha1", "hmac_sha256"];

export type WebhookEncoding = "base64" | "hex";
export const WEBHOOK_ENCODINGS: readonly WebhookEncoding[] = ["base64", "hex"];

export type ParamType = "bool" | "datetime" | "int" | "select" | "string" | "url";
export const PARAM_TYPES: readonly ParamType[] = ["bool", "datetime", "int", "select", "string", "url"];

export type ReturnValueType = "bool" | "datetime" | "int" | "string" | "url";
export const RETURN_VALUE_TYPES: readonly ReturnValueType[] = ["bool", "datetime", "int", "string", "url"];

export type Direction = "emit" | "read" | "write";
export const DIRECTIONS: readonly Direction[] = ["emit", "read", "write"];

export type ActorKind = "installation" | "member";
export const ACTOR_KINDS: readonly ActorKind[] = ["installation", "member"];

export type Scope = "projects:read" | "projects:write" | "files:read" | "files:write" | "counter_groups:read" | "counter_groups:write" | "calendars:read" | "calendars:write" | "dashboards:read" | "dashboards:write" | "posts:read" | "posts:write" | "wikis:read" | "wikis:write" | "contacts:read" | "contacts:write" | "comments:read" | "comments:write" | "relationships:read" | "relationships:write" | "tags:read" | "tags:write" | "properties:read" | "properties:write" | "sharing:read" | "sharing:write" | "members:read" | "initiatives:read" | "initiatives:moderate" | "community:admin";
export const SCOPES: readonly Scope[] = ["projects:read", "projects:write", "files:read", "files:write", "counter_groups:read", "counter_groups:write", "calendars:read", "calendars:write", "dashboards:read", "dashboards:write", "posts:read", "posts:write", "wikis:read", "wikis:write", "contacts:read", "contacts:write", "comments:read", "comments:write", "relationships:read", "relationships:write", "tags:read", "tags:write", "properties:read", "properties:write", "sharing:read", "sharing:write", "members:read", "initiatives:read", "initiatives:moderate", "community:admin"];

export type SurfaceScope = "community" | "initiative";
export const SURFACE_SCOPES: readonly SurfaceScope[] = ["community", "initiative"];

export type PageCapability = "camera" | "clipboard-read" | "clipboard-write" | "display-capture" | "fullscreen" | "geolocation" | "microphone";
export const PAGE_CAPABILITIES: readonly PageCapability[] = ["camera", "clipboard-read", "clipboard-write", "display-capture", "fullscreen", "geolocation", "microphone"];

export type ItemKind = "task" | "calendar_event" | "counter" | "post";
export const ITEM_KINDS: readonly ItemKind[] = ["task", "calendar_event", "counter", "post"];

export type FieldKind = "text" | "number" | "date" | "datetime" | "link" | "badge" | "scale" | "checkbox" | "url" | "currency" | "select" | "multi_select" | "user_reference";
export const FIELD_KINDS: readonly FieldKind[] = ["text", "number", "date", "datetime", "link", "badge", "scale", "checkbox", "url", "currency", "select", "multi_select", "user_reference"];

export type Tone = "accent" | "positive" | "negative" | "warning" | "neutral" | "muted";
export const TONES: readonly Tone[] = ["accent", "positive", "negative", "warning", "neutral", "muted"];

export type SettingType = "string";
export const SETTING_TYPES: readonly SettingType[] = ["string"];

export type SettingAssignment = "community_name";
export const SETTING_ASSIGNMENTS: readonly SettingAssignment[] = ["community_name"];

export type ListingKind = "plugin" | "dashboard";
export const LISTING_KINDS: readonly ListingKind[] = ["plugin", "dashboard"];

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
export const HTTP_METHODS: readonly HttpMethod[] = ["DELETE", "GET", "PATCH", "POST", "PUT"];

export type PageLimit = "refuse" | "truncate";
export const PAGE_LIMITS: readonly PageLimit[] = ["refuse", "truncate"];

export type StatusRange = "2xx" | "3xx" | "4xx" | "5xx";
export const STATUS_RANGES: readonly StatusRange[] = ["2xx", "3xx", "4xx", "5xx"];

export type ConnectionState = "ok" | "removed" | "suspended" | "unavailable";
export const CONNECTION_STATES: readonly ConnectionState[] = ["ok", "removed", "suspended", "unavailable"];

export type PlatformCode = "invalid" | "mapping-failed" | "not-authorized" | "not-found" | "range-too-large";
export const PLATFORM_CODES: readonly PlatformCode[] = ["invalid", "mapping-failed", "not-authorized", "not-found", "range-too-large"];

/** Every cap the platform enforces, by the name the contract gives it. */
export const CAPS = {
  connections: 20,
  fieldsPerConnection: 12,
  vendorFields: 12,
  githubAppPermissions: 100,
  githubAppEvents: 100,
  flowScopes: 24,
  authorizeParams: 12,
  tokenLifetimeSeconds: 600,
  selectOptions: 24,
  optionValueLength: 64,
  accessHintScopes: 24,
  requiresTerms: 10,
  widgets: 12,
  widgetEndpoints: 8,
  endpoints: 64,
  paramsPerEndpoint: 12,
  returnsPerEndpoint: 24,
  pages: 12,
  pageCapabilities: 8,
  fields: 32,
  parts: 16,
  actions: 16,
  partNodes: 50,
  partDepth: 4,
  facetsPerField: 4,
  valuesPerFacet: 12,
  metadataKeyLength: 64,
  metadataValueBytes: 8192,
  metadataLookupLength: 255,
  metadataKeysPerObject: 32,
  metadataBytesPerObject: 65536,
  installMetadataKeys: 256,
  installMetadataBytes: 1048576,
  writeTargets: 100,
  partsPlacedPerItem: 3,
  settings: 16,
  uniqueSettingValueLength: 16,
  helpLength: 2000,
  bundledDashboards: 8,
  dashboardWidgets: 50,
  dashboardGridColumns: 12,
  dashboardBindingParams: 12,
  identifierLength: 64,
  publicIdLength: 120,
  pathLength: 200,
  endpointIdLength: 200,
  nameLength: 255,
  labelLength: 120,
  hintLength: 120,
  descriptionLength: 500,
  paramValueLength: 2000,
  uidLength: 14,
  textLength: 120,
  locales: 40,
  cacheTtlSeconds: 86400,
  moduleSourceBytes: 65536,
  sampleDataBytes: 32768,
  serviceDefinitionBytes: 524288,
  versionLength: 32,
  publisherNameLength: 120,
  urlLength: 300,
  localeTagLength: 12,
  widgetDescriptionLength: 400,
  widgetOptions: 12,
  valuesPerOption: 24,
  identityKeyParts: 4,
  pluginScopes: 24,
  schedules: 8,
  scheduleMinMinutes: 5,
  scheduleMaxMinutes: 1440,
  scheduleEveryLength: 5,
  hosts: 8,
  hostLength: 253,
  steps: 3,
  maxPages: 10,
  perPage: 100,
  requestQuery: 24,
  requestHeaders: 12,
  errorRules: 12,
  unavailableCodes: 12,
  webhookEvents: 32,
  webhookStatuses: 12,
  healthStates: 12,
  statusCode: 599,
  expressionLength: 16384,
  graphqlLength: 16384,
  expressionTimeMs: 1000,
  expressionDepth: 500,
  expressionOutputBytes: 1048576,
  minimumAgeRegions: 64,
  minimumAgeYears: 21,
} as const;

/** The character sets ids and paths are drawn from. */
export const CHARSETS = {
  identifier: "-0123456789_abcdefghijklmnopqrstuvwxyz",
  namespacedId: "-.0123456789_abcdefghijklmnopqrstuvwxyz",
  publicId: "-.0123456789_abcdefghijklmnopqrstuvwxyz",
  uid: "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
  path: "-./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz",
  headerName: "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  fieldPath: "-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz",
  localeTag: "-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  version: "0123456789.-+abcdefghijklmnopqrstuvwxyz",
  artwork: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/._-",
  queryName: "-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz~",
  metadataKey: "._0123456789abcdefghijklmnopqrstuvwxyz",
  uniqueSettingValue: "0123456789abcdefghijklmnopqrstuvwxyz",
} as const;

/**
 * Every field the contract declares, by the object that owns it.
 *
 * The inventory the platform holds its normalizer to, exported so a consumer
 * can enumerate what a manifest may carry without parsing the schema.
 */
export const FIELDS = {
  requires: ["all_of", "any_of"],
  accessHint: ["api", "scopes"],
  connectionField: ["key", "type", "required", "label", "options", "managed"],
  vendor: ["label", "fields", "setup"],
  vendorField: ["key", "type", "required", "label"],
  githubAppManifestSetup: ["kind", "app", "values"],
  githubAppManifest: ["name", "url", "public", "default_permissions", "default_events"],
  endpointParam: ["key", "type", "required", "label", "options", "options_from", "list"],
  endpointReturn: ["key", "type", "label", "list", "of"],
  connection: ["id", "scope", "label", "fields", "flow", "token", "access_hint", "health"],
  connectionFlow: ["type", "authorize_url", "token_url", "client_id", "client_secret", "scopes", "pkce", "authorize_params", "install_url", "after_connect", "revoke", "revoke_url"],
  connectionToken: ["type", "exchange_url", "exchange_body", "iss", "key", "alg", "lifetime"],
  webhooks: ["verify", "dedup", "route", "events", "status"],
  webhookVerify: ["scheme", "header", "prefix", "encoding", "secret"],
  webhookRoute: ["path", "header", "connection", "field"],
  schedule: ["id", "every", "endpoint", "params", "write"],
  endpoint: ["id", "label", "description", "returns", "group", "needs_subject", "direction", "params", "actors", "admin_only", "public", "requires", "cache_ttl_seconds", "identity", "unavailable", "request", "steps", "map", "errors"],
  widget: ["id", "meta", "module_source", "endpoints", "sample_data", "requires"],
  page: ["id", "path", "name", "scopes", "admin_only", "capabilities", "requires"],
  field: ["key", "name", "kind", "list", "on", "description", "tone", "currency", "options", "states", "actions", "requires"],
  fieldOption: ["value", "label", "color"],
  stateFacet: ["name", "values"],
  stateValue: ["label", "tone"],
  sectionNode: ["type", "props", "children"],
  stackNode: ["type", "props", "children"],
  fieldNode: ["type", "props"],
  valueNode: ["type", "props"],
  textNode: ["type", "props"],
  buttonNode: ["type", "props"],
  part: ["id", "name", "on", "tree", "description", "requires"],
  action: ["id", "name", "endpoint", "params", "write", "on", "confirm", "menu", "admin_only", "requires"],
  change: ["set", "upsert", "remove"],
  targetedChange: ["target", "set", "upsert", "remove"],
  listElement: ["ref", "value", "url", "text", "tone", "max", "state"],
  setting: ["key", "type", "label", "description", "unique", "assigned"],
  bundledDashboard: ["uid", "public_id", "name", "description", "layout", "widgets"],
  bundledDashboardWidget: ["id", "type", "title", "grid", "binding"],
  endpointIdentity: ["kind", "key"],
  vendorAuth: ["header", "prefix"],
  vendorRequest: ["method", "url", "query", "headers", "body", "graphql", "connection", "paging"],
  graphqlRequest: ["query", "variables"],
  actorConnections: ["member", "installation"],
  requestStep: ["name", "request"],
  pageNumberPaging: ["kind", "page_param", "per_page_param", "per_page", "items", "max_pages", "on_limit"],
  linkHeaderPaging: ["kind", "items", "max_pages", "on_limit"],
  cursorPaging: ["kind", "next", "more", "param", "variable", "items", "max_pages", "on_limit"],
  errorRule: ["status", "when", "code"],
  afterConnect: ["request", "steps", "map", "refuse_when", "code"],
  connectionHealth: ["request", "every", "states"],
  healthState: ["status", "when", "state"],
  webhookEvent: ["when", "emit", "map", "write"],
  webhookStatus: ["when", "connection", "state"],
  manifest: ["plugin_kind", "service", "features", "default_name", "minimum_age", "min_plugin_api", "hosts", "auth", "scopes", "vendor", "connections", "webhooks", "schedules", "endpoints", "community_summary", "widgets", "pages", "dashboards", "fields", "parts", "actions", "settings", "help"],
} as const;

export type Identifier = string;

/**
 * A route on the plug-in's own service, never an address. The deployment joins
 * it to the base URL its registration supplies.
 */
export type Path = string;

/**
 * Localized text, keyed by language tag. At least one usable entry; the
 * platform falls back to the reader's language, then to any entry. Values
 * should be strings: text longer than 120 characters is truncated, and an entry
 * that is not a string, is not a language tag, or falls past the first 40 is
 * ignored rather than refused.
 */
export type LocalizedText = Record<string, string>;

/**
 * Connection ids that must hold a value before this is offered. Exactly one of
 * 'all_of' or 'any_of'; each id must name a connection this manifest declares.
 * Absent means always available.
 */
export interface Requires {
  all_of?: Identifier[];
  any_of?: Identifier[];
}

/**
 * What the credential will be used for. Display-only: it is shown beside the
 * form so an admin can mint a minimal credential, and no other system's
 * permissions are enforced from it.
 */
export interface AccessHint {
  api?: string;
  scopes?: string[];
}

export interface ConnectionField {
  key: Identifier;
  type: FieldType;
  required?: boolean;
  label: LocalizedText;
  /**
   * Required when type is 'select'.
   */
  options?: string[];
  /**
   * Returned by the plug-in's after_connect hook when a flow finishes; it is
   * not typed into the settings form.
   */
  managed?: boolean;
}

/**
 * What an operator supplies once per deployment for the vendor's own client:
 * its id, its secret, its signing key. Declared here and never valued here: the
 * values are entered on the deployment, or written there by the vendor's own
 * setup flow, and referenced from a connection's flow or token as
 * '{vendor.<key>}'.
 */
export interface Vendor {
  /**
   * What the vendor client is called, for the operator's form.
   */
  label?: LocalizedText;
  fields: VendorField[];
  /**
   * How the vendor's client can be made for a deployment by the vendor itself,
   * rather than registered by hand. Absent: the operator enters every value.
   */
  setup?: VendorSetup;
}

export interface VendorField {
  key: Identifier;
  /**
   * A 'secret' is written once and never shown again.
   */
  type: VendorFieldType;
  /**
   * The plug-in is not live on a deployment until every required value is set.
   */
  required?: boolean;
  label: LocalizedText;
}

/**
 * A flow at the vendor that creates the vendor's client and answers with its
 * values. Initiative runs it from the operator's browser and writes what the
 * vendor answers into the deployment's vendor values, so none is typed or
 * copied. One member per flow, told apart by 'kind'.
 */
export type VendorSetup = GithubAppManifestSetup;

/**
 * A GitHub App created from a manifest (GitHub's app manifest flow). The
 * operator confirms it on GitHub, and Initiative exchanges the code GitHub
 * returns for the new app's values. Initiative fills in every address itself
 * (the callback, setup, webhook and redirect URLs), so the manifest names none.
 */
export interface GithubAppManifestSetup {
  kind: "github_app_manifest";
  app: GithubAppManifest;
  /**
   * Which vendor value each of GitHub's answers is written to: one of this
   * plug-in's vendor field keys to one field of GitHub's manifest-conversion
   * response. Every key must be a field of the vendor block, each response
   * field is written at most once, and 'client_secret', 'pem' and
   * 'webhook_secret' are written only to a 'secret' field.
   */
  values: Record<string, GithubAppValue>;
}

/**
 * What GitHub is asked to create: the parts of a GitHub App manifest a plug-in
 * decides.
 */
export interface GithubAppManifest {
  /**
   * The name GitHub offers for the new app. The operator may change it on
   * GitHub, where an app's name is unique.
   */
  name: string;
  /**
   * The app's homepage, https.
   */
  url: string;
  /**
   * Any GitHub account may install the new app. Absent: only the account that
   * owns it.
   */
  public?: boolean;
  /**
   * The permissions the app is created with, by GitHub's name for each, such as
   * 'issues'. At most 100.
   */
  default_permissions?: Record<string, GithubPermissionLevel>;
  /**
   * The webhook events the app subscribes to, by GitHub's name for each, such
   * as 'issues'. GitHub accepts an event only beside a permission that covers
   * it. At most 100.
   */
  default_events?: Identifier[];
}

export interface EndpointParam {
  key: Identifier;
  type: ParamType;
  required?: boolean;
  label: LocalizedText;
  /**
   * Required when type is 'select'. The values themselves — a consumer that
   * shows a menu writes its own words for them.
   */
  options?: string[];
  /**
   * Where this parameter's values come from when only the plug-in can know
   * them. Names a read endpoint in THIS manifest and which of its returns holds
   * the values; a consumer building a form asks the deployment to resolve it
   * rather than showing a text box. For everything a manifest cannot list
   * because the answer differs per install and changes after it — a repository,
   * a channel, a board, a project. `options` is the other case: a set that is
   * the same on every deployment forever. Declaring values, not a control: what
   * to draw is still the consumer's. Resolution is server-side, inherits the
   * source endpoint's `requires` and `cache_ttl_seconds`, and a source that
   * cannot be resolved leaves the parameter enterable rather than unusable.
   */
  options_from?: {
    /**
     * A read endpoint this same manifest declares. Not another plug-in's:
     * reading across plug-ins has no consent story, and an id from elsewhere is
     * refused on publish.
     */
    endpoint: NamespacedId;
    /**
     * Which of that endpoint's returns holds the values. Must be one it
     * declares, and a list: a menu comes from a column of values, not from one.
     */
    key: Identifier;
    /**
     * Optional. A second return, parallel to `key`, holding what a person reads
     * — a board's title beside its opaque id. Absent means the value is its own
     * label.
     */
    label_key?: Identifier;
    /**
     * Optional. What to send that endpoint, written as one of ITS parameter
     * names to one of THIS endpoint's. A repository's labels, a board's fields,
     * a field's values — past the first source in a form, most of them answer
     * differently depending on what has been chosen already, and a source that
     * could not be told a sibling's answer could only ever offer the whole
     * account's worth. Every named sibling must be a parameter this endpoint
     * declares, and none of them this one. Until all of them have a value the
     * source is not called and the parameter stays enterable, exactly as for a
     * source that will not resolve.
     */
    needs?: Record<string, Identifier>;
  };
  /**
   * Several values rather than one. Cardinality is a fact about the value, so
   * it is yours; what to draw for it is the consumer's. Without it, a plug-in
   * wanting several of something declares a string and documents a comma —
   * which nothing downstream can validate or complete.
   */
  list?: boolean;
}

export interface EndpointReturn {
  key: Identifier;
  /**
   * The parameter vocabulary minus 'select', because a select is a control and
   * the value behind one is a string.
   */
  type: ReturnValueType;
  label?: LocalizedText;
  /**
   * Several values rather than one. It matters to a consumer with somewhere to
   * put exactly one — a form field, a tile's number — which is why it is a flag
   * rather than a second set of types.
   */
  list?: boolean;
  /**
   * Another return of this same endpoint that this one is counted against:
   * 'used' of 'allowed', so a consumer can draw the pair as one measure. Both
   * must be single 'int' returns, and a return is never counted against itself.
   * The other return answering null means there is no ceiling, and the figure
   * stands alone. Absent: a figure in its own right — a balance, a tally, a
   * date it resets.
   */
  of?: Identifier;
}

export interface Connection {
  id: Identifier;
  /**
   * Who the credential belongs to. 'static' is one credential the whole
   * community uses; 'interactive' is each member's own account at a vendor that
   * authorizes people. It does not say how the credential is obtained: a static
   * connection with a 'flow' is still one credential for the whole community,
   * run by an admin through the vendor's own pages rather than typed into a
   * form. An interactive connection always declares a 'flow'.
   */
  scope: ConnectionScope;
  label: LocalizedText;
  /**
   * Without a 'flow', what an admin types. With one, only the values the
   * plug-in's after_connect hook returns, and every field is 'managed'. The
   * tokens a flow obtains are held apart from these, under reserved keys the
   * plug-in never declares.
   */
  fields: ConnectionField[];
  /**
   * How the connection is established. Initiative runs it: the redirect, the
   * code exchange, refreshing and revoking. The plug-in never holds the vendor
   * client's secret or a refresh token.
   */
  flow?: ConnectionFlow;
  /**
   * How a usable access token is got for this connection. Absent: the tokens
   * the flow stored, refreshed as needed. Static connections only.
   */
  token?: ConnectionToken;
  access_hint?: AccessHint;
  health?: ConnectionHealth;
}

/**
 * An OAuth 2.0 authorization code flow (RFC 6749 §4.1) that Initiative runs for
 * a connection, with the redirect addresses the deployment publishes.
 */
export interface ConnectionFlow {
  type: FlowType;
  /**
   * The vendor's authorization endpoint, https. May name a vendor value as
   * '{vendor.<key>}' and one of this connection's own fields as '{<key>}'.
   */
  authorize_url: string;
  /**
   * The vendor's token endpoint, https. May name a vendor value as
   * '{vendor.<key>}' and one of this connection's own fields as '{<key>}'.
   */
  token_url: string;
  /**
   * The vendor client's id, normally '{vendor.client_id}'. May name a vendor
   * value as '{vendor.<key>}' and one of this connection's own fields as
   * '{<key>}'.
   */
  client_id: string;
  /**
   * The vendor client's secret, normally '{vendor.client_secret}'. Absent for a
   * public client. May name a vendor value as '{vendor.<key>}' and one of this
   * connection's own fields as '{<key>}'.
   */
  client_secret?: string;
  /**
   * The vendor scopes asked for, sent space-separated.
   */
  scopes?: string[];
  /**
   * Send an S256 code challenge (RFC 7636).
   */
  pkce?: boolean;
  /**
   * Extra query parameters for the authorization request. May name a vendor
   * value as '{vendor.<key>}' and one of this connection's own fields as
   * '{<key>}'.
   */
  authorize_params?: Record<string, string>;
  /**
   * Static connections only. The vendor's install page, for a connection an
   * organization installs: the person installs first, the vendor returns to the
   * setup address with the installation's id, and one authorization trip
   * follows so the plug-in can check who installed it. Requires
   * 'after_connect'. May name a vendor value as '{vendor.<key>}' and one of
   * this connection's own fields as '{<key>}'.
   */
  install_url?: string;
  /**
   * What runs once the code is exchanged, with the fresh access token, to learn
   * the connection's managed values and an account label, or to refuse it. A
   * container plug-in sets true, and Initiative calls its after_connect hook; a
   * declarative plug-in gives the call and its mapping.
   */
  after_connect?: boolean | AfterConnect;
  /**
   * How a grant is ended at the vendor when the connection ends: 'rfc7009'
   * posts to 'revoke_url' with the client's credentials; 'github_grant' sends
   * DELETE to 'revoke_url' (GitHub's 'Delete an app authorization') with the
   * client's credentials as HTTP Basic auth and the access token in the JSON
   * body as 'access_token'; 'hook' calls the plug-in's revoke hook with the
   * tokens, so a container plug-in's only. Absent: the tokens are deleted and
   * nothing is sent.
   */
  revoke?: RevokeMethod;
  /**
   * The vendor's revocation endpoint: RFC 7009's for 'rfc7009', or GitHub's
   * grant address
   * (https://api.github.com/applications/{vendor.client_id}/grant) for
   * 'github_grant'. Required when 'revoke' is either. May name a vendor value
   * as '{vendor.<key>}' and one of this connection's own fields as '{<key>}'.
   */
  revoke_url?: string;
}

/**
 * An access token minted on demand rather than stored: Initiative signs a JWT
 * with the vendor key and exchanges it, and caches the answer until shortly
 * before it expires.
 */
export interface ConnectionToken {
  type: TokenType;
  /**
   * Where the signed JWT is posted, https. The answer's 'token' (or
   * 'access_token') and 'expires_at' (or 'expires_in') are read. May name a
   * vendor value as '{vendor.<key>}' and one of this connection's own fields as
   * '{<key>}'.
   */
  exchange_url: string;
  /**
   * A JSON body posted with the signed JWT, such as the narrower permissions a
   * token is asked for. Absent: none. A string anywhere in it may name a vendor
   * value as '{vendor.<key>}' and one of this connection's own fields as
   * '{<key>}'. Or an expression answering the body, which reads only
   * 'connection': this connection's own non-secret fields by key, its managed
   * values included, as 'after_connect' stored them. A body that names a vendor
   * value is written as an object. An answer that is not an object fails the
   * token request, so the connection cannot be used until the expression
   * answers one.
   */
  exchange_body?: Record<string, unknown> | Expression;
  /**
   * The JWT's issuer, normally '{vendor.app_id}'. May name a vendor value as
   * '{vendor.<key>}' and one of this connection's own fields as '{<key>}'.
   */
  iss: string;
  /**
   * The signing key, as a vendor value: '{vendor.private_key}'. A PEM private
   * key.
   */
  key: string;
  alg?: JwtAlgorithm;
  /**
   * How long the signed JWT lives, in seconds.
   */
  lifetime?: number;
}

/**
 * The vendor's webhooks, received by Initiative at one address per plug-in on
 * the deployment, '/api/v1/plugin-hooks/<public_id>'. Initiative checks each
 * delivery's signature, drops one it has already delivered, finds the
 * communities it belongs to by a value in its body, and forwards it to the
 * plug-in's webhook hook once for each. A container plug-in's hook receives
 * each delivery; a declarative plug-in maps it with 'events' and 'status'
 * instead.
 */
export interface Webhooks {
  verify: WebhookVerify;
  /**
   * The header carrying the vendor's id for one delivery, such as
   * 'X-GitHub-Delivery'. A delivery with an id already forwarded to a community
   * is not forwarded to it again.
   */
  dedup: string;
  route: WebhookRoute;
  /**
   * Declarative plug-ins: what a delivery does: emit one of this plug-in's
   * events, change the plug-in's values, or both. The first row whose 'when'
   * holds applies, its 'emit' and its 'write' both; a delivery no row matches
   * is dropped.
   */
  events?: WebhookEvent[];
  /**
   * Declarative plug-ins: deliveries that say what state a connection is in at
   * the vendor. The first row whose 'when' holds sets it.
   */
  status?: WebhookStatus[];
}

/**
 * How a delivery's signature is checked: an HMAC over the raw body under a
 * vendor value.
 */
export interface WebhookVerify {
  scheme: WebhookScheme;
  /**
   * The header carrying the signature, such as 'X-Hub-Signature-256'.
   */
  header: string;
  /**
   * What precedes the signature in the header, such as 'sha256='. Absent:
   * nothing does.
   */
  prefix?: string;
  /**
   * How the signature is written.
   */
  encoding: WebhookEncoding;
  /**
   * The signing secret, as one vendor value: '{vendor.<key>}'.
   */
  secret: string;
}

/**
 * Which communities a delivery belongs to: a value in its body or in one of its
 * headers, matched against one field of a static connection as each community's
 * connect stored it. Exactly one of 'path' and 'header'.
 */
export interface WebhookRoute {
  /**
   * Where the value is in the JSON body, as keys joined by '.', such as
   * 'installation.id'.
   */
  path?: string;
  /**
   * The header carrying the value, such as 'X-Shopify-Shop-Domain'.
   */
  header?: string;
  /**
   * A static connection this plug-in declares.
   */
  connection: Identifier;
  /**
   * A field that connection declares, whose stored value the body's value is
   * matched against.
   */
  field: Identifier;
}

/**
 * Something Initiative runs on an interval, once for each community that
 * installed the plug-in, with when it last succeeded there as 'since'. A
 * container plug-in's schedule calls its schedule hook, and names nothing more.
 * A declarative plug-in's makes one of its read endpoints' calls as the
 * installation and changes the plug-in's values from the answer: it names the
 * 'endpoint' and the 'write', and 'params' when the endpoint takes any.
 */
export interface Schedule {
  /**
   * Unique within the manifest. A container's hook is told which schedule is
   * due by it. A declarative plug-in's differs from every connection's id:
   * Initiative keys connection health checks by connection id.
   */
  id: Identifier;
  /**
   * How often: a whole number of minutes ('15m') or hours ('6h'), at least 5
   * minutes and at most 1440 minutes.
   */
  every: string;
  /**
   * Declarative plug-ins: a read endpoint this manifest declares, whose
   * 'actors' include 'installation': no person is present when a schedule runs.
   */
  endpoint?: NamespacedId;
  /**
   * Declarative plug-ins: the endpoint's params, as one expression answering an
   * object. It reads 'since', when the schedule last succeeded in the community
   * (ISO 8601), or null the first time; 'now'; 'connection', the non-secret
   * fields of the connection the endpoint's first request names; 'settings' and
   * 'aliases'. Absent: none.
   */
  params?: Expression;
  /**
   * Declarative plug-ins: the changes Initiative makes to the plug-in's values
   * from the endpoint's answer, as the install: a list of at most 100 targeted
   * changes ('targetedChange'). It reads 'result', the endpoint's mapped
   * answer, 'since', 'now', 'settings' and 'aliases'. Answering nothing changes
   * nothing.
   */
  write?: Expression;
}

/**
 * Namespaced under the plug-in's own service id — 'plugin.<public_id>.<name>'.
 * The prefix is checked against the declaring registration at ingress.
 */
export type NamespacedId = string;

/**
 * 'plugins:<public_id>': permission to call another plug-in's public endpoints
 * through the deployment, as this community or as one of its members, and to
 * read the values that plug-in shows on items this one can read. Not one of the
 * fixed scopes: the family is open, one per plug-in, and the public id after
 * the prefix is the plug-in being called. The deployment never lets a plug-in
 * address another directly; the call goes through it, and the plug-in called is
 * handed its own references for whoever the call is for.
 */
export type PluginScope = `plugins:${string}`;

export interface Endpoint {
  id: NamespacedId;
  /**
   * What this endpoint IS, in words somebody picks it out of a list by. Every
   * direction, and an emission most of all: it is the one thing here chosen
   * without ever being called.
   */
  label?: LocalizedText;
  /**
   * A second line, where the label needs one.
   */
  description?: LocalizedText;
  /**
   * What this hands back, by name and type — the response for a read or a
   * write, the payload for an emission. Declared rather than discovered,
   * because a consumer binds one of these before the endpoint has ever run and
   * a bad binding has to be refusable when somebody arranges it.
   */
  returns?: EndpointReturn[];
  /**
   * Where a consumer that groups a plug-in's endpoints should file this one.
   * Opaque here: the grouping is the consumer's, and an endpoint that says
   * nothing sits in the flat list.
   */
  group?: Identifier;
  /**
   * What a caller must already have in hand for this to mean anything. Opaque
   * here — the vocabulary belongs to whoever consumes it; the automation
   * service names the subjects a run can be about.
   */
  needs_subject?: Identifier;
  /**
   * 'read' and 'write' are called through the deployment and answer in place;
   * 'emit' travels the other way — the plug-in posts it to a subscriber that
   * registered a URL, so it carries no parameters and nothing to gate.
   */
  direction: Direction;
  /**
   * What a caller may send. Read and write only.
   */
  params?: EndpointParam[];
  /**
   * Whose credential the call runs on, best first. Read and write only. An
   * endpoint offering only 'member' refuses when that member has connected
   * nothing, rather than quietly acting as the plug-in instead.
   */
  actors?: ActorKind[];
  /**
   * Only the community's admins read or call this endpoint — a figure for the
   * community's settings page, say. Anyone who can see where it is used may
   * otherwise.
   */
  admin_only?: boolean;
  /**
   * Read and write only. Other plug-ins may call this endpoint through the
   * deployment, when the community has let them use this plug-in
   * ('plugins:<your public id>'). A caller acts as the community or as one of
   * its members, and `actors` says which of the two this endpoint takes: one
   * that names neither is not callable this way. A write endpoint is reachable
   * only like this; a widget binds reads alone. Absent means only the
   * deployment's own surfaces reach it.
   */
  public?: boolean;
  requires?: Requires;
  /**
   * Read only. How long a response may be reused. Clamped into 0..86400 rather
   * than refused, so a value outside that range is accepted and takes effect at
   * the bound — which is why no range is asserted here.
   */
  cache_ttl_seconds?: number;
  /**
   * 'write' and 'emit': what this touched, or what it is about. Read endpoints
   * have none — they touched nothing, so there is no echo to suppress.
   */
  identity?: EndpointIdentity;
  /**
   * Read and write only. The codes this endpoint may answer 'unavailable' with
   * beyond Initiative's own (invalid, mapping-failed, not-authorized,
   * not-found, range-too-large), so a consumer can put each into words.
   */
  unavailable?: Identifier[];
  /**
   * Declarative plug-ins: the one call that answers this endpoint. Not beside
   * 'steps'.
   */
  request?: VendorRequest;
  /**
   * Declarative plug-ins: up to 3 calls made in order, each able to read the
   * answers of the ones before it. Not beside 'request'.
   */
  steps?: RequestStep[];
  /**
   * Declarative plug-ins: the endpoint's answer, from 'response' (the last
   * call's answer) and 'steps': an object of its declared returns, or
   * {"unavailable": "<code>"} naming one of its codes.
   */
  map?: Expression;
  /**
   * Declarative plug-ins: vendor answers this endpoint gives its own meaning,
   * tried on every answer before the defaults. The defaults: 401 and 403 are
   * not-authorized, 404 not-found, 400, 422 and any other 4xx invalid, and 429,
   * 3xx and 5xx transient.
   */
  errors?: ErrorRule[];
}

export interface Widget {
  id: Identifier;
  /**
   * The widget's own name and description, as the picker shows them. Must name
   * the widget in at least one language.
   */
  meta: Record<string, unknown>;
  /**
   * The widget's browser-side module. Stored as an opaque string and executed
   * only inside the sandbox; the platform never parses it. Capped in UTF-8
   * bytes, which this schema cannot express.
   */
  module_source: string;
  /**
   * Read endpoint ids this manifest also declares. Only a read answers with
   * something to draw.
   */
  endpoints?: NamespacedId[];
  /**
   * What each endpoint would answer with, keyed by declared read endpoint id,
   * so a preview renders with no network call. Written in the endpoint's own
   * returns and read through them exactly as a live answer is. Keys naming an
   * undeclared endpoint are dropped.
   */
  sample_data?: Record<string, unknown>;
  requires?: Requires;
}

export interface Page {
  id: Identifier;
  path: Path;
  name: LocalizedText;
  /**
   * Where the page renders. Declaring both gives it a community-wide entry and
   * an entry inside each initiative.
   */
  scopes?: SurfaceScope[];
  /**
   * Only the community's admins open this page, whatever roles a placement
   * allows — a settings page, say. Who else may open a page is chosen in the
   * community, per initiative and per role, not declared here.
   */
  admin_only?: boolean;
  /**
   * Browser features the frame is granted. A page that names nothing is framed
   * with all of them denied.
   */
  capabilities?: PageCapability[];
  requires?: Requires;
}

/**
 * A key the plug-in keeps a value under, on an item or on its own install: a
 * lowercase letter, then lowercase letters, digits, '_' and '.'.
 */
export type MetadataKey = string;

/**
 * How one of the plug-in's metadata keys is shown on Initiative's items. The
 * value is kept in Initiative: a container plug-in writes it with its
 * installation token, and for a declarative plug-in Initiative writes it from
 * the plug-in's expressions. Initiative draws it with its own component for
 * `kind` and computes its plain text itself, so a field filters, sorts and
 * exports with no call to the plug-in. Which views show it is chosen by the
 * community's managers, never by the plug-in. Initiative holds what is kept,
 * and these caps are enforced there rather than here: a value of at most 8192
 * bytes as JSON, with a string of at most 255 characters to be found by, and
 * each element of a list a value of its own, found by its 'ref'; at most 32
 * keys and 65536 bytes on one item, and 256 keys and 1048576 bytes on the
 * install.
 */
export interface Field {
  /**
   * The metadata key whose value this shows. Unique among this manifest's
   * fields.
   */
  key: MetadataKey;
  /**
   * The field's label.
   */
  name: LocalizedText;
  /**
   * What the value is, and so how it is drawn: 'text' a string; 'number' a
   * number; 'date' a 'YYYY-MM-DD' string; 'datetime' an ISO 8601 string with
   * its offset; 'link' {url, text?}; 'badge' {text, tone?}; 'scale' a number
   * from 0 to 100, or {value, max}, which Initiative keeps as value ÷ max ×
   * 100, drawn as a number, stars or a bar; 'checkbox' a boolean; 'url' an
   * address, as a string; 'currency' a number, an amount in the field's
   * 'currency'; 'select' the value of one of the field's 'options';
   * 'multi_select' a list of them; 'user_reference' a person, as the install's
   * own reference for them: the 'id' Initiative gives the person wherever the
   * plug-in reads one.
   */
  kind: FieldKind;
  /**
   * Several values rather than one: the value is a list of elements, each one
   * value of 'kind' with a 'ref' that tells it from the others ('listElement').
   * A change gives the whole list in 'set', or adds, replaces and removes
   * elements by 'ref' with 'upsert' and 'remove'. Absent: one value, which a
   * change sets. Every kind but 'multi_select', whose one value is already
   * several.
   */
  list?: boolean;
  /**
   * The item kinds it is offered on.
   */
  on: ItemKind[];
  /**
   * The one line the view editor's Add picker shows beside the name.
   */
  description?: LocalizedText;
  /**
   * A badge's tone when its value names none.
   */
  tone?: Tone;
  /**
   * A currency field's ISO 4217 code, such as 'EUR': what its amounts are in.
   * Required on one.
   */
  currency?: string;
  /**
   * A select or multi_select field's options, each value at most once. Required
   * on one.
   */
  options?: FieldOption[];
  /**
   * What state the value is in, as facets by id, at most 4, each with keys of
   * its own. The value names a key of each facet it is in as 'state',
   * {"<facet>": "<key>"}, and Initiative draws each as a badge, labelled in the
   * reader's language. A list element, and a link, badge or scale value written
   * as an object, carries 'state' beside its other properties; any other value
   * that carries one is written as an element is, without the 'ref': {"value":
   * …, "state": …}.
   */
  states?: Record<string, StateFacet>;
  /**
   * Declarative plug-ins, on a list field: actions offered on each of its
   * elements, by id, each one offered on every item kind this field is. An
   * action run from an element reads that element's 'ref' as 'element'.
   */
  actions?: Identifier[];
  requires?: Requires;
}

/**
 * One option of a select or multi_select field: the value a value names, and
 * how Initiative shows it.
 */
export interface FieldOption {
  /**
   * What a value holds when it names this option: a letter or a digit, then
   * letters, digits, '_' and '-'. Unique among the field's options.
   */
  value: string;
  /**
   * The option's words, in the reader's language.
   */
  label: LocalizedText;
  /**
   * The option's colour, as '#rrggbb'.
   */
  color?: string;
}

/**
 * One facet of a field's state, such as whether a piece of work is open or what
 * review it has: its name, and the keys a value may name.
 */
export interface StateFacet {
  /**
   * What the facet is called.
   */
  name: LocalizedText;
  /**
   * The keys a value may name, at most 12, each with its badge's words and
   * tone.
   */
  values: Record<string, StateValue>;
}

/**
 * One key of a state facet, as its badge shows it.
 */
export interface StateValue {
  label: LocalizedText;
  tone?: Tone;
}

/**
 * One node of a part: one of Initiative's own components, told apart by 'type',
 * with its props and, for a section or a stack, the nodes inside it.
 */
export type PartNode = SectionNode | StackNode | FieldNode | ValueNode | TextNode | ButtonNode;

/**
 * A titled group, which the reader may fold.
 */
export interface SectionNode {
  type: "section";
  props?: {
    title?: LocalizedText;
    /**
     * Drawn folded until the reader opens it.
     */
    collapsed?: boolean;
  };
  /**
   * Drawn in order, inside this one.
   */
  children?: PartNode[];
}

/**
 * Nodes side by side or one above another.
 */
export interface StackNode {
  type: "stack";
  props?: {
    direction?: "row" | "column";
    /**
     * The space between the nodes. Absent: Initiative's own.
     */
    gap?: "none" | "small" | "medium" | "large";
    /**
     * A row runs onto a second line rather than past its edge.
     */
    wrap?: boolean;
  };
  /**
   * Drawn in order, inside this one.
   */
  children?: PartNode[];
}

/**
 * A field's label and its value.
 */
export interface FieldNode {
  type: "field";
  props: {
    /**
     * One of this manifest's fields, by its key, offered on every item kind the
     * part is.
     */
    field: MetadataKey;
  };
}

/**
 * A field's value alone.
 */
export interface ValueNode {
  type: "value";
  props: {
    /**
     * One of this manifest's fields, by its key, offered on every item kind the
     * part is.
     */
    field: MetadataKey;
  };
}

/**
 * Words the plug-in wrote.
 */
export interface TextNode {
  type: "text";
  props: {
    /**
     * May name '{item.id}', the item's id, and '{settings.<key>}', one of this
     * plug-in's settings, which Initiative fills in when it draws the part. Any
     * other '{…}' is refused.
     */
    text: LocalizedText;
    tone?: Tone;
  };
}

/**
 * A button that runs one of this plug-in's actions on the item, labelled with
 * the action's name.
 */
export interface ButtonNode {
  type: "button";
  props: {
    /**
     * One of this manifest's actions, by its id, offered on every item kind the
     * part is.
     */
    action: Identifier;
    variant?: "primary" | "secondary" | "ghost";
  };
}

/**
 * A piece of an item's page or view, built from Initiative's own components and
 * bound to this plug-in's fields and actions. Data only: Initiative draws each
 * node, and no plug-in code runs in the reader's browser. Which views show it
 * is chosen by the community's managers, never by the plug-in, and Initiative
 * places at most 3 of a plug-in's parts on one item.
 */
export interface Part {
  /**
   * Unique among this manifest's parts.
   */
  id: Identifier;
  /**
   * What the view editor calls it.
   */
  name: LocalizedText;
  /**
   * The item kinds it is offered on.
   */
  on: ItemKind[];
  /**
   * What is drawn: at most 50 nodes, at most 4 deep.
   */
  tree: PartNode;
  /**
   * The one line the view editor's Add picker shows beside the name.
   */
  description?: LocalizedText;
  requires?: Requires;
}

/**
 * Something a reader runs on one item, from a part's button, the item's own
 * menu, or an element of a list field that offers it. Initiative first asks the
 * reader for the 'params' the action names, when it names any. For a container
 * plug-in, Initiative only connects: it calls the write endpoint as the
 * installation, with those parameters, the reader as 'viewer' and the item as
 * 'subject' in the call's token, and the endpoint does the work, usually
 * writing the plug-in's metadata. For a declarative plug-in, Initiative does
 * the work: it makes the endpoint's call, when the action names one, with those
 * parameters, on the credential its 'actors' say, its expressions reading the
 * item as 'item' and the element it was run from, if any, as 'element'; then it
 * makes the change 'write' answers, when the action has one, to the plug-in's
 * values on the item, as the install. Either way Initiative then answers the
 * reader with the item's metadata as it stands.
 */
export interface Action {
  /**
   * Unique among this manifest's actions.
   */
  id: Identifier;
  /**
   * The button's or the menu entry's label.
   */
  name: LocalizedText;
  /**
   * An endpoint this manifest declares. A container plug-in's action names a
   * write, which its handler answers. A declarative plug-in's names a read or a
   * write, a 'write' expression, or both: a read fetches what the 'write'
   * keeps, a write changes something at the vendor.
   */
  endpoint?: NamespacedId;
  /**
   * Parameters of the action's endpoint, by key, that Initiative asks the
   * reader for before it runs the action, in a form drawn from the endpoint's
   * own declarations of them: each one's type and label, and its 'options' or
   * 'options_from'. The endpoint is sent these and nothing else, so every
   * parameter it requires is among them.
   */
  params?: Identifier[];
  /**
   * Declarative plug-ins: the change Initiative makes to the plug-in's values
   * on the action's item, as the install: one change ('change'). It reads
   * 'item', the item ({kind, id, title}); 'held', this install's values on it,
   * by key; 'result', the endpoint's mapped answer, absent when the action
   * names no endpoint; 'params', what the reader answered; 'element', the 'ref'
   * of the list element it was run from, absent when it was not; 'settings',
   * 'aliases' and 'now'. Answering nothing changes nothing.
   */
  write?: Expression;
  /**
   * The item kinds it is offered on.
   */
  on: ItemKind[];
  /**
   * A question Initiative asks before running it. Absent: it runs at once.
   */
  confirm?: LocalizedText;
  /**
   * Also offered in the item's own menu.
   */
  menu?: boolean;
  /**
   * Only the community's admins run this action, whatever roles a placement
   * allows. Who else may run it is chosen in the community, per initiative and
   * per role, not declared here.
   */
  admin_only?: boolean;
  requires?: Requires;
}

/**
 * A change to the plug-in's values on one item or on its install, as a
 * declarative plug-in's 'write' answers it. 'set' writes values by key, as a
 * container's client.metadata.set does; 'upsert' and 'remove' change a list
 * field's elements by their 'ref'. A change gives at least one of the three,
 * and changes each key with only one. Initiative makes it as the install, and
 * holds what is kept to the caps a field's description gives.
 */
export interface Change {
  /**
   * Values by metadata key, each any JSON value of at most 8192 bytes; a null
   * removes its key. A list field's value is its whole list of elements, each
   * held to that cap.
   */
  set?: Record<string, unknown>;
  /**
   * Elements by metadata key ('listElement'): each is added to that key's list,
   * or merged into the element there with its 'ref': the properties it gives
   * replace that element's, the ones it leaves out stay, and its 'state' merges
   * the same way by facet. So a write that knows one fact about an element
   * changes that fact alone.
   */
  upsert?: Record<string, ListElement[]>;
  /**
   * Refs by metadata key: the element with each is taken from that key's list.
   * A ref the list does not hold changes nothing.
   */
  remove?: Record<string, ElementRef[]>;
}

/**
 * A change and where Initiative makes it. A webhook event's or a schedule's
 * 'write' answers a list of at most 100, and cannot read what their targets
 * hold.
 */
export interface TargetedChange {
  target: ChangeTarget;
  /**
   * As a change's: values by metadata key, a null removing its key.
   */
  set?: Record<string, unknown>;
  /**
   * As a change's: elements by metadata key, each added to its list or merged
   * into the one with its 'ref', property by property and its 'state' facet by
   * facet.
   */
  upsert?: Record<string, ListElement[]>;
  /**
   * As a change's: refs by metadata key, each element with one taken from its
   * list.
   */
  remove?: Record<string, ElementRef[]>;
}

/**
 * Where a change is made: {kind, id}, one item; {install: true}, the install
 * itself; or {holding: {key, value}}, every item on which this install holds
 * 'value' under 'key', as a container's client.metadata.find finds them.
 * Initiative keeps each element of a list as a value of its own, so 'holding'
 * reaches an element by its 'ref'. A target the install cannot read is skipped.
 */
export type ChangeTarget = {
  kind: ItemKind;
  id: number;
} | {
  install: true;
} | {
  holding: {
    key: MetadataKey;
    /**
     * A value is found by its text: a string as it is, a number or a boolean as
     * JSON writes it; a list element by its 'ref'.
     */
    value: string;
  };
};

/**
 * One element of a list field's value: one value of the field's 'kind', with a
 * 'ref' that tells it from the list's others. A text, number, date, datetime,
 * checkbox, url, currency, select or user_reference element holds its value in
 * 'value'; a link element is {ref, url, text?}, a badge element {ref, text,
 * tone?} and a scale element {ref, value, max?}. Initiative keeps each element
 * as a value of its own, of at most 8192 bytes as JSON. An 'upsert' may give
 * only some of an element's properties: they are merged into the element with
 * its 'ref'.
 */
export interface ListElement {
  ref: ElementRef;
  /**
   * A text, number, date, datetime, checkbox, url, currency, select or
   * user_reference element's value, or a scale element's figure: from 0 to 100,
   * or out of its 'max'.
   */
  value?: string | number | boolean;
  /**
   * A link element's address.
   */
  url?: string;
  /**
   * A link element's words, or a badge element's.
   */
  text?: string;
  /**
   * A badge element's tone.
   */
  tone?: Tone;
  /**
   * A scale element's whole, when its figure is not already out of 100:
   * Initiative keeps value ÷ max × 100.
   */
  max?: number;
  /**
   * A key of each of the field's state facets this element is in, by facet id.
   */
  state?: Record<string, Identifier>;
}

/**
 * What tells a list's element from the others, such as the vendor's own id for
 * what it shows: unique in its list, and how a change replaces or removes the
 * element and a 'holding' target finds it.
 */
export type ElementRef = string;

/**
 * A value the community's admins see and may change on the install, which the
 * plug-in's expressions read as 'settings.<key>' and its parts' text names as
 * '{settings.<key>}'.
 */
export interface Setting {
  /**
   * Unique among this manifest's settings.
   */
  key: Identifier;
  /**
   * What the value is: 'string', a line of text.
   */
  type: SettingType;
  label: LocalizedText;
  /**
   * A line under the label.
   */
  description?: LocalizedText;
  /**
   * No two communities on a deployment hold the same value for this plug-in,
   * and the value is a 'uniqueSettingValue'. An admin who renames it keeps the
   * earlier values, which no other community may take and the plug-in's
   * expressions read as 'aliases.<key>'.
   */
  unique?: boolean;
  /**
   * A unique setting's only: Initiative gives it a value when the community
   * installs the plug-in, which an admin may rename. 'community_name': the
   * letters and digits of the community's name, in lowercase, with a short
   * random suffix when another community holds that value.
   */
  assigned?: SettingAssignment;
}

/**
 * A unique setting's value: a lowercase letter, then lowercase letters and
 * digits, two to 16 characters in all. It holds no '-', so a reference such as
 * '<value>-<number>' reads one way.
 */
export type UniqueSettingValue = string;

export interface BundledDashboard {
  /**
   * This dashboard's own catalog id — publisher-assigned, immutable, never
   * reused. It becomes a listing of its own, so this is a real catalog identity
   * and not the plug-in's.
   */
  uid: string;
  /**
   * '<publisher>.<slug>', and not the plug-in's own — a bundled dashboard is a
   * separate listing.
   */
  public_id: string;
  name: string;
  description?: string;
  layout?: {
    columns?: number;
  };
  widgets: BundledDashboardWidget[];
}

export interface BundledDashboardWidget {
  id?: Identifier;
  /**
   * One of this manifest's own widget ids — bare, with no uid. The platform
   * stamps the plug-in's uid on when it publishes, so the two can never
   * disagree.
   */
  type: Identifier;
  title?: string;
  grid?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };
  binding: {
    /**
     * One of this manifest's own read endpoint ids. Only a read answers with
     * something to draw.
     */
    endpoint_id: NamespacedId;
    params?: Record<string, string | number | boolean>;
  };
}

/**
 * Which of this endpoint's returns identify the thing it touched. A consumer
 * keeps a change an automation made from firing that automation again, and for
 * a plug-in there was no key — so guessing would silently drop a fire somebody
 * was waiting on, and a rate cap was the only guard. Declare the SAME kind and
 * key on the write and on the emission about it, and the two produce the same
 * address.
 */
export interface EndpointIdentity {
  /**
   * Your own word for what sort of thing this is ('issue'). Namespaced by your
   * public id downstream, because two plug-ins declaring the same kind mean two
   * different things.
   */
  kind: Identifier;
  /**
   * Returns of this endpoint, in order, joined to form the address. Every one
   * must be a single value rather than a list — half an address matches
   * nothing, and one built from the parts that happened to be there matches the
   * wrong thing.
   */
  key: Identifier[];
}

/**
 * A JSONata expression (https://jsonata.org): standard JSONata, with no
 * functions added. It reads one document. On the way out that holds 'params',
 * the call's parameters as the caller sent them; 'connection', the non-secret
 * fields of the connection the request names; 'connections', on an endpoint's
 * requests and map, each connection its 'requires' names that the call has, by
 * its id, holding the same fields; 'now', the time of the call in ISO 8601,
 * which $now() and $millis() also answer; 'steps', each earlier step's answer
 * by its name; and, on the call an action makes, 'item', the item it runs on:
 * {kind, id, title}, and 'element', the 'ref' of the list element it was run
 * from, if it was. On the way back it also holds 'response', the answer being
 * read: {status, headers, body}, with header names in lowercase. Every
 * expression of a declarative plug-in also reads 'settings', the install's
 * settings by key, and 'aliases', each unique setting's earlier values by key,
 * as a list, except a token's 'exchange_body', which reads only its connection.
 * Each evaluation is bounded: at most 1000 milliseconds, 500 levels of nesting
 * and an answer of 1048576 bytes as JSON. An expression that fails or passes a
 * bound answers 'unavailable: mapping-failed'.
 */
export type Expression = string;

/**
 * A host a declarative plug-in calls, in lowercase: exact ('api.github.com'),
 * or with one leading '*.' that stands for exactly one label
 * ('*.myshopify.com'). No scheme, port or path: every call is https on port
 * 443, and goes only to a public address.
 */
export type Host = string;

export type HeaderName = string;

export type QueryName = string;

/**
 * How Initiative puts a connection's credential on a declarative plug-in's
 * requests: one header, holding the prefix and the token joined by a space.
 * Absent: 'Authorization: Bearer <token>'.
 */
export interface VendorAuth {
  header?: HeaderName;
  /**
   * Written before the token. Empty: the token alone.
   */
  prefix?: string;
}

/**
 * One call Initiative makes to the vendor for a declarative plug-in, rendered
 * from expressions. Initiative adds the credential itself, as 'auth' says, and
 * follows no redirect.
 */
export interface VendorRequest {
  method: HttpMethod;
  /**
   * The address, as an expression answering a string: https, on one of the
   * plug-in's hosts. Query parameters may be written into it or given in
   * 'query'.
   */
  url: Expression;
  /**
   * Query parameters by name, each an expression. One answering null or nothing
   * is left out, and a list repeats the parameter once per value.
   */
  query?: Record<string, Expression>;
  /**
   * Headers by name, each an expression answering a string; one answering null
   * or nothing is left out. Never the credential's header, which Initiative
   * sets.
   */
  headers?: Record<string, Expression>;
  /**
   * The JSON body, as an expression. Not beside 'graphql'.
   */
  body?: Expression;
  graphql?: GraphqlRequest;
  /**
   * Which connection's credential the request carries: one connection for every
   * call, or, on a write endpoint's requests, one per actor
   * ('actorConnections'), so a call made as the member carries the member's own
   * credential and one made as the installation the community's. A static
   * connection's credential is the community's, an interactive one's the acting
   * member's, which a call made as the installation does not have. A call made
   * as a member carries a static connection's credential only when the
   * endpoint's 'requires' names that connection, and is refused otherwise.
   * Required on an endpoint's requests. Absent on 'after_connect' and 'health',
   * which carry the credential of the connection they belong to.
   */
  connection?: Identifier | ActorConnections;
  paging?: Paging;
}

/**
 * A GraphQL request, sent by POST as the JSON body {query, variables}.
 */
export interface GraphqlRequest {
  /**
   * The GraphQL document, as text. What varies goes in 'variables'.
   */
  query: string;
  /**
   * The variables, as an expression answering an object.
   */
  variables?: Expression;
}

/**
 * One connection per actor, on a write endpoint's requests: a call carries the
 * credential of the connection named for the actor it is made as. Names exactly
 * the actors the endpoint's 'actors' declare. The member's connection need not
 * be named in 'requires': a call made as the member requires the connection its
 * requests name for the member.
 */
export interface ActorConnections {
  /**
   * An interactive connection, which a call made as the member carries: the
   * member's own account.
   */
  member?: Identifier;
  /**
   * A static connection, which a call made as the installation carries: the
   * community's own.
   */
  installation?: Identifier;
}

export interface RequestStep {
  /**
   * Unique among its steps. Later steps, the map and the predicates beside it
   * read this step's answer as 'steps.<name>'.
   */
  name: Identifier;
  request: VendorRequest;
}

/**
 * How a request reads more than one page, one member per method, told apart by
 * 'kind'. Every page is read before the answer is mapped: 'response.body' is
 * then every page's items appended in order, and the status and headers are the
 * last page's. 'max_pages' is how many pages may be read; finding more after
 * that many truncates or refuses, as 'on_limit' says, and a refusal answers
 * 'unavailable: range-too-large'.
 */
export type Paging = PageNumberPaging | LinkHeaderPaging | CursorPaging;

/**
 * Numbered pages from 1, read until one holds fewer than 'per_page' items. Both
 * parameters are added to the request's query.
 */
export interface PageNumberPaging {
  kind: "page_number";
  /**
   * The parameter carrying the page number.
   */
  page_param: QueryName;
  /**
   * The parameter carrying 'per_page'. Absent: the vendor's page size is fixed,
   * and 'per_page' says what it is.
   */
  per_page_param?: QueryName;
  per_page: number;
  items?: PageItems;
  max_pages: MaxPages;
  on_limit: PageLimit;
}

/**
 * The address in the Link header's rel="next", followed until there is none. It
 * must be https on one of the plug-in's hosts.
 */
export interface LinkHeaderPaging {
  kind: "link_header";
  items?: PageItems;
  max_pages: MaxPages;
  on_limit: PageLimit;
}

/**
 * A cursor read from each page and sent with the next, while 'more' holds.
 * Exactly one of 'param' and 'variable' says where it is sent.
 */
export interface CursorPaging {
  kind: "cursor";
  /**
   * The next page's cursor, from this page's 'response'.
   */
  next: Expression;
  /**
   * Whether there is a next page, from this page's 'response'.
   */
  more: Expression;
  /**
   * The query parameter the cursor is sent in.
   */
  param?: QueryName;
  /**
   * The GraphQL variable the cursor is sent in.
   */
  variable?: string;
  items?: PageItems;
  max_pages: MaxPages;
  on_limit: PageLimit;
}

/**
 * A page's items, from that page's 'response'. Absent: its body.
 */
export type PageItems = Expression;

export type MaxPages = number;

/**
 * An HTTP status: one code, or a range of a hundred ('4xx').
 */
export type StatusMatch = number | StatusRange;

/**
 * A vendor answer an endpoint gives its own meaning. Rules are tried in order
 * on every answer, a 2xx included, and the first that matches decides.
 */
export interface ErrorRule {
  status: StatusMatch;
  /**
   * Also required to hold, over the answer as 'response'. Absent: the status
   * alone matches.
   */
  when?: Expression;
  /**
   * What the call answers: one of the endpoint's 'unavailable' codes, one of
   * Initiative's own (invalid, mapping-failed, not-authorized, not-found,
   * range-too-large), or 'transient' for a passing failure such as a throttle,
   * which is answered as one to retry.
   */
  code: Identifier;
}

/**
 * A declarative plug-in's after_connect: a request, or up to 3 steps, made with
 * the access token just obtained, and the answers mapped to what the hook would
 * answer. 'params' holds the flow's own parameters, such as the installation_id
 * an install page returned.
 */
export interface AfterConnect {
  /**
   * The one call. Not beside 'steps'.
   */
  request?: VendorRequest;
  /**
   * Up to 3 calls made in order, each able to read the answers of the ones
   * before it. Not beside 'request'.
   */
  steps?: RequestStep[];
  /**
   * The connection's managed values and its account label, from 'response' (the
   * last call's answer) and 'steps': {"values": {…}, "account_label": "…"}.
   */
  map: Expression;
  /**
   * Refuses the connection when it holds. It reads the map's answer as
   * 'result', beside 'response' and 'steps'.
   */
  refuse_when?: Expression;
  /**
   * What a refusal answers. Given exactly when 'refuse_when' is.
   */
  code?: Identifier;
}

/**
 * Declarative plug-ins: a request Initiative makes on an interval, with this
 * connection's credential, to learn whether the connection still works. A state
 * other than 'ok' is reported once two answers in a row give it.
 */
export interface ConnectionHealth {
  request: VendorRequest;
  /**
   * How often: a whole number of minutes ('15m') or hours ('6h'), at least 5
   * minutes and at most 1440 minutes.
   */
  every: string;
  /**
   * Tried in order; the first that matches gives the state. An answer none
   * matches is 'ok' when it is 2xx and 'unavailable' otherwise.
   */
  states: HealthState[];
}

/**
 * The answers one row matches, and the state they mean. A row naming neither
 * 'status' nor 'when' matches any answer.
 */
export interface HealthState {
  status?: StatusMatch;
  /**
   * Also required to hold, over the answer as 'response'.
   */
  when?: Expression;
  state: ConnectionState;
}

/**
 * What one kind of delivery does: emit an event, change the plug-in's values,
 * or both. It gives 'emit', 'write' or both, and 'map' exactly when it gives
 * 'emit'. Its expressions read 'headers' (names in lowercase), 'payload' (the
 * parsed body), 'connection' (the routed connection's non-secret fields),
 * 'now', 'settings' and 'aliases'.
 */
export interface WebhookEvent {
  /**
   * Whether this row applies.
   */
  when: Expression;
  /**
   * An emit endpoint this manifest declares.
   */
  emit?: NamespacedId;
  /**
   * The event's payload: an object of that endpoint's declared returns.
   */
  map?: Expression;
  /**
   * The changes Initiative makes to the plug-in's values, as the install: a
   * list of at most 100 targeted changes ('targetedChange'). Answering nothing
   * changes nothing.
   */
  write?: Expression;
}

/**
 * A delivery that says what state a connection is in, read as an event's
 * expressions are.
 */
export interface WebhookStatus {
  /**
   * Whether this row applies.
   */
  when: Expression;
  /**
   * A connection this plug-in declares.
   */
  connection: Identifier;
  /**
   * 'ok', 'suspended' or 'removed'.
   */
  state: ConnectionState;
}

/**
 * What a plug-in declares it can do. A plug-in is a container, which names its
 * `service` and answers Initiative's calls, or declarative, which names its
 * `hosts` and no service, and whose endpoints, connection checks, webhook
 * events, schedules and actions Initiative runs itself from the requests and
 * JSONata expressions written here, keeping the values they write on items; one
 * plug-in is never both. This is the 'definition' field of the document served
 * at /.well-known/initiative-plugin.json, NOT that whole document: a registrar
 * also requires protocol_version, public_id and kind alongside it, and refuses
 * a definition served bare. Generated from the platform's own validator
 * vocabulary. A manifest that satisfies this schema is well-formed, not
 * necessarily acceptable. Cross-references (the endpoint a widget binds, a
 * requires term's connection, an endpoint's service prefix), the
 * direction-specific rules on an endpoint, the features/blocks cross-check in
 * both directions, UTF-8 byte-size caps, the rules tying a connection's flow
 * and token to its scope and fields, what a webhooks block names, what a vendor
 * setup writes to, whether every expression parses, what a declarative request
 * and its steps name, the bounds, ids and endpoints of schedules, which terms
 * each kind's schedules, actions, fields and webhook events take, the unique
 * keys and ids of fields, parts, actions and settings, the unique values of a
 * field's options, what a part's nodes, a field's element actions and an
 * action's endpoint and params name, the placeholders in a part's text, and a
 * part's size and depth are enforced by the platform on publish and are not
 * expressible here.
 */
export interface Manifest {
  /**
   * The kind every plug-in manifest has, container or declarative: a
   * declarative plug-in is one with no 'service' block.
   */
  plugin_kind: "service";
  /**
   * A container plug-in's service, which Initiative calls. Absent for a
   * declarative plug-in, whose public id is its listing's.
   */
  service?: {
    /**
     * '<publisher>.<slug>'. The name the deployment's registration is matched
     * by, and the namespace this plug-in's events are emitted under.
     */
    public_id: string;
    protocol?: Protocol;
    /**
     * The scopes this plug-in asks a community to grant: what its installation
     * and member tokens act with. The fixed scopes, and 'plugins:<public_id>'
     * for each plug-in this one uses, to call its public endpoints and read the
     * values it shows on items (at most 24 of those). The community grants some
     * or all of them when it installs the plug-in, and a token never carries
     * more than was granted. Writing implies reading. Absent means none.
     */
    scopes?: Array<Scope | PluginScope>;
    /**
     * This plug-in may act through any plug-in the community lets it use, not
     * only those its scopes name as 'plugins:<public_id>'. When a community
     * installs another plug-in, it is asked there whether this one may use it,
     * which grants 'plugins:<public_id>' for it. Absent: only the plug-ins its
     * scopes name.
     */
    calls_plugins?: boolean;
  };
  /**
   * What this plug-in contributes. Cross-checked against the blocks present in
   * both directions: a feature with no block, or a block with no feature, is
   * refused.
   */
  features: Feature[];
  default_name?: string;
  /**
   * How old somebody must be to use this plug-in, by where they are. Keys are
   * ISO 3166-1 alpha-2 country codes, upper case, and 'default' for every
   * country not listed: {"default": 16, "US": 13}. The age of digital consent
   * differs by country, inside the EU as well as outside it, which is why a
   * region is a country rather than a regime. Absent, or a country with no
   * entry and no 'default': the deployment's own minimum applies. A
   * declaration, not a gate: whether a deployment enforces it, and how it
   * learns somebody's age and country, are its decisions. At most 64 entries,
   * each from 13 to 21.
   */
  minimum_age?: Record<string, number>;
  /**
   * The oldest plug-in API contract this plug-in needs, as 'MAJOR.MINOR':
   * '4.1'. The contract is the plug-in API published with
   * initiative-plugin-sdk, versioned as that package is. A deployment serving
   * contract S can run it when S has the same major version and a minor version
   * at least this one's. Absent: any contract; the plug-in makes no claim.
   * Beside a listing's min_app_version, the oldest Initiative release it runs
   * on, this says what the plug-in calls rather than which release serves it.
   */
  min_plugin_api?: string;
  /**
   * Declarative plug-ins, which must name at least one: every host their
   * requests, paging and links may reach. A container plug-in names none.
   */
  hosts?: Host[];
  /**
   * Declarative plug-ins only.
   */
  auth?: VendorAuth;
  /**
   * Declarative plug-ins: the scopes this plug-in asks a community to grant,
   * all of them read scopes ('<resource>:read'). A declarative plug-in keeps
   * its own values on items it can read and does not call Initiative, and
   * Initiative keeps them only on items these scopes read. A container plug-in
   * declares its scopes in its service block.
   */
  scopes?: Array<Scope | PluginScope>;
  vendor?: Vendor;
  connections?: Connection[];
  webhooks?: Webhooks;
  /**
   * What Initiative runs on an interval for each community: a container
   * plug-in's schedule hook, or a declarative plug-in's read and the values it
   * writes from the answer. At most 8.
   */
  schedules?: Schedule[];
  endpoints?: Endpoint[];
  /**
   * A read endpoint whose declared returns describe this community's standing
   * with your service — what it has used, what it is allowed. A deployment may
   * render them on the community's own settings page, beside its own figures.
   * Whether it does is the deployment's decision and not this manifest's: a
   * plug-in the operator did not ship is declaring where it would like to
   * appear, which is not the same as appearing.
   */
  community_summary?: NamespacedId;
  widgets?: Widget[];
  pages?: Page[];
  /**
   * Ready-made arrangements of this plug-in's own widgets. Publishing the
   * plug-in publishes one ordinary dashboard listing per entry, offered to
   * communities that install the plug-in.
   */
  dashboards?: BundledDashboard[];
  /**
   * How the plug-in's values on items are shown there. Any plug-in may keep
   * values on items: a container writes them with its installation token, and
   * for a declarative plug-in Initiative writes them from the plug-in's
   * expressions.
   */
  fields?: Field[];
  /**
   * Pieces of items' pages and views, built from Initiative's components and
   * bound to the plug-in's fields and actions.
   */
  parts?: Part[];
  /**
   * What a reader may run on an item: a container plug-in's write endpoints,
   * which its handlers answer, or a declarative plug-in's calls and changes to
   * its values, which Initiative makes.
   */
  actions?: Action[];
  /**
   * Values the community's admins set on the install, which the plug-in's
   * expressions and its parts' text read. At most 16.
   */
  settings?: Setting[];
  /**
   * Help with the plug-in, keyed by language tag: markdown of at most 2000
   * characters in each language. Initiative shows it behind a '?' on the
   * headers of the plug-in's parts and on its settings, in the reader's
   * language, or failing that in any.
   */
  help?: Record<string, string>;
}