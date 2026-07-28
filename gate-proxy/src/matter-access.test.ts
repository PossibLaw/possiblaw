import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_MATTER_ACCESS,
  MatterAccessError,
  compileMatterAccess,
  loadMatterAccessDocument,
  parseMatterAccessDocument,
  buildMatterAccessDirectory,
  loadMatterAccessDirectory,
  type MatterAccessDirectory,
} from "./matter-access.ts";

const DOC = {
  version: 1,
  default: "deny",
  matterAccess: { "jane.doe@firm.com": ["LEG-142", "LEG-207"] },
  decisionAuthority: { MONEY_MOVEMENT: ["owner@firm.com"] },
};

const DIRECTORY: MatterAccessDirectory = {
  usersByEmail: { "jane.doe@firm.com": ["user-jane"], "owner@firm.com": ["user-owner"] },
  issuesByIdentifier: { "LEG-142": ["uuid-142"], "LEG-207": ["uuid-207"] },
};

function writeDoc(body: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "matter-access-"));
  const file = path.join(dir, "matter-access.json");
  fs.writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
  return file;
}

describe("matter access document — defaults", () => {
  it("defaults to deny with nothing granted and enforcement off", () => {
    assert.deepEqual(DEFAULT_MATTER_ACCESS, {
      version: 1,
      default: "deny",
      enforcement: "off",
      matterAccess: {},
      decisionAuthority: {},
    });
  });

  it("defaults enforcement to off when the document omits it", () => {
    assert.equal(parseMatterAccessDocument({ version: 1, default: "deny" }).enforcement, "off");
  });

  it("accepts an explicit enforcement value", () => {
    assert.equal(parseMatterAccessDocument({ ...DOC, enforcement: "on" }).enforcement, "on");
    assert.equal(parseMatterAccessDocument({ ...DOC, enforcement: "off" }).enforcement, "off");
  });

  it("rejects any other enforcement value rather than coercing it", () => {
    for (const bad of ["true", true, "ON", "enabled", 1, null]) {
      assert.throws(() => parseMatterAccessDocument({ ...DOC, enforcement: bad }), MatterAccessError);
    }
  });

  it("changes the document sha when enforcement flips, so the epoch moves", () => {
    const off = compileMatterAccess(parseMatterAccessDocument({ ...DOC, enforcement: "off" }), DIRECTORY);
    const on = compileMatterAccess(parseMatterAccessDocument({ ...DOC, enforcement: "on" }), DIRECTORY);
    assert.notEqual(off.documentSha256, on.documentSha256);
  });
});

