import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Series, spring, staticFile, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { useEnter } from "./common";

// PossibLaw brand (light bookends): 132c49 navy · cc1d8a pink · dff3ef teal.
const BRAND = { navy: "#132c49", navyDim: "rgba(19,44,73,0.66)", pink: "#cc1d8a", teal: "#dff3ef", tealDeep: "#bfe5dc" };

const LightScene: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const driftX = Math.sin(frame / 210) * 60;
  const driftY = Math.cos(frame / 260) * 45;
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.teal, fontFamily: theme.sans }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 640px at ${28 + driftX / 12}% ${30 + driftY / 12}%, #ffffff 0%, transparent 62%),
                       radial-gradient(1000px 720px at ${74 - driftX / 14}% ${72 - driftY / 14}%, ${BRAND.tealDeep} 0%, transparent 64%)`,
        }}
      />
      <AbsoluteFill style={{ padding: "72px 96px" }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

const CHAIN_HEAD = "5e9a0302414e317f5a7b7c33d9915332d635a9828b83b2f0d379f421b89b2166";

const HashCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - 32, fps, config: { damping: 16, stiffness: 200, mass: 0.7 }, durationInFrames: 30 });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: p, transform: `scale(${0.8 + 0.2 * p})`, background: BRAND.navy, borderRadius: 22, padding: "44px 60px", boxShadow: "0 40px 120px rgba(19,44,73,0.5)", border: "1px solid rgba(223,243,239,0.25)", maxWidth: 1400, textAlign: "center" }}>
        <div style={{ color: theme.blue, fontFamily: theme.mono, fontSize: 24, letterSpacing: 4, textTransform: "uppercase" }}>receipt chain · head · sha-256</div>
        <div style={{ color: theme.ink, fontFamily: theme.mono, fontSize: 44, lineHeight: 1.45, marginTop: 22, wordBreak: "break-all" }}>
          <span style={{ color: theme.gold }}>{CHAIN_HEAD.slice(0, 8)}</span>{CHAIN_HEAD.slice(8)}
        </div>
        <div style={{ color: theme.inkDim, fontFamily: theme.mono, fontSize: 24, marginTop: 24 }}>ok: true · length: 2 · verifiable offline with openssl</div>
      </div>
    </AbsoluteFill>
  );
};
import manifest from "./voiceover-manifest.json";

const FPS = 30;
const PAD = 36; // frames of air after each VO line
export const MUSIC = true; // public/music.mp3 present (ElevenLabs bed, ducked under VO)

const voExt = (id: keyof typeof manifest) => (manifest[id] as any)?.ext ?? "wav";
const sceneFrames = (id: keyof typeof manifest, minSec = 0) =>
  Math.max(Math.round(((manifest[id]?.seconds ?? 0) + PAD / FPS) * FPS), Math.round(minSec * FPS));

// Tour capture windows (seconds within public/tour.webm).
const WINDOWS: Record<string, [number, number]> = {
  request: [14.2, 23.1],
  delegation: [25.2, 35.9],
  custom: [88.9, 103.0],
  budgets: [38.4, 46.4],
  deliverable: [48.1, 59.7],
  gate: [62.2, 70.8],
  receipts: [72.3, 80.6],
};

const LOWERS: Record<string, { title: string; sub: string }> = {
  request: { title: "On the record from word one", sub: "work handed to a firm — not a chat window" },
  delegation: { title: "No invisible work", sub: "every handoff is a matter, with an owner" },
  custom: { title: "Yours to extend", sub: "new agents · custom skills & connectors · swap models for cost or strength" },
  budgets: { title: "Spending, governed", sub: "hard caps the agents cannot exceed · every token metered" },
  deliverable: { title: "Supervision inside the work", sub: "conflicts notice enforced by policy — not by memory" },
  gate: { title: "Nothing leaves without a human", sub: "court filing held · approve or reject" },
  receipts: { title: "Don't trust it. Check it.", sub: "hash-chained receipts · verifiable offline" },
};

const Lower: React.FC<{ id: string }> = ({ id }) => {
  const l = LOWERS[id];
  return (
    <div style={{ ...useEnter(6), position: "absolute", left: 64, bottom: 56, background: "rgba(10,23,39,0.9)", border: `1px solid ${theme.panelBorder}`, borderLeft: `4px solid ${theme.gold}`, borderRadius: 12, padding: "16px 24px", maxWidth: 880 }}>
      <div style={{ color: theme.ink, fontSize: 32, fontWeight: 700, fontFamily: theme.sans }}>{l.title}</div>
      <div style={{ color: theme.inkDim, fontSize: 22, marginTop: 5, fontFamily: theme.sans }}>{l.sub}</div>
    </div>
  );
};

const Capture: React.FC<{ id: string }> = ({ id }) => {
  const [a] = WINDOWS[id];
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <OffthreadVideo src={staticFile("tour.webm")} muted startFrom={Math.round(a * FPS)} style={{ width: "100%", height: "100%" }} />
      {id === "receipts" && <HashCard />}
      <Lower id={id} />
      <Audio src={staticFile(`voiceover/${id}.${voExt(id as keyof typeof manifest)}`)} />
    </AbsoluteFill>
  );
};

// Opening brand card — visible from frame 0 (no fade-from-blank: this is the
// first thing seen on click and the natural poster frame).
const TITLE_FRAMES = 30;

const Title: React.FC = () => (
  <LightScene>
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%" }}>
      <Img src={staticFile("bailey-logo.svg")} style={{ width: 1250, display: "block" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: -56 }}>
        <span style={{ color: BRAND.navyDim, fontSize: 36, fontFamily: theme.sans }}>by</span>
        <Img src={staticFile("possiblaw-horizontal.svg")} style={{ width: 600, display: "block" }} />
      </div>
    </div>
  </LightScene>
);

const Hook: React.FC = () => (
  <LightScene>
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <div style={{ ...useEnter(0), color: BRAND.pink, fontFamily: theme.mono, fontSize: 26, letterSpacing: 6, textTransform: "uppercase", fontWeight: 600 }}>PossibLaw</div>
      <div style={{ ...useEnter(5), color: BRAND.navy, fontSize: 96, fontWeight: 800, lineHeight: 1.1, marginTop: 18 }}>What if you had a whole firm<br />at your fingertips?</div>
      <div style={{ ...useEnter(16), color: BRAND.navyDim, fontSize: 38, lineHeight: 1.5, marginTop: 26 }}>Not a chatbot. A firm — <span style={{ color: BRAND.pink, fontWeight: 650 }}>with controls, and receipts.</span></div>
    </div>
    <Audio src={staticFile(`voiceover/hook.${voExt("hook")}`)} />
  </LightScene>
);

const Outro: React.FC = () => (
  <LightScene>
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", textAlign: "center" }}>
      <div style={{ ...useEnter(5) }}>
        <Img src={staticFile("bailey-logo.svg")} style={{ width: 1250, display: "block" }} />
      </div>
      <div style={{ ...useEnter(12), display: "flex", alignItems: "center", gap: 4, marginTop: -56 }}>
        <span style={{ color: BRAND.navyDim, fontSize: 36, fontFamily: theme.sans }}>by</span>
        <Img src={staticFile("possiblaw-horizontal.svg")} style={{ width: 600, display: "block" }} />
      </div>
      <div style={{ ...useEnter(24), color: BRAND.pink, fontFamily: theme.mono, fontSize: 33, marginTop: 36, fontWeight: 600 }}>
        github.com/PossibLaw/bailey&nbsp;&nbsp;·&nbsp;&nbsp;bailey.PossibLaw.com
      </div>
    </div>
    <Audio src={staticFile(`voiceover/outro.${voExt("outro")}`)} />
  </LightScene>
);

export const promoDuration =
  TITLE_FRAMES +
  sceneFrames("hook", 7) + sceneFrames("request", 8) + sceneFrames("delegation", 8) +
  sceneFrames("custom", 8) +
  sceneFrames("budgets", 7) + sceneFrames("deliverable", 7) + sceneFrames("gate", 8) +
  sceneFrames("receipts", 8) + sceneFrames("outro", 8);

export const OrchestrationPromo: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {MUSIC && (
        <Audio src={staticFile("music.mp3")} loop volume={(f) => interpolate(f, [0, 60, promoDuration - 90, promoDuration], [0, 0.16, 0.16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      )}
      <Series>
        <Series.Sequence durationInFrames={TITLE_FRAMES}><Title /></Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames("hook", 7)}><Hook /></Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames("request", 8)}><Capture id="request" /></Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames("delegation", 8)}><Capture id="delegation" /></Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames("custom", 8)}><Capture id="custom" /></Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames("budgets", 7)}><Capture id="budgets" /></Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames("deliverable", 7)}><Capture id="deliverable" /></Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames("gate", 8)}><Capture id="gate" /></Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames("receipts", 8)}><Capture id="receipts" /></Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames("outro", 8)}><Outro /></Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
