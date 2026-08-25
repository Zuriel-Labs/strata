const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

export interface DateOnlyParts {
  year: number;
  month: number;
  day: number;
  value: string;
}

export function parseDateOnly(value: string | null | undefined): DateOnlyParts | null {
  if (!value) return null;
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validationDate = new Date(Date.UTC(year, month - 1, day));
  if (validationDate.getUTCFullYear() !== year || validationDate.getUTCMonth() !== month - 1 || validationDate.getUTCDate() !== day) return null;
  return { year, month, day, value: `${match[1]}-${match[2]}-${match[3]}` };
}

export function normalizeDateOnly(value: string | null | undefined): string | null {
  return parseDateOnly(value)?.value ?? null;
}

export function formatDateOnly(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' },
  locale = 'en-US',
): string | null {
  const parts = parseDateOnly(value);
  if (!parts) return null;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
    .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function todayDateOnly(now = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayNumber(value: string | null | undefined): number | null {
  const parts = parseDateOnly(value);
  return parts ? Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000) : null;
}

export function compareDateOnlyToToday(value: string | null | undefined, today = todayDateOnly()): -1 | 0 | 1 | null {
  const valueDay = dayNumber(value);
  const todayDay = dayNumber(today);
  if (valueDay === null || todayDay === null) return null;
  return valueDay === todayDay ? 0 : valueDay < todayDay ? -1 : 1;
}

export function differenceInCalendarDays(value: string | null | undefined, from = todayDateOnly()): number | null {
  const valueDay = dayNumber(value);
  const fromDay = dayNumber(from);
  return valueDay === null || fromDay === null ? null : valueDay - fromDay;
}

export function sameDateOnly(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftValue = normalizeDateOnly(left);
  return leftValue !== null && leftValue === normalizeDateOnly(right);
}
