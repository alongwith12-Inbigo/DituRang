import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, addDays, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Tutor, Reservation, SchoolEvent } from '../types';
import { cn } from '../lib/utils';
import { Coins, Clock, Download, Printer, ChevronRight, Calendar, UserCheck, CheckCircle2 } from 'lucide-react';

interface TutorSalaryReportProps {
  tutors: Tutor[];
  reservations?: Reservation[];
  schoolEvents?: SchoolEvent[];
}

interface MonthDetail {
  month: number; // 4 ~ 12
  monthStr: string; // YYYY-MM
  monthName: string; // "4월"
  tutorStats: {
    [tutorId: string]: {
      rawHours: number; // 주/월 한도 적용 전 실제 시간
      weeklyCappedHours: number; // 주 14시간 상한 적용 시간
      payableHours: number; // 월 60시간 상한 적용 최종 인정 시간
      salary: number; // payableHours * 30,000
      cumHours: number; // 4월부터 누계 시간
      cumSalary: number; // 4월부터 누계 급여
      isWeeklyOver: boolean; // 주 14시간 초과 주가 있었는지 여부
      isMonthlyOver: boolean; // 월 60시간 초과 여부
      weekBreakdown: {
        weekStart: string;
        weekLabel: string;
        rawHours: number;
        cappedHours: number;
        days: { date: string; dayName: string; hours: number; periods: number[] }[];
      }[];
    };
  };
  totalPayableHours: number;
  totalSalary: number;
  totalCumSalary: number;
}

const HOURLY_RATE = 30000;
const MAX_WEEKLY_HOURS = 14;
const MAX_MONTHLY_HOURS = 60;
const TARGET_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const SYSTEM_START_DATE = '2026-04-28'; // 근무 개시 기준일 (4월은 4/28부터 산정)

