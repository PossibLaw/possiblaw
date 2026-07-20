import crypto from "node:crypto";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 4096;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

export class StartupAttestationConfigError extends Error {
  constructor(message: string) {
    super(`startup attestation configuration invalid: ${message}`);
    this.name = "StartupAttestationConfigError";
  }
}

export interface StartupAttestationConfig {
  instanceId: string;
  startupSecret?: string;
}

/**
 * Resolve the launcher's one-time startup attestation inputs. Local mode keeps
 * the existing generated instance identity, while any attempt to configure
 * attestation must supply both fields in a strict, non-ambiguous shape.
 */
export function resolveStartupAttestationEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  randomUUID: () => string = crypto.randomUUID,
): StartupAttestationConfig {
  const instanceId = env["GATE_INSTANCE_ID"];
  const startupSecret = env["GATE_STARTUP_SECRET"];

  if (instanceId === undefined && startupSecret === undefined) {
    return { instanceId: randomUUID() };
  }
  if (instanceId === undefined || startupSecret === undefined) {
    throw new StartupAttestationConfigError("instance id and startup secret must be supplied together");
  }
  if (!UUID_V4_RE.test(instanceId)) {
    throw new StartupAttestationConfigError("instance id must be a canonical lowercase UUIDv4");
  }
  const secretBytes = Buffer.byteLength(startupSecret, "utf8");
  if (
    secretBytes < MIN_SECRET_BYTES ||
    secretBytes > MAX_SECRET_BYTES ||
    CONTROL_CHAR_RE.test(startupSecret)
  ) {
    throw new StartupAttestationConfigError(
      `startup secret must be ${MIN_SECRET_BYTES}-${MAX_SECRET_BYTES} UTF-8 bytes without control characters`,
    );
  }

  return { instanceId, startupSecret };
}

/**
 * Exact launcher/gate wire contract. Do not change separators or field order
 * without a coordinated launcher migration.
 */
export function createStartupProof(
  startupSecret: string,
  instanceId: string,
  companyId: string,
  policyDigest: string,
): string {
  return crypto
    .createHmac("sha256", startupSecret)
    .update(instanceId + "\n" + companyId + "\n" + policyDigest)
    .digest("hex");
}
