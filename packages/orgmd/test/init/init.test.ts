import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
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
  it("renders the stable three-file scaffold and preview byte-for-byte", async () => {
    const target = join(await fixtureDir(), "bundle");

    const result = await planInit(input(target));

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.files).toEqual([
      {
        relativePath: "org.md",
        content:
          '---\nid: org.example-cooperative\nowner: "role.editor"\nscope: public\nstatus: approved\nsource: native\nrev: 1\nbundle: org.example-cooperative\n---\n# Example Cooperative\n\nTone: Plain and cautious\n\n## Contested terminology\n\n- `customer` — unratified\n- `approved` — unratified\n',
      },
      {
        relativePath: "ownership.md",
        content:
          '---\nid: own.last-resort\nowner: "role.editor"\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\nrole.editor is the last-resort owner for this bundle.\n\n---\nid: own.policy-owner\nowner: "role.security"\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\nrole.security owns the initial policy.\n',
      },
      {
        relativePath: "policies.md",
        content:
          '---\nid: pol.data-customer-publish\nowner: "role.security"\nscope: public\nstatus: approved\nsource: native\nrev: 1\naction: "data.customer.publish"\neffect: deny\nrevisit: "2027-02-21"\n---\nAgents must not publish customer data.\n',
      },
    ]);
    expect(result.value?.preview).toBe(
      '# org.md\n\n---\nid: org.example-cooperative\nowner: "role.editor"\nscope: public\nstatus: approved\nsource: native\nrev: 1\nbundle: org.example-cooperative\n---\n# Example Cooperative\n\nTone: Plain and cautious\n\n## Contested terminology\n\n- `customer` — unratified\n- `approved` — unratified\n\n# ownership.md\n\n---\nid: own.last-resort\nowner: "role.editor"\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\nrole.editor is the last-resort owner for this bundle.\n\n---\nid: own.policy-owner\nowner: "role.security"\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\nrole.security owns the initial policy.\n\n# policies.md\n\n---\nid: pol.data-customer-publish\nowner: "role.security"\nscope: public\nstatus: approved\nsource: native\nrev: 1\naction: "data.customer.publish"\neffect: deny\nrevisit: "2027-02-21"\n---\nAgents must not publish customer data.\n',
    );
  });

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

  it("rejects an ancestor symlink escape and a symlink target directory", async () => {
    const parent = await fixtureDir();
    const outside = await fixtureDir();
    const ancestor = join(parent, "outside-link");
    const targetLink = join(parent, "target-link");
    await symlink(outside, ancestor);
    await symlink(outside, targetLink);

    const ancestorResult = await planInit(input(join(ancestor, "bundle")));
    const targetResult = await planInit(input(targetLink));

    expect(ancestorResult.diagnostics.map(({ code }) => code)).toEqual([
      "io.symlink-target",
    ]);
    expect(targetResult.diagnostics.map(({ code }) => code)).toEqual([
      "io.symlink-target",
    ]);
    await expect(lstat(join(outside, "bundle"))).rejects.toThrow();
  });

  it("gates planning on the caller-injected doctor date", async () => {
    const target = join(await fixtureDir(), "bundle");

    const result = await planInit({
      ...input(target),
      revisit: "2026-08-20",
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "doctor.overdue-revisit",
    ]);
  });

  it("renders an escalation route only for an escalation policy", async () => {
    const target = join(await fixtureDir(), "bundle");

    const result = await planInit({
      ...input(target),
      policyEffect: "escalate",
      policyRoute: "own.last-resort",
    });

    expect(result.value?.files[2]?.content).toBe(
      '---\nid: pol.data-customer-publish\nowner: "role.security"\nscope: public\nstatus: approved\nsource: native\nrev: 1\naction: "data.customer.publish"\neffect: escalate\nroute: "own.last-resort"\nrevisit: "2027-02-21"\n---\nAgents must not publish customer data.\n',
    );
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

  it("refuses overwrite when the existing bundle contains an unexpected file", async () => {
    const target = join(await fixtureDir(), "bundle");
    await mkdir(target);
    await Promise.all(
      ["org.md", "ownership.md", "policies.md", "notes.md"].map((name) =>
        writeFile(join(target, name), `old ${name}`, "utf8"),
      ),
    );

    const result = await planInit({ ...input(target), overwrite: true });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "init.target-not-empty",
    ]);
    expect(await readFile(join(target, "notes.md"), "utf8")).toBe(
      "old notes.md",
    );
  });

  it("replaces exactly the approved overwrite file set and syncs each rename", async () => {
    const target = join(await fixtureDir(), "bundle");
    await mkdir(target);
    await Promise.all(
      ["org.md", "ownership.md", "policies.md"].map((name) =>
        writeFile(join(target, name), `old ${name}`, "utf8"),
      ),
    );
    const plan = (await planInit({ ...input(target), overwrite: true })).value!;
    const events: string[] = [];

    const result = await writeInitPlan(plan, {
      io: {
        rename: async (from, to) => {
          events.push(`rename:${from === target ? "old" : "new"}`);
          await rename(from, to);
        },
        remove: async (path) => {
          events.push("remove:backup");
          await rm(path, { recursive: true, force: true });
        },
        syncParent: async () => events.push("sync:parent"),
      },
    });

    expect(result.value).toEqual(["org.md", "ownership.md", "policies.md"]);
    expect(events).toEqual([
      "rename:old",
      "sync:parent",
      "rename:new",
      "sync:parent",
      "remove:backup",
      "sync:parent",
    ]);
    await expect(readFile(join(target, "org.md"), "utf8")).resolves.toBe(
      plan.files[0]?.content,
    );
  });

  it("restores the old bundle after a failed swap", async () => {
    const parent = await fixtureDir();
    const target = join(parent, "bundle");
    await mkdir(target);
    await Promise.all(
      ["org.md", "ownership.md", "policies.md"].map((name) =>
        writeFile(join(target, name), `old ${name}`, "utf8"),
      ),
    );
    const plan = (await planInit({ ...input(target), overwrite: true })).value!;
    let renameCount = 0;
    const events: string[] = [];

    const result = await writeInitPlan(plan, {
      io: {
        rename: async (from, to) => {
          renameCount += 1;
          events.push(`rename:${renameCount}`);
          if (renameCount === 2) throw new Error("swap failed");
          await rename(from, to);
        },
        remove: async (path) => rm(path, { recursive: true, force: true }),
        syncParent: async () => events.push("sync:parent"),
      },
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "init.write-failed",
    ]);
    expect(events).toEqual([
      "rename:1",
      "sync:parent",
      "rename:2",
      "rename:3",
      "sync:parent",
    ]);
    await expect(readFile(join(target, "org.md"), "utf8")).resolves.toBe(
      "old org.md",
    );
    expect(
      (await readdir(parent)).filter((name) => name.startsWith(".orgmd-init-")),
    ).toEqual([]);
  });

  it("keeps the backup recoverable when both swap and rollback fail", async () => {
    const parent = await fixtureDir();
    const target = join(parent, "bundle");
    await mkdir(target);
    await Promise.all(
      ["org.md", "ownership.md", "policies.md"].map((name) =>
        writeFile(join(target, name), `old ${name}`, "utf8"),
      ),
    );
    const plan = (await planInit({ ...input(target), overwrite: true })).value!;
    let renameCount = 0;

    const result = await writeInitPlan(plan, {
      io: {
        rename: async (from, to) => {
          renameCount += 1;
          if (renameCount === 2 || renameCount === 3)
            throw new Error("simulated rename failure");
          await rename(from, to);
        },
        remove: async (path) => rm(path, { recursive: true, force: true }),
        syncParent: async () => undefined,
      },
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "init.rollback-failed",
    ]);
    await expect(lstat(target)).rejects.toThrow();
    const backups = (await readdir(parent)).filter((name) =>
      name.endsWith(".backup"),
    );
    expect(backups).toHaveLength(1);
    await expect(
      readFile(join(parent, backups[0]!, "org.md"), "utf8"),
    ).resolves.toBe("old org.md");
  });
});
