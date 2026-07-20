import { it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { receiptStoreLeasePath } from "./receipt-lease.ts";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function localGateEnv(receiptsPath: string, port = "0"): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GATE_PROXY_PORT: port,
    GATE_RECEIPTS_PATH: receiptsPath,
  };
  delete env["PAPERCLIP_BASE_URL"];
  delete env["PAPERCLIP_COMPANY_ID"];
  delete env["PAPERCLIP_GATE_API_KEY"];
  delete env["PAPERCLIP_GATE_AGENT_ID"];
  delete env["GATE_INSTANCE_ID"];
  delete env["GATE_STARTUP_SECRET"];
  return env;
}

async function startAndGracefullyStop(receiptsPath: string): Promise<void> {
  const env = localGateEnv(receiptsPath);

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts"],
    { cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("gate process did not become ready")), 5_000);
    const check = (): void => {
      if (output.includes("port=0") && fs.existsSync(receiptStoreLeasePath(receiptsPath))) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", check);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`gate process exited before readiness with code ${String(code)}`));
    });
  });

  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  child.kill("SIGTERM");
  const exit = await exitPromise;
  assert.deepEqual(exit, { code: 0, signal: null });
  assert.equal(fs.existsSync(receiptStoreLeasePath(receiptsPath)), false);
}

it("gate process releases its writer lease on graceful shutdown and can restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-index-lifecycle-test-"));
  const receiptsPath = path.join(dir, "receipts.jsonl");

  await startAndGracefullyStop(receiptsPath);
  await startAndGracefullyStop(receiptsPath);
});

it("gate process fails before listening or leasing on partial startup-attestation env", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-index-partial-attestation-test-"));
  const receiptsPath = path.join(dir, "receipts.jsonl");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts"],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        GATE_PROXY_PORT: "0",
        GATE_RECEIPTS_PATH: receiptsPath,
        GATE_INSTANCE_ID: "39b9e369-ed73-4a95-ad44-20de7039a3a7",
        GATE_STARTUP_SECRET: "",
        PAPERCLIP_BASE_URL: "",
        PAPERCLIP_COMPANY_ID: "",
        PAPERCLIP_GATE_API_KEY: "",
        PAPERCLIP_GATE_AGENT_ID: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exit = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("partially configured gate process did not fail closed"));
    }, 5_000);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
  assert.equal(exit.code, 1);
  assert.match(exit.output, /startup attestation configuration/i);
  assert.equal(fs.existsSync(receiptStoreLeasePath(receiptsPath)), false);
});

it("gate process treats a listen error as fatal and releases its writer lease", async () => {
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const address = blocker.address() as { port: number };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-index-listen-error-test-"));
  const receiptsPath = path.join(dir, "receipts.jsonl");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts"],
    {
      cwd: packageRoot,
      env: localGateEnv(receiptsPath, String(address.port)),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("gate process did not terminate after listen error"));
    }, 5_000);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });
  await new Promise<void>((resolve, reject) => blocker.close((err) => err ? reject(err) : resolve()));

  assert.equal(code, 1);
  assert.match(output, /server_error: EADDRINUSE/);
  assert.equal(fs.existsSync(receiptStoreLeasePath(receiptsPath)), false);
});

it("gate process forces a bounded fatal shutdown while an outbound request is stalled", async () => {
  const portProbe = net.createServer();
  await new Promise<void>((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
  const port = (portProbe.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    portProbe.close((err) => err ? reject(err) : resolve()),
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-index-stalled-shutdown-test-"));
  const receiptsPath = path.join(dir, "receipts.jsonl");
  const stallFetch = "data:text/javascript," + encodeURIComponent(
    "globalThis.fetch = async () => new Promise(() => {});",
  );
  const child = spawn(
    process.execPath,
    ["--import", stallFetch, "--import", "tsx", "src/index.ts"],
    {
      cwd: packageRoot,
      env: {
        ...localGateEnv(receiptsPath, String(port)),
        EXTERNAL_MODEL_API_KEY: "test-only-key",
        GATE_FETCH_TIMEOUT_MS: "120000",
        GATE_SHUTDOWN_TIMEOUT_MS: "1000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("stalled-shutdown gate did not listen")), 5_000);
    const check = (): void => {
      if (output.includes(`port=${String(port)}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", check);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`stalled-shutdown gate exited early with ${String(code)}`));
    });
  });

  const request = fetch(`http://127.0.0.1:${String(port)}/egress/query_external_model`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payload: { prompt: "test" },
      meta: {
        agentId: "agent-1",
        issueId: "issue-1",
        confidentiality: "standard",
        entities: [],
      },
    }),
  }).catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const poll = (): void => {
      const ledger = fs.existsSync(receiptsPath)
        ? fs.readFileSync(receiptsPath, "utf8")
        : "";
      if (ledger.includes('"outcome":"reserved"')) {
        resolve();
        return;
      }
      if (Date.now() - started > 3_000) {
        reject(new Error("outbound request did not reach its durable reservation"));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });

  const shutdownStarted = Date.now();
  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  child.kill("SIGTERM");
  const forcedKill = setTimeout(() => child.kill("SIGKILL"), 4_000);
  const exit = await exitPromise;
  clearTimeout(forcedKill);
  await request;

  assert.deepEqual(exit, { code: 1, signal: null });
  assert.ok(Date.now() - shutdownStarted < 3_000);
  assert.match(output, /shutdown_deadline_exceeded/);
  assert.equal(fs.existsSync(receiptStoreLeasePath(receiptsPath)), false);
  const ledger = fs.readFileSync(receiptsPath, "utf8");
  assert.match(ledger, /"outcome":"reserved"/);
  assert.doesNotMatch(ledger, /"outcome":"performed"/);
});

for (const fatalCase of [
  {
    name: "uncaught exception",
    source: 'setTimeout(() => { throw new Error("forced_test_crash"); }, 300)',
    expectedLog: /uncaught_exception/,
  },
  {
    name: "unhandled rejection",
    source: 'setTimeout(() => { void Promise.reject(new Error("forced_test_rejection")); }, 300)',
    expectedLog: /unhandled_rejection/,
  },
]) {
  it(`gate process terminates and releases its lease after an ${fatalCase.name}`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-index-fatal-test-"));
    const receiptsPath = path.join(dir, "receipts.jsonl");
    const preload = `data:text/javascript,${encodeURIComponent(fatalCase.source)}`;
    const child = spawn(
      process.execPath,
      ["--import", preload, "--import", "tsx", "src/index.ts"],
      {
        cwd: packageRoot,
        env: localGateEnv(receiptsPath),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    const code = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`gate process did not terminate after ${fatalCase.name}`));
      }, 5_000);
      child.once("exit", (exitCode) => {
        clearTimeout(timeout);
        resolve(exitCode);
      });
    });

    assert.equal(code, 1);
    assert.match(output, fatalCase.expectedLog);
    assert.equal(fs.existsSync(receiptStoreLeasePath(receiptsPath)), false);
  });
}
