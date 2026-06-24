// Shared types for the learning loop. Pure data — no I/O.
export type LessonStatus = "pending" | "accepted" | "rejected" | "archived";

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
}
