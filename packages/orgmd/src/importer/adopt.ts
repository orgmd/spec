import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { loadBundle } from "../bundle/load.js";
import { sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic, OperationResult } from "../diagnostics/types.js";
import { atomicWriteFile, safeExplicitPath } from "../io/atomic.js";
import { validateBundle } from "../validation/validate.js";
import { extractMarkdownCandidates } from "./markdown.js";
import {
  renderAdoptionPreview,
  renderDraftRevision,
  targetFile,
} from "./render.js";
import type {
  AdoptCandidate,
  AdoptConfirmations,
  AdoptDomain,
  AdoptInput,
  AdoptPreview,
} from "./types.js";

export type {
  AdoptCandidate,
  AdoptConfirmations,
  AdoptDomain,
  AdoptInput,
  AdoptPreview,
} from "./types.js";

export interface AdoptIo {
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
  readonly syncParent: (path: string) => Promise<void>;
}

export interface AdoptWriteOptions {
  readonly io?: AdoptIo;
}

interface ConfirmedCandidate {
  readonly candidate: AdoptCandidate;
  readonly domain: AdoptDomain;
  readonly confirmation: Readonly<Record<string, string>>;
}

const previewRegistry = new WeakMap<
  AdoptPreview,
  { readonly previewId: string }
>();

export function previewAdoption(
  input: AdoptInput,
): OperationResult<AdoptPreview> {
  const candidates = extractMarkdownCandidates(input.sourceText);
  const partial = {
    sourcePath: input.sourcePath,
    ...(input.target === undefined ? {} : { target: input.target }),
    candidates,
    rendered: renderAdoptionPreview(input.sourcePath, candidates),
  };
  const preview = deepFreeze({ ...partial, previewId: previewDigest(partial) });
  previewRegistry.set(preview, { previewId: preview.previewId });
  return { value: preview, diagnostics: Object.freeze([]) };
}

export async function writeAdoption(
  preview: AdoptPreview,
  confirmations: AdoptConfirmations,
  options: AdoptWriteOptions = {},
): Promise<OperationResult<readonly string[]>> {
  const seal = previewRegistry.get(preview);
  if (!seal) return failure(untrustedPreview());
  if (
    preview.previewId !== seal.previewId ||
    previewDigest(preview) !== seal.previewId
  )
    return failure(tamperedPreview());
  if (confirmations.previewId !== preview.previewId)
    return failure(staleConfirmation());
  if (preview.target === undefined)
    return failure(missingTarget(preview.sourcePath));
  const safety = await safeExplicitPath(preview.target);
  if (safety) return failure(safety);

  const confirmed = confirmedCandidates(preview, confirmations);
  if (!confirmed.value) return { diagnostics: confirmed.diagnostics };
  const target = await canonicalTarget(preview.target);
  if (!target.value) return { diagnostics: target.diagnostics };
  const sourceDiagnostic = await sourceSafety(preview.sourcePath, target.value);
  if (sourceDiagnostic) return failure(sourceDiagnostic);
  const targetDiagnostics = await validateTarget(target.value);
  if (targetDiagnostics.length > 0) return failure(...targetDiagnostics);
  if (confirmed.value.length === 0)
    return { value: Object.freeze([]), diagnostics: Object.freeze([]) };

  return writeTransaction(
    target.value,
    preview.sourcePath,
    confirmed.value,
    options.io ?? defaultIo,
  );
}

function confirmedCandidates(
  preview: AdoptPreview,
  confirmations: AdoptConfirmations,
): OperationResult<readonly ConfirmedCandidate[]> {
  const diagnostics: Diagnostic[] = [];
  const values: ConfirmedCandidate[] = [];
  for (const candidate of preview.candidates) {
    const confirmation =
      confirmations.byCandidateId[candidate.candidateId] ?? {};
    const domain = confirmation.domain;
    if (!domain?.trim()) {
      diagnostics.push(missingConfirmation(candidate, "domain"));
      continue;
    }
    if (!isDomain(domain)) {
      diagnostics.push(invalidConfirmation(candidate, "domain"));
      continue;
    }
    const required = [
      "owner",
      "scope",
      ...(domain === "policy" ? ["revisit", "action", "effect"] : []),
      ...(domain === "policy" && confirmation.effect === "escalate"
        ? ["route"]
        : []),
    ];
    let valid = true;
    for (const field of required) {
      if (confirmation[field]?.trim().length) continue;
      diagnostics.push(missingConfirmation(candidate, field));
      valid = false;
    }
    if (valid) values.push({ candidate, domain, confirmation });
  }
  return diagnostics.length > 0
    ? failure(...diagnostics)
    : { value: Object.freeze(values), diagnostics: Object.freeze([]) };
}

