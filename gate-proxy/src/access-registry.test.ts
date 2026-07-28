// gate-proxy/src/access-registry.test.ts
// C3 PR 2 — the fold of the firm baseline with receipted override events.
//
// The ordering suite below is the point of this file. C3's revocation semantics
// INVERT versus matter-classification.ts: there a later, lower registration is
// ignored; here a later revoke must WIN, including over the baseline. Building
// it by analogy produces a wall that cannot be taken down, so every interleaving
// is asserted explicitly rather than reasoned about.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReceiptChain } from "./receipts.ts";
import {
  APPROVER_DENIAL,
  MatterAccessRegistry,
  MatterAccessRegistryError,
  checkApprover,
} from "./access-registry.ts";
import { compileMatterAccess, parseMatterAccessDocument } from "./matter-access.ts";
import type { CompiledMatterAccess } from "./matter-access.ts";

const JANE = "user-jane";
const OWNER = "user-owner";
const ADMIN = "user-admin";
const M142 = "uuid-142";
const M207 = "uuid-207";

const DIRECTORY = {
  usersByEmail: {
    "jane.doe@firm.com": [JANE],
    "owner@firm.com": [OWNER],
    "admin@firm.com": [ADMIN],
  },
  issuesByIdentifier: { "LEG-142": [M142], "LEG-207": [M207] },
};

function baseline(matterAccess: Record<string, string[]>, decisionAuthority: Record<string, string[]> = {}): CompiledMatterAccess {
  return compileMatterAccess(
    parseMatterAccessDocument({ version: 1, default: "deny", matterAccess, decisionAuthority }),
    DIRECTORY,
  );
}

/** Baseline granting Jane LEG-142. */
const JANE_HAS_142 = baseline({ "jane.doe@firm.com": ["LEG-142"] });
/** Baseline granting nobody anything. */
const DENY_ALL = baseline({});

function tmpChain(): ReceiptChain {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-access-registry-test-"));
  return new ReceiptChain(path.join(dir, "r.jsonl"));
}

const HOUR = 3600_000;
function futureIso(ms = HOUR): string {
  return new Date(Date.now() + ms).toISOString();
}

function registry(chain: ReceiptChain, base: CompiledMatterAccess, now?: () => number) {
  return new MatterAccessRegistry(chain, base, now);
}

// ---------------------------------------------------------------------------
// The ordering table — spec section 3.4
// ---------------------------------------------------------------------------

