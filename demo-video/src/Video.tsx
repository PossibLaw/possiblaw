import React from "react";
import { Series } from "remotion";
import { theme, STAGGER } from "./theme";
import { Scene, Kicker, H1, Sub, Panel, Chip, FlowArrow, Footer, useEnter, useBreathe } from "./common";

const S = STAGGER;

const Title: React.FC = () => (
  <Scene>
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <Kicker>PossibLaw · architecture</Kicker>
      <H1 size={96}>Agents do the work.<br />The product is the path the work travels.</H1>
      <Sub delay={S * 3}>A trust pipeline for operating a legal practice with AI — every consequential action gated, receipted, and verifiable.</Sub>
      <Footer>github.com/PossibLaw/possiblaw · Apache 2.0 · silent explainer, ~2 min</Footer>
    </div>
  </Scene>
);

const LayerNotFork: React.FC = () => (
  <Scene>
    <Kicker>The posture</Kicker>
    <H1>A layer, never a fork</H1>
    <div style={{ display: "flex", gap: 34, marginTop: 56 }}>
      <Panel delay={S * 2} accent={theme.blue} width={640}>
        <div style={{ color: theme.blue, fontFamily: theme.mono, fontSize: 26 }}>paperclip (pinned submodule)</div>
        <div style={{ color: theme.inkDim, fontSize: 28, marginTop: 14, lineHeight: 1.5 }}>
          The control plane: UI, auth, orchestration, budgets, audit. Never modified — a behavioral conformance gate is the merge condition for every pin bump.
        </div>
      </Panel>
      <Panel delay={S * 4} accent={theme.gold} width={640}>
        <div style={{ color: theme.gold, fontFamily: theme.mono, fontSize: 26 }}>PossibLaw (the layer)</div>
        <div style={{ color: theme.inkDim, fontSize: 28, marginTop: 14, lineHeight: 1.5 }}>
          179 legal agents, the gate proxy, receipts, ethical walls, deterministic engines — everything a legal practice needs to trust the run.
        </div>
      </Panel>
    </div>
    <Sub delay={S * 6}>Upstream moves ~800 commits per cycle. The layer survives because it verifies behavior, not source.</Sub>
  </Scene>
);

const Credentials: React.FC = () => (
  <Scene>
    <Kicker>Separation of powers</Kicker>
    <H1>Agents never hold egress credentials</H1>
    <div style={{ display: "flex", alignItems: "center", marginTop: 70 }}>
      <Panel delay={S * 2} width={430} accent={theme.blue}>
        <div style={{ color: theme.ink, fontSize: 30, fontWeight: 600 }}>Agents</div>
        <div style={{ color: theme.inkDim, fontSize: 26, marginTop: 10, lineHeight: 1.45 }}>draft, review, delegate — with a scrubbed environment</div>
        <div style={{ marginTop: 16 }}><Chip color={theme.red} bg={theme.redSoft} delay={S * 6} size={22}>no API keys</Chip></div>
      </Panel>
      <FlowArrow delay={S * 7} width={110} />
      <Panel delay={S * 4} width={470} accent={theme.gold}>
        <div style={{ color: theme.gold, fontSize: 30, fontWeight: 600 }}>Gate proxy</div>
        <div style={{ color: theme.inkDim, fontSize: 26, marginTop: 10, lineHeight: 1.45 }}>the sole credential holder — every outbound write passes through it</div>
        <div style={{ marginTop: 16 }}><Chip color={theme.gold} bg={theme.goldSoft} delay={S * 8} size={22}>email · upload · sign · pay · file</Chip></div>
      </Panel>
      <FlowArrow delay={S * 9} width={110} />
      <Panel delay={S * 5} width={380}>
        <div style={{ color: theme.ink, fontSize: 30, fontWeight: 600 }}>The world</div>
        <div style={{ color: theme.inkDim, fontSize: 26, marginTop: 10, lineHeight: 1.45 }}>courts, clients, vendors — reached only through policy</div>
      </Panel>
    </div>
    <Sub delay={S * 10}>The launcher strips secrets from every agent's environment at import. A prompt-injected agent has nothing to exfiltrate with.</Sub>
  </Scene>
);

const GATE_STEPS = [
  { label: "classify", note: "six trust boundaries", color: theme.blue },
  { label: "policy", note: "allow · anonymize · human · block", color: theme.blue },
  { label: "anonymize", note: "deterministic masking", color: theme.blue },
  { label: "human gate", note: "payload-hash-bound approval", color: theme.gold },
  { label: "citation gate", note: "no unverified cites reach a court", color: theme.gold },
  { label: "receipt", note: "hash-chained, fsync'd", color: theme.green },
];

