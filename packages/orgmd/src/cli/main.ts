import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { compileContext } from "../compiler/compile.js";
import { sortDiagnostics } from "../diagnostics/sort.js";
import { doctorBundle, doctorExitCode } from "../doctor/doctor.js";
import { safeExplicitPath, atomicWriteFile } from "../io/atomic.js";
import { previewAdoption, writeAdoption } from "../importer/adopt.js";
import type { AdoptConfirmationField } from "../importer/types.js";
import { planInit, writeInitPlan } from "../init/init.js";
import { resolveContext } from "../resolver/resolve.js";
import { isCalendarDate } from "../validation/calendar-date.js";
import { validateBundlePath } from "../validation/validate.js";
import { ORGMD_VERSION } from "../version.js";
import { parseCommand, type ParsedCommand } from "./args.js";
import { discoverCompilePath } from "./discovery.js";
import { exitForDiagnostics } from "./exit.js";
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
  const dateFailure = invalidToday("doctor", today, json, io);
  if (dateFailure !== undefined) return dateFailure;
  const result = await validateBundlePath(resolve(io.cwd, path), {
    isRoot: true,
  });
  if (!result.value) {
    report("doctor", false, result.diagnostics, json, io);
    return exitForDiagnostics(result.diagnostics);
  }
  const reportValue = doctorBundle({ bundle: result.value, today: today! });
  const code = doctorExitCode(reportValue);
  const diagnostics = sortDiagnostics([
    ...result.diagnostics,
    ...reportValue.findings,
  ]);
  if (json)
    write(
      io.stdout,
      renderJson("doctor", code === 0, diagnostics, {
        ratios: reportValue.ratios,
        pendingRevisions: reportValue.pendingRevisions,
      }),
    );
  else if (diagnostics.length === 0) write(io.stdout, "doctor: ok\n");
  else write(io.stderr, renderDiagnostics(diagnostics));
  return code;
}

