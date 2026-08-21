import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadBundle } from "../bundle/load.js";
import { sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic, OperationResult } from "../diagnostics/types.js";
import { doctorBundle } from "../doctor/doctor.js";
import { atomicWriteFile, safeExplicitPath } from "../io/atomic.js";
import { validateBundle } from "../validation/validate.js";
import { renderInitFiles } from "./render.js";
import type { InitInput, InitPlan, InitPlanFile } from "./types.js";

export type { InitInput, InitPlan, InitPlanFile } from "./types.js";

const generatedNames = Object.freeze(["org.md", "ownership.md", "policies.md"]);

export interface InitWriteOptions {
  /** Dependency injection for deterministic storage-failure tests. */
  readonly writeFile?: typeof atomicWriteFile;
}

export async function planInit(
  input: InitInput,
): Promise<OperationResult<InitPlan>> {
  const inputSafety = await safeExplicitPath(input.target);
  if (inputSafety) return failure(inputSafety);
  const target = resolve(input.target);
  const targetCheck = await inspectTarget(target, input.overwrite === true);
  if (targetCheck) return failure(targetCheck);

  const files = renderInitFiles(input);
  const validation = await validateFiles(target, files, input.today);
  if (validation.length > 0) return failure(...validation);

  const preview = files
    .map(({ relativePath, content }) => `# ${relativePath}\n\n${content}`)
    .join("\n");
  return {
    value: Object.freeze({
      target,
      files,
      preview,
      today: input.today,
      overwrite: input.overwrite === true,
    }),
    diagnostics: Object.freeze([]),
  };
}

