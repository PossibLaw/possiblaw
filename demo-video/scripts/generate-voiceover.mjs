// PossibLaw promo voiceover generator (ported from LegalOpsMaestro workflow).
// Key: macOS keychain `possiblaw/ELEVENLABS_API_KEY` (primary) → .env.local /
// env fallback. Voice: ELEVENLABS_VOICE_ID from .env.local.
// Output: public/voiceover/<id>.wav — requests raw PCM from ElevenLabs and
// wraps a WAV header locally (exact durations, and Remotion's minimal ffmpeg
// demuxes PCM WAV reliably — it rejects ALAC/AIFF). Falls back to MP3 if PCM
// is plan-gated, and to macOS `say` if there is no key at all.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "voiceover");
const MODEL_ID = "eleven_multilingual_v2";
const RATE = 44100;

const env = {};
if (existsSync(join(ROOT, ".env.local"))) {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=["']?([^"']*)["']?$/);
    if (m) env[m[1]] = m[2];
  }
}
const VOICE_ID = env.ELEVENLABS_VOICE_ID ?? process.env.ELEVENLABS_VOICE_ID ?? "v3p1kjzUvro6S76qmYmH";

const keychainKey = () => {
  try {
    return execFileSync("security", ["find-generic-password", "-s", "possiblaw/ELEVENLABS_API_KEY", "-w"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch { return ""; }
};
const KEY = keychainKey() || env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || "";

const wavFromPcm = (pcm) => {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

const tts = async (text, format) => {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${format}`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.35 } }),
  });
  if (!res.ok) throw { status: res.status, message: (await res.text()).slice(0, 300) };
  return Buffer.from(await res.arrayBuffer());
};

const scenes = JSON.parse(readFileSync(join(ROOT, "scripts", "voiceover-script.json"), "utf8"));
mkdirSync(OUT, { recursive: true });
const manifest = {};
let pcmOk = true;

for (const s of scenes) {
  const wav = join(OUT, `${s.id}.wav`);
  const force = process.argv.includes("--force");
  if (!force && existsSync(wav) && statSync(wav).size > 0 && process.argv.includes("--keep")) {
    console.log(`keep ${s.id}`);
  } else if (KEY) {
    try {
      if (pcmOk) {
        try {
          const pcm = await tts(s.text, `pcm_${RATE}`);
          writeFileSync(wav, wavFromPcm(pcm));
          console.log(`elevenlabs pcm ${s.id} → ${(pcm.length / RATE / 2).toFixed(2)}s`);
        } catch (e) {
          if (e.status === 400 || e.status === 402 || e.status === 403) {
            console.log(`pcm gated (${e.status}) — switching to mp3 for all scenes`);
            pcmOk = false;
          } else { throw e; }
        }
      }
      if (!pcmOk) {
        const mp3buf = await tts(s.text, "mp3_44100_128");
        writeFileSync(join(OUT, `${s.id}.mp3`), mp3buf);
        console.log(`elevenlabs mp3 ${s.id} → ${(mp3buf.length / 1024).toFixed(0)} KB`);
      }
    } catch (e) {
      console.error(`FAILED ${s.id}: ${e.status} ${e.message}`); process.exit(1);
    }
  } else {
    console.log(`no key — say fallback ${s.id}`);
    execFileSync("say", ["-v", "Samantha", "-r", "170", "--data-format=LEI16@44100", "-o", wav, s.text]);
  }
  // Duration: WAV = exact from header math; MP3 = estimate at 128kbps CBR.
  if (existsSync(wav) && statSync(wav).size > 44 && (pcmOk || !KEY)) {
    manifest[s.id] = { seconds: Math.round(((statSync(wav).size - 44) / (RATE * 2)) * 100) / 100, ext: "wav" };
  } else {
    const mp3 = join(OUT, `${s.id}.mp3`);
    manifest[s.id] = { seconds: Math.round((statSync(mp3).size / 16000) * 100) / 100, ext: "mp3" };
  }
}

writeFileSync(join(ROOT, "src", "voiceover-manifest.json"), JSON.stringify(manifest, null, 2));
console.log("manifest written:", JSON.stringify(manifest));
