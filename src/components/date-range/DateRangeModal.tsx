import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Minimize2 } from 'react-feather';
import { Button } from '../button/Button';
import { getInclusiveDaySpan, type DateRange } from '../../utils/dates';
import './DateRangeModal.scss';

interface DateRangeModalProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  onApply: (range: DateRange) => void;
  currentRange: DateRange;
  minDate?: Date;
  maxDate?: Date;
}

const MAX_RANGE_DAYS = 4;
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type SelectedRangeState = {
  start: Date | null;
  end: Date | null;
};

type CalendarDay = {
  date: Date;
  inCurrentMonth: boolean;
};

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfMonth(date: Date): Date {
  const next = startOfDay(date);
  next.setDate(1);
  return next;
}

function addMonths(base: Date, count: number): Date {
  const next = new Date(base);
  next.setDate(1);
  next.setMonth(next.getMonth() + count);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(base: Date, count: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + count);
  next.setHours(0, 0, 0, 0);
  return next;
}

function compareMonth(a: Date, b: Date): number {
  const yearDiff = a.getFullYear() - b.getFullYear();
  if (yearDiff !== 0) {
    return yearDiff;
  }
  return a.getMonth() - b.getMonth();
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

function isWithinRange(date: Date, start: Date, end: Date): boolean {
  return !isBefore(date, start) && !isAfter(date, end);
}

function getMonthDays(monthStart: Date): CalendarDay[] {
  const offset = new Date(monthStart);
  offset.setDate(1);
  const firstDayOfWeek = offset.getDay();

  const totalCells = 6 * 7;
  const days: CalendarDay[] = [];

  for (let index = 0; index < totalCells; index += 1) {
    const current = new Date(monthStart);
    current.setDate(index - firstDayOfWeek + 1);
    current.setHours(0, 0, 0, 0);

    days.push({
      date: current,
      inCurrentMonth: current.getMonth() === monthStart.getMonth(),
    });
  }

  return days;
}

export function DateRangeModal({
  isMinimized,
  onMinimize,
  onExpand,
  onApply,
  currentRange,
  minDate,
  maxDate,
}: DateRangeModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<SelectedRangeState>(
    () => ({
      start: startOfDay(currentRange.startDate),
      end: startOfDay(currentRange.endDate),
    })
  );
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [visibleMonthStart, setVisibleMonthStart] = useState<Date>(() =>
    startOfMonth(currentRange.startDate)
  );

  const minSelectableDate = useMemo(
    () => (minDate ? startOfDay(minDate) : null),
    [minDate]
  );
  const maxSelectableDate = useMemo(
    () => startOfDay(maxDate ?? new Date()),
    [maxDate]
  );

  const earliestMonth = useMemo(
    () => (minSelectableDate ? startOfMonth(minSelectableDate) : null),
    [minSelectableDate]
  );
  const latestMonth = useMemo(
    () => startOfMonth(maxSelectableDate),
    [maxSelectableDate]
  );

  const isSelectingEnd = Boolean(selectedRange.start && !selectedRange.end);

  const previewEnd = useMemo(() => {
    if (!isSelectingEnd || !selectedRange.start || !hoveredDate) {
      return null;
    }

    if (isBefore(hoveredDate, selectedRange.start)) {
      return null;
    }

    if (isAfter(hoveredDate, maxSelectableDate)) {
      return null;
    }

    if (
      getInclusiveDaySpan({
        startDate: selectedRange.start,
        endDate: hoveredDate,
      }) > MAX_RANGE_DAYS
    ) {
      return null;
    }

    return hoveredDate;
  }, [hoveredDate, isSelectingEnd, maxSelectableDate, selectedRange.start]);

  const rangeLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${formatter.format(currentRange.startDate)} - ${formatter.format(
      currentRange.endDate
    )}`;
  }, [currentRange.endDate, currentRange.startDate]);

  const monthLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    []
  );

  const summaryFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  useEffect(() => {
    if (isMinimized) {
      return;
    }

    const normalizedStart = startOfDay(currentRange.startDate);
    const normalizedEnd = startOfDay(currentRange.endDate);

    setSelectedRange({ start: normalizedStart, end: normalizedEnd });
    setHoveredDate(null);
    setError(null);

    let targetMonth = startOfMonth(normalizedStart);
    const monthAhead = addMonths(targetMonth, 1);

    if (compareMonth(monthAhead, latestMonth) > 0) {
      targetMonth = addMonths(latestMonth, -1);
    }

    if (earliestMonth && compareMonth(targetMonth, earliestMonth) < 0) {
      targetMonth = earliestMonth;
    }

    setVisibleMonthStart(targetMonth);
  }, [
    currentRange.endDate,
    currentRange.startDate,
    earliestMonth,
    isMinimized,
    latestMonth,
  ]);

  useEffect(() => {
    setVisibleMonthStart((current) => {
      let next = current;
      if (compareMonth(next, latestMonth) > 0) {
        next = latestMonth;
      }
      if (earliestMonth && compareMonth(next, earliestMonth) < 0) {
        next = earliestMonth;
      }
      return next;
    });
  }, [earliestMonth, latestMonth]);

  const canGoPrev = useMemo(() => {
    if (!earliestMonth) {
      return true;
    }
    return compareMonth(visibleMonthStart, earliestMonth) > 0;
  }, [earliestMonth, visibleMonthStart]);

  const canGoNext = useMemo(() => {
    const nextMonth = addMonths(visibleMonthStart, 1);
    return compareMonth(nextMonth, latestMonth) <= 0;
  }, [latestMonth, visibleMonthStart]);

  const handlePrevMonth = useCallback(() => {
    setVisibleMonthStart((current) => {
      const candidate = addMonths(current, -1);
      if (earliestMonth && compareMonth(candidate, earliestMonth) < 0) {
        return current;
      }
      return candidate;
    });
  }, [earliestMonth]);

  const handleNextMonth = useCallback(() => {
    setVisibleMonthStart((current) => {
      const candidate = addMonths(current, 1);
      if (compareMonth(candidate, latestMonth) > 0) {
        return current;
      }
      return candidate;
    });
  }, [latestMonth]);

  const handleDayClick = useCallback((date: Date) => {
    const normalized = startOfDay(date);

    setSelectedRange((prev) => {
      if (!prev.start || prev.end) {
        return { start: normalized, end: null };
      }

      if (isBefore(normalized, prev.start)) {
        return { start: normalized, end: null };
      }

      const span = getInclusiveDaySpan({
        startDate: prev.start,
        endDate: normalized,
      });

      if (span > MAX_RANGE_DAYS) {
        return prev;
      }

      return { start: prev.start, end: normalized };
    });

    setHoveredDate(null);
    setError(null);
  }, []);

  const handleDayHover = useCallback(
    (date: Date | null) => {
      if (!date) {
        setHoveredDate(null);
        return;
      }

      if (!isSelectingEnd) {
        setHoveredDate(null);
        return;
      }

      const normalized = startOfDay(date);
      setHoveredDate(normalized);
    },
    [isSelectingEnd]
  );

  const isDayDisabled = useCallback(
    (date: Date, inCurrentMonth: boolean) => {
      if (!inCurrentMonth) {
        return true;
      }

      if (minSelectableDate && isBefore(date, minSelectableDate)) {
        return true;
      }

      if (isAfter(date, maxSelectableDate)) {
        return true;
      }

      if (!selectedRange.start || selectedRange.end) {
        return false;
      }

      const limit = addDays(selectedRange.start, MAX_RANGE_DAYS - 1);
      if (isAfter(date, limit)) {
        return true;
      }

      return false;
    },
    [
      maxSelectableDate,
      minSelectableDate,
      selectedRange.end,
      selectedRange.start,
    ]
  );

  const handleApply = () => {
    if (!selectedRange.start || !selectedRange.end) {
      setError('Please choose both start and end dates.');
      return;
    }

    if (isAfter(selectedRange.start, selectedRange.end)) {
      setError('Start date must be before the end date.');
      return;
    }

    if (minSelectableDate && isBefore(selectedRange.start, minSelectableDate)) {
      setError('Start date is earlier than the available data.');
      return;
    }

    if (isAfter(selectedRange.end, maxSelectableDate)) {
      setError('End date cannot be in the future.');
      return;
    }

    if (
      getInclusiveDaySpan({
        startDate: selectedRange.start,
        endDate: selectedRange.end,
      }) > MAX_RANGE_DAYS
    ) {
      setError(`Timeframe cannot exceed ${MAX_RANGE_DAYS} days.`);
      return;
    }

    onApply({
      startDate: startOfDay(selectedRange.start),
      endDate: startOfDay(selectedRange.end),
    });
    onMinimize();
  };

  if (isMinimized) {
    return (
      <div className="date-range-modal-overlay">
        <button
          type="button"
          className="date-range-modal__minimized"
          onClick={onExpand}
          aria-label="Expand timeframe selector"
        >
          <Calendar size={16} />
          <div className="date-range-modal__minimized-label">
            <span>Timeframe</span>
            <strong>{rangeLabel}</strong>
          </div>
        </button>
      </div>
    );
  }

  const months = [visibleMonthStart, addMonths(visibleMonthStart, 1)];
  const committedRange = Boolean(selectedRange.start && selectedRange.end);

  return (
    <div
      className="date-range-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="date-range-modal-title"
    >
      <div className="date-range-modal" data-component="DateRangeModal">
        <div className="date-range-modal__header">
          <h2
            id="date-range-modal-title"
            style={{ fontWeight: 900, textAlign: 'center' }}
          >
            Wildfire Dates
          </h2>
        </div>
        <div className="date-range-modal__body">
          <div className="date-range-modal__summary">
            <div className="date-range-summary-field">
              <span>Start</span>
              <strong>
                {selectedRange.start
                  ? summaryFormatter.format(selectedRange.start)
                  : 'Add date'}
              </strong>
            </div>
            <div className="date-range-summary-field">
              <span>End</span>
              <strong>
                {selectedRange.end
                  ? summaryFormatter.format(selectedRange.end)
                  : 'Add date'}
              </strong>
            </div>
          </div>
          <div className="date-range-calendar">
            <div className="date-range-calendar__nav">
              <button
                type="button"
                className="date-range-calendar__nav-button"
                onClick={handlePrevMonth}
                disabled={!canGoPrev}
                aria-label="Show previous months"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="date-range-calendar__nav-button"
                onClick={handleNextMonth}
                disabled={!canGoNext}
                aria-label="Show upcoming months"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div
              className="date-range-calendar__months"
              onMouseLeave={() => handleDayHover(null)}
            >
              {months.map((month) => {
                const days = getMonthDays(month);
                const monthKey = `${month.getFullYear()}-${month.getMonth()}`;

                return (
                  <div className="date-range-calendar__month" key={monthKey}>
                    <div className="date-range-calendar__month-title">
                      {monthLabelFormatter.format(month)}
                    </div>
                    <div className="date-range-calendar__weekdays">
                      {DAYS_OF_WEEK.map((day) => (
                        <div
                          key={`${monthKey}-${day}`}
                          className="date-range-calendar__weekday"
                        >
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="date-range-calendar__grid">
                      {days.map(({ date, inCurrentMonth }) => {
                        const dayKey = date.toISOString();
                        const disabled = isDayDisabled(date, inCurrentMonth);
                        const isStart =
                          selectedRange.start &&
                          isSameDay(date, selectedRange.start);
                        const isEnd =
                          selectedRange.end &&
                          isSameDay(date, selectedRange.end);
                        const isCommittedRangeDay =
                          committedRange &&
                          selectedRange.start &&
                          selectedRange.end &&
                          isWithinRange(
                            date,
                            selectedRange.start,
                            selectedRange.end
                          );
                        const isPreviewRangeDay =
                          !committedRange &&
                          previewEnd &&
                          selectedRange.start &&
                          isWithinRange(date, selectedRange.start, previewEnd);
                        const isPreviewEnd =
                          !committedRange &&
                          previewEnd &&
                          isSameDay(date, previewEnd);

                        const classes = [
                          'date-range-calendar__day',
                          !inCurrentMonth ? 'is-outside' : '',
                          disabled ? 'is-disabled' : '',
                          isCommittedRangeDay ? 'is-in-range' : '',
                          isPreviewRangeDay ? 'is-preview' : '',
                          isStart ? 'is-range-start' : '',
                          isEnd ? 'is-range-end' : '',
                          isPreviewEnd ? 'is-preview-end' : '',
                          isStart && !selectedRange.end && !previewEnd
                            ? 'is-start-only'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ');

                        return (
                          <button
                            key={dayKey}
                            type="button"
                            className={classes}
                            disabled={disabled}
                            onClick={() => !disabled && handleDayClick(date)}
                            onMouseEnter={() =>
                              !disabled && handleDayHover(date)
                            }
                            aria-label={summaryFormatter.format(date)}
                          >
                            {date.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {error && <div className="date-range-modal__error">{error}</div>}
        </div>
        <div className="date-range-modal__footer">
          <Button
            type="button"
            buttonStyle="flush"
            label="Cancel"
            onClick={() => {
              setError(null);
              onMinimize();
            }}
          />
          <Button
            type="button"
            label="Apply"
            onClick={handleApply}
            disabled={!selectedRange.start || !selectedRange.end}
          />
        </div>
      </div>
    </div>
  );
}