async function compile(
  parsed: Extract<ParsedCommand, { kind: "command"; command: "compile" }>,
  io: CliIo,
): Promise<CliExitCode> {
  const dateFailure = invalidToday("compile", parsed.today, parsed.json, io);
  if (dateFailure !== undefined) return dateFailure;
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
    today: parsed.today!,
  });
  if (!resolution.value) {
    const diagnostics = sortDiagnostics([
      ...found.diagnostics,
      ...resolution.diagnostics,
    ]);
    report("compile", false, diagnostics, parsed.json, io, {
      path: found.paths,
    });
    return 1;
  }
  const resolutionDiagnostics = sortDiagnostics([
    ...found.diagnostics,
    ...resolution.diagnostics,
  ]);
  if (resolutionDiagnostics.some(({ severity }) => severity === "error")) {
    report("compile", false, resolutionDiagnostics, parsed.json, io, {
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
  const diagnostics = sortDiagnostics([
    ...resolutionDiagnostics,
    ...projections.flatMap(({ diagnostics }) => diagnostics),
  ]);
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
        renderJson("compile", true, diagnostics, {
          path: found.paths,
          files: files.map(({ path }) => path),
        }),
      );
    else
      write(
        io.stdout,
        `compile: wrote ${files.map(({ path }) => path).join(", ")}\n`,
      );
    if (!parsed.json && diagnostics.length > 0)
      write(io.stderr, renderDiagnostics(diagnostics));
    return 0;
  }
  if (parsed.json) {
    write(
      io.stdout,
      renderJson("compile", true, diagnostics, {
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
  if (diagnostics.length > 0) write(io.stderr, renderDiagnostics(diagnostics));
  return 0;
}

async function initialize(
  parsed: Extract<ParsedCommand, { kind: "command"; command: "init" }>,
  io: CliIo,
): Promise<CliExitCode> {
  let input = parsed.init ?? {};
  const prompt = parsed.nonInteractive ? undefined : createPromptReader(io);
  if (prompt) {
    const prompted = await promptInitInput(input, prompt);
    if (!prompted)
      return invocation(
        "Interactive init requires a non-empty answer for every required prompt.",
        io,
      );
    input = prompted;
  }
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
    target: initTarget(parsed.path, io.cwd),
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
    return exitForDiagnostics(result.diagnostics);
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
  if (prompt) {
    if (parsed.json) write(io.stderr, result.value.preview);
    else write(io.stdout, result.value.preview);
    const confirmation = await prompt.question("Write these files? [y/N]: ");
    if (!confirmation || !["y", "yes"].includes(confirmation.toLowerCase())) {
      if (parsed.json)
        write(io.stdout, renderJson("init", true, [], { cancelled: true }));
      else write(io.stdout, "init: cancelled; no files written.\n");
      return 0;
    }
  }
  const written = await writeInitPlan(result.value);
  if (!written.value) {
    report("init", false, written.diagnostics, parsed.json, io);
    return exitForDiagnostics(written.diagnostics);
  }
  if (parsed.json)
    write(
      io.stdout,
      renderJson("init", true, written.diagnostics, { files: written.value }),
    );
  else write(io.stdout, `init: wrote ${written.value.join(", ")}\n`);
  return 0;
}

interface PromptReader {
  question(text: string): Promise<string | undefined>;
}

function createPromptReader(io: CliIo): PromptReader {
  const iterator = io.stdin[Symbol.asyncIterator]();
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let ended = false;

  return Object.freeze({
    async question(text: string): Promise<string | undefined> {
      write(io.stderr, text);
      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline !== -1) {
          const answer = buffer.slice(0, newline).replace(/\r$/u, "");
          buffer = buffer.slice(newline + 1);
          return answer.trim();
        }
        if (ended) {
          if (buffer.length === 0) return undefined;
          const answer = buffer.replace(/\r$/u, "");
          buffer = "";
          return answer.trim();
        }
        const next = await iterator.next();
        if (next.done) {
          buffer += decoder.end();
          ended = true;
        } else if (typeof next.value === "string") {
          buffer += next.value;
        } else {
          buffer += decoder.write(Buffer.from(next.value));
        }
      }
    },
  });
}

async function promptInitInput(
  supplied: Readonly<Record<string, string | undefined>>,
  prompt: PromptReader,
): Promise<Record<string, string | undefined> | undefined> {
  const input: Record<string, string | undefined> = { ...supplied };
  const required = async (key: string, text: string): Promise<boolean> => {
    if (input[key]?.trim()) return true;
    const answer = await prompt.question(text);
    if (!answer) return false;
    input[key] = answer;
    return true;
  };

  if (!(await required("organization", "Organisation name: ")))
    return undefined;
  if (!(await required("tone", "Tone: "))) return undefined;
  if (input.terms === undefined)
    input.terms =
      (await prompt.question(
        "Contested terms (comma-separated, optional): ",
      )) ?? "";
  if (!(await required("policy", "Non-negotiable policy: "))) return undefined;
  if (!(await required("action", "Policy action: "))) return undefined;
  if (!(await required("effect", "Policy effect (allow|escalate|deny): ")))
    return undefined;
  if (
    input.effect === "escalate" &&
    !(await required("route", "Escalation route: "))
  )
    return undefined;
  if (!(await required("editor", "Editor role: "))) return undefined;
  if (!(await required("owner", "Policy owner role: "))) return undefined;
  if (!(await required("revisit", "Revisit date (YYYY-MM-DD): ")))
    return undefined;
  if (!(await required("today", "Resolution date (YYYY-MM-DD): ")))
    return undefined;
  return input;
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
    return exitForDiagnostics(result.diagnostics);
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
    const equals = value.indexOf("=");
    const separator = equals === -1 ? -1 : value.lastIndexOf(".", equals);
    if (separator <= 0 || equals <= separator + 1) return undefined;
    const id = value.slice(0, separator);
    const field = value.slice(separator + 1, equals);
    const confirmation = value.slice(equals + 1);
    if (!confirmationFields.has(field as AdoptConfirmationField))
      return undefined;
    (byCandidateId[id] ??= {})[field] = confirmation;
  }
  return { previewId, byCandidateId };
}

const confirmationFields: ReadonlySet<AdoptConfirmationField> = new Set([
  "domain",
  "owner",
  "scope",
  "revisit",
  "action",
  "effect",
  "route",
]);

function initTarget(path: string | undefined, cwd: string): string {
  if (path === undefined) return cwd;
  return isAbsolute(path) ? path : `${resolve(cwd)}/${path}`;
}

function report(
  command: string,
  ok: boolean,
  diagnostics: readonly import("../diagnostics/types.js").Diagnostic[],
  json: boolean,
  io: CliIo,
  extra: Readonly<Record<string, unknown>> = {},
): void {
  const ordered = sortDiagnostics(diagnostics);
  if (json) write(io.stdout, renderJson(command, ok, ordered, extra));
  else if (ok) {
    write(io.stdout, `${command}: ok\n`);
    if (ordered.length > 0) write(io.stderr, renderDiagnostics(ordered));
  } else write(io.stderr, renderDiagnostics(ordered));
}
function invocation(message: string, io: CliIo): 2 {
  write(io.stderr, `error cli.usage: ${message}\n`);
  return 2;
}
function invalidToday(
  command: "compile" | "doctor",
  today: string | undefined,
  json: boolean,
  io: CliIo,
): 2 | undefined {
  if (today !== undefined && isCalendarDate(today)) return undefined;
  report(
    command,
    false,
    [
      {
        code: "cli.invalid-date",
        severity: "error",
        message: "A valid --today YYYY-MM-DD is required.",
      },
    ],
    json,
    io,
  );
  return 2;
}
function write(stream: NodeJS.WritableStream, text: string): void {
  stream.write(text);
}
