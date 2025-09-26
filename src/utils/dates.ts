export interface DateRange {
  startDate: Date;
  endDate: Date;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addOrdinalSuffix(day: number): string {
  const remainder10 = day % 10;
  const remainder100 = day % 100;

  if (remainder100 >= 11 && remainder100 <= 13) {
    return `${day}th`;
  }

  switch (remainder10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function peekDateParts(value: string): {
  year: number;
  monthIndex: number;
  day: number;
} | null {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }

  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number.parseInt(yearStr, 10);
  const monthIndex = Number.parseInt(monthStr, 10) - 1;
  const day = Number.parseInt(dayStr, 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthIndex) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  return { year, monthIndex, day };
}

function createDateOrNull(value: string): Date | null {
  const parts = peekDateParts(value);
  if (!parts) {
    return null;
  }
  const { year, monthIndex, day } = parts;
  const date = new Date(year, monthIndex, day);
  date.setHours(0, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateForInput(date: Date): string {
  return formatDateToISO(date);
}

export function formatDateForRequest(date: Date): string {
  return formatDateToISO(date);
}

export function formatDateForResponse(date: Date): string {
  return formatDateToISO(date);
}

export function parseInputToDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return createDateOrNull(trimmed);
}

export function parseDateArg(value: unknown, label: string): Date {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a date string in YYYY-MM-DD format.`);
  }

  const trimmed = value.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    throw new Error(`${label} must follow the YYYY-MM-DD format.`);
  }

  const parts = peekDateParts(trimmed);
  if (!parts) {
    throw new Error(`${label} contained invalid numeric values.`);
  }

  const date = createDateOrNull(trimmed);
  if (!date) {
    throw new Error(`${label} is not a real calendar date.`);
  }

  return date;
}

export function getDefaultDateRange(daysBack = 3): DateRange {
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - daysBack);
  return { startDate, endDate };
}

export function formatDateRange({ startDate, endDate }: DateRange): string {
  const monthOptions: Intl.DateTimeFormatOptions = {
    month: 'long',
  };

  const startDay = startDate.getDate();
  const startMonth = startDate.toLocaleString('en-US', monthOptions);
  const startYear = startDate.getFullYear();

  const endDay = endDate.getDate();
  const endMonth = endDate.toLocaleString('en-US', monthOptions);
  const endYear = endDate.getFullYear();

  const startDayOrdinal = addOrdinalSuffix(startDay);
  const endDayOrdinal = addOrdinalSuffix(endDay);

  if (startMonth === endMonth && startYear === endYear) {
    return `${startMonth} ${startDayOrdinal} - ${endDayOrdinal} ${startYear}`;
  }

  return (
    `${startMonth} ${startDayOrdinal} ${startYear} - ` +
    `${endMonth} ${endDayOrdinal} ${endYear}`
  );
}

export function getInclusiveDaySpan({ startDate, endDate }: DateRange): number {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (end < start) {
    return 1;
  }

  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / MS_PER_DAY) + 1;
}
