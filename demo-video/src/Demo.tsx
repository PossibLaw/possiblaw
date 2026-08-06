import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate } from "remotion";
import { theme } from "./theme";
import { Scene, Kicker, H1, Sub, useEnter } from "./common";

const FPS = 30;
const INTRO = 120; // 4s
const TOUR = 2100; // 70s recording

// Beat log from tour.mjs (seconds → labels).
const BEATS: Array<{ at: number; end: number; title: string; sub: string }> = [
  { at: 0.9, end: 7.7, title: "The firm, one command later", sub: "paperclip dashboard · 63 agents · PossibLaw package loaded" },
  { at: 7.7, end: 13.7, title: "The request", sub: "a matter typed in plain English, assigned to the Chief of Staff" },
  { at: 13.7, end: 23.3, title: "The delegation", sub: "POS-3 → drafting chain → meta-review · 4/4 done · 4.3M tokens metered" },
  { at: 23.3, end: 31.8, title: "The specialist's matter", sub: "commercial team drafts the NDA — every step a tracked sub-issue" },
  { at: 31.8, end: 37.7, title: "Agents with budgets", sub: "per-agent monthly caps — hard stops, not suggestions" },
  { at: 37.7, end: 47.5, title: "The deliverable", sub: "reconstituted work product — with the Conflicts Check Notice built in" },
  { at: 47.5, end: 54.0, title: "The human gate", sub: "a court filing waits for a person — payload bound by SHA-256" },
  { at: 54.0, end: 59.8, title: "The receipt chain", sub: "gate proxy: every decision hash-chained, verified OK" },
  { at: 59.8, end: 69.9, title: "The Matter Trust Report", sub: "one matter's audit trail — hashes only, verifiable offline" },
];

const Lower: React.FC<{ title: string; sub: string }> = ({ title, sub }) => (
  <div style={{ ...useEnter(4), position: "absolute", left: 64, bottom: 56, background: "rgba(10,23,39,0.88)", border: `1px solid ${theme.panelBorder}`, borderLeft: `4px solid ${theme.gold}`, borderRadius: 12, padding: "18px 26px", maxWidth: 900 }}>
    <div style={{ color: theme.ink, fontSize: 34, fontWeight: 700, fontFamily: theme.sans }}>{title}</div>
    <div style={{ color: theme.inkDim, fontSize: 23, marginTop: 6, fontFamily: theme.sans }}>{sub}</div>
  </div>
);

const Intro: React.FC = () => (
  <Scene>
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <Kicker>PossibLaw · live orchestration</Kicker>
      <H1 size={88}>One request. A whole firm responds.</H1>
      <Sub delay={12}>Unedited product capture · cheap model on purpose (DeepSeek via OpenRouter) · total cost of everything you're about to see: 17¢</Sub>
    </div>
  </Scene>
);

const Outro: React.FC = () => (
  <Scene>
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", textAlign: "center" }}>
      <Kicker>request → delegation → deliverable → receipt</Kicker>
      <H1 size={80}>18 minutes. 4.3M tokens. 17 cents.<br />Every step on the record.</H1>
      <div style={{ ...useEnter(20), color: theme.gold, fontFamily: theme.mono, fontSize: 36, marginTop: 40 }}>github.com/PossibLaw/possiblaw</div>
    </div>
  </Scene>
);

export const OrchestrationDemo: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Sequence durationInFrames={INTRO}><Intro /></Sequence>
      <Sequence from={INTRO} durationInFrames={TOUR}>
        <AbsoluteFill>
          <OffthreadVideo src={staticFile("tour.webm")} style={{ width: "100%", height: "100%" }} muted />
          {BEATS.map((b) => {
            const local = frame - INTRO;
            const visible = local >= b.at * FPS + 8 && local < b.end * FPS - 4;
            return visible ? <Lower key={b.title} title={b.title} sub={b.sub} /> : null;
          })}
        </AbsoluteFill>
      </Sequence>
      <Sequence from={INTRO + TOUR} durationInFrames={180}><Outro /></Sequence>
    </AbsoluteFill>
  );
};
