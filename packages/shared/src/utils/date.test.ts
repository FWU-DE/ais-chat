import { describe, expect, it } from 'vitest';

import {
  addDays,
  convertUnixTimestampToLocaleDate,
  formatDateToDayMonthYear,
  formatDateToGermanTimestamp,
  formatDuration,
  formatDurationAsClock,
  getWeekNumber,
} from './date';

describe('convertUnixTimestampToLocaleDate', () => {
  it('should convert a Unix timestamp to the correct locale date format', () => {
    const timestamp = 1672531199; // 31st December 2022, 23:59:59 UTC
    const result = convertUnixTimestampToLocaleDate(timestamp);
    expect(result).toBe('1.1.2023');
  });
});

describe('formatDateToDayMonthYear', () => {
  it('should format a date to "day month year" in German locale', () => {
    const date = new Date(2022, 11, 31); // 31st December 2022
    const result = formatDateToDayMonthYear(date);
    expect(result).toBe('31. Dezember 2022');
  });
});

describe('formatDateToGermanTimestamp', () => {
  it.skip('should format a date to "dd.mm.yyyy hh:mm" in German format', () => {
    const date = new Date('2022-12-31T23:59:00'); // 31st December 2022, 23:59
    const result = formatDateToGermanTimestamp(date);
    expect(result).toBe('31.12.2022, 23:59');
  });

  it.skip('should handle single-digit days and months correctly by padding them', () => {
    const date = new Date('2022-01-05T08:05:00'); // 5th January 2022, 08:05
    const result = formatDateToGermanTimestamp(date);
    expect(result).toBe('05.01.2022, 08:05');
  });
});

describe('formatDuration', () => {
  it('should format durations below one hour as minutes and seconds', () => {
    expect(formatDuration(125)).toBe('02 : 05');
  });

  it('should format durations above one hour as hours, minutes and seconds', () => {
    expect(formatDuration(3723)).toBe('1h 2m 3s');
  });

  it('should format durations above one day with days, hours and minutes', () => {
    expect(formatDuration(93784)).toBe('1d 2h 3m');
  });
});

describe('formatDurationAsClock', () => {
  it('should format durations below one hour as hh:mm:ss', () => {
    expect(formatDurationAsClock(125)).toBe('00:02:05');
  });

  it('should format durations above one hour as hh:mm:ss', () => {
    expect(formatDurationAsClock(3723)).toBe('01:02:03');
  });

  it('should keep accumulating hours beyond 24 hours', () => {
    expect(formatDurationAsClock(93784)).toBe('26:03:04');
  });
});

describe('getWeekNumber', () => {
  it('should return the correct ISO week number for a given date', () => {
    const date = new Date('2022-01-05'); // 5th January 2022
    const result = getWeekNumber(date);
    expect(result).toBe(1); // 5th Jan 2022 falls in the first ISO week of the year
  });

  it('should handle dates late in the year correctly', () => {
    const date = new Date('2022-12-31'); // 31st December 2022
    const result = getWeekNumber(date);
    expect(result).toBe(52);
  });

  it('should handle a date that falls in the first week of the next year correctly', () => {
    const date = new Date('2022-01-01'); // 1st January 2022
    const result = getWeekNumber(date);
    expect(result).toBe(52);
  });
});

describe('addDays', () => {
  it('should add one day correctly', () => {
    const date = new Date('2022-01-01');
    const newDate = addDays(date, 1);
    expect(newDate).toEqual(new Date('2022-01-02'));
  });
  it('should switch month correctly at the end of a month', () => {
    const date = new Date('2022-03-31');
    const newDate = addDays(date, 1);
    expect(newDate).toEqual(new Date('2022-04-01'));
  });
  it('should switch year correctly at the end of a year', () => {
    const date = new Date('2022-12-31');
    const newDate = addDays(date, 1);
    expect(newDate).toEqual(new Date('2023-01-01'));
  });
  it('should subtract one day if days is negative', () => {
    const date = new Date('2022-03-31');
    const newDate = addDays(date, -1);
    expect(newDate).toEqual(new Date('2022-03-30'));
  });
});