describe("matter access document — parsing (fail closed)", () => {
  it("accepts a well-formed document", () => {
    const doc = parseMatterAccessDocument(DOC);
    assert.deepEqual(doc.matterAccess["jane.doe@firm.com"], ["LEG-142", "LEG-207"]);
    assert.deepEqual(doc.decisionAuthority["MONEY_MOVEMENT"], ["owner@firm.com"]);
  });

  it("rejects a version other than 1", () => {
    assert.throws(() => parseMatterAccessDocument({ ...DOC, version: 2 }), MatterAccessError);
  });

  it("rejects a default other than deny — there is no allow-by-default mode", () => {
    assert.throws(() => parseMatterAccessDocument({ ...DOC, default: "allow" }), MatterAccessError);
  });

  it("rejects an unknown top-level key, so a typo cannot silently disable a section", () => {
    assert.throws(
      () => parseMatterAccessDocument({ ...DOC, mattarAccess: {} }),
      MatterAccessError,
    );
  });

  it("rejects a non-email principal", () => {
    assert.throws(
      () => parseMatterAccessDocument({ ...DOC, matterAccess: { "not-an-email": ["LEG-142"] } }),
      MatterAccessError,
    );
  });

  it("rejects two principals that differ only by case — that is ambiguity, not two people", () => {
    assert.throws(
      () =>
        parseMatterAccessDocument({
          ...DOC,
          matterAccess: { "jane.doe@firm.com": ["LEG-142"], "Jane.Doe@FIRM.com": ["LEG-207"] },
        }),
      MatterAccessError,
    );
  });

  it("normalises principal emails to lower case", () => {
    const doc = parseMatterAccessDocument({
      ...DOC,
      matterAccess: { "Jane.Doe@FIRM.com": ["LEG-142"] },
    });
    assert.deepEqual(Object.keys(doc.matterAccess), ["jane.doe@firm.com"]);
  });

  it("rejects an unknown boundary in decisionAuthority", () => {
    assert.throws(
      () => parseMatterAccessDocument({ ...DOC, decisionAuthority: { NOT_A_BOUNDARY: ["owner@firm.com"] } }),
      MatterAccessError,
    );
  });

  it("accepts every real boundary name", () => {
    const all = {
      CONFIDENTIAL_TO_CLOUD: ["owner@firm.com"],
      COURT_FILING: ["owner@firm.com"],
      IRREVERSIBLE_EXTERNAL_OP: ["owner@firm.com"],
      MONEY_MOVEMENT: ["owner@firm.com"],
      SIGNATURE: ["owner@firm.com"],
      THIRD_PARTY_EGRESS: ["owner@firm.com"],
    };
    const doc = parseMatterAccessDocument({ ...DOC, decisionAuthority: all });
    assert.equal(Object.keys(doc.decisionAuthority).length, 6);
  });

  it("rejects a duplicate matter identifier for one principal", () => {
    assert.throws(
      () =>
        parseMatterAccessDocument({
          ...DOC,
          matterAccess: { "jane.doe@firm.com": ["LEG-142", "LEG-142"] },
        }),
      MatterAccessError,
    );
  });

  it("rejects a matter identifier with an unsafe shape", () => {
    assert.throws(
      () =>
        parseMatterAccessDocument({
          ...DOC,
          matterAccess: { "jane.doe@firm.com": ["../../etc/passwd"] },
        }),
      MatterAccessError,
    );
  });

  it("rejects a grant list that is not an array", () => {
    assert.throws(
      () => parseMatterAccessDocument({ ...DOC, matterAccess: { "jane.doe@firm.com": "LEG-142" } }),
      MatterAccessError,
    );
  });

  it("rejects an oversized principal map rather than accepting unbounded input", () => {
    const many: Record<string, string[]> = {};
    for (let i = 0; i < 2000; i += 1) many[`user${i}@firm.com`] = ["LEG-142"];
    assert.throws(() => parseMatterAccessDocument({ ...DOC, matterAccess: many }), MatterAccessError);
  });

  it("treats an absent section as empty, not as permissive", () => {
    const doc = parseMatterAccessDocument({ version: 1, default: "deny" });
    assert.deepEqual(Object.keys(doc.matterAccess), []);
    assert.deepEqual(Object.keys(doc.decisionAuthority), []);
  });

  it("builds null-prototype lookups so a crafted key cannot reach Object.prototype", () => {
    const doc = parseMatterAccessDocument(DOC);
    assert.equal(Object.getPrototypeOf(doc.matterAccess), null);
    assert.equal(Object.getPrototypeOf(doc.decisionAuthority), null);
    assert.equal(doc.matterAccess["constructor"], undefined);
    assert.equal(doc.matterAccess["__proto__"], undefined);
  });
});

describe("matter access document — loading from disk (fail closed)", () => {
  it("loads a well-formed file", () => {
    const doc = loadMatterAccessDocument(writeDoc(DOC));
    assert.deepEqual(doc.matterAccess["jane.doe@firm.com"], ["LEG-142", "LEG-207"]);
  });

  it("throws on malformed JSON rather than falling back to a default", () => {
    assert.throws(() => loadMatterAccessDocument(writeDoc("{not json")), MatterAccessError);
  });

  it("throws on a missing file — absence is not permission", () => {
    assert.throws(
      () => loadMatterAccessDocument(path.join(os.tmpdir(), "definitely-absent.json")),
      MatterAccessError,
    );
  });
});

