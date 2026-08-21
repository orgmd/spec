import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { doctorBundle, loadBundle, validateBundle } from "../../src/index.js";
import {
  planInit,
  writeInitPlan,
  type InitInput,
} from "../../src/init/init.js";
import { atomicWriteFile } from "../../src/io/atomic.js";

const directories: string[] = [];

async function fixtureDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orgmd-init-"));
  directories.push(directory);
  return directory;
}

function input(target: string): InitInput {
  return {
    target,
    organizationName: "Example Cooperative",
    tone: "Plain and cautious",
    disputedTerms: ["customer", "approved"],
    policyText: "Agents must not publish customer data.",
    policyAction: "data.customer.publish",
    policyEffect: "deny",
    editorRole: "role.editor",
    policyOwner: "role.security",
    revisit: "2027-02-21",
    today: "2026-08-21",
  };
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("planInit", () => {
  it("plans exactly org.md, ownership.md, and policies.md", async () => {
    const target = join(await fixtureDir(), "bundle");

    const result = await planInit(input(target));

    expect(result.value?.files.map(({ relativePath }) => relativePath)).toEqual(
      ["org.md", "ownership.md", "policies.md"],
    );
  });

  it("renders a bundle that validates and has no blocking doctor finding", async () => {
    const target = join(await fixtureDir(), "bundle");
    const result = await planInit(input(target));

    expect(result.value).toBeDefined();
    expect(result.value?.files[0]?.content).toContain(
      "id: org.example-cooperative",
    );
    expect(result.value?.files[0]?.content).toContain(
      "`customer` — unratified",
    );
    expect(result.value?.files[0]?.content).toContain(
      "`approved` — unratified",
    );

    const writes = await writeInitPlan(result.value!);
    expect(writes.value).toEqual(["org.md", "ownership.md", "policies.md"]);
    const loaded = await loadBundle({ reference: target, isRoot: true });
    const validated =
      loaded.value && validateBundle(loaded.value, { isRoot: true });
    expect(validated?.value).toBeDefined();
    expect(
      validated?.value &&
        doctorBundle({
          bundle: validated.value,
          today: "2026-08-21",
        }).findings.filter(({ blocking }) => blocking),
    ).toEqual([]);
  });

  it("refuses an existing file before any write unless overwrite is explicit", async () => {
    const target = join(await fixtureDir(), "bundle");
    await mkdir(target);
    await writeFile(join(target, "org.md"), "preserve this", "utf8");

    const result = await planInit(input(target));

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "init.target-not-empty",
    );
    expect(await readFile(join(target, "org.md"), "utf8")).toBe(
      "preserve this",
    );
  });

  it("does not mutate a target when planning cannot validate the supplied values", async () => {
    const target = join(await fixtureDir(), "bundle");
    const invalid = { ...input(target), policyAction: "not valid" };

    const result = await planInit(invalid);

    expect(result.value).toBeUndefined();
    await expect(lstat(target)).rejects.toThrow();
  });

  it("rejects a traversal target before it creates a sibling bundle", async () => {
    const parent = await fixtureDir();
    const target = `${parent}/nested/../bundle`;

    const result = await planInit(input(target));

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "io.unsafe-path",
    );
    await expect(lstat(join(parent, "bundle"))).rejects.toThrow();
  });
});

describe("writeInitPlan", () => {
  it("writes the planned bundle as a completed directory with private files", async () => {
    const target = join(await fixtureDir(), "bundle");
    const plan = (await planInit(input(target))).value!;

    const result = await writeInitPlan(plan);

    expect(result.value).toEqual(["org.md", "ownership.md", "policies.md"]);
    expect((await lstat(join(target, "org.md"))).mode & 0o777).toBe(0o600);
  });

  it("leaves an overwrite target unchanged and cleans staging when file two fails", async () => {
    const parent = await fixtureDir();
    const target = join(parent, "bundle");
    await mkdir(target);
    await Promise.all(
      ["org.md", "ownership.md", "policies.md"].map((name) =>
        writeFile(join(target, name), `old ${name}`, "utf8"),
      ),
    );
    const plan = (await planInit({ ...input(target), overwrite: true })).value!;
    let writes = 0;

    const result = await writeInitPlan(plan, {
      writeFile: async (path, bytes, options) => {
        writes += 1;
        if (writes === 2) {
          return {
            diagnostics: [
              {
                code: "test.second-write",
                severity: "error",
                message: "simulated disk failure",
              },
            ],
          };
        }
        return atomicWriteFile(path, bytes, options);
      },
    });

    expect(result.value).toBeUndefined();
    expect(writes).toBe(2);
    await expect(readFile(join(target, "org.md"), "utf8")).resolves.toBe(
      "old org.md",
    );
    await expect(readFile(join(target, "ownership.md"), "utf8")).resolves.toBe(
      "old ownership.md",
    );
    expect(
      (await readdir(parent)).filter((name) => name.startsWith(".orgmd-init-")),
    ).toEqual([]);
  });
});
