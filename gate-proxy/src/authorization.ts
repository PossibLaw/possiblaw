import { TOOL_BOUNDARIES } from "./boundary.ts";
import fs from "node:fs";

export const FIXED_GATE_AUTHORIZATION_TARGETS = [
  "receipts:verify",
  "receipts:bundle",
  "receipts:anchor",
  "quality:citation",
  "quality:authority",
  "receipts:facade",
  "receipts:deadline",
  "matters:classification:write",
  "matters:classification:read",
] as const;

export type FixedGateAuthorizationTarget = typeof FIXED_GATE_AUTHORIZATION_TARGETS[number];
export type EgressGateAuthorizationTarget = `egress:${keyof typeof TOOL_BOUNDARIES & string}`;
export type GateAuthorizationTarget = FixedGateAuthorizationTarget | EgressGateAuthorizationTarget;
export type GateRouteResolution =
  | { kind: "public" }
  | { kind: "protected"; target: GateAuthorizationTarget }
  | { kind: "invalid"; error: "invalid_tool" | "invalid_route" }
  | { kind: "unmapped" };
export type TrustedDestination =
  | { provider: "gdrive"; folderId: string }
  | { provider: "onedrive"; driveId: string; parentItemId: string };

export interface GateAuthorizationPolicy {
  version: 1;
  companyId: string | null;
  default: "deny";
  grants: Record<string, GateAuthorizationTarget[]>;
  destinations: Record<string, TrustedDestination>;
  destinationGrants: Record<string, string[]>;
}

export class GateAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateAuthorizationError";
  }
}

const SAFE_CONTROL_PLANE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_DESTINATION_ALIAS = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const MAX_AUTHORIZED_AGENTS = 512;
const MAX_TARGETS_PER_AGENT = 32;
const VALID_TARGETS: ReadonlySet<string> = new Set<string>([
  ...FIXED_GATE_AUTHORIZATION_TARGETS,
  ...Object.keys(TOOL_BOUNDARIES).map((tool) => `egress:${tool}`),
]);