describe("access registry — ordering interleavings", () => {
  it("1. baseline grant, no events -> allowed", () => {
    const r = registry(tmpChain(), JANE_HAS_142);
    assert.equal(r.isEntitled(JANE, M142), true);
  });

  it("2. baseline grant -> revoke -> DENIED (revoke beats the baseline)", () => {
    const chain = tmpChain();
    registry(chain, JANE_HAS_142).revoke({ subject: JANE, matter: M142, actor: ADMIN });
    assert.equal(registry(chain, JANE_HAS_142).isEntitled(JANE, M142), false);
  });

  it("3. baseline grant -> revoke -> grant -> allowed (later chain position wins)", () => {
    const chain = tmpChain();
    const r = registry(chain, JANE_HAS_142);
    r.revoke({ subject: JANE, matter: M142, actor: ADMIN });
    r.grant({ subject: JANE, matter: M142, actor: ADMIN, expiresAt: futureIso() });
    assert.equal(registry(chain, JANE_HAS_142).isEntitled(JANE, M142), true);
  });

  it("4. no baseline -> grant -> allowed until expiry", () => {
    const chain = tmpChain();
    registry(chain, DENY_ALL).grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: futureIso() });
    assert.equal(registry(chain, DENY_ALL).isEntitled(JANE, M207), true);
  });

  it("5. no baseline -> grant -> clock passes expiry -> denied", () => {
    const chain = tmpChain();
    registry(chain, DENY_ALL).grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: futureIso(HOUR) });
    const later = () => Date.now() + 2 * HOUR;
    assert.equal(registry(chain, DENY_ALL, later).isEntitled(JANE, M207), false);
  });

  it("6. baseline grant -> revoke -> reload still granting -> allowed (new epoch supersedes)", () => {
    const chain = tmpChain();
    registry(chain, JANE_HAS_142).revoke({ subject: JANE, matter: M142, actor: ADMIN });
    // The firm edits the roster and the gate reloads it: same grant, new epoch.
    const reloaded = baseline({ "jane.doe@firm.com": ["LEG-142", "LEG-207"] });
    registry(chain, JANE_HAS_142).recordDocumentEpoch(reloaded.documentSha256);
    assert.equal(registry(chain, reloaded).isEntitled(JANE, M142), true);
  });

  it("7. baseline grant -> reload omitting the pair -> denied", () => {
    const chain = tmpChain();
    const reloaded = DENY_ALL;
    registry(chain, JANE_HAS_142).recordDocumentEpoch(reloaded.documentSha256);
    assert.equal(registry(chain, reloaded).isEntitled(JANE, M142), false);
  });

  it("8. two grants, later one with a SHORTER expiry -> shorter applies (later wins even when less permissive)", () => {
    const chain = tmpChain();
    const r = registry(chain, DENY_ALL);
    r.grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: futureIso(4 * HOUR) });
    r.grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: futureIso(HOUR) });
    const later = () => Date.now() + 2 * HOUR;
    assert.equal(registry(chain, DENY_ALL, later).isEntitled(JANE, M207), false);
  });

  it("9. self-granted override -> rejected at write, no receipt appended", () => {
    const chain = tmpChain();
    const before = chain.entries().length;
    assert.throws(
      () => registry(chain, DENY_ALL).grant({ subject: JANE, matter: M207, actor: JANE, expiresAt: futureIso() }),
      MatterAccessRegistryError,
    );
    assert.equal(chain.entries().length, before);
  });

  it("10. expiresAt in the past -> rejected at write", () => {
    const chain = tmpChain();
    assert.throws(
      () => registry(chain, DENY_ALL).grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: futureIso(-HOUR) }),
      MatterAccessRegistryError,
    );
    assert.equal(chain.entries().length, 0);
  });

  it("11. corrupt chain -> all reads deny and writes throw", () => {
    const chain = tmpChain();
    registry(chain, JANE_HAS_142).grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: futureIso() });
    const file = chain.path;
    const lines = fs.readFileSync(file, "utf8").trimEnd().split("\n");
    lines[0] = lines[0]!.replace(/"tool":"[^"]*"/, '"tool":"tampered"');
    fs.writeFileSync(file, `${lines.join("\n")}\n`);

    const r = registry(new ReceiptChain(file), JANE_HAS_142);
    // Baseline said yes. A chain we cannot verify means no readable
    // entitlements, so this must be false — the inverse of
    // MatterClassificationRegistry, which degrades to "no floors".
    assert.equal(r.isEntitled(JANE, M142), false);
    assert.throws(
      () => r.grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: futureIso() }),
      MatterAccessRegistryError,
    );
  });

  it("12. two events in the same millisecond -> chain order decides, not the timestamp", () => {
    const chain = tmpChain();
    const FROZEN = 1_800_000_000_000;
    const frozen = () => FROZEN;
    // Expiry is built from the FROZEN clock, so the grant is unambiguously live
    // and only append order can explain the outcome.
    const stillLive = new Date(FROZEN + 24 * HOUR).toISOString();
    const r = registry(chain, DENY_ALL, frozen);
    r.grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: stillLive });
    assert.equal(registry(chain, DENY_ALL, frozen).isEntitled(JANE, M207), true);
    r.revoke({ subject: JANE, matter: M207, actor: ADMIN });
    // Same frozen clock for both receipts: nothing but chain order distinguishes
    // them, and the later revoke wins.
    assert.equal(registry(chain, DENY_ALL, frozen).isEntitled(JANE, M207), false);
  });

  it("12b. reversed order at the same instant gives the opposite answer", () => {
    const chain = tmpChain();
    const FROZEN = 1_800_000_000_000;
    const frozen = () => FROZEN;
    const r = registry(chain, JANE_HAS_142, frozen);
    r.revoke({ subject: JANE, matter: M142, actor: ADMIN });
    r.grant({ subject: JANE, matter: M142, actor: ADMIN, expiresAt: new Date(FROZEN + HOUR).toISOString() });
    assert.equal(registry(chain, JANE_HAS_142, frozen).isEntitled(JANE, M142), true);
  });
});

// ---------------------------------------------------------------------------
// Write-path contracts
// ---------------------------------------------------------------------------

