// ---------------------------------------------------------------------------
// CredentialStore — in-memory, per-lawyer CLI-auth connect driver.
//
// Paperclip's cli-auth challenge is created unauthenticated and already
// carries the final board token (`boardApiToken`); it only becomes live
// once a signed-in human approves at `approvalUrl`. This store holds that
// token as PENDING until a poll observes status "approved", then promotes
// it to the live token. "expired"/"cancelled" reset to disconnected and
// discard the pending secret. Nothing is ever written to disk.
// ---------------------------------------------------------------------------

import type { PaperclipClient } from "./paperclip.ts";

export interface ConnectState {
  status: "disconnected" | "awaiting_approval" | "connected";
  approvalUrl?: string;
}

interface PendingChallenge {
  challengeId: string;
  challengeToken: string;
  pendingBoardToken: string;
  approvalUrl: string;
}

export class CredentialStore {
  private pending: PendingChallenge | undefined;
  private liveToken: string | undefined;

  constructor(private client: PaperclipClient) {}

  state(): ConnectState {
    if (this.liveToken) return { status: "connected" };
    if (this.pending) return { status: "awaiting_approval", approvalUrl: this.pending.approvalUrl };
    return { status: "disconnected" };
  }

  token(): string | undefined {
    return this.liveToken;
  }

  async startConnect(): Promise<{ approvalUrl: string }> {
    const { id, token, boardApiToken, approvalUrl } = await this.client.createCliAuthChallenge();
    this.liveToken = undefined;
    this.pending = { challengeId: id, challengeToken: token, pendingBoardToken: boardApiToken, approvalUrl };
    return { approvalUrl };
  }

  async pollConnect(): Promise<ConnectState> {
    // Snapshot the pending record before the await: if `pending` is replaced
    // (startConnect) or cleared (disconnect) while the poll is in flight, the
    // resolved result belongs to a stale challenge and must be ignored —
    // otherwise an "approved" for the OLD challenge would promote the NEW
    // challenge's still-unapproved token.
    const snapshot = this.pending;
    if (!snapshot) return this.state();
    const { status } = await this.client.getCliAuthChallenge(
      snapshot.challengeId,
      snapshot.challengeToken,
    );
    if (this.pending !== snapshot) return this.state(); // stale poll: ignore entirely
    if (status === "approved") {
      this.liveToken = snapshot.pendingBoardToken;
      this.pending = undefined;
    } else if (status === "expired" || status === "cancelled") {
      this.pending = undefined;
      this.liveToken = undefined;
    }
    return this.state();
  }

  disconnect(): void {
    this.pending = undefined;
    this.liveToken = undefined;
  }
}
