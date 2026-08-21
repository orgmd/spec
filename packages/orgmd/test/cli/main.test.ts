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
});
