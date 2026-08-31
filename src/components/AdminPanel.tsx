import React from 'react';
import { motion } from 'motion/react';
import { X, Save, Lock, Unlock, UserPlus, Trash2, CheckCircle2, Settings, Check, Info, Calendar, ChevronRight, History, Plus, Users, Upload, Download, FileText, File, ShieldAlert, AlertCircle, Shield } from 'lucide-react';
import { setDoc, doc, updateDoc, collection, addDoc, deleteDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { startOfWeek, startOfToday, addWeeks, addDays, format, parseISO } from 'date-fns';
import { db, auth } from '../lib/firebase';
import { Tutor, DAYS, SchoolEvent } from '../types';
import { cn } from '../lib/utils';

interface AdminPanelProps {
  tutors: Tutor[];
  schoolEvents: SchoolEvent[];
  onClose: () => void;
  closedMonths: string[];
}

export default function AdminPanel({ tutors, schoolEvents, onClose, closedMonths }: AdminPanelProps) {
  const [password, setPassword] = React.useState('');
  const [isAuthorized, setIsAuthorized] = React.useState(false);
  const [editTutors, setEditTutors] = React.useState<Tutor[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'tutor' | 'calendar' | 'closing' | 'privacy'>('tutor');

  // Privacy Documents Management States
  const [privacyFiles, setPrivacyFiles] = React.useState<any[]>([]);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const [isUploadingFile, setIsUploadingFile] = React.useState(false);
  const [privacyError, setPrivacyError] = React.useState<string | null>(null);
  const [privacyUploadSuccess, setPrivacyUploadSuccess] = React.useState(false);
  const privacyFileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!isAuthorized) return;
    const q = query(collection(db, 'privacy_files'), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        loaded.push({
          id: doc.id,
          name: data.name || '무제 파일',
          fileSize: data.fileSize || 0,
          fileType: data.fileType || '',
          fileContent: data.fileContent || '',
          uploadedAt: data.uploadedAt
        });
      });
      setPrivacyFiles(loaded);
    }, (err) => {
      console.error(err);
      setPrivacyError('개인정보파일 목록을 불러오는 중 오류가 발생했습니다.');
    });
    return () => unsubscribe();
  }, [isAuthorized]);

  const processPrivacyFile = async (file: File) => {
    setPrivacyError(null);
    setPrivacyUploadSuccess(false);

    const LIMIT = 800 * 1024; 
    if (file.size > LIMIT) {
      setPrivacyError('클라우드 저장소 제한으로 인해 800KB 이하의 파일만 업로드할 수 있습니다.');
      return;
    }

    setIsUploadingFile(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64Content = event.target?.result as string;
        if (!base64Content) {
          throw new Error('파일을 읽을 수 없습니다.');
        }

        await addDoc(collection(db, 'privacy_files'), {
          name: file.name,
          fileSize: file.size,
          fileType: file.type,
          fileContent: base64Content,
          uploadedAt: serverTimestamp()
        });

        setPrivacyUploadSuccess(true);
        setTimeout(() => setPrivacyUploadSuccess(false), 3000);
      } catch (err: any) {
        console.error(err);
        setPrivacyError('파일 업로드 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류'));
      } finally {
        setIsUploadingFile(false);
      }
    };

    reader.onerror = () => {
      setPrivacyError('파일을 읽는 도중 오류가 발생했습니다.');
      setIsUploadingFile(false);
    };

    reader.readAsDataURL(file);
  };

  const handlePrivacyDownload = (file: any) => {
    try {
      const parts = file.fileContent.split(',');
      const byteString = atob(parts[1] || parts[0]);
      const mimeString = parts[0].split(':')[1]?.split(';')[0] || file.fileType;
      
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      
      const blob = new Blob([ab], { type: mimeString });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('파일을 다운로드하는 중 오류가 발생했습니다.');
    }
  };

  const handlePrivacyDelete = async (id: string) => {
    if (!window.confirm('정말 이 개인정보파일을 삭제하시겠습니까?')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'privacy_files', id));
    } catch (err: any) {
      console.error(err);
      setPrivacyError('파일 삭제 중 오류가 발생했습니다.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatFileDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Monthly Closing State & Handlers
  const manageableMonths = React.useMemo(() => {
    const list = [];
    const today = new Date();
    // Generate precise monthly list from 8 months ago to 3 months into the future
    for (let i = -8; i <= 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      list.push(format(d, 'yyyy-MM'));
    }
    return list;
  }, []);

  const toggleMonthClosing = async (monthStr: string) => {
    const currentStatus = closedMonths.includes(monthStr);
    try {
      await setDoc(doc(db, 'closed_months', monthStr), {
        closed: !currentStatus,
        closedAt: serverTimestamp()
      }, { merge: true });
    } catch (err: any) {
      console.error(err);
      alert("마감 상태를 변경하는 중 오류가 발생했습니다.");
    }
  };

  // Academic Calendar State
  const [newEventDate, setNewEventDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [newEventTitle, setNewEventTitle] = React.useState('');
  
  // Week management
  const [selectedWeekOffset, setSelectedWeekOffset] = React.useState(0);
  const [editMode, setEditMode] = React.useState<'default' | 'week'>('default');

  const availableWeeks = React.useMemo(() => {
    const list = [];
    const today = startOfToday();
    // Support from 24 weeks ago (-24) to 20 weeks in the future (+20)
    for (let offset = -24; offset <= 20; offset++) {
      const start = startOfWeek(addWeeks(today, offset), { weekStartsOn: 1 });
      const end = addDays(start, 4);
      const dateStr = format(start, 'yyyy-MM-dd');
      const endFormat = start.getFullYear() === end.getFullYear() ? 'MM.dd' : 'yyyy.MM.dd';
      const displayLabel = `${format(start, 'yyyy.MM.dd')} ~ ${format(end, endFormat)}`;

      list.push({
        offset,
        dateStr,
        start,
        end,
        displayLabel
      });
    }
    return list;
  }, []);

  const currentWeekObj = availableWeeks.find(w => w.offset === selectedWeekOffset) || availableWeeks.find(w => w.offset === 0) || availableWeeks[0];
  const targetWeekStart = currentWeekObj.dateStr;

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
                {activeTab === 'tutor' ? '시간표 마스터 관리' : activeTab === 'calendar' ? '학사일정 관리' : activeTab === 'closing' ? '월 마감 관리' : '개인정보처리방침 관리'}
              </h2>
              <p className="text-[10px] font-bold text-[#B0BEC5] tracking-widest uppercase mt-0.5">
                {activeTab === 'tutor' ? 'Tutor Assets & Period Overrides' : activeTab === 'calendar' ? 'School Academic Calendar' : activeTab === 'closing' ? 'Monthly Payroll & System Locks' : 'Privacy Agreements & Secure Files'}
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
              <button 
                onClick={() => setActiveTab('closing')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'closing' ? "bg-red-500 text-white shadow-sm" : "text-[#90A4AE] hover:bg-[#F5F5F5]"
                )}
              >
                <Lock size={14} /> 월 마감 설정
              </button>
              <button 
                onClick={() => setActiveTab('privacy')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'privacy' ? "bg-purple-600 text-white shadow-sm" : "text-[#90A4AE] hover:bg-[#F5F5F5]"
                )}
              >
                <Shield size={14} /> 개인정보파일 관리
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
                      className="bg-[#FAFAFA] border border-[#EEEEEE] text-xs font-bold text-[#455A64] py-1.5 px-3 rounded-xl outline-none cursor-pointer hover:border-[#CFD8DC] transition-colors"
                    >
                      {availableWeeks.map((week) => (
                        <option key={week.offset} value={week.offset}>
                          {week.displayLabel}
                        </option>
                      ))}
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
                      현재 <strong>{currentWeekObj.displayLabel}</strong>를 편집 중입니다. 
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
                        <div className="absolute left-0 top-full mt-2 z-20 bg-white p-6 rounded-3xl shadow-2xl border border-[#EEEEEE] w-80 flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <h5 className="text-[10px] font-black text-[#546E7A] uppercase tracking-widest">적용할 주차 선택</h5>
                            <span className="text-[10px] text-[#039BE5] font-bold">{applyingWeeks.length}개 선택됨</span>
                          </div>
                          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                            {availableWeeks.map((week) => {
                              const isSelected = applyingWeeks.includes(week.dateStr);
                              return (
                                <button 
                                  key={week.dateStr}
                                  onClick={() => toggleWeekInApply(week.dateStr)}
                                  className={cn(
                                    "px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-between text-left",
                                    isSelected 
                                      ? "bg-[#039BE5] border-[#039BE5] text-white shadow-xs" 
                                      : "bg-white border-[#EEEEEE] text-[#546E7A] hover:border-sky-200 hover:bg-[#F9FAFB]"
                                  )}
                                >
                                  <span className="font-mono text-xs">{week.displayLabel}</span>
                                  {isSelected && <Check size={14} className="text-white" />}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex gap-2 pt-2 border-t border-[#EEEEEE]">
                            <button 
                              onClick={() => {
                                setShowWeekSelector(null);
                                setApplyingWeeks([]);
                              }}
                              className="flex-1 py-2.5 text-xs font-bold text-gray-400 hover:text-gray-600 rounded-xl"
                            >
                              취소
                            </button>
                            <button 
                              onClick={() => applyToSelectedWeeks(tutor.id)}
                              className="flex-2 py-2.5 bg-[#039BE5] text-white rounded-xl text-xs font-black shadow-lg shadow-sky-100 hover:bg-[#0288D1] transition-all"
                            >
                              선택 주차 적용 ({applyingWeeks.length})
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
          ) : activeTab === 'calendar' ? (
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
          ) : activeTab === 'closing' ? (
            <div className="space-y-8 max-w-2xl mx-auto">
              <section className="p-8 bg-red-50/30 rounded-[2.5rem] border border-red-100/50 space-y-4">
                <div className="flex items-center gap-3">
                  <Lock size={20} className="text-red-500" />
                  <h3 className="text-lg font-black text-red-900">월 마감 통합 시스템</h3>
                </div>
                <p className="text-xs text-red-700/80 leading-relaxed">
                  월 마감 처리를 진행한 월은 급여 정산이 완료된 상태로 보호됩니다. 마감된 기간에 대해서는 <strong>인출, 예약 및 변경 과정이 차단</strong>되며 신규 입력도 전면 비활성화됩니다. 필요 시 언제든지 자유롭게 마감을 해제하실 수 있습니다.
                </p>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-black text-[#B0BEC5] uppercase tracking-widest pl-4">월별 마감 처리 / 해제</h3>
                <div className="flex flex-col gap-3">
                  {manageableMonths.map(month => {
                    const isClosed = closedMonths.includes(month);
                    const [yearStr, monthStr] = month.split('-');
                    return (
                      <div key={month} className={cn(
                        "flex items-center justify-between p-5 bg-white rounded-2xl border transition-all",
                        isClosed ? "border-red-200 bg-red-50/5" : "border-[#EEEEEE]"
                      )}>
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "p-3 rounded-xl",
                            isClosed ? "bg-red-50 text-red-500" : "bg-gray-50 text-gray-400"
                          )}>
                            {isClosed ? <Lock size={18} /> : <Unlock size={18} />}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-base text-[#455A64]">
                              {yearStr}년 {monthStr}월 근무
                            </span>
                            <span className="text-[10px] font-semibold text-[#90A4AE] mt-0.5">
                              {isClosed ? "🔒 마감 처리됨 - 수정 차단" : "🔓 수정 및 예약 상시 가능"}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => toggleMonthClosing(month)}
                          className={cn(
                            "px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 active:scale-95 shadow-xs",
                            isClosed 
                              ? "bg-red-100/60 hover:bg-red-100 border border-red-200 text-red-600" 
                              : "bg-gray-50 hover:bg-gray-100 border border-gray-200 text-[#455A64]"
                          )}
                        >
                          {isClosed ? "마감 해제하기" : "월 마감하기"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-8 max-w-2xl mx-auto">
              <section className="p-8 bg-purple-50/30 rounded-[2.5rem] border border-purple-100/50 space-y-4 animate-in fade-in">
                <div className="flex items-center gap-3">
                  <Shield size={20} className="text-purple-600" />
                  <h3 className="text-lg font-black text-purple-900">개인정보처리방침 및 서류 관리</h3>
                </div>
                <p className="text-xs text-purple-700/80 leading-relaxed">
                  이곳에서는 학교의 <strong>개인정보처리방침, 수집·이용 동의서, 규정 문서</strong> 등을 등록하고 관리할 수 있습니다. 등록된 파일은 모든 사용자가 메인 화면 하단의 '개인정보처리방침' 링크를 통해 조회하고 안전하게 다운로드할 수 있게 됩니다.
                </p>
              </section>

              {/* Upload Drag & Drop Area */}
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    await processPrivacyFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => privacyFileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-[1.8rem] p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all text-center relative overflow-hidden",
                  isDraggingFile 
                    ? "border-purple-500 bg-purple-50/50 scale-[0.99]" 
                    : "border-purple-200 hover:border-purple-400 bg-purple-50/10 hover:bg-purple-50/20"
                )}
              >
                <input 
                  type="file" 
                  ref={privacyFileInputRef}
                  onChange={async (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      await processPrivacyFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all bg-purple-100/80 text-purple-600",
                  isDraggingFile && "scale-110 bg-purple-500 text-white"
                )}>
                  <Upload size={22} className={cn(isUploadingFile && "animate-bounce")} />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="font-bold text-sm text-slate-700">
                    {isDraggingFile ? "여기에 파일을 놓아주세요" : "새로운 방침 및 동의서 업로드"}
                  </span>
                  <p className="text-xs text-slate-400 leading-normal max-w-sm mx-auto">
                    이 영역을 클릭하거나 파일을 드래그하여 등록하세요.<br />
                    <span className="text-purple-600 font-semibold">(한도 800KB 이하 / HWP, PDF, PNG, Excel 등 가능)</span>
                  </p>
                </div>
              </div>

              {/* Success / Error alerts */}
              {privacyError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                  <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-800 font-medium leading-relaxed">{privacyError}</p>
                </div>
              )}

              {privacyUploadSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-800">
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold">개인정보파일이 성공적으로 등록되었습니다!</span>
                </div>
              )}

              {/* Files list */}
              <section className="space-y-4">
                <h3 className="text-xs font-black text-[#B0BEC5] uppercase tracking-widest pl-4">등록된 보안 문서 ({privacyFiles.length}개)</h3>
                <div className="flex flex-col gap-3">
                  {privacyFiles.length === 0 ? (
                    <div className="border border-dashed border-purple-100 rounded-3xl flex flex-col items-center justify-center p-12 text-center text-[#B0BEC5] gap-2 bg-slate-50/30">
                      <ShieldAlert size={26} className="text-slate-300" />
                      <span className="text-xs font-bold text-slate-400">보관된 개인정보파일이 없습니다</span>
                      <p className="text-[10px] text-slate-400/80">안전한 데이터 처리를 위해 관련 서류를 다운로드 가능하도록 등록해 주세요.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                      {privacyFiles.map((file) => (
                        <div 
                          key={file.id} 
                          className="flex items-center justify-between p-4 bg-white hover:bg-purple-50/5 border border-slate-100 hover:border-purple-100 rounded-2xl transition-all shadow-xs"
                        >
                          <div className="flex items-center gap-3 overflow-hidden mr-4">
                            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-500 shrink-0">
                              <FileText size={18} />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-xs text-slate-700 truncate" title={file.name}>
                                {file.name}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-semibold mt-0.5">
                                <span>{formatFileSize(file.fileSize)}</span>
                                <span className="text-slate-250">•</span>
                                <span>{formatFileDate(file.uploadedAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handlePrivacyDownload(file)}
                              className="p-2 hover:bg-purple-100 text-purple-600 rounded-xl transition-all active:scale-95 animate-in"
                              title="다운로드"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={() => handlePrivacyDelete(file.id)}
                              className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-all active:scale-95"
                              title="삭제"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
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
          ) : activeTab === 'calendar' ? (
             <div className="flex items-center gap-2 text-[#B0BEC5]">
               <Info size={16} />
               <p className="text-[10px] font-bold italic tracking-tight">학사일정은 추가/삭제 즉시 서버에 반영됩니다.</p>
             </div>
          ) : activeTab === 'closing' ? (
             <div className="flex items-center gap-2 text-[#F44336]">
               <Info size={16} />
               <p className="text-[10px] font-bold italic tracking-tight">마감 상태 변경은 실시간으로 모든 튜터 및 교직원의 화면에 즉시 통제 규칙으로 적용됩니다.</p>
             </div>
          ) : (
             <div className="flex items-center gap-2 text-purple-600">
               <ShieldAlert size={16} />
               <p className="text-[10px] font-bold italic tracking-tight">여기에 수집 동의서 및 처리방침 서류를 등록해놓으면 사용자들이 하단 메뉴를 통해 받아볼 수 있습니다.</p>
             </div>
          )}
        </footer>
      </motion.div>
    </div>
  );
}
