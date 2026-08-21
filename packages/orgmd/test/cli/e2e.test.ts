import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const directories: string[] = [];
const packageRoot = new URL("../..", import.meta.url);
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

beforeAll(async () => {
  await execFileAsync("npm", ["run", "build"], { cwd: packageRoot.pathname });
});
afterAll(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("orgmd executable", () => {
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
    expect((await cli("adopt", source, target)).stdout).toContain(
      "status: draft",
    );
  });
});