const GatePipeline: React.FC = () => (
  <Scene>
    <Kicker>The gate proxy</Kicker>
    <H1>Every consequential action runs the pipeline</H1>
    <div style={{ display: "flex", alignItems: "stretch", marginTop: 76, flexWrap: "wrap" }}>
      {GATE_STEPS.map((s, i) => (
        <React.Fragment key={s.label}>
          <Panel delay={S * 2 + i * S} accent={s.color} width={238} style={{ padding: "20px 18px" }}>
            <div style={{ color: s.color, fontFamily: theme.mono, fontSize: 23, fontWeight: 700, whiteSpace: "nowrap" }}>{s.label}</div>
            <div style={{ color: theme.inkDim, fontSize: 19, marginTop: 8, lineHeight: 1.4 }}>{s.note}</div>
          </Panel>
          {i < GATE_STEPS.length - 1 && <FlowArrow delay={S * 3 + i * S} width={24} />}
        </React.Fragment>
      ))}
    </div>
    <div style={{ marginTop: 54 }}>
      <Chip delay={S * 9}>THIRD_PARTY_EGRESS</Chip>
      <Chip delay={S * 10}>CONFIDENTIAL_TO_CLOUD</Chip>
      <Chip delay={S * 11} color={theme.gold} bg={theme.goldSoft}>COURT_FILING</Chip>
      <Chip delay={S * 12} color={theme.gold} bg={theme.goldSoft}>SIGNATURE</Chip>
      <Chip delay={S * 13} color={theme.gold} bg={theme.goldSoft}>MONEY_MOVEMENT</Chip>
      <Chip delay={S * 14} color={theme.gold} bg={theme.goldSoft}>IRREVERSIBLE_EXTERNAL_OP</Chip>
    </div>
    <Sub delay={S * 15}>Humans decide at the boundaries that matter — not on every keystroke. An approval for payload X never authorizes payload Y.</Sub>
  </Scene>
);

const Confidentiality: React.FC = () => (
  <Scene>
    <Kicker>Confidentiality &amp; privilege</Kicker>
    <H1>Reasonable steps, engineered — never "privilege-safe" marketing</H1>
    <div style={{ display: "flex", gap: 30, marginTop: 56 }}>
      <Panel delay={S * 2} accent={theme.blue} width={560}>
        <div style={{ color: theme.ink, fontSize: 29, fontWeight: 600 }}>Privacy tiers per matter</div>
        <div style={{ color: theme.inkDim, fontSize: 25, marginTop: 12, lineHeight: 1.5 }}>
          <span style={{ fontFamily: theme.mono }}>confidential / privileged</span> matters route the sensitive step through a <b style={{ color: theme.ink }}>local model</b> — the cloud never sees cleartext.
        </div>
      </Panel>
      <Panel delay={S * 4} accent={theme.gold} width={560}>
        <div style={{ color: theme.ink, fontSize: 29, fontWeight: 600 }}>Privacy encoder</div>
        <div style={{ color: theme.inkDim, fontSize: 25, marginTop: 12, lineHeight: 1.5 }}>
          Client identifiers → opaque placeholders <i>before</i> any cloud call; the substitution key never leaves local disk; output decodes back on return.
        </div>
      </Panel>
      <Panel delay={S * 6} accent={theme.green} width={560}>
        <div style={{ color: theme.ink, fontSize: 29, fontWeight: 600 }}>Raise-only floor</div>
        <div style={{ color: theme.inkDim, fontSize: 25, marginTop: 12, lineHeight: 1.5 }}>
          A registered matter's tier can be raised, never lowered — an agent cannot downgrade confidentiality, by construction.
        </div>
      </Panel>
    </div>
    <Sub delay={S * 8}>Unlabeled traffic defaults to confidential. The failure direction is always closed.</Sub>
  </Scene>
);

const Walls: React.FC = () => (
  <Scene>
    <Kicker>Matter ownership &amp; ethical walls</Kicker>
    <H1>A screened matter doesn't say "locked." It doesn't exist.</H1>
    <div style={{ display: "flex", gap: 30, marginTop: 56 }}>
      <Panel delay={S * 2} accent={theme.gold} width={560}>
        <div style={{ color: theme.ink, fontSize: 29, fontWeight: 600 }}>Company-per-client walls</div>
        <div style={{ color: theme.inkDim, fontSize: 25, marginTop: 12, lineHeight: 1.5 }}>
          <span style={{ fontFamily: theme.mono }}>--add-wall</span> makes the screened client a genuinely separate company. Cross-wall reads get a hard <span style={{ color: theme.red, fontFamily: theme.mono }}>403</span> from the control plane itself.
        </div>
      </Panel>
      <Panel delay={S * 4} accent={theme.blue} width={560}>
        <div style={{ color: theme.ink, fontSize: 29, fontWeight: 600 }}>Non-disclosure of existence</div>
        <div style={{ color: theme.inkDim, fontSize: 25, marginTop: 12, lineHeight: 1.5 }}>
          An unscreened lawyer's dashboard is membership-filtered — the walled company simply isn't there. Denied is never distinguishable work.
        </div>
      </Panel>
      <Panel delay={S * 6} accent={theme.green} width={560}>
        <div style={{ color: theme.ink, fontSize: 29, fontWeight: 600 }}>C3: entitlement at approval</div>
        <div style={{ color: theme.inkDim, fontSize: 25, marginTop: 12, lineHeight: 1.5 }}>
          The human who approves an egress must hold decision authority <b style={{ color: theme.ink }}>AND</b> entitlement to every matter involved. Authority never implies access.
        </div>
      </Panel>
    </div>
    <Sub delay={S * 8}>Conflicts screening is deterministic where it counts: a HIT blocks; a NO_HIT upgrades — never replaces — human confirmation.</Sub>
  </Scene>
);

