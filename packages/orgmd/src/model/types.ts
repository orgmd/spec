export type Domain =
  | "identity"
  | "glossary"
  | "decision"
  | "policy"
  | "ownership"
  | "done"
  | string;

export type RatificationStatus = "draft" | "approved" | "rejected";

export interface ParsedEntryRevision {
  readonly frontMatter: Readonly<Record<string, unknown>>;
  readonly body: string;
  readonly domain: Domain;
  readonly sourcePath: string;
  readonly line: number;
}

export interface EntryRevision {
  readonly id: string;
  readonly owner: string;
  readonly scope: string;
  readonly status: RatificationStatus;
  readonly source: string;
  readonly rev: number;
  readonly domain: Domain;
  readonly body: string;
  readonly sourcePath: string;
  readonly line: number;
  readonly revisit?: string;
  readonly ref?: string;
  readonly upstream?: Readonly<Record<string, unknown>>;
  readonly action?: string;
  readonly effect?: "allow" | "escalate" | "deny";
  readonly route?: string;
  readonly delegates?: readonly string[];
  readonly extra: Readonly<Record<string, unknown>>;
}

export interface LifecycleRecord {
  readonly state: "contested" | "retired";
  readonly by: string;
  readonly date: string;
  readonly ref?: string;
}

export interface BundleMetadata {
  readonly bundle?: string;
  readonly scopes?: Readonly<
    Record<string, { readonly narrower_than: readonly string[] }>
  >;
  readonly graceDays?: number;
  readonly lifecycle: Readonly<Record<string, LifecycleRecord>>;
}

export interface Bundle {
  readonly reference: string;
  readonly path: string;
  readonly nodePath?: string;
  readonly isRoot: boolean;
  readonly identityMetadata: Readonly<Record<string, unknown>>;
  readonly entries: readonly ParsedEntryRevision[];
}

declare const validatedBundle: unique symbol;

export interface ValidatedBundle {
  readonly reference: string;
  readonly path: string;
  readonly nodePath?: string;
  readonly isRoot: boolean;
  readonly metadata: BundleMetadata;
  readonly entries: readonly EntryRevision[];
  readonly [validatedBundle]: true;
}
