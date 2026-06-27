/**
 * holidays.test.ts — FRCP Rule 6 federal holiday calendar tests
 *
 * All expected values are hand-verified against 5 U.S.C. § 6103 and
 * the Saturday/Sunday observed-date rule BEFORE being committed as
 * assertions. Do not change expected values to match engine output;
 * change the engine to match these expectations.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { federalHolidays, isBusinessDay } from './holidays.ts';

describe('federalHolidays — observed-date fixtures', () => {
  it('2026: Jul 4 is Saturday → observed Fri 2026-07-03, NOT 2026-07-04', () => {
    const h = federalHolidays(2026);
    assert.ok(h.has('2026-07-03'), 'expected 2026-07-03 (observed Independence Day)');
    assert.ok(!h.has('2026-07-04'), 'must NOT contain 2026-07-04 (the Saturday itself)');
  });

  it('2021: Christmas Dec 25 is Saturday → observed Fri 2021-12-24', () => {
    const h = federalHolidays(2021);
    assert.ok(h.has('2021-12-24'), 'expected 2021-12-24 (observed Christmas)');
    assert.ok(!h.has('2021-12-25'), 'must NOT contain 2021-12-25 (the Saturday itself)');
  });

  it('2021: New Year\'s 2022 (Jan 1 2022 is Saturday) → observed Fri 2021-12-31 in 2021 set', () => {
    const h = federalHolidays(2021);
    assert.ok(h.has('2021-12-31'), 'expected 2021-12-31 (observed New Year\'s Day 2022)');
  });

  it('2023: New Year\'s Jan 1 is Sunday → observed Mon 2023-01-02', () => {
    const h = federalHolidays(2023);
    assert.ok(h.has('2023-01-02'), 'expected 2023-01-02 (observed New Year\'s Day)');
    assert.ok(!h.has('2023-01-01'), 'must NOT contain 2023-01-01 (the Sunday itself)');
  });

  it('2025: has exactly 11 entries (no Saturday/Sunday fixed-date holidays, no next-year spill)', () => {
    // Jan 1=Wed, Jun 19=Thu, Jul 4=Fri, Nov 11=Tue, Dec 25=Thu — no adjustments
    // Jan 1 2026=Thu — no spill into 2025
    const h = federalHolidays(2025);
    assert.equal(h.size, 11);
  });

  it('2025: MLK Day is 2025-01-20 (3rd Monday in January)', () => {
    assert.ok(federalHolidays(2025).has('2025-01-20'));
  });

  it('2025: Thanksgiving is 2025-11-27 (4th Thursday in November)', () => {
    assert.ok(federalHolidays(2025).has('2025-11-27'));
  });

  it('2025: Memorial Day is 2025-05-26 (last Monday in May)', () => {
    assert.ok(federalHolidays(2025).has('2025-05-26'));
  });

  it('2025: Labor Day is 2025-09-01 (1st Monday in September)', () => {
    assert.ok(federalHolidays(2025).has('2025-09-01'));
  });
});

describe('isBusinessDay', () => {
  it('Saturday is not a business day', () => {
    assert.ok(!isBusinessDay('2025-01-04')); // Saturday
  });

  it('Sunday is not a business day', () => {
    assert.ok(!isBusinessDay('2025-01-05')); // Sunday
  });

  it('Federal holiday weekday is not a business day (New Year\'s 2025-01-01, Wednesday)', () => {
    assert.ok(!isBusinessDay('2025-01-01'));
  });

  it('Regular weekday is a business day (2025-01-06, Monday)', () => {
    assert.ok(isBusinessDay('2025-01-06'));
  });

  it('Observed holiday is not a business day (2026-07-03, observed Independence Day)', () => {
    assert.ok(!isBusinessDay('2026-07-03'));
  });

  it('2021-12-31 is not a business day (observed New Year\'s 2022)', () => {
    assert.ok(!isBusinessDay('2021-12-31'));
  });

  it('2021-12-24 is not a business day (observed Christmas)', () => {
    assert.ok(!isBusinessDay('2021-12-24'));
  });

  it('2026-07-04 (Saturday) is not a business day — but as weekend, not holiday label', () => {
    // Jul 4 2026 is Saturday; observed is Jul 3. Jul 4 itself is weekend.
    assert.ok(!isBusinessDay('2026-07-04'));
  });
});
