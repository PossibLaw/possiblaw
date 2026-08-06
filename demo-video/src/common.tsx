import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, springs, STAGGER } from "./theme";

// Entrance = fade + rise + scale together (rule 2), spring-driven (rule 1).
export const useEnter = (delay: number, preset: keyof typeof springs = "entrance") => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: springs[preset], durationInFrames: 34 });
  return {
    opacity: interpolate(p, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(p, [0, 1], [26, 0])}px) scale(${interpolate(p, [0, 1], [0.965, 1])})`,
  } as const;
};

// Idle micro-motion: sine breathing (skill: micro-motion on idle elements).
export const useBreathe = (amp = 3, period = 90) => {
  const frame = useCurrentFrame();
  return `translateY(${Math.sin((frame / period) * Math.PI * 2) * amp}px)`;
};

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

// Five-layer stack (rule 4): mesh bg → content → grade → vignette+grain.
export const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const driftX = Math.sin(frame / 210) * 60;
  const driftY = Math.cos(frame / 260) * 45;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.sans }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 640px at ${28 + driftX / 12}% ${30 + driftY / 12}%, ${theme.bgMeshA} 0%, transparent 62%),
                       radial-gradient(1000px 720px at ${74 - driftX / 14}% ${72 - driftY / 14}%, ${theme.bgMeshB} 0%, transparent 64%)`,
        }}
      />
      <AbsoluteFill style={{ padding: "72px 96px" }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(11,18,32,0) 70%, rgba(11,18,32,0.55) 100%)", pointerEvents: "none" }} />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: "radial-gradient(120% 90% at 50% 45%, transparent 60%, rgba(0,0,0,0.42) 100%)",
        }}
      />
      <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: GRAIN, opacity: 0.05 }} />
    </AbsoluteFill>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => (
  <div style={{ ...useEnter(delay), color: theme.gold, fontFamily: theme.mono, fontSize: 26, letterSpacing: 6, textTransform: "uppercase" }}>
    {children}
  </div>
);

export const H1: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> = ({ children, delay = STAGGER, size = 78 }) => (
  <div style={{ ...useEnter(delay), color: theme.ink, fontSize: size, fontWeight: 700, lineHeight: 1.12, marginTop: 18, maxWidth: 1500 }}>
    {children}
  </div>
);

export const Sub: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> = ({ children, delay = STAGGER * 2, size = 34 }) => (
  <div style={{ ...useEnter(delay), color: theme.inkDim, fontSize: size, lineHeight: 1.5, marginTop: 26, maxWidth: 1420 }}>
    {children}
  </div>
);

export const Panel: React.FC<{
  children: React.ReactNode; delay?: number; accent?: string; width?: number | string; style?: React.CSSProperties;
}> = ({ children, delay = 0, accent, width, style }) => (
  <div
    style={{
      ...useEnter(delay),
      background: theme.panel,
      border: `1px solid ${theme.panelBorder}`,
      borderTop: accent ? `3px solid ${accent}` : `1px solid ${theme.panelBorder}`,
      borderRadius: 16,
      padding: "26px 30px",
      width,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Chip: React.FC<{ children: React.ReactNode; color?: string; bg?: string; delay?: number; mono?: boolean; size?: number }> = ({
  children, color = theme.blue, bg = theme.blueSoft, delay = 0, mono = true, size = 24,
}) => (
  <span
    style={{
      ...useEnter(delay, "pop"),
      display: "inline-block",
      color, background: bg,
      border: `1px solid ${color}44`,
      fontFamily: mono ? theme.mono : theme.sans,
      fontSize: size, padding: "10px 18px", borderRadius: 999, marginRight: 14, marginBottom: 14,
    }}
  >
    {children}
  </span>
);

// Animated flow arrow: draws in with a spring, pulses a dot along it.
export const FlowArrow: React.FC<{ delay?: number; width?: number; color?: string }> = ({ delay = 0, width = 74, color = theme.inkFaint }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: springs.gentle, durationInFrames: 26 });
  const dot = ((frame - delay) % 46) / 46;
  return (
    <div style={{ position: "relative", width: width * p, height: 4, background: color, borderRadius: 2, margin: "0 10px", opacity: p, flexShrink: 0 }}>
      {p > 0.9 && dot > 0 && (
        <div style={{ position: "absolute", left: `${dot * 92}%`, top: -3, width: 10, height: 10, borderRadius: 5, background: theme.gold, opacity: 0.9 }} />
      )}
      <div style={{ position: "absolute", right: -2, top: -6, width: 0, height: 0, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: `12px solid ${color}`, opacity: p }} />
    </div>
  );
};

export const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", bottom: 84, left: 96, right: 96, color: theme.inkFaint, fontSize: 24, fontFamily: theme.mono }}>
    {children}
  </div>
);
