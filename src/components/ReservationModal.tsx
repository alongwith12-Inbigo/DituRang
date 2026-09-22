import React from 'react';
import { motion } from 'motion/react';
import { X, Check, Calendar, Lock, MapPin, Sparkles, AlertCircle, ChevronRight } from 'lucide-react';
import { addDoc, collection, serverTimestamp, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { addWeeks, format, addDays, isBefore, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { db } from '../lib/firebase';
import { Tutor, Reservation, DAYS } from '../types';
import { cn } from '../lib/utils';
import { 
  isPeriodInPast, 
  isTutorScheduled, 
  isSlotBooked, 
  isSlotAvailable, 
  findEarliestAvailableSlot,
  PERIOD_START_TIMES
} from '../lib/slotUtils';

export const TUTOR_REQUEST_TOPICS = [
  'AI가 만들어준 이미지에 글자 수정',
  '포스터에 QR 코드 넣기',
  '학생들 얼굴 블러 처리',
  '구글 시트 · 설문지 만들기',
  '한글 문서에 넣을 내 서명 이미지 만들기',
  '그 외 다양한 디지털 도구 활용'
] as const;

interface ReservationModalProps {
  tutor: Tutor;
  slot: { date: string; period: number };
  onClose: () => void;
  onSuccess: () => void;
  reservations: Reservation[];
  editReservation?: Reservation;
  closedMonths?: string[];
  defaultCategory?: string;
}

export default function ReservationModal({ 
  tutor, 
  slot, 
  onClose, 
  onSuccess, 
  reservations, 
  editReservation, 
  closedMonths, 
  defaultCategory 
}: ReservationModalProps) {
  // Tutor identity check: 권나현 선생님만 '찾아가는 디지털 튜터' 지원 가능
  const isYoonTutor = tutor.name?.includes('윤채하') || tutor.id === 'tutor2';
  const isKwonTutor = Boolean((tutor.name?.includes('권나현') || tutor.id === 'tutor1') && !isYoonTutor);

  // Initial category calculation
  const initialCategory = React.useMemo(() => {
    if (editReservation?.category) {
      if (editReservation.category === "'찾아가는 디지털 튜터' 신청" && isYoonTutor) {
        return '수업 직접 보조';
      }
      return editReservation.category;
    }
    if (defaultCategory === "'찾아가는 디지털 튜터' 신청") {
      return isKwonTutor ? "'찾아가는 디지털 튜터' 신청" : '수업 직접 보조';
    }
    return defaultCategory || '수업 직접 보조';
  }, [editReservation, defaultCategory, isKwonTutor, isYoonTutor]);

  // Find smartest initial slot: if slot passed is already in past or booked, find earliest available slot
  const initialSlot = React.useMemo(() => {
    if (editReservation) {
      return { date: editReservation.date, period: editReservation.period };
    }
    // If the provided slot is valid, scheduled, in future, and not booked, use it!
    if (
      slot.date && 
      slot.period > 0 && 
      isSlotAvailable(slot.date, slot.period, tutor, reservations, closedMonths)
    ) {
      return slot;
    }
    // Otherwise, automatically locate the earliest available slot!
    const earliest = findEarliestAvailableSlot(tutor, reservations, closedMonths);
    if (earliest) {
      return earliest;
    }
    return { date: slot.date || format(new Date(), 'yyyy-MM-dd'), period: slot.period || 1 };
  }, [editReservation, slot, tutor, reservations, closedMonths]);

  // Date selection state: allow changing date directly in modal
  const [selectedDate, setSelectedDate] = React.useState<string>(initialSlot.date);

  const [teacherName, setTeacherName] = React.useState(editReservation?.teacherName || '');
  const [category, setCategory] = React.useState<string>(initialCategory);
  const [classInfo, setClassInfo] = React.useState(editReservation?.classInfo || '');
  const [subjectInfo, setSubjectInfo] = React.useState(editReservation?.subjectInfo || '');
  const [locationInfo, setLocationInfo] = React.useState(editReservation?.locationInfo || '');
  const [otherDetail, setOtherDetail] = React.useState(editReservation?.otherDetail || '');

  // Topics for '찾아가는 디지털 튜터'
  const [selectedTopic, setSelectedTopic] = React.useState<string>(() => {
    if (editReservation?.category === "'찾아가는 디지털 튜터' 신청" && editReservation.otherDetail) {
      const match = TUTOR_REQUEST_TOPICS.find(t => editReservation.otherDetail?.includes(t));
      if (match) return match;
      return '그 외 다양한 디지털 도구 활용';
    }
    return TUTOR_REQUEST_TOPICS[0];
  });
  const [customTopicDetail, setCustomTopicDetail] = React.useState<string>(() => {
    if (editReservation?.category === "'찾아가는 디지털 튜터' 신청" && editReservation.otherDetail) {
      const detail = editReservation.otherDetail;
      if (detail.startsWith('그 외: ')) {
        return detail.replace('그 외: ', '').split(' [장소:')[0].trim();
      }
    }
    return '';
  });
  const [visitLocation, setVisitLocation] = React.useState<string>(() => {
    if (editReservation?.locationInfo) return editReservation.locationInfo;
    if (editReservation?.otherDetail && editReservation.otherDetail.includes('[장소:')) {
      const match = editReservation.otherDetail.match(/\[장소:\s*([^\]]+)\]/);
      if (match) return match[1];
    }
    return '';
  });

  const [selectedPeriods, setSelectedPeriods] = React.useState<number[]>(
    editReservation ? [editReservation.period] : (initialSlot.period > 0 ? [initialSlot.period] : [1])
  );
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [weeksToRepeat, setWeeksToRepeat] = React.useState(1);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Month closing check
  const isClosed = React.useMemo(() => {
    if (!selectedDate) return false;
    const monthStr = selectedDate.substring(0, 7); // "YYYY-MM"
    return closedMonths?.includes(monthStr) ?? false;
  }, [selectedDate, closedMonths]);

  // Categories list: 윤채하 선생님에게는 '찾아가는 디지털 튜터'가 절대 나타나지 않음
  const categories = React.useMemo(() => {
    const list = [
      '수업 직접 보조',
      '기기 활용법 안내',
      '프로그램 활용법 안내',
      '각종 디지털 관련 업무 지원',
    ];
    if (isKwonTutor) {
      list.push("'찾아가는 디지털 튜터' 신청");
    }
    return list;
  }, [isKwonTutor]);

  // Ensure category is valid if tutor changed
  React.useEffect(() => {
    if (isYoonTutor && category === "'찾아가는 디지털 튜터' 신청") {
      setCategory('수업 직접 보조');
    }
  }, [isYoonTutor, category]);

  // When selectedDate changes, adjust periods to only valid available (not past, not booked) periods
  React.useEffect(() => {
    if (editReservation) return;
    const availablePeriods = [1, 2, 3, 4, 5, 6, 7].filter(p => 
      isSlotAvailable(selectedDate, p, tutor, reservations, closedMonths, new Date())
    );
    if (availablePeriods.length > 0) {
      const validSelected = selectedPeriods.filter(p => availablePeriods.includes(p));
      if (validSelected.length === 0) {
        setSelectedPeriods([availablePeriods[0]]);
      }
    } else {
      setSelectedPeriods([]);
    }
  }, [selectedDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName) {
      alert("신청 교사명을 입력해주세요.");
      return;
    }

    let finalReason = category;
    let finalOtherDetail: string | null = null;
    let finalLocation = locationInfo;

    if (category === '수업 직접 보조') {
      const baseReason = `수업보조: ${classInfo} ${subjectInfo} ${locationInfo ? `(${locationInfo})` : ''}`.trim();
      finalReason = otherDetail ? `${baseReason} - ${otherDetail}` : baseReason;
      finalOtherDetail = otherDetail || null;
    } else if (category === '각종 디지털 관련 업무 지원') {
      finalReason = otherDetail || category;
      finalOtherDetail = otherDetail || null;
    } else if (category === "'찾아가는 디지털 튜터' 신청") {
      let topicSummary = selectedTopic;
      if (selectedTopic === '그 외 다양한 디지털 도구 활용') {
        if (!customTopicDetail.trim()) {
          alert("그 외 지원 내용을 자세히 입력해주세요.");
          return;
        }
        topicSummary = `그 외: ${customTopicDetail.trim()}`;
      }
      
      const locText = visitLocation.trim() ? ` [장소: ${visitLocation.trim()}]` : '';
      finalReason = `'찾아가는 디지털 튜터' (${topicSummary})${locText}`;
      finalOtherDetail = `${topicSummary}${locText}`;
      finalLocation = visitLocation.trim() || null;
    }

    setIsSubmitting(true);
    try {
      if (editReservation) {
        // Update single reservation
        await setDoc(doc(db, 'reservations', editReservation.id), {
          ...editReservation,
          date: selectedDate,
          teacherName,
          reason: finalReason,
          category,
          classInfo: category === '수업 직접 보조' ? classInfo : null,
          subjectInfo: category === '수업 직접 보조' ? subjectInfo : null,
          locationInfo: category === '수업 직접 보조' ? locationInfo : finalLocation,
          otherDetail: finalOtherDetail,
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
        const currentDate = format(addWeeks(new Date(selectedDate), w), 'yyyy-MM-dd');
        for (const p of selectedPeriods) {
          if (!isTutorScheduled(tutor, currentDate, p)) continue;
          if (isPeriodInPast(currentDate, p)) {
            alert(`${currentDate} ${p}교시는 이미 시간이 종료되어 예약할 수 없습니다.`);
            setIsSubmitting(false);
            return;
          }
          if (isSlotBooked(reservations, tutor.id, currentDate, p, editReservation?.id)) {
            alert(`${currentDate} ${p}교시는 이미 예약이 완료되었습니다. 다른 시간을 선택해주세요.`);
            setIsSubmitting(false);
            return;
          }
          proposedSlots.push({ date: currentDate, period: p });
        }
      }

      if (proposedSlots.length === 0) {
        alert("선택하신 날짜/시간대에 튜터님의 근무 시간이 없습니다. 다른 날짜나 교시를 선택해주세요.");
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
          locationInfo: category === '수업 직접 보조' ? locationInfo : finalLocation,
          otherDetail: finalOtherDetail,
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
      if (!isTutorScheduled(tutor, selectedDate, p)) {
        alert(`${DAYS[(new Date(selectedDate).getDay() + 6) % 7]}요일 ${p}교시는 튜터님의 근무 일정이 아닙니다.`);
        return;
      }
      if (isPeriodInPast(selectedDate, p)) {
        alert(`선택하신 ${p}교시는 이미 시간이 종료되어 신청할 수 없습니다.`);
        return;
      }
      if (isSlotBooked(reservations, tutor.id, selectedDate, p, editReservation?.id)) {
        alert(`선택하신 ${p}교시는 이미 다른 예약이 완료되었습니다.`);
        return;
      }
      setSelectedPeriods(prev => [...prev, p].sort((a,b) => a-b));
    }
  };

  const scheduledPeriodsForSelectedDate = [1, 2, 3, 4, 5, 6, 7].filter(p => isTutorScheduled(tutor, selectedDate, p));
  const availablePeriodsForSelectedDate = [1, 2, 3, 4, 5, 6, 7].filter(p => 
    isSlotAvailable(selectedDate, p, tutor, reservations, closedMonths, new Date(), editReservation?.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-900/10 backdrop-blur-sm overflow-hidden print:hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-lg rounded-[1.75rem] sm:rounded-[2rem] shadow-2xl overflow-hidden border border-[#F3E5F5] flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <header className="px-6 py-4 sm:px-8 sm:py-5 bg-[#FBF9FE] border-b border-[#F3E5F5] flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h2 className="text-lg sm:text-xl font-black text-[#5E35B1] tracking-tight flex items-center gap-1.5">
              {category === "'찾아가는 디지털 튜터' 신청" && (
                <Sparkles size={18} className="text-pink-500" />
              )}
              {editReservation ? '예약 수정하기' : '디지털 튜터 지원 예약'}
            </h2>
            <p className="text-[11px] font-bold text-[#7E57C2] mt-0.5 flex items-center gap-1">
              <span>{tutor.name} 선생님</span>
              <span className="text-[#D1C4E9]">|</span>
              <span>{format(new Date(selectedDate), 'yyyy.MM.dd(EEE)', { locale: ko })}</span>
              {selectedPeriods.length > 0 && (
                <span className="bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded text-[10px]">
                  {selectedPeriods.join(', ')}교시
                </span>
              )}
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 hover:bg-purple-100/50 rounded-full transition-colors text-gray-400 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 sm:p-8 flex flex-col gap-4 overflow-y-auto">
          {isClosed && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <Lock size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="text-xs font-black text-amber-800">해당 월은 마감되었습니다</span>
                <span className="text-[11px] text-amber-700/90 leading-tight mt-0.5">급여 마감이 완료되어 신규 예약 및 수정이 불가합니다.</span>
              </div>
            </div>
          )}

          {/* Date Selector Section */}
          <div className="flex flex-col gap-2 p-3.5 bg-[#FAF7FD] rounded-2xl border border-purple-100">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-black text-[#5E35B1] uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={14} className="text-[#7E57C2]" />
                예약 날짜 선택
              </label>
              <span className="text-xs font-bold text-[#5E35B1] bg-white px-2.5 py-0.5 rounded-md border border-purple-200 shadow-xs">
                {format(new Date(selectedDate), 'yyyy년 MM월 dd일 (EEE)', { locale: ko })}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input 
                type="date"
                value={selectedDate}
                min={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(e.target.value);
                  }
                }}
                disabled={isClosed}
                className="flex-1 px-3 py-2 bg-white rounded-xl border border-purple-200 text-sm font-bold text-[#4A148C] focus:ring-2 focus:ring-purple-200 outline-none cursor-pointer"
              />
            </div>

            {scheduledPeriodsForSelectedDate.length === 0 ? (
              <p className="text-[11px] font-bold text-amber-600 flex items-center gap-1 mt-1">
                <AlertCircle size={13} />
                선택하신 날짜는 튜터님의 근무 일정이 없습니다. 다른 날짜를 선택해주세요.
              </p>
            ) : availablePeriodsForSelectedDate.length === 0 ? (
              <div className="flex flex-col gap-1 mt-1 p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                <div className="flex items-center gap-1.5 text-[11px] font-bold">
                  <AlertCircle size={14} className="text-amber-600 shrink-0" />
                  <span>이 날짜는 예약 가능한 교시가 없습니다 (시간 종료 또는 예약 마감).</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const earliest = findEarliestAvailableSlot(tutor, reservations, closedMonths);
                    if (earliest) {
                      setSelectedDate(earliest.date);
                      setSelectedPeriods([earliest.period]);
                    }
                  }}
                  className="self-start text-[11px] font-black text-purple-700 hover:text-purple-900 underline cursor-pointer mt-0.5"
                >
                  👉 가장 빠른 예약 가능일로 바로 변경하기
                </button>
              </div>
            ) : null}
          </div>

          {/* Teacher Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-black text-[#7B1FA2] uppercase tracking-wider ml-1">신청 교사명</label>
            <input 
              required
              value={teacherName}
              onChange={e => setTeacherName(e.target.value)}
              placeholder="예: 홍길동"
              disabled={isClosed}
              className="w-full px-4 py-2.5 bg-[#FCFBFF] rounded-xl border border-[#F3E5F5] focus:ring-3 focus:ring-[#F3E5F5] outline-none transition-all text-[#4A148C] font-bold placeholder-[#D1C4E9] disabled:bg-gray-100 disabled:text-gray-500 text-sm"
            />
          </div>

          {/* Support Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-black text-[#7B1FA2] uppercase tracking-wider ml-1">지원 사유</label>
            <select 
              value={category}
              onChange={e => setCategory(e.target.value)}
              disabled={isClosed}
              className="w-full px-4 py-2.5 bg-[#FCFBFF] rounded-xl border border-[#F3E5F5] focus:ring-3 focus:ring-[#F3E5F5] outline-none transition-all text-[#4A148C] font-bold disabled:bg-gray-100 disabled:text-gray-500 text-sm"
            >
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {/* Special UI: 찾아가는 디지털 튜터 신청 - Dedicated Checklist Topics Selection */}
          {category === "'찾아가는 디지털 튜터' 신청" && (
            <div className="flex flex-col gap-3 p-4 bg-pink-50/40 rounded-2xl border border-pink-200 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-pink-700 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-pink-600" />
                  도움이 필요한 내용을 선택해주세요
                </label>
                <span className="text-[10px] text-pink-600 font-bold bg-pink-100 px-2 py-0.5 rounded-full">
                  1:1 맞춤 지원
                </span>
              </div>

              {/* Topic Selectable List */}
              <div className="flex flex-col gap-1.5">
                {TUTOR_REQUEST_TOPICS.map((topic) => {
                  const isSelected = selectedTopic === topic;
                  return (
                    <div
                      key={topic}
                      onClick={() => !isClosed && setSelectedTopic(topic)}
                      className={cn(
                        "flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer text-left",
                        isSelected 
                          ? "bg-white border-pink-400 shadow-sm ring-1 ring-pink-300" 
                          : "bg-white/60 border-pink-100 hover:bg-white hover:border-pink-200"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors",
                        isSelected 
                          ? "border-pink-600 bg-pink-600 text-white" 
                          : "border-gray-300 bg-white"
                      )}>
                        {isSelected && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className={cn(
                        "text-xs font-bold transition-colors",
                        isSelected ? "text-pink-900" : "text-gray-700"
                      )}>
                        {topic}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* If "그 외 다양한 디지털 도구 활용" is chosen, show required detailed input */}
              {selectedTopic === '그 외 다양한 디지털 도구 활용' && (
                <div className="flex flex-col gap-1 pt-1 animate-in fade-in">
                  <label className="text-xs font-black text-pink-800 ml-1">
                    자세한 요청 내용 <span className="text-red-500">*</span>
                  </label>
                  <textarea 
                    required
                    value={customTopicDetail}
                    onChange={e => setCustomTopicDetail(e.target.value)}
                    placeholder="필요하신 지원 내용을 구체적으로 입력해주세요. (예: 캔바 디자인 템플릿 수정, 패들렛 링크 생성 등)"
                    disabled={isClosed}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-pink-300 focus:ring-2 focus:ring-pink-200 outline-none text-xs font-bold text-gray-800 min-h-[70px] resize-none"
                  />
                </div>
              )}

              {/* Visit Location Field */}
              <div className="flex flex-col gap-1 pt-1 border-t border-pink-200/60">
                <label className="text-xs font-bold text-pink-800 flex items-center gap-1 ml-1">
                  <MapPin size={13} className="text-pink-600" />
                  방문 희망 장소 (선택)
                </label>
                <input 
                  value={visitLocation}
                  onChange={e => setVisitLocation(e.target.value)}
                  placeholder="예: 본관 2층 1교무실 본인 자리, 컴퓨터 3실 등"
                  disabled={isClosed}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-pink-200 focus:ring-2 focus:ring-pink-200 outline-none text-xs font-bold text-gray-800 placeholder-gray-400"
                />
              </div>
            </div>
          )}

          {/* Standard Categories UI */}
          {category === '수업 직접 보조' && (
            <div className="flex flex-col gap-3 p-4 bg-purple-50/20 rounded-2xl border border-purple-100/30 animate-in fade-in slide-in-from-top-1">
               <div className="grid grid-cols-2 gap-3">
                 <div className="flex flex-col gap-1">
                   <label className="text-xs font-black text-[#5E35B1] ml-1">반 (예: 1-1)</label>
                   <input 
                     required
                     value={classInfo}
                     onChange={e => setClassInfo(e.target.value)}
                     disabled={isClosed}
                     className="px-3 py-2 bg-white rounded-lg border border-purple-200 text-xs font-bold text-[#4A148C] outline-none focus:border-purple-400 disabled:bg-gray-100"
                   />
                 </div>
                 <div className="flex flex-col gap-1">
                   <label className="text-xs font-black text-[#5E35B1] ml-1">교과 (예: 사무 행정)</label>
                   <input 
                     required
                     value={subjectInfo}
                     onChange={e => setSubjectInfo(e.target.value)}
                     disabled={isClosed}
                     className="px-3 py-2 bg-white rounded-lg border border-purple-200 text-xs font-bold text-[#4A148C] outline-none focus:border-purple-400 disabled:bg-gray-100"
                   />
                 </div>
               </div>
               <div className="flex flex-col gap-1">
                 <label className="text-xs font-black text-[#5E35B1] ml-1">장소 (교실 외 장소인 경우만)</label>
                 <input 
                   value={locationInfo}
                   onChange={e => setLocationInfo(e.target.value)}
                   placeholder="예: 멀티미디어실"
                   disabled={isClosed}
                   className="px-3 py-2 bg-white rounded-lg border border-purple-200 text-xs font-bold text-[#4A148C] outline-none focus:border-purple-400 disabled:bg-gray-100"
                 />
               </div>
               <div className="flex flex-col gap-1">
                 <label className="text-xs font-black text-[#5E35B1] ml-1">구체적인 지원 내용 (선택)</label>
                 <textarea 
                   value={otherDetail}
                   onChange={e => setOtherDetail(e.target.value)}
                   placeholder="구체적인 요청 사항이 있다면 입력해주세요."
                   disabled={isClosed}
                   className="px-3 py-2 bg-white rounded-lg border border-purple-200 text-xs font-bold text-[#4A148C] outline-none min-h-[60px] resize-none focus:border-purple-400 disabled:bg-gray-100"
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
                disabled={isClosed}
                className="w-full px-4 py-2.5 bg-[#FCFBFF] rounded-xl border border-[#F3E5F5] focus:ring-3 focus:ring-[#F3E5F5] outline-none transition-all text-[#4A148C] font-bold text-xs placeholder-[#D1C4E9] min-h-[80px] resize-none disabled:bg-gray-100"
              />
            </div>
          )}

          {/* Period Selection */}
          {!editReservation && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[12px] font-black text-[#7B1FA2] uppercase tracking-wider">
                  교시 선택 (연속 가능)
                </label>
                <span className="text-[11px] text-gray-500 font-medium">
                  현재 예약 가능한 교시만 활성화됩니다
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map(p => {
                  const scheduled = isTutorScheduled(tutor, selectedDate, p);
                  const inPast = isPeriodInPast(selectedDate, p);
                  const booked = isSlotBooked(reservations, tutor.id, selectedDate, p, editReservation?.id);
                  const available = scheduled && !inPast && !booked && !isClosed;
                  const isSelected = selectedPeriods.includes(p);

                  let statusText = '';
                  if (!scheduled) statusText = '휴무';
                  else if (inPast) statusText = '종료';
                  else if (booked) statusText = '마감';

                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!available}
                      onClick={() => togglePeriod(p)}
                      title={
                        !scheduled ? '근무 일정 없음' :
                        inPast ? '시간 경과 (예약 불가)' :
                        booked ? '이미 다른 예약이 완료된 교시입니다' :
                        `${p}교시 (${PERIOD_START_TIMES[p]}) 선택`
                      }
                      className={cn(
                        "h-8 sm:h-9 rounded-lg text-xs font-bold border transition-all flex flex-col items-center justify-center cursor-pointer select-none px-0.5",
                        isSelected 
                          ? "bg-purple-600 border-purple-700 text-white shadow-xs font-black" 
                          : available 
                            ? "bg-white border-purple-200 text-purple-800 hover:bg-purple-50 hover:border-purple-300" 
                            : booked
                              ? "bg-rose-50 border-rose-100 text-rose-300 cursor-not-allowed"
                              : "bg-gray-100 border-transparent text-gray-300 cursor-not-allowed"
                      )}
                    >
                      <span className="leading-none text-[11px] sm:text-xs">
                        {p}교시
                      </span>
                      {statusText && !isSelected && (
                        <span className={cn(
                          "text-[9px] font-bold tracking-tighter leading-none mt-0.5",
                          booked ? "text-rose-400" : "text-gray-400"
                        )}>
                          {statusText}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Weekly recurring option */}
          {!editReservation && !isClosed && (
            <div className="flex flex-col gap-2.5 p-3.5 bg-blue-50/30 rounded-2xl border border-blue-100/50">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-blue-800">매주 반복 예약</span>
                  <span className="text-[10px] font-medium text-blue-500">선택한 요일과 교시를 다음 주에도 연속으로 예약합니다.</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsRecurring(!isRecurring)}
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors relative cursor-pointer",
                    isRecurring ? "bg-blue-600" : "bg-gray-300"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white transition-transform absolute top-1",
                    isRecurring ? "right-1" : "left-1"
                  )} />
                </button>
              </div>

              {isRecurring && (
                <div className="flex items-center justify-between pt-2 border-t border-blue-100 animate-in fade-in">
                  <span className="text-xs font-bold text-blue-700">반복할 주차 수</span>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setWeeksToRepeat(w)}
                        className={cn(
                          "w-7 h-7 rounded-lg text-xs font-black transition-all cursor-pointer",
                          weeksToRepeat === w 
                            ? "bg-blue-600 text-white shadow-xs" 
                            : "bg-white text-blue-700 border border-blue-200 hover:bg-blue-50"
                        )}
                      >
                        +{w}주
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors cursor-pointer text-sm"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isClosed || selectedPeriods.length === 0}
              className="flex-2 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg shadow-purple-200 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isSubmitting ? '처리 중...' : editReservation ? '수정 완료' : '예약 신청하기'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
