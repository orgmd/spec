import { describe, expect, it } from "vitest";
import type { ResolvedContext } from "../../src/resolver/types.js";
import { compileContext } from "../../src/compiler/compile.js";

function context(entries?: ResolvedContext["entries"]): ResolvedContext {
  const base: ResolvedContext["entries"] = [
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
    { withheld: true, reason: "clearance" },
  ];
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
    entries: entries ?? base,
    resolutionErrors: [],
    diagnostics: [],
  };
}

const expected = `[ORG.md advisory context]
profile: orgmd-prompt-v1
context: sha256:context
bundles: org.root=sha256:root, org.product=sha256:product

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

Withheld entries: 1 (clearance).
[end ORG.md advisory context]
`;

describe("orgmd-prompt-v1", () => {
  it("renders the fixed advisory profile byte-for-byte", () => {
    expect(compileContext(context(), "prompt")).toEqual({
      value: {
        target: "prompt",
        profile: "orgmd-prompt-v1",
        content: expected,
      },
      diagnostics: [],
    });
  });

  it("is byte-identical for 25 repeated executions and source-order permutations", () => {
    const entries = context().entries;
    const variants = [
      entries,
      [...entries].reverse(),
      [entries[1], entries[2], entries[0]],
    ];
    const outputs = Array.from({ length: 25 }, () =>
      variants.map(
        (variant) => compileContext(context(variant), "prompt").value?.content,
      ),
    );

    expect(new Set(outputs.flat())).toEqual(new Set([expected]));
  });
});
