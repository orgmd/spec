import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileContext } from "../compiler/compile.js";
import { doctorBundle, doctorExitCode } from "../doctor/doctor.js";
import { safeExplicitPath, atomicWriteFile } from "../io/atomic.js";
import { previewAdoption, writeAdoption } from "../importer/adopt.js";
import { planInit, writeInitPlan } from "../init/init.js";
import { resolveContext } from "../resolver/resolve.js";
import { validateBundlePath } from "../validation/validate.js";
import { ORGMD_VERSION } from "../version.js";
import { parseCommand, type ParsedCommand } from "./args.js";
import { discoverCompilePath } from "./discovery.js";
import { HELP, renderDiagnostics, renderJson } from "./render.js";
import type { CliExitCode, CliIo } from "./types.js";

export type { CliExitCode, CliIo } from "./types.js";

export async function runCli(
  argv: readonly string[],
  io: CliIo,
): Promise<CliExitCode> {
  try {
    return await dispatch(parseCommand(argv), io);
  } catch (error) {
    const detail =
      io.env.ORGMD_DEBUG === "1" && error instanceof Error && error.stack
        ? `\n${error.stack}`
        : "";
    write(
      io.stderr,
      `error cli.internal: orgmd could not complete the requested operation.${detail}\n`,
    );
    return 2;
  }
}

async function dispatch(
  parsed: ParsedCommand,
  io: CliIo,
): Promise<CliExitCode> {
  if (parsed.kind === "help") {
    write(io.stdout, HELP);
    return 0;
  }
  if (parsed.kind === "version") {
    write(io.stdout, `${ORGMD_VERSION}\n`);
    return 0;
  }
  if (parsed.kind === "usage") {
    write(
      io.stderr,
      `error cli.usage: ${parsed.message ?? "Invalid invocation."}\n${HELP}`,
    );
    return 2;
  }
  switch (parsed.command) {
    case "validate":
      return validate(parsed.path ?? io.cwd, parsed.json, io);
    case "compile":
      return compile(parsed, io);
    case "doctor":
      return doctor(parsed.path ?? io.cwd, parsed.today, parsed.json, io);
    case "init":
      return initialize(parsed, io);
    case "adopt":
      return adopt(parsed, io);
  }
}

async function validate(
  path: string,
  json: boolean,
  io: CliIo,
): Promise<CliExitCode> {
  const result = await validateBundlePath(resolve(io.cwd, path), {
    isRoot: true,
  });
  const ok = result.value !== undefined;
  report("validate", ok, result.diagnostics, json, io);
  return ok ? 0 : exitForDiagnostics(result.diagnostics);
}

async function doctor(
  path: string,
  today: string | undefined,
  json: boolean,
  io: CliIo,
): Promise<CliExitCode> {
  if (!today)
    return invocation("doctor requires an explicit --today YYYY-MM-DD.", io);
  const result = await validateBundlePath(resolve(io.cwd, path), {
    isRoot: true,
  });
  if (!result.value) {
    report("doctor", false, result.diagnostics, json, io);
    return exitForDiagnostics(result.diagnostics);
  }
  const reportValue = doctorBundle({ bundle: result.value, today });
  const code = doctorExitCode(reportValue);
  if (json)
    write(
      io.stdout,
      renderJson("doctor", code === 0, reportValue.findings, {
        ratios: reportValue.ratios,
        pendingRevisions: reportValue.pendingRevisions,
      }),
    );
  else if (reportValue.findings.length === 0) write(io.stdout, "doctor: ok\n");
  else write(io.stderr, renderDiagnostics(reportValue.findings));
  return code;
}

