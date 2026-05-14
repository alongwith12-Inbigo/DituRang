import React from 'react';
import { motion } from 'motion/react';
import { X, Save, Lock, UserPlus, Trash2, CheckCircle2, Settings, Check, Info, Calendar, ChevronRight, History, Plus, Users } from 'lucide-react';
import { setDoc, doc, updateDoc, collection, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { startOfWeek, startOfToday, addWeeks, addDays, format } from 'date-fns';
import { db, auth } from '../lib/firebase';
import { Tutor, DAYS, SchoolEvent } from '../types';
import { cn } from '../lib/utils';

interface AdminPanelProps {
  tutors: Tutor[];
  schoolEvents: SchoolEvent[];
  onClose: () => void;
}

export default function AdminPanel({ tutors, schoolEvents, onClose }: AdminPanelProps) {
  const [password, setPassword] = React.useState('');
  const [isAuthorized, setIsAuthorized] = React.useState(false);
  const [editTutors, setEditTutors] = React.useState<Tutor[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'tutor' | 'calendar'>('tutor');

  // Academic Calendar State
  const [newEventDate, setNewEventDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [newEventTitle, setNewEventTitle] = React.useState('');
  
  // Week management
  const [selectedWeekOffset, setSelectedWeekOffset] = React.useState(0);
  const [editMode, setEditMode] = React.useState<'default' | 'week'>('default');

  const currentWeeks = Array.from({ length: 8 }).map((_, i) => {
    const start = startOfWeek(addWeeks(startOfToday(), i), { weekStartsOn: 1 });
    return format(start, 'yyyy-MM-dd');
  });

  const targetWeekStart = currentWeeks[selectedWeekOffset];

  // Initialize with exactly 2 tutors, merging existing data if available
  React.useEffect(() => {
    const base = [
      { id: 'tutor1', name: '튜터 1', isActive: true, workSchedule: { 0: [1,2,3,4,5,6,7], 1: [1,2,3,4,5,6,7], 2: [1,2,3,4,5,6,7], 3: [1,2,3,4,5,6,7], 4: [1,2,3,4,5,6,7] }, weekOverrides: {} } as Tutor,
      { id: 'tutor2', name: '튜터 2', isActive: false, workSchedule: { 0: [1,2,3,4,5,6,7], 1: [1,2,3,4,5,6,7], 2: [1,2,3,4,5,6,7], 3: [1,2,3,4,5,6,7], 4: [1,2,3,4,5,6,7] }, weekOverrides: {} } as Tutor
    ];

    if (tutors.length > 0) {
      const merged = base.map(b => {
        const found = tutors.find(t => t.id === b.id);
        return found ? found : b;
      });
      setEditTutors(merged);
    } else {
      setEditTutors(base);
    }
  }, [tutors]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '1004') {
      setIsAuthorized(true);
    } else {
      alert("비밀번호가 올바르지 않습니다.");
    }
  };

  const handleUpdateName = (id: string, name: string) => {
    setEditTutors(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  };

  const handleAddEvent = async () => {
    if (!newEventTitle.trim()) return;
    try {
      await addDoc(collection(db, 'school_events'), {
        date: newEventDate,
        title: newEventTitle,
        createdAt: serverTimestamp()
      });
      setNewEventTitle('');
    } catch (err: any) {
      console.error(err);
      const errInfo = {
        error: err.message || String(err),
        operationType: 'create',
        path: 'school_events',
        authInfo: {
          userId: auth.currentUser?.uid,
          email: auth.currentUser?.email,
          emailVerified: auth.currentUser?.emailVerified
        }
      };
      console.error('Firestore Error:', JSON.stringify(errInfo));
      alert(`일정 추가 중 오류가 발생했습니다: ${err.message}`);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("정말 이 일정을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, 'school_events', id));
    } catch (err: any) {
      console.error(err);
      const errInfo = {
        error: err.message || String(err),
        operationType: 'delete',
        path: `school_events/${id}`,
        authInfo: {
          userId: auth.currentUser?.uid,
          email: auth.currentUser?.email,
          emailVerified: auth.currentUser?.emailVerified
        }
      };
      console.error('Firestore Error:', JSON.stringify(errInfo));
      alert("일정 삭제 중 오류가 발생했습니다.");
    }
  };

  const toggleDayPeriod = (tutorId: string, dayIdx: number, period: number) => {
    setEditTutors(prev => prev.map(t => {
      if (t.id === tutorId) {
        if (editMode === 'default') {
          const schedule = { ...t.workSchedule };
          const dayPeriods = [...(schedule[dayIdx] || [])];
          if (dayPeriods.includes(period)) {
            schedule[dayIdx] = dayPeriods.filter(p => p !== period);
          } else {
            schedule[dayIdx] = [...dayPeriods, period].sort((a,b) => a-b);
          }
          return { ...t, workSchedule: schedule };
        } else {
          const overrides = { ...(t.weekOverrides || {}) };
          const currentWeekSchedule = { ...(overrides[targetWeekStart] || t.workSchedule) };
          const dayPeriods = [...(currentWeekSchedule[dayIdx] || [])];
          
          if (dayPeriods.includes(period)) {
            currentWeekSchedule[dayIdx] = dayPeriods.filter(p => p !== period);
          } else {
            currentWeekSchedule[dayIdx] = [...dayPeriods, period].sort((a,b) => a-b);
          }
          
          overrides[targetWeekStart] = currentWeekSchedule;
          return { ...t, weekOverrides: overrides };
        }
      }
      return t;
    }));
  };

  const resetWeekOverride = (tutorId: string) => {
    setEditTutors(prev => prev.map(t => {
      if (t.id === tutorId) {
        const overrides = { ...(t.weekOverrides || {}) };
        delete overrides[targetWeekStart];
        return { ...t, weekOverrides: overrides };
      }
      return t;
    }));
  };

  const [applyingWeeks, setApplyingWeeks] = React.useState<string[]>([]);
  const [showWeekSelector, setShowWeekSelector] = React.useState<string | null>(null);

  const applyToSelectedWeeks = (tutorId: string) => {
    if (applyingWeeks.length === 0) {
      alert("적용할 주차를 선택해주세요.");
      return;
    }
    
    setEditTutors(prev => prev.map(t => {
      if (t.id === tutorId) {
        const sourceSchedule = (editMode === 'week' && t.weekOverrides?.[targetWeekStart]) 
          ? t.weekOverrides[targetWeekStart] 
          : t.workSchedule;
        
        const newOverrides = { ...(t.weekOverrides || {}) };
        applyingWeeks.forEach(week => {
          newOverrides[week] = JSON.parse(JSON.stringify(sourceSchedule));
        });
        
        // Also update default if current is default
        let newWorkSchedule = t.workSchedule;
        if (editMode === 'default') {
          newWorkSchedule = JSON.parse(JSON.stringify(sourceSchedule));
        }

        return { ...t, weekOverrides: newOverrides, workSchedule: newWorkSchedule };
      }
      return t;
    }));
    setShowWeekSelector(null);
    setApplyingWeeks([]);
    alert("선택한 주차에 시간표가 복사되었습니다. '최종 설정 저장'을 눌러야 반영됩니다.");
  };

  const toggleWeekInApply = (week: string) => {
    setApplyingWeeks(prev => prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week]);
  };

  const toggleActive = (id: string, active: boolean) => {
    setEditTutors(prev => prev.map(t => t.id === id ? { ...t, isActive: active } : t));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const promises = editTutors.map(t => {
        return setDoc(doc(db, 'tutors', t.id), {
          name: t.name,
          isActive: t.isActive,
          workSchedule: t.workSchedule,
          weekOverrides: t.weekOverrides || {}
        }, { merge: true });
      });

      await Promise.all(promises);
      
      alert("설정이 저장되었습니다.");
      onClose();
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#F1F8E9]/80 backdrop-blur-md print:hidden">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-10 rounded-[3rem] shadow-2xl border border-[#EEEEEE] w-full max-w-sm text-center flex flex-col gap-8"
        >
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500">
            <Lock size={32} />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-black text-[#455A64]">관리자 인증</h2>
            <p className="text-xs font-bold text-[#B0BEC5] tracking-widest uppercase">System Configuration</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input 
              type="password"
              placeholder="비밀번호 입력"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              className="w-full px-6 py-4 bg-[#FAFAFA] rounded-2xl border border-[#EEEEEE] text-center text-2xl font-mono tracking-widest focus:ring-4 focus:ring-amber-100 outline-none transition-all placeholder-[#CFD8DC]"
            />
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 py-4 text-[#BDBDBD] font-bold text-sm hover:text-[#9E9E9E]"
              >
                취소
              </button>
              <button 
                type="submit"
                className="flex-[2] py-4 bg-[#455A64] text-white font-bold rounded-2xl shadow-lg shadow-blue-100 hover:bg-[#37474F] transition-all"
              >
                접속하기
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm overflow-y-auto pt-10 pb-10 print:hidden">
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-5xl rounded-[3rem] shadow-2xl overflow-hidden border border-[#EEEEEE] flex flex-col h-full max-h-[95vh]"
      >
        <header className="px-10 py-6 bg-[#F9F9F9] border-b border-[#EEEEEE] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-2xl shadow-sm border border-[#EEEEEE] text-[#455A64]">
              <Settings size={22} />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl font-black text-[#455A64]">
                {activeTab === 'tutor' ? '시간표 마스터 관리' : '학사일정 관리'}
              </h2>
              <p className="text-[10px] font-bold text-[#B0BEC5] tracking-widest uppercase mt-0.5">
                {activeTab === 'tutor' ? 'Tutor Assets & Period Overrides' : 'School Academic Calendar'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-white p-1.5 rounded-2xl border border-[#EEEEEE] shadow-sm">
            <div className="flex">
              <button 
                onClick={() => setActiveTab('tutor')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'tutor' ? "bg-[#455A64] text-white shadow-sm" : "text-[#90A4AE] hover:bg-[#F5F5F5]"
                )}
              >
                <Users size={14} /> 튜터 및 시간표
              </button>
              <button 
                onClick={() => setActiveTab('calendar')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'calendar' ? "bg-[#FBC02D] text-white shadow-sm" : "text-[#90A4AE] hover:bg-[#F5F5F5]"
                )}
              >
                <Calendar size={14} /> 학사일정 관리
              </button>
            </div>
          </div>

          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-[#B0BEC5]">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-10">
          {activeTab === 'tutor' ? (
            <div className="space-y-10">
              <div className="flex items-center gap-4 bg-white p-1.5 rounded-2xl border border-[#EEEEEE] shadow-sm self-start mb-6 w-fit">
                <div className="flex">
                  <button 
                    onClick={() => setEditMode('default')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      editMode === 'default' ? "bg-[#455A64] text-white" : "text-[#90A4AE] hover:bg-[#F5F5F5]"
                    )}
                  >
                    기본 주간 (Default)
                  </button>
                  <button 
                    onClick={() => setEditMode('week')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      editMode === 'week' ? "bg-[#455A64] text-white" : "text-[#90A4AE] hover:bg-[#F5F5F5]"
                    )}
                  >
                    특정 주차 (Override)
                  </button>
                </div>

                {editMode === 'week' && (
                  <div className="flex items-center gap-2 border-l pl-4 border-[#EEEEEE]">
                    <select 
                      value={selectedWeekOffset}
                      onChange={e => setSelectedWeekOffset(Number(e.target.value))}
                      className="bg-transparent text-xs font-bold text-[#455A64] outline-none cursor-pointer"
                    >
                      {currentWeeks.map((week, idx) => {
                        const start = parseISO(week);
                        return <option key={idx} value={idx}>{format(start, 'M월 ')}{Math.ceil(format(start, 'd') as any / 7)}째주</option>
                      })}
                    </select>
                  </div>
                )}
              </div>

              {editMode === 'week' && (
                <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex items-start gap-4">
                  <Calendar size={24} className="text-blue-500 shrink-0 mt-1" />
                  <div className="flex flex-col gap-1">
                    <h4 className="text-sm font-black text-blue-700">특정 주차 개별 설정 모드</h4>
                    <p className="text-xs text-blue-600/80 leading-relaxed">
                      현재 <strong>{format(parseISO(targetWeekStart), 'yyyy년 MM월 dd일')}</strong>이 포함된 주차를 편집 중입니다. 
                      이 주차의 설정만 변경되며, 기본 주간 설정은 영향을 받지 않습니다.
                    </p>
                  </div>
                </div>
              )}

          {editTutors.map((tutor, tIdx) => {
            const currentSchedule = (editMode === 'week' && tutor.weekOverrides?.[targetWeekStart]) 
              ? tutor.weekOverrides[targetWeekStart] 
              : tutor.workSchedule;
            const isOverridden = editMode === 'week' && !!tutor.weekOverrides?.[targetWeekStart];

            return (
              <section key={tutor.id} className="p-8 bg-[#FBFCFD] rounded-[2.5rem] border border-[#F1F3F4] space-y-8 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6 flex-1">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-sm",
                      tutor.id === 'tutor1' ? "bg-[#FFF0F3] text-[#EC407A]" : "bg-[#F0F7FF] text-[#039BE5] shadow-sky-50"
                    )}>
                      {tIdx + 1}
                    </div>
                    <div className="flex flex-col gap-1 flex-1 max-w-xs">
                      <label className="text-[10px] font-bold text-[#B0BEC5] uppercase ml-1">튜터 성함</label>
                      <input 
                        value={tutor.name}
                        onChange={e => handleUpdateName(tutor.id, e.target.value)}
                        placeholder="성함을 입력하세요"
                        className="text-lg font-bold text-[#455A64] bg-white px-4 py-2 rounded-xl border border-[#EEEEEE] focus:ring-4 focus:ring-green-50 outline-none transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-2 relative">
                      <button 
                        onClick={() => setShowWeekSelector(tutor.id)}
                        className="px-4 py-2 bg-[#F0F7FF] hover:bg-[#E1EFFF] text-[#039BE5] rounded-xl text-[10px] font-black border border-[#B3E5FC] transition-all flex items-center gap-2"
                      >
                        <History size={14} /> 현재 시간표를 다른 주차에 적용...
                      </button>

                      {showWeekSelector === tutor.id && (
                        <div className="absolute left-0 top-full mt-2 z-20 bg-white p-6 rounded-3xl shadow-2xl border border-[#EEEEEE] w-72 flex flex-col gap-4">
                          <h5 className="text-[10px] font-black text-[#546E7A] uppercase tracking-widest">적용할 주차 선택</h5>
                          <div className="grid grid-cols-2 gap-2">
                            {currentWeeks.map((week, idx) => (
                              <button 
                                key={week}
                                onClick={() => toggleWeekInApply(week)}
                                className={cn(
                                  "px-3 py-2 rounded-xl text-[10px] font-bold border transition-all text-left",
                                  applyingWeeks.includes(week) 
                                    ? "bg-[#039BE5] border-[#039BE5] text-white" 
                                    : "bg-white border-[#EEEEEE] text-[#90A4AE] hover:border-sky-200"
                                )}
                              >
                                {idx === 0 ? '이번 주' : `${idx}주 뒤`} ({format(parseISO(week), 'M/d')})
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2 pt-2">
                            <button 
                              onClick={() => setShowWeekSelector(null)}
                              className="flex-1 py-3 text-[10px] font-bold text-gray-400 hover:text-gray-600"
                            >
                              취소
                            </button>
                            <button 
                              onClick={() => applyToSelectedWeeks(tutor.id)}
                              className="flex-2 py-3 bg-[#039BE5] text-white rounded-xl text-[10px] font-black shadow-lg shadow-sky-100"
                            >
                              선택 주차 적용
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    {editMode === 'week' && isOverridden && (
                      <button 
                        onClick={() => resetWeekOverride(tutor.id)}
                        className="flex items-center gap-2 text-[10px] font-bold text-red-400 hover:text-red-500 transition-colors"
                      >
                        <History size={14} /> 이 주차 설정 초기화
                      </button>
                    )}
                    <div className="flex items-center gap-3">
                      <label className="text-[11px] font-bold text-[#90A4AE] uppercase">시스템 사용</label>
                      <button 
                        onClick={() => toggleActive(tutor.id, !tutor.isActive)}
                        className={cn(
                          "w-12 h-7 rounded-full relative p-1 transition-all",
                          tutor.isActive ? (tutor.id === 'tutor1' ? "bg-[#EC407A]" : "bg-sky-400") : "bg-[#ECEFF1]"
                        )}
                      >
                        <motion.div 
                          animate={{ x: tutor.isActive ? 20 : 0 }}
                          className="w-5 h-5 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h4 className="text-[10px] font-bold text-[#B0BEC5] uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle2 size={14} /> 근무 시간(교시) 설정
                    </h4>
                    {isOverridden && <span className="text-[10px] font-bold text-blue-500 uppercase flex items-center gap-1"><Info size={12} /> 개별 설정 적용됨</span>}
                  </div>

                  <div className="grid grid-cols-6 gap-3">
                    <div className="bg-[#F5F7F8] p-2 rounded-2xl flex flex-col items-center justify-center gap-2 border border-[#F1F3F4]">
                      <span className="text-[9px] font-black text-[#B0BEC5]">PERIOD</span>
                    </div>
                    {["월", "화", "수", "목", "금"].map(day => (
                      <div key={day} className="bg-[#F5F7F8] p-2 rounded-2xl text-center border border-[#F1F3F4]">
                        <span className="text-xs font-black text-[#546E7A]">{day}</span>
                      </div>
                    ))}

                    {[1, 2, 3, 4, 5, 6, 7].map(period => (
                      <React.Fragment key={period}>
                        <div className="bg-white p-2 rounded-2xl border border-[#F1F3F4] text-center shadow-sm">
                          <span className="text-xs font-black text-[#B0BEC5]">{period}</span>
                        </div>
                        {[0, 1, 2, 3, 4].map(dayIdx => {
                          const isActive = currentSchedule[dayIdx]?.includes(period);
                          return (
                            <button
                              key={`${dayIdx}-${period}`}
                              onClick={() => toggleDayPeriod(tutor.id, dayIdx, period)}
                              className={cn(
                                "group aspect-square rounded-2xl border transition-all flex items-center justify-center",
                                isActive
                                  ? (tutor.id === 'tutor1' ? "bg-[#FFF0F3] border-[#FFD1DC] text-[#EC407A] shadow-sm" : "bg-[#F0F7FF] border-[#B3E5FC] text-[#039BE5] shadow-sm shadow-sky-50")
                                  : "bg-white border-[#F1F3F4] text-[#ECEFF1] hover:bg-[#F9F9F9]"
                              )}
                            >
                              <Check size={18} className={cn("transition-all", isActive ? "scale-100" : "scale-0 group-hover:scale-50 opacity-20")} />
                            </button>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </section>
            )})}
            </div>
          ) : (
            <div className="space-y-8 max-w-2xl mx-auto">
              <section className="p-8 bg-amber-50/30 rounded-[2.5rem] border border-amber-100/50 space-y-6">
                <div className="flex items-center gap-3">
                  <Plus size={20} className="text-amber-500" />
                  <h3 className="text-lg font-black text-[#5D4037]">새로운 일정 추가</h3>
                </div>
                
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex flex-col gap-1 w-full md:w-48">
                    <label className="text-[10px] font-bold text-[#A1887F] uppercase ml-1">날짜</label>
                    <input 
                      type="date"
                      value={newEventDate}
                      onChange={e => setNewEventDate(e.target.value)}
                      className="px-4 py-3 bg-white border border-amber-100 rounded-2xl font-bold text-[#5D4037] outline-none focus:ring-4 focus:ring-amber-100 transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[10px] font-bold text-[#A1887F] uppercase ml-1">일정 내용</label>
                    <input 
                      type="text"
                      placeholder="예: 기말고사, 개교기념일 등"
                      value={newEventTitle}
                      onChange={e => setNewEventTitle(e.target.value)}
                      className="px-4 py-3 bg-white border border-amber-100 rounded-2xl font-bold text-[#5D4037] outline-none focus:ring-4 focus:ring-amber-100 transition-all"
                    />
                  </div>
                  <button 
                    onClick={handleAddEvent}
                    className="md:mt-auto px-8 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black shadow-lg shadow-amber-100 transition-all flex items-center justify-center gap-2"
                  >
                    추가 <Plus size={18} />
                  </button>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-black text-[#B0BEC5] uppercase tracking-widest pl-4">등록된 학사일정</h3>
                <div className="flex flex-col gap-2">
                  {schoolEvents
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(event => (
                    <div key={event.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#EEEEEE] hover:border-amber-200 transition-all group">
                      <div className="flex items-center gap-6">
                        <span className="text-xs font-mono font-bold text-[#90A4AE] bg-[#F5F7F8] px-3 py-1 rounded-lg">
                          {event.date}
                        </span>
                        <span className="font-bold text-[#455A64]">{event.title}</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-2 text-[#CFD8DC] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {schoolEvents.length === 0 && (
                    <div className="py-20 text-center bg-[#F9F9F9] rounded-[2.5rem] border border-dashed border-[#EEEEEE]">
                      <Calendar size={48} className="mx-auto text-[#E0E0E0] mb-4" />
                      <p className="text-[#B0BEC5] font-bold italic">등록된 학사일정이 없습니다.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="px-10 py-6 bg-[#F9F9F9] border-b border-[#EEEEEE] flex items-center justify-between shrink-0">
          {activeTab === 'tutor' ? (
            <>
              <div className="flex items-center gap-2 text-[#90A4AE]">
                 <Info size={16} />
                 <p className="text-[10px] font-bold italic tracking-tight">수정된 사항은 '저장' 버튼을 눌러야 최종 반영됩니다.</p>
              </div>
              <button 
                disabled={isSaving}
                onClick={handleSave}
                className="px-12 py-4 bg-[#455A64] hover:bg-[#37474F] disabled:bg-[#CFD8DC] text-white rounded-2xl font-bold shadow-xl shadow-slate-100 transition-all flex items-center gap-3"
              >
                {isSaving ? "처리 중..." : <><Save size={18} /> 최종 설정 저장하기</>}
              </button>
            </>
          ) : (
             <div className="flex items-center gap-2 text-[#B0BEC5]">
               <Info size={16} />
               <p className="text-[10px] font-bold italic tracking-tight">학사일정은 추가/삭제 즉시 서버에 반영됩니다.</p>
             </div>
          )}
        </footer>
      </motion.div>
    </div>
  );
}

function parseISO(dateStr: string) {
  const parts = dateStr.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
