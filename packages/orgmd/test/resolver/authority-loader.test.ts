import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadBundle,
  resolveContext,
  validateBundlePath,
  type ValidatedBundle,
} from "../../src/index.js";

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
  bundleId: string | undefined,
  ownershipBody: string,
  delegates: readonly string[] = [],
): Promise<void> {
  const bundleYaml = bundleId === undefined ? "" : `bundle: ${bundleId}\n`;
  await writeFile(
    join(directory, "org.md"),
    `---\nid: org.identity\nowner: role.editor\nscope: public\nstatus: approved\nsource: native\nrev: 1\n${bundleYaml}---\n${bundleId ?? "Bundle"}\n`,
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
  const validated = await validateBundlePath(reference, { isRoot, nodePath });
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

    const publiclyLoaded = await loadBundle({
      reference: rootDirectory,
      nodePath: "root",
      isRoot: true,
    });
    expect(publiclyLoaded.value?.nodePath).toBe("root");

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

  it("rejects one physical bundle loaded through distinct aliases and logical paths", async () => {
    const directory = await fixtureDir("physical-bundle");
    const aliasParent = await mkdtemp(
      join(tmpdir(), "orgmd-authority-loader-alias-"),
    );
    directories.push(aliasParent);
    const alias = join(aliasParent, "bundle-alias");
    await writeBundle(directory, undefined, "Board");
    await symlink(directory, alias);

    const root = await loadedValidated(directory, "root", true);
    const duplicate = await loadedValidated(alias, "alias", false);
    const result = resolveContext({
      path: [root, duplicate],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "resolution.duplicate-path",
        path: "alias",
      }),
    );
  });

  it("never falls back to a filesystem realpath when logical nodePath is omitted", async () => {
    const firstDirectory = await fixtureDir("physical-first");
    const secondDirectory = await fixtureDir("physical-second");
    await writeBundle(firstDirectory, "org.same", "Board");
    await writeBundle(secondDirectory, "org.same", "Board");

    const first = await loadedValidated(firstDirectory, "root", true);
    const second = await loadedValidated(secondDirectory, "root", true);
    const firstResult = resolveContext({
      path: [first],
      clearance: ["public"],
      today: "2026-08-21",
    });
    const secondResult = resolveContext({
      path: [second],
      clearance: ["public"],
      today: "2026-08-21",
    });
    expect(firstResult.value?.contextId).toBe(secondResult.value?.contextId);
    expect(firstResult.value?.bundles.map(({ path }) => path)).toEqual([
      "root",
    ]);
    expect(JSON.stringify(firstResult.value)).not.toContain(firstDirectory);
    expect(JSON.stringify(secondResult.value)).not.toContain(secondDirectory);

    const withoutLogicalPath = await validateBundlePath(firstDirectory, {
      isRoot: true,
    });
    expect(withoutLogicalPath.diagnostics).toEqual([]);
    if (!withoutLogicalPath.value) {
      throw new Error("expected validated filesystem bundle");
    }
    const refused = resolveContext({
      path: [withoutLogicalPath.value],
      clearance: ["public"],
      today: "2026-08-21",
    });
    expect(refused.value).toBeUndefined();
    expect(refused.diagnostics).toEqual([
      expect.objectContaining({
        code: "resolution.invalid-request",
        details: { index: 0 },
      }),
    ]);
    expect(JSON.stringify(refused)).not.toContain(firstDirectory);
  });
});
