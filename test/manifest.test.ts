/**
 * What the SDK can tell an author before a deployment does.
 *
 * The cases are the two rules `validateManifest` adds on top of the schema —
 * the features cross-check and the id references — because those are the ones
 * an author trips over and the ones JSON Schema cannot express. The schema
 * itself is the platform's, tested there.
 */

import { describe, expect, it } from "vitest";

import {
  manifestSchema,
  validateDocument,
  validateManifest,
  type Endpoint,
  type EndpointParam,
  type Manifest,
  type PartNode,
} from "../src/manifest.js";
import { pluginDocument } from "../src/validate.js";
import { CAPS, FIELD_KINDS, SCOPES, type FieldKind } from "../src/contract.js";
import { manifestOf } from "../src/define.js";
import { issuesPlugin } from "./support/plugin.js";

const base = (): Manifest => ({
  plugin_kind: "service",
  service: { public_id: "acme.tracker", protocol: 1 },
  features: [],
});

const messages = (problems: Array<{ where: string; message: string }>) =>
  problems.map((problem) => `${problem.where}: ${problem.message}`).join("\n");

describe("manifestSchema", () => {
  it("ships beside the module", () => {
    const schema = manifestSchema();
    expect(schema.$id).toContain("plugin-manifest");
    expect((schema.properties as Record<string, unknown>).service).toBeDefined();
  });

  it("says what schema-valid does not prove", () => {
    // The asymmetry travels with the file, so an implementer who reads only the
    // schema still learns the platform is authoritative.
    expect(String(manifestSchema().description)).toContain("not necessarily");
  });
});

describe("the schema actually runs", () => {
  // The point of these: the package ships a schema, and a schema nothing
  // executes is decoration. Each of these is caught by the schema alone —
  // the hand-written checks below would not notice any of them.
  it("catches a public id that is not '<publisher>.<slug>'", () => {
    const problems = validateManifest({ ...base(), service: { public_id: "nodot" } });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].where).toContain("public_id");
  });

  it("catches a path that is an address rather than a route", () => {
    const problems = validateManifest({
      ...base(),
      features: ["pages"],
      pages: [{ id: "e", path: "https://elsewhere.test/e", name: { en: "E" } }],
    });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].where).toContain("/pages/0/path");
  });

  it("catches an endpoint that could never run", () => {
    // An empty actor list is a declaration that resolves to nothing: the call
    // arrives, no credential is permitted, and it refuses every time.
    const problems = validateManifest({
      ...base(),
      features: ["endpoints"],
      endpoints: [{ id: "plugin.acme.tracker.thing", direction: "write", actors: [] }],
    });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].where).toContain("/endpoints/0/actors");
  });

  it("catches an endpoint that says nothing about which way it goes", () => {
    // `direction` is what decides who may call it and whether an answer can be
    // cached, so an endpoint without one is not a partial declaration — it is
    // an unanswerable question.
    const problems = validateManifest({
      ...base(),
      features: ["endpoints"],
      endpoints: [{ id: "plugin.acme.tracker.thing" }],
    });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].where).toContain("/endpoints/0");
  });

  it("catches a capability no page may request", () => {
    const problems = validateManifest({
      ...base(),
      features: ["pages"],
      pages: [{ id: "e", path: "/e", name: { en: "E" }, capabilities: ["payment"] }],
    });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].where).toContain("capabilities");
  });

  it("catches a field type outside the vocabulary", () => {
    const problems = validateManifest({
      ...base(),
      connections: [
        {
          id: "api",
          scope: "static",
          label: { en: "API" },
          fields: [{ key: "t", type: "telepathy", label: { en: "T" } }],
        },
      ],
    });
    expect(problems.length).toBeGreaterThan(0);
  });

  it("catches requires naming both operators or neither", () => {
    // The schema owns this one now — `oneOf` over the two operators — so it is
    // reported before the hand-written reference checks run at all.
    for (const requires of [{ all_of: ["a"], any_of: ["b"] }, {}]) {
      const problems = validateManifest({
        ...base(),
        features: ["endpoints"],
        endpoints: [{ id: "plugin.acme.tracker.s", direction: "read", requires }],
      });
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.every((p) => p.where.endsWith("/requires"))).toBe(true);
      expect(problems.some((p) => p.message.includes("exactly one"))).toBe(true);
    }
  });

  it("reports the schema alone when the shape is wrong", () => {
    // Structural problems short-circuit, so an author is not handed cascading
    // nonsense from checks that assume the shape held.
    const problems = validateManifest({
      ...base(),
      features: ["widgets"],
      widgets: "not a list",
    });
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      expect(problem.message).not.toContain("not a declared read endpoint");
    }
  });
});

