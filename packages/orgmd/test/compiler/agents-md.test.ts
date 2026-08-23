import { describe, expect, it } from "vitest";
import type { ResolvedContext } from "../../src/resolver/types.js";
import { compileContext } from "../../src/compiler/compile.js";

function context(): ResolvedContext {
  return {
    contextId: "sha256:context",
    bundles: [
      { bundleId: "org.root", contentId: "sha256:root", path: "root" },
      {
        bundleId: "org.product",
        contentId: "sha256:product",
        path: "root/product",
      },
    ],
    entries: [
      {
        bundleIndex: 0,
        contested: false,
        staleReasons: [],
        revision: {
          id: "term.release",
          owner: "role.editor",
          scope: "public",
          status: "approved",
          source: "native",
          rev: 1,
          domain: "glossary",
          body: "A release is a versioned delivery.",
          sourcePath: "glossary.md",
          line: 1,
          extra: {},
        },
      },
      {
        bundleIndex: 1,
        contested: true,
        staleReasons: ["revisit", "owner"],
        revision: {
          id: "policy.deploy",
          owner: "role.release",
          scope: "public",
          status: "approved",
          source: "native",
          rev: 2,
          domain: "policy",
          body: "Deploy only with approval.",
          sourcePath: "policy.md",
          line: 1,
          action: "deploy.production",
          effect: "escalate",
          route: "role.release",
          extra: {},
        },
      },
      {
        bundleIndex: 0,
        contested: false,
        staleReasons: [],
        revision: {
          id: "role.editor",
          owner: "role.editor",
          scope: "public",
          status: "approved",
          source: "native",
          rev: 1,
          domain: "identity",
          body: "Editor owns publication.",
          sourcePath: "identity.md",
          line: 1,
          extra: {},
        },
      },
      { withheld: true, reason: "clearance" },
      { withheld: true, reason: "clearance" },
    ],
    resolutionErrors: [],
    diagnostics: [],
  };
}

const expected = `<!-- orgmd:begin profile=orgmd-agents-md-v1 advisory=true context=sha256:context -->
<!-- bundles: org.root=sha256:root, org.product=sha256:product -->
## Organisational context (advisory)

### Identity

#### \`role.editor\`
owner: \`role.editor\`
scope: \`public\`
source: \`native\`
revision: \`1\`

Editor owns publication.

### Glossary

#### \`term.release\`
owner: \`role.editor\`
scope: \`public\`
source: \`native\`
revision: \`1\`

A release is a versioned delivery.

### Policy

#### \`policy.deploy\`
owner: \`role.release\`
scope: \`public\`
source: \`native\`
revision: \`2\`
action: \`deploy.production\`
effect: \`escalate\`
route: \`role.release\`
CONTESTED — reliance requires escalation
STALE (owner, revisit) — reliance requires escalation

Deploy only with approval.

### Withheld

Withheld entries: 2 (clearance).
<!-- orgmd:end -->
`;

describe("orgmd-agents-md-v1", () => {
  it("renders the fixed advisory profile byte-for-byte", () => {
    const result = compileContext(context(), "agents-md");

    expect(result).toEqual({
      value: {
        target: "agents-md",
        profile: "orgmd-agents-md-v1",
        content: expected,
      },
      diagnostics: [],
    });
  });

  it("refuses every resolution error without returning a partial projection", () => {
    const result = compileContext(
      {
        ...context(),
        resolutionErrors: [
          {
            code: "resolution.entry-error",
            node: "root",
            id: "term.broken",
            detail: "The entry cannot resolve.",
          },
        ],
      },
      "agents-md",
    );

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        code: "compiler.resolution-error",
        severity: "error",
        message:
          "Compilation refused because the resolved context contains resolution errors.",
      },
    ]);
  });
});
