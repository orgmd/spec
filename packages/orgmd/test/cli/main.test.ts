import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, type CliIo } from "../../src/cli/main.js";

const directories: string[] = [];

function memoryIo(
  cwd = process.cwd(),
): CliIo & { stdoutText: () => string; stderrText: () => string } {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let stdoutText = "";
  let stderrText = "";
  stdout.setEncoding("utf8");
  stderr.setEncoding("utf8");
  stdout.on("data", (chunk: string) => {
    stdoutText += chunk;
  });
  stderr.on("data", (chunk: string) => {
    stderrText += chunk;
  });
  return {
    cwd,
    stdin: new PassThrough(),
    stdout,
    stderr,
    env: {},
    stdoutText: () => stdoutText,
    stderrText: () => stderrText,
  };
}

async function invalidBundle(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orgmd-cli-"));
  directories.push(directory);
  await writeFile(
    join(directory, "org.md"),
    "---\nid: bad\n---\n# invalid\n",
    "utf8",
  );
  return directory;
}

function initArgs(target: string, overrides: readonly string[] = []): string[] {
  return [
    "init",
    target,
    "--non-interactive",
    "--organization",
    "Example Org",
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
    ...overrides,
  ];
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("runCli", () => {
  it.each([
    [[], 2],
    [["unknown"], 2],
    [["compile", "--target", "agents-md", "--all"], 2],
  ])("returns invocation failure for %j", async (argv, expected) => {
    expect(await runCli(argv, memoryIo())).toBe(expected);
  });

  it("emits stable JSON diagnostics", async () => {
    const io = memoryIo();
    expect(
      await runCli(["validate", await invalidBundle(), "--json"], io),
    ).toBe(1);
    expect(JSON.parse(io.stdoutText())).toMatchObject({
      command: "validate",
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "invalid_entry" }),
      ]),
    });
    expect(io.stderrText()).toBe("");
  });

  it("keeps a single compilation projection free of framing", async () => {
    const io = memoryIo();
    expect(
      await runCli(
        [
          "compile",
          await invalidBundle(),
          "--target",
          "prompt",
          "--today",
          "2026-08-21",
        ],
        io,
      ),
    ).toBe(1);
    expect(io.stdoutText()).toBe("");
    expect(io.stderrText()).toContain("invalid_entry");
  });

  it("maps an unreadable bundle path to operational exit code 2", async () => {
    const io = memoryIo();
    expect(
      await runCli(["validate", "/definitely/not/an/orgmd-bundle"], io),
    ).toBe(2);
    expect(io.stderrText()).toContain("bundle.invalid-reference");
  });

  it("rejects malformed today before doctor or compile loads a path", async () => {
    for (const argv of [
      ["doctor", "/not/loaded", "--today", "2026-13-01"],
      ["compile", "/not/loaded", "--target", "prompt", "--today", "2026-02-29"],
    ]) {
      const io = memoryIo();
      expect(await runCli(argv, io)).toBe(2);
      expect(io.stdoutText()).toBe("");
      expect(io.stderrText()).toBe(
        "error cli.invalid-date: A valid --today YYYY-MM-DD is required.\n",
      );
    }
  });

  it("uses JSON for malformed today diagnostics", async () => {
    const io = memoryIo();
    expect(
      await runCli(
        ["doctor", "/not/loaded", "--today", "2026-02-30", "--json"],
        io,
      ),
    ).toBe(2);
    expect(JSON.parse(io.stdoutText())).toEqual({
      command: "doctor",
      ok: false,
      diagnostics: [
        {
          code: "cli.invalid-date",
          severity: "error",
          message: "A valid --today YYYY-MM-DD is required.",
        },
      ],
    });
    expect(io.stderrText()).toBe("");
  });

  it("maps init operational diagnostics to exit 2", async () => {
    const parent = await mkdtemp(join(tmpdir(), "orgmd-cli-"));
    directories.push(parent);
    for (const target of [
      join(parent, "missing", "bundle"),
      `${parent}/nested/../bundle`,
    ]) {
      const io = memoryIo();
      expect(await runCli(initArgs(target), io)).toBe(2);
      expect(io.stdoutText()).toBe("");
    }
  });

  it("keeps semantic init rejection at exit 1 and supports preview then write", async () => {
    const parent = await mkdtemp(join(tmpdir(), "orgmd-cli-"));
    directories.push(parent);
    const target = join(parent, "bundle");
    const semantic = memoryIo();
    expect(
      await runCli(initArgs(target, ["--action", "not valid"]), semantic),
    ).toBe(1);
    expect(semantic.stderrText()).toContain("invalid_action");
    const preview = memoryIo();
    expect(await runCli(initArgs(target), preview)).toBe(0);
    expect(preview.stdoutText()).toContain("# org.md");
    const written = memoryIo();
    expect(await runCli(initArgs(target, ["--write"]), written)).toBe(0);
    expect(written.stdoutText()).toContain("init: wrote");
  });
});