async function compile(
  parsed: Extract<ParsedCommand, { kind: "command"; command: "compile" }>,
  io: CliIo,
): Promise<CliExitCode> {
  if (!parsed.today)
    return invocation("compile requires an explicit --today YYYY-MM-DD.", io);
  const found = await discoverCompilePath(
    resolve(io.cwd, parsed.path ?? io.cwd),
  );
  if (!found.value) {
    report("compile", false, found.diagnostics, parsed.json, io, {
      path: found.paths,
    });
    return exitForDiagnostics(found.diagnostics);
  }
  const resolution = resolveContext({
    path: found.value,
    clearance: parsed.clearance ?? ["public"],
    today: parsed.today,
  });
  if (!resolution.value) {
    report("compile", false, resolution.diagnostics, parsed.json, io, {
      path: found.paths,
    });
    return 1;
  }
  const targets = parsed.all
    ? (["agents-md", "prompt"] as const)
    : [parsed.target!];
  const projections = targets.map((target) =>
    compileContext(resolution.value!, target),
  );
  const diagnostics = projections.flatMap(({ diagnostics }) => diagnostics);
  if (diagnostics.some(({ severity }) => severity === "error")) {
    report("compile", false, diagnostics, parsed.json, io, {
      path: found.paths,
    });
    return 1;
  }
  const values = projections.flatMap(({ value }) =>
    value === undefined ? [] : [value],
  );
  if (parsed.output) {
    const output = resolve(io.cwd, parsed.output);
    const safety = await safeExplicitPath(output);
    if (safety) {
      report("compile", false, [safety], parsed.json, io);
      return 2;
    }
    try {
      if (!(await lstat(output)).isDirectory()) throw new Error();
    } catch {
      return invocation("--output must name an existing directory.", io);
    }
    const files = values.map((value) => ({
      path: resolve(
        output,
        value.target === "agents-md" ? "AGENTS.orgmd.md" : "orgmd-prompt.txt",
      ),
      content: value.content,
    }));
    for (const file of files) {
      const written = await atomicWriteFile(
        file.path,
        new TextEncoder().encode(file.content),
        { overwrite: true, mode: 0o600 },
      );
      if (written.diagnostics.some(({ severity }) => severity === "error")) {
        report("compile", false, written.diagnostics, parsed.json, io);
        return 2;
      }
    }
    if (parsed.json)
      write(
        io.stdout,
        renderJson("compile", true, [], {
          path: found.paths,
          files: files.map(({ path }) => path),
        }),
      );
    else
      write(
        io.stdout,
        `compile: wrote ${files.map(({ path }) => path).join(", ")}\n`,
      );
    return 0;
  }
  if (parsed.json) {
    write(
      io.stdout,
      renderJson("compile", true, [], {
        path: found.paths,
        projections: values,
      }),
    );
    return 0;
  }
  if (values.length === 1) write(io.stdout, values[0]!.content);
  else
    write(
      io.stdout,
      values
        .map((value) => `=== ${value.target} ===\n${value.content}`)
        .join("\n"),
    );
  return 0;
}

async function initialize(
  parsed: Extract<ParsedCommand, { kind: "command"; command: "init" }>,
  io: CliIo,
): Promise<CliExitCode> {
  const input = parsed.init ?? {};
  const required = [
    "organization",
    "tone",
    "policy",
    "action",
    "effect",
    "editor",
    "owner",
    "revisit",
    "today",
  ] as const;
  if (required.some((key) => !input[key]))
    return invocation(
      `init requires ${required.map((key) => `--${key}`).join(", ")} with --non-interactive.`,
      io,
    );
  const effect = input.effect;
  if (effect !== "allow" && effect !== "escalate" && effect !== "deny")
    return invocation("--effect must be allow, escalate, or deny.", io);
  if (effect === "escalate" && !input.route)
    return invocation("--route is required when --effect is escalate.", io);
  const result = await planInit({
    target: resolve(io.cwd, parsed.path ?? io.cwd),
    organizationName: input.organization!,
    tone: input.tone!,
    disputedTerms: input.terms
      ? input.terms
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    policyText: input.policy!,
    policyAction: input.action!,
    policyEffect: effect,
    ...(input.route ? { policyRoute: input.route } : {}),
    editorRole: input.editor!,
    policyOwner: input.owner!,
    revisit: input.revisit!,
    today: input.today!,
    overwrite: parsed.overwrite === true,
  });
  if (!result.value) {
    report("init", false, result.diagnostics, parsed.json, io);
    return 1;
  }
  if (!parsed.write || parsed.preview) {
    if (parsed.json)
      write(
        io.stdout,
        renderJson("init", true, [], { preview: result.value.preview }),
      );
    else write(io.stdout, result.value.preview);
    return 0;
  }
  const written = await writeInitPlan(result.value);
  if (!written.value) {
    report("init", false, written.diagnostics, parsed.json, io);
    return 1;
  }
  if (parsed.json)
    write(
      io.stdout,
      renderJson("init", true, written.diagnostics, { files: written.value }),
    );
  else write(io.stdout, `init: wrote ${written.value.join(", ")}\n`);
  return 0;
}

