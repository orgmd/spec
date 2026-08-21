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
): OperationResult<AdoptPreview>;
export function previewAdoption(input: unknown): OperationResult<AdoptPreview> {
  const normalized = normalizeAdoptInput(input);
  if (!normalized) return failure(invalidPreview());
  const candidates = extractMarkdownCandidates(normalized.sourceText);
  const partial = {
    sourcePath: normalized.sourcePath,
    ...(normalized.target === undefined ? {} : { target: normalized.target }),
    candidates,
    rendered: renderAdoptionPreview(normalized.sourcePath, candidates),
  };
  const preview = deepFreeze({ ...partial, previewId: previewDigest(partial) });
  previewRegistry.set(preview, { previewId: preview.previewId });
  return { value: preview, diagnostics: Object.freeze([]) };
}

export function writeAdoption(
  preview: AdoptPreview,
  confirmations: AdoptConfirmations,
  options?: AdoptWriteOptions,
): Promise<OperationResult<readonly string[]>>;
export async function writeAdoption(
  preview: unknown,
  confirmations: unknown,
  options: unknown = {},
): Promise<OperationResult<readonly string[]>> {
  if (!isPreviewShape(preview)) return failure(invalidPreview());
  const safeConfirmations = normalizeConfirmations(confirmations);
  if (!safeConfirmations) return failure(invalidConfirmations());
  const seal = previewRegistry.get(preview);
  if (!seal) return failure(untrustedPreview());
  if (
    preview.previewId !== seal.previewId ||
    previewDigest(preview) !== seal.previewId
  )
    return failure(tamperedPreview());
  if (safeConfirmations.previewId !== preview.previewId)
    return failure(staleConfirmation());
  if (preview.target === undefined)
    return failure(missingTarget(preview.sourcePath));
  const safety = await safeExplicitPath(preview.target);
  if (safety) return failure(safety);

  const confirmed = confirmedCandidates(preview, safeConfirmations);
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
    normalizeWriteOptions(options)?.io ?? defaultIo,
  );
}

function confirmedCandidates(
  preview: AdoptPreview,
  confirmations: SafeConfirmations,
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

interface SafeConfirmations {
  readonly previewId: string;
  readonly byCandidateId: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
}

function normalizeAdoptInput(input: unknown): AdoptInput | undefined {
  try {
    if (!isRecord(input)) return undefined;
    const sourcePath = input.sourcePath;
    const sourceText = input.sourceText;
    const target = input.target;
    if (typeof sourcePath !== "string" || typeof sourceText !== "string")
      return undefined;
    if (target !== undefined && typeof target !== "string") return undefined;
    return target === undefined
      ? { sourcePath, sourceText }
      : { sourcePath, sourceText, target };
  } catch {
    return undefined;
  }
}

function isPreviewShape(value: unknown): value is AdoptPreview {
  try {
    if (!isRecord(value)) return false;
    if (
      !isPreviewId(value.previewId) ||
      typeof value.sourcePath !== "string" ||
      typeof value.rendered !== "string" ||
      (value.target !== undefined && typeof value.target !== "string") ||
      !Array.isArray(value.candidates)
    ) {
      return false;
    }
    return value.candidates.every(isCandidateShape);
  } catch {
    return false;
  }
}

function isCandidateShape(value: unknown): value is AdoptCandidate {
  if (!isRecord(value)) return false;
  return (
    typeof value.candidateId === "string" &&
    typeof value.sourceHeading === "string" &&
    typeof value.sourceText === "string" &&
    value.status === "draft" &&
    isDomain(value.suggestedDomain) &&
    Array.isArray(value.requiredInputs) &&
    value.requiredInputs.every(
      (field) =>
        typeof field === "string" &&
        [
          "domain",
          "owner",
          "scope",
          "revisit",
          "action",
          "effect",
          "route",
        ].includes(field),
    )
  );
}

function normalizeConfirmations(value: unknown): SafeConfirmations | undefined {
  try {
    if (!isRecord(value) || !isPreviewId(value.previewId)) return undefined;
    const supplied = value.byCandidateId;
    if (!isRecord(supplied)) return undefined;
    const byCandidateId: Record<string, Readonly<Record<string, string>>> = {};
    for (const [candidateId, fields] of Object.entries(supplied)) {
      if (!isRecord(fields)) return undefined;
      const normalized: Record<string, string> = {};
      for (const [field, fieldValue] of Object.entries(fields)) {
        if (typeof fieldValue !== "string") return undefined;
        normalized[field] = fieldValue;
      }
      byCandidateId[candidateId] = Object.freeze(normalized);
    }
    return Object.freeze({
      previewId: value.previewId,
      byCandidateId: Object.freeze(byCandidateId),
    });
  } catch {
    return undefined;
  }
}

function normalizeWriteOptions(value: unknown): AdoptWriteOptions | undefined {
  try {
    if (!isRecord(value) || value.io === undefined) return {};
    const io = value.io;
    if (!isRecord(io)) return undefined;
    if (
      typeof io.rename !== "function" ||
      typeof io.remove !== "function" ||
      typeof io.syncParent !== "function"
    ) {
      return undefined;
    }
    return { io: io as unknown as AdoptIo };
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    const cleanup = await cleanupCommittedBackup(backup, parent, target, io);
    backup = cleanup.backup;
    preserveBackup = cleanup.preserveBackup;
    if (cleanup.diagnostic)
      return {
        value: outputs.value,
        diagnostics: Object.freeze([cleanup.diagnostic]),
      };
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

async function cleanupCommittedBackup(
  backup: string,
  parent: string,
  target: string,
  io: AdoptIo,
): Promise<{
  readonly backup: string | undefined;
  readonly preserveBackup: boolean;
  readonly diagnostic?: Diagnostic;
}> {
  try {
    await io.remove(backup);
  } catch {
    return {
      backup,
      preserveBackup: true,
      diagnostic: cleanupFailed(target, backup),
    };
  }
  try {
    await io.syncParent(parent);
  } catch {
    return {
      backup: undefined,
      preserveBackup: false,
      diagnostic: cleanupFailed(target),
    };
  }
  return { backup: undefined, preserveBackup: false };
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

function isDomain(value: unknown): value is AdoptDomain {
  return value === "identity" || value === "glossary" || value === "policy";
}

function isPreviewId(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
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

function invalidPreview(): Diagnostic {
  return {
    code: "adopt.invalid-preview",
    severity: "error",
    message: "Adoption preview input must be a well-formed preview object.",
  };
}

function invalidConfirmations(): Diagnostic {
  return {
    code: "adopt.invalid-confirmations",
    severity: "error",
    message: "Adoption confirmations must be plain records of string values.",
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

function cleanupFailed(path: string, backup?: string): Diagnostic {
  return {
    code: "adopt.cleanup-failed",
    severity: "warning",
    message:
      "Adoption committed the new target but could not durably clean up its prior backup.",
    path,
    ...(backup === undefined ? {} : { details: { backup } }),
  };
}
