import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseContentFile } from "../../src/parser/content-file.js";

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../fixtures/parser/${name}`, import.meta.url)),
    "utf8",
  );

const parseText = (text: string) =>
  parseContentFile({
    path: "glossary.md",
    domain: "glossary",
    bytes: new TextEncoder().encode(text),
  });

describe("parseContentFile", () => {
  it("accepts BOM and CRLF, ignores delimiters inside fences, and splits only after a blank line", () => {
    const result = parseContentFile({
      path: "glossary.md",
      domain: "glossary",
      bytes: new TextEncoder().encode(
        fixture("multiple-crlf.md").replace(/\n/g, "\r\n"),
      ),
    });

    expect(result.diagnostics).toEqual([]);
    expect(
      result.value?.map(({ frontMatter, body }) => [frontMatter.id, body]),
    ).toEqual([
      ["term.one", "First body\n\n```md\n---\n```"],
      ["term.two", "Second body"],
    ]);
  });

  it("reports the duplicate YAML key source line", () => {
    const result = parseText("---\nid: term.one\nid: term.two\n---\nBody");

    expect(result.diagnostics).toMatchObject([
      { code: "validation.duplicate-yaml-key", severity: "error", line: 3 },
    ]);
    expect(result.value).toBeUndefined();
  });

  it("rejects invalid UTF-8 rather than replacing malformed bytes", () => {
    const result = parseContentFile({
      path: "glossary.md",
      domain: "glossary",
      bytes: Uint8Array.of(0xc3, 0x28),
    });

    expect(result).toMatchObject({
      diagnostics: [{ code: "parser.invalid-utf8", severity: "error" }],
    });
    expect(result.value).toBeUndefined();
  });

  it("warns and returns no entries when the opening delimiter is absent", () => {
    const result = parseText("# A human Markdown document\n\nNot ORG content.");

    expect(result).toMatchObject({
      value: [],
      diagnostics: [
        { code: "parser.not-content-file", severity: "warning", line: 1 },
      ],
    });
  });

  it("does not accept four hyphens as a delimiter", () => {
    const result = parseText("----\nid: term.one\n---\nBody");

    expect(result).toMatchObject({
      value: [],
      diagnostics: [{ code: "parser.not-content-file", severity: "warning" }],
    });
  });

  it("requires YAML front matter to be a mapping", () => {
    const result = parseText("---\n- not\n- a mapping\n---\nBody");

    expect(result).toMatchObject({
      diagnostics: [
        { code: "parser.invalid-yaml-mapping", severity: "error", line: 1 },
      ],
    });
    expect(result.value).toBeUndefined();
  });

  it("leaves an unseparated delimiter in the preceding body", () => {
    const result = parseText(
      "---\nid: term.one\n---\nHeading\n---\nStill body",
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toMatchObject([
      { frontMatter: { id: "term.one" }, body: "Heading\n---\nStill body" },
    ]);
  });

  it("ignores delimiters inside backtick fences", () => {
    const result = parseText(fixture("fenced-delimiter.md"));

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toMatchObject([
      { body: "```markdown\n---\n```" },
      { frontMatter: { id: "term.after-fence" }, body: "After fence" },
    ]);
  });

  it("ignores delimiters inside tilde fences and permits longer closing fences", () => {
    const result = parseText(
      "---\nid: term.fence\n---\n~~~markdown\n---\n~~~~\n\n---\nid: term.after-fence\n---\nAfter fence",
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toMatchObject([
      { body: "~~~markdown\n---\n~~~~" },
      { frontMatter: { id: "term.after-fence" }, body: "After fence" },
    ]);
  });

  it("removes only leading and trailing blank lines from a body", () => {
    const result = parseText(
      "---\nid: term.one\n---\n\n First\n\nLast \n \t\n",
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toMatchObject([{ body: " First\n\nLast " }]);
  });

  it("rejects a file limit before parsing a partial record", () => {
    const result = parseContentFile({
      path: "glossary.md",
      domain: "glossary",
      bytes: new TextEncoder().encode("---\nid: term.one\n---\nBody"),
      limits: { maxFileBytes: 1 },
    });

    expect(result).toMatchObject({
      diagnostics: [{ code: "parser.resource-limit", severity: "error" }],
    });
    expect(result.value).toBeUndefined();
  });
});
