/**
 * engine.ts — Deterministic FRCP Rule 6 deadline computation
 *
 * Encodes FRCP 6(a)(1), 6(a)(5), and 6(d) exactly as written.
 * Pure UTC date arithmetic — no local-timezone Date parsing, no Date.now().
 * Unsupported jurisdiction → {supported:false}, never a guessed date.
 */
import { isBusinessDay } from './holidays.ts';

// ── UTC date primitives (engine-local; mirrors holidays.ts approach) ───────

function isoToMs(dateISO: string): number {
  const [ys, ms, ds] = dateISO.split('-');
  return Date.UTC(Number(ys), Number(ms) - 1, Number(ds));
}

function msToISO(ms: number): string {
  const dt = new Date(ms);
  return (
    `${dt.getUTCFullYear()}-` +
    `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(dt.getUTCDate()).padStart(2, '0')}`
  );
}

const DOW_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
] as const;

function dowName(ms: number): string {
  return DOW_NAMES[new Date(ms).getUTCDay()];
}

// ── Roll helpers ───────────────────────────────────────────────────────────

/** Roll FORWARD from `ms` until we reach a business day. Returns the new ms. */
function rollForward(ms: number): number {
  while (!isBusinessDay(msToISO(ms))) ms += 86_400_000;
  return ms;
}

/** Roll BACKWARD from `ms` until we reach a business day. Returns the new ms. */
function rollBackward(ms: number): number {
  while (!isBusinessDay(msToISO(ms))) ms -= 86_400_000;
  return ms;
}

// ── Input / output types ───────────────────────────────────────────────────

export interface DeadlineInput {
  triggerDate: string;
  days: number;
  direction: 'forward' | 'backward';
  serviceByMail?: boolean;
  jurisdiction: string;
}

export type UnsupportedResult = {
  supported: false;
  reason: string;
  jurisdiction?: string;
};

export type SupportedResult = {
  supported: true;
  jurisdiction: string;
  rule: 'FRCP-6';
  triggerDate: string;
  days: number;
  direction: 'forward' | 'backward';
  serviceByMail: boolean;
  deadline: string;
  deadlineDayOfWeek: string;
  steps: string[];
};

export type DeadlineResult = UnsupportedResult | SupportedResult;

// ── Core computation ───────────────────────────────────────────────────────

/**
 * Compute a filing deadline under FRCP Rule 6.
 *
 * Rule 6(a)(1) forward:
 *   (A) Exclude the trigger day.
 *   (B) Count every calendar day (including weekends and holidays).
 *   (C) Include the last day; if it is Sat/Sun/legal-holiday, roll FORWARD
 *       to the next business day.
 *
 * Rule 6(a)(5) backward ("at least N days before"):
 *   Exclude the trigger day; count BACKWARD N calendar days; if the last day
 *   is Sat/Sun/legal-holiday, roll to the next EARLIER business day (deadline
 *   moves earlier).
 *
 * Rule 6(d) +3 mail:
 *   Compute the base period under 6(a) first (with its roll), then ADD 3
 *   calendar days, then RE-APPLY the 6(a)(1)(C) forward roll.
 *   Only applies to forward periods; backward + serviceByMail is an error.
 */
export function computeDeadline(input: DeadlineInput): DeadlineResult {
  const { triggerDate, days, direction, serviceByMail, jurisdiction } = input;

  // Unsupported jurisdiction → fail closed, never guess
  if (jurisdiction !== 'US-FED') {
    return { supported: false, reason: 'unsupported_jurisdiction', jurisdiction };
  }

  // Validate `days` — must be a positive integer. A non-positive or fractional
  // period is malformed; fail closed rather than silently computing a wrong date.
  if (!Number.isInteger(days) || days <= 0) {
    return { supported: false, reason: 'invalid_days' };
  }

  // 6(d) mail rule adds time — semantically incompatible with backward "before" periods
  if (serviceByMail && direction === 'backward') {
    return { supported: false, reason: 'mail_rule_forward_only' };
  }

  const steps: string[] = [];
  const triggerMs = isoToMs(triggerDate);

  // Step A: exclude the trigger day
  steps.push(`Excluded trigger day ${triggerDate}`);

  if (direction === 'forward') {
    // ── FRCP 6(a)(1) forward ────────────────────────────────────────────
    // (B) Count every calendar day including weekends/holidays
    const rawMs = triggerMs + days * 86_400_000;
    const rawISO = msToISO(rawMs);
    steps.push(`Counted ${days} calendar days → ${rawISO} (${dowName(rawMs)})`);

    // (C) If last day is Sat/Sun/holiday, roll forward to next business day
    const baseMs = rollForward(rawMs);
    const baseISO = msToISO(baseMs);
    if (baseMs === rawMs) {
      steps.push(`${rawISO} is a business day — no roll needed`);
    } else {
      steps.push(
        `${rawISO} is not a business day — rolled forward to ${baseISO} (${dowName(baseMs)})`
      );
    }

    // ── FRCP 6(d): +3 mail days ─────────────────────────────────────────
    if (serviceByMail) {
      const plus3Ms = baseMs + 3 * 86_400_000;
      const plus3ISO = msToISO(plus3Ms);
      steps.push(`FRCP 6(d): added 3 mail days → ${plus3ISO} (${dowName(plus3Ms)})`);

      const finalMs = rollForward(plus3Ms);
      const finalISO = msToISO(finalMs);
      if (finalMs === plus3Ms) {
        steps.push(`${plus3ISO} is a business day — no roll needed`);
      } else {
        steps.push(
          `${plus3ISO} is not a business day — rolled forward to ${finalISO} (${dowName(finalMs)})`
        );
      }

      return {
        supported: true,
        jurisdiction: 'US-FED',
        rule: 'FRCP-6',
        triggerDate,
        days,
        direction,
        serviceByMail: true,
        deadline: finalISO,
        deadlineDayOfWeek: dowName(finalMs),
        steps,
      };
    }

    return {
      supported: true,
      jurisdiction: 'US-FED',
      rule: 'FRCP-6',
      triggerDate,
      days,
      direction,
      serviceByMail: false,
      deadline: baseISO,
      deadlineDayOfWeek: dowName(baseMs),
      steps,
    };

  } else {
    // ── FRCP 6(a)(5) backward ───────────────────────────────────────────
    // Exclude trigger, count backward N calendar days
    const rawMs = triggerMs - days * 86_400_000;
    const rawISO = msToISO(rawMs);
    steps.push(`Counted ${days} calendar days backward → ${rawISO} (${dowName(rawMs)})`);

    // If last day is Sat/Sun/holiday, roll to the next EARLIER business day
    const deadlineMs = rollBackward(rawMs);
    const deadlineISO = msToISO(deadlineMs);
    if (deadlineMs === rawMs) {
      steps.push(`${rawISO} is a business day — no roll needed`);
    } else {
      steps.push(
        `${rawISO} is not a business day — rolled backward to ${deadlineISO} (${dowName(deadlineMs)})`
      );
    }

    return {
      supported: true,
      jurisdiction: 'US-FED',
      rule: 'FRCP-6',
      triggerDate,
      days,
      direction,
      serviceByMail: false,
      deadline: deadlineISO,
      deadlineDayOfWeek: dowName(deadlineMs),
      steps,
    };
  }
}
