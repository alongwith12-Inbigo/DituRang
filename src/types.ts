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
  period: number; // 1-7
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

export const PERIOD_TIMES = {
  1: "08:50",
  2: "09:50",
  3: "10:50",
  4: "11:50",
  l: "점심시간",
  5: "13:40",
  6: "14:40",
  7: "15:40"
} as const;

export const DAYS = ["월", "화", "수", "목", "금"];