async function canonicalTarget(path: string): Promise<OperationResult<string>> {
  try {
    if ((await lstat(path)).isSymbolicLink())
      return failure(invalidTarget(path));
    const canonical = await realpath(path);
    if (!(await lstat(canonical)).isDirectory())
      return failure(invalidTarget(path));
    return { value: canonical, diagnostics: Object.freeze([]) };
  } catch {
    return failure(invalidTarget(path));
  }
}

async function sourceSafety(
  sourcePath: string,
  target: string,
): Promise<Diagnostic | undefined> {
  try {
    const source = await realpath(sourcePath);
    if (contained(target, source)) return sourceInsideTarget(sourcePath);
  } catch {
    // A source need not still exist when its supplied text is being adopted.
  }
  return undefined;
}

async function writeTransaction(
  target: string,
  sourcePath: string,
  candidates: readonly ConfirmedCandidate[],
  io: AdoptIo,
): Promise<OperationResult<readonly string[]>> {
  const parent = dirname(target);
  let staged: string | undefined;
  let backup: string | undefined;
  let movedExisting = false;
  let installedStaged = false;
  let preserveBackup = false;
  try {
    staged = await mkdtemp(join(parent, ".orgmd-adopt-"));
    await cp(target, staged, { recursive: true, force: false });
    const outputs = await applyDrafts(staged, candidates, sourcePath);
    if (!outputs.value) return { diagnostics: outputs.diagnostics };
    const validation = await validateTarget(staged);
    if (validation.length > 0) return failure(...validation);
    await syncDirectory(staged);

    backup = `${staged}.backup`;
    await io.rename(target, backup);
    movedExisting = true;
    await io.syncParent(parent);
    await io.rename(staged, target);
    staged = undefined;
    installedStaged = true;
    await io.syncParent(parent);
    await io.remove(backup);
    backup = undefined;
    await io.syncParent(parent);
    return { value: outputs.value, diagnostics: Object.freeze([]) };
  } catch {
    if (movedExisting && !installedStaged && backup !== undefined) {
      try {
        await io.rename(backup, target);
        backup = undefined;
        await io.syncParent(parent);
      } catch {
        preserveBackup = true;
        return failure(rollbackFailed(target));
      }
    } else if (movedExisting && installedStaged && backup !== undefined) {
      try {
        const displaced = `${backup}.new`;
        await io.rename(target, displaced);
        await io.syncParent(parent);
        await io.rename(backup, target);
        backup = undefined;
        await io.syncParent(parent);
        await io.remove(displaced);
        await io.syncParent(parent);
      } catch {
        preserveBackup = true;
        return failure(rollbackFailed(target));
      }
    }
    return failure(writeFailure(target));
  } finally {
    if (backup !== undefined && !preserveBackup)
      await io.remove(backup).catch(() => undefined);
    if (staged !== undefined) await io.remove(staged).catch(() => undefined);
  }
}

async function applyDrafts(
  staged: string,
  candidates: readonly ConfirmedCandidate[],
  sourcePath: string,
): Promise<OperationResult<readonly string[]>> {
  const revisions = new Map<string, string[]>();
  for (const { candidate, domain, confirmation } of candidates) {
    const path = targetFile(domain);
    const current = revisions.get(path) ?? [];
    current.push(
      renderDraftRevision(candidate, domain, confirmation, sourcePath),
    );
    revisions.set(path, current);
  }
  const written: string[] = [];
  for (const [relativePath, entries] of revisions) {
    let prior = "";
    try {
      prior = await readFile(join(staged, relativePath), "utf8");
    } catch {
      // A domain file may be introduced to an otherwise valid bundle.
    }
    const result = await atomicWriteFile(
      join(staged, relativePath),
      new TextEncoder().encode(joinRevisions(prior, entries)),
      { overwrite: true, mode: 0o600 },
    );
    if (result.diagnostics.some(({ severity }) => severity === "error"))
      return failure(...result.diagnostics);
    written.push(relativePath);
  }
  return { value: Object.freeze(written), diagnostics: Object.freeze([]) };
}

