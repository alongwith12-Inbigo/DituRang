import React from 'react';
import { motion } from 'motion/react';
import { Star, Plus, Trash2 } from 'lucide-react';
import { deleteDoc, doc } from 'firebase/firestore';
import { format, addDays } from 'date-fns';
import { db } from '../lib/firebase';
import { 
  Tutor, 
  Reservation, 
  PERIOD_TIMES, 
  DAYS, 
} from '../types';
import { cn } from '../lib/utils';

interface TimetableProps {
  tutor: Tutor | undefined;
  reservations: Reservation[];
  weekRange: { date: string; label: string }[];
  onSlotClick: (date: string, period: number) => void;
}

export default function Timetable({ tutor, reservations, weekRange, onSlotClick }: TimetableProps) {
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  if (!tutor) return null;

  const getReservation = (date: string, period: number) => {
    return reservations.find(r => r.date === date && r.period === period && r.tutorId === tutor.id);
  };

  const getWeekStart = (date: string) => {
    const d = new Date(date);
    return format(addDays(d, -((d.getDay() + 6) % 7)), 'yyyy-MM-dd');
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'reservations', deletingId));
      setDeletingId(null);
    } catch (err) {
      console.error(err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const periods = [1, 2, 3, 4, 'lunch', 5, 6, 7];

  return (
    <div className="overflow-x-auto -mx-1 pb-4 lg:mx-0 lg:pb-0">
      <div className="bg-white rounded-[1.5rem] shadow-xl overflow-hidden border border-[#F3E5F5] min-w-[600px] lg:min-w-0 print:shadow-none print:border print:rounded-none lg:print:min-w-0">
        <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="bg-[#FBF9FE]/50 print:bg-transparent">
            <th className="w-14 p-3 border-b border-r border-[#F3E5F5] text-[9px] font-black text-[#9575CD] uppercase tracking-widest text-center">
              교시
            </th>
            {weekRange.map((day, idx) => (
              <th key={idx} className="p-3 border-b border-r last:border-r-0 border-[#F3E5F5] text-center print:p-1">
                <span className="block text-lg font-black text-[#5E35B1] uppercase tracking-tight">{DAYS[idx]}</span>
                <span className="block text-base font-bold text-[#9575CD] mt-0.5 tracking-tighter">{day.date.split('-').slice(1).join('/')}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p, pIdx) => {
            if (p === 'lunch') {
              return (
                <tr key="lunch" className="bg-[#FCFBFF] print:bg-transparent">
                  <td className="p-2 border-b border-r border-[#F3E5F5] text-center">
                    <span className="text-[13px] font-black text-[#9575CD] uppercase tracking-widest">점심시간</span>
                  </td>
                  <td colSpan={5} className="p-1 border-b border-[#F3E5F5] text-center italic text-[#BA68C8] text-[11px] font-bold tracking-widest leading-none uppercase">
                    {PERIOD_TIMES.l} (12:40 - 13:40)
                  </td>
                </tr>
              );
            }

            const period = p as number;

            return (
              <tr key={period}>
                <td className="p-3 border-b border-r border-[#F3E5F5] text-center print:p-1">
                  <span className="block text-xl font-black text-[#9575CD] leading-none mb-1 tracking-tighter">{period}</span>
                  <span className="block text-[11px] font-bold text-[#BA68C8]">{PERIOD_TIMES[period as keyof typeof PERIOD_TIMES]}</span>
                </td>
                {weekRange.map((day, dIdx) => {
                  const reservation = getReservation(day.date, period);
                  const mon = getWeekStart(day.date);
                  const active = tutor.weekOverrides?.[mon]?.[dIdx]?.includes(period) ?? tutor.workSchedule?.[dIdx]?.includes(period);
                  
                  return (
                    <td 
                      key={dIdx} 
                      onClick={(e) => {
                        if (active && !reservation) {
                          onSlotClick(day.date, period);
                        }
                      }}
                      className={cn(
                        "p-1 border-b border-r last:border-r-0 border-[#FDFBFF] relative group h-14 min-h-[56px] print:h-12 transition-all cursor-default",
                        !active && "bg-[#F9F8FD]/40 opacity-30 cursor-not-allowed",
                        active && !reservation && (tutor.id === 'tutor1' ? "bg-[#FFE0E6] hover:bg-[#FFD1DA] cursor-pointer" : "bg-[#E3F2FF] hover:bg-[#D4E9FF] cursor-pointer"),
                        active && reservation && (tutor.id === 'tutor1' ? "bg-[#FFC1D1]" : "bg-[#B3E5FC]")
                      )}
                    >
                      {reservation ? (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="w-full h-full p-1 rounded-lg flex flex-col justify-between relative overflow-hidden"
                        >
                          {(reservation.type === 'priority' || reservation.category === '수업 직접 보조') && (
                            <Star 
                              size={10} 
                              className="absolute top-0.5 right-0.5 text-amber-600" 
                              fill="currentColor" 
                            />
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[12px] lg:text-[13px] font-black text-black leading-tight">
                              {reservation.teacherName}
                            </span>
                            <span className="text-[11px] lg:text-[12px] font-extrabold text-[#000000] leading-[1.2] line-clamp-2">
                              {reservation.reason}
                            </span>
                          </div>
                          
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(reservation.id);
                            }}
                            className="absolute bottom-1 right-1 w-6 h-6 rounded-md bg-red-50 text-red-500 opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm z-10 print:hidden"
                            title="예약 취소"
                          >
                            <Trash2 size={14} />
                          </button>
                        </motion.div>
                      ) : active ? (
                        <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                           <div className={cn(
                             "w-6 h-6 rounded-full flex items-center justify-center shadow-xs",
                             tutor.id === 'tutor1' ? "bg-[#FFF9C4] text-amber-500" : "bg-[#B3E5FC] text-sky-500"
                           )}>
                              <Plus size={14} />
                           </div>
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-purple-900/10 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-8 rounded-3xl shadow-2xl border border-purple-50 w-full max-w-xs flex flex-col gap-6 items-center text-center"
          >
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500">
              <Trash2 size={32} />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-black text-[#1A237E]">예약을 취소할까요?</h3>
              <p className="text-xs font-bold text-gray-400">삭제 후에는 되돌릴 수 없습니다.</p>
            </div>
            <div className="flex gap-2 w-full">
              <button 
                onClick={() => setDeletingId(null)}
                className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-xl text-sm font-black transition-all"
              >
                아니오
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-red-100"
              >
                네, 삭제
              </button>
            </div>
          </motion.div>
        </div>
      )}
      </div>
    </div>
  );
}
