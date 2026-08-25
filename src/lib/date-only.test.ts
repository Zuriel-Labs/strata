import { describe, expect, it } from 'vitest';
import { compareDateOnlyToToday, formatDateOnly, normalizeDateOnly, sameDateOnly } from './date-only';

describe('date-only semantics', () => {
  it('normalizes canonical and legacy ISO values without timezone shifting', () => {
    expect(normalizeDateOnly('2026-08-27')).toBe('2026-08-27');
    expect(normalizeDateOnly('2026-08-27T00:00:00.000Z')).toBe('2026-08-27');
    expect(normalizeDateOnly('2026-08-27T23:00:00-05:00')).toBe('2026-08-27');
    expect(normalizeDateOnly('2026-02-30')).toBeNull();
    expect(normalizeDateOnly('not-a-date')).toBeNull();
  });

  it('validates leap days and calendar boundaries rather than normalizing impossible dates', () => {
    expect(normalizeDateOnly('2024-02-29')).toBe('2024-02-29');
    expect(normalizeDateOnly('2025-02-29')).toBeNull();
    expect(normalizeDateOnly('2026-00-31')).toBeNull();
    expect(normalizeDateOnly('2026-13-01')).toBeNull();
    expect(normalizeDateOnly('2026-12-31T23:59:59-11:00')).toBe('2026-12-31');
  });

  it('formats the same calendar day independent of the process timezone', () => {
    expect(formatDateOnly('2026-08-27', { month: 'short', day: 'numeric' })).toBe('Aug 27');
    expect(formatDateOnly('2026-08-27T00:00:00.000Z')).toBe('8/27/2026');
  });

  it('compares calendar days and matches legacy values by their date prefix', () => {
    expect(compareDateOnlyToToday('2026-08-26', '2026-08-27')).toBe(-1);
    expect(compareDateOnlyToToday('2026-08-27', '2026-08-27')).toBe(0);
    expect(compareDateOnlyToToday('2026-08-28', '2026-08-27')).toBe(1);
    expect(sameDateOnly('2026-08-27T00:00:00.000Z', '2026-08-27')).toBe(true);
  });
});
