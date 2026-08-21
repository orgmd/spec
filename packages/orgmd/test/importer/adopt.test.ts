import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planInit, writeInitPlan } from "../../src/init/init.js";
import { previewAdoption, writeAdoption } from "../../src/importer/adopt.js";
import type { InitInput } from "../../src/init/types.js";
import * as publicApi from "../../src/index.js";
import type { AdoptIo, AdoptWriteOptions } from "../../src/index.js";

const directories: string[] = [];

async function fixtureDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orgmd-adopt-"));
  directories.push(directory);
  return directory;
}

function initInput(target: string): InitInput {
  return {
    target,
    organizationName: "Example Cooperative",
    tone: "Plain and cautious",
    disputedTerms: [],
    policyText: "Agents must not publish customer data.",
    policyAction: "data.customer.publish",
    policyEffect: "deny",
    editorRole: "role.editor",
    policyOwner: "role.security",
    revisit: "2027-02-21",
    today: "2026-08-21",
  };
}

async function validTarget(): Promise<string> {
  const target = join(await fixtureDir(), "bundle");
  const plan = (await planInit(initInput(target))).value!;
  await writeInitPlan(plan);
  return target;
}

function confirmations(
  preview: NonNullable<ReturnType<typeof previewAdoption>["value"]>,
  byCandidateId: Record<string, Record<string, string>>,
) {
  return { previewId: preview.previewId, byCandidateId };
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("previewAdoption", () => {
  it("is side-effect free and shows the deterministic domain suggestion", async () => {
    const parent = await fixtureDir();
    const target = join(parent, "bundle");
    const sourcePath = join(parent, "AGENTS.md");
    await writeFile(sourcePath, "unchanged", "utf8");

    const preview = previewAdoption({
      sourcePath,
      sourceText: "# Terms\n\n- Customer means the contracting organisation.\n",
      target,
    });

    expect(preview.diagnostics).toEqual([]);
    expect(preview.value?.candidates).toMatchObject([
      {
        sourceHeading: "Terms",
        sourceText: "- Customer means the contracting organisation.\n",
        status: "draft",
        suggestedDomain: "glossary",
      },
    ]);
    expect(preview.value?.rendered).toContain("suggested domain: glossary");
    expect(preview.value?.previewId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(preview.value)).toBe(true);
    expect(Object.isFrozen(preview.value?.candidates[0])).toBe(true);
    expect(await readFile(sourcePath, "utf8")).toBe("unchanged");
    await expect(lstat(target)).rejects.toThrow();
  });

  it("returns required confirmations instead of inferring policy fields", () => {
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Policies\n\nNever upload secrets.\n",
    });

    expect(preview.value?.candidates[0]?.requiredInputs).toEqual([
      "domain",
      "owner",
      "scope",
    ]);
  });
});