export async function writeInitPlan(
  plan: InitPlan,
  options: InitWriteOptions = {},
): Promise<OperationResult<readonly string[]>> {
  const shapeDiagnostics = validatePlanShape(plan);
  if (shapeDiagnostics.length > 0) return failure(...shapeDiagnostics);

  const validation = await validateFiles(plan.target, plan.files, plan.today);
  if (validation.length > 0) return failure(...validation);

  const targetCheck = await inspectTarget(plan.target, plan.overwrite);
  if (targetCheck) return failure(targetCheck);

  const parent = dirname(plan.target);
  let staged: string | undefined;
  let backup: string | undefined;
  try {
    staged = await mkdtemp(join(parent, ".orgmd-init-"));
    await chmodDirectory(staged, 0o700);
    const writer = options.writeFile ?? atomicWriteFile;
    for (const file of plan.files) {
      const result = await writer(
        join(staged, file.relativePath),
        new TextEncoder().encode(file.content),
        {
          overwrite: false,
          mode: 0o600,
        },
      );
      if (result.diagnostics.some(({ severity }) => severity === "error")) {
        return failure(...result.diagnostics);
      }
    }
    await syncDirectory(staged);

    if (await exists(plan.target)) {
      backup = `${staged}.backup`;
      await rename(plan.target, backup);
      try {
        await rename(staged, plan.target);
        staged = undefined;
      } catch (error) {
        await rename(backup, plan.target).catch(() => undefined);
        backup = undefined;
        throw error;
      }
      await rm(backup, { recursive: true, force: true });
      backup = undefined;
    } else {
      await rename(staged, plan.target);
      staged = undefined;
    }
    return { value: generatedNames, diagnostics: Object.freeze([]) };
  } catch {
    return failure({
      code: "init.write-failed",
      severity: "error" as const,
      message: "Initializer could not atomically replace the target bundle.",
      path: plan.target,
    });
  } finally {
    if (backup !== undefined)
      await rm(backup, { recursive: true, force: true }).catch(() => undefined);
    if (staged !== undefined)
      await rm(staged, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function validateFiles(
  target: string,
  files: readonly InitPlanFile[],
  today: string,
): Promise<readonly Diagnostic[]> {
  const parent = dirname(target);
  let validationDirectory: string | undefined;
  try {
    validationDirectory = await mkdtemp(join(parent, ".orgmd-plan-"));
    for (const file of files)
      await writeFile(
        join(validationDirectory, file.relativePath),
        file.content,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
    const loaded = await loadBundle({
      reference: validationDirectory,
      isRoot: true,
    });
    if (!loaded.value) return loaded.diagnostics;
    const validated = validateBundle(loaded.value, { isRoot: true });
    if (!validated.value) return validated.diagnostics;
    const blocking = doctorBundle({
      bundle: validated.value,
      today,
    }).findings.filter(({ blocking }) => blocking);
    return Object.freeze([...validated.diagnostics, ...blocking]);
  } catch {
    return Object.freeze([
      {
        code: "init.validation-failed",
        severity: "error" as const,
        message: "Initializer could not validate the proposed bundle.",
        path: target,
      },
    ]);
  } finally {
    if (validationDirectory !== undefined)
      await rm(validationDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
  }
}

async function inspectTarget(
  target: string,
  overwrite: boolean,
): Promise<Diagnostic | undefined> {
  const safety = await safeExplicitPath(target);
  if (safety) return safety;
  const parent = dirname(target);
  try {
    if (!(await lstat(parent)).isDirectory()) return targetParentError(parent);
  } catch {
    return targetParentError(parent);
  }
  try {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink()) return targetSymlink(target);
    if (!targetStat.isDirectory()) return targetDirectoryError(target);
  } catch (error) {
    if (isMissing(error)) return undefined;
    return targetDirectoryError(target);
  }
  const names = await readdir(target);
  if (names.length === 0) return undefined;
  if (!overwrite || !sameGeneratedFiles(names)) return targetNotEmpty(target);
  for (const name of names) {
    try {
      const file = await lstat(join(target, name));
      if (!file.isFile() || file.isSymbolicLink())
        return targetNotReplaceable(target);
    } catch {
      return targetNotReplaceable(target);
    }
  }
  return undefined;
}

function validatePlanShape(plan: InitPlan): readonly Diagnostic[] {
  if (resolve(plan.target) !== plan.target)
    return [unsafePlanPath(plan.target)];
  const names = plan.files.map(({ relativePath }) => relativePath);
  if (names.length !== generatedNames.length || !sameGeneratedFiles(names)) {
    return [
      {
        code: "init.invalid-plan",
        severity: "error" as const,
        message: "Initializer plans must contain exactly the generated files.",
        path: plan.target,
      },
    ];
  }
  return [];
}

function sameGeneratedFiles(names: readonly string[]): boolean {
  return (
    names.length === generatedNames.length &&
    [...names].sort().every((name, index) => name === generatedNames[index])
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function chmodDirectory(path: string, mode: number): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.chmod(mode);
  } finally {
    await handle.close();
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function failure(
  ...diagnostics: readonly Diagnostic[]
): OperationResult<never> {
  return { diagnostics: sortDiagnostics(diagnostics) };
}

function targetParentError(path: string): Diagnostic {
  return {
    code: "init.invalid-parent",
    severity: "error",
    message: "Initializer target parent must be an existing directory.",
    path,
  };
}

function targetDirectoryError(path: string): Diagnostic {
  return {
    code: "init.invalid-target",
    severity: "error",
    message: "Initializer target must be a directory.",
    path,
  };
}

function targetSymlink(path: string): Diagnostic {
  return {
    code: "init.symlink-target",
    severity: "error",
    message: "Initializer target must not be a symbolic link.",
    path,
  };
}

function targetNotEmpty(path: string): Diagnostic {
  return {
    code: "init.target-not-empty",
    severity: "error",
    message:
      "Initializer target must be empty unless explicit overwrite names the generated files.",
    path,
  };
}

function targetNotReplaceable(path: string): Diagnostic {
  return {
    code: "init.target-not-replaceable",
    severity: "error",
    message:
      "Overwrite is permitted only for the three regular generated files.",
    path,
  };
}

function unsafePlanPath(path: string): Diagnostic {
  return {
    code: "init.invalid-plan",
    severity: "error",
    message: "Initializer plan target must be an absolute normalized path.",
    path,
  };
}