describe("matter access document — compilation against the directory", () => {
  it("resolves emails to user ids and identifiers to issue uuids", () => {
    const compiled = compileMatterAccess(parseMatterAccessDocument(DOC), DIRECTORY);
    assert.deepEqual(compiled.matterAccess["user-jane"], ["uuid-142", "uuid-207"]);
    assert.deepEqual(compiled.decisionAuthority["MONEY_MOVEMENT"], ["user-owner"]);
  });

  it("records a document sha256 so a reload can be receipted as a new epoch", () => {
    const compiled = compileMatterAccess(parseMatterAccessDocument(DOC), DIRECTORY);
    assert.match(compiled.documentSha256, /^[0-9a-f]{64}$/);
  });

  it("produces the same sha256 for the same document and a different one otherwise", () => {
    const a = compileMatterAccess(parseMatterAccessDocument(DOC), DIRECTORY);
    const b = compileMatterAccess(parseMatterAccessDocument(DOC), DIRECTORY);
    assert.equal(a.documentSha256, b.documentSha256);
    const other = compileMatterAccess(
      parseMatterAccessDocument({ ...DOC, matterAccess: { "jane.doe@firm.com": ["LEG-142"] } }),
      DIRECTORY,
    );
    assert.notEqual(a.documentSha256, other.documentSha256);
  });

  it("refuses an email that matches no Paperclip user", () => {
    assert.throws(
      () =>
        compileMatterAccess(parseMatterAccessDocument(DOC), {
          ...DIRECTORY,
          usersByEmail: { "owner@firm.com": ["user-owner"] },
        }),
      MatterAccessError,
    );
  });

  it("refuses an email that matches MORE than one user — ambiguity is not resolvable safely", () => {
    assert.throws(
      () =>
        compileMatterAccess(parseMatterAccessDocument(DOC), {
          ...DIRECTORY,
          usersByEmail: { ...DIRECTORY.usersByEmail, "jane.doe@firm.com": ["user-a", "user-b"] },
        }),
      MatterAccessError,
    );
  });

  it("refuses a matter identifier that matches no issue", () => {
    assert.throws(
      () =>
        compileMatterAccess(parseMatterAccessDocument(DOC), {
          ...DIRECTORY,
          issuesByIdentifier: { "LEG-142": ["uuid-142"] },
        }),
      MatterAccessError,
    );
  });

  it("refuses a matter identifier that matches more than one issue", () => {
    assert.throws(
      () =>
        compileMatterAccess(parseMatterAccessDocument(DOC), {
          ...DIRECTORY,
          issuesByIdentifier: { ...DIRECTORY.issuesByIdentifier, "LEG-142": ["uuid-a", "uuid-b"] },
        }),
      MatterAccessError,
    );
  });

  it("resolves the directory case-insensitively for email", () => {
    const compiled = compileMatterAccess(
      parseMatterAccessDocument({ ...DOC, matterAccess: { "JANE.DOE@firm.com": ["LEG-142"] } }),
      DIRECTORY,
    );
    assert.deepEqual(compiled.matterAccess["user-jane"], ["uuid-142"]);
  });

  it("compiles an empty document to an empty deny-all policy", () => {
    const compiled = compileMatterAccess(
      parseMatterAccessDocument({ version: 1, default: "deny" }),
      DIRECTORY,
    );
    assert.deepEqual(Object.keys(compiled.matterAccess), []);
    assert.deepEqual(Object.keys(compiled.decisionAuthority), []);
    assert.equal(compiled.default, "deny");
  });

  it("does not grant a matter to a principal the document never listed", () => {
    const compiled = compileMatterAccess(parseMatterAccessDocument(DOC), DIRECTORY);
    assert.equal(compiled.matterAccess["user-owner"], undefined);
  });
});

