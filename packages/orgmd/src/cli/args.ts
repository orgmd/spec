import { parseArgs } from "node:util";

type CommandBase = {
  readonly kind: "command";
  readonly json: boolean;
  readonly path?: string;
};
type ValidateCommand = CommandBase & { readonly command: "validate" };
type DoctorCommand = CommandBase & {
  readonly command: "doctor";
  readonly today?: string;
};
type CompileCommand = CommandBase & {
  readonly command: "compile";
  readonly target?: "agents-md" | "prompt";
  readonly all?: boolean;
  readonly clearance?: readonly string[];
  readonly output?: string;
  readonly today?: string;
};
type InitCommand = CommandBase & {
  readonly command: "init";
  readonly nonInteractive: boolean;
  readonly write: boolean;
  readonly preview: boolean;
  readonly overwrite: boolean;
  readonly init: Readonly<Record<string, string | undefined>>;
};
type AdoptCommand = CommandBase & {
  readonly command: "adopt";
  readonly source: string;
  readonly write: boolean;
  readonly confirmations: readonly string[];
};
export type ParsedCommand =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "usage"; readonly message: string }
  | ValidateCommand
  | DoctorCommand
  | CompileCommand
  | InitCommand
  | AdoptCommand;

export function parseCommand(argv: readonly string[]): ParsedCommand {
  if (argv.length === 0) return usage("A command is required.");
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h"))
    return { kind: "help" };
  if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-v"))
    return { kind: "version" };
  const command = argv[0];
  if (!isCommand(command)) return usage(`Unknown command: ${String(command)}.`);
  try {
    switch (command) {
      case "validate":
        return validateArgs(argv.slice(1));
      case "doctor":
        return doctorArgs(argv.slice(1));
      case "compile":
        return compile(argv.slice(1));
      case "init":
        return init(argv.slice(1));
      case "adopt":
        return adopt(argv.slice(1));
    }
  } catch (error) {
    return usage(
      error instanceof Error ? error.message : "Invalid command arguments.",
    );
  }
}

function validateArgs(args: readonly string[]): ParsedCommand {
  const result = parseArgs({
    args: [...args],
    options: { json: { type: "boolean" } },
    allowPositionals: true,
    strict: true,
  });
  if (result.positionals.length > 1)
    return usage("Only one bundle path may be supplied.");
  return {
    kind: "command",
    command: "validate",
    ...(result.positionals[0] === undefined
      ? {}
      : { path: result.positionals[0] }),
    json: result.values.json === true,
  };
}
function doctorArgs(args: readonly string[]): ParsedCommand {
  const result = parseArgs({
    args: [...args],
    options: { json: { type: "boolean" }, today: { type: "string" } },
    allowPositionals: true,
    strict: true,
  });
  if (result.positionals.length > 1)
    return usage("Only one bundle path may be supplied.");
  return {
    kind: "command",
    command: "doctor",
    ...(result.positionals[0] === undefined
      ? {}
      : { path: result.positionals[0] }),
    json: result.values.json === true,
    ...(typeof result.values.today === "string"
      ? { today: result.values.today }
      : {}),
  };
}

function compile(args: readonly string[]): ParsedCommand {
  const result = parseArgs({
    args: [...args],
    options: {
      target: { type: "string" },
      all: { type: "boolean" },
      clearance: { type: "string" },
      output: { type: "string" },
      json: { type: "boolean" },
      today: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (result.positionals.length > 1)
    return usage("Only one bundle path may be supplied.");
  const target = result.values.target;
  if (
    (target !== undefined && target !== "agents-md" && target !== "prompt") ||
    (target !== undefined && result.values.all === true) ||
    (target === undefined && result.values.all !== true)
  )
    return usage(
      "Compile requires exactly one of --target agents-md|prompt or --all.",
    );
  return {
    kind: "command",
    command: "compile",
    ...(result.positionals[0] === undefined
      ? {}
      : { path: result.positionals[0] }),
    json: result.values.json === true,
    ...(target === undefined ? {} : { target }),
    ...(result.values.all === true ? { all: true } : {}),
    ...(typeof result.values.clearance === "string"
      ? { clearance: splitList(result.values.clearance) }
      : {}),
    ...(typeof result.values.output === "string"
      ? { output: result.values.output }
      : {}),
    ...(typeof result.values.today === "string"
      ? { today: result.values.today }
      : {}),
  };
}

function init(args: readonly string[]): ParsedCommand {
  const result = parseArgs({
    args: [...args],
    options: {
      "non-interactive": { type: "boolean" },
      preview: { type: "boolean" },
      write: { type: "boolean" },
      overwrite: { type: "boolean" },
      json: { type: "boolean" },
      organization: { type: "string" },
      tone: { type: "string" },
      terms: { type: "string" },
      policy: { type: "string" },
      action: { type: "string" },
      effect: { type: "string" },
      route: { type: "string" },
      editor: { type: "string" },
      owner: { type: "string" },
      revisit: { type: "string" },
      today: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (result.positionals.length > 1)
    return usage("Only one target path may be supplied.");
  if (result.values.write === true && result.values.preview === true)
    return usage("--write and --preview cannot be combined.");
  const initValues: Record<string, string | undefined> = {};
  for (const key of [
    "organization",
    "tone",
    "terms",
    "policy",
    "action",
    "effect",
    "route",
    "editor",
    "owner",
    "revisit",
    "today",
  ] as const) {
    const value = result.values[key];
    if (typeof value === "string") initValues[key] = value;
  }
  return {
    kind: "command",
    command: "init",
    ...(result.positionals[0] === undefined
      ? {}
      : { path: result.positionals[0] }),
    json: result.values.json === true,
    nonInteractive: result.values["non-interactive"] === true,
    write: result.values.write === true,
    preview: result.values.preview === true,
    overwrite: result.values.overwrite === true,
    init: initValues,
  };
}

function adopt(args: readonly string[]): ParsedCommand {
  const result = parseArgs({
    args: [...args],
    options: {
      write: { type: "boolean" },
      json: { type: "boolean" },
      confirm: { type: "string", multiple: true },
    },
    allowPositionals: true,
    strict: true,
  });
  if (result.positionals.length < 1 || result.positionals.length > 2)
    return usage(
      "adopt requires a source and accepts at most one target path.",
    );
  return {
    kind: "command",
    command: "adopt",
    source: result.positionals[0]!,
    ...(result.positionals[1] === undefined
      ? {}
      : { path: result.positionals[1] }),
    json: result.values.json === true,
    write: result.values.write === true,
    confirmations: result.values.confirm ?? [],
  };
}

function splitList(value: string): readonly string[] {
  return Object.freeze(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}
function isCommand(
  value: string | undefined,
): value is "validate" | "compile" | "doctor" | "init" | "adopt" {
  return (
    value === "validate" ||
    value === "compile" ||
    value === "doctor" ||
    value === "init" ||
    value === "adopt"
  );
}
function usage(message: string): ParsedCommand {
  return { kind: "usage", message };
}
