import { useEffect, useMemo, useState } from 'react';
import { Calendar, Minimize2 } from 'react-feather';
import { Button } from '../button/Button';
import './DateRangeModal.scss';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface DateRangeModalProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  onApply: (range: DateRange) => void;
  currentRange: DateRange;
  minDate?: Date;
  maxDate?: Date;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseInputToDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const [yearStr, monthStr, dayStr] = value.split('-');
  if (!yearStr || !monthStr || !dayStr) {
    return null;
  }
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10) - 1;
  const day = Number.parseInt(dayStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const date = new Date();
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date;
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
  const [startValue, setStartValue] = useState(() =>
    formatDateForInput(currentRange.startDate)
  );
  const [endValue, setEndValue] = useState(() =>
    formatDateForInput(currentRange.endDate)
  );
  const [error, setError] = useState<string | null>(null);

  const minValue = useMemo(() => (minDate ? formatDateForInput(minDate) : ''), [
    minDate,
  ]);
  const maxValue = useMemo(() => formatDateForInput(maxDate ?? new Date()), [
    maxDate,
  ]);

  useEffect(() => {
    if (isMinimized) {
      return;
    }
    setStartValue(formatDateForInput(currentRange.startDate));
    setEndValue(formatDateForInput(currentRange.endDate));
    setError(null);
  }, [isMinimized, currentRange.startDate, currentRange.endDate]);

  const rangeLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${formatter.format(currentRange.startDate)} - ${formatter.format(
      currentRange.endDate
    )}`;
  }, [currentRange.startDate, currentRange.endDate]);

  const handleApply = () => {
    const parsedStart = parseInputToDate(startValue);
    const parsedEnd = parseInputToDate(endValue);

    if (!parsedStart || !parsedEnd) {
      setError('Please choose both start and end dates.');
      return;
    }

    if (parsedStart > parsedEnd) {
      setError('Start date must be before the end date.');
      return;
    }

    if (maxDate && parsedEnd > maxDate) {
      setError('End date cannot be in the future.');
      return;
    }

    if (minDate && parsedStart < minDate) {
      setError('Start date is earlier than the available data.');
      return;
    }

    onApply({ startDate: parsedStart, endDate: parsedEnd });
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

  return (
    <div
      className="date-range-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="date-range-modal-title"
    >
      <div className="date-range-modal" data-component="DateRangeModal">
        <div className="date-range-modal__header">
          <h2 id="date-range-modal-title">Select Timeframe</h2>
          <button
            type="button"
            className="date-range-modal__close"
            onClick={onMinimize}
            aria-label="Minimize timeframe selector"
          >
            <Minimize2 size={18} />
          </button>
        </div>
        <div className="date-range-modal__body">
          <label className="date-range-input">
            <span>Start date</span>
            <input
              type="date"
              value={startValue}
              max={endValue || maxValue}
              min={minValue}
              onChange={(event) => {
                setStartValue(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
            />
          </label>
          <label className="date-range-input">
            <span>End date</span>
            <input
              type="date"
              value={endValue}
              min={startValue || minValue}
              max={maxValue}
              onChange={(event) => {
                setEndValue(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
            />
          </label>
          {error && <div className="date-range-modal__error">{error}</div>}
        </div>
        <div className="date-range-modal__footer">
          <Button
            type="button"
            buttonStyle="flush"
            label="Cancel"
            onClick={onMinimize}
          />
          <Button type="button" label="Apply" onClick={handleApply} />
        </div>
      </div>
    </div>
  );
}
