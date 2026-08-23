import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, type CliIo } from "../../src/cli/main.js";

const directories: string[] = [];

function memoryIo(
  cwd = process.cwd(),
  stdinText?: string,
): CliIo & { stdoutText: () => string; stderrText: () => string } {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
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
  if (stdinText !== undefined) stdin.end(stdinText);
  return {
    cwd,
    stdin,
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

async function validBundle(
  directory: string,
  options: {
    readonly unknownFile?: boolean;
    readonly paymentBody?: string;
  } = {},
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "org.md"),
    "---\nid: org.identity\nowner: role.editor\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\nFixture org.\n",
    "utf8",
  );
  await writeFile(
    join(directory, "ownership.md"),
    `---\nid: own.last-resort\nowner: role.editor\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\nLast resort.\n${
      options.paymentBody === undefined
        ? ""
        : `\n---\nid: own.payments\nowner: role.editor\nscope: public\nstatus: approved\nsource: native\nrev: 1\n---\n${options.paymentBody}\n`
    }`,
    "utf8",
  );
  if (options.unknownFile)
    await writeFile(join(directory, "notes.md"), "ignored\n", "utf8");
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

  it("renders successful validation, doctor, and compile diagnostics without contaminating projection stdout", async () => {
    const parent = await mkdtemp(join(tmpdir(), "orgmd-cli-"));
    directories.push(parent);
    const target = join(parent, "bundle");
    await validBundle(target, { unknownFile: true });

    const validation = memoryIo();
    expect(await runCli(["validate", target], validation)).toBe(0);
    expect(validation.stdoutText()).toBe("validate: ok\n");
    expect(validation.stderrText()).toContain("bundle.unknown-file");

    const health = memoryIo();
    expect(
      await runCli(["doctor", target, "--today", "2026-08-21"], health),
    ).toBe(0);
    expect(health.stderrText()).toContain("bundle.unknown-file");
    expect(health.stderrText()).toContain("doctor.revisit-recommended");

    const compilation = memoryIo();
    expect(
      await runCli(
        ["compile", target, "--target", "prompt", "--today", "2026-08-21"],
        compilation,
      ),
    ).toBe(0);
    expect(compilation.stdoutText()).toContain("[ORG.md advisory context]");
    expect(compilation.stdoutText()).not.toContain("bundle.unknown-file");
    expect(compilation.stderrText()).toContain("bundle.unknown-file");
  });

  it("treats error diagnostics as blocking before compilation", async () => {
    const parent = await mkdtemp(join(tmpdir(), "orgmd-cli-"));
    directories.push(parent);
    const child = join(parent, "division");
    await validBundle(parent, { paymentBody: "Board owns payments." });
    await validBundle(child, { paymentBody: "Division owns payments." });
    const io = memoryIo();

    expect(
      await runCli(
        ["compile", child, "--target", "prompt", "--today", "2026-08-21"],
        io,
      ),
    ).toBe(1);
    expect(io.stdoutText()).toBe("");
    expect(io.stderrText()).toContain("resolution.unauthorised-shadow");
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

  it("maps adoption target failures through the common operational classifier", async () => {
    const parent = await mkdtemp(join(tmpdir(), "orgmd-cli-"));
    directories.push(parent);
    const source = join(parent, "AGENTS.md");
    await writeFile(
      source,
      "# Terms\n\n- Customer means the contracting organisation.\n",
      "utf8",
    );
    const io = memoryIo();

    expect(
      await runCli(
        [
          "adopt",
          source,
          join(parent, "missing-target"),
          "--write",
          "--confirm",
          "term.terms.domain=glossary",
          "--confirm",
          "term.terms.owner=role.editor",
          "--confirm",
          "term.terms.scope=public",
        ],
        io,
      ),
    ).toBe(2);
    expect(io.stderrText()).toContain("adopt.invalid-target");
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

  it("prompts through CliIo.stdin and confirms an interactive write", async () => {
    const parent = await mkdtemp(join(tmpdir(), "orgmd-cli-"));
    directories.push(parent);
    const target = join(parent, "interactive-bundle");
    const io = memoryIo(
      parent,
      [
        "Interactive Org",
        "plain and cautious",
        "customer, approved",
        "Do not publish customer data.",
        "data.customer.publish",
        "deny",
        "role.editor",
        "role.security",
        "2027-02-21",
        "2026-08-21",
        "yes",
      ].join("\n") + "\n",
    );

    expect(await runCli(["init", target, "--write"], io)).toBe(0);
    expect(io.stderrText()).toContain("Organisation name:");
    expect(io.stderrText()).toContain("Write these files? [y/N]:");
    expect(io.stdoutText()).toContain("# org.md");
    expect(io.stdoutText()).toContain("init: wrote");
    expect(await readFile(join(target, "org.md"), "utf8")).toContain(
      "# Interactive Org",
    );
  });
});