export default function TutorSalaryReport({ tutors, reservations = [], schoolEvents = [] }: TutorSalaryReportProps) {
  const [selectedYear, setSelectedYear] = React.useState<number>(2026);
  const [selectedDetail, setSelectedDetail] = React.useState<{
    month: number;
    tutor: Tutor;
    stats: MonthDetail['tutorStats'][string];
  } | null>(null);

  // Helper to get week start (Monday)
  const getWeekStart = (dateStr: string) => {
    const d = parseISO(dateStr);
    const monday = startOfWeek(d, { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  };

  // Helper to check if slot is active
  const isSlotActive = (tutor: Tutor, dateStr: string, period: number) => {
    // Check system start date restriction
    if (selectedYear === 2026 && dateStr < SYSTEM_START_DATE) {
      return false;
    }

    const dayDate = parseISO(dateStr);
    const dayIdx = (dayDate.getDay() + 6) % 7; // Monday = 0
    if (dayIdx >= 5) return false; // Weekend

    const mon = getWeekStart(dateStr);
    return tutor.weekOverrides?.[mon]?.[dayIdx]?.includes(period) ?? tutor.workSchedule?.[dayIdx]?.includes(period) ?? false;
  };

  const tutor1 = tutors.find(t => t.id === 'tutor1') || tutors[0] || { id: 'tutor1', name: '튜터 1', isActive: true, workSchedule: {} };
  const tutor2 = tutors.find(t => t.id === 'tutor2') || tutors[1] || { id: 'tutor2', name: '튜터 2', isActive: true, workSchedule: {} };
  const activeTutors = [tutor1, tutor2];

  // Calculate monthly stats for 4월 ~ 12월
  const reportData = React.useMemo(() => {
    const monthsData: MonthDetail[] = [];

    // Running cumulative trackers for each tutor
    const cumTrackers: { [tutorId: string]: { hours: number; salary: number } } = {};
    activeTutors.forEach(t => {
      cumTrackers[t.id] = { hours: 0, salary: 0 };
    });

    let totalRunningCumSalary = 0;

    TARGET_MONTHS.forEach(month => {
      const monthStr = `${selectedYear}-${String(month).padStart(2, '0')}`;
      const monthStart = startOfMonth(new Date(selectedYear, month - 1, 1));
      const monthEnd = endOfMonth(monthStart);
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      const tutorStats: MonthDetail['tutorStats'] = {};
      let monthTotalPayableHours = 0;
      let monthTotalSalary = 0;

      activeTutors.forEach(tutor => {
        // Group days in this month by their Monday weekStart
        const weeksMap: { [weekStart: string]: { date: string; dayName: string; hours: number; periods: number[] }[] } = {};

        daysInMonth.forEach(day => {
          const dayIdx = (day.getDay() + 6) % 7;
          if (dayIdx >= 5) return; // Skip weekends

          const dateStr = format(day, 'yyyy-MM-dd');
          const weekStart = getWeekStart(dateStr);

          // Find active periods (respecting 2026-04-28 start date)
          const activePeriods = [1, 2, 3, 4, 5, 6, 7].filter(p => isSlotActive(tutor, dateStr, p));
          const hours = activePeriods.length;

          if (!weeksMap[weekStart]) {
            weeksMap[weekStart] = [];
          }
          weeksMap[weekStart].push({
            date: dateStr,
            dayName: format(day, 'EEE', { locale: ko }),
            hours,
            periods: activePeriods
          });
        });

        // Calculate hours per week (applying weekly cap of 14 hours)
        let rawMonthHours = 0;
        let weeklyCappedMonthHours = 0;
        let isWeeklyOver = false;

        const weekBreakdown = Object.keys(weeksMap).sort().map(weekStart => {
          const days = weeksMap[weekStart];
          const weekRawHours = days.reduce((sum, d) => sum + d.hours, 0);
          const weekCapped = Math.min(MAX_WEEKLY_HOURS, weekRawHours);
          if (weekRawHours > MAX_WEEKLY_HOURS) {
            isWeeklyOver = true;
          }

          rawMonthHours += weekRawHours;
          weeklyCappedMonthHours += weekCapped;

          const wStartDate = parseISO(weekStart);
          const wEndDate = addDays(wStartDate, 4);

          return {
            weekStart,
            weekLabel: `${format(wStartDate, 'MM.dd')} ~ ${format(wEndDate, 'MM.dd')}`,
            rawHours: weekRawHours,
            cappedHours: weekCapped,
            days
          };
        });

        // Apply monthly cap of 60 hours
        const isMonthlyOver = weeklyCappedMonthHours > MAX_MONTHLY_HOURS;
        const payableHours = Math.min(MAX_MONTHLY_HOURS, weeklyCappedMonthHours);
        const salary = payableHours * HOURLY_RATE;

        // Update cumulative stats
        cumTrackers[tutor.id].hours += payableHours;
        cumTrackers[tutor.id].salary += salary;

        tutorStats[tutor.id] = {
          rawHours: rawMonthHours,
          weeklyCappedHours: weeklyCappedMonthHours,
          payableHours,
          salary,
          cumHours: cumTrackers[tutor.id].hours,
          cumSalary: cumTrackers[tutor.id].salary,
          isWeeklyOver,
          isMonthlyOver,
          weekBreakdown
        };

        monthTotalPayableHours += payableHours;
        monthTotalSalary += salary;
      });

      totalRunningCumSalary += monthTotalSalary;

      monthsData.push({
        month,
        monthStr,
        monthName: `${month}월`,
        tutorStats,
        totalPayableHours: monthTotalPayableHours,
        totalSalary: monthTotalSalary,
        totalCumSalary: totalRunningCumSalary
      });
    });

    return monthsData;
  }, [tutors, selectedYear, tutor1.id, tutor2.id]);

  // Grand totals for 4~12 months
  const grandTotal = React.useMemo(() => {
    const t1Last = reportData[reportData.length - 1]?.tutorStats[tutor1.id];
    const t2Last = reportData[reportData.length - 1]?.tutorStats[tutor2.id];

    return {
      t1TotalHours: t1Last?.cumHours || 0,
      t1TotalSalary: t1Last?.cumSalary || 0,
      t2TotalHours: t2Last?.cumHours || 0,
      t2TotalSalary: t2Last?.cumSalary || 0,
      allTotalHours: (t1Last?.cumHours || 0) + (t2Last?.cumHours || 0),
      allTotalSalary: (t1Last?.cumSalary || 0) + (t2Last?.cumSalary || 0)
    };
  }, [reportData, tutor1.id, tutor2.id]);

  // CSV Export handler
  const handleExportCSV = () => {
    const headers = [
      '월',
      `${tutor1.name}_근무시간(시간)`,
      `${tutor1.name}_해당월급(원)`,
      `${tutor1.name}_근무누계(시간)`,
      `${tutor1.name}_월급누계(원)`,
      `${tutor2.name}_근무시간(시간)`,
      `${tutor2.name}_해당월급(원)`,
      `${tutor2.name}_근무누계(시간)`,
      `${tutor2.name}_월급누계(원)`,
      '월별합계_총근무시간(시간)',
      '월별합계_총지급액(원)'
    ];

    const rows = reportData.map(r => {
      const s1 = r.tutorStats[tutor1.id];
      const s2 = r.tutorStats[tutor2.id];
      return [
        r.monthName,
        s1?.payableHours ?? 0,
        s1?.salary ?? 0,
        s1?.cumHours ?? 0,
        s1?.cumSalary ?? 0,
        s2?.payableHours ?? 0,
        s2?.salary ?? 0,
        s2?.cumHours ?? 0,
        s2?.cumSalary ?? 0,
        r.totalPayableHours,
        r.totalSalary
      ];
    });

    // Add total row
    rows.push([
      '총계(4~12월)',
      grandTotal.t1TotalHours,
      grandTotal.t1TotalSalary,
      grandTotal.t1TotalHours,
      grandTotal.t1TotalSalary,
      grandTotal.t2TotalHours,
      grandTotal.t2TotalSalary,
      grandTotal.t2TotalHours,
      grandTotal.t2TotalSalary,
      grandTotal.allTotalHours,
      grandTotal.allTotalSalary
    ]);

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedYear}년_튜터_월급정산표(4월~12월).csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Coins size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-800">튜터 월급 및 근무시간 정산표</h3>
              <span className="text-[11px] px-2 py-0.5 bg-blue-100/80 text-blue-700 font-bold rounded-md">
                4월~12월 통합
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              기준 단가 30,000원/시간 | 주간 최대 14시간 | 월간 최대 60시간 (근무개시: 2026.04.28~)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-500 mr-2">연도</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs font-black text-slate-800 outline-none cursor-pointer"
            >
              {[2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <Download size={14} /> 엑셀 다운로드
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <Printer size={14} /> 인쇄
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tutor 1 Card */}
        <div className="bg-gradient-to-br from-rose-50/60 to-white p-4 rounded-2xl border border-rose-100 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-black text-sm">
              1
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-800">{tutor1.name}</span>
                <span className="text-[10px] text-rose-600 font-bold bg-rose-100/60 px-1.5 py-0.5 rounded">총 9개월</span>
              </div>
              <p className="text-xs font-bold text-slate-500 mt-0.5">총 {grandTotal.t1TotalHours}시간 근무</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400">총 누계 지급액</span>
            <p className="text-base font-black text-rose-600">{grandTotal.t1TotalSalary.toLocaleString()}원</p>
          </div>
        </div>

        {/* Tutor 2 Card */}
        <div className="bg-gradient-to-br from-sky-50/60 to-white p-4 rounded-2xl border border-sky-100 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-black text-sm">
              2
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-800">{tutor2.name}</span>
                <span className="text-[10px] text-sky-600 font-bold bg-sky-100/60 px-1.5 py-0.5 rounded">총 9개월</span>
              </div>
              <p className="text-xs font-bold text-slate-500 mt-0.5">총 {grandTotal.t2TotalHours}시간 근무</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400">총 누계 지급액</span>
            <p className="text-base font-black text-sky-600">{grandTotal.t2TotalSalary.toLocaleString()}원</p>
          </div>
        </div>

        {/* Overall Grand Total Card */}
        <div className="bg-gradient-to-br from-amber-50/80 to-white p-4 rounded-2xl border border-amber-200 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-sm">
              합
            </div>
            <div>
              <span className="text-sm font-black text-slate-800">전체 튜터 합산 (4~12월)</span>
              <p className="text-xs font-bold text-slate-500 mt-0.5">총 {grandTotal.allTotalHours}시간 집계</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400">총 소요 예산</span>
            <p className="text-base font-black text-amber-700">{grandTotal.allTotalSalary.toLocaleString()}원</p>
          </div>
        </div>
      </div>

      {/* Main Table Container with Clear Layout & Readable Typography */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
            <h4 className="text-xs font-black text-slate-700">월별 근무시간 및 급여 정산 일람표</h4>
            <span className="text-[11px] text-slate-400">|</span>
            <span className="text-[11px] text-slate-500 font-medium">행을 클릭하면 해당 월의 주차별 상세 내역을 확인할 수 있습니다.</span>
          </div>
          <span className="text-[11px] font-bold text-slate-400">단위: 시간, 원(KRW)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[960px]">
            <thead>
              {/* Group Tier Headers */}
              <tr className="border-b border-slate-200 text-center font-bold">
                <th rowSpan={2} className="py-3 px-3.5 bg-slate-100 text-slate-700 border-r border-slate-200 w-16 text-center">
                  월별
                </th>
                
                {/* Tutor 1 Header Group */}
                <th colSpan={4} className="py-2.5 px-3 bg-rose-50/90 text-rose-900 border-r border-rose-200">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span className="text-xs font-black">{tutor1.name}</span>
                  </div>
                </th>

                {/* Tutor 2 Header Group */}
                <th colSpan={4} className="py-2.5 px-3 bg-sky-50/90 text-sky-900 border-r border-sky-200">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    <span className="text-xs font-black">{tutor2.name}</span>
                  </div>
                </th>

                {/* Combined Total Header Group */}
                <th colSpan={2} className="py-2.5 px-3 bg-amber-50/90 text-amber-950 border-r border-amber-200">
                  <span className="text-xs font-black">월별 합계</span>
                </th>

                <th rowSpan={2} className="py-3 px-2.5 bg-slate-100 text-slate-600 w-12 text-center">
                  상세
                </th>
              </tr>

              {/* Sub Columns Header */}
              <tr className="border-b border-slate-200 text-[11px] font-bold text-center text-slate-600">
                {/* Tutor 1 Sub Columns */}
                <th className="py-2 px-2.5 bg-rose-50/40 border-r border-slate-200/80 whitespace-nowrap">근무시간</th>
                <th className="py-2 px-2.5 bg-rose-50/40 border-r border-slate-200/80 whitespace-nowrap">해당 월급</th>
                <th className="py-2 px-2.5 bg-rose-50/20 border-r border-slate-200/80 text-slate-500 whitespace-nowrap">근무 누계</th>
                <th className="py-2 px-2.5 bg-rose-50/20 border-r border-rose-200 text-slate-500 whitespace-nowrap">월급 누계</th>

                {/* Tutor 2 Sub Columns */}
                <th className="py-2 px-2.5 bg-sky-50/40 border-r border-slate-200/80 whitespace-nowrap">근무시간</th>
                <th className="py-2 px-2.5 bg-sky-50/40 border-r border-slate-200/80 whitespace-nowrap">해당 월급</th>
                <th className="py-2 px-2.5 bg-sky-50/20 border-r border-slate-200/80 text-slate-500 whitespace-nowrap">근무 누계</th>
                <th className="py-2 px-2.5 bg-sky-50/20 border-r border-sky-200 text-slate-500 whitespace-nowrap">월급 누계</th>

                {/* Total Sub Columns */}
                <th className="py-2 px-2.5 bg-amber-50/40 border-r border-slate-200/80 text-amber-900 whitespace-nowrap">총 근무시간</th>
                <th className="py-2 px-2.5 bg-amber-50/40 border-r border-amber-200 text-amber-900 whitespace-nowrap">총 지급액</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {reportData.map((row, idx) => {
                const s1 = row.tutorStats[tutor1.id];
                const s2 = row.tutorStats[tutor2.id];

                return (
                  <tr 
                    key={row.month} 
                    className={cn(
                      "hover:bg-blue-50/40 transition-colors h-11 font-medium cursor-pointer",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    )}
                    onClick={() => setSelectedDetail({ month: row.month, tutor: tutor1, stats: s1 })}
                  >
                    {/* Month Cell */}
                    <td className="py-2 px-3.5 font-black text-slate-800 bg-slate-100/50 border-r border-slate-200 text-center whitespace-nowrap">
                      {row.monthName}
                    </td>

                    {/* Tutor 1: 당월 근무시간 */}
                    <td className="py-2 px-2.5 text-center border-r border-slate-100 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 font-mono font-bold text-slate-800">
                        <span>{s1?.payableHours || 0}시간</span>
                        {s1?.isWeeklyOver && (
                          <span className="px-1 py-0.2 text-[9px] bg-amber-100 text-amber-800 rounded font-bold" title="주 14시간 한도 초과분 조정">
                            주한도
                          </span>
                        )}
                        {s1?.isMonthlyOver && (
                          <span className="px-1 py-0.2 text-[9px] bg-rose-100 text-rose-800 rounded font-bold" title="월 60시간 한도 초과분 조정">
                            월한도
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Tutor 1: 해당 월급 */}
                    <td className="py-2 px-3 text-right font-mono font-black text-rose-600 border-r border-slate-100 whitespace-nowrap">
                      {(s1?.salary || 0).toLocaleString()}원
                    </td>

                    {/* Tutor 1: 근무 누계 */}
                    <td className="py-2 px-2.5 text-center font-mono text-slate-500 bg-slate-50/50 border-r border-slate-100 whitespace-nowrap">
                      {s1?.cumHours || 0}시간
                    </td>

                    {/* Tutor 1: 월급 누계 */}
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-700 bg-slate-50/50 border-r border-rose-100 whitespace-nowrap">
                      {(s1?.cumSalary || 0).toLocaleString()}원
                    </td>

                    {/* Tutor 2: 당월 근무시간 */}
                    <td className="py-2 px-2.5 text-center border-r border-slate-100 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 font-mono font-bold text-slate-800">
                        <span>{s2?.payableHours || 0}시간</span>
                        {s2?.isWeeklyOver && (
                          <span className="px-1 py-0.2 text-[9px] bg-amber-100 text-amber-800 rounded font-bold" title="주 14시간 한도 초과분 조정">
                            주한도
                          </span>
                        )}
                        {s2?.isMonthlyOver && (
                          <span className="px-1 py-0.2 text-[9px] bg-rose-100 text-rose-800 rounded font-bold" title="월 60시간 한도 초과분 조정">
                            월한도
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Tutor 2: 해당 월급 */}
                    <td className="py-2 px-3 text-right font-mono font-black text-sky-600 border-r border-slate-100 whitespace-nowrap">
                      {(s2?.salary || 0).toLocaleString()}원
                    </td>

                    {/* Tutor 2: 근무 누계 */}
                    <td className="py-2 px-2.5 text-center font-mono text-slate-500 bg-slate-50/50 border-r border-slate-100 whitespace-nowrap">
                      {s2?.cumHours || 0}시간
                    </td>

                    {/* Tutor 2: 월급 누계 */}
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-700 bg-slate-50/50 border-r border-sky-100 whitespace-nowrap">
                      {(s2?.cumSalary || 0).toLocaleString()}원
                    </td>

                    {/* Total: 총 근무시간 */}
                    <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-800 bg-amber-50/30 border-r border-slate-100 whitespace-nowrap">
                      {row.totalPayableHours}시간
                    </td>

                    {/* Total: 총 지급액 */}
                    <td className="py-2 px-3 text-right font-mono font-black text-amber-800 bg-amber-50/30 border-r border-amber-100 whitespace-nowrap">
                      {row.totalSalary.toLocaleString()}원
                    </td>

                    {/* Action Button */}
                    <td className="py-2 px-2 text-center" onClick={(e) => { e.stopPropagation(); setSelectedDetail({ month: row.month, tutor: tutor1, stats: s1 }); }}>
                      <button 
                        className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-lg transition-colors inline-flex items-center cursor-pointer"
                        title="주차별 상세 내역"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Grand Total Summary Row */}
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold h-12">
                <td className="py-2 px-3.5 text-center font-black text-slate-900 border-r border-slate-200 whitespace-nowrap">
                  총계<br/><span className="text-[10px] text-slate-500 font-medium">(4~12월)</span>
                </td>

                {/* Tutor 1 Totals */}
                <td className="py-2 px-2.5 text-center font-mono font-black text-slate-900 border-r border-slate-200 whitespace-nowrap">
                  {grandTotal.t1TotalHours}시간
                </td>
                <td className="py-2 px-3 text-right font-mono font-black text-rose-600 border-r border-slate-200 whitespace-nowrap">
                  {grandTotal.t1TotalSalary.toLocaleString()}원
                </td>
                <td className="py-2 px-2.5 text-center font-mono text-slate-600 bg-slate-200/50 border-r border-slate-200 whitespace-nowrap">
                  {grandTotal.t1TotalHours}시간
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800 bg-slate-200/50 border-r border-rose-200 whitespace-nowrap">
                  {grandTotal.t1TotalSalary.toLocaleString()}원
                </td>

                {/* Tutor 2 Totals */}
                <td className="py-2 px-2.5 text-center font-mono font-black text-slate-900 border-r border-slate-200 whitespace-nowrap">
                  {grandTotal.t2TotalHours}시간
                </td>
                <td className="py-2 px-3 text-right font-mono font-black text-sky-600 border-r border-slate-200 whitespace-nowrap">
                  {grandTotal.t2TotalSalary.toLocaleString()}원
                </td>
                <td className="py-2 px-2.5 text-center font-mono text-slate-600 bg-slate-200/50 border-r border-slate-200 whitespace-nowrap">
                  {grandTotal.t2TotalHours}시간
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800 bg-slate-200/50 border-r border-sky-200 whitespace-nowrap">
                  {grandTotal.t2TotalSalary.toLocaleString()}원
                </td>

                {/* Combined Grand Totals */}
                <td className="py-2 px-2.5 text-center font-mono font-black text-amber-950 bg-amber-100/70 border-r border-slate-200 whitespace-nowrap">
                  {grandTotal.allTotalHours}시간
                </td>
                <td className="py-2 px-3 text-right font-mono font-black text-amber-900 bg-amber-100/70 border-r border-amber-200 whitespace-nowrap">
                  {grandTotal.allTotalSalary.toLocaleString()}원
                </td>

                <td className="py-2 px-2 bg-slate-100 text-center"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-slate-800">
                  {selectedYear}년 {selectedDetail.month}월 주차별 근무시간 상세
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  선생님별 주당 한도(최대 14시간) 및 월간 한도(최대 60시간) 적용 내역
                </p>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {/* Tutor switch tabs */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                {activeTutors.map(t => {
                  const mData = reportData.find(r => r.month === selectedDetail.month);
                  const isCur = selectedDetail.tutor.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedDetail({
                        month: selectedDetail.month,
                        tutor: t,
                        stats: mData?.tutorStats[t.id]!
                      })}
                      className={cn(
                        "px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                        isCur ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>

              {/* Monthly Stats Capsule */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div>
                  <span className="text-[11px] font-bold text-slate-400">실제 총 근무시간</span>
                  <p className="text-base font-black text-slate-700 mt-0.5">{selectedDetail.stats.rawHours}시간</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-blue-600">인정 근무시간 (상한적용)</span>
                  <p className="text-base font-black text-blue-700 mt-0.5">{selectedDetail.stats.payableHours}시간</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-emerald-600">해당 월 급여 (3만원/시)</span>
                  <p className="text-base font-black text-emerald-700 mt-0.5">{selectedDetail.stats.salary.toLocaleString()}원</p>
                </div>
              </div>

              {/* Week-by-Week List */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-black text-slate-700">주차별 일자 및 교시 내역</h5>
                {selectedDetail.stats.weekBreakdown.map((wb, wIdx) => (
                  <div key={wIdx} className="p-3.5 bg-slate-50/60 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Calendar size={13} className="text-slate-400" />
                        {wb.weekLabel} (주 {wIdx + 1}차)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-slate-600">
                          {wb.rawHours}시간
                        </span>
                        {wb.rawHours > MAX_WEEKLY_HOURS ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-700 font-bold rounded">
                            주 14시간 인정
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded">
                            정상
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 pt-1.5 border-t border-slate-200">
                      {wb.days.map((d, dIdx) => (
                        <div key={dIdx} className={cn(
                          "p-1.5 rounded-lg text-center border text-xs",
                          d.hours > 0 ? "bg-white border-slate-200 text-slate-800" : "bg-transparent border-dashed border-slate-200 text-slate-300"
                        )}>
                          <p className="text-[10px] font-bold text-slate-500">{d.date.slice(5)} ({d.dayName})</p>
                          <p className="font-black mt-0.5 text-xs">{d.hours}시간</p>
                          {d.periods.length > 0 && (
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                              {d.periods.join(',')}교시
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedDetail(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
