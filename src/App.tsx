import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Calendar, 
  Settings, 
  Printer, 
  RefreshCw, 
  Plus, 
  Info, 
  Check, 
  X, 
  Star,
  Lock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { 
  format, 
  startOfWeek, 
  addDays, 
  startOfToday, 
  addWeeks, 
  isSameDay, 
  parseISO 
} from 'date-fns';
import { ko } from 'date-fns/locale';

import { db } from './lib/firebase';
import { cn } from './lib/utils';
import { 
  Tutor, 
  Reservation, 
  PERIOD_TIMES, 
  DAYS, 
  ReservationType,
  SchoolEvent
} from './types';

// Components
import Timetable from './components/Timetable';
import AdminPanel from './components/AdminPanel';
import ReservationModal from './components/ReservationModal';
import WorkReport from './components/WorkReport';

export default function App() {
  const [tutors, setTutors] = React.useState<Tutor[]>([]);
  const [reservations, setReservations] = React.useState<Reservation[]>([]);
  const [schoolEvents, setSchoolEvents] = React.useState<SchoolEvent[]>([]);
  const [selectedTutorId, setSelectedTutorId] = React.useState<string>('');
  const [selectedWeekOffset, setSelectedWeekOffset] = React.useState(0);
  const [isAdminOpen, setIsAdminOpen] = React.useState(false);
  const [isBookingOpen, setIsBookingOpen] = React.useState(false);
  const [isWorkReportOpen, setIsWorkReportOpen] = React.useState(false);
  const [confirmerName, setConfirmerName] = React.useState('홍길동');
  const [selectedSlot, setSelectedSlot] = React.useState<{ date: string; period: number } | null>(null);
  const [editingReservation, setEditingReservation] = React.useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const printRef = React.useRef<HTMLDivElement>(null);

  const selectedTutor = tutors.find(t => t.id === selectedTutorId);
  const currentWeekStart = startOfWeek(addWeeks(startOfToday(), selectedWeekOffset), { weekStartsOn: 1 });

  const handlePrint = () => {
    window.print();
  };

  // Sync data
  React.useEffect(() => {
    setIsLoading(true);
    setError(null);

    // Initial load for Tutors
    const tutorsQuery = collection(db, 'tutors');
    const unsubscribeTutors = onSnapshot(tutorsQuery, (snapshot) => {
      const tutorList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tutor));
      setTutors(tutorList);
      
      // Select first active tutor if none selected
      if (!selectedTutorId && tutorList.length > 0) {
        const firstActive = tutorList.find(t => t.isActive);
        if (firstActive) setSelectedTutorId(firstActive.id);
        else setSelectedTutorId(tutorList[0].id);
      }
      setIsLoading(false);
    }, (err) => {
      console.error(err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
      setIsLoading(false);
    });

    // Sub for Reservations
    const reservationsQuery = collection(db, 'reservations');
    const unsubscribeReservations = onSnapshot(reservationsQuery, (snapshot) => {
      setReservations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reservation)));
    });

    // Sub for School Events
    const eventsQuery = collection(db, 'school_events');
    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      setSchoolEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent)));
    });

    return () => {
      unsubscribeTutors();
      unsubscribeReservations();
      unsubscribeEvents();
    };
  }, []);

  const weekRange = Array.from({ length: 5 }).map((_, i) => {
    const day = addDays(currentWeekStart, i);
    return {
      date: format(day, 'yyyy-MM-dd'),
      label: `${DAYS[i]} (${format(day, 'MM/dd')})`
    };
  });

  const weeks = [
    { label: '이번 주', offset: 0 },
    { label: '다음 주', offset: 1 },
    { label: '다다음 주', offset: 2 },
    { label: '3주 뒤', offset: 3 },
    { label: '4주 뒤', offset: 4 },
    { label: '5주 뒤', offset: 5 },
  ];

  const handleRefresh = () => {
    window.location.reload();
  };

  if (isLoading && tutors.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FDFCF0]">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-amber-300 animate-spin mx-auto mb-4" />
          <p className="text-[#8D8D8D] font-medium">데이터를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#FDFDFF] font-sans overflow-hidden text-[#4A148C]">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white/80 backdrop-blur-md border-b border-[#F3E5F5] p-4 flex items-center justify-between sticky top-0 z-40 print:hidden">
        <div className="flex flex-col">
          <h1 className="text-xl font-black text-[#673AB7] tracking-tighter leading-none">디튜랑</h1>
          <span className="text-[10px] font-bold text-[#A294CC] tracking-tight uppercase leading-none mt-1">예약 시스템</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrint}
            className="p-2 text-[#6A1B9A] hover:bg-purple-50 rounded-xl transition-colors"
            title="인쇄"
          >
            <Printer size={20} />
          </button>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-[#673AB7] hover:bg-purple-50 rounded-xl transition-colors"
          >
            <Users size={24} />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-[#F9F8FD] border-r border-[#F3E5F5] p-6 flex flex-col gap-8 transition-transform duration-300 transform lg:relative lg:translate-x-0 print:hidden",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
          <div className="flex flex-col gap-0.5 relative">
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden absolute -right-2 top-0 p-1 text-[#BA68C8]"
            >
              <X size={20} />
            </button>
            <div className="flex items-baseline gap-1.5">
              <h1 className="text-2xl lg:text-3xl font-black text-[#673AB7] tracking-tighter">디튜랑</h1>
              <span className="text-[10px] lg:text-sm font-bold text-[#A294CC] tracking-tight whitespace-nowrap">(DiTu-Rang)</span>
            </div>
            <p className="text-[10px] lg:text-sm text-[#5E35B1] font-bold tracking-tight uppercase">디지털 튜터 예약 시스템</p>
          </div>

        <div className="flex flex-col gap-6 flex-1 overflow-y-auto pr-2">
          {/* Tutor Selection */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-black text-[#BA68C8] uppercase tracking-widest flex items-center gap-2">
              <Users size={14} /> 튜터 선택
            </h3>
            <div className="flex flex-col gap-2">
              {tutors.filter(t => t.isActive).map(tutor => (
                <button
                  key={tutor.id}
                  onClick={() => setSelectedTutorId(tutor.id)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 text-left relative overflow-hidden group",
                    selectedTutorId === tutor.id 
                      ? "bg-[#673AB7] text-white shadow-lg shadow-purple-100"
                      : "bg-[#F3E5F5]/30 hover:bg-white text-[#7E57C2] border border-[#F3E5F5]/50"
                  )}
                >
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    selectedTutorId === tutor.id ? "bg-white" : "bg-[#D1C4E9]"
                  )} />
                  <span className="font-bold text-sm">{tutor.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Week Selection */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-black text-[#BA68C8] uppercase tracking-widest flex items-center gap-2">
              <Calendar size={14} /> 예약 주차
            </h3>
            <div className="relative group">
              <select
                value={selectedWeekOffset}
                onChange={(e) => setSelectedWeekOffset(Number(e.target.value))}
                className="w-full pl-4 pr-10 py-3 bg-white border border-[#EDE7F6] rounded-2xl text-xs font-bold text-[#5E35B1] appearance-none focus:outline-none focus:ring-4 focus:ring-[#F3E5F5] transition-all cursor-pointer shadow-sm"
              >
                {weeks.map((week) => {
                  const start = startOfWeek(addWeeks(startOfToday(), week.offset), { weekStartsOn: 1 });
                  const end = addDays(start, 4);
                  const rangeLabel = `${format(start, 'MM.dd')}~${format(end, 'MM.dd')}`;
                  return (
                    <option key={week.offset} value={week.offset}>
                      {format(start, 'M월 ')} {rangeLabel}
                    </option>
                  );
                })}
              </select>
              <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#BA68C8] group-hover:text-purple-600 transition-all pointer-events-none" />
            </div>
          </section>

          {/* Actions */}
          <section className="mt-auto flex flex-col gap-2 pt-4">
            <button 
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#6A1B9A] hover:bg-[#7B1FA2] text-white rounded-2xl text-sm font-black shadow-lg shadow-purple-200 transition-all active:scale-95 group"
            >
              <Printer size={18} className="group-hover:scale-110 transition-transform" /> 주간 시간표 인쇄
            </button>
            <button 
              onClick={() => setIsWorkReportOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-[#F3E5F5] text-[#6A1B9A] rounded-2xl text-sm font-black border border-[#E1BEE7] shadow-sm transition-all active:scale-95"
            >
              <Calendar size={18} /> 월간 근무확인서
            </button>
            <button 
              onClick={() => setIsAdminOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#F3E5F5]/50 hover:bg-[#F3E5F5] text-[#BA68C8] rounded-2xl text-sm font-bold border border-[#E1BEE7]/50 transition-all"
            >
              <Settings size={16} /> 관리자 설정
            </button>
            <button 
              onClick={handleRefresh}
              className="flex items-center justify-center gap-2 px-4 py-2 text-[#BA68C8] hover:text-[#6A1B9A] text-[10px] font-bold transition-all"
            >
              <RefreshCw size={12} /> 시스템 새로고침
            </button>
          </section>
        </div>

        <footer className="pt-6 border-t border-[#E0E0E0]/50 text-[10px] text-[#9E9E9E] font-bold text-center">
          <p className="mb-1">Version 1.0.1 (2026)</p>
          <p>© INBIGO. All Rights Reserved.</p>
        </footer>
      </aside>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-purple-900/10 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className={cn(
        "flex-1 overflow-y-auto p-2 lg:p-8 print:p-0 print:overflow-visible",
        isWorkReportOpen && "print:hidden"
      )}>
        <div ref={printRef} className="max-w-6xl mx-auto flex flex-col gap-3 lg:gap-8 print:max-w-none print:p-0">
          <header className="flex flex-col md:flex-row md:items-end justify-between print:flex print:items-center print:justify-center print:border-b-2 print:border-black print:pb-4 print:mb-8 bg-white/60 p-4 lg:p-8 rounded-[1rem] lg:rounded-[2.5rem] border border-white shadow-xl shadow-purple-100/5 backdrop-blur-md gap-3 md:gap-4">
            <div className="flex flex-col gap-0.5 print:items-center print:w-full">
              <div className="flex items-center gap-2">
                <h2 className="text-base lg:text-xl font-black text-[#5E35B1] tracking-tight print:text-3xl print:text-black">
                  {selectedTutor?.name || (isLoading ? '로딩 중...' : '선택된 튜터 없음')} 
                  <span className="text-[#9575CD] font-bold ml-1 lg:ml-2 print:text-black print:ml-4">주간 시간표</span>
                </h2>
              </div>
              <p className="text-[10px] lg:text-sm font-bold text-[#9575CD] flex items-center gap-1 mt-0.5 print:text-black print:text-sm">
                <Calendar size={12} className="text-[#9575CD] print:hidden" />
                {format(currentWeekStart, 'yyyy년 MM월 dd일 (EEE)', { locale: ko })} — {format(addDays(currentWeekStart, 4), 'MM월 dd일 (EEE)', { locale: ko })}
              </p>
            </div>
            
            <div className="flex bg-white/80 p-2 lg:p-4 rounded-lg lg:rounded-2xl border border-[#F3E5F5]/50 shadow-sm items-center gap-3 print:hidden self-start md:self-auto">
              <div className="text-right">
                <p className="text-sm lg:text-lg font-black text-[#673AB7]">
                  {format(new Date(), 'yyyy. MM. dd.(EEE)', { locale: ko })}
                </p>
                <p className="text-[9px] lg:text-[11px] font-bold text-[#A294CC] uppercase tracking-[0.25em] leading-none">오늘</p>
              </div>
            </div>
          </header>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 lg:gap-4 print:hidden">
            <div className="flex items-center gap-2 text-xs font-bold text-[#424242]">
              <div className={cn("w-4 h-4 rounded-md border", selectedTutor?.id === 'tutor1' ? "bg-[#FFE0E6] border-[#FFD1DA]" : "bg-[#E3F2FF] border-[#D4E9FF]")} />
              근무 시간
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#424242]">
              <div className={cn("w-4 h-4 rounded-md", selectedTutor?.id === 'tutor1' ? "bg-[#FFC1D1]" : "bg-[#B3E5FC]")} />
              예약 완료
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-[#757575]">
              <div className={cn("w-4 h-4 rounded-md flex items-center justify-center", selectedTutor?.id === 'tutor1' ? "bg-[#FFF3E0]" : "bg-[#F3E5F5]")}>
                <Star size={10} className="text-[#FFB300]" fill="currentColor" />
              </div>
              수업 직접 보조
            </div>
          </div>

          <div className="flex-1 overflow-x-auto -mx-4 px-4 pb-4 lg:mx-0 lg:px-0 lg:pb-0">
            {selectedTutor ? (
              <Timetable 
                tutor={selectedTutor} 
                reservations={reservations} 
                schoolEvents={schoolEvents}
                weekRange={weekRange}
                onSlotClick={(date, period) => {
                  setSelectedSlot({ date, period });
                  setIsBookingOpen(true);
                }}
                onReservationClick={(reservation) => {
                  setEditingReservation(reservation);
                  setIsBookingOpen(true);
                }}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-[#F3E5F5] rounded-[1.5rem] bg-white/40 h-64 lg:h-auto">
                <div className="text-center">
                  <Users className="w-12 h-12 text-[#D1C4E9] mx-auto mb-4 opacity-50" />
                  <p className="text-[#B39DDB] font-bold">왼쪽에서 튜터를 선택해 주세요.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isBookingOpen && selectedTutor && (
          <ReservationModal
            tutor={selectedTutor}
            slot={selectedSlot || { date: editingReservation?.date || '', period: editingReservation?.period || 0 }}
            editReservation={editingReservation || undefined}
            onClose={() => {
              setIsBookingOpen(false);
              setSelectedSlot(null);
              setEditingReservation(null);
            }}
            onSuccess={() => {
              setIsBookingOpen(false);
              setSelectedSlot(null);
              setEditingReservation(null);
            }}
            reservations={reservations}
          />
        )}
        
        {isAdminOpen && (
          <AdminPanel 
            tutors={tutors}
            schoolEvents={schoolEvents}
            onClose={() => setIsAdminOpen(false)}
          />
        )}

        {isWorkReportOpen && selectedTutor && (
          <WorkReport 
            tutor={selectedTutor}
            reservations={reservations}
            confirmerName={confirmerName}
            onClose={() => setIsWorkReportOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Notification Toast (Optional) */}
      {error && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-50 text-red-600 px-6 py-3 rounded-2xl shadow-lg border border-red-100 flex items-center gap-3 z-50 print:hidden">
          <X size={20} className="cursor-pointer" onClick={() => setError(null)} />
          <span className="font-medium text-sm">{error}</span>
        </div>
      )}
    </div>
  );
}
