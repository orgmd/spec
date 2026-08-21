import type { AdoptCandidate } from "./types.js";

export function renderAdoptionPreview(
  sourcePath: string,
  candidates: readonly AdoptCandidate[],
): string {
  return candidates
    .map((candidate) =>
      [
        `# ${candidate.candidateId}`,
        `source: ${sourcePath}`,
        `heading: ${candidate.sourceHeading}`,
        `suggested domain: ${candidate.suggestedDomain}`,
        "status: draft",
        `required confirmations: ${candidate.requiredInputs.join(", ") || "none"}`,
        "",
        candidate.sourceText,
      ].join("\n"),
    )
    .join("\n\n");
}

export function renderDraftRevision(
  candidate: AdoptCandidate,
  confirmation: Readonly<Record<string, string>>,
  sourcePath: string,
): string {
  const lines = [
    "---",
    `id: ${candidate.candidateId}`,
    `owner: ${yaml(confirmation.owner ?? "")}`,
    `scope: ${yaml(confirmation.scope ?? "")}`,
    "status: draft",
    "source: native",
    "rev: 1",
    `ref: ${yaml(sourcePath)}`,
  ];
  if (candidate.suggestedDomain === "policy") {
    lines.push(
      `revisit: ${yaml(confirmation.revisit ?? "")}`,
      `action: ${yaml(confirmation.action ?? "")}`,
      `effect: ${confirmation.effect ?? ""}`,
    );
    if (confirmation.effect === "escalate")
      lines.push(`route: ${yaml(confirmation.route ?? "")}`);
  }
  return `${lines.join("\n")}\n---\n${candidate.sourceText}\n`;
}

export function targetFile(candidate: AdoptCandidate): string {
  switch (candidate.suggestedDomain) {
    case "glossary":
      return "glossary.md";
    case "policy":
      return "policies.md";
    case "identity":
      return "org.md";
  }
}

function yaml(value: string): string {
  return JSON.stringify(value);
}
