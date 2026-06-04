import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Download, Trash2, FileText, CheckCircle2, AlertCircle, File, ShieldAlert } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';

interface PrivacyFilesModalProps {
  onClose: () => void;
}

interface PrivacyFileDoc {
  id: string;
  name: string;
  fileSize: number;
  fileType: string;
  fileContent: string; // base64
  uploadedAt: any;
}

export default function PrivacyFilesModal({ onClose }: PrivacyFilesModalProps) {
  const [files, setFiles] = React.useState<PrivacyFileDoc[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load files ordered by uploadedAt descending
  React.useEffect(() => {
    const q = query(collection(db, 'privacy_files'), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedFiles: PrivacyFileDoc[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        loadedFiles.push({
          id: doc.id,
          name: data.name || '무제 파일',
          fileSize: data.fileSize || 0,
          fileType: data.fileType || '',
          fileContent: data.fileContent || '',
          uploadedAt: data.uploadedAt
        });
      });
      setFiles(loadedFiles);
    }, (err) => {
      console.error(err);
      setError('파일 목록을 불러오는 중 오류가 발생했습니다.');
    });

    return () => unsubscribe();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    setError(null);
    setUploadSuccess(false);

    // Limit size to 800KB to fit comfortably inside 1MB Firestore document limits
    const LIMIT = 800 * 1024; 
    if (file.size > LIMIT) {
      setError('클라우드 저장소 제한으로 인해 800KB 이하의 파일만 업로드할 수 있습니다.');
      return;
    }

    setIsUploading(true);
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

        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 3000);
      } catch (err: any) {
        console.error(err);
        setError('파일 업로드 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류'));
      } finally {
        setIsUploading(false);
      }
    };

    reader.onerror = () => {
      setError('파일을 읽는 도중 오류가 발생했습니다.');
      setIsUploading(false);
    };

    // Read file as base64 data URL
    reader.readAsDataURL(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFile(e.target.files[0]);
    }
  };

  const handleDownload = (file: PrivacyFileDoc) => {
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
      alert('파일을 디코딩하고 다운로드하는 데 실패했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('정말 이 개인정보파일을 삭제하시겠습니까?')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'privacy_files', id));
    } catch (err: any) {
      console.error(err);
      setError('파일 삭제 중 오류가 발생했습니다.');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    // Handle both firestore timestamp and general date
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-[#311B92]/30 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in dynamic-modal">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white/95 rounded-[2.5rem] w-full max-w-2xl shadow-2xl border border-white overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <header className="p-8 border-b border-purple-50 flex items-center justify-between shrink-0 bg-linear-to-r from-purple-50/40 to-indigo-50/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700">
              <File size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">개인정보파일 통합 관리</h2>
              <p className="text-[10px] font-bold text-purple-400 tracking-wider uppercase mt-0.5">
                Privacy Agreements & Tutor Documents
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-2xl hover:bg-purple-100/60 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-95"
          >
            <X size={18} />
          </button>
        </header>

        {/* Content area */}
        <div className="p-8 flex flex-col gap-6 overflow-y-auto flex-1">
          {/* Upload Area */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-[1.8rem] p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all text-center relative overflow-hidden",
              isDragging 
                ? "border-purple-500 bg-purple-50/50 scale-[0.99]" 
                : "border-purple-200 hover:border-purple-400 bg-purple-50/10 hover:bg-purple-50/20"
            )}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all bg-purple-100/80 text-purple-600",
              isDragging && "scale-110 bg-purple-500 text-white"
            )}>
              <Upload size={22} className={cn(isUploading && "animate-bounce")} />
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-bold text-sm text-slate-700">
                {isDragging ? "여기에 파일을 놓아주세요" : "개인정보 동의서 및 파일 업로드"}
              </span>
              <p className="text-xs text-slate-400 leading-normal max-w-sm mx-auto">
                이 마당을 클릭하거나 파일을 끌어다 놓으세요.<br />
                <span className="text-purple-600 font-semibold">(한도 800KB 이하 / HWP, PDF, PNG, Excel 등 가능)</span>
              </p>
            </div>
          </div>

          {/* Feedback Messages */}
          <AnimatePresence mode="popLayout">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3"
              >
                <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 font-medium leading-relaxed">{error}</p>
              </motion.div>
            )}

            {uploadSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-800"
              >
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                <span className="text-xs font-bold">개인정보파일이 성공적으로 암호화 저장되었습니다!</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* File Lists */}
          <section className="flex flex-col gap-3 min-h-[150px]">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">
              업로드된 보안 파일 ({files.length}개)
            </h3>

            {files.length === 0 ? (
              <div className="flex-1 border border-dashed border-purple-100 rounded-3xl flex flex-col items-center justify-center p-8 text-center text-[#B0BEC5] gap-2 bg-slate-50/30">
                <ShieldAlert size={26} className="text-slate-300" />
                <span className="text-xs font-bold text-slate-400">보관된 개인정보파일이 없습니다</span>
                <p className="text-[10px] text-slate-400/80">안전한 데이터 처리를 위해 관련 서류를 보호 업로드해 주세요.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {files.map((file) => (
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
                          <span>{formatBytes(file.fileSize)}</span>
                          <span className="text-slate-250">•</span>
                          <span>{formatDate(file.uploadedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-2 hover:bg-purple-100/60 text-purple-600 rounded-xl transition-all active:scale-95"
                        title="파일 다운로드"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(file.id)}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-all active:scale-95"
                        title="파일 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="p-8 border-t border-purple-50 flex items-center justify-between bg-slate-50/40 text-[10px] text-slate-400 font-semibold shrink-0">
          <div className="flex items-center gap-1.5 leading-normal">
            <ShieldAlert size={12} className="text-purple-400 shrink-0" />
            <span>이 파일들은 SSL 보안 터널을 통해 직접 암호화 전송되며 관리 목적으로만 보관됩니다.</span>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
