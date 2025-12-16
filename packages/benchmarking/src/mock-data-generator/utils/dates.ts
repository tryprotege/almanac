/**
 * Date utility functions for generating realistic timestamps
 */

export function generateTimeline(days: number): Date[] {
  const dates: Date[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    dates.push(date);
  }

  return dates;
}

/**
 * Generate timeline from a specific start date going forward
 */
export function generateTimelineFromDate(
  startDate: Date,
  days: number
): Date[] {
  const dates: Date[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dates.push(date);
  }

  return dates;
}

export function randomTimeInDay(date: Date): Date {
  const result = new Date(date);
  // Business hours: 9 AM - 6 PM
  const hour = 9 + Math.floor(Math.random() * 9);
  const minute = Math.floor(Math.random() * 60);
  const second = Math.floor(Math.random() * 60);

  result.setHours(hour, minute, second, 0);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600000);
}

export function formatISO(date: Date): string {
  return date.toISOString();
}

export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // Not Sunday or Saturday
}

export function generateRandomDate(startDate: Date, endDate: Date): Date {
  const start = startDate.getTime();
  const end = endDate.getTime();
  const randomTime = start + Math.random() * (end - start);
  return new Date(randomTime);
}

export function generateDateInRange(startDate: Date, endDate: Date): Date {
  return generateRandomDate(startDate, endDate);
}