const HashBlock: React.FC<{ i: number; delay: number }> = ({ i, delay }) => (
  <div style={{ display: "flex", alignItems: "center" }}>
    <Panel delay={delay} width={252} accent={i === 3 ? theme.gold : theme.green} style={{ padding: "18px 20px" }}>
      <div style={{ color: i === 3 ? theme.gold : theme.green, fontFamily: theme.mono, fontSize: 22 }}>
        {i === 3 ? "anchor → RFC 3161 TSA" : `receipt ${i + 1}`}
      </div>
      <div style={{ color: theme.inkFaint, fontFamily: theme.mono, fontSize: 18, marginTop: 8 }}>
        {i === 3 ? "external timestamp" : `sha256: ${["9f2c…a1", "4b7d…e8", "c05a…37"][i]}`}
      </div>
      <div style={{ color: theme.inkFaint, fontFamily: theme.mono, fontSize: 18 }}>
        {i === 3 ? "openssl ts -verify" : `prev: ${["∅ genesis", "9f2c…a1", "4b7d…e8"][i]}`}
      </div>
    </Panel>
    {i < 3 && <FlowArrow delay={delay + S} width={40} color={theme.green} />}
  </div>
);

const Receipts: React.FC = () => (
  <Scene>
    <Kicker>The audit spine</Kicker>
    <H1>Receipts a court can verify without trusting us</H1>
    <div style={{ display: "flex", alignItems: "center", marginTop: 70, transform: useBreathe(2, 120) }}>
      {[0, 1, 2, 3].map((i) => <HashBlock key={i} i={i} delay={S * 2 + i * S * 2} />)}
    </div>
    <Sub delay={S * 11}>
      Every gate decision appends to a SHA-256 hash chain — payload hashes only, never plaintext. The chain head anchors to an external
      timestamp authority, and a zero-dependency verifier checks it offline with <span style={{ fontFamily: theme.mono }}>openssl</span>.
      One matter's slice exports as the Matter Trust Report — the artifact a regulator or insurer actually asks for.
    </Sub>
  </Scene>
);

const Honest: React.FC = () => (
  <Scene>
    <Kicker>What we say out loud</Kicker>
    <H1>The limits are documented, not hidden</H1>
    <div style={{ marginTop: 54, maxWidth: 1480 }}>
      {[
        "Same-machine processes share a trust floor until worker isolation lands — multi-lawyer production says so, in writing.",
        "Walls separate companies; per-matter isolation inside one company is not claimed.",
        "We benchmarked our own orchestration thesis under a pre-registered rule — and published the negative result.",
      ].map((t, i) => (
        <Panel key={t} delay={S * 2 + i * S * 2} width={"100%"} style={{ marginBottom: 22 }} accent={i === 2 ? theme.gold : undefined}>
          <div style={{ color: theme.inkDim, fontSize: 29, lineHeight: 1.5 }}>
            <span style={{ color: theme.gold, fontFamily: theme.mono, marginRight: 16 }}>{String(i + 1).padStart(2, "0")}</span>{t}
          </div>
        </Panel>
      ))}
    </div>
    <Sub delay={S * 9}>A trust layer that massages its own claims isn't a trust layer.</Sub>
  </Scene>
);

const Close: React.FC = () => {
  const breathe = useBreathe(4, 100);
  return (
    <Scene>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", textAlign: "center" }}>
        <div style={{ transform: breathe }}>
          <Kicker>Open source · Apache 2.0</Kicker>
          <H1 size={88}>Run the business of law.<br />With receipts.</H1>
        </div>
        <div style={{ ...useEnter(S * 4), color: theme.gold, fontFamily: theme.mono, fontSize: 40, marginTop: 44 }}>
          github.com/PossibLaw/possiblaw
        </div>
        <Sub delay={S * 6} size={28}>Clone it. Read the receipts. Tell us what breaks.</Sub>
      </div>
    </Scene>
  );
};

export const PossibLawArchitecture: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={150}><Title /></Series.Sequence>
    <Series.Sequence durationInFrames={330}><LayerNotFork /></Series.Sequence>
    <Series.Sequence durationInFrames={390}><Credentials /></Series.Sequence>
    <Series.Sequence durationInFrames={480}><GatePipeline /></Series.Sequence>
    <Series.Sequence durationInFrames={420}><Confidentiality /></Series.Sequence>
    <Series.Sequence durationInFrames={450}><Walls /></Series.Sequence>
    <Series.Sequence durationInFrames={450}><Receipts /></Series.Sequence>
    <Series.Sequence durationInFrames={390}><Honest /></Series.Sequence>
    <Series.Sequence durationInFrames={210}><Close /></Series.Sequence>
  </Series>
);
