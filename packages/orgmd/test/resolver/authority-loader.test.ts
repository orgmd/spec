import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadBundle } from "../../src/bundle/load.js";
import type { ValidatedBundle } from "../../src/model/types.js";
import { resolveContext } from "../../src/resolver/resolve.js";
import { validateBundle } from "../../src/validation/validate.js";

const directories: string[] = [];

async function fixtureDir(name: string): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "orgmd-authority-loader-"));
  directories.push(parent);
  const directory = join(parent, name);
  await mkdir(directory);
  return directory;
}

async function writeBundle(
  directory: string,
  bundleId: string,
  ownershipBody: string,
  delegates: readonly string[] = [],
): Promise<void> {
  await writeFile(
    join(directory, "org.md"),
    `---\nid: org.identity\nowner: role.editor\nscope: public\nstatus: approved\nsource: native\nrev: 1\nbundle: ${bundleId}\n---\n${bundleId}\n`,
    "utf8",
  );
  const delegatesYaml =
    delegates.length === 0
      ? ""
      : `delegates:\n${delegates.map((node) => `  - ${node}\n`).join("")}`;
  await writeFile(
    join(directory, "ownership.md"),
    `---\nid: own.last-resort\nowner: role.editor\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\nLast resort\n\n---\nid: own.payments\nowner: role.editor\nscope: public\nstatus: approved\nsource: native\nrev: 1\n${delegatesYaml}---\n${ownershipBody}\n`,
    "utf8",
  );
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function loadedValidated(
  reference: string,
  nodePath: string,
  isRoot: boolean,
): Promise<ValidatedBundle> {
  const loaded = await loadBundle({ reference, nodePath, isRoot });
  expect(loaded.diagnostics).toEqual([]);
  if (!loaded.value) throw new Error("expected loaded bundle");
  const validated = validateBundle(loaded.value, { isRoot });
  expect(validated.diagnostics).toEqual([]);
  if (!validated.value) throw new Error("expected validated bundle");
  return validated.value;
}

describe("filesystem-loaded authority delegation", () => {
  it("uses explicit logical node paths without weakening realpath loading", async () => {
    const rootDirectory = await fixtureDir("root-filesystem-name");
    const divisionDirectory = await fixtureDir("unrelated-directory-name");
    await writeBundle(rootDirectory, "org.root", "Board", ["division"]);
    await writeBundle(divisionDirectory, "org.division", "Division");

    const root = await loadedValidated(rootDirectory, "root", true);
    const division = await loadedValidated(
      divisionDirectory,
      "division",
      false,
    );
    const result = resolveContext({
      path: [root, division],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.diagnostics).toEqual([]);
    expect(
      result.value?.entries.find(
        (entry) =>
          !("withheld" in entry) && entry.revision.id === "own.payments",
      ),
    ).toMatchObject({
      revision: { body: "Division" },
      bundleIndex: 1,
    });
    expect(result.value?.bundles.map(({ path }) => path)).toEqual([
      "root",
      "division",
    ]);
    expect(root.reference).toBe(rootDirectory);
  });
});
