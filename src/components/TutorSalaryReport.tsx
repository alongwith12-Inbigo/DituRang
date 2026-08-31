import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, addDays, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Tutor, Reservation } from '../types';
import { cn } from '../lib/utils';
import { Coins, Clock, AlertTriangle, Download, Printer, CheckCircle2, ChevronRight, Info, Calendar } from 'lucide-react';

interface TutorSalaryReportProps {
  tutors: Tutor[];
  reservations?: Reservation[];
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

export default function TutorSalaryReport({ tutors, reservations = [] }: TutorSalaryReportProps) {
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
    const dayDate = parseISO(dateStr);
    const dayIdx = (dayDate.getDay() + 6) % 7; // Monday = 0
    if (dayIdx >= 5) return false; // Weekend
    const mon = getWeekStart(dateStr);
    return tutor.weekOverrides?.[mon]?.[dayIdx]?.includes(period) ?? tutor.workSchedule?.[dayIdx]?.includes(period) ?? false;
  };

  // Calculate monthly stats for 4월 ~ 12월
  const reportData = React.useMemo(() => {
    const activeTutors = tutors.slice(0, 2); // Two tutors
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

          // Find active periods
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
  }, [tutors, selectedYear]);

  const tutor1 = tutors.find(t => t.id === 'tutor1') || tutors[0] || { id: 'tutor1', name: '튜터 1', isActive: true, workSchedule: {} };
  const tutor2 = tutors.find(t => t.id === 'tutor2') || tutors[1] || { id: 'tutor2', name: '튜터 2', isActive: true, workSchedule: {} };

