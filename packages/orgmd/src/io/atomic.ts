import { lstat, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, parse, resolve, sep } from "node:path";
import type { Diagnostic, OperationResult } from "../diagnostics/types.js";

export interface AtomicWriteOptions {
  readonly overwrite: boolean;
  readonly mode?: number;
}

/** Writes a regular file through a same-directory temporary file and rename. */
export async function atomicWriteFile(
  path: string,
  bytes: Uint8Array,
  options: AtomicWriteOptions,
): Promise<OperationResult<void>> {
  const safety = await safeFilePath(path);
  if (safety) return failure(safety);

  let exists = false;
  try {
    const existing = await lstat(path);
    if (existing.isSymbolicLink()) return failure(symlinkTarget(path));
    if (!existing.isFile()) return failure(notRegularFile(path));
    exists = true;
  } catch (error) {
    if (!isMissing(error)) return failure(ioError(path));
  }
  if (exists && !options.overwrite) return failure(alreadyExists(path));

  const temporary = resolve(
    dirname(path),
    `.${basename(path)}.orgmd-${process.pid}-${randomToken()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", options.mode ?? 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      const current = await lstat(path);
      if (current.isSymbolicLink()) return failure(symlinkTarget(path));
      if (!current.isFile()) return failure(notRegularFile(path));
      if (!options.overwrite) return failure(alreadyExists(path));
    } catch (error) {
      if (!isMissing(error)) return failure(ioError(path));
    }
    await rename(temporary, path);
    return { value: undefined, diagnostics: Object.freeze([]) };
  } catch {
    return failure(ioError(path));
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}

export async function safeExplicitPath(
  path: string,
): Promise<Diagnostic | undefined> {
  if (path.length === 0 || hasTraversal(path)) return unsafePath(path);
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const segment of absolute
    .slice(root.length)
    .split(sep)
    .filter(Boolean)) {
    current = resolve(current, segment);
    try {
      // macOS exposes its writable temporary area beneath /var, a system
      // alias for /private/var. It is outside the caller-controlled path and
      // does not make the explicit target itself indirect.
      if (
        (await lstat(current)).isSymbolicLink() &&
        current !== "/var" &&
        current !== "/tmp"
      ) {
        return symlinkTarget(path);
      }
    } catch (error) {
      if (isMissing(error)) break;
      return ioError(path);
    }
  }
  return undefined;
}

async function safeFilePath(path: string): Promise<Diagnostic | undefined> {
  if (basename(path) === "." || basename(path) === sep) return unsafePath(path);
  const parent = dirname(path);
  const safety = await safeExplicitPath(parent);
  if (safety) return safety;
  try {
    if (!(await lstat(parent)).isDirectory()) return notDirectory(parent);
  } catch {
    return notDirectory(parent);
  }
  return undefined;
}

function hasTraversal(path: string): boolean {
  return path
    .split(/[\\/]+/)
    .some((component) => component === "." || component === "..");
}

function randomToken(): string {
  return Math.random().toString(16).slice(2);
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
  return { diagnostics: Object.freeze(diagnostics) };
}

function unsafePath(path: string): Diagnostic {
  return {
    code: "io.unsafe-path",
    severity: "error",
    message: "Path must not contain traversal segments.",
    path,
  };
}

function symlinkTarget(path: string): Diagnostic {
  return {
    code: "io.symlink-target",
    severity: "error",
    message: "Refusing a path that contains a symbolic link.",
    path,
  };
}

function alreadyExists(path: string): Diagnostic {
  return {
    code: "io.already-exists",
    severity: "error",
    message: "Refusing to overwrite an existing file.",
    path,
  };
}

function notRegularFile(path: string): Diagnostic {
  return {
    code: "io.not-regular-file",
    severity: "error",
    message: "Target must be a regular file.",
    path,
  };
}

function notDirectory(path: string): Diagnostic {
  return {
    code: "io.not-directory",
    severity: "error",
    message: "Target parent must be a directory.",
    path,
  };
}

function ioError(path: string): Diagnostic {
  return {
    code: "io.write-failed",
    severity: "error",
    message: "Atomic file write failed.",
    path,
  };
}
