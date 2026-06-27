/**
 * holidays.ts — Federal legal holidays per 5 U.S.C. § 6103
 *
 * Pure UTC date arithmetic. No local-timezone Date parsing.
 * Same input → same output on every machine.
 */

// ── UTC date primitives ────────────────────────────────────────────────────

/** Format [year, month (1-indexed), day] as YYYY-MM-DD */
function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Day-of-week for a calendar date. Returns 0=Sun … 6=Sat. UTC — no tz shift. */
function utcDow(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Decompose a UTC millisecond timestamp into [year, month (1-indexed), day]. */
function msToYMD(ms: number): [number, number, number] {
  const dt = new Date(ms);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

/** Add `n` days (may be negative) to a calendar date, returning the new [y,m,d]. */
function addDays(y: number, m: number, d: number, n: number): [number, number, number] {
  return msToYMD(Date.UTC(y, m - 1, d) + n * 86_400_000);
}

// ── Floating-holiday helpers ───────────────────────────────────────────────

/**
 * Return YYYY-MM-DD of the Nth occurrence of `weekday` (0=Sun…6=Sat) in the
 * given month of `year`. Month is 1-indexed.
 */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const firstDow = utcDow(year, month, 1);
  const offset = (weekday - firstDow + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return toISO(year, month, day);
}

/**
 * Return YYYY-MM-DD of the last Monday in the given month of `year`.
 * Month is 1-indexed.
 *
 * Trick: Date.UTC(year, month, 0) = last day of month (because day-0 of month+1
 * is the last day of month, in 0-indexed month terms month = 1-indexed month
 * so Date.UTC(year, month, 0) is correct directly).
 */
function lastMonday(year: number, month: number): string {
  const lastMs = Date.UTC(year, month, 0); // last day of `month` (1-indexed)
  const lastDow = new Date(lastMs).getUTCDay();
  const daysBack = (lastDow - 1 + 7) % 7; // days to subtract to reach Monday
  const [ry, rm, rd] = msToYMD(lastMs - daysBack * 86_400_000);
  return toISO(ry, rm, rd);
}

// ── Observed-date rule for fixed-date holidays ─────────────────────────────

/**
 * Given a fixed-date holiday (e.g. Jul 4), return the OBSERVED date:
 *   Saturday → preceding Friday
 *   Sunday   → following Monday
 *   Otherwise → the date itself
 * Returns [year, month, day] — may be in a different year (e.g. Dec 31 for Jan 1 Sat).
 */
function observedFixed(y: number, m: number, d: number): [number, number, number] {
  const dow = utcDow(y, m, d);
  if (dow === 6) return addDays(y, m, d, -1); // Saturday → preceding Friday
  if (dow === 0) return addDays(y, m, d, +1); // Sunday   → following Monday
  return [y, m, d];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Return the Set of OBSERVED YYYY-MM-DD dates for the 11 federal legal holidays
 * (5 U.S.C. § 6103) that fall within `year`.
 *
 * Fixed-date holidays where the observed date spills into a different year
 * (only possible for New Year's Day when Jan 1 is Saturday → Dec 31 prev year)
 * are excluded from the set for `year` and instead appear in the set for the
 * previous year. Conversely, when Jan 1 of `year+1` is a Saturday its observed
 * date (Dec 31 of `year`) IS included here.
 *
 * Floating Monday/Thursday holidays never need Saturday/Sunday adjustment.
 */
export function federalHolidays(year: number): Set<string> {
  const result = new Set<string>();

  // ── Fixed-date holidays (apply Saturday→Fri / Sunday→Mon observed rule) ──
  // Only add if the observed date still falls within `year`.
  const fixedDates: [number, number][] = [
    [1, 1],   // New Year's Day
    [6, 19],  // Juneteenth National Independence Day
    [7, 4],   // Independence Day
    [11, 11], // Veterans Day
    [12, 25], // Christmas Day
  ];

  for (const [m, d] of fixedDates) {
    const [oy, om, od] = observedFixed(year, m, d);
    if (oy === year) {
      result.add(toISO(oy, om, od));
    }
  }

  // Special case: if Jan 1 of NEXT year falls on Saturday, its observed
  // date is Dec 31 of THIS year — include it in this year's set.
  const [nextNewYearObsY] = observedFixed(year + 1, 1, 1);
  if (nextNewYearObsY === year) {
    result.add(toISO(year, 12, 31));
  }

  // ── Floating holidays (always Mon or Thu — no Sat/Sun adjustment needed) ─
  result.add(nthWeekday(year, 1, 1, 3));  // MLK Jr. Day: 3rd Monday in January
  result.add(nthWeekday(year, 2, 1, 3));  // Washington's Birthday: 3rd Monday in February
  result.add(lastMonday(year, 5));         // Memorial Day: last Monday in May
  result.add(nthWeekday(year, 9, 1, 1));  // Labor Day: 1st Monday in September
  result.add(nthWeekday(year, 10, 1, 2)); // Columbus Day: 2nd Monday in October
  result.add(nthWeekday(year, 11, 4, 4)); // Thanksgiving: 4th Thursday in November

  return result;
}

/**
 * Return true iff `dateISO` (YYYY-MM-DD) is a business day:
 * not Saturday, not Sunday, not in federalHolidays(year).
 * Uses UTC arithmetic — no local-timezone parsing.
 */
export function isBusinessDay(dateISO: string): boolean {
  const [ys, ms, ds] = dateISO.split('-');
  const y = Number(ys), m = Number(ms), d = Number(ds);
  const dow = utcDow(y, m, d);
  if (dow === 0 || dow === 6) return false; // Sunday or Saturday
  return !federalHolidays(y).has(dateISO);
}
