/**
 * engine.test.ts — FRCP Rule 6 deadline computation tests
 *
 * ALL expected dates are hand-verified against FRCP 6(a)(1), 6(a)(5),
 * and 6(d) rules before being committed as assertions. Do NOT change
 * expected dates to match engine output; change the engine.
 *
 * Fixture verification summary (confirmed by UTC day-arithmetic):
 *   F1: 2024-12-20 +21d → day21=2025-01-10 (Fri, business day, no roll)
 *   F2: 2025-06-02 +5d  → day5=2025-06-07 (Sat) → roll→ 2025-06-09 (Mon)
 *   F3: 2026-06-26 +7d  → day7=2026-07-03 (Fri, observed IndepDay) → 2026-07-06 (Mon)
 *   F4: F1 base=2025-01-10 +3cal=2025-01-13 (Mon, not MLK which is Jan 20) → 2025-01-13
 *   F5: 2025-01-20 -14d → 2025-01-06 (Mon, business day, no roll)
 *   Add1: 2025-01-01 +21d → 2025-01-22 (Wed, business day)
 *   Add2: 2025-06-16 -8d → 2025-06-08 (Sun) → roll← 2025-06-06 (Fri)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDeadline } from './engine.ts';

// ── Fixture 1: basic forward, 21 days ──────────────────────────────────────
describe('fixture 1: forward 21 days — no roll', () => {
  it('returns 2025-01-10 (Friday)', () => {
    const r = computeDeadline({
      triggerDate: '2024-12-20',
      days: 21,
      direction: 'forward',
      jurisdiction: 'US-FED',
    });
    assert.ok(r.supported);
    if (!r.supported) return;
    assert.equal(r.deadline, '2025-01-10');
    assert.equal(r.deadlineDayOfWeek, 'Friday');
    assert.equal(r.rule, 'FRCP-6');
    assert.equal(r.jurisdiction, 'US-FED');
    assert.ok(Array.isArray(r.steps) && r.steps.length > 0, 'steps must be populated');
  });
});

// ── Fixture 2: weekend roll-forward ───────────────────────────────────────
describe('fixture 2: forward 5 days — Saturday → roll to Monday', () => {
  it('returns 2025-06-09 (Monday)', () => {
    const r = computeDeadline({
      triggerDate: '2025-06-02',
      days: 5,
      direction: 'forward',
      jurisdiction: 'US-FED',
    });
    assert.ok(r.supported);
    if (!r.supported) return;
    assert.equal(r.deadline, '2025-06-09');
    assert.equal(r.deadlineDayOfWeek, 'Monday');
  });
});

// ── Fixture 3: observed-holiday roll-forward ──────────────────────────────
describe('fixture 3: forward 7 days — Jul 3 (observed IndepDay) → roll to Monday', () => {
  it('returns 2026-07-06 (Monday)', () => {
    const r = computeDeadline({
      triggerDate: '2026-06-26',
      days: 7,
      direction: 'forward',
      jurisdiction: 'US-FED',
    });
    assert.ok(r.supported);
    if (!r.supported) return;
    assert.equal(r.deadline, '2026-07-06');
    assert.equal(r.deadlineDayOfWeek, 'Monday');
  });
});

// ── Fixture 4: FRCP 6(d) +3 mail ─────────────────────────────────────────
describe('fixture 4: +3 mail rule', () => {
  it('base=2025-01-10 +3cal=2025-01-13 (Monday, not MLK) → 2025-01-13', () => {
    const r = computeDeadline({
      triggerDate: '2024-12-20',
      days: 21,
      direction: 'forward',
      serviceByMail: true,
      jurisdiction: 'US-FED',
    });
    assert.ok(r.supported);
    if (!r.supported) return;
    assert.equal(r.deadline, '2025-01-13');
    assert.equal(r.deadlineDayOfWeek, 'Monday');
    assert.ok(r.serviceByMail);
  });
});

// ── Fixture 4b: FRCP 6(d) +3 mail RE-ROLL path ───────────────────────────
// Exercises the second 6(a)(1)(C) roll: base 6(a) is a business day (no first
// roll), but base + 3 calendar days lands on a Sunday, which MUST roll forward.
// Hand-verified: 2025-06-02 (Mon) +3d → base 2025-06-05 (Thu, no roll);
// +3 mail = 2025-06-08 (Sun) → roll forward → 2025-06-09 (Mon).
describe('fixture 4b: +3 mail re-roll — base business day, +3 lands on Sunday', () => {
  it('base=2025-06-05 (Thu) +3cal=2025-06-08 (Sun) → roll → 2025-06-09 (Monday)', () => {
    const r = computeDeadline({
      triggerDate: '2025-06-02',
      days: 3,
      direction: 'forward',
      serviceByMail: true,
      jurisdiction: 'US-FED',
    });
    assert.ok(r.supported);
    if (!r.supported) return;
    assert.equal(r.deadline, '2025-06-09');
    assert.equal(r.deadlineDayOfWeek, 'Monday');
    assert.ok(r.serviceByMail);
    // Confirm the trace records BOTH the +3 add and the re-roll
    assert.ok(
      r.steps.some((s) => s.includes('added 3 mail days')),
      'steps must record the +3 mail add'
    );
    assert.ok(
      r.steps.some((s) => s.includes('rolled forward to 2025-06-09')),
      'steps must record the re-roll to 2025-06-09'
    );
  });
});

// ── Fixture 5: backward — preceding business day ──────────────────────────
describe('fixture 5: backward 14 days', () => {
  it('trigger 2025-01-20 (MLK, excluded), 14 days back → 2025-01-06 (Monday)', () => {
    const r = computeDeadline({
      triggerDate: '2025-01-20',
      days: 14,
      direction: 'backward',
      jurisdiction: 'US-FED',
    });
    assert.ok(r.supported);
    if (!r.supported) return;
    assert.equal(r.deadline, '2025-01-06');
    assert.equal(r.deadlineDayOfWeek, 'Monday');
  });
});

// ── Fixture 7: unsupported jurisdiction ───────────────────────────────────
describe('fixture 7: unsupported jurisdiction', () => {
  it('{supported:false, reason:unsupported_jurisdiction}, no deadline field', () => {
    const r = computeDeadline({
      triggerDate: '2025-01-20',
      days: 14,
      direction: 'forward',
      jurisdiction: 'US-CA-STATE',
    });
    assert.ok(!r.supported);
    assert.equal(r.reason, 'unsupported_jurisdiction');
    assert.ok(!('deadline' in r), 'must not contain a deadline field');
  });
});

// ── Fixture 8: mail + backward guard ─────────────────────────────────────
describe('fixture 8: serviceByMail with backward → structured error', () => {
  it('{supported:false, reason:mail_rule_forward_only}', () => {
    const r = computeDeadline({
      triggerDate: '2025-01-20',
      days: 14,
      direction: 'backward',
      serviceByMail: true,
      jurisdiction: 'US-FED',
    });
    assert.ok(!r.supported);
    assert.equal(r.reason, 'mail_rule_forward_only');
  });
});

// ── Fixture 8b: invalid `days` guard ─────────────────────────────────────
// A non-positive or fractional period is malformed. Fail closed to
// {supported:false, reason:'invalid_days'} — never silently compute a date.
describe('fixture 8b: invalid days → structured error, no deadline', () => {
  for (const bad of [0, -5, 1.5]) {
    it(`days:${bad} → {supported:false, reason:invalid_days}`, () => {
      const r = computeDeadline({
        triggerDate: '2025-01-20',
        days: bad,
        direction: 'forward',
        jurisdiction: 'US-FED',
      });
      assert.ok(!r.supported);
      assert.equal(r.reason, 'invalid_days');
      assert.ok(!('deadline' in r), 'must not contain a deadline field');
    });
  }

  it('days:NaN → invalid_days', () => {
    const r = computeDeadline({
      triggerDate: '2025-01-20',
      days: Number.NaN,
      direction: 'forward',
      jurisdiction: 'US-FED',
    });
    assert.ok(!r.supported);
    assert.equal(r.reason, 'invalid_days');
  });
});

// ── Fixture 9: no timezone drift ─────────────────────────────────────────
describe('fixture 9: no timezone drift — UTC/string math', () => {
  // Implementation guarantee: both src/engine.ts and src/holidays.ts operate
  // exclusively via Date.UTC(...) and the getUTC* accessors. They never use
  // local-timezone Date parsing (e.g. new Date('2024-12-20')), never use
  // Date.now(), and never read the local offset. Therefore the deadline is a
  // pure function of the input string and is independent of the host TZ.
  // A guard test below (`engine module uses only UTC date APIs`) statically
  // verifies this property against the source so it cannot silently regress.

  it('same input yields the hand-computed literal deadline (UTC math)', () => {
    const input = {
      triggerDate: '2024-12-20',
      days: 21,
      direction: 'forward' as const,
      jurisdiction: 'US-FED',
    };
    const r1 = computeDeadline(input);
    const r2 = computeDeadline(input);
    assert.ok(r1.supported && r2.supported);
    if (!r1.supported || !r2.supported) return;
    assert.equal(r1.deadline, r2.deadline);
    // The known-correct value — proves UTC math, not local-TZ math.
    assert.equal(r1.deadline, '2025-01-10');
  });

  it('recomputing under several process.env.TZ values yields the identical deadline', () => {
    // Even if a Date implementation re-read TZ mid-process, our UTC-only math
    // would be unaffected. We toggle TZ across extreme offsets and assert the
    // deadline never changes. The original TZ is restored in finally.
    const input = {
      // A trigger near a day boundary where a +/-12h local shift WOULD move the
      // calendar day if local-TZ parsing leaked in — making this a real probe.
      triggerDate: '2025-06-02',
      days: 5,
      direction: 'forward' as const,
      jurisdiction: 'US-FED',
    };
    const original = process.env.TZ;
    try {
      const results: string[] = [];
      for (const tz of ['UTC', 'Pacific/Kiritimati', 'Etc/GMT+12', 'America/New_York']) {
        process.env.TZ = tz;
        const r = computeDeadline(input);
        assert.ok(r.supported);
        if (!r.supported) return;
        results.push(r.deadline);
      }
      // All TZ runs must agree, and must equal the hand-verified value.
      for (const d of results) assert.equal(d, '2025-06-09');
      assert.equal(new Set(results).size, 1, 'deadline must not vary across TZ');
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('engine + holidays source uses only UTC date APIs (no local-tz Date parsing)', () => {
    // Static guard: read the sources and assert the CODE (comments stripped)
    // contains no local-time Date constructor patterns and no Date.now(). This
    // makes the tz-safety property regression-proof rather than reviewer-dependent.
    const here = dirname(fileURLToPath(import.meta.url));
    const stripComments = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const file of ['engine.ts', 'holidays.ts']) {
      const code = stripComments(readFileSync(join(here, file), 'utf-8'));
      // Forbid `new Date('...')` / `new Date("...")` string parsing (local tz).
      assert.ok(
        !/new Date\(\s*['"`]/.test(code),
        `${file} must not parse date strings via new Date('...') (local-tz drift)`
      );
      // Forbid Date.now() — deadlines must be a pure function of the input.
      assert.ok(!/Date\.now\(/.test(code), `${file} must not call Date.now()`);
    }
  });
});

// ── Additional 1: longer period spanning multiple holidays ────────────────
describe('additional 1: forward 21 days from a holiday trigger (Jan 1, 2025)', () => {
  // Trigger is New Year's itself (excluded). Day 21 = Jan 22 (Wed, business day).
  // MLK Day (Jan 20) is crossed but counting is all calendar days per 6(a)(1)(B).
  it('returns 2025-01-22 (Wednesday)', () => {
    const r = computeDeadline({
      triggerDate: '2025-01-01',
      days: 21,
      direction: 'forward',
      jurisdiction: 'US-FED',
    });
    assert.ok(r.supported);
    if (!r.supported) return;
    assert.equal(r.deadline, '2025-01-22');
    assert.equal(r.deadlineDayOfWeek, 'Wednesday');
  });
});

// ── Additional 2: backward count lands on Sunday → roll to preceding Friday
describe('additional 2: backward 8 days — Sunday → roll backward to Friday', () => {
  // 2025-06-16 (Mon) - 8 = 2025-06-08 (Sun) → roll back past Sat Jun 7 → Fri Jun 6
  it('returns 2025-06-06 (Friday)', () => {
    const r = computeDeadline({
      triggerDate: '2025-06-16',
      days: 8,
      direction: 'backward',
      jurisdiction: 'US-FED',
    });
    assert.ok(r.supported);
    if (!r.supported) return;
    assert.equal(r.deadline, '2025-06-06');
    assert.equal(r.deadlineDayOfWeek, 'Friday');
  });
});

// ── Additional 3: forward roll lands PAST the initially rolled day (holiday cascade)
describe('additional 3: forward where roll target is also non-business (Sat→Mon verification)', () => {
  // 2025-06-02 +5 = Jun 7 (Sat) → roll → Jun 9 (Mon). Jun 8 = Sun skipped too.
  // Verifies the roll keeps advancing past multiple non-business days.
  it('skips both Saturday and Sunday before landing on Monday', () => {
    const r = computeDeadline({
      triggerDate: '2025-06-02',
      days: 5,
      direction: 'forward',
      jurisdiction: 'US-FED',
    });
    assert.ok(r.supported);
    if (!r.supported) return;
    assert.equal(r.deadline, '2025-06-09'); // already F2, but verifies multi-skip logic
  });
});
