import { compareUtf8Bytes, sortDiagnostics } from "../diagnostics/sort.js";
import type { EntryRevision } from "../model/types.js";
import { selectEffectiveRevisions } from "../resolver/revisions.js";
import type { ResolutionError } from "../resolver/types.js";
import { isCalendarDate } from "../validation/calendar-date.js";
import type {
  DoctorFinding,
  DoctorInput,
  DoctorReport,
  DomainRatio,
} from "./types.js";

export function doctorBundle(input: DoctorInput): DoctorReport {
  const findings: DoctorFinding[] = [];
  const selections = selectEffectiveRevisions(input.bundle, 0);
  const effective = selections.flatMap(({ revision }) =>
    revision === undefined ? [] : [revision],
  );
  const validToday = isCalendarDate(input.today);

  if (!validToday) {
    findings.push(
      finding(
        "doctor.invalid-date",
        "The supplied doctor date is not an ISO 8601 calendar date.",
      ),
    );
  }

  const resolvableRoles = new Set(
    effective
      .filter(({ domain }) => domain === "ownership")
      .map(({ owner }) => owner),
  );
  const fallback = effective.some(
    ({ id, domain }) => id === "own.last-resort" && domain === "ownership",
  )
    ? "own.last-resort"
    : undefined;

  for (const revision of effective) {
    inspectRevisit(revision, input.today, validToday, findings);
    inspectOwner(revision, resolvableRoles, fallback, findings);
    if (revision.source.startsWith("synced:")) {
      findings.push(
        advisory(
          "doctor.synced-source",
          "This entry is maintained from a synchronized source.",
          revision,
        ),
      );
    }
  }

  const pending = collectPending(input.bundle.entries, selections);
  for (const item of pending) {
    findings.push(
      advisory(
        "doctor.pending-revision",
        "This entry has unratified draft revisions above its approved revision.",
        item.revision,
        { pending: item.drafts.length },
        "warning",
      ),
    );
    if (hasKnownDivergence(item.drafts)) {
      findings.push(
        finding(
          "doctor.upstream-divergence",
          "Pending draft revisions diverge in their recorded upstream metadata.",
          item.revision,
        ),
      );
    }
  }

  for (const error of input.context?.resolutionErrors ?? []) {
    findings.push(resolutionFinding(error));
  }
  findings.push(...upstreamStalenessFindings(input));

  return Object.freeze({
    findings: Object.freeze(sortDiagnostics(findings) as DoctorFinding[]),
    ratios: ratiosFor(effective),
    pendingRevisions: pending.reduce(
      (count, item) => count + item.drafts.length,
      0,
    ),
  });
}

export function doctorExitCode(report: DoctorReport): 0 | 1 {
  return report.findings.some(({ blocking }) => blocking) ? 1 : 0;
}

function inspectRevisit(
  revision: EntryRevision,
  today: string,
  validToday: boolean,
  findings: DoctorFinding[],
): void {
  if (revision.revisit === undefined) {
    findings.push(
      (revision.domain === "decision" || revision.domain === "policy"
        ? finding(
            "doctor.missing-revisit",
            "Decision and policy entries require a revisit date.",
            revision,
          )
        : advisory(
            "doctor.revisit-recommended",
            "A revisit date is recommended for this entry.",
            revision,
          )) as DoctorFinding,
    );
    return;
  }
  if (!isCalendarDate(revision.revisit)) {
    findings.push(
      finding(
        "doctor.invalid-date",
        "This entry has an invalid ISO 8601 revisit date.",
        revision,
      ),
    );
    return;
  }
  if (validToday && revision.revisit < today) {
    findings.push(
      finding(
        "doctor.overdue-revisit",
        "This entry's revisit date is before the supplied doctor date.",
        revision,
      ),
    );
  }
}

function inspectOwner(
  revision: EntryRevision,
  resolvableRoles: ReadonlySet<string>,
  fallback: string | undefined,
  findings: DoctorFinding[],
): void {
  if (resolvableRoles.has(revision.owner)) return;
  findings.push(
    finding(
      "doctor.orphaned-owner",
      "This entry's owner role does not resolve through effective ownership entries.",
      revision,
      fallback === undefined ? undefined : { fallback },
    ),
  );
}