describe("matter access directory — ingestion from paperclip", () => {
  const MEMBERS = {
    members: [
      { user: { id: "user-jane", email: "Jane.Doe@FIRM.com" } },
      { user: { id: "user-owner", email: "owner@firm.com" } },
      { user: null },
      { user: { id: "user-noemail" } },
    ],
  };
  const ISSUES = {
    issues: [
      { id: "uuid-142", identifier: "LEG-142" },
      { id: "uuid-207", identifier: "LEG-207" },
      { id: "uuid-none", identifier: null },
    ],
  };

  it("indexes users by lower-cased email and issues by identifier", () => {
    const d = buildMatterAccessDirectory({ members: MEMBERS, issues: ISSUES });
    assert.deepEqual(d.usersByEmail["jane.doe@firm.com"], ["user-jane"]);
    assert.deepEqual(d.issuesByIdentifier["LEG-142"], ["uuid-142"]);
  });

  it("skips records with no usable email or identifier instead of failing startup", () => {
    // A company legitimately holds users and issues the roster never names;
    // one of them must not be able to block the gate from booting.
    const d = buildMatterAccessDirectory({ members: MEMBERS, issues: ISSUES });
    assert.equal(Object.keys(d.usersByEmail).length, 2);
    assert.equal(Object.keys(d.issuesByIdentifier).length, 2);
  });

  it("keeps duplicates multi-valued so compilation can refuse the ambiguity", () => {
    const d = buildMatterAccessDirectory({
      members: { members: [
        { user: { id: "user-a", email: "dup@firm.com" } },
        { user: { id: "user-b", email: "DUP@firm.com" } },
      ] },
      issues: { issues: [
        { id: "uuid-a", identifier: "LEG-9" },
        { id: "uuid-b", identifier: "LEG-9" },
      ] },
    });
    assert.equal(d.usersByEmail["dup@firm.com"]?.length, 2);
    assert.equal(d.issuesByIdentifier["LEG-9"]?.length, 2);
    // And compiling against it must throw rather than pick one.
    assert.throws(
      () => compileMatterAccess(
        parseMatterAccessDocument({ version: 1, default: "deny", matterAccess: { "dup@firm.com": ["LEG-9"] } }),
        d,
      ),
      MatterAccessError,
    );
  });

  it("accepts a flat {id,email} member shape as well as the nested one", () => {
    const d = buildMatterAccessDirectory({
      members: [{ id: "user-flat", email: "flat@firm.com" }],
      issues: [],
    });
    assert.deepEqual(d.usersByEmail["flat@firm.com"], ["user-flat"]);
  });

  it("treats absent sections as empty rather than throwing", () => {
    const d = buildMatterAccessDirectory({ members: undefined, issues: undefined });
    assert.deepEqual(Object.keys(d.usersByEmail), []);
    assert.deepEqual(Object.keys(d.issuesByIdentifier), []);
  });

  it("loads a bundle from disk and refuses malformed JSON", () => {
    const file = writeDoc({ members: MEMBERS.members, issues: ISSUES.issues });
    const d = loadMatterAccessDirectory(file);
    assert.deepEqual(d.usersByEmail["owner@firm.com"], ["user-owner"]);
    assert.throws(() => loadMatterAccessDirectory(writeDoc("{nope")), MatterAccessError);
    assert.throws(() => loadMatterAccessDirectory(path.join(os.tmpdir(), "absent-dir.json")), MatterAccessError);
  });

  it("builds null-prototype indexes", () => {
    const d = buildMatterAccessDirectory({ members: MEMBERS, issues: ISSUES });
    assert.equal(Object.getPrototypeOf(d.usersByEmail), null);
    assert.equal(d.usersByEmail["constructor"], undefined);
  });
});
