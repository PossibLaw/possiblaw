// Shared types for the learning loop. Pure data — no I/O.
export type LessonStatus = "pending" | "accepted" | "rejected" | "archived";

// Which source supplied the entity (matter-party) list used to screen a lesson.
// Recorded in the ledger for audit — see cli.ts collectEntities().
export type EntitySource = "flag" | "file" | "flag+file" | "none";

export interface SourceRef {
  matterId: string; // paperclip issue id
  feedback: string; // verbatim originating feedback (trace)
}

export interface Lesson {
  id: string;          // LRN-YYYYMMDD-NNN
  createdAt: string;   // ISO timestamp
  text: string;        // generalized, sanitized principle
  topic: string;       // normalized topic / skill slug (recurrence + indexing)
  status: LessonStatus;
  sources: SourceRef[];
  entities?: string[];         // matter-party names screened against at propose time
  entitySource?: EntitySource; // where those entities came from (audit trail)
  // Set when a re-sanitize at accept blocked the transition (Fix 1). The lesson
  // stays pending; these fields are the auditable reason (redacted reason codes,
  // never client content).
  sanitizeBlockedAt?: string;
  sanitizeBlockReasons?: string[];
}

export interface DeliveryRecord {
  vendorFileId: string;                       // stable cloud id (manifest key)
  destinationKind: "onedrive" | "gdrive";
  driveId?: string;                           // OneDrive needs driveId; gdrive uses fileId alone
  matter: string;                             // paperclip issue id
  agentId: string;                            // drafting agent
  skillSlug: string;                          // skill the drafter used (diff target)
  deliveredAt: string;                        // ISO timestamp
  draftHash: string;                          // sha256 hex of delivered bytes
  draftPath: string;                          // retained local copy path
  lastProcessedHash?: string;                 // hash last diffed by the sweep
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "edited";

export interface SkillEditProposal {
  id: string;                 // SEP-YYYYMMDD-NNN
  createdAt: string;          // ISO timestamp
  skillSlug: string;          // target package skill
  sourceMatter: string;       // paperclip issue id
  vendorFileId: string;       // delivery anchor
  observedChange: string;     // generalized, sanitized description of the edit
  generalizedEdit: string;    // the rule to fold into the skill
  proposedOverlayBody: string;// full proposed SKILL.md overlay body (sanitized)
  status: ProposalStatus;
  entities?: string[];         // matter-party names screened against at propose time
  entitySource?: EntitySource; // where those entities came from (audit trail)
}
