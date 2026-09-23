export interface SchoolEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description?: string;
  createdAt: any;
}

export type ReservationType = 'priority' | 'normal';

export interface Tutor {
  id: string;
  name: string;
  isActive: boolean;
  workSchedule: { [dayIndex: number]: number[] }; // Default weekly schedule
  weekOverrides?: { [weekStart: string]: { [dayIndex: number]: number[] } }; // Optional overrides for specific weeks
}

export interface Reservation {
  id: string;
  tutorId: string;
  date: string; // YYYY-MM-DD
  period: number; // 0 (점심시간) or 1-7
  reason: string;
  category: string;
  classInfo?: string;
  subjectInfo?: string;
  locationInfo?: string;
  otherDetail?: string;
  type: ReservationType;
  teacherName: string;
  recurrenceId?: string;
  createdAt: any;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: any;
}

export const LUNCH_PERIOD = 0;

export const ALL_PERIODS = [1, 2, 3, 4, 0, 5, 6, 7] as const;

export const PERIOD_TIMES: Record<number | string, string> = {
  1: "08:50",
  2: "09:50",
  3: "10:50",
  4: "11:50",
  0: "12:40",
  l: "점심시간",
  5: "13:40",
  6: "14:40",
  7: "15:40"
};

export const DAYS = ["월", "화", "수", "목", "금"];

export function getPeriodLabel(period: number): string {
  if (period === 0) return '점심';
  return `${period}교시`;
}

export function getPeriodFullLabel(period: number): string {
  if (period === 0) return '점심시간 (12:40)';
  return `${period}교시 (${PERIOD_TIMES[period] || ''})`;
}

export function comparePeriods(p1: number, p2: number): number {
  const idx1 = ALL_PERIODS.indexOf(p1 as any);
  const idx2 = ALL_PERIODS.indexOf(p2 as any);
  return (idx1 === -1 ? p1 : idx1) - (idx2 === -1 ? p2 : idx2);
}
