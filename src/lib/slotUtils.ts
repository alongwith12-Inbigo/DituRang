import { format, addDays } from 'date-fns';
import { Tutor, Reservation } from '../types';

export const PERIOD_START_TIMES: Record<number, string> = {
  1: "08:50",
  2: "09:50",
  3: "10:50",
  4: "11:50",
  5: "13:40",
  6: "14:40",
  7: "15:40"
};

/**
 * Returns true if the given period on dateStr has already started or ended relative to `now`.
 */
export function isPeriodInPast(dateStr: string, period: number, now: Date = new Date()): boolean {
  const todayStr = format(now, 'yyyy-MM-dd');
  if (dateStr < todayStr) return true;
  if (dateStr > todayStr) return false;

  const nowTime = format(now, 'HH:mm');
  const startTime = PERIOD_START_TIMES[period];
  if (!startTime) return true;

  // If current time is equal to or past the period start time, it cannot be reserved.
  return nowTime >= startTime;
}

/**
 * Checks if the tutor is scheduled to work on this day and period.
 */
export function isTutorScheduled(tutor: Tutor, dateStr: string, period: number): boolean {
  const dayDate = new Date(dateStr);
  const dayIdx = (dayDate.getDay() + 6) % 7; // Monday = 0
  if (dayIdx < 0 || dayIdx > 4) return false;

  const mon = format(addDays(dayDate, -dayIdx), 'yyyy-MM-dd');
  const periods = tutor.weekOverrides?.[mon]?.[dayIdx] ?? tutor.workSchedule?.[dayIdx] ?? [];
  return periods.includes(period);
}

/**
 * Checks if there is already an existing reservation for this tutor, date, and period.
 */
export function isSlotBooked(
  reservations: Reservation[],
  tutorId: string,
  dateStr: string,
  period: number,
  excludeReservationId?: string
): boolean {
  return reservations.some(
    r => r.tutorId === tutorId &&
         r.date === dateStr &&
         r.period === period &&
         (!excludeReservationId || r.id !== excludeReservationId)
  );
}

/**
 * Checks whether a slot is fully available for booking:
 * - Month is not closed
 * - Tutor is scheduled
 * - Time is in the future (not already passed)
 * - Slot is not already booked
 */
export function isSlotAvailable(
  dateStr: string,
  period: number,
  tutor: Tutor,
  reservations: Reservation[],
  closedMonths?: string[],
  now: Date = new Date(),
  excludeReservationId?: string
): boolean {
  const monthStr = dateStr.substring(0, 7);
  if (closedMonths?.includes(monthStr)) return false;

  if (!isTutorScheduled(tutor, dateStr, period)) return false;
  if (isPeriodInPast(dateStr, period, now)) return false;
  if (isSlotBooked(reservations, tutor.id, dateStr, period, excludeReservationId)) return false;

  return true;
}

/**
 * Finds the earliest available slot from current date/time for the specified tutor.
 * Considers current time, working schedules, existing bookings, and closed months.
 */
export function findEarliestAvailableSlot(
  tutor: Tutor,
  reservations: Reservation[],
  closedMonths?: string[],
  now: Date = new Date(),
  maxDaysAhead: number = 30
): { date: string; period: number } | null {
  for (let offset = 0; offset < maxDaysAhead; offset++) {
    const candidateDate = addDays(now, offset);
    const dayIdx = (candidateDate.getDay() + 6) % 7;
    if (dayIdx < 0 || dayIdx > 4) continue; // Skip weekends

    const dateStr = format(candidateDate, 'yyyy-MM-dd');
    const monthStr = dateStr.substring(0, 7);
    if (closedMonths?.includes(monthStr)) continue;

    // Check periods 1 through 7
    for (let p = 1; p <= 7; p++) {
      if (isSlotAvailable(dateStr, p, tutor, reservations, closedMonths, now)) {
        return { date: dateStr, period: p };
      }
    }
  }

  // Fallback: If no slot available in maxDaysAhead, find the first scheduled slot from tomorrow
  for (let offset = 1; offset < maxDaysAhead; offset++) {
    const candidateDate = addDays(now, offset);
    const dayIdx = (candidateDate.getDay() + 6) % 7;
    if (dayIdx < 0 || dayIdx > 4) continue;

    const dateStr = format(candidateDate, 'yyyy-MM-dd');
    for (let p = 1; p <= 7; p++) {
      if (isTutorScheduled(tutor, dateStr, p)) {
        return { date: dateStr, period: p };
      }
    }
  }

  return null;
}
