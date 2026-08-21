export { sortDiagnostics, compareUtf8Bytes } from "./diagnostics/sort.js";
export type {
  Diagnostic,
  OperationResult,
  Severity,
} from "./diagnostics/types.js";
export type {
  Bundle,
  BundleMetadata,
  Domain,
  EntryRevision,
  LifecycleRecord,
  ParsedEntryRevision,
  RatificationStatus,
  ValidatedBundle,
} from "./model/types.js";
export { loadBundle, type LoadBundleInput } from "./bundle/load.js";
export {
  parseContentFile,
  type ParseContentFileInput,
  type ParserLimits,
} from "./parser/content-file.js";
export {
  bundleMetadataCanonicalForm,
  entryCanonicalForm,
  IdentifierError,
  normalizeBody,
} from "./identifiers/canonical.js";
export {
  computeBundleDigestInput,
  computeContentId,
  metadataDigest,
  sha256Hex,
} from "./identifiers/content-id.js";
export {
  computeContextId,
  type BundleFailure,
  type BundleFailureCode,
  type BundleVersion,
  type ContextIdInput,
} from "./identifiers/context-id.js";
export { resolveContext } from "./resolver/resolve.js";
export {
  actionContains,
  effectStrength,
  isValidAction,
} from "./resolver/actions.js";
export { serializeEffectiveContext } from "./resolver/serialize.js";
export { doctorBundle, doctorExitCode } from "./doctor/doctor.js";
export type {
  DoctorFinding,
  DoctorInput,
  DoctorReport,
  DomainRatio,
} from "./doctor/types.js";
export { compileContext } from "./compiler/compile.js";
export type {
  CompiledProjection,
  CompileResult,
  CompileTarget,
} from "./compiler/types.js";
export { createScopeLattice, type ScopeLattice } from "./resolver/scopes.js";
export type {
  ResolutionError,
  ResolvedContext,
  ResolvedEntry,
  ResolveRequest,
  ResolveResult,
  StaleReason,
  WithheldMarker,
} from "./resolver/types.js";
export {
  validateBundle,
  validateBundlePath,
  type ValidateBundleOptions,
} from "./validation/validate.js";
export { atomicWriteFile, type AtomicWriteOptions } from "./io/atomic.js";
export { planInit, writeInitPlan, type InitWriteOptions } from "./init/init.js";
export type { InitInput, InitPlan, InitPlanFile } from "./init/types.js";
export {
  previewAdoption,
  writeAdoption,
  type AdoptIo,
  type AdoptWriteOptions,
} from "./importer/adopt.js";
export type {
  AdoptCandidate,
  AdoptConfirmationField,
  AdoptConfirmations,
  AdoptDomain,
  AdoptInput,
  AdoptPreview,
  AdoptPreviewResult,
} from "./importer/types.js";
export { ORGMD_VERSION } from "./version.js";