describe("access registry — override write path", () => {
  it("appends an authorization receipt carrying ids and enums only", () => {
    const chain = tmpChain();
    registry(chain, DENY_ALL).grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: futureIso() });
    const entry = chain.entries().at(-1)!;
    assert.equal(entry.body.kind, "authorization");
    assert.equal(entry.body.tool, "matter_access");
    assert.equal(entry.body.meta?.["reason"], "access_override");
    assert.equal(entry.body.meta?.["subject"], JANE);
    assert.equal(entry.body.meta?.["grantedBy"], ADMIN);
    // No content, ever: the receipt is designed to travel.
    assert.equal(JSON.stringify(entry.body).includes("jane.doe@firm.com"), false);
  });

  it("records a revoke with its own reason so the two are distinguishable on the chain", () => {
    const chain = tmpChain();
    registry(chain, JANE_HAS_142).revoke({ subject: JANE, matter: M142, actor: ADMIN });
    assert.equal(chain.entries().at(-1)!.body.meta?.["reason"], "access_revoke");
  });

  it("allows a principal to revoke their own access (reducing your own reach is safe)", () => {
    const chain = tmpChain();
    registry(chain, JANE_HAS_142).revoke({ subject: JANE, matter: M142, actor: JANE });
    assert.equal(registry(chain, JANE_HAS_142).isEntitled(JANE, M142), false);
  });

  it("rejects a malformed expiresAt", () => {
    assert.throws(
      () => registry(tmpChain(), DENY_ALL).grant({ subject: JANE, matter: M207, actor: ADMIN, expiresAt: "soon" }),
      MatterAccessRegistryError,
    );
  });

  it("rejects unsafe subject or matter ids", () => {
    const r = registry(tmpChain(), DENY_ALL);
    assert.throws(() => r.grant({ subject: "../x", matter: M207, actor: ADMIN, expiresAt: futureIso() }), MatterAccessRegistryError);
    assert.throws(() => r.grant({ subject: JANE, matter: "a b", actor: ADMIN, expiresAt: futureIso() }), MatterAccessRegistryError);
  });
});

// ---------------------------------------------------------------------------
// Decision authority — the second, orthogonal question
// ---------------------------------------------------------------------------

