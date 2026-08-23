import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mapDomain } from "../../src/bundle/domain.js";
import { loadBundle } from "../../src/bundle/load.js";

const directories: string[] = [];

async function fixtureDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orgmd-bundle-"));
  directories.push(directory);
  return directory;
}

async function content(path: string, id: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `---\nid: ${id}\n---\nBody\n`, "utf8");
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("mapDomain", () => {
  it("maps the recommended content paths and leaves unknown paths unmapped", () => {
    expect(mapDomain("org.md")).toBe("identity");
    expect(mapDomain("glossary.md")).toBe("glossary");
    expect(mapDomain("policies.md")).toBe("policy");
    expect(mapDomain("ownership.md")).toBe("ownership");
    expect(mapDomain("done.md")).toBe("done");
    expect(mapDomain("decisions/2026/adr.md")).toBe("decision");
    expect(mapDomain("notes.md")).toBeUndefined();
    expect(mapDomain("decisions.txt")).toBeUndefined();
  });
});

describe("loadBundle", () => {
  it("maps recommended paths and ignores unknown Markdown files deterministically", async () => {
    const directory = await fixtureDir();
    await content(join(directory, "org.md"), "org.identity");
    await content(join(directory, "glossary.md"), "term.bundle");
    await content(join(directory, "notes.md"), "note.ignored");
    await writeFile(join(directory, "README.txt"), "ignored", "utf8");

    const result = await loadBundle({ reference: directory, isRoot: true });

    expect(
      result.value?.entries.map(({ domain, frontMatter }) => [
        domain,
        frontMatter.id,
      ]),
    ).toEqual([
      ["glossary", "term.bundle"],
      ["identity", "org.identity"],
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "bundle.unknown-file",
        severity: "warning",
        path: "notes.md",
      }),
    );
    expect(result.value && Object.isFrozen(result.value)).toBe(true);
    expect(result.value && Object.isFrozen(result.value.entries)).toBe(true);
  });

  it("requires org.md", async () => {
    const directory = await fixtureDir();
    await content(join(directory, "glossary.md"), "term.bundle");

    const result = await loadBundle({ reference: directory, isRoot: false });

    expect(result).toMatchObject({
      diagnostics: [{ code: "bundle.missing-org-file", severity: "error" }],
    });
    expect(result.value).toBeUndefined();
  });

  it("rejects a Markdown symlink that resolves outside the bundle root", async () => {
    const directory = await fixtureDir();
    const outside = await fixtureDir();
    await content(join(directory, "org.md"), "org.identity");
    await content(join(outside, "outside.md"), "term.outside");
    await symlink(join(outside, "outside.md"), join(directory, "glossary.md"));

    const result = await loadBundle({ reference: directory, isRoot: false });

    expect(result).toMatchObject({
      diagnostics: [
        {
          code: "bundle.escaping-symlink",
          severity: "error",
          path: "glossary.md",
        },
      ],
    });
    expect(result.value).toBeUndefined();
  });

  it("collects decision files recursively in UTF-8 path order", async () => {
    const directory = await fixtureDir();
    await content(join(directory, "org.md"), "org.identity");
    await content(join(directory, "decisions", "z.md"), "decision.z");
    await content(join(directory, "decisions", "a.md"), "decision.a");
    await content(join(directory, "glossary.md"), "term.bundle");

    const result = await loadBundle({ reference: directory, isRoot: false });

    expect(result.diagnostics).toEqual([]);
    expect(
      result.value?.entries.map(({ frontMatter }) => frontMatter.id),
    ).toEqual(["decision.a", "decision.z", "term.bundle", "org.identity"]);
  });
});
