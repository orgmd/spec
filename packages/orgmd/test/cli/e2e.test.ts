import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const directories: string[] = [];
const bin = new URL("../../dist/cli/bin.js", import.meta.url);

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orgmd-cli-e2e-"));
  directories.push(directory);
  return directory;
}

async function cli(...argv: string[]) {
  return execFileAsync(process.execPath, [bin.pathname, ...argv], {
    cwd: new URL("../../../..", import.meta.url).pathname,
    encoding: "utf8",
  });
}

async function failedCli(...argv: string[]) {
  try {
    await cli(...argv);
    throw new Error("Expected command to fail.");
  } catch (error) {
    return error as NodeJS.ErrnoException & {
      readonly stdout: string;
      readonly stderr: string;
    };
  }
}

beforeAll(async () => {
  await execFileAsync("npm", ["run", "build"], {
    cwd: new URL("../../../..", import.meta.url).pathname,
  });
});
afterAll(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("orgmd executable", () => {
  it("does not expose an unnamed bundle's physical checkout path in projection metadata", async () => {
    const bundle = join(await temporaryDirectory(), "relocatable-bundle");
    await (await import("node:fs/promises")).mkdir(bundle);
    await writeFile(
      join(bundle, "org.md"),
      "---\nid: org.identity\nowner: role.editor\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\nRelocatable org.\n",
      "utf8",
    );
    await writeFile(
      join(bundle, "ownership.md"),
      "---\nid: own.last-resort\nowner: role.editor\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\nrole.editor is the owner of last resort.\n",
      "utf8",
    );

    const compiled = await cli(
      "compile",
      bundle,
      "--target",
      "prompt",
      "--today",
      "2026-08-21",
    );

    expect(compiled.stdout).toContain("bundles: root=sha256:");
    expect(compiled.stdout).not.toContain(bundle);
  });

  it("rejects impossible --today values before doctor and compile filesystem work", async () => {
    for (const argv of [
      ["doctor", "/not/loaded", "--today", "2026-13-01"],
      ["compile", "/not/loaded", "--target", "prompt", "--today", "2026-02-30"],
    ]) {
      const failure = await failedCli(...argv);
      expect(failure.code).toBe(2);
      expect(failure.stdout).toBe("");
      expect(failure.stderr).toBe(
        "error cli.invalid-date: A valid --today YYYY-MM-DD is required.\n",
      );
    }
    const json = await failedCli(
      "doctor",
      "/not/loaded",
      "--today",
      "2026-02-30",
      "--json",
    );
    expect(JSON.parse(json.stdout)).toMatchObject({
      command: "doctor",
      ok: false,
      diagnostics: [{ code: "cli.invalid-date" }],
    });
    expect(json.stderr).toBe("");
  });

  it("has a node shebang and initializes by preview unless --write is explicit", async () => {
    expect(
      (await readFile(bin, "utf8")).startsWith("#!/usr/bin/env node"),
    ).toBe(true);
    const target = join(await temporaryDirectory(), "bundle");
    const preview = await cli(
      "init",
      target,
      "--non-interactive",
      "--organization",
      "E2E Org",
      "--tone",
      "plain",
      "--policy",
      "Do not publish.",
      "--action",
      "data.publish",
      "--effect",
      "deny",
      "--editor",
      "role.editor",
      "--owner",
      "role.security",
      "--revisit",
      "2027-01-01",
      "--today",
      "2026-08-21",
    );
    expect(preview.stdout).toContain("# org.md");
    await expect(cli("validate", target)).rejects.toMatchObject({ code: 2 });
    await cli(
      "init",
      target,
      "--non-interactive",
      "--organization",
      "E2E Org",
      "--tone",
      "plain",
      "--policy",
      "Do not publish.",
      "--action",
      "data.publish",
      "--effect",
      "deny",
      "--editor",
      "role.editor",
      "--owner",
      "role.security",
      "--revisit",
      "2027-01-01",
      "--today",
      "2026-08-21",
      "--write",
    );
    await expect(
      cli(
        "init",
        target,
        "--non-interactive",
        "--organization",
        "E2E Org",
        "--tone",
        "plain",
        "--policy",
        "Do not publish.",
        "--action",
        "data.publish",
        "--effect",
        "deny",
        "--editor",
        "role.editor",
        "--owner",
        "role.security",
        "--revisit",
        "2027-01-01",
        "--today",
        "2026-08-21",
        "--write",
      ),
    ).rejects.toMatchObject({ code: 1 });
    expect((await cli("validate", target, "--json")).stdout).toContain(
      '"command":"validate"',
    );
    const doctor = await cli("doctor", target, "--today", "2026-08-21");
    expect(doctor.stdout).toBe("");
    expect(doctor.stderr).toContain("doctor.revisit-recommended");
    const output = join(await temporaryDirectory(), "out");
    await (await import("node:fs/promises")).mkdir(output);
    await cli(
      "compile",
      target,
      "--all",
      "--today",
      "2026-08-21",
      "--output",
      output,
    );
    expect(await readFile(join(output, "AGENTS.orgmd.md"), "utf8")).toContain(
      "orgmd:begin",
    );
    expect(await readFile(join(output, "orgmd-prompt.txt"), "utf8")).toContain(
      "orgmd-prompt-v1",
    );
    const source = join(await temporaryDirectory(), "AGENTS.md");
    await writeFile(
      source,
      "# Terms\n\n- Customer means the contracting organization.\n",
      "utf8",
    );
    const adoptionPreview = await cli("adopt", source, target);
    expect(adoptionPreview.stdout).toContain("# term.terms");

    await cli(
      "adopt",
      source,
      target,
      "--write",
      "--confirm",
      "term.terms.domain=glossary",
      "--confirm",
      "term.terms.owner=role.editor",
      "--confirm",
      "term.terms.scope=public",
    );
    expect(await readFile(join(target, "glossary.md"), "utf8")).toContain(
      "id: term.terms",
    );

    const unknownField = await failedCli(
      "adopt",
      source,
      target,
      "--write",
      "--confirm",
      "term.bogus=value",
    );
    expect(unknownField.code).toBe(2);
    expect(unknownField.stderr).toContain("candidateId.field=value");
  });
});
