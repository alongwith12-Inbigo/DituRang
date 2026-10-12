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

export function formatPeriodsSummary(periods: number[]): string {
  if (!periods || periods.length === 0) return '';
  const uniquePeriods = Array.from(new Set(periods)).sort(comparePeriods);
  if (uniquePeriods.length === 0) return '';

  // Contiguous grouping according to ALL_PERIODS: [1, 2, 3, 4, 0, 5, 6, 7]
  const groups: number[][] = [];
  let currentGroup: number[] = [];

  for (let i = 0; i < uniquePeriods.length; i++) {
    const p = uniquePeriods[i];
    if (currentGroup.length === 0) {
      currentGroup.push(p);
    } else {
      const prevP = currentGroup[currentGroup.length - 1];
      const prevIdx = ALL_PERIODS.indexOf(prevP as any);
      const currIdx = ALL_PERIODS.indexOf(p as any);

      if (currIdx === prevIdx + 1) {
        if (prevP === 0) {
          // If prev was lunch (0), finish the morning-into-lunch group (e.g. 3교시~점심시간), and start afternoon at 5
          groups.push(currentGroup);
          currentGroup = [p];
        } else {
          currentGroup.push(p);
        }
      } else {
        groups.push(currentGroup);
        currentGroup = [p];
      }
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // If no lunch (0) is included, maintain concise standard format: e.g. "1~4교시" or "1~2, 6~7교시"
  if (!uniquePeriods.includes(0)) {
    const numberRanges = groups.map(group => {
      const start = group[0];
      const end = group[group.length - 1];
      return start === end ? `${start}` : `${start}~${end}`;
    });
    return `${numberRanges.join(', ')}교시`;
  }

  // If lunch (0) IS included: e.g. "3교시~점심시간", "4교시~점심시간", "점심시간~5교시", "점심시간"
  const formattedGroups = groups.map(group => {
    const start = group[0];
    const end = group[group.length - 1];

    if (group.length === 1) {
      if (start === 0) return '점심시간';
      return `${start}교시`;
    }

    if (end === 0) {
      return `${start}교시~점심시간`;
    }

    if (start === 0) {
      return `점심시간~${end}교시`;
    }

    return `${start}~${end}교시`;
  });

  return formattedGroups.join(', ');
}
