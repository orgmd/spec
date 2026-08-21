import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planInit, writeInitPlan } from "../../src/init/init.js";
import { previewAdoption, writeAdoption } from "../../src/importer/adopt.js";
import type { InitInput } from "../../src/init/types.js";

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
        sourceText: "Customer means the contracting organisation.",
        status: "draft",
        suggestedDomain: "glossary",
      },
    ]);
    expect(preview.value?.rendered).toContain("suggested domain: glossary");
    expect(await readFile(sourcePath, "utf8")).toBe("unchanged");
    await expect(lstat(target)).rejects.toThrow();
  });

  it("returns required confirmations instead of inferring policy fields", () => {
    const preview = previewAdoption({
      sourcePath: "AGENTS.md",
      sourceText: "# Policies\n\nNever upload secrets.\n",
    });

    expect(preview.value?.candidates[0]?.requiredInputs).toEqual([
      "owner",
      "scope",
      "revisit",
      "action",
      "effect",
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

    const result = await writeAdoption(preview, {
      byCandidateId: {
        [preview.candidates[0]!.candidateId]: {
          owner: "role.security",
          scope: "internal",
        },
      },
    });

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

    const result = await writeAdoption(preview, {
      byCandidateId: {
        [candidate.candidateId]: {
          owner: "role.editor",
          scope: "public",
        },
      },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual(["glossary.md"]);
    expect(await readFile(join(target, "glossary.md"), "utf8")).toBe(
      `---\nid: ${candidate.candidateId}\nowner: "role.editor"\nscope: "public"\nstatus: draft\nsource: native\nrev: 1\nref: "CLAUDE.md"\n---\nCustomer means the contracting organisation.\n`,
    );
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

    const result = await writeAdoption(preview, {
      byCandidateId: {
        [preview.candidates[0]!.candidateId]: {
          owner: "role.editor",
          scope: "public",
        },
      },
    });

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "adopt.source-output-conflict",
    ]);
    expect(await readFile(sourcePath, "utf8")).toBe(before);
  });
});