function collectPending(
  entries: readonly EntryRevision[],
  selections: ReturnType<typeof selectEffectiveRevisions>,
): readonly {
  readonly revision: EntryRevision;
  readonly drafts: readonly EntryRevision[];
}[] {
  const result = selections.flatMap((selection) => {
    if (selection.state !== "pending" || selection.revision === undefined) {
      return [];
    }
    const drafts = entries
      .filter(
        ({ id, status, rev }) =>
          id === selection.id &&
          status === "draft" &&
          rev > selection.revision!.rev,
      )
      .sort((left, right) => left.rev - right.rev);
    return drafts.length === 0
      ? []
      : [
          Object.freeze({
            revision: selection.revision,
            drafts: Object.freeze(drafts),
          }),
        ];
  });
  return Object.freeze(result);
}

function hasKnownDivergence(drafts: readonly EntryRevision[]): boolean {
  if (drafts.length < 2) return false;
  const sources = new Set(
    drafts.map(({ source }) =>
      source.startsWith("synced:") ? "synced" : "native",
    ),
  );
  if (sources.size > 1) return true;
  const digests = new Set(
    drafts.map(({ upstream }) =>
      typeof upstream?.digest === "string" ? upstream.digest : undefined,
    ),
  );
  return digests.size > 1;
}

function resolutionFinding(error: ResolutionError): DoctorFinding {
  const visible = error.id !== undefined && error.id_withheld !== true;
  return finding(
    "doctor.resolution-error",
    visible
      ? "A resolution error prevents this entry from resolving."
      : "A resolution error above the available clearance prevents an entry from resolving.",
    undefined,
    { resolutionCode: error.code },
    { path: error.node, ...(visible ? { entryId: error.id } : {}) },
  );
}

function upstreamStalenessFindings(
  input: DoctorInput,
): readonly DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const reported = new Set<string>();
  for (const entry of input.context?.entries ?? []) {
    if ("withheld" in entry || !entry.staleReasons.includes("upstream")) {
      continue;
    }
    const key = `${String(entry.bundleIndex)}\0${entry.revision.id}`;
    if (reported.has(key)) continue;
    reported.add(key);
    findings.push(
      finding(
        "doctor.orphaned-upstream",
        "This entry's recorded upstream reference no longer resolves.",
        entry.revision,
      ),
    );
  }
  return Object.freeze(findings);
}

function ratiosFor(entries: readonly EntryRevision[]): readonly DomainRatio[] {
  const counts = new Map<string, { native: number; synced: number }>();
  for (const entry of entries) {
    const count = counts.get(entry.domain) ?? { native: 0, synced: 0 };
    if (entry.source === "native") count.native += 1;
    if (entry.source.startsWith("synced:")) count.synced += 1;
    counts.set(entry.domain, count);
  }
  return Object.freeze(
    [...counts.entries()]
      .sort(([left], [right]) => compareUtf8Bytes(left, right))
      .map(([domain, { native, synced }]) => {
        const total = native + synced;
        return Object.freeze({
          domain,
          native,
          synced,
          syncedPercent:
            total === 0 ? 0 : Number(((synced * 100) / total).toFixed(2)),
        });
      }),
  );
}

function finding(
  code: string,
  message: string,
  revision?: EntryRevision,
  details?: Readonly<Record<string, unknown>>,
  location: Partial<Pick<DoctorFinding, "path" | "entryId">> = {},
): DoctorFinding {
  return Object.freeze({
    code,
    severity: "error",
    blocking: true,
    message,
    ...(revision === undefined
      ? {}
      : {
          path: revision.sourcePath,
          line: revision.line,
          entryId: revision.id,
        }),
    ...location,
    ...(details === undefined
      ? {}
      : { details: Object.freeze({ ...details }) }),
  });
}

function advisory(
  code: string,
  message: string,
  revision: EntryRevision,
  details?: Readonly<Record<string, unknown>>,
  severity: "warning" | "info" = "info",
): DoctorFinding {
  return Object.freeze({
    code,
    severity,
    blocking: false,
    message,
    path: revision.sourcePath,
    line: revision.line,
    entryId: revision.id,
    ...(details === undefined
      ? {}
      : { details: Object.freeze({ ...details }) }),
  });
}