export const DEFAULT_GATE_AUTHORIZATION: Readonly<GateAuthorizationPolicy> = Object.freeze({
  version: 1 as const,
  companyId: null,
  default: "deny" as const,
  grants: Object.freeze({}) as Record<string, GateAuthorizationTarget[]>,
  destinations: Object.freeze({}) as Record<string, TrustedDestination>,
  destinationGrants: Object.freeze({}) as Record<string, string[]>,
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseGateAuthorization(raw: unknown): GateAuthorizationPolicy {
  if (!isPlainObject(raw)) {
    throw new GateAuthorizationError("authorization must be a mapping");
  }
  const keys = Object.keys(raw).sort().join(",");
  if (keys !== "companyId,default,destinationGrants,destinations,grants,version") {
    throw new GateAuthorizationError(
      "authorization must contain exactly version, companyId, default, grants, destinations, and destinationGrants",
    );
  }
  if (raw["version"] !== 1) {
    throw new GateAuthorizationError("authorization.version must be 1");
  }
  if (typeof raw["companyId"] !== "string" || !SAFE_CONTROL_PLANE_ID.test(raw["companyId"])) {
    throw new GateAuthorizationError("authorization.companyId must be a valid control-plane ID");
  }
  if (raw["default"] !== "deny") {
    throw new GateAuthorizationError("authorization.default must be deny");
  }
  const grantsRaw = raw["grants"];
  if (!isPlainObject(grantsRaw)) {
    throw new GateAuthorizationError("authorization.grants must be a mapping");
  }
  const entries = Object.entries(grantsRaw);
  if (entries.length > MAX_AUTHORIZED_AGENTS) {
    throw new GateAuthorizationError(`authorization.grants must contain at most ${MAX_AUTHORIZED_AGENTS} agents`);
  }

  const grants: Record<string, GateAuthorizationTarget[]> = Object.create(null) as Record<string, GateAuthorizationTarget[]>;
  for (const [agentId, targetsRaw] of entries) {
    if (!SAFE_CONTROL_PLANE_ID.test(agentId)) {
      throw new GateAuthorizationError("authorization grant contains an invalid immutable agent ID");
    }
    if (!Array.isArray(targetsRaw) || targetsRaw.length > MAX_TARGETS_PER_AGENT) {
      throw new GateAuthorizationError(
        `authorization grant for ${agentId} must be a list with at most ${MAX_TARGETS_PER_AGENT} targets`,
      );
    }
    const targets: GateAuthorizationTarget[] = [];
    const seen = new Set<string>();
    for (const target of targetsRaw) {
      if (typeof target !== "string" || !VALID_TARGETS.has(target)) {
        throw new GateAuthorizationError(`authorization grant for ${agentId} contains an unknown target`);
      }
      if (seen.has(target)) {
        throw new GateAuthorizationError(`authorization grant for ${agentId} contains a duplicate target`);
      }
      seen.add(target);
      targets.push(target as GateAuthorizationTarget);
    }
    grants[agentId] = targets;
  }

  const destinationsRaw = raw["destinations"];
  if (!isPlainObject(destinationsRaw) || Object.keys(destinationsRaw).length > 64) {
    throw new GateAuthorizationError("authorization.destinations must be a bounded mapping");
  }
  const destinations: Record<string, TrustedDestination> = Object.create(null) as Record<string, TrustedDestination>;
  const safeVendorId = (value: unknown): value is string =>
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 512 &&
    !/[/\s\u0000-\u001f\u007f]/.test(value);
  for (const [alias, destinationRaw] of Object.entries(destinationsRaw)) {
    if (!SAFE_DESTINATION_ALIAS.test(alias) || !isPlainObject(destinationRaw)) {
      throw new GateAuthorizationError("authorization contains an invalid trusted destination");
    }
    if (destinationRaw["provider"] === "gdrive") {
      if (
        Object.keys(destinationRaw).sort().join(",") !== "folderId,provider" ||
        !safeVendorId(destinationRaw["folderId"])
      ) {
        throw new GateAuthorizationError("gdrive destination requires exactly provider and a safe folderId");
      }
      destinations[alias] = { provider: "gdrive", folderId: destinationRaw["folderId"] };
      continue;
    }
    if (destinationRaw["provider"] === "onedrive") {
      if (
        Object.keys(destinationRaw).sort().join(",") !== "driveId,parentItemId,provider" ||
        !safeVendorId(destinationRaw["driveId"]) ||
        !safeVendorId(destinationRaw["parentItemId"])
      ) {
        throw new GateAuthorizationError(
          "onedrive destination requires exactly provider, driveId, and parentItemId",
        );
      }
      destinations[alias] = {
        provider: "onedrive",
        driveId: destinationRaw["driveId"],
        parentItemId: destinationRaw["parentItemId"],
      };
      continue;
    }
    throw new GateAuthorizationError("authorization contains an unknown trusted destination provider");
  }

  const destinationGrantsRaw = raw["destinationGrants"];
  if (!isPlainObject(destinationGrantsRaw) || Object.keys(destinationGrantsRaw).length > MAX_AUTHORIZED_AGENTS) {
    throw new GateAuthorizationError("authorization.destinationGrants must be a bounded mapping");
  }
  const destinationGrants: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [agentId, aliasesRaw] of Object.entries(destinationGrantsRaw)) {
    if (!SAFE_CONTROL_PLANE_ID.test(agentId) || !Array.isArray(aliasesRaw) || aliasesRaw.length > 32) {
      throw new GateAuthorizationError("authorization contains an invalid destination grant");
    }
    const aliases: string[] = [];
    for (const alias of aliasesRaw) {
      if (
        typeof alias !== "string" ||
        !Object.prototype.hasOwnProperty.call(destinations, alias) ||
        aliases.includes(alias)
      ) {
        throw new GateAuthorizationError("authorization contains an unknown or duplicate destination grant");
      }
      aliases.push(alias);
    }
    destinationGrants[agentId] = aliases;
  }

  return {
    version: 1,
    companyId: raw["companyId"],
    default: "deny",
    grants,
    destinations,
    destinationGrants,
  };
}

export function loadGateAuthorization(
  filePath: string | undefined,
  expectedCompanyId: string,
): GateAuthorizationPolicy {
  if (filePath === undefined || filePath === "") {
    throw new GateAuthorizationError("GATE_AUTHORIZATION_PATH is required for authenticated gate operation");
  }
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new GateAuthorizationError("runtime gate authorization could not be read");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GateAuthorizationError("runtime gate authorization is not valid JSON");
  }
  const policy = parseGateAuthorization(parsed);
  if (policy.companyId !== expectedCompanyId) {
    throw new GateAuthorizationError("runtime gate authorization company mismatch");
  }
  return policy;
}