describe("access registry — decision authority", () => {
  const OWNER_MONEY = baseline({}, { MONEY_MOVEMENT: ["owner@firm.com"] });

  it("grants a listed principal authority over that boundary", () => {
    assert.equal(registry(tmpChain(), OWNER_MONEY).hasDecisionAuthority(OWNER, "MONEY_MOVEMENT"), true);
  });

  it("denies an unlisted principal", () => {
    assert.equal(registry(tmpChain(), OWNER_MONEY).hasDecisionAuthority(JANE, "MONEY_MOVEMENT"), false);
  });

  it("denies a boundary the principal does not hold", () => {
    assert.equal(registry(tmpChain(), OWNER_MONEY).hasDecisionAuthority(OWNER, "COURT_FILING"), false);
  });

  it("does NOT imply matter entitlement — this is what keeps ethical walls standing", () => {
    const r = registry(tmpChain(), OWNER_MONEY);
    assert.equal(r.hasDecisionAuthority(OWNER, "MONEY_MOVEMENT"), true);
    assert.equal(r.isEntitled(OWNER, M142), false);
  });

  it("denies all authority over a corrupt chain", () => {
    const chain = tmpChain();
    registry(chain, OWNER_MONEY).revoke({ subject: JANE, matter: M142, actor: ADMIN });
    const lines = fs.readFileSync(chain.path, "utf8").trimEnd().split("\n");
    lines[0] = lines[0]!.replace(/"tool":"[^"]*"/, '"tool":"tampered"');
    fs.writeFileSync(chain.path, `${lines.join("\n")}\n`);
    assert.equal(
      new MatterAccessRegistry(new ReceiptChain(chain.path), OWNER_MONEY).hasDecisionAuthority(OWNER, "MONEY_MOVEMENT"),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Entitlement over a set — the contamination case C1/C2 exposes
// ---------------------------------------------------------------------------

describe("access registry — entitlement across contributing matters", () => {
  it("requires entitlement to EVERY matter, not just the filed one", () => {
    const r = registry(tmpChain(), JANE_HAS_142);
    assert.equal(r.isEntitledToAll(JANE, [M142]), true);
    // LEG-207 contributed context but Jane is not on it.
    assert.equal(r.isEntitledToAll(JANE, [M142, M207]), false);
  });

  it("treats an empty matter set as entitled — nothing to check is not a denial", () => {
    assert.equal(registry(tmpChain(), DENY_ALL).isEntitledToAll(JANE, []), true);
  });

  it("de-duplicates repeated matters without changing the answer", () => {
    const r = registry(tmpChain(), JANE_HAS_142);
    assert.equal(r.isEntitledToAll(JANE, [M142, M142, M142]), true);
  });
});

// ---------------------------------------------------------------------------
// checkApprover — the C3 PR 3 enforcement adapter
// ---------------------------------------------------------------------------

describe("checkApprover", () => {
  const OWNER_MONEY_AND_142 = baseline(
    { "owner@firm.com": ["LEG-142"] },
    { MONEY_MOVEMENT: ["owner@firm.com"] },
  );

  function check(
    enforcement: "off" | "on",
    input: { approverUserId: string | undefined; boundary: Parameters<typeof checkApprover>[2]["boundary"]; matters: readonly string[] },
    base = OWNER_MONEY_AND_142,
  ) {
    return checkApprover(registry(tmpChain(), base), enforcement, input);
  }

  it("passes everything when enforcement is off — the roster loads but does not bite", () => {
    const v = check("off", { approverUserId: undefined, boundary: "MONEY_MOVEMENT", matters: [M207] });
    assert.equal(v.ok, true);
  });

  it("allows an approver holding both authority and entitlement", () => {
    const v = check("on", { approverUserId: OWNER, boundary: "MONEY_MOVEMENT", matters: [M142] });
    assert.equal(v.ok, true);
  });

  it("denies when no authenticated human is named", () => {
    const v = check("on", { approverUserId: undefined, boundary: "MONEY_MOVEMENT", matters: [M142] });
    assert.equal(v.ok, false);
    assert.equal(v.code, APPROVER_DENIAL.noHuman);
  });

  it("denies the local-board placeholder — it is a machine, not a person", () => {
    for (const placeholder of ["local-board", "board", ""]) {
      const v = check("on", { approverUserId: placeholder, boundary: "MONEY_MOVEMENT", matters: [M142] });
      assert.equal(v.ok, false);
      assert.equal(v.code, APPROVER_DENIAL.noHuman);
    }
  });

  it("denies an approver without decision authority for that boundary", () => {
    const v = check("on", { approverUserId: OWNER, boundary: "COURT_FILING", matters: [M142] });
    assert.equal(v.ok, false);
    assert.equal(v.code, APPROVER_DENIAL.noAuthority);
  });

  it("denies when the approver is not entitled to a CONTRIBUTING matter", () => {
    // Owner holds the boundary and the filed matter, but LEG-207 contributed
    // context and they are not on it. This is the contamination case.
    const v = check("on", { approverUserId: OWNER, boundary: "MONEY_MOVEMENT", matters: [M142, M207] });
    assert.equal(v.ok, false);
    assert.equal(v.code, APPROVER_DENIAL.notEntitled);
  });

  it("never puts matter content in the denial reason", () => {
    const v = check("on", { approverUserId: OWNER, boundary: "MONEY_MOVEMENT", matters: [M142, M207] });
    assert.equal(v.ok, false);
    // Narrowed by the discriminant, so the deny branch must carry a reason.
    if (v.ok) throw new Error("expected a denial");
    assert.equal(v.reason.includes("jane.doe@firm.com"), false);
    assert.equal(v.reason.includes("LEG-"), false);
    assert.equal(v.code, APPROVER_DENIAL.notEntitled);
  });

  it("denies over a corrupt chain even with enforcement on and a valid approver", () => {
    const chain = tmpChain();
    registry(chain, OWNER_MONEY_AND_142).revoke({ subject: JANE, matter: M142, actor: ADMIN });
    const lines = fs.readFileSync(chain.path, "utf8").trimEnd().split("\n");
    lines[0] = lines[0]!.replace(/"tool":"[^"]*"/, '"tool":"tampered"');
    fs.writeFileSync(chain.path, `${lines.join("\n")}\n`);
    const v = checkApprover(
      new MatterAccessRegistry(new ReceiptChain(chain.path), OWNER_MONEY_AND_142),
      "on",
      { approverUserId: OWNER, boundary: "MONEY_MOVEMENT", matters: [M142] },
    );
    assert.equal(v.ok, false);
  });

  it("honours a receipted override: a grant makes an unentitled approver entitled", () => {
    const chain = tmpChain();
    registry(chain, OWNER_MONEY_AND_142).grant({
      subject: OWNER, matter: M207, actor: ADMIN, expiresAt: futureIso(),
    });
    const v = checkApprover(registry(chain, OWNER_MONEY_AND_142), "on", {
      approverUserId: OWNER, boundary: "MONEY_MOVEMENT", matters: [M142, M207],
    });
    assert.equal(v.ok, true);
  });
});
