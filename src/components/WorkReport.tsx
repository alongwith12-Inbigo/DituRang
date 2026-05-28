import React from 'react';
import { motion } from 'motion/react';
import { X, Printer, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getMonth, getYear, parseISO, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Tutor, Reservation, PERIOD_TIMES } from '../types';
import { cn } from '../lib/utils';

interface WorkReportProps {
  tutor: Tutor;
  reservations: Reservation[];
  confirmerName: string;
  onClose: () => void;
}

export default function WorkReport({ tutor, reservations, confirmerName, onClose }: WorkReportProps) {
  const [selectedMonth, setSelectedMonth] = React.useState(new Date());
  const printRef = React.useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Filter reservations for this month and tutor
  const monthReservations = reservations
    .filter(r => {
      const rDate = parseISO(r.date);
      return r.tutorId === tutor.id && 
             getYear(rDate) === getYear(selectedMonth) && 
             getMonth(rDate) === getMonth(selectedMonth);
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);

  // Helper to check if slot is active
  const getWeekStart = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    const monday = new Date(d.setDate(diff));
    return format(monday, 'yyyy-MM-dd');
  };

  const isSlotActive = (dateStr: string, period: number) => {
    const dayDate = new Date(dateStr);
    const dayIdx = (dayDate.getDay() + 6) % 7; // Monday = 0
    const mon = getWeekStart(dateStr);
    return tutor.weekOverrides?.[mon]?.[dayIdx]?.includes(period) ?? tutor.workSchedule?.[dayIdx]?.includes(period) ?? false;
  };

  // Group reservations by date
  const groupedByDate: { [date: string]: Reservation[] } = {};
  
  // First, identify all days in the month
  eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayActivePeriods = [1, 2, 3, 4, 5, 6, 7].filter(p => isSlotActive(dateStr, p));
    
    if (dayActivePeriods.length > 0) {
      const dayReservations = reservations.filter(r => r.tutorId === tutor.id && r.date === dateStr);
      
      const allDayTasks: Reservation[] = [];
      
      dayActivePeriods.forEach(p => {
        const res = dayReservations.find(r => r.period === p);
        if (res) {
          allDayTasks.push(res);
        } else {
          // No reservation for this active slot -> Default to "정보부 업무 보조"
          allDayTasks.push({
            id: `default-${dateStr}-${p}`,
            tutorId: tutor.id,
            date: dateStr,
            period: p,
            teacherName: '정보부',
            reason: '정보부 업무 보조',
            category: '정보부 업무 보조',
            type: 'normal',
            createdAt: { seconds: 0, nanoseconds: 0 } as any
          });
        }
      });

      if (allDayTasks.length > 0) {
        groupedByDate[dateStr] = allDayTasks;
      }
    }
  });

  const rowData = Object.keys(groupedByDate)
    .filter(dateStr => dateStr >= '2026-04-28') // Enforce system start date
    .sort()
    .map(date => {
    const dayRes = [...groupedByDate[date]].sort((a, b) => a.period - b.period);
    
    // Find the first "real" reservation (not a default placeholder)
    const realRes = dayRes.filter(r => r.id && !r.id.startsWith('default-'));
    const firstRes = realRes.length > 0 ? realRes[0] : dayRes[0];
    
    let firstSummary = "업무 보조";
    if (firstRes) {
      if (firstRes.category === '수업 직접 보조') {
        const classPart = firstRes.classInfo ? `${firstRes.classInfo} ` : '';
        const subjectPart = firstRes.subjectInfo ? `${firstRes.subjectInfo} ` : '';
        firstSummary = `${classPart}${subjectPart}수업 보조`.trim();
      } else {
        // Priority: otherDetail (구체적인 지원 내용) -> reason (지원 사유)
        firstSummary = firstRes.otherDetail || firstRes.reason || "정보부 업무 보조";
      }
    }
    
    // Count unique tasks to decide "etc" - only count real tasks if they exist
    const tasksToConsider = realRes.length > 0 ? realRes : dayRes;
    const uniqueTasks = new Set(tasksToConsider.map(r => {
      if (r.category === '수업 직접 보조') {
        const classPart = r.classInfo ? `${r.classInfo} ` : '';
        const subjectPart = r.subjectInfo ? `${r.subjectInfo} ` : '';
        return `${classPart}${subjectPart}수업 보조`.trim();
      }
      return r.otherDetail || r.reason || "정보부 업무 보조";
    }));
    const hasMore = uniqueTasks.size > 1;

    return {
      date,
      count: dayRes.length,
      periods: dayRes.map(r => r.period).sort((a,b) => a-b).join(', '),
      description: `${firstSummary}${hasMore ? ' 등' : ''}`
    };
  });

  const emptyRows = Array.from({ length: Math.max(0, 15 - rowData.length) });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-900/10 backdrop-blur-sm overflow-hidden print:bg-white print:p-0 print:block print:overflow-visible">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-4xl h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-purple-100 print:shadow-none print:border-0 print:h-auto print:w-full print:rounded-none"
      >
        <header className="px-8 py-6 bg-[#FBF9FE]/80 border-b border-purple-50 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h2 className="text-xl font-black text-[#5E35B1]">월간 근무확인서</h2>
              <p className="text-xs font-bold text-[#D1C4E9] uppercase tracking-widest mt-0.5">인쇄 미리보기</p>
            </div>
            
            <div className="flex items-center bg-white px-4 py-2 rounded-xl border border-[#EDE7F6] shadow-sm gap-4">
              <button onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))} className="p-1 hover:bg-purple-50 rounded-lg text-[#D1C4E9] transition-colors">
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-black text-[#673AB7] min-w-[100px] text-center">
                {format(selectedMonth, 'yyyy년 M월')}
              </span>
              <button onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))} className="p-1 hover:bg-purple-50 rounded-lg text-[#D1C4E9] transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#673AB7] hover:bg-[#5E35B1] text-white rounded-xl text-sm font-black shadow-lg shadow-purple-200 transition-all active:scale-95"
            >
              <Printer size={18} /> 인쇄하기
            </button>
            <button onClick={onClose} className="p-2.5 hover:bg-gray-50 rounded-xl transition-colors text-gray-400">
              <X size={24} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-12 bg-[#F9F8FD]/50 print:bg-white print:p-0 print:overflow-visible">
          {/* Print Preview Area */}
          <div className="report-container bg-white shadow-xl mx-auto print:shadow-none print:mx-0 print:w-full print:min-h-0 print:p-0">
            <div ref={printRef} className="w-full text-black font-sans leading-relaxed print:p-0">
              <style dangerouslySetInnerHTML={{ __html: `
                .report-container {
                  width: 210mm;
                  min-height: 297mm;
                  padding: 20mm;
                  box-sizing: border-box;
                }
                @media print {
                  @page { size: A4; margin: 1.2cm 1.5cm; }
                  body { margin: 0; padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                  .report-container {
                    width: 100% !important;
                    min-height: 0 !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                  }
                  .report-table th, .report-table td {
                    padding: 3px 4px !important;
                  }
                  .report-table td.task-description-cell {
                    padding-left: 12px !important;
                    padding-right: 12px !important;
                  }
                }
                .report-table { border-collapse: collapse; width: 100%; border: 1.5px solid #333; table-layout: fixed; }
                .report-table th, .report-table td {
                  border: 1px solid #333 !important;
                  padding: 6px 4px;
                  word-break: break-all;
                  vertical-align: middle;
                }
                .report-table th {
                  text-align: center !important;
                }
                .report-table td {
                  text-align: center;
                }
                .report-table td.task-description-cell {
                  text-align: left !important;
                  padding-left: 14px !important;
                  padding-right: 14px !important;
                }
              `}} />
              
              <div className="text-center mb-12 print:mb-8 mt-4 print:mt-2">
                <h1 className="text-3xl print:text-2xl font-black tracking-[0.3em] mb-10 print:mb-6 border-b-4 border-black inline-block pb-2">디지털 튜터 근무확인서</h1>
                <div className="flex justify-end gap-12 mt-4 print:mt-2 pr-4">
                  <span className="text-lg print:text-base font-bold">강사명: <span className="underline underline-offset-[12px] px-8 text-xl print:text-lg font-black">{tutor.name}</span> (서명/인)</span>
                </div>
              </div>

              <table className="report-table text-[12px] text-center">
                <thead>
                  <tr className="bg-gray-100/50 h-10 print:h-8">
                    <th className="w-[45px]">연번</th>
                    <th className="w-[125px]">일 시</th>
                    <th className="w-[125px]">근무 시간</th>
                    <th className="">주 요 업 무</th>
                    <th className="w-[56px]">확 인</th>
                  </tr>
                </thead>
                <tbody>
                  {rowData.map((row, idx) => (
                    <tr key={idx} className="h-10 print:h-8">
                      <td>{idx + 1}</td>
                      <td className="text-[11px] print:text-[11px] whitespace-nowrap">{format(parseISO(row.date), 'yyyy. MM. dd. (EEE)', { locale: ko })}</td>
                      <td className="text-[11px] print:text-[11px] whitespace-nowrap">{row.count}시간 ({row.periods}교시)</td>
                      <td className="task-description-cell font-medium text-[11.5px] print:text-[11px]">
                        <div className="line-clamp-2 leading-[14px] print:leading-[12px]">
                          {row.description}
                        </div>
                      </td>
                      <td></td>
                    </tr>
                  ))}
                  {emptyRows.map((_, idx) => (
                    <tr key={`empty-${idx}`} className="h-10 print:h-8">
                      <td>{rowData.length + idx + 1}</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  ))}
                  <tr className="h-10 print:h-8 bg-gray-50/50 font-bold">
                    <td colSpan={2}>계</td>
                    <td className="text-[11px] print:text-[11px]">{rowData.reduce((acc, row) => acc + row.count, 0)}시간</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-12 print:mt-8 flex flex-col items-center gap-12 print:gap-8">
                <p className="text-lg print:text-base font-bold">위와 같이 근무하였음을 확인합니다.</p>
                
                <div className="w-full flex justify-end pr-8">
                  <div className="flex flex-col gap-8 print:gap-4 w-64">
                    <div className="flex items-center justify-between border-b border-black pb-1">
                      <span className="font-bold">확인 일자:</span>
                      <span className="text-gray-400">2026년 &nbsp;&nbsp;&nbsp;&nbsp;월 &nbsp;&nbsp;&nbsp;&nbsp;일</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-black pb-1">
                      <span className="font-bold">담당 교사:</span>
                      <span className="text-gray-400">(서명/인)</span>
                    </div>
                  </div>
                </div>

                <div className="mt-12 print:mt-8 text-2xl print:text-xl font-black tracking-widest uppercase">
                   인천비즈니스고등학교
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