describe("features cross-check", () => {
  it("accepts a manifest that declares nothing and offers nothing", () => {
    expect(validateManifest(base())).toEqual([]);
  });

  it("catches a feature with no block behind it", () => {
    const problems = validateManifest({ ...base(), features: ["endpoints"] });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("endpoints is missing");
  });

  it("catches a block whose feature was never declared", () => {
    const problems = validateManifest({
      ...base(),
      endpoints: [{ id: "plugin.acme.tracker.issues", direction: "read" }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("not declared");
  });

  it("accepts the two together", () => {
    expect(
      validateManifest({
        ...base(),
        features: ["endpoints"],
        endpoints: [{ id: "plugin.acme.tracker.issues", direction: "read" }],
      })
    ).toEqual([]);
  });
});

describe("references", () => {
  const widget = (endpoints: string[]) => ({
    id: "w",
    meta: { name: { en: "W" } },
    module_source: "x",
    endpoints,
  });

  it("catches a widget binding an endpoint that does not exist", () => {
    const problems = validateManifest({
      ...base(),
      features: ["widgets", "endpoints"],
      endpoints: [{ id: "plugin.acme.tracker.known", direction: "read" }],
      widgets: [widget(["plugin.acme.tracker.absent"])],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("not a declared read endpoint");
  });

  it("catches a widget binding something that does not answer", () => {
    // A write and an emit are both real endpoints, and neither fills a tile:
    // one changes something and returns, the other is posted somewhere else
    // entirely. Binding either declares a widget nothing draws.
    for (const direction of ["write", "emit"]) {
      const problems = validateManifest({
        ...base(),
        features: ["widgets", "endpoints"],
        endpoints: [{ id: "plugin.acme.tracker.act", direction }],
        widgets: [widget(["plugin.acme.tracker.act"])],
      });
      expect(problems).toHaveLength(1);
      expect(problems[0].message).toContain("not a declared read endpoint");
    }
  });

  it("catches a requires term naming no declared connection", () => {
    const problems = validateManifest({
      ...base(),
      features: ["endpoints"],
      endpoints: [
        { id: "plugin.acme.tracker.s", direction: "read", requires: { all_of: ["nope"] } },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("unknown connection 'nope'");
  });

  it("catches an endpoint namespaced under somebody else", () => {
    // Two plug-ins offering `create-issue` would be two different things under one
    // name, and a caller resolving the wrong one would do the wrong thing
    // successfully — which is worse than an error.
    const problems = validateManifest({
      ...base(),
      features: ["endpoints"],
      endpoints: [{ id: "plugin.someone-else.thing", direction: "read" }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("plugin.acme.tracker.");
  });

  it("catches an id declared twice", () => {
    // One id, two answers, and which one a caller reaches depends on iteration
    // order.
    const problems = validateManifest({
      ...base(),
      features: ["endpoints"],
      endpoints: [
        { id: "plugin.acme.tracker.thing", direction: "read" },
        { id: "plugin.acme.tracker.thing", direction: "write" },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("declared twice");
  });

  it("accepts a fully wired manifest", () => {
    expect(
      validateManifest({
        ...base(),
        features: ["endpoints", "widgets"],
        connections: [
          {
            id: "api",
            scope: "static",
            label: { en: "API key" },
            fields: [{ key: "token", type: "secret", label: { en: "Token" } }],
          },
        ],
        endpoints: [
          {
            id: "plugin.acme.tracker.issues",
            direction: "read",
            requires: { all_of: ["api"] },
            actors: ["member"],
          },
          { id: "plugin.acme.tracker.issue-open", direction: "write", actors: ["member"] },
          { id: "plugin.acme.tracker.issue-opened", direction: "emit" },
        ],
        widgets: [widget(["plugin.acme.tracker.issues"])],
      })
    ).toEqual([]);
  });
});

describe("shape", () => {
  it("refuses something that is not an object", () => {
    expect(validateManifest("not a manifest")).toHaveLength(1);
    expect(validateManifest(null)).toHaveLength(1);
  });
});

describe("the document a registrar actually fetches", () => {
  // The distinction this whole block exists for: a `Manifest` is what a plug-in
  // declares, and a registrar never fetches one. It fetches the document around
  // it, and refuses anything without the envelope. A bare manifest served at
  // the well-known path is well-formed and unregisterable — which is exactly
  // how the reference plug-in was wrong, with nothing on either side saying so.
  it("wraps a manifest in the envelope a registrar requires", () => {
    const document = pluginDocument(base(), { uid: "K7M2QX8N4TVB9C", name: "Tracker" });

    expect(document.protocol_version).toBe(1);
    expect(document.public_id).toBe("acme.tracker");
    expect(document.kind).toBe("plugin");
    expect(document.uid).toBe("K7M2QX8N4TVB9C");
    expect(document.definition).toEqual(base());
  });

  it("leaves out what was not supplied rather than sending nulls", () => {
    // The document is hashed and re-checked; a key present as null is a byte
    // difference that says nothing.
    const document = pluginDocument(base());
    expect("uid" in document).toBe(false);
    expect("name" in document).toBe(false);
  });

  it("accepts what pluginDocument builds", () => {
    expect(validateDocument(pluginDocument(base()))).toEqual([]);
  });

  it("refuses a bare manifest, which is the mistake worth catching", () => {
    const problems = validateDocument(base());

    expect(problems.length).toBeGreaterThan(0);
    expect(messages(problems)).toContain("/definition");
  });

  it("refuses a protocol the registrar does not speak", () => {
    const problems = validateDocument({ ...pluginDocument(base()), protocol_version: 2 });
    expect(messages(problems)).toContain("/protocol_version");
  });

  it("refuses a kind that is not a plug-in", () => {
    const problems = validateDocument({ ...pluginDocument(base()), kind: "tool" });
    expect(messages(problems)).toContain("/kind");
  });

  it("catches the two public ids disagreeing", () => {
    // The registration is matched by the outer id and the capabilities are
    // namespaced under the inner one, so a mismatch is a real plug-in that half
    // works, and nothing downstream reports it.
    const problems = validateDocument({ ...pluginDocument(base()), public_id: "acme.other" });

    expect(messages(problems)).toContain("but the definition declares 'acme.tracker'");
  });

  it("reports the manifest's own problems, at their path inside it", () => {
    const problems = validateDocument(pluginDocument({ ...base(), features: ["endpoints"] }));

    expect(messages(problems)).toContain("/definition/features");
  });
});

describe("an empty block is no block", () => {
  // The platform's normalizer drops empty blocks before the cross-check, so a
  // presence test passes a manifest that registration refuses. A real plug-in hit
  // exactly this: it declared a feature over an empty block, validated locally
  // under a presence test, and was turned away at registration.
  it("refuses a feature backed by an empty block", () => {
    const problems = validateManifest({
      ...base(),
      features: ["endpoints"],
      endpoints: [],
    });

    expect(messages(problems)).toContain("missing or empty");
  });

  it("refuses an empty block even with no feature declared", () => {
    const problems = validateManifest({ ...base(), endpoints: [] });
    expect(messages(problems)).toContain("leave it out instead");
  });

  it("still accepts a block that carries something", () => {
    const problems = validateManifest({
      ...base(),
      features: ["endpoints"],
      endpoints: [{ id: "plugin.acme.tracker.thing-happened", direction: "emit" }],
    });

    expect(problems).toEqual([]);
  });
});

describe("what an endpoint says about itself", () => {
  const withEndpoint = (endpoint: Record<string, unknown>): Manifest =>
    ({
      ...base(),
      features: ["endpoints"],
      endpoints: [{ id: "plugin.acme.tracker.thing", ...endpoint }],
    }) as Manifest;

  it("accepts a fully described one", () => {
    const problems = validateManifest(
      withEndpoint({
        direction: "write",
        label: { en: "Open an issue" },
        description: { en: "Opens one in the connected repository." },
        group: "issues",
        needs_subject: "tasks",
        params: [{ key: "project", type: "int", label: { en: "Project" } }],
        returns: [
          { key: "issue_url", type: "url", label: { en: "URL" } },
          { key: "labels", type: "string", list: true },
        ],
      })
    );
    expect(messages(problems)).toBe("");
  });

  it("takes a permission declared inside an initiative, or use", () => {
    const read = { direction: "read", returns: [{ key: "total", type: "int" }] };
    expect(messages(validateManifest(withEndpoint({ ...read, permission: "use" })))).toBe("");
    expect(messages(validateManifest(withEndpoint({ ...read, permission: "costs" })))).toBe(
      "/endpoints/0/permission: 'costs' is not a permission this manifest declares at the initiative level"
    );
  });

  it("lets an emission carry a label and a payload", () => {
    // The one endpoint chosen without ever being called, so it needs a name
    // more than the others — and its payload is as worth describing as a
    // response is.
    const problems = validateManifest(
      withEndpoint({
        direction: "emit",
        label: { en: "An issue is opened" },
        returns: [{ key: "issue_number", type: "int" }],
      })
    );
    expect(messages(problems)).toBe("");
  });

  it("takes public as a boolean on a read or a write", () => {
    const write = { direction: "write", actors: ["member"], public: true };
    expect(messages(validateManifest(withEndpoint(write)))).toBe("");
    const problems = validateManifest(withEndpoint({ ...write, public: "yes" }));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].where).toBe("/endpoints/0/public");
  });

  it("refuses public on an emission, which nobody calls", () => {
    const problems = validateManifest(withEndpoint({ direction: "emit", public: true }));
    expect(problems.map((problem) => problem.where)).toContain("/endpoints/0/public");
  });

  it("still refuses a caller side on an emission", () => {
    const problems = validateManifest(
      withEndpoint({ direction: "emit", params: [{ key: "x", type: "string", label: { en: "X" } }] })
    );
    expect(problems.length).toBeGreaterThan(0);
  });

  it("refuses a select as a return type", () => {
    // A select is a CONTROL, and the value behind one is a string.
    const problems = validateManifest(
      withEndpoint({ direction: "read", returns: [{ key: "k", type: "select" }] })
    );
    expect(problems.length).toBeGreaterThan(0);
  });

  it("refuses a credential as a return type", () => {
    const problems = validateManifest(
      withEndpoint({ direction: "read", returns: [{ key: "k", type: "secret" }] })
    );
    expect(problems.length).toBeGreaterThan(0);
  });

  it("catches a name returned twice, which the schema cannot", () => {
    // A consumer binds by name, so one of the two would silently never be
    // reachable — the quiet failure this validator exists for.
    const problems = validateManifest(
      withEndpoint({
        direction: "read",
        returns: [
          { key: "count", type: "int" },
          { key: "count", type: "string" },
        ],
      })
    );
    expect(messages(problems)).toContain("returned twice");
  });

  it("says nothing about an endpoint that describes nothing", () => {
    // Every addition is optional: a manifest that validated before still does.
    expect(messages(validateManifest(withEndpoint({ direction: "read" })))).toBe("");
  });
});

/**
 * The one automation term left, and why it is checked here and nowhere else.
 *
 * The others said how to DRAW a parameter, and they are gone: a manifest
 * describes an API, and a consumer that writes its own steps needs nothing
 * from one to draw them. An identity is different in kind — it says what an
 * operation TOUCHED, which only the plug-in can know.
 */
describe("what an automation consumer will read", () => {
  const withEndpoints = (...endpoints: Endpoint[]): Manifest => ({
    ...base(),
    features: ["endpoints"],
    endpoints,
  });

  it("accepts an identity naming its own single-valued returns", () => {
    const problems = validateManifest(
      withEndpoints({
        id: "plugin.acme.tracker.open",
        direction: "write",
        returns: [
          { key: "repository", type: "string", label: { en: "R" } },
          { key: "number", type: "int", label: { en: "N" } },
        ],
        identity: { kind: "issue", key: ["repository", "number"] },
      })
    );
    expect(messages(problems)).toBe("");
  });

  it("refuses an identity naming a return the endpoint does not carry", () => {
    // Nothing downstream refuses this: the address resolves to nothing, the
    // suppression looks configured, and a fire is silently dropped.
    const problems = validateManifest(
      withEndpoints({
        id: "plugin.acme.tracker.open",
        direction: "write",
        returns: [{ key: "number", type: "int", label: { en: "N" } }],
        identity: { kind: "issue", key: ["repository", "number"] },
      })
    );
    expect(messages(problems)).toContain("matches the wrong thing");
  });

  it("refuses an identity naming a list", () => {
    const problems = validateManifest(
      withEndpoints({
        id: "plugin.acme.tracker.open",
        direction: "write",
        returns: [{ key: "numbers", type: "int", label: { en: "N" }, list: true }],
        identity: { kind: "issue", key: ["numbers"] },
      })
    );
    expect(messages(problems)).toContain("matches the wrong thing");
  });

  it("refuses an identity on a read", () => {
    const problems = validateManifest(
      withEndpoints({
        id: "plugin.acme.tracker.get",
        direction: "read",
        returns: [{ key: "number", type: "int", label: { en: "N" } }],
        identity: { kind: "issue", key: ["number"] },
      })
    );
    expect(messages(problems)).toContain("no echo to suppress");
  });

  it("takes a parameter that holds several values", () => {
    // Cardinality is a fact about the value, so it stayed when presentation
    // went: a caller building a request has to know whether this takes an array.
    const problems = validateManifest(
      withEndpoints({
        id: "plugin.acme.tracker.label",
        direction: "write",
        params: [{ key: "labels", type: "string", label: { en: "Labels" }, list: true }],
      })
    );
    expect(messages(problems)).toBe("");
  });

  it("checks a parameter's source against the endpoint it names", () => {
    // Nothing downstream refuses a bad one. A consumer asks the deployment to
    // resolve it, the deployment finds no such return, and the form offers
    // nothing — which looks exactly like a vendor being slow. So this is where
    // an author finds out.
    const source: Endpoint = {
      id: "plugin.acme.tracker.list-repositories",
      direction: "read",
      returns: [
        { key: "names", type: "string", list: true },
        { key: "owner", type: "string" },
      ],
    };

    const asking = (options_from: EndpointParam["options_from"]) =>
      messages(
        validateManifest(
          withEndpoints(source, {
            id: "plugin.acme.tracker.find-issues",
            direction: "read",
            params: [
              { key: "repo", type: "string", label: { en: "Repo" }, options_from },
            ],
          })
        )
      );

    expect(
      asking({ endpoint: "plugin.acme.tracker.list-repositories", key: "names" })
    ).toBe("");

    expect(asking({ endpoint: "plugin.acme.tracker.nope", key: "names" })).toContain(
      "does not declare"
    );

    expect(
      asking({ endpoint: "plugin.acme.tracker.list-repositories", key: "titles" })
    ).toContain("is not returned by");

    // A return it does send, but one of them. A menu comes from a column of
    // values, and a consumer reading a scalar where it expected one has
    // nowhere to put it.
    expect(
      asking({ endpoint: "plugin.acme.tracker.list-repositories", key: "owner" })
    ).toContain("single value");
  });

  it("checks what a source is told against both ends", () => {
    // The chain a form actually walks: pick a repository, and the labels on
    // offer are that repository's. A source that could not be told a sibling's
    // answer would have to offer the whole account's labels, which for anybody
    // with more than one repository is not a menu.
    const source: Endpoint = {
      id: "plugin.acme.tracker.list-labels",
      direction: "read",
      params: [{ key: "repo", type: "string", label: { en: "Repo" } }],
      returns: [{ key: "names", type: "string", list: true }],
    };

    const asking = (needs: Record<string, string>) =>
      messages(
        validateManifest(
          withEndpoints(source, {
            id: "plugin.acme.tracker.label",
            direction: "write",
            params: [
              { key: "repo", type: "string", label: { en: "Repo" } },
              {
                key: "labels",
                type: "string",
                label: { en: "Labels" },
                list: true,
                options_from: {
                  endpoint: "plugin.acme.tracker.list-labels",
                  key: "names",
                  needs,
                },
              },
            ],
          })
        )
      );

    expect(asking({ repo: "repo" })).toBe("");

    // Sent under a name that endpoint does not take: it would ignore the
    // answer and hand back the whole account's worth.
    expect(asking({ repository: "repo" })).toContain("takes no parameter");

    // Naming an answer this endpoint never collects: nothing would ever fill
    // it in, so the source would never be called.
    expect(asking({ repo: "owner" })).toContain("not a parameter of this endpoint");

    // And it cannot be told its own answer: it would have to be filled in
    // before it could offer anything to fill it in with.
    expect(asking({ repo: "labels" })).toContain("cannot be told its own answer");
  });

  it("will not let filling in a form write something", () => {
    const problems = validateManifest(
      withEndpoints(
        {
          id: "plugin.acme.tracker.open-issue",
          direction: "write",
          returns: [{ key: "names", type: "string", list: true }],
        },
        {
          id: "plugin.acme.tracker.find-issues",
          direction: "read",
          params: [
            {
              key: "repo",
              type: "string",
              label: { en: "Repo" },
              options_from: {
                endpoint: "plugin.acme.tracker.open-issue",
                key: "names",
              },
            },
          ],
        }
      )
    );
    expect(messages(problems)).toContain("is a write endpoint");
  });

  it("has nowhere left to say how a parameter should be DRAWN", () => {
    // The rule this whole shape exists to keep. A term here for a control, a
    // default or a bound would let a plug-in define somebody else's product
    // surface — and could still only express what that consumer had already
    // thought of.
    //
    // Enumerated rather than sampled, so adding a term is a deliberate act with
    // this comment in front of it. Every one below answers "what is this value",
    // never "how should it look": a name, a type, whether it is needed, how many
    // of them, and the two that say where the permitted ones come from —
    // `options` for a set that is the same on every deployment, `options_from`
    // for one only the plug-in can know.
    const param = (manifestSchema().$defs as Record<string, any>).endpointParam;
    expect(Object.keys(param.properties).sort()).toEqual(
      ["key", "label", "list", "options", "options_from", "required", "type"].sort()
    );

    // And the shape of the new one is a data reference and nothing else: which
    // endpoint, which return, which return holds a label, and what that
    // endpoint has to be told to answer. No widget, no placeholder, no
    // ordering.
    expect(Object.keys(param.properties.options_from.properties).sort()).toEqual(
      ["endpoint", "key", "label_key", "needs"].sort()
    );
  });
});

describe("community_summary", () => {
  const summary = (over: Partial<Endpoint> = {}): Manifest => ({
    ...base(),
    features: ["endpoints"],
    community_summary: "plugin.acme.tracker.standing",
    endpoints: [
      {
        id: "plugin.acme.tracker.standing",
        direction: "read",
        returns: [{ key: "used", type: "int" }],
        ...over,
      } as Endpoint,
    ],
  });

  it("accepts a read endpoint that declares what it returns", () => {
    expect(validateManifest(summary())).toEqual([]);
  });

  it("refuses an endpoint this plug-in does not have", () => {
    const problems = validateManifest({ ...summary(), community_summary: "plugin.acme.tracker.nope" });
    expect(messages(problems)).toContain("not one of this plug-in's endpoints");
  });

  it("refuses one that is not a read", () => {
    // A summary is drawn, so naming something that acts would have a
    // deployment performing an operation to render a page.
    const problems = validateManifest(summary({ direction: "write" }));
    expect(messages(problems)).toContain("not a read");
  });

  it("refuses one that returns nothing", () => {
    // It would resolve, answer, and draw an empty panel — which reads as a
    // deployment that chose not to render it rather than a manifest that
    // cannot be.
    const problems = validateManifest(summary({ returns: [] }));
    expect(messages(problems)).toContain("nothing to draw");
  });

  it("refuses one with a parameter somebody has to answer", () => {
    // Read for a community, not for a question: there is no form here to fill in.
    const problems = validateManifest(
      summary({
        params: [
          { key: "repo", type: "string", label: { en: "Repo" }, required: true } as EndpointParam,
        ],
      })
    );
    expect(messages(problems)).toContain("'repo'");
    expect(messages(problems)).toContain("no form");
  });

  it("lets an optional parameter through", () => {
    expect(
      validateManifest(
        summary({
          params: [{ key: "repo", type: "string", label: { en: "Repo" } } as EndpointParam],
        })
      )
    ).toEqual([]);
  });

  it("is optional", () => {
    // Most plug-ins have no standing with a community to report, and saying nothing is
    // the ordinary case rather than an omission.
    expect(validateManifest(base())).toEqual([]);
  });
});

describe("a return counted against another", () => {
  const measured = (returns: Endpoint["returns"]): Manifest => ({
    ...base(),
    features: ["endpoints"],
    endpoints: [{ id: "plugin.acme.tracker.standing", direction: "read", returns } as Endpoint],
  });

  it("accepts a figure counted against its ceiling", () => {
    expect(
      validateManifest(
        measured([
          { key: "used", type: "int", of: "allowed" },
          { key: "allowed", type: "int" },
          { key: "resets_on", type: "datetime" },
        ])
      )
    ).toEqual([]);
  });

  it("refuses a ceiling the endpoint does not return", () => {
    const problems = validateManifest(measured([{ key: "used", type: "int", of: "allowed" }]));
    expect(messages(problems)).toContain("'allowed' is not a return of this endpoint");
  });

  it("refuses a figure counted against itself", () => {
    const problems = validateManifest(measured([{ key: "used", type: "int", of: "used" }]));
    expect(messages(problems)).toContain("counted against itself");
  });

  it("refuses a half that is not one whole number", () => {
    // A list has no single figure and a date has no proportion, so neither
    // can be drawn as how much of something is used.
    const listed = validateManifest(
      measured([
        { key: "used", type: "int", of: "allowed", list: true },
        { key: "allowed", type: "int" },
      ])
    );
    expect(messages(listed)).toContain("'used' is not a single 'int'");
    const dated = validateManifest(
      measured([
        { key: "used", type: "int", of: "allowed" },
        { key: "allowed", type: "datetime" },
      ])
    );
    expect(messages(dated)).toContain("'allowed' is not a single 'int'");
  });
});

describe("minimum_age", () => {
  const aged = (minimum_age: unknown): Manifest => ({ ...base(), minimum_age } as Manifest);

  it("accepts an age by country, with a default for the rest", () => {
    expect(validateManifest(aged({ default: 16, US: 13, GB: 13, FR: 15 }))).toEqual([]);
  });

  it("refuses a region that is not a country code or 'default'", () => {
    // GDPR is not one age, so a regime is not a region.
    expect(validateManifest(aged({ gdpr: 16 }))).not.toEqual([]);
    expect(validateManifest(aged({ us: 13 }))).not.toEqual([]);
    expect(validateManifest(aged({ USA: 13 }))).not.toEqual([]);
  });

  it("refuses an age outside the bounds", () => {
    expect(validateManifest(aged({ default: 12 }))).not.toEqual([]);
    expect(validateManifest(aged({ default: CAPS.minimumAgeYears + 1 }))).not.toEqual([]);
    expect(validateManifest(aged({ default: 16.5 }))).not.toEqual([]);
  });

  it("refuses an empty map, which says nothing", () => {
    expect(validateManifest(aged({}))).not.toEqual([]);
  });
});

describe("min_plugin_api", () => {
  const needing = (min_plugin_api: unknown): Manifest => ({ ...base(), min_plugin_api } as Manifest);

  it("accepts a contract version as MAJOR.MINOR", () => {
    expect(validateManifest(needing("4.1"))).toEqual([]);
    expect(validateManifest(needing("10.0"))).toEqual([]);
  });

  it("is optional", () => {
    expect(validateManifest(base())).toEqual([]);
  });

  it("refuses anything but MAJOR.MINOR", () => {
    for (const wrong of ["4", "4.1.1", "v4.1", "4.x", "4.1-beta", " 4.1", "4.1\n", "", 4.1]) {
      const problems = validateManifest(needing(wrong));
      expect(problems.map((problem) => problem.where), JSON.stringify(wrong)).toContain("/min_plugin_api");
    }
  });
});

describe("the scopes a plug-in asks for", () => {
  const asking = (scopes: unknown) =>
    validateManifest({ ...base(), service: { public_id: "acme.tracker", scopes } } as never);

  it("takes any set drawn from the vocabulary", () => {
    expect(messages(asking(["projects:read", "comments:write", "members:read"]))).toBe("");
    expect(messages(asking([...SCOPES]))).toBe("");
    expect(messages(asking([]))).toBe("");
  });

  it("is optional", () => {
    expect(messages(validateManifest(base()))).toBe("");
  });

  it("refuses a scope outside the vocabulary", () => {
    for (const scope of ["projects:admin", "members:write", "tasks:read", "PROJECTS:READ", ""]) {
      const problems = asking([scope]);
      expect(problems.length, scope).toBeGreaterThan(0);
      expect(problems[0].where, scope).toBe("/service/scopes/0");
    }
  });

  it("refuses a scope named twice", () => {
    const problems = asking(["projects:read", "projects:read"]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].where).toBe("/service/scopes");
  });

  it("refuses something that is not a list", () => {
    expect(asking("projects:read").length).toBeGreaterThan(0);
  });

  it("takes the scope that lets it call another plug-in", () => {
    expect(messages(asking(["projects:read", "plugins:acme.github"]))).toBe("");
  });

  it("refuses a plugins: scope that names no plug-in", () => {
    for (const scope of ["plugins:", "plugins:github", "plugins:Acme.github", "plugins:acme github"]) {
      const problems = asking([scope]);
      expect(problems.length, scope).toBeGreaterThan(0);
      expect(problems[0].where, scope).toBe("/service/scopes/0");
    }
  });

  it("takes a declarative plug-in's read scopes at the top level, and a container's only in its service block", () => {
    const declarative = manifestOf(issuesPlugin());
    declarative.scopes = ["projects:read", "members:read", "projects:write", "initiatives:moderate", "community:admin", "plugins:acme.github"];
    expect(messages(validateManifest(declarative, { publicId: "acme.issues" }))).toBe(
      [2, 3, 4, 5]
        .map(
          (index) =>
            `/scopes/${index}: a declarative plug-in asks only for read scopes: ` +
            "it keeps its own values on items it can read, and does not call Initiative"
        )
        .join("\n")
    );
    expect(messages(validateManifest({ ...base(), scopes: ["projects:read"] }))).toBe(
      "/scopes: a container plug-in declares its scopes in its service block"
    );
  });
});

describe("permissions", () => {
  const settings = { id: "settings", level: "community", name: { en: "Set up" } };
  const withPage = (page: Record<string, unknown>, permissions: unknown[] = [settings]) =>
    validateManifest({
      ...base(),
      features: ["pages"],
      permissions,
      pages: [{ id: "settings", path: "/settings", name: { en: "Settings" }, ...page }],
    } as never);

  it("takes a page naming one declared at every level it renders in, or use", () => {
    expect(messages(withPage({ permission: "settings" }))).toBe("");
    expect(messages(withPage({ permission: "use", scopes: ["community", "initiative"] }))).toBe("");
    expect(messages(withPage({}))).toBe("");
    expect(messages(withPage({ permission: "settings", scopes: ["community", "initiative"] }))).toBe(
      "/pages/0/permission: 'settings' is not a permission this manifest declares at the initiative level"
    );
  });

  it("refuses one declared twice at a level, and members at the community level", () => {
    expect(messages(withPage({}, [settings, { ...settings, level: "initiative", members: true }]))).toBe("");
    expect(messages(withPage({}, [settings, settings]))).toBe(
      "/permissions/1/id: 'settings' is declared twice at the community level"
    );
    expect(withPage({}, [{ ...settings, members: true }]).map((problem) => problem.where)).toContain(
      "/permissions/0/members"
    );
  });

  it("is gone as admin_only", () => {
    expect(messages(withPage({ admin_only: true }))).toBe(
      "/pages/0/admin_only: 'admin_only' is not a term of the manifest contract, and a deployment discards it"
    );
  });
});

describe("sign_in", () => {
  const signingIn = (sign_in: unknown) =>
    validateManifest({
      ...base(),
      features: ["pages"],
      pages: [{ id: "inventory", path: "/inventory", name: { en: "Inventory" } }],
      sign_in,
    } as never);

  it("names one of the manifest's pages and a path to come back to", () => {
    expect(messages(signingIn({ page: "inventory", return_path: "/signed-in" }))).toBe("");
  });

  it("refuses a page the manifest does not declare", () => {
    expect(messages(signingIn({ page: "elsewhere", return_path: "/signed-in" }))).toBe(
      "/sign_in/page: names 'elsewhere', which is not one of this manifest's pages"
    );
  });

  it("refuses an address in place of a path, and a missing half", () => {
    expect(signingIn({ page: "inventory", return_path: "https://elsewhere.test/back" })[0].where).toContain(
      "/sign_in/return_path"
    );
    expect(signingIn({ page: "inventory" }).length).toBeGreaterThan(0);
  });
});

describe("terms the contract does not declare", () => {
  it("reports a page's visibility, which placement roles replaced", () => {
    const problems = validateManifest({
      ...base(),
      features: ["pages"],
      pages: [
        { id: "panel", path: "/panel", name: { en: "Panel" }, visibility: "guild_admin" },
      ],
    } as never);
    expect(problems).toEqual([
      {
        where: "/pages/0/visibility",
        message: "'visibility' is not a term of the manifest contract, and a deployment discards it",
      },
    ]);
  });

  it("reports an endpoint's visibility", () => {
    const problems = validateManifest({
      ...base(),
      features: ["endpoints"],
      endpoints: [
        {
          id: "plugin.acme.tracker.read",
          direction: "read",
          returns: [{ key: "n", type: "int" }],
          visibility: "member",
        },
      ],
    } as never);
    expect(problems.map((problem) => problem.where)).toEqual(["/endpoints/0/visibility"]);
  });

  it("reports an unknown term at the top level and in the service block", () => {
    const problems = validateManifest({
      ...base(),
      extra: true,
      service: { public_id: "acme.tracker", secret: "x" },
    } as never);
    expect(problems.map((problem) => problem.where).sort()).toEqual([
      "/extra",
      "/service/secret",
    ]);
  });

  it("leaves open objects alone", () => {
    // Localized text, a widget's meta and its sample data are the author's.
    expect(
      messages(
        validateManifest({
          ...base(),
          features: ["endpoints", "widgets"],
          endpoints: [
            {
              id: "plugin.acme.tracker.read",
              direction: "read",
              label: { en: "Read", "fr-CA": "Lire" },
              returns: [{ key: "n", type: "int" }],
            },
          ],
          widgets: [
            {
              id: "tile",
              meta: { name: { en: "Tile" }, anything: 1 },
              module_source: "x",
              endpoints: ["plugin.acme.tracker.read"],
              sample_data: { "plugin.acme.tracker.read": { n: 1 } },
            },
          ],
        } as never)
      )
    ).toBe("");
  });
});

describe("connections Initiative runs", () => {
  const github = (): Manifest => ({
    ...base(),
    vendor: {
      label: { en: "GitHub App" },
      fields: [
        { key: "client_id", type: "string", required: true, label: { en: "Client id" } },
        { key: "client_secret", type: "secret", required: true, label: { en: "Secret" } },
        { key: "app_slug", type: "string", required: true, label: { en: "Slug" } },
        { key: "app_id", type: "string", required: true, label: { en: "App id" } },
        { key: "private_key", type: "secret", required: true, label: { en: "Key" } },
        { key: "webhook_secret", type: "secret", required: true, label: { en: "Hook" } },
      ],
      setup: {
        kind: "github_app_manifest",
        app: {
          name: "Initiative",
          url: "https://initiative.example",
          default_permissions: { issues: "write", metadata: "read" },
          default_events: ["issues", "installation_target"],
        },
        values: {
          app_id: "id",
          app_slug: "slug",
          client_id: "client_id",
          client_secret: "client_secret",
          private_key: "pem",
          webhook_secret: "webhook_secret",
        },
      },
    },
    webhooks: {
      verify: {
        scheme: "hmac_sha256",
        header: "X-Hub-Signature-256",
        prefix: "sha256=",
        encoding: "hex",
        secret: "{vendor.webhook_secret}",
      },
      dedup: "X-GitHub-Delivery",
      route: { path: "installation.id", connection: "workspace", field: "installation_id" },
    },
    connections: [
      {
        id: "workspace",
        scope: "static",
        label: { en: "Organization" },
        fields: [
          { key: "owner", type: "string", label: { en: "Owner" }, managed: true },
          { key: "installation_id", type: "string", label: { en: "Id" }, managed: true },
        ],
        flow: {
          type: "oauth2",
          authorize_url: "https://github.com/login/oauth/authorize",
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "{vendor.client_id}",
          client_secret: "{vendor.client_secret}",
          install_url: "https://github.com/apps/{vendor.app_slug}/installations/new",
          after_connect: true,
        },
        token: {
          type: "jwt_bearer",
          exchange_url:
            "https://api.github.com/app/installations/{installation_id}/access_tokens",
          iss: "{vendor.app_id}",
          key: "{vendor.private_key}",
          alg: "RS256",
          lifetime: 540,
        },
      },
      {
        id: "account",
        scope: "interactive",
        label: { en: "Your account" },
        fields: [{ key: "login", type: "string", label: { en: "Login" }, managed: true }],
        flow: {
          type: "oauth2",
          authorize_url: "https://github.com/login/oauth/authorize",
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "{vendor.client_id}",
          client_secret: "{vendor.client_secret}",
          scopes: [],
          pkce: true,
          after_connect: true,
          revoke: "hook",
        },
      },
    ],
  });

  it("accepts an installation-style organization and a member's account", () => {
    expect(messages(validateManifest(github()))).toBe("");
  });

  it("names a vendor value the vendor block does not declare", () => {
    const manifest = github();
    manifest.connections![1].flow!.client_id = "{vendor.clientid}";
    const problems = validateManifest(manifest);
    expect(messages(problems)).toContain("'{vendor.clientid}' is not a field of the vendor block");
  });

  it("names a connection field the connection does not declare, anywhere in the token's body too", () => {
    const manifest = github();
    const token = manifest.connections![0].token!;
    token.exchange_url = "https://api.github.com/app/{install}/t";
    token.exchange_body = { permissions: { issues: "write" }, repositories: ["{vendor.app_slug}", "{repo}"] };
    expect(messages(validateManifest(manifest))).toBe(
      [
        "/connections/0/token/exchange_url: '{install}' is not a field of this connection",
        "/connections/0/token/exchange_body/repositories/1: '{repo}' is not a field of this connection",
      ].join("\n")
    );
  });

  it("parses a token's body given as an expression, finding no placeholder in its braces", () => {
    const manifest = github();
    const workspace = manifest.connections![0];
    workspace.fields.push({ key: "account_type", type: "string", label: { en: "Type" }, managed: true });
    workspace.token!.exchange_body =
      '{"permissions": $merge([{"issues": "write"}, connection.account_type = "Organization" ? {"members": "read"} : {}])}';
    expect(messages(validateManifest(manifest))).toBe("");
    workspace.token!.exchange_body = '{"permissions": {"issues": "write"}';
    expect(messages(validateManifest(manifest))).toMatch(/^\/connections\/0\/token\/exchange_body: does not parse: [^\n]+$/);
  });

  it("insists an interactive connection has a flow", () => {
    const manifest = github();
    delete manifest.connections![1].flow;
    expect(messages(validateManifest(manifest))).toContain("declares a flow");
  });

  it("holds a flow connection's fields to managed values", () => {
    const manifest = github();
    manifest.connections![1].fields[0].managed = false;
    expect(messages(validateManifest(manifest))).toContain("mark the field managed");
  });

  it("insists an install page is a static connection's, and calls after_connect", () => {
    const manifest = github();
    manifest.connections![0].flow!.after_connect = false;
    manifest.connections![1].flow!.install_url = "https://github.com/apps/x/installations/new";
    const text = messages(validateManifest(manifest));
    expect(text).toContain("/connections/0/flow/install_url");
    expect(text).toContain("/connections/1/flow/install_url");
  });

  it.each(["rfc7009", "github_grant"] as const)(
    "insists %s revocation names where to send it",
    (method) => {
      const manifest = github();
      manifest.connections![1].flow!.revoke = method;
      expect(messages(validateManifest(manifest))).toContain(
        `${method} revocation is sent to revoke_url, which is missing`
      );
    }
  );

  it("accepts GitHub's grant address, naming the vendor's client id", () => {
    const manifest = github();
    manifest.connections![1].flow!.revoke = "github_grant";
    manifest.connections![1].flow!.revoke_url =
      "https://api.github.com/applications/{vendor.client_id}/grant";
    expect(messages(validateManifest(manifest))).toBe("");
  });

  it("keeps a minted token to a static connection", () => {
    const manifest = github();
    manifest.connections![1].token = { ...manifest.connections![0].token! };
    expect(messages(validateManifest(manifest))).toContain("/connections/1/token");
  });

  it("refuses the retired connect_path as a term the contract does not declare", () => {
    const manifest = github() as unknown as { connections: Array<Record<string, unknown>> };
    manifest.connections[1].connect_path = "/connect";
    expect(messages(validateManifest(manifest))).toContain("'connect_path' is not a term");
  });

  it("holds the webhooks secret to one declared vendor value or a managed secret of the routed connection", () => {
    for (const secret of ["{vendor.hook}", "sha={vendor.webhook_secret}", "{installation_id}", "{owner}"]) {
      const manifest = github();
      manifest.webhooks!.verify.secret = secret;
      expect(messages(validateManifest(manifest))).toContain("/webhooks/verify/secret");
    }
  });

  /** A shop an admin types in, which the plug-in checks and makes webhooks at. */
  const shop = () => {
    const manifest = github();
    manifest.connections!.push({
      id: "shop",
      scope: "static",
      label: { en: "Shop" },
      fields: [
        { key: "url", type: "url", required: true, label: { en: "Address" } },
        { key: "key", type: "secret", required: true, label: { en: "Key" } },
        { key: "store_id", type: "string", label: { en: "Store" }, managed: true },
        { key: "hook_secret", type: "secret", label: { en: "Hook secret" }, managed: true },
      ],
      after_connect: true,
    });
    manifest.webhooks = {
      verify: { scheme: "hmac_sha256", header: "X-Shop-Signature", encoding: "base64", secret: "{hook_secret}" },
      dedup: "X-Shop-Delivery",
      route: { header: "X-Shop-Store", connection: "shop", field: "store_id" },
    };
    return manifest;
  };

  it("checks a typed connection with after_connect, and signs its webhooks with its own secret", () => {
    expect(messages(validateManifest(shop()))).toBe("");
  });

  it("takes a connection's webhooks secret only from a managed secret field", () => {
    for (const secret of ["{key}", "{store_id}", "{nothing}"]) {
      const manifest = shop();
      manifest.webhooks!.verify.secret = secret;
      expect(messages(validateManifest(manifest))).toBe(
        `/webhooks/verify/secret: '${secret}' is not a managed secret field of the connection 'shop'`
      );
    }
  });

  it("fills a typed connection's managed fields only through its after_connect", () => {
    const manifest = shop();
    delete manifest.connections![2].after_connect;
    expect(messages(validateManifest(manifest))).toBe(
      "/connections/2/after_connect: managed values come from the after_connect hook, which this connection does not call"
    );
  });

  it("keeps after_connect beside the fields to a static connection without a flow", () => {
    const manifest = github();
    manifest.connections![0].after_connect = true;
    manifest.connections![1].after_connect = true;
    const text = messages(validateManifest(manifest));
    expect(text).toContain("/connections/0/after_connect: after_connect beside the fields is for a static connection without a flow");
    expect(text).toContain("/connections/1/after_connect: after_connect beside the fields is for a static connection without a flow");
  });

  it("routes webhooks by a field of a static connection", () => {
    const interactive = github();
    interactive.webhooks!.route.connection = "account";
    expect(messages(validateManifest(interactive))).toContain(
      "'account' is not a static connection"
    );
    const undeclared = github();
    undeclared.webhooks!.route.field = "org";
    expect(messages(validateManifest(undeclared))).toContain(
      "'org' is not a field of the connection 'workspace'"
    );
  });

  it("holds a vendor setup to the vendor block: declared, kept secret, written once", () => {
    const manifest = github();
    manifest.vendor!.setup!.values = {
      app_ids: "id",
      app_slug: "client_secret",
      client_id: "client_id",
      client_secret: "client_secret",
    };
    const text = messages(validateManifest(manifest));
    expect(text).toContain("/vendor/setup/values/app_ids: 'app_ids' is not a field of the vendor block");
    expect(text).toContain(
      "/vendor/setup/values/app_slug: 'client_secret' is a secret, and 'app_slug' is not a secret field"
    );
    expect(text).toContain(
      "/vendor/setup/values/client_secret: 'client_secret' is written to more than one field"
    );
  });

  it("refuses a vendor setup outside the contract", () => {
    const changes: Array<(setup: Record<string, any>) => void> = [
      (setup) => (setup.kind = "gitlab_app"),
      (setup) => (setup.app.url = "http://initiative.example"),
      (setup) => (setup.app.default_permissions.issues = "admin"),
      (setup) => setup.app.default_events.push("issues"),
      (setup) => (setup.values.app_id = "node_id"),
      (setup) => (setup.values = {}),
      (setup) => delete setup.app,
    ];
    for (const change of changes) {
      const manifest = github();
      change(manifest.vendor!.setup as Record<string, any>);
      expect(validateManifest(manifest).length, String(change)).toBeGreaterThan(0);
    }
  });

  it("reports an address a vendor setup names, which Initiative fills in itself", () => {
    const manifest = github();
    (manifest.vendor!.setup!.app as unknown as Record<string, unknown>).callback_urls = ["https://x.example"];
    expect(messages(validateManifest(manifest))).toContain(
      "/vendor/setup/app/callback_urls: 'callback_urls' is not a term of the manifest contract"
    );
  });

  it("refuses a vendor field type outside the vocabulary", () => {
    const manifest = github() as unknown as { vendor: { fields: Array<Record<string, unknown>> } };
    manifest.vendor.fields[0].type = "int";
    expect(validateManifest(manifest).length).toBeGreaterThan(0);
  });
});

describe("schedules", () => {
  const scheduled = (...every: string[]): Manifest => ({
    ...base(),
    schedules: every.map((value, index) => ({ id: `s-${index}`, every: value })),
  });

  it("accepts whole minutes or hours from 5m to 24h", () => {
    expect(messages(validateManifest(scheduled("5m", "15m", "1440m", "6h", "24h")))).toBe("");
  });

  it("refuses an interval outside the bounds or not in minutes or hours", () => {
    for (const every of ["4m", "25h", "1441m", "0h"]) {
      expect(messages(validateManifest(scheduled(every)))).toContain("/schedules/0/every");
    }
    for (const every of ["15", "1.5h", "15s", "m", " 5m"]) {
      expect(validateManifest(scheduled(every)).length).toBeGreaterThan(0);
    }
  });

  it("refuses more than eight, and two with one id", () => {
    expect(validateManifest(scheduled(...Array(9).fill("5m"))).length).toBeGreaterThan(0);
    const twice = scheduled("5m", "1h");
    twice.schedules![1].id = "s-0";
    expect(messages(validateManifest(twice))).toContain("'s-0' is declared twice");
  });

  it("keeps a container's schedule to its hook", () => {
    const manifest = scheduled("15m");
    Object.assign(manifest.schedules![0], { endpoint: "plugin.acme.tracker.sync", params: "{}", write: "[]" });
    expect(messages(validateManifest(manifest))).toBe(
      ["endpoint", "params", "write"].map((key) => `/schedules/0/${key}: a container plug-in's schedule calls its schedule hook`).join("\n")
    );
  });

  it("holds a declarative plug-in's schedule to a read it makes as the installation, under an id no connection has", () => {
    const manifest = manifestOf(issuesPlugin());
    const [schedule] = manifest.schedules!;
    const problems = () => messages(validateManifest(manifest, { publicId: "acme.issues" }));
    schedule.id = "workspace";
    schedule.endpoint = "plugin.acme.issues.search";
    expect(problems()).toBe(
      [
        "/schedules/0/id: 'workspace' is also a connection's id, and Initiative keys connection health checks by connection id",
        "/schedules/0/endpoint: 'plugin.acme.issues.search' does not take the installation as its actor, and no person is present when a schedule runs",
      ].join("\n")
    );
    schedule.id = "sync";
    schedule.endpoint = "plugin.acme.issues.label";
    expect(problems()).toBe("/schedules/0/endpoint: names 'plugin.acme.issues.label', which is a write endpoint");
    schedule.endpoint = "plugin.acme.issues.gone";
    expect(problems()).toBe("/schedules/0/endpoint: names 'plugin.acme.issues.gone', which this manifest does not declare");
  });
});

describe("fields, parts and actions", () => {
  const field = (key: string): PartNode => ({ type: "field", props: { field: key } });
  const viewed = (tree: PartNode = { type: "section", children: [field("demo.link")] }): Manifest => ({
    ...base(),
    features: ["actions", "endpoints", "fields", "parts"],
    endpoints: [
      { id: "plugin.acme.tracker.new-link", direction: "write" },
      { id: "plugin.acme.tracker.links", direction: "read" },
    ],
    fields: [
      { key: "demo.link", name: { en: "Demo" }, kind: "link", on: ["task", "post"] },
      { key: "demo.opened", name: { en: "Opened" }, kind: "number", on: ["task"] },
    ],
    actions: [{ id: "new-link", name: { en: "New link" }, endpoint: "plugin.acme.tracker.new-link", on: ["task"], menu: true }],
    parts: [{ id: "demo", name: { en: "Demo" }, on: ["task"], tree }],
  });
  const problems = (manifest: Manifest) => messages(validateManifest(manifest));

  it("accepts a part built from every component, bound to its fields and actions", () => {
    const manifest = viewed({
      type: "section",
      props: { title: { en: "Demo" }, collapsed: false },
      children: [
        {
          type: "stack",
          props: { direction: "row", gap: "small", wrap: true },
          children: [
            field("demo.link"),
            { type: "value", props: { field: "demo.opened" } },
            { type: "text", props: { text: { en: "opened" }, tone: "muted" } },
          ],
        },
        { type: "button", props: { action: "new-link", variant: "primary" } },
      ],
    });
    expect(problems(manifest)).toBe("");
  });

  it("takes every kind, with a currency field's code and a select field's options", () => {
    const manifest = viewed();
    const options = [{ value: "draft", label: { en: "Draft" } }, { value: "live", label: { en: "Live" }, color: "#2f9e44" }];
    manifest.fields = FIELD_KINDS.map((kind) => ({
      key: `demo.${kind}`,
      name: { en: kind },
      kind,
      list: kind !== "multi_select",
      on: ["task"],
      ...(kind === "currency" ? { currency: "EUR" } : {}),
      ...(kind === "select" || kind === "multi_select" ? { options } : {}),
    }));
    manifest.parts![0].tree = field("demo.text");
    expect(problems(manifest)).toBe("");
  });

  it("asks a currency field for its code and a select field for its options, each once, and refuses a multi_select list", () => {
    const manifest = viewed();
    const draft = { value: "draft", label: { en: "Draft" } };
    manifest.fields!.push(
      { key: "demo.budget", name: { en: "Budget" }, kind: "currency", on: ["task"] },
      { key: "demo.stage", name: { en: "Stage" }, kind: "select", on: ["task"] },
      { key: "demo.labels", name: { en: "Labels" }, kind: "multi_select", list: true, on: ["task"], options: [draft, draft] },
      { key: "demo.done", name: { en: "Done" }, kind: "progress" as FieldKind, on: ["task"] }
    );
    expect(problems(manifest)).toBe(
      [
        "/fields/2: must have required property 'currency'",
        "/fields/2: must match \"then\" schema",
        "/fields/3: must have required property 'options'",
        "/fields/3: must match \"then\" schema",
        "/fields/4/list: must be equal to constant",
        "/fields/4: must match \"then\" schema",
        "/fields/5/kind: must be equal to one of the allowed values (text, number, date, datetime, link, badge, scale, checkbox, url, currency, select, multi_select, user_reference)",
      ].join("\n")
    );
    manifest.fields = manifest.fields!.slice(0, 5);
    manifest.fields[2].currency = "EUR";
    manifest.fields[3].options = [draft];
    delete manifest.fields[4].list;
    expect(problems(manifest)).toBe("/fields/4/options/1/value: 'draft' is declared twice");
    manifest.fields[4].options = [{ value: "-draft", label: { en: "Draft" } }];
    expect(problems(manifest)).toBe('/fields/4/options/0/value: must match pattern "^[A-Za-z0-9][A-Za-z0-9_\\-]*$"');
  });

  it("checks requires, and that an action runs a declared write", () => {
    const manifest = viewed();
    manifest.fields![0].requires = { all_of: ["nope"] };
    manifest.actions!.push({ ...manifest.actions![0], id: "list", endpoint: "plugin.acme.tracker.links" });
    manifest.actions!.push({ ...manifest.actions![0], id: "gone", endpoint: "plugin.acme.tracker.gone" });
    expect(problems(manifest)).toBe(
      [
        "/fields/0/requires: requires names unknown connection 'nope'",
        "/actions/1/endpoint: names 'plugin.acme.tracker.links', which is a read endpoint",
        "/actions/2/endpoint: names 'plugin.acme.tracker.gone', which this manifest does not declare",
      ].join("\n")
    );
  });

  it("asks the reader for parameters its endpoint declares, and for every one it requires", () => {
    const manifest = viewed();
    manifest.endpoints![0].params = [
      { key: "url", type: "url", label: { en: "Address" }, required: true },
      { key: "note", type: "string", label: { en: "Note" } },
    ];
    manifest.actions![0].params = ["url"];
    expect(problems(manifest)).toBe("");
    manifest.actions![0].params = ["note", "colour"];
    expect(problems(manifest)).toBe(
      [
        "/actions/0/params/1: 'colour' is not a parameter of 'plugin.acme.tracker.new-link'",
        "/actions/0/params: 'plugin.acme.tracker.new-link' requires 'url', which the action does not ask for",
      ].join("\n")
    );
  });

  it("fills only the item's id and the settings it declares, once each, into a part's text", () => {
    const manifest = viewed({ type: "text", props: { text: { en: "{item.id} {settings.prefix} {settings.gone} {item.title}", de: "{settings.prefix}" } } });
    manifest.settings = [
      { key: "prefix", type: "string", label: { en: "Prefix" } },
      { key: "prefix", type: "string", label: { en: "Prefix again" } },
    ];
    expect(problems(manifest)).toBe(
      [
        "/settings/1/key: 'prefix' is declared twice",
        "/parts/0/tree/props/text/en: '{settings.gone}' names a setting this manifest does not declare",
        "/parts/0/tree/props/text/en: '{item.title}' is not a placeholder: a part's text names '{item.id}' and '{settings.<key>}'",
      ].join("\n")
    );
  });

  it("keeps a container's action to the write endpoint its handler answers, and takes a permission", () => {
    const manifest = viewed();
    manifest.actions![0].permission = "use";
    expect(problems(manifest)).toBe("");
    delete manifest.actions![0].endpoint;
    manifest.actions![0].write = '{"set": {"demo.opened": 1}}';
    expect(problems(manifest)).toBe(
      [
        "/actions/0: a container plug-in's action names the write endpoint its handler answers",
        "/actions/0/write: a container plug-in's action is answered by its handler",
      ].join("\n")
    );
  });

  it("refuses a node naming a field or an action that is not offered everywhere the part is", () => {
    const manifest = viewed({
      type: "stack",
      children: [field("demo.link"), field("demo.opened"), field("demo.missing"), { type: "button", props: { action: "nope" } }],
    });
    manifest.parts![0].on = ["task", "post"];
    expect(problems(manifest)).toBe(
      [
        "/parts/0/tree/children/1/props/field: 'demo.opened' is not offered on post, where this part is",
        "/parts/0/tree/children/2/props/field: 'demo.missing' is not declared by this manifest",
        "/parts/0/tree/children/3/props/action: 'nope' is not declared by this manifest",
      ].join("\n")
    );
  });

  it("refuses a key or an id declared twice", () => {
    const manifest = viewed();
    manifest.fields!.push(manifest.fields![1]);
    manifest.parts!.push(manifest.parts![0]);
    manifest.actions!.push(manifest.actions![0]);
    expect(problems(manifest)).toBe(
      [
        "/fields/2/key: 'demo.opened' is declared twice",
        "/actions/1/id: 'new-link' is declared twice",
        "/parts/1/id: 'demo' is declared twice",
      ].join("\n")
    );
  });

  it("holds a part to its node and depth caps", () => {
    const deep = (depth: number): PartNode => (depth === 1 ? field("demo.link") : { type: "section", children: [deep(depth - 1)] });
    expect(problems(viewed(deep(CAPS.partDepth)))).toBe("");
    expect(problems(viewed(deep(CAPS.partDepth + 1)))).toContain("/parts/0/tree/children/0/children/0/children/0/children/0: nested deeper than 4");
    const wide = viewed({ type: "stack", children: Array(CAPS.partNodes).fill(field("demo.link")) });
    expect(problems(wide)).toContain(`/parts/0/tree: holds ${CAPS.partNodes + 1} nodes, more than ${CAPS.partNodes}`);
  });

  it("refuses children on a leaf, a prop a component does not take, and a key that is not a metadata key", () => {
    for (const tree of [
      { type: "field", props: { field: "demo.link" }, children: [] },
      { type: "text", props: { text: { en: "x" }, colour: "red" } },
      { type: "value", props: { field: "Demo.link" } },
      { type: "chart", props: {} },
    ]) {
      expect(validateManifest(viewed(tree as PartNode)).length).toBeGreaterThan(0);
    }
    const numbered = viewed();
    numbered.fields![1].key = "1st";
    expect(problems(numbered)).toContain("/fields/1/key");
  });
});

describe("declarative plug-ins", () => {
  const declarative = (): Manifest => structuredClone(manifestOf(issuesPlugin()));
  const problems = (manifest: Manifest) => messages(validateManifest(manifest, { publicId: "acme.issues" }));

  it("accepts one that uses each term", () => {
    expect(problems(declarative())).toBe("");
  });

  it("refuses an expression that does not parse, saying where", () => {
    const manifest = declarative();
    manifest.endpoints![0].request!.query!.state = "$lowercase(params.state";
    manifest.webhooks!.events![0].when = "payload.(";
    manifest.webhooks!.events![1].write = "[";
    manifest.actions![0].write = '{"set": ';
    manifest.schedules![0].params = '{"since": since';
    const text = problems(manifest);
    expect(text).toContain("/endpoints/0/request/query/state: does not parse:");
    expect(text).toMatch(/\/webhooks\/events\/0\/when: does not parse: .* \(at character \d+\)/);
    for (const where of ["/webhooks/events/1/write", "/actions/0/write", "/schedules/0/params"]) {
      expect(text).toContain(`${where}: does not parse:`);
    }
  });

  it("refuses one that is also a container", () => {
    const manifest: Manifest = { ...declarative(), service: { public_id: "acme.issues" } };
    const text = problems(manifest);
    expect(text).toContain("/hosts: 'hosts' is a declarative plug-in's term");
    expect(text).toContain("/endpoints/0/request: a container plug-in's endpoint is answered by its handler");
    expect(text).toContain("/connections/0/flow/after_connect: a container plug-in sets after_connect true");
    expect(text).toContain("/connections/0/health: health is a declarative plug-in's");
    expect(text).toContain("/webhooks/events: a container plug-in's webhook hook receives each delivery");
    expect(text).toContain("/scopes: a container plug-in declares its scopes in its service block");
    expect(text).toContain("/schedules/0/endpoint: a container plug-in's schedule calls its schedule hook");
    expect(text).toContain("/actions/0/write: a container plug-in's action is answered by its handler");
    expect(text).toContain("/actions/1: a container plug-in's action names the write endpoint its handler answers");
    expect(text).toContain("/fields/2/actions: a container plug-in's action is not told which element it was run from");
  });

  it("refuses a container's terms in a declarative plug-in, and holds its schedules and actions to its own", () => {
    const manifest = declarative();
    delete manifest.hosts;
    delete manifest.endpoints![0].request;
    manifest.connections![0].flow!.after_connect = true;
    manifest.connections![1].flow!.revoke = "hook";
    manifest.connections![1].after_connect = true;
    manifest.features.push("pages");
    manifest.pages = [{ id: "board", path: "/board", name: { en: "Board" } }];
    delete manifest.schedules![0].write;
    delete manifest.actions![1].write;
    const text = problems(manifest);
    expect(text).toContain("/hosts: a declarative plug-in (one with no service block) names the hosts it calls");
    expect(text).toContain("/endpoints/0: a declarative endpoint gives exactly one of 'request' and 'steps'");
    expect(text).toContain("/connections/0/flow/after_connect: a declarative plug-in gives after_connect's request and map");
    expect(text).toContain("/connections/1/flow/revoke: a declarative plug-in has no revoke hook");
    expect(text).toContain("/connections/1/after_connect: a declarative plug-in has no after_connect hook");
    expect(text).toContain("/pages: a declarative plug-in has no pages: a page is served by a container");
    expect(text).toContain(
      "/schedules/0: a declarative plug-in's schedule names the read it makes and the write it makes from the answer"
    );
    expect(text).toContain("/actions/1: a declarative plug-in's action names an endpoint, a write, or both");
  });

  it("lets a declarative action read what its write keeps, and keeps it from an emission", () => {
    const manifest = declarative();
    const read = manifest.endpoints!.find((endpoint) => endpoint.direction === "read")!;
    const emit = manifest.endpoints!.find((endpoint) => endpoint.direction === "emit")!;
    manifest.actions![0].endpoint = read.id;
    expect(problems(manifest)).toBe("");
    manifest.actions![0].endpoint = emit.id;
    expect(problems(manifest)).toBe(`/actions/0/endpoint: names '${emit.id}', which is a emit endpoint`);
  });

  it("holds an event row to an emission with its map, a write, or both", () => {
    const manifest = declarative();
    const [opened, closed] = manifest.webhooks!.events!;
    delete opened.map;
    closed.map = '{"number": payload.issue.number}';
    manifest.webhooks!.events!.push({ when: 'headers."x-event" = "ping"' });
    expect(problems(manifest)).toBe(
      [
        "/webhooks/events/0: an event row gives both 'emit' and the 'map' of its payload",
        "/webhooks/events/1: an event row gives both 'emit' and the 'map' of its payload",
        "/webhooks/events/2: an event row emits, writes, or both",
      ].join("\n")
    );
  });

  it("offers a list field's actions on its elements wherever the field is, and asks for params only for an endpoint", () => {
    const manifest = declarative();
    const linked = manifest.fields![2];
    linked.on = ["task", "post"];
    linked.actions = ["unlink-one", "gone"];
    manifest.fields![1].actions = ["unlink-one"];
    manifest.actions![3].params = ["number"];
    expect(problems(manifest)).toBe(
      [
        "/actions/3/params: an action asks for its endpoint's parameters, and names no endpoint",
        "/fields/1/actions: actions are offered on a list's elements, and this field is not a list",
        "/fields/2/actions/0: 'unlink-one' is not offered on post, where this field is",
        "/fields/2/actions/1: 'gone' is not declared by this manifest",
      ].join("\n")
    );
  });

  it("refuses states, settings and help outside the contract", () => {
    const changes: Array<(manifest: Manifest) => void> = [
      (manifest) => Object.assign(manifest.fields![2].states!.status.values.open, { colour: "green" }),
      (manifest) => {
        const facet = manifest.fields![2].states!.status;
        manifest.fields![2].states = Object.fromEntries(Array.from({ length: CAPS.facetsPerField + 1 }, (_, index) => [`f${index}`, facet]));
      },
      (manifest) => (manifest.settings![0].unique = false),
      (manifest) => (manifest.settings![0].type = "int" as never),
      (manifest) => (manifest.help = { en: "x".repeat(CAPS.helpLength + 1) }),
    ];
    for (const change of changes) {
      const manifest = declarative();
      change(manifest);
      expect(problems(manifest), String(change)).not.toBe("");
    }
  });

  it("checks what requests and steps name", () => {
    const manifest = declarative();
    const [current, set] = manifest.endpoints![1].steps!;
    current.request.url = 'steps.set.body.url';
    set.request.connection = "nobody";
    manifest.endpoints![0].request!.headers = { authorization: '"token"' };
    manifest.endpoints![2].request!.method = "GET";
    manifest.endpoints![1].errors![0].code = "jammed";
    manifest.connections![0].health!.request.connection = "workspace";
    const text = problems(manifest);
    expect(text).toContain("/endpoints/1/steps/0/request/url: reads steps.set, which is not a step before it");
    expect(text).toContain("/endpoints/1/steps/1/request/connection: 'nobody' is not a connection this plug-in declares");
    expect(text).toContain("/endpoints/0/request/headers/authorization: the credential's header is Initiative's to set");
    expect(text).toContain("/endpoints/2/request/method: a GraphQL request is sent by POST");
    expect(text).toContain("/endpoints/1/errors/0/code: 'jammed' is not one of this endpoint's unavailable codes");
    expect(text).toContain("/connections/0/health/request/connection: carries the credential of the connection it belongs to");
  });

  it("refuses a request on a member connection that requires does not name, or that a call made as the installation would carry", () => {
    const manifest = declarative();
    delete manifest.endpoints![2].requires;
    manifest.endpoints![1].steps![1].request.connection = "account";
    const text = problems(manifest);
    expect(text).toContain(
      "/endpoints/2/request/connection: its request uses the member connection 'account', which requires does not name"
    );
    expect(text).toContain("/endpoints/1/steps/1/request/connection: its request uses the member connection 'account'");
    expect(text).toContain(
      "/endpoints/1/steps/1/request/connection: its request uses the member connection 'account', " +
        "which a call made as the installation does not have: name a connection per actor"
    );

    manifest.endpoints![2].requires = { any_of: ["workspace", "account"] };
    manifest.endpoints![1].requires = { all_of: ["account"] };
    manifest.endpoints![1].actors = ["member"];
    expect(problems(manifest)).toBe("");

    manifest.endpoints![2].actors = ["installation"];
    expect(problems(manifest)).toBe(
      "/endpoints/2/request/connection: its request uses the member connection 'account', " +
        "which a call made as the installation does not have: name a connection per actor"
    );
  });

  it("holds a connection per actor to the endpoint's actors, naming one of the right scope for each", () => {
    const manifest = declarative();
    const [read, label, , assign, , create, , link] = manifest.endpoints!;
    read.request!.connection = { installation: "workspace" };
    manifest.connections![0].health!.request.connection = { installation: "workspace" };
    label.steps![0].request.connection = { member: "account" };
    assign.request!.connection = { member: "workspace", installation: "account" };
    create.request!.connection = { installation: "nobody" };
    delete link.actors;
    link.request!.connection = { installation: "workspace" };
    expect(problems(manifest)).toBe(
      [
        "/endpoints/0/request/connection: names a connection per actor, and the endpoint declares no actors",
        "/endpoints/1/steps/0/request/connection: names no connection for 'installation', one of the endpoint's actors",
        "/endpoints/1/steps/0/request/connection/member: 'member' is not one of the endpoint's actors",
        "/endpoints/3/request/connection/installation: 'account' is not a static connection: a call made as the installation carries the community's credential",
        "/endpoints/3/request/connection/member: 'workspace' is not an interactive connection: a call made as the member carries the member's own credential",
        "/endpoints/5/request/connection/installation: 'nobody' is not a connection this plug-in declares",
        "/endpoints/7/request/connection: names a connection per actor, and the endpoint declares no actors",
        "/connections/0/health/request/connection: carries the credential of the connection it belongs to, and names none",
      ].join("\n")
    );

    const reading = declarative();
    reading.endpoints![0].actors = ["member", "installation"];
    reading.endpoints![0].request!.connection = { member: "account", installation: "workspace" };
    expect(problems(reading)).toBe("");

    const shaped = declarative();
    shaped.endpoints![3].request!.connection = {};
    expect(problems(shaped)).toContain("/endpoints/3/request/connection: must NOT have fewer than 1 properties");
    shaped.endpoints![3].request!.connection = { member: "account", owner: "acme" } as never;
    expect(problems(shaped)).toContain("/endpoints/3/request/connection/owner: 'owner' is not a term of the manifest contract");
  });

  it("checks paging, refusals, events and statuses", () => {
    const manifest = declarative();
    const paging = manifest.endpoints![2].request!.paging!;
    if (paging.kind === "cursor") paging.param = "after";
    const after = manifest.connections![0].flow!.after_connect;
    if (typeof after === "object") delete after.code;
    manifest.webhooks!.events![0].emit = "plugin.acme.issues.label";
    manifest.webhooks!.status![0].state = "unavailable";
    manifest.webhooks!.route.header = "X-Account";
    const text = problems(manifest);
    expect(text).toContain("/endpoints/2/request/paging: a cursor is sent in exactly one of 'param' and 'variable'");
    expect(text).toContain("/connections/0/flow/after_connect: a refusal gives both 'refuse_when' and the 'code'");
    expect(text).toContain("/webhooks/events/0/emit: 'plugin.acme.issues.label' is not an emit endpoint");
    expect(text).toContain("/webhooks/status/0/state: a delivery says a connection is ok, suspended or removed");
    expect(text).toContain("/webhooks/route: a delivery is routed by exactly one of 'path' and 'header'");
  });

  it("checks after_connect's steps as an endpoint's", () => {
    const manifest = declarative();
    const after = manifest.connections![0].flow!.after_connect;
    if (typeof after !== "object") throw new Error("the issues plug-in's after_connect is declarative");
    const request = after.request!;
    delete after.request;
    after.steps = [
      { name: "installations", request },
      { name: "user", request: { method: "GET", url: '"https://api.tracker.example/user"' } },
    ];
    after.refuse_when = "steps.user.body.id != steps.installations.body[0].owner_id";
    expect(problems(manifest)).toBe("");

    const at = "/connections/0/flow/after_connect";
    after.request = request;
    expect(problems(manifest)).toContain(`${at}: must match exactly one schema in oneOf`);
    const steps = after.steps;
    delete after.request;
    delete after.steps;
    expect(problems(manifest)).toContain(`${at}: must match exactly one schema in oneOf`);
    after.steps = steps;

    after.steps[0].request = { ...request, url: "steps.user.body.url", connection: "workspace" };
    after.steps[1].name = "installations";
    after.map = "steps.nobody.body";
    const text = problems(manifest);
    expect(text).toContain(`${at}/steps/0/request/url: reads steps.user, which is not a step before it`);
    expect(text).toContain(`${at}/steps/0/request/connection: carries the credential of the connection it belongs to`);
    expect(text).toContain(`${at}/steps/1/name: 'installations' names two steps`);
    expect(text).toContain(`${at}/map: reads steps.nobody, which is not a step before it`);

    after.steps.push(...after.steps.map((step) => ({ ...step, name: `${step.name}-again` })));
    expect(problems(manifest)).toContain(`${at}/steps: must NOT have more than 3 items`);
  });

  it("refuses a host that is not a name", () => {
    for (const host of ["api.-x.example", "10.0.0.1", "*.*.example", "https://api.example", "api"]) {
      const manifest = declarative();
      manifest.hosts = [host];
      expect(problems(manifest), host).toContain("/hosts/0");
    }
  });

  it("holds steps and pages to their caps", () => {
    const manifest = declarative();
    const steps = manifest.endpoints![1].steps!;
    steps.push(...steps.map((step) => ({ ...step, name: `${step.name}-again` })));
    const paging = manifest.endpoints![0].request!.paging!;
    paging.max_pages = 11;
    const text = problems(manifest);
    expect(text).toContain("/endpoints/1/steps: must NOT have more than 3 items");
    expect(text).toContain("/endpoints/0/request/paging/max_pages: must be <= 10");
  });
});
