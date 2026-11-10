/**
 * The contract and what is generated from it.
 *
 * `manifest.contract.json` is the one hand-authored statement of what a manifest
 * may say. Two things are generated from it — the JSON Schema this package ships
 * and the types it exports — and Initiative vendors it to build its validator's
 * vocabulary. These tests are what stop the three from drifting apart, which is
 * the failure this arrangement exists to remove.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTOR_KINDS,
  CAPS,
  CHARSETS,
  CONNECTION_SCOPES,
  CONNECTION_STATES,
  DIRECTIONS,
  PAGE_CAPABILITIES,
  FEATURES,
  FIELDS,
  FIELD_KINDS,
  FIELD_TYPES,
  FLOW_TYPES,
  GITHUB_APP_VALUES,
  GITHUB_PERMISSION_LEVELS,
  HTTP_METHODS,
  ITEM_KINDS,
  JWT_ALGORITHMS,
  PAGE_LIMITS,
  PARAM_TYPES,
  RETURN_VALUE_TYPES,
  REVOKE_METHODS,
  SCOPES,
  STATUS_RANGES,
  SURFACE_SCOPES,
  TOKEN_TYPES,
  TONES,
  VENDOR_FIELD_TYPES,
} from "../src/contract.js";
import { manifestSchema } from "../src/manifest.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(join(root, "manifest.contract.json"), "utf-8"));
const schema = manifestSchema() as Record<string, any>;

describe("the generated files are what the contract says", () => {
  // The one test that makes every other guarantee here real: an edited contract
  // with un-regenerated output would otherwise pass everything below by
  // comparing two stale files to each other.
  it("regenerating produces no change", () => {
    expect(() =>
      execFileSync("node", [join(root, "scripts", "generate.mjs"), "--check"], {
        cwd: root,
        stdio: "pipe",
      })
    ).not.toThrow();
  });
});

describe("the schema draws its vocabulary from the contract", () => {
  const cases: Array<[string, readonly unknown[], unknown[]]> = [
    ["features", FEATURES, schema.properties.features.items.enum],
    ["connection scopes", CONNECTION_SCOPES, schema.$defs.connection.properties.scope.enum],
    ["field types", FIELD_TYPES, schema.$defs.connectionField.properties.type.enum],
    ["vendor field types", VENDOR_FIELD_TYPES, schema.$defs.vendorField.properties.type.enum],
    [
      "github permission levels",
      GITHUB_PERMISSION_LEVELS,
      schema.$defs.githubAppManifest.properties.default_permissions.additionalProperties.enum,
    ],
    [
      "github app values",
      GITHUB_APP_VALUES,
      schema.$defs.githubAppManifestSetup.properties.values.additionalProperties.enum,
    ],
    ["flow types", FLOW_TYPES, schema.$defs.connectionFlow.properties.type.enum],
    ["revoke methods", REVOKE_METHODS, schema.$defs.connectionFlow.properties.revoke.enum],
    ["token types", TOKEN_TYPES, schema.$defs.connectionToken.properties.type.enum],
    ["jwt algorithms", JWT_ALGORITHMS, schema.$defs.connectionToken.properties.alg.enum],
    ["param types", PARAM_TYPES, schema.$defs.endpointParam.properties.type.enum],
    ["return types", RETURN_VALUE_TYPES, schema.$defs.endpointReturn.properties.type.enum],
    ["directions", DIRECTIONS, schema.$defs.endpoint.properties.direction.enum],
    ["actor kinds", ACTOR_KINDS, schema.$defs.endpoint.properties.actors.items.enum],
    ["scopes", SCOPES, schema.properties.service.properties.scopes.items.anyOf[0].enum],
    ["surface scopes", SURFACE_SCOPES, schema.$defs.page.properties.scopes.items.enum],
    [
      "page capabilities",
      PAGE_CAPABILITIES,
      schema.$defs.page.properties.capabilities.items.enum,
    ],
    ["http methods", HTTP_METHODS, schema.$defs.vendorRequest.properties.method.enum],
    ["page limits", PAGE_LIMITS, schema.$defs.pageNumberPaging.properties.on_limit.enum],
    ["status ranges", STATUS_RANGES, schema.$defs.statusMatch.anyOf[1].enum],
    ["connection states", CONNECTION_STATES, schema.$defs.healthState.properties.state.enum],
    ["item kinds", ITEM_KINDS, schema.$defs.field.properties.on.items.enum],
    ["field kinds", FIELD_KINDS, schema.$defs.field.properties.kind.enum],
    ["tones", TONES, schema.$defs.textNode.properties.props.properties.tone.enum],
  ];

  it.each(cases)("%s match", (_name, exported, inSchema) => {
    expect([...exported]).toEqual(inSchema);
  });

  it("a grant is ended by GitHub's own call, a hook, or RFC 7009", () => {
    expect([...REVOKE_METHODS]).toEqual(["github_grant", "hook", "rfc7009"]);
  });

  it("the scope vocabulary is each tool's read and write, the shared surfaces, then the two standings", () => {
    // Initiative derives the same list, in the same order, from its own tool
    // registry; a test there holds the two equal.
    const tools = [
      "projects",
      "files",
      "counter_groups",
      "calendars",
      "dashboards",
      "posts",
      "wikis",
      "contacts",
    ];
    expect([...SCOPES]).toEqual([
      ...tools.flatMap((tool) => [`${tool}:read`, `${tool}:write`]),
      "comments:read",
      "comments:write",
      "relationships:read",
      "relationships:write",
      "tags:read",
      "tags:write",
      "properties:read",
      "properties:write",
      "sharing:read",
      "sharing:write",
      "members:read",
      "initiatives:read",
      "initiatives:moderate",
      "community:admin",
    ]);
  });

  it("the retired visibility terms are gone", () => {
    expect(contract.enums).not.toHaveProperty("visibility");
    expect(contract.enums).not.toHaveProperty("endpointVisibility");
    expect(contract.ladders).toEqual({});
    expect(schema.$defs.page.properties).not.toHaveProperty("visibility");
    expect(schema.$defs.endpoint.properties).not.toHaveProperty("visibility");
  });

  it("a surface names a permission rather than an audience", () => {
    for (const def of ["page", "field", "part", "action", "endpoint"]) {
      expect(schema.$defs[def].properties).not.toHaveProperty("admin_only");
      expect(schema.$defs[def].properties.permission).toBeDefined();
    }
    expect(schema.$defs.permission.properties.level.enum).toEqual(["community", "initiative"]);
  });

  it("a plug-in's requested scopes are unique", () => {
    expect(schema.properties.service.properties.scopes.uniqueItems).toBe(true);
    expect(schema.properties.service.properties.scopes.maxItems).toBe(
      SCOPES.length + CAPS.pluginScopes
    );
  });

  it("the plugins: family is a pattern beside the enum, over the public-id characters", () => {
    const pattern = new RegExp(schema.$defs.pluginScope.pattern);
    expect(pattern.test("plugins:acme.github")).toBe(true);
    expect(pattern.test("plugins:acme")).toBe(false);
    expect(pattern.test("plugins:Acme.github")).toBe(false);
    expect(pattern.test("plugin:acme.github")).toBe(false);
    expect(pattern.test("xplugins:acme.github")).toBe(false);
    expect(schema.properties.service.properties.scopes.items.anyOf[1]).toEqual({
      $ref: "#/$defs/pluginScope",
    });
  });

  it("an endpoint is closed, so a misspelt term is refused rather than dropped", () => {
    expect(schema.$defs.endpoint.additionalProperties).toBe(false);
  });

  it("an endpoint can be marked public, defaulting to false", () => {
    expect(schema.$defs.endpoint.properties.public).toMatchObject({
      type: "boolean",
      default: false,
    });
  });

  it("a secret is a credential, never a query parameter", () => {
    expect(FIELD_TYPES).toContain("secret");
    expect(PARAM_TYPES).not.toContain("secret");
    expect(RETURN_VALUE_TYPES).not.toContain("secret");
  });
});

describe("the field inventory", () => {
  it("names every property the schema declares, and no others", () => {
    for (const [owner, fields] of Object.entries(FIELDS)) {
      const node = owner === "manifest" ? schema : schema.$defs[owner];
      expect(Object.keys(node.properties), owner).toEqual([...fields]);
    }
  });

  it("covers every object the schema defines", () => {
    const withProperties = Object.entries(schema.$defs)
      .filter(([, node]: [string, any]) => node.properties)
      .map(([name]) => name);
    expect(Object.keys(FIELDS).filter((k) => k !== "manifest").sort()).toEqual(
      withProperties.sort()
    );
  });
});

describe("features and the blocks behind them", () => {
  // A feature is backed by the manifest block of the same name.
  it("every feature names a block of the manifest", () => {
    for (const feature of FEATURES) expect(FIELDS.manifest).toContain(feature);
  });
});

describe("caps and character sets", () => {
  it("every cap the contract names is a positive integer", () => {
    for (const [name, value] of Object.entries(CAPS)) {
      expect(Number.isInteger(value), name).toBe(true);
      expect(value, name).toBeGreaterThan(0);
    }
  });

  it("a character set widened in the contract widens the schema's pattern", () => {
    // Spot-checked against the one pattern every id in the document is built
    // from, so a generator that stopped reading the contract fails here.
    for (const character of CHARSETS.identifier) {
      expect(new RegExp(schema.$defs.identifier.pattern).test(character)).toBe(true);
    }
    expect(new RegExp(schema.$defs.identifier.pattern).test("A")).toBe(false);
  });

  it("the caps the contract quotes in prose are interpolated, not left as braces", () => {
    const prose = JSON.stringify(schema);
    expect(prose).not.toMatch(/\{[a-z][A-Za-z]+\}/);
    expect(schema.$defs.localizedText.description).toContain(String(CAPS.textLength));
  });

  it("names every upper bound rather than restating its value", () => {
    // "Raise it in one place" is only true if no site carries the number. Upper
    // bounds are the caps; lower bounds (minItems: 1, minimum: 0) are the shape
    // of the thing rather than a limit anyone would raise, so they stay literal.
    const sites = JSON.stringify({ defs: contract.defs, manifest: contract.manifest });
    for (const keyword of ["maxItems", "maxLength", "maxProperties", "maximum"]) {
      const inline = [...sites.matchAll(new RegExp(`"${keyword}":(\\d+)`, "g"))];
      expect(inline.map((match) => match[1]), keyword).toEqual([]);
    }
  });
});

