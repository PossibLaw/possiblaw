// One theme.ts — no inline colors or easings (motion-skill rule 7).
// PossibLaw brand: #132c49 blue · #cc1d8a pink (accent) · #dff3ef teal.
export const theme = {
  bg: "#0a1727", // deepened brand blue for contrast
  bgMeshA: "#132c49", // brand blue
  bgMeshB: "#2b1038", // pink-tinted dark for the second mesh lobe
  panel: "rgba(223,243,239,0.045)",
  panelBorder: "rgba(223,243,239,0.11)",
  ink: "#eefaf7",
  inkDim: "rgba(223,243,239,0.66)", // brand teal at reduced alpha
  inkFaint: "rgba(223,243,239,0.36)",
  gold: "#ef62b8", // brand pink, lightened for text legibility on dark
  goldSoft: "rgba(204,29,138,0.18)", // #cc1d8a soft fill
  blue: "#8fe0d2", // brand teal, mid tone for structural accents
  blueSoft: "rgba(143,224,210,0.12)",
  green: "#7fd8c8", // success stays in the teal family
  red: "#e5766c",
  redSoft: "rgba(229,118,108,0.14)",
  mono: "'SF Mono', Menlo, Consolas, monospace",
  sans: "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif",
} as const;

// Spring presets (never linear — rule 1).
export const springs = {
  entrance: { damping: 200, stiffness: 240, mass: 0.9 },
  gentle: { damping: 300, stiffness: 120, mass: 1 },
  pop: { damping: 18, stiffness: 320, mass: 0.6 },
} as const;

export const STAGGER = 5; // frames between sibling entrances (rule 3)
