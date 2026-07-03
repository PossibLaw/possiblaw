import { test } from "node:test";
import assert from "node:assert/strict";
import { CredentialStore } from "./auth.ts";
import type { PaperclipClient } from "./paperclip.ts";

type Challenge = { id: string; token: string; boardApiToken: string; approvalUrl: string };

function stubClient(opts: { challenge?: Challenge; statuses?: string[] }) {
  const challenge = opts.challenge ?? {
    id: "ch1",
    token: "sec1",
    boardApiToken: "pcp_board_live",
    approvalUrl: "http://x/approve/ch1",
  };
  const statuses = [...(opts.statuses ?? [])];
  const calls = { create: 0, poll: [] as Array<{ id: string; token: string }> };
  const stub = {
    async createCliAuthChallenge() {
      calls.create += 1;
      return challenge;
    },
    async getCliAuthChallenge(id: string, token: string) {
      calls.poll.push({ id, token });
      return { status: statuses.shift() ?? "pending" };
    },
  };
  return { client: stub as unknown as PaperclipClient, calls };
}

test("happy path: disconnected -> awaiting_approval -> pending stays awaiting -> approved -> connected", async () => {
  const { client, calls } = stubClient({ statuses: ["pending", "approved"] });
  const store = new CredentialStore(client);

  assert.deepEqual(store.state(), { status: "disconnected" });
  assert.equal(store.token(), undefined);

  const { approvalUrl } = await store.startConnect();
  assert.equal(approvalUrl, "http://x/approve/ch1");
  assert.deepEqual(store.state(), {
    status: "awaiting_approval",
    approvalUrl: "http://x/approve/ch1",
  });
  assert.equal(store.token(), undefined);

  const s1 = await store.pollConnect();
  assert.deepEqual(s1, { status: "awaiting_approval", approvalUrl: "http://x/approve/ch1" });
  assert.equal(store.token(), undefined);

  const s2 = await store.pollConnect();
  assert.deepEqual(s2, { status: "connected" });
  assert.equal(store.token(), "pcp_board_live");
  assert.deepEqual(calls.poll, [
    { id: "ch1", token: "sec1" },
    { id: "ch1", token: "sec1" },
  ]);
});

test("expired path resets to disconnected and clears token()", async () => {
  const { client } = stubClient({ statuses: ["expired"] });
  const store = new CredentialStore(client);
  await store.startConnect();
  const s = await store.pollConnect();
  assert.deepEqual(s, { status: "disconnected" });
  assert.equal(store.token(), undefined);
});

test("cancelled path also resets to disconnected", async () => {
  const { client } = stubClient({ statuses: ["cancelled"] });
  const store = new CredentialStore(client);
  await store.startConnect();
  const s = await store.pollConnect();
  assert.deepEqual(s, { status: "disconnected" });
  assert.equal(store.token(), undefined);
});

test("disconnect() clears everything, including mid-flow pending state", async () => {
  const { client } = stubClient({ statuses: ["approved"] });
  const store = new CredentialStore(client);
  await store.startConnect();
  assert.equal(store.state().status, "awaiting_approval");

  store.disconnect();
  assert.deepEqual(store.state(), { status: "disconnected" });
  assert.equal(store.token(), undefined);
});

test("disconnect() also clears an already-connected token", async () => {
  const { client } = stubClient({ statuses: ["approved"] });
  const store = new CredentialStore(client);
  await store.startConnect();
  await store.pollConnect();
  assert.equal(store.state().status, "connected");

  store.disconnect();
  assert.deepEqual(store.state(), { status: "disconnected" });
  assert.equal(store.token(), undefined);
});

test("pollConnect() before any startConnect() is a no-op that stays disconnected", async () => {
  const { client, calls } = stubClient({});
  const store = new CredentialStore(client);

  const s = await store.pollConnect();
  assert.deepEqual(s, { status: "disconnected" });
  assert.equal(calls.poll.length, 0);
});

test("startConnect() called twice replaces the pending challenge with the latest one", async () => {
  const first: Challenge = {
    id: "ch1",
    token: "t1",
    boardApiToken: "pcp_board_one",
    approvalUrl: "http://x/approve/1",
  };
  const second: Challenge = {
    id: "ch2",
    token: "t2",
    boardApiToken: "pcp_board_two",
    approvalUrl: "http://x/approve/2",
  };
  let calls = 0;
  const stub = {
    async createCliAuthChallenge() {
      calls += 1;
      return calls === 1 ? first : second;
    },
    async getCliAuthChallenge(id: string) {
      // Only the latest (second) challenge should ever be polled.
      assert.equal(id, "ch2");
      return { status: "approved" };
    },
  };
  const client = stub as unknown as PaperclipClient;
  const store = new CredentialStore(client);

  await store.startConnect();
  assert.equal(store.state().approvalUrl, "http://x/approve/1");

  const { approvalUrl } = await store.startConnect();
  assert.equal(approvalUrl, "http://x/approve/2");
  assert.deepEqual(store.state(), {
    status: "awaiting_approval",
    approvalUrl: "http://x/approve/2",
  });

  const s = await store.pollConnect();
  assert.deepEqual(s, { status: "connected" });
  assert.equal(store.token(), "pcp_board_two");
});