describe("writeAdoption", () => {
  it("keeps incomplete policy candidates preview-only", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Policies\n\nNever upload secrets.\n",
      target,
    }).value!;
    const before = await readFile(join(target, "policies.md"), "utf8");

    const result = await writeAdoption(
      preview,
      confirmations(preview, {
        [preview.candidates[0]!.candidateId]: {
          domain: "policy",
          owner: "role.security",
          scope: "internal",
        },
      }),
    );

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "adopt.missing-confirmation",
    );
    expect(await readFile(join(target, "policies.md"), "utf8")).toBe(before);
  });

  it("writes confirmed drafts with the original source reference after validation", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "CLAUDE.md",
      sourceText: "# Terms\n\n- Customer means the contracting organisation.\n",
      target,
    }).value!;
    const candidate = preview.candidates[0]!;

    const result = await writeAdoption(
      preview,
      confirmations(preview, {
        [candidate.candidateId]: {
          domain: "glossary",
          owner: "role.editor",
          scope: "public",
        },
      }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual(["glossary.md"]);
    expect(await readFile(join(target, "glossary.md"), "utf8")).toBe(
      `---\nid: ${candidate.candidateId}\nowner: "role.editor"\nscope: "public"\nstatus: draft\nsource: native\nrev: 1\nref: "CLAUDE.md"\n---\n- Customer means the contracting organisation.\n`,
    );
  });

  it("preserves the candidate's CRLF source bytes in the draft body", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Terms\r\n\r\n```text\r\n  - literal marker\r\n```\r\n",
      target,
    }).value!;
    const candidate = preview.candidates[0]!;

    const result = await writeAdoption(
      preview,
      confirmations(preview, {
        [candidate.candidateId]: {
          domain: "glossary",
          owner: "role.editor",
          scope: "public",
        },
      }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(
      (await readFile(join(target, "glossary.md"), "utf8")).endsWith(
        "---\n```text\r\n  - literal marker\r\n```\r\n",
      ),
    ).toBe(true);
  });

  it("does not permit a source file to become an import output", async () => {
    const target = await validTarget();
    const sourcePath = join(target, "glossary.md");
    await writeFile(sourcePath, "source must remain untouched\n", "utf8");
    const preview = previewAdoption({
      sourcePath,
      sourceText: "# Terms\n\nCustomer means the contracting organisation.\n",
      target,
    }).value!;
    const before = await readFile(sourcePath, "utf8");

    const result = await writeAdoption(
      preview,
      confirmations(preview, {
        [preview.candidates[0]!.candidateId]: {
          domain: "glossary",
          owner: "role.editor",
          scope: "public",
        },
      }),
    );

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "adopt.source-inside-target",
    ]);
    expect(await readFile(sourcePath, "utf8")).toBe(before);
  });

  it("rejects stale, deserialized, and mutated preview objects", async () => {
    const target = await validTarget();
    const first = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Terms\n\n- First definition.\n",
      target,
    }).value!;
    const second = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Terms\n\n- Second definition.\n",
      target,
    }).value!;
    const base = confirmations(first, {
      [first.candidates[0]!.candidateId]: {
        domain: "glossary",
        owner: "role.editor",
        scope: "public",
      },
    });

    const stale = await writeAdoption(second, base);
    const deserialized = await writeAdoption(
      JSON.parse(JSON.stringify(first)),
      base,
    );
    const mutations = await Promise.all(
      [
        { ...first, target: join(target, "other") },
        { ...first, sourcePath: "other.md" },
        {
          ...first,
          candidates: first.candidates.map((candidate) => ({
            ...candidate,
            suggestedDomain: "policy" as const,
          })),
        },
      ].map((preview) => writeAdoption(preview, base)),
    );

    expect(stale.diagnostics.map(({ code }) => code)).toEqual([
      "adopt.stale-confirmation",
    ]);
    expect(deserialized.diagnostics.map(({ code }) => code)).toEqual([
      "adopt.untrusted-preview",
    ]);
    for (const result of mutations) {
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "adopt.untrusted-preview",
      ]);
    }
  });

  it("requires a valid confirmed domain and can override the suggestion", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Terms\n\n- Do not publish secrets.\n",
      target,
    }).value!;
    const id = preview.candidates[0]!.candidateId;

    const missing = await writeAdoption(
      preview,
      confirmations(preview, {
        [id]: { owner: "role.security", scope: "internal" },
      }),
    );
    const invalid = await writeAdoption(
      preview,
      confirmations(preview, {
        [id]: { domain: "decision", owner: "role.security", scope: "internal" },
      }),
    );
    const written = await writeAdoption(
      preview,
      confirmations(preview, {
        [id]: {
          domain: "policy",
          owner: "role.security",
          scope: "internal",
          revisit: "2027-02-21",
          action: "data.secret.publish",
          effect: "deny",
        },
      }),
    );

    expect(missing.diagnostics.map(({ code }) => code)).toContain(
      "adopt.missing-confirmation",
    );
    expect(invalid.diagnostics.map(({ code }) => code)).toEqual([
      "adopt.invalid-confirmation",
    ]);
    expect(written.value).toEqual(["policies.md"]);
    expect(await readFile(join(target, "policies.md"), "utf8")).toContain(
      'id: term.terms\nowner: "role.security"\nscope: "internal"\nstatus: draft',
    );
  });

  it("restores the full target when the single staged swap fails", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText:
        "# Terms\n\n- Definition.\n\n# Policies\n\n- Do not publish.\n",
      target,
    }).value!;
    const before = await Promise.all(
      ["org.md", "ownership.md", "policies.md"].map((path) =>
        readFile(join(target, path), "utf8"),
      ),
    );
    let renames = 0;

    const result = await writeAdoption(
      preview,
      confirmations(preview, {
        [preview.candidates[0]!.candidateId]: {
          domain: "glossary",
          owner: "role.editor",
          scope: "public",
        },
        [preview.candidates[1]!.candidateId]: {
          domain: "policy",
          owner: "role.security",
          scope: "internal",
          revisit: "2027-02-21",
          action: "data.publish",
          effect: "deny",
        },
      }),
      {
        io: {
          rename: async (from, to) => {
            renames += 1;
            if (renames === 2) throw new Error("swap failed");
            await rename(from, to);
          },
          remove: async (path) => rm(path, { recursive: true, force: true }),
          syncParent: async () => undefined,
        },
      },
    );

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "adopt.write-failed",
    ]);
    await expect(
      Promise.all(
        ["org.md", "ownership.md", "policies.md"].map((path) =>
          readFile(join(target, path), "utf8"),
        ),
      ),
    ).resolves.toEqual(before);
  });

  it("retains a recoverable backup if the staged-swap rollback fails", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Terms\n\n- Definition.\n",
      target,
    }).value!;
    let renames = 0;

    const result = await writeAdoption(
      preview,
      confirmations(preview, {
        [preview.candidates[0]!.candidateId]: {
          domain: "glossary",
          owner: "role.editor",
          scope: "public",
        },
      }),
      {
        io: {
          rename: async (from, to) => {
            renames += 1;
            if (renames === 2 || renames === 3)
              throw new Error("rollback failed");
            await rename(from, to);
          },
          remove: async (path) => rm(path, { recursive: true, force: true }),
          syncParent: async () => undefined,
        },
      },
    );

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "adopt.rollback-failed",
    ]);
    expect(
      (await readdir(dirname(target))).some((name) => name.endsWith(".backup")),
    ).toBe(true);
  });

  it("syncs durability boundaries for a successful single-directory swap", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Terms\n\n- Definition.\n",
      target,
    }).value!;
    const events: string[] = [];

    const result = await writeAdoption(
      preview,
      confirmations(preview, {
        [preview.candidates[0]!.candidateId]: {
          domain: "glossary",
          owner: "role.editor",
          scope: "public",
        },
      }),
      {
        io: {
          rename: async (from, to) => {
            events.push("rename");
            await rename(from, to);
          },
          remove: async (path) => {
            events.push("remove");
            await rm(path, { recursive: true, force: true });
          },
          syncParent: async () => events.push("sync"),
        },
      },
    );

    expect(result.diagnostics).toEqual([]);
    expect(events).toEqual([
      "rename",
      "sync",
      "rename",
      "sync",
      "remove",
      "sync",
    ]);
  });

  it("reports backup-removal failure as a post-commit warning and preserves recovery", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Terms\n\n- Definition.\n",
      target,
    }).value!;

    const result = await writeAdoption(
      preview,
      confirmations(preview, {
        [preview.candidates[0]!.candidateId]: {
          domain: "glossary",
          owner: "role.editor",
          scope: "public",
        },
      }),
      {
        io: {
          rename,
          remove: async () => {
            throw new Error("backup removal failed");
          },
          syncParent: async () => undefined,
        },
      },
    );

    expect(result.value).toEqual(["glossary.md"]);
    expect(
      result.diagnostics.map(({ code, severity }) => [code, severity]),
    ).toEqual([["adopt.cleanup-failed", "warning"]]);
    expect(await readFile(join(target, "glossary.md"), "utf8")).toContain(
      "- Definition.\n",
    );
    expect(
      (await readdir(dirname(target))).some((name) => name.endsWith(".backup")),
    ).toBe(true);
  });

  it("reports post-remove parent-sync failure as a warning after committing the target", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Terms\n\n- Definition.\n",
      target,
    }).value!;
    let syncs = 0;

    const result = await writeAdoption(
      preview,
      confirmations(preview, {
        [preview.candidates[0]!.candidateId]: {
          domain: "glossary",
          owner: "role.editor",
          scope: "public",
        },
      }),
      {
        io: {
          rename,
          remove: async (path) => rm(path, { recursive: true, force: true }),
          syncParent: async () => {
            syncs += 1;
            if (syncs === 3) throw new Error("cleanup sync failed");
          },
        },
      },
    );

    expect(result.value).toEqual(["glossary.md"]);
    expect(
      result.diagnostics.map(({ code, severity }) => [code, severity]),
    ).toEqual([["adopt.cleanup-failed", "warning"]]);
    expect(await readFile(join(target, "glossary.md"), "utf8")).toContain(
      "- Definition.\n",
    );
    expect(
      (await readdir(dirname(target))).some((name) => name.endsWith(".backup")),
    ).toBe(false);
  });

  it("rejects malformed public previews and confirmations without writing", async () => {
    const target = await validTarget();
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Terms\n\n- Definition.\n",
      target,
    }).value!;
    const before = await readFile(join(target, "policies.md"), "utf8");
    const id = preview.candidates[0]!.candidateId;
    const valid = confirmations(preview, {
      [id]: { domain: "glossary", owner: "role.editor", scope: "public" },
    });
    const hostileConfirmation = Object.defineProperty({}, "previewId", {
      get() {
        throw new Error("hostile getter");
      },
    });
    const malformedConfirmations: unknown[] = [
      null,
      [],
      {},
      { previewId: 4, byCandidateId: {} },
      { previewId: "not-a-digest", byCandidateId: {} },
      { previewId: preview.previewId },
      { previewId: preview.previewId, byCandidateId: { [id]: null } },
      {
        previewId: preview.previewId,
        byCandidateId: {
          [id]: { domain: "glossary", owner: 4, scope: "public" },
        },
      },
      hostileConfirmation,
    ];

    for (const malformed of malformedConfirmations) {
      const result = await writeAdoption(preview, malformed as never);
      expect(result.value).toBeUndefined();
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "adopt.invalid-confirmations",
      ]);
    }
    const hostilePreview = Object.defineProperty({}, "previewId", {
      get() {
        throw new Error("hostile getter");
      },
    });
    for (const malformed of [
      null,
      [],
      {},
      { previewId: 4 },
      { ...preview, previewId: "not-a-digest" },
      hostilePreview,
    ] as unknown[]) {
      const result = await writeAdoption(malformed as never, valid);
      expect(result.value).toBeUndefined();
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "adopt.invalid-preview",
      ]);
    }
    expect(
      previewAdoption(null as never).diagnostics.map(({ code }) => code),
    ).toEqual(["adopt.invalid-preview"]);
    expect(await readFile(join(target, "policies.md"), "utf8")).toBe(before);
  });

  it("rejects source aliases and source files inside the target before a directory swap", async () => {
    const target = await validTarget();
    const inside = join(target, "notes.md");
    const alias = join(await fixtureDir(), "source-alias.md");
    await writeFile(inside, "# Terms\n\n- Existing source.\n", "utf8");
    await symlink(join(target, "org.md"), alias);
    const preview = previewAdoption({
      sourcePath: inside,
      sourceText: "# Terms\n\n- Definition.\n",
      target,
    }).value!;
    const aliasPreview = previewAdoption({
      sourcePath: alias,
      sourceText: "# Terms\n\n- Definition.\n",
      target,
    }).value!;
    const fields = {
      domain: "glossary",
      owner: "role.editor",
      scope: "public",
    };

    const insideResult = await writeAdoption(
      preview,
      confirmations(preview, { [preview.candidates[0]!.candidateId]: fields }),
    );
    const aliasResult = await writeAdoption(
      aliasPreview,
      confirmations(aliasPreview, {
        [aliasPreview.candidates[0]!.candidateId]: {
          ...fields,
          domain: "identity",
        },
      }),
    );

    expect(insideResult.diagnostics.map(({ code }) => code)).toEqual([
      "adopt.source-inside-target",
    ]);
    expect(aliasResult.diagnostics.map(({ code }) => code)).toEqual([
      "adopt.source-inside-target",
    ]);
  });
});

describe("public adoption API", () => {
  it("exports the adoption API from the package root", () => {
    const io: AdoptIo = {
      rename,
      remove: async (path) => rm(path, { recursive: true, force: true }),
      syncParent: async () => undefined,
    };
    const options: AdoptWriteOptions = { io };
    expect(publicApi.previewAdoption).toBe(previewAdoption);
    expect(publicApi.writeAdoption).toBe(writeAdoption);
    expect(options.io).toBe(io);
  });
});
