// Playwright-recorded tour of the live orchestration demo.
// Run AFTER the demo matter completes. Records one continuous 1080p webm and
// logs elapsed seconds per beat (used to time Remotion label overlays).
// Usage: node demo-video/tour.mjs <dataDirIdsFile>
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const idsFile = process.argv[2];
const [co, , iid] = readFileSync(idsFile, "utf-8").trim().split("\n");
const BASE = "http://127.0.0.1:3199";
const GATE = "http://127.0.0.1:3899";

const api = async (p) => (await fetch(`${BASE}${p}`)).json();

const issue = await api(`/api/issues/${iid}`);
const prefix = (issue.identifier || "POS-3").split("-")[0];
const all = await api(`/api/companies/${co}/issues?limit=100`);
const list = Array.isArray(all) ? all : all.issues ?? [];
const children = list.filter((x) => (x.parentIssueId ?? x.parentId) === iid);
const child = children[0];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: new URL("./out/tour/", import.meta.url).pathname, size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
const t0 = Date.now();
const mark = (label) => console.log(`BEAT ${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`);
const settle = async (ms) => page.waitForTimeout(ms);
const drift = async (px) => {
  // slow, human-feeling scroll (hover the content pane so wheel events land in it)
  await page.mouse.move(960, 540);
  for (let y = 0; y < px; y += 24) { await page.mouse.wheel(0, 24); await settle(40); }
};

const go = async (url, label, dwell = 5200) => {
  await page.goto(url, { waitUntil: "networkidle" }).catch(() => page.goto(url));
  mark(label);
  await settle(dwell);
};

await go(`${BASE}/${prefix}/dashboard`, "dashboard", 6000);
await go(`${BASE}/${prefix}/issues`, "issues-list", 5200);
await go(`${BASE}/${prefix}/issues/${issue.identifier}`, "matter-detail", 5500);
await drift(900); await settle(3000);
if (child) {
  await go(`${BASE}/${prefix}/issues/${child.identifier ?? child.id}`, "child-detail", 7500);
  await drift(700); await settle(3500);
}
await go(`${BASE}/${prefix}/agents/all`, "agents", 8800);
await go(`${BASE}/${prefix}/issues/${issue.identifier}`, "deliverable", 6500);
await drift(1400); await settle(4200);
await go(`${BASE}/${prefix}/approvals`, "human-gate", 9500);
await go(`${GATE}/receipts/verify`, "receipts-verify", 5200);
await go(`${GATE}/receipts/bundle?issueId=${iid}&format=md`, "trust-report", 6500);
await drift(800); await settle(2000);
await go(`${BASE}/${prefix}/agents/commercial-lead/skills`, "skills", 800);
await drift(320); await settle(4500);
await go(`${BASE}/${prefix}/agents/new`, "agent-new", 3500);
await drift(300); await settle(5500);
mark("end");

await ctx.close();
await browser.close();
console.log("tour recorded to demo-video/out/tour/");
