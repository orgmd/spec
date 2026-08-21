import { cp, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
import type { AdoptConfirmations, AdoptInput, AdoptPreview } from "./types.js";

export type {
  AdoptCandidate,
  AdoptConfirmations,
  AdoptInput,
  AdoptPreview,
} from "./types.js";

export function previewAdoption(
  input: AdoptInput,
): OperationResult<AdoptPreview> {
  const candidates = extractMarkdownCandidates(input.sourceText);
  return {
    value: Object.freeze({
      sourcePath: input.sourcePath,
      ...(input.target === undefined ? {} : { target: input.target }),
      candidates,
      rendered: renderAdoptionPreview(input.sourcePath, candidates),
    }),
    diagnostics: Object.freeze([]),
  };
}

export async function writeAdoption(
  preview: AdoptPreview,
  confirmations: AdoptConfirmations,
): Promise<OperationResult<readonly string[]>> {
  if (preview.target === undefined)
    return failure(missingTarget(preview.sourcePath));
  const safety = await safeExplicitPath(preview.target);
  if (safety) return failure(safety);
  const target = resolve(preview.target);
  const confirmationDiagnostics = confirmationErrors(preview, confirmations);
  if (confirmationDiagnostics.length > 0)
    return failure(...confirmationDiagnostics);

  const outputs = await proposedOutputs(preview, confirmations, target);
  if (!outputs.value) return { diagnostics: outputs.diagnostics };
  for (const path of outputs.value.keys()) {
    if (resolve(preview.sourcePath) === resolve(target, path))
      return failure(sourceOutputConflict(preview.sourcePath));
  }

  const targetDiagnostics = await validateTarget(target);
  if (targetDiagnostics.length > 0) return failure(...targetDiagnostics);
  const validation = await validateProposedTarget(target, outputs.value);
  if (validation.length > 0) return failure(...validation);

  const written: string[] = [];
  for (const [relativePath, content] of outputs.value) {
    const result = await atomicWriteFile(
      join(target, relativePath),
      new TextEncoder().encode(content),
      { overwrite: true, mode: 0o600 },
    );
    if (result.diagnostics.some(({ severity }) => severity === "error"))
      return failure(...result.diagnostics);
    written.push(relativePath);
  }
  return { value: Object.freeze(written), diagnostics: Object.freeze([]) };
}

async function proposedOutputs(
  preview: AdoptPreview,
  confirmations: AdoptConfirmations,
  target: string,
): Promise<OperationResult<ReadonlyMap<string, string>>> {
  const pieces = new Map<string, string[]>();
  for (const candidate of preview.candidates) {
    const relativePath = targetFile(candidate);
    const current = pieces.get(relativePath) ?? [];
    current.push(
      renderDraftRevision(
        candidate,
        confirmations.byCandidateId[candidate.candidateId] ?? {},
        preview.sourcePath,
      ),
    );
    pieces.set(relativePath, current);
  }
  try {
    const outputs = new Map<string, string>();
    for (const [relativePath, revisions] of pieces) {
      let prior = "";
      try {
        prior = await readFile(join(target, relativePath), "utf8");
      } catch {
        // A new domain file is legal; the full proposed bundle is validated below.
      }
      outputs.set(relativePath, joinRevisions(prior, revisions));
    }
    return { value: outputs, diagnostics: Object.freeze([]) };
  } catch {
    return failure(writeFailure(target));
  }
}

function joinRevisions(prior: string, revisions: readonly string[]): string {
  if (prior.length === 0) return revisions.join("\n");
  return `${prior.endsWith("\n") ? prior : `${prior}\n`}\n${revisions.join("\n")}`;
}

function confirmationErrors(
  preview: AdoptPreview,
  confirmations: AdoptConfirmations,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const candidate of preview.candidates) {
    const supplied = confirmations.byCandidateId[candidate.candidateId] ?? {};
    const required = [
      ...candidate.requiredInputs,
      ...(candidate.suggestedDomain === "policy" &&
      supplied.effect === "escalate"
        ? ["route" as const]
        : []),
    ];
    for (const field of required) {
      if (supplied[field]?.trim().length) continue;
      diagnostics.push({
        code: "adopt.missing-confirmation",
        severity: "error",
        message: `Candidate ${JSON.stringify(candidate.candidateId)} requires a confirmed ${field}.`,
        entryId: candidate.candidateId,
      });
    }
  }
  return sortDiagnostics(diagnostics);
}

async function validateTarget(target: string): Promise<readonly Diagnostic[]> {
  try {
    if ((await lstat(target)).isSymbolicLink()) return [invalidTarget(target)];
  } catch {
    return [invalidTarget(target)];
  }
  const loaded = await loadBundle({ reference: target, isRoot: true });
  if (!loaded.value) return loaded.diagnostics;
  const validated = validateBundle(loaded.value, { isRoot: true });
  return validated.value ? [] : validated.diagnostics;
}

async function validateProposedTarget(
  target: string,
  outputs: ReadonlyMap<string, string>,
): Promise<readonly Diagnostic[]> {
  const parent = dirname(target);
  let temporary: string | undefined;
  try {
    temporary = await mkdtemp(join(parent, ".orgmd-adopt-plan-"));
    await cp(target, temporary, { recursive: true, force: false });
    for (const [relativePath, content] of outputs) {
      const result = await atomicWriteFile(
        join(temporary, relativePath),
        new TextEncoder().encode(content),
        { overwrite: true, mode: 0o600 },
      );
      if (result.diagnostics.some(({ severity }) => severity === "error"))
        return result.diagnostics;
    }
    const loaded = await loadBundle({ reference: temporary, isRoot: true });
    if (!loaded.value) return loaded.diagnostics;
    const validated = validateBundle(loaded.value, { isRoot: true });
    return validated.value ? [] : validated.diagnostics;
  } catch {
    return [writeFailure(target)];
  } finally {
    if (temporary !== undefined)
      await rm(temporary, { recursive: true, force: true }).catch(
        () => undefined,
      );
  }
}

function failure(
  ...diagnostics: readonly Diagnostic[]
): OperationResult<never> {
  return { diagnostics: sortDiagnostics(diagnostics) };
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

function sourceOutputConflict(path: string): Diagnostic {
  return {
    code: "adopt.source-output-conflict",
    severity: "error",
    message: "Adoption never replaces its source Markdown file.",
    path,
  };
}

function writeFailure(path: string): Diagnostic {
  return {
    code: "adopt.write-failed",
    severity: "error",
    message: "Adoption could not validate or atomically write draft revisions.",
    path,
  };
}