function joinRevisions(prior: string, revisions: readonly string[]): string {
  if (prior.length === 0) return revisions.join("\n");
  return `${prior.endsWith("\n") ? prior : `${prior}\n`}\n${revisions.join("\n")}`;
}

async function validateTarget(target: string): Promise<readonly Diagnostic[]> {
  const loaded = await loadBundle({ reference: target, isRoot: true });
  if (!loaded.value) return loaded.diagnostics;
  const validated = validateBundle(loaded.value, { isRoot: true });
  return validated.value ? [] : validated.diagnostics;
}

function previewDigest(
  preview: Omit<AdoptPreview, "previewId"> | AdoptPreview,
): string {
  const canonical = JSON.stringify({
    sourcePath: preview.sourcePath,
    target: preview.target,
    candidates: preview.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      sourceHeading: candidate.sourceHeading,
      sourceText: candidate.sourceText,
      status: candidate.status,
      suggestedDomain: candidate.suggestedDomain,
      requiredInputs: candidate.requiredInputs,
    })),
    rendered: preview.rendered,
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return Object.freeze(value);
}

function isDomain(value: string): value is AdoptDomain {
  return value === "identity" || value === "glossary" || value === "policy";
}

function contained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

const defaultIo: AdoptIo = Object.freeze({
  rename,
  remove: async (path: string) => rm(path, { recursive: true, force: true }),
  syncParent: syncDirectory,
});

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function failure(
  ...diagnostics: readonly Diagnostic[]
): OperationResult<never> {
  return { diagnostics: sortDiagnostics(diagnostics) };
}

function untrustedPreview(): Diagnostic {
  return {
    code: "adopt.untrusted-preview",
    severity: "error",
    message: "Adoption previews must be created by this process.",
  };
}

function tamperedPreview(): Diagnostic {
  return {
    code: "adopt.tampered-preview",
    severity: "error",
    message: "Adoption preview content no longer matches its digest.",
  };
}

function staleConfirmation(): Diagnostic {
  return {
    code: "adopt.stale-confirmation",
    severity: "error",
    message: "Confirmations do not name this exact adoption preview.",
  };
}

function missingTarget(path: string): Diagnostic {
  return {
    code: "adopt.missing-target",
    severity: "error",
    message: "Adoption writes require an explicit target bundle.",
    path,
  };
}

function invalidTarget(path: string): Diagnostic {
  return {
    code: "adopt.invalid-target",
    severity: "error",
    message:
      "Adoption target must be an existing non-symlink bundle directory.",
    path,
  };
}

function sourceInsideTarget(path: string): Diagnostic {
  return {
    code: "adopt.source-inside-target",
    severity: "error",
    message:
      "Adoption never swaps a target containing its source Markdown file.",
    path,
  };
}

function missingConfirmation(
  candidate: AdoptCandidate,
  field: string,
): Diagnostic {
  return {
    code: "adopt.missing-confirmation",
    severity: "error",
    message: `Candidate ${JSON.stringify(candidate.candidateId)} requires a confirmed ${field}.`,
    entryId: candidate.candidateId,
  };
}

function invalidConfirmation(
  candidate: AdoptCandidate,
  field: string,
): Diagnostic {
  return {
    code: "adopt.invalid-confirmation",
    severity: "error",
    message: `Candidate ${JSON.stringify(candidate.candidateId)} has an invalid confirmed ${field}.`,
    entryId: candidate.candidateId,
  };
}

function writeFailure(path: string): Diagnostic {
  return {
    code: "adopt.write-failed",
    severity: "error",
    message: "Adoption could not atomically replace the target bundle.",
    path,
  };
}

function rollbackFailed(path: string): Diagnostic {
  return {
    code: "adopt.rollback-failed",
    severity: "error",
    message:
      "Adoption could not durably restore the prior bundle; manual recovery may be required.",
    path,
  };
}