export function cloneGateAuthorization(
  policy: Readonly<GateAuthorizationPolicy>,
): GateAuthorizationPolicy {
  return {
    version: 1,
    companyId: policy.companyId,
    default: "deny",
    grants: Object.fromEntries(
      Object.entries(policy.grants).map(([slug, targets]) => [slug, [...targets]]),
    ),
    destinations: Object.fromEntries(
      Object.entries(policy.destinations).map(([alias, destination]) => [alias, { ...destination }]),
    ),
    destinationGrants: Object.fromEntries(
      Object.entries(policy.destinationGrants).map(([agentId, aliases]) => [agentId, [...aliases]]),
    ),
  };
}

export function resolveTrustedDestination(
  policy: Readonly<GateAuthorizationPolicy>,
  agentId: string,
  alias: string,
): TrustedDestination | null {
  const allowedAliases = policy.destinationGrants[agentId];
  if (!Array.isArray(allowedAliases) || !allowedAliases.includes(alias)) return null;
  const destination = policy.destinations[alias];
  return destination === undefined ? null : { ...destination };
}

export function isGateRequestAuthorized(
  policy: Readonly<GateAuthorizationPolicy>,
  agentId: string,
  target: GateAuthorizationTarget,
): boolean {
  const grants = policy.grants[agentId];
  return Array.isArray(grants) && grants.includes(target);
}

export function resolveGateRoute(
  method: string,
  url: string,
): GateRouteResolution {
  if (method === "GET" && (url === "/health" || url === "/ready")) return { kind: "public" };
  let parsed: URL;
  try {
    parsed = new URL(url, "http://gate.invalid");
  } catch {
    return { kind: "invalid", error: "invalid_route" };
  }
  const pathname = parsed.pathname;
  if (method === "GET" && pathname === "/receipts/verify" && parsed.search === "") {
    return { kind: "protected", target: "receipts:verify" };
  }
  if (method === "GET" && pathname === "/receipts/bundle") {
    return { kind: "protected", target: "receipts:bundle" };
  }
  if (method === "POST" && pathname === "/receipts/anchor" && parsed.search === "") {
    return { kind: "protected", target: "receipts:anchor" };
  }
  if (method === "POST" && pathname === "/quality/citation" && parsed.search === "") {
    return { kind: "protected", target: "quality:citation" };
  }
  if (method === "POST" && pathname === "/quality/authority" && parsed.search === "") {
    return { kind: "protected", target: "quality:authority" };
  }
  if (method === "POST" && pathname === "/receipts/facade" && parsed.search === "") {
    return { kind: "protected", target: "receipts:facade" };
  }
  if (method === "POST" && pathname === "/receipts/deadline" && parsed.search === "") {
    return { kind: "protected", target: "receipts:deadline" };
  }
  if (method === "POST" && pathname === "/matters/classification" && parsed.search === "") {
    return { kind: "protected", target: "matters:classification:write" };
  }
  if (method === "GET" && pathname === "/matters/classification") {
    return { kind: "protected", target: "matters:classification:read" };
  }

  const egressMatch = method === "POST" ? pathname.match(/^\/egress\/([^/]+)$/) : null;
  if (egressMatch !== null) {
    let tool: string;
    try {
      tool = decodeURIComponent(egressMatch[1]);
    } catch {
      return { kind: "invalid", error: "invalid_tool" };
    }
    const target = `egress:${tool}`;
    return VALID_TARGETS.has(target)
      ? { kind: "protected", target: target as GateAuthorizationTarget }
      : { kind: "invalid", error: "invalid_tool" };
  }
  return { kind: "unmapped" };
}
