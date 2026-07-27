// trace-store/src/index.ts — public surface of the execution trace spine.

export type {
  CaptureMode,
  ContextRef,
  ModelLane,
  TraceContent,
  TraceInput,
  TraceOutcome,
  TraceRecord,
  TraceRole,
} from "./types.ts";
export { TRACE_ROLES } from "./types.ts";

export type { TraceConfig } from "./config.ts";
export { loadTraceConfig, closedTraceConfig, DEFAULT_RETENTION_DAYS } from "./config.ts";

export {
  canonicalJson,
  contentSha256,
  makeTraceRecord,
  sha256hex,
  withoutContent,
  EMPTY_CONTENT_SHA256,
} from "./record.ts";
export type { MakeTraceOptions } from "./record.ts";

export { canViewContent, redactForRole, redactManyForRole } from "./visibility.ts";

export {
  isModelLane,
  laneTraceFields,
  loadVariants,
  parseVariants,
  resolveLane,
  LaneResolutionError,
} from "./lane-resolver.ts";
export type {
  ResolvedLane,
  VariantDataTerms,
  VariantDefinition,
  VariantsConfig,
} from "./lane-resolver.ts";

export {
  appendTrace,
  readTrace,
  readTraces,
  purgeExpiredContent,
  tracePartitionPath,
  TraceStoreError,
  UNFILED_PARTITION,
} from "./store.ts";
export type { PurgeOptions, PurgeResult } from "./store.ts";
