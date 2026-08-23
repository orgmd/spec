import type { InitInput, InitPlanFile } from "./types.js";

export function renderInitFiles(input: InitInput): readonly InitPlanFile[] {
  const organizationId = `org.${slug(input.organizationName)}`;
  const policyId = `pol.${slug(input.policyAction)}`;
  const disputed =
    input.disputedTerms.length === 0
      ? "- No contested terminology was supplied."
      : input.disputedTerms
          .map((term) => `- \`${term}\` — unratified`)
          .join("\n");
  const route =
    input.policyEffect === "escalate"
      ? `route: ${yaml(input.policyRoute ?? "")}`
      : undefined;

  return Object.freeze([
    Object.freeze({
      relativePath: "org.md" as const,
      content: [
        "---",
        `id: ${organizationId}`,
        `owner: ${yaml(input.editorRole)}`,
        "scope: public",
        "status: approved",
        "source: native",
        "rev: 1",
        `bundle: ${organizationId}`,
        "---",
        `# ${input.organizationName}`,
        "",
        `Tone: ${input.tone}`,
        "",
        "## Contested terminology",
        "",
        disputed,
        "",
      ].join("\n"),
    }),
    Object.freeze({
      relativePath: "ownership.md" as const,
      content: [
        "---",
        "id: own.last-resort",
        `owner: ${yaml(input.editorRole)}`,
        "scope: public",
        "status: approved",
        "source: native",
        "rev: 1",
        "---",
        `${input.editorRole} is the last-resort owner for this bundle.`,
        "",
        "---",
        "id: own.policy-owner",
        `owner: ${yaml(input.policyOwner)}`,
        "scope: public",
        "status: approved",
        "source: native",
        "rev: 1",
        "---",
        `${input.policyOwner} owns the initial policy.`,
        "",
      ].join("\n"),
    }),
    Object.freeze({
      relativePath: "policies.md" as const,
      content: [
        "---",
        `id: ${policyId}`,
        `owner: ${yaml(input.policyOwner)}`,
        "scope: public",
        "status: approved",
        "source: native",
        "rev: 1",
        `action: ${yaml(input.policyAction)}`,
        `effect: ${input.policyEffect}`,
        ...(route === undefined ? [] : [route]),
        `revisit: ${yaml(input.revisit)}`,
        "---",
        input.policyText,
        "",
      ].join("\n"),
    }),
  ]);
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "organization"
  );
}

function yaml(value: string): string {
  return JSON.stringify(value);
}
