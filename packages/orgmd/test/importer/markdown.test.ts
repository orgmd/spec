import { describe, expect, it } from "vitest";
import { extractMarkdownCandidates } from "../../src/importer/markdown.js";

describe("extractMarkdownCandidates", () => {
  it("preserves source order and text while creating draft candidates", () => {
    const candidates = extractMarkdownCandidates(
      "# Terms\n\n- Customer means the contracting organisation.\n",
    );

    expect(candidates).toMatchObject([
      {
        sourceHeading: "Terms",
        sourceText: "Customer means the contracting organisation.",
        status: "draft",
        suggestedDomain: "glossary",
      },
    ]);
  });

  it("recognizes ATX and setext headings, lists, paragraphs, and fences", () => {
    const candidates = extractMarkdownCandidates(
      [
        "# Rules",
        "",
        "1. Never publish customer data.",
        "2. Escalate uncertainty.",
        "",
        "Terms",
        "-----",
        "",
        "A customer is the contracting organisation.",
        "",
        "```text",
        "# This is preserved rather than treated as a heading",
        "example",
        "```",
        "",
      ].join("\n"),
    );

    expect(
      candidates.map(({ sourceHeading, sourceText, suggestedDomain }) => ({
        sourceHeading,
        sourceText,
        suggestedDomain,
      })),
    ).toEqual([
      {
        sourceHeading: "Rules",
        sourceText: "Never publish customer data.",
        suggestedDomain: "policy",
      },
      {
        sourceHeading: "Rules",
        sourceText: "Escalate uncertainty.",
        suggestedDomain: "policy",
      },
      {
        sourceHeading: "Terms",
        sourceText: "A customer is the contracting organisation.",
        suggestedDomain: "glossary",
      },
      {
        sourceHeading: "Terms",
        sourceText:
          "```text\n# This is preserved rather than treated as a heading\nexample\n```",
        suggestedDomain: "glossary",
      },
    ]);
  });

  it("gives repeated headings stable collision suffixes and skips empty sections", () => {
    const text = [
      "# Terms",
      "",
      "First definition.",
      "",
      "# Terms",
      "",
      "Second definition.",
      "",
      "# Empty",
      "",
    ].join("\n");

    expect(
      extractMarkdownCandidates(text).map(({ candidateId }) => candidateId),
    ).toEqual(["term.terms", "term.terms-2"]);
  });
});