  // Totals for all 4~12 months
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
      `${tutor1.name}_월급(원)`,
      `${tutor1.name}_근무시간누계(시간)`,
      `${tutor1.name}_월급누계(원)`,
      `${tutor2.name}_근무시간(시간)`,
      `${tutor2.name}_월급(원)`,
      `${tutor2.name}_근무시간누계(시간)`,
      `${tutor2.name}_월급누계(원)`,
      '당월합계_근무시간(시간)',
      '당월합계_지급액(원)',
      '총누계_지급액(원)'
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
        r.totalSalary,
        r.totalCumSalary
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
      grandTotal.allTotalSalary,
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
    link.download = `${selectedYear}년_디지털튜터_월급정산표(4월~12월).csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Info Cards */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-[#ECEFF1] to-[#F5F5F5] p-6 rounded-3xl border border-[#CFD8DC]/60">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#455A64] text-white rounded-2xl shadow-md">
            <Coins size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-[#263238]">디지털 튜터 월급 및 근무시간 정산표</h3>
            <p className="text-xs font-bold text-[#607D8B] mt-0.5">
              4월부터 12월까지의 월별 근무시간, 지급 월급 및 누계 현황 종합 관리
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white px-3 py-1.5 rounded-xl border border-[#CFD8DC] shadow-xs">
            <span className="text-xs font-black text-[#546E7A] mr-2">기준 연도:</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-sm font-black text-[#263238] outline-none cursor-pointer"
            >
              {[2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-[#37474F] hover:bg-[#ECEFF1] border border-[#CFD8DC] rounded-xl text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Download size={14} /> 엑셀(CSV) 다운로드
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#37474F] hover:bg-[#263238] text-white rounded-xl text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Printer size={14} /> 인쇄
          </button>
        </div>
      </div>

      {/* Rules & Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#EEEEEE] shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Coins size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#90A4AE]">지급 단가 (시급)</p>
            <p className="text-base font-black text-[#37474F] mt-0.5">30,000원 / 시간</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#EEEEEE] shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-[#0288D1] flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#90A4AE]">주간 근무 한도</p>
            <p className="text-base font-black text-[#37474F] mt-0.5">최대 14시간 / 주</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#EEEEEE] shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Calendar size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#90A4AE]">월간 근무 한도</p>
            <p className="text-base font-black text-[#37474F] mt-0.5">최대 60시간 / 월</p>
          </div>
        </div>
      </div>

      {/* Main Single Combined Table */}
      <div className="bg-white rounded-3xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <div className="p-5 bg-[#FAFAFA] border-b border-[#EEEEEE] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-black text-[#37474F]">{selectedYear}년 4월 ~ 12월 튜터 급여 정산 일람표</h4>
            <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-bold">
              선생님 2명 통합 표
            </span>
          </div>
          <p className="text-[11px] text-[#90A4AE]">
            * 각 월의 셀을 클릭하면 주차별 상세 근무 내역을 확인할 수 있습니다.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              {/* Header Tier 1 */}
              <tr className="bg-[#455A64] text-white font-bold h-11 border-b border-[#37474F]">
                <th rowSpan={2} className="px-3 py-2 border-r border-[#546E7A] w-14 font-black">
                  구분
                </th>
                <th colSpan={4} className="px-4 py-2 border-r border-[#546E7A] bg-[#37474F]">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF80AB]"></span>
                    <span className="text-sm font-black text-white">{tutor1.name}</span>
                  </div>
                </th>
                <th colSpan={4} className="px-4 py-2 border-r border-[#546E7A] bg-[#263238]">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#40C4FF]"></span>
                    <span className="text-sm font-black text-white">{tutor2.name}</span>
                  </div>
                </th>
                <th colSpan={2} className="px-4 py-2 bg-[#1B2428]">
                  <span className="text-sm font-black text-amber-300">월별 합계</span>
                </th>
                <th rowSpan={2} className="px-3 py-2 w-14 font-bold bg-[#1B2428] border-l border-[#37474F]">
                  상세
                </th>
              </tr>

              {/* Header Tier 2 */}
              <tr className="bg-[#546E7A] text-white font-bold h-9 border-b border-[#37474F] text-[11px]">
                {/* Tutor 1 Columns */}
                <th className="px-2 py-1.5 border-r border-[#607D8B] bg-[#455A64]">근무시간</th>
                <th className="px-2 py-1.5 border-r border-[#607D8B] bg-[#455A64]">해당 월급</th>
                <th className="px-2 py-1.5 border-r border-[#607D8B] bg-[#3E4F57]">근무 누계</th>
                <th className="px-2 py-1.5 border-r border-[#607D8B] bg-[#3E4F57]">월급 누계</th>

                {/* Tutor 2 Columns */}
                <th className="px-2 py-1.5 border-r border-[#607D8B] bg-[#37474F]">근무시간</th>
                <th className="px-2 py-1.5 border-r border-[#607D8B] bg-[#37474F]">해당 월급</th>
                <th className="px-2 py-1.5 border-r border-[#607D8B] bg-[#2E3C42]">근무 누계</th>
                <th className="px-2 py-1.5 border-r border-[#607D8B] bg-[#2E3C42]">월급 누계</th>

                {/* Total Columns */}
                <th className="px-2 py-1.5 border-r border-[#607D8B] bg-[#263238] text-amber-200">총 근무시간</th>
                <th className="px-2 py-1.5 bg-[#263238] text-amber-200">총 지급액</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#EEEEEE]">
              {reportData.map((row, idx) => {
                const s1 = row.tutorStats[tutor1.id];
                const s2 = row.tutorStats[tutor2.id];

                return (
                  <tr 
                    key={row.month} 
                    className={cn(
                      "hover:bg-sky-50/50 transition-colors h-12 font-medium cursor-pointer",
                      idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]"
                    )}
                    onClick={() => setSelectedDetail({ month: row.month, tutor: tutor1, stats: s1 })}
                  >
                    {/* Month Column */}
                    <td className="px-2 py-2 font-black text-[#37474F] bg-[#ECEFF1]/40 border-r border-[#E0E0E0]">
                      {row.monthName}
                    </td>

                    {/* Tutor 1: 근무시간 */}
                    <td className="px-2 py-2 border-r border-[#EEEEEE] font-mono text-xs">
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-bold text-[#263238]">{s1?.payableHours || 0}시간</span>
                        {s1?.isWeeklyOver && (
                          <span className="px-1 py-0.2 text-[9px] bg-amber-100 text-amber-800 rounded font-bold" title="주 14시간 한도 초과분 조정됨">
                            주한도
                          </span>
                        )}
                        {s1?.isMonthlyOver && (
                          <span className="px-1 py-0.2 text-[9px] bg-red-100 text-red-800 rounded font-bold" title="월 60시간 한도 초과분 조정됨">
                            월한도
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Tutor 1: 해당 월급 */}
                    <td className="px-2 py-2 border-r border-[#EEEEEE] font-mono text-xs text-right pr-3 text-[#1565C0] font-bold">
                      {(s1?.salary || 0).toLocaleString()}원
                    </td>

                    {/* Tutor 1: 근무 누계 */}
                    <td className="px-2 py-2 border-r border-[#EEEEEE] font-mono text-xs bg-[#F5F5F5]/60 text-[#546E7A]">
                      {s1?.cumHours || 0}시간
                    </td>

                    {/* Tutor 1: 월급 누계 */}
                    <td className="px-2 py-2 border-r border-[#E0E0E0] font-mono text-xs bg-[#F5F5F5]/60 text-right pr-3 text-[#37474F] font-bold">
                      {(s1?.cumSalary || 0).toLocaleString()}원
                    </td>

                    {/* Tutor 2: 근무시간 */}
                    <td className="px-2 py-2 border-r border-[#EEEEEE] font-mono text-xs">
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-bold text-[#263238]">{s2?.payableHours || 0}시간</span>
                        {s2?.isWeeklyOver && (
                          <span className="px-1 py-0.2 text-[9px] bg-amber-100 text-amber-800 rounded font-bold" title="주 14시간 한도 초과분 조정됨">
                            주한도
                          </span>
                        )}
                        {s2?.isMonthlyOver && (
                          <span className="px-1 py-0.2 text-[9px] bg-red-100 text-red-800 rounded font-bold" title="월 60시간 한도 초과분 조정됨">
                            월한도
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Tutor 2: 해당 월급 */}
                    <td className="px-2 py-2 border-r border-[#EEEEEE] font-mono text-xs text-right pr-3 text-[#0277BD] font-bold">
                      {(s2?.salary || 0).toLocaleString()}원
                    </td>

                    {/* Tutor 2: 근무 누계 */}
                    <td className="px-2 py-2 border-r border-[#EEEEEE] font-mono text-xs bg-[#F5F5F5]/60 text-[#546E7A]">
                      {s2?.cumHours || 0}시간
                    </td>

                    {/* Tutor 2: 월급 누계 */}
                    <td className="px-2 py-2 border-r border-[#E0E0E0] font-mono text-xs bg-[#F5F5F5]/60 text-right pr-3 text-[#37474F] font-bold">
                      {(s2?.cumSalary || 0).toLocaleString()}원
                    </td>

                    {/* Monthly Combined: 총 근무시간 */}
                    <td className="px-2 py-2 border-r border-[#EEEEEE] font-mono text-xs font-bold text-[#37474F] bg-amber-50/30">
                      {row.totalPayableHours}시간
                    </td>

                    {/* Monthly Combined: 총 지급액 */}
                    <td className="px-2 py-2 border-r border-[#EEEEEE] font-mono text-xs font-black text-right pr-3 text-[#D84315] bg-amber-50/30">
                      {row.totalSalary.toLocaleString()}원
                    </td>

                    {/* Action button */}
                    <td className="px-2 py-2 text-center" onClick={(e) => { e.stopPropagation(); setSelectedDetail({ month: row.month, tutor: tutor1, stats: s1 }); }}>
                      <button 
                        className="p-1 hover:bg-[#ECEFF1] text-[#78909C] hover:text-[#37474F] rounded-lg transition-colors inline-flex items-center"
                        title="주차별 상세 내역 보기"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Total Summary Row (4월 ~ 12월 종합) */}
              <tr className="bg-[#ECEFF1] font-black text-xs border-t-2 border-[#B0BEC5] h-14">
                <td className="px-2 py-2 text-[#263238] font-black border-r border-[#CFD8DC]">
                  총계<br/><span className="text-[10px] font-bold text-[#78909C]">(4~12월)</span>
                </td>

                {/* Tutor 1 Totals */}
                <td className="px-2 py-2 border-r border-[#CFD8DC] font-mono text-sm text-[#263238]">
                  {grandTotal.t1TotalHours}시간
                </td>
                <td className="px-2 py-2 border-r border-[#CFD8DC] font-mono text-sm text-right pr-3 text-[#1565C0]">
                  {grandTotal.t1TotalSalary.toLocaleString()}원
                </td>
                <td className="px-2 py-2 border-r border-[#CFD8DC] font-mono text-xs text-[#546E7A] bg-[#CFD8DC]/30">
                  {grandTotal.t1TotalHours}시간
                </td>
                <td className="px-2 py-2 border-r border-[#B0BEC5] font-mono text-xs text-right pr-3 text-[#37474F] bg-[#CFD8DC]/30">
                  {grandTotal.t1TotalSalary.toLocaleString()}원
                </td>

                {/* Tutor 2 Totals */}
                <td className="px-2 py-2 border-r border-[#CFD8DC] font-mono text-sm text-[#263238]">
                  {grandTotal.t2TotalHours}시간
                </td>
                <td className="px-2 py-2 border-r border-[#CFD8DC] font-mono text-sm text-right pr-3 text-[#0277BD]">
                  {grandTotal.t2TotalSalary.toLocaleString()}원
                </td>
                <td className="px-2 py-2 border-r border-[#CFD8DC] font-mono text-xs text-[#546E7A] bg-[#CFD8DC]/30">
                  {grandTotal.t2TotalHours}시간
                </td>
                <td className="px-2 py-2 border-r border-[#B0BEC5] font-mono text-xs text-right pr-3 text-[#37474F] bg-[#CFD8DC]/30">
                  {grandTotal.t2TotalSalary.toLocaleString()}원
                </td>

                {/* All Combined Totals */}
                <td className="px-2 py-2 border-r border-[#CFD8DC] font-mono text-sm text-amber-900 bg-amber-100/50">
                  {grandTotal.allTotalHours}시간
                </td>
                <td className="px-2 py-2 border-r border-[#CFD8DC] font-mono text-sm text-right pr-3 text-red-700 bg-amber-100/50">
                  {grandTotal.allTotalSalary.toLocaleString()}원
                </td>

                <td className="px-2 py-2 bg-amber-100/50"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Week Breakdown Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-[#EEEEEE] overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-6 bg-[#F5F5F5] border-b border-[#EEEEEE] flex items-center justify-between">
              <div>
                <h4 className="text-base font-black text-[#37474F]">
                  {selectedYear}년 {selectedDetail.month}월 주차별 근무시간 상세 내역
                </h4>
                <p className="text-xs font-bold text-[#78909C] mt-0.5">
                  선생님별 주당 한도(최대 14시간) 및 월간 한도(최대 60시간) 적용 상세
                </p>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="p-2 hover:bg-[#EEEEEE] rounded-full text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Tutor switch tab inside modal */}
              <div className="flex gap-2 p-1 bg-[#ECEFF1] rounded-2xl w-fit">
                {[tutor1, tutor2].map(t => {
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
                        "px-4 py-2 rounded-xl text-xs font-black transition-all",
                        isCur ? "bg-[#37474F] text-white shadow-xs" : "text-[#546E7A] hover:bg-white/60"
                      )}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>

              {/* Monthly Summary Box */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-[#F9FBE7] rounded-2xl border border-[#E6EE9C]">
                <div>
                  <span className="text-[10px] font-bold text-[#827717]">실제 총 근무시간</span>
                  <p className="text-base font-black text-[#33691E]">{selectedDetail.stats.rawHours}시간</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#827717]">인정 근무시간 (상한적용)</span>
                  <p className="text-base font-black text-[#33691E]">{selectedDetail.stats.payableHours}시간</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#827717]">해당 월 급여 (3만원/시)</span>
                  <p className="text-base font-black text-[#1B5E20]">{selectedDetail.stats.salary.toLocaleString()}원</p>
                </div>
              </div>

              {/* Week-by-Week List */}
              <div className="space-y-3">
                <h5 className="text-xs font-black text-[#455A64]">주차별 일자 및 교시 내역</h5>
                {selectedDetail.stats.weekBreakdown.map((wb, wIdx) => (
                  <div key={wIdx} className="p-4 bg-[#FAFAFA] rounded-2xl border border-[#EEEEEE] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[#37474F] flex items-center gap-1.5">
                        <Calendar size={14} className="text-[#78909C]" />
                        {wb.weekLabel} (주 {wIdx + 1}차)
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[#546E7A]">
                          주간 합계: {wb.rawHours}시간
                        </span>
                        {wb.rawHours > MAX_WEEKLY_HOURS ? (
                          <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 font-bold rounded-lg">
                            최대 14시간 인정 ({wb.rawHours - 14}시간 초과)
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded-lg">
                            정상 인정 ({wb.cappedHours}시간)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-[#EEEEEE]">
                      {wb.days.map((d, dIdx) => (
                        <div key={dIdx} className={cn(
                          "p-2 rounded-xl text-center border text-xs",
                          d.hours > 0 ? "bg-white border-[#CFD8DC] text-[#263238]" : "bg-transparent border-dashed border-[#EEEEEE] text-[#B0BEC5]"
                        )}>
                          <p className="text-[10px] font-bold text-[#78909C]">{d.date.slice(5)} ({d.dayName})</p>
                          <p className="font-black mt-0.5 text-xs">{d.hours}시간</p>
                          {d.periods.length > 0 && (
                            <p className="text-[9px] text-[#90A4AE] font-mono mt-0.5">
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

            <div className="p-4 bg-[#F5F5F5] border-t border-[#EEEEEE] flex justify-end">
              <button
                onClick={() => setSelectedDetail(null)}
                className="px-6 py-2.5 bg-[#37474F] hover:bg-[#263238] text-white text-xs font-bold rounded-xl"
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