async function adopt(
  parsed: Extract<ParsedCommand, { kind: "command"; command: "adopt" }>,
  io: CliIo,
): Promise<CliExitCode> {
  const source = resolve(io.cwd, parsed.source!);
  let sourceText: string;
  try {
    sourceText = await readFile(source, "utf8");
  } catch {
    return invocation("adopt source must be a readable regular file.", io);
  }
  const preview = previewAdoption({
    sourcePath: source,
    sourceText,
    ...(parsed.path ? { target: resolve(io.cwd, parsed.path) } : {}),
  });
  if (!preview.value) {
    report("adopt", false, preview.diagnostics, parsed.json, io);
    return 1;
  }
  if (!parsed.write) {
    if (parsed.json)
      write(
        io.stdout,
        renderJson("adopt", true, [], { preview: preview.value }),
      );
    else write(io.stdout, preview.value.rendered);
    return 0;
  }
  const confirmations = parseConfirmations(
    preview.value.previewId,
    parsed.confirmations ?? [],
  );
  if (!confirmations)
    return invocation("--confirm values must be candidateId.field=value.", io);
  const result = await writeAdoption(preview.value, confirmations);
  if (!result.value) {
    report("adopt", false, result.diagnostics, parsed.json, io);
    return 1;
  }
  if (parsed.json)
    write(
      io.stdout,
      renderJson("adopt", true, result.diagnostics, { files: result.value }),
    );
  else write(io.stdout, `adopt: wrote ${result.value.join(", ")}\n`);
  return 0;
}

function parseConfirmations(previewId: string, values: readonly string[]) {
  const byCandidateId: Record<string, Record<string, string>> = {};
  for (const value of values) {
    const match = /^([^.=]+)\.([a-z]+)=(.*)$/u.exec(value);
    if (!match) return undefined;
    const [, id, field, confirmation] = match;
    if (!id || !field || confirmation === undefined) return undefined;
    (byCandidateId[id] ??= {})[field] = confirmation;
  }
  return { previewId, byCandidateId };
}

function report(
  command: string,
  ok: boolean,
  diagnostics: readonly import("../diagnostics/types.js").Diagnostic[],
  json: boolean,
  io: CliIo,
  extra: Readonly<Record<string, unknown>> = {},
): void {
  if (json) write(io.stdout, renderJson(command, ok, diagnostics, extra));
  else if (ok) write(io.stdout, `${command}: ok\n`);
  else write(io.stderr, renderDiagnostics(diagnostics));
}
function invocation(message: string, io: CliIo): 2 {
  write(io.stderr, `error cli.usage: ${message}\n`);
  return 2;
}
function exitForDiagnostics(
  diagnostics: readonly import("../diagnostics/types.js").Diagnostic[],
): 1 | 2 {
  return diagnostics.some(({ code }) =>
    [
      "bundle.invalid-reference",
      "bundle.read-error",
      "cli.invalid-path",
    ].includes(code),
  )
    ? 2
    : 1;
}
function write(stream: NodeJS.WritableStream, text: string): void {
  stream.write(text);
}
