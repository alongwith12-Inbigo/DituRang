import React from 'react';
import { motion } from 'motion/react';
import { X, Check, Star, AlertCircle, Calendar } from 'lucide-react';
import { addDoc, collection, serverTimestamp, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { addWeeks, format, addDays } from 'date-fns';
import { db } from '../lib/firebase';
import { Tutor, Reservation, PERIOD_TIMES, DAYS } from '../types';
import { cn } from '../lib/utils';

interface ReservationModalProps {
  tutor: Tutor;
  slot: { date: string; period: number };
  onClose: () => void;
  onSuccess: () => void;
  reservations: Reservation[];
  editReservation?: Reservation;
}

export default function ReservationModal({ tutor, slot, onClose, onSuccess, reservations, editReservation }: ReservationModalProps) {
  const [teacherName, setTeacherName] = React.useState(editReservation?.teacherName || '');
  const [category, setCategory] = React.useState(editReservation?.category || '수업 직접 보조');
  const [classInfo, setClassInfo] = React.useState(editReservation?.classInfo || '');
  const [subjectInfo, setSubjectInfo] = React.useState(editReservation?.subjectInfo || '');
  const [locationInfo, setLocationInfo] = React.useState(editReservation?.locationInfo || '');
  const [otherDetail, setOtherDetail] = React.useState(editReservation?.otherDetail || '');
  const [selectedPeriods, setSelectedPeriods] = React.useState<number[]>(editReservation ? [editReservation.period] : [slot.period]);
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [weeksToRepeat, setWeeksToRepeat] = React.useState(1);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const categories = [
    '수업 직접 보조',
    '기기 활용법 안내',
    '프로그램 활용법 안내',
    '각종 디지털 관련 업무 지원'
  ];

  const getWeekStart = (date: string) => {
    const d = new Date(date);
    return format(addDays(d, -((d.getDay() + 6) % 7)), 'yyyy-MM-dd');
  };

  const isSlotActive = (date: string, period: number) => {
    const dayDate = new Date(date);
    const dayIdx = (dayDate.getDay() + 6) % 7; // Monday = 0
    const mon = getWeekStart(date);
    return tutor.weekOverrides?.[mon]?.[dayIdx]?.includes(period) ?? tutor.workSchedule?.[dayIdx]?.includes(period);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName) return;

    let finalReason = category;
    if (category === '수업 직접 보조') {
      const baseReason = `수업보조: ${classInfo} ${subjectInfo} ${locationInfo ? `(${locationInfo})` : ''}`.trim();
      finalReason = otherDetail ? `${baseReason} - ${otherDetail}` : baseReason;
    } else if (category === '각종 디지털 관련 업무 지원') {
      finalReason = otherDetail;
    }

    setIsSubmitting(true);
    try {
      if (editReservation) {
        // Update single reservation
        await setDoc(doc(db, 'reservations', editReservation.id), {
          ...editReservation,
          teacherName,
          reason: finalReason,
          category,
          classInfo: category === '수업 직접 보조' ? classInfo : null,
          subjectInfo: category === '수업 직접 보조' ? subjectInfo : null,
          locationInfo: category === '수업 직접 보조' ? locationInfo : null,
          otherDetail: (category === '수업 직접 보조' || category === '각종 디지털 관련 업무 지원') ? otherDetail : null,
          updatedAt: serverTimestamp()
        });
        alert("예약이 수정되었습니다.");
        onSuccess();
        return;
      }

      const numWeeks = isRecurring ? weeksToRepeat + 1 : 1;
      const proposedSlots: { date: string; period: number }[] = [];

      // 1. Identify all target slots
      for (let w = 0; w < numWeeks; w++) {
        const currentDate = format(addWeeks(new Date(slot.date), w), 'yyyy-MM-dd');
        for (const p of selectedPeriods) {
          if (!isSlotActive(currentDate, p)) continue;
          proposedSlots.push({ date: currentDate, period: p });
        }
      }

      if (proposedSlots.length === 0) {
        alert("선택하신 시간대에 예약 가능한 시간대가 없습니다.");
        setIsSubmitting(false);
        return;
      }

      // 2. SERVER-SIDE CONFLICT CHECK
      const conflictChecks = proposedSlots.map(async (s) => {
        const q = query(
          collection(db, 'reservations'),
          where('tutorId', '==', tutor.id),
          where('date', '==', s.date),
          where('period', '==', s.period)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data();
          return `${s.date} (${s.period}교시): ${docData.teacherName} 선생님 이미 예약됨`;
        }
        return null;
      });

      const results = await Promise.all(conflictChecks);
      const serverConflicts = results.filter((r): r is string => r !== null);

      if (serverConflicts.length > 0) {
        alert(`중복된 예약이 확인되었습니다:\n\n${serverConflicts.join('\n')}\n\n다른 시간을 선택해 주십시오.`);
        setIsSubmitting(false);
        return;
      }

      // 3. Proceed with creation
      const batches = [];
      const recurrenceId = isRecurring ? Math.random().toString(36).substr(2, 9) : null;

      for (const s of proposedSlots) {
        batches.push(addDoc(collection(db, 'reservations'), {
          tutorId: tutor.id,
          date: s.date,
          period: s.period,
          teacherName,
          reason: finalReason,
          category,
          classInfo: category === '수업 직접 보조' ? classInfo : null,
          subjectInfo: category === '수업 직접 보조' ? subjectInfo : null,
          locationInfo: category === '수업 직접 보조' ? locationInfo : null,
          otherDetail: (category === '수업 직접 보조' || category === '각종 디지털 관련 업무 지원') ? otherDetail : null,
          type: 'normal',
          recurrenceId,
          createdAt: serverTimestamp()
        }));
      }

      await Promise.all(batches);
      alert(`${isRecurring ? (weeksToRepeat + 1) + '주 동안 ' : ''}총 ${batches.length}건의 예약이 성공적으로 신청되었습니다.`);
      onSuccess();
    } catch (err) {
      console.error(err);
      alert("예약 신청 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePeriod = (p: number) => {
    if (selectedPeriods.includes(p)) {
      if (selectedPeriods.length > 1) setSelectedPeriods(prev => prev.filter(x => x !== p));
    } else {
      // Must check if active before adding
      if (!isSlotActive(slot.date, p)) {
        alert(`${DAYS[(new Date(slot.date).getDay() + 6) % 7]}요일 ${p}교시는 튜터님의 근무 시간이 아닙니다.`);
        return;
      }
      setSelectedPeriods(prev => [...prev, p].sort((a,b) => a-b));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-900/5 backdrop-blur-sm overflow-hidden print:hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden border border-[#F3E5F5] flex flex-col max-h-[90vh]"
      >
        <header className="px-8 py-6 bg-[#FBF9FE]/50 border-b border-[#F3E5F5] flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-[#5E35B1] tracking-tight">
              {editReservation ? '예약 수정하기' : '지원 요청하기'} (DiTu-Rang)
            </h2>
            <p className="text-[10px] font-bold text-[#D1C4E9] tracking-widest uppercase mt-0.5">
              {tutor.name} 선생님 / {slot.date} {editReservation ? `(${editReservation.period}교시)` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-[#D1C4E9]">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-5 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-black text-[#7B1FA2] uppercase tracking-wider ml-1">신청 교사명</label>
            <input 
              required
              value={teacherName}
              onChange={e => setTeacherName(e.target.value)}
              placeholder="예: 홍길동"
              className="w-full px-4 py-3 bg-[#FCFBFF] rounded-xl border border-[#F3E5F5] focus:ring-4 focus:ring-[#F3E5F5] outline-none transition-all text-[#4A148C] font-black placeholder-[#D1C4E9]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-black text-[#7B1FA2] uppercase tracking-wider ml-1">지원 사유</label>
            <select 
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-4 py-3 bg-[#FCFBFF] rounded-xl border border-[#F3E5F5] focus:ring-4 focus:ring-[#F3E5F5] outline-none transition-all text-[#4A148C] font-black"
            >
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {category === '수업 직접 보조' && (
            <div className="flex flex-col gap-3 p-4 bg-purple-50/20 rounded-2xl border border-purple-100/30 animate-in fade-in slide-in-from-top-1">
               <div className="grid grid-cols-2 gap-3">
                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-black text-[#5E35B1] ml-1">반 (예: 1-1)</label>
                   <input 
                     required
                     value={classInfo}
                     onChange={e => setClassInfo(e.target.value)}
                     className="px-3 py-2 bg-white rounded-lg border border-purple-200 text-sm font-bold text-[#4A148C] outline-none focus:border-purple-400"
                   />
                 </div>
                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-black text-[#5E35B1] ml-1">교과 (예: 사무 행정)</label>
                   <input 
                     required
                     value={subjectInfo}
                     onChange={e => setSubjectInfo(e.target.value)}
                     className="px-3 py-2 bg-white rounded-lg border border-purple-200 text-sm font-bold text-[#4A148C] outline-none focus:border-purple-400"
                   />
                 </div>
               </div>
               <div className="flex flex-col gap-1.5">
                 <label className="text-xs font-black text-[#5E35B1] ml-1">장소 (교실 외 장소인 경우만)</label>
                 <input 
                   value={locationInfo}
                   onChange={e => setLocationInfo(e.target.value)}
                   placeholder="예: 멀티미디어실"
                   className="px-3 py-2 bg-white rounded-lg border border-purple-200 text-sm font-bold text-[#4A148C] outline-none focus:border-purple-400"
                 />
               </div>
               <div className="flex flex-col gap-1.5">
                 <label className="text-xs font-black text-[#5E35B1] ml-1">구체적인 지원 내용 (선택)</label>
                 <textarea 
                   value={otherDetail}
                   onChange={e => setOtherDetail(e.target.value)}
                   placeholder="구체적인 요청 사항이 있다면 입력해주세요."
                   className="px-3 py-2 bg-white rounded-lg border border-purple-200 text-sm font-bold text-[#4A148C] outline-none min-h-[60px] resize-none focus:border-purple-400"
                 />
               </div>
            </div>
          )}

          {category === '각종 디지털 관련 업무 지원' && (
            <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
              <label className="text-[12px] font-black text-[#7B1FA2] uppercase tracking-wider ml-1">구체적 내용</label>
              <textarea 
                required
                value={otherDetail}
                onChange={e => setOtherDetail(e.target.value)}
                placeholder="지원이 필요한 내용을 입력해주세요."
                className="w-full px-4 py-3 bg-[#FCFBFF] rounded-xl border border-[#F3E5F5] focus:ring-4 focus:ring-[#F3E5F5] outline-none transition-all text-[#4A148C] font-black placeholder-[#D1C4E9] min-h-[80px] resize-none"
              />
            </div>
          )}

          {!editReservation && (
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-black text-[#7B1FA2] uppercase tracking-wider ml-1">교시 선택 (연속 가능)</label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map(p => {
                  const active = isSlotActive(slot.date, p);
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!active}
                      onClick={() => togglePeriod(p)}
                      className={cn(
                        "w-10 h-10 rounded-xl text-xs font-black border transition-all flex items-center justify-center",
                        selectedPeriods.includes(p) 
                          ? "bg-purple-500 border-purple-600 text-white shadow-lg shadow-purple-50" 
                          : active 
                            ? "bg-white border-[#F3E5F5] text-[#5E35B1] hover:bg-[#FBF9FE]/50 hover:border-[#D1C4E9]" 
                            : "bg-[#F5F5F5] border-transparent text-[#E1E1E1] cursor-not-allowed"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!editReservation && (
            <div className="flex flex-col gap-3 p-4 bg-blue-50/20 rounded-2xl border border-blue-100/30">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-black text-blue-700">매주 반복 예약</span>
                  <span className="text-[10px] font-medium text-blue-400">선택한 시간대를 다음 주에도 연속으로 예약합니다.</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsRecurring(!isRecurring)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    isRecurring ? "bg-blue-600" : "bg-slate-200"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                    isRecurring ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
              
              {isRecurring && (
                <div className="flex items-center gap-3 pt-2 border-t border-blue-100/30 animate-in fade-in slide-in-from-top-1">
                  <span className="text-xs font-bold text-blue-600">반복 기간:</span>
                  <select 
                    value={weeksToRepeat}
                    onChange={e => setWeeksToRepeat(Number(e.target.value))}
                    className="bg-white border border-blue-100 rounded-lg px-2 py-1 text-xs font-bold text-blue-700 outline-none"
                  >
                    <option value={1}>현재 주 포함 2주</option>
                    <option value={2}>현재 주 포함 3주</option>
                    <option value={3}>현재 주 포함 4주</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-[#673AB7] hover:bg-[#5E35B1] disabled:bg-[#E1E1E1] text-white rounded-2xl font-black shadow-xl shadow-purple-100 transition-all flex items-center justify-center gap-2 mt-2"
          >
            {isSubmitting ? "처리 중..." : (
              editReservation ? <>수정 완료하기 <Check size={20} /></> : <>신청 완료하기 <Check size={20} /></>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
