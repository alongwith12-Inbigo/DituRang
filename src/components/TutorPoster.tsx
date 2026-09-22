import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Check, 
  ArrowRight, 
  Maximize2, 
  Upload, 
  X, 
  RotateCcw,
  CalendarCheck2
} from 'lucide-react';

interface TutorPosterProps {
  onApplyClick?: () => void;
  className?: string;
}

export const TutorPoster: React.FC<TutorPosterProps> = ({ onApplyClick, className = '' }) => {
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load custom image from localStorage if saved previously
  useEffect(() => {
    try {
      const saved = localStorage.getItem('diturang_tutor_poster_custom');
      if (saved) {
        setCustomImage(saved);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(PNG, JPG 등)만 업로드할 수 있습니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setCustomImage(result);
        try {
          localStorage.setItem('diturang_tutor_poster_custom', result);
        } catch {
          // If storage limit reached, keep in state
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleReset = () => {
    setCustomImage(null);
    try {
      localStorage.removeItem('diturang_tutor_poster_custom');
    } catch {}
  };

  const checklistItems = [
    'AI가 만들어준 이미지에 글자 수정',
    '포스터에 QR 코드 넣기',
    '학생들 얼굴 블러 처리',
    '구글 시트 · 설문지 만들기',
    '한글 문서에 넣을 내 서명 이미지 만들기',
    '그 외 다양한 디지털 도구 활용'
  ];

  return (
    <>
      <div 
        id="tutor-chalkboard-poster"
        className={`relative flex flex-col rounded-2xl overflow-hidden shadow-lg transition-all duration-300 border-[8px] sm:border-[10px] border-[#4a2e18] bg-[#3a2211] antialiased ${className}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files?.[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
          }
        }}
      >
        {/* Top Wood Frame Header Bar */}
        <div className="bg-[#361e0e] px-3 py-1.5 flex items-center justify-between text-[11px] text-[#decab2] border-b border-[#261408]">
          <span className="font-bold flex items-center gap-1.5 font-['Gowun_Dodum',sans-serif]">
            <Sparkles size={12} className="text-yellow-400" />
            디지털 튜터 안내판
          </span>
          <div className="flex items-center gap-1.5">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
              }}
            />
            {customImage && (
              <button 
                onClick={handleReset}
                title="칠판 그래픽으로 복원"
                className="hover:text-white p-1 rounded transition-colors flex items-center gap-0.5"
              >
                <RotateCcw size={12} />
                <span className="text-[10px]">복원</span>
              </button>
            )}
            <button 
              onClick={() => fileInputRef.current?.click()}
              title="원본 포스터 이미지 직접 업로드/교체"
              className="hover:text-white p-1 rounded bg-[#4e2912] hover:bg-[#613417] text-[10px] px-1.5 py-0.5 transition-colors flex items-center gap-1"
            >
              <Upload size={10} />
              <span>{customImage ? '변경' : '올리기'}</span>
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              title="칠판 크게 보기"
              className="hover:text-white p-1 rounded hover:bg-[#4e2912] transition-colors"
            >
              <Maximize2 size={12} />
            </button>
          </div>
        </div>

        {/* Drag Overlay */}
        {isDragOver && (
          <div className="absolute inset-0 bg-black/75 z-30 flex flex-col items-center justify-center text-white gap-2 p-4 text-center">
            <Upload size={32} className="text-yellow-400 animate-bounce" />
            <p className="font-black text-xs sm:text-sm">포스터 이미지를 여기에 놓으세요</p>
          </div>
        )}

        {/* Poster Content Area */}
        {customImage ? (
          <div className="relative bg-[#173827] flex items-center justify-center overflow-hidden cursor-pointer" onClick={() => setIsModalOpen(true)}>
            <img 
              src={customImage} 
              alt="찾아가는 디지털 튜터 포스터" 
              referrerPolicy="no-referrer"
              className="w-full h-auto object-contain max-h-[850px]"
            />
          </div>
        ) : (
          <div className="relative p-4 sm:p-5 flex flex-col justify-between text-white select-none bg-[#193a29]">
            {/* Main Chalkboard Title */}
            <div className="text-center relative z-10 pt-2 pb-1 my-1">
              <p 
                className="text-xl sm:text-2xl font-black text-white tracking-[0.3em] mb-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
                style={{ fontFamily: "'Gaegu', 'Gowun Dodum', cursive, sans-serif" }}
              >
                찾 아 가 는
              </p>
              <div className="flex items-center justify-center gap-2.5">
                <span 
                  className="text-4xl sm:text-[44px] font-black text-[#7DD3FC] tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
                  style={{ fontFamily: "'Gaegu', 'Gowun Dodum', cursive, sans-serif" }}
                >
                  디지털
                </span>
                <span 
                  className="text-4xl sm:text-[44px] font-black text-[#F472B6] tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
                  style={{ fontFamily: "'Gaegu', 'Gowun Dodum', cursive, sans-serif" }}
                >
                  튜터
                </span>
              </div>
            </div>

            {/* Clean Slogan (No blur, no glow, crisp & sharp) */}
            <div className="text-center relative z-10 my-2.5 py-2 px-3 rounded-xl border border-[#2d563e] bg-[#112a1d]">
              <p 
                className="text-[12px] font-bold text-[#FDE047] tracking-tight"
                style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
              >
                필요한 순간, 필요한 기능만
              </p>
              <p 
                className="text-[13px] sm:text-[14px] font-bold text-white tracking-tight mt-0.5"
                style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
              >
                바로, 옆에서 도와드립니다!
              </p>
            </div>

            {/* 6 Checklist Items (Crisp Chalk Style) */}
            <div className="relative z-10 my-2 bg-[#112a1d] p-3 sm:p-3.5 rounded-xl border border-[#2d563e]">
              <div className="flex flex-col gap-2.5">
                {checklistItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-xs border border-[#F472B6] bg-[#F472B6]/15 flex items-center justify-center flex-shrink-0">
                      <Check size={11} className="text-[#F472B6] stroke-[3]" />
                    </div>
                    <span 
                      className="text-[12px] sm:text-[13px] font-medium text-white tracking-tight leading-snug"
                      style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Action Area: Crisp "신청 바로가기" button */}
            <div className="relative z-10 mt-3 pt-2.5 border-t border-white/15 flex flex-col items-center gap-1.5">
              <button 
                type="button"
                onClick={onApplyClick}
                className="w-full group flex items-center justify-center gap-2 py-2.5 sm:py-3 px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-xs sm:text-sm tracking-wide shadow-md border border-[#FB7185] transition-all duration-150 transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
              >
                <CalendarCheck2 size={16} className="text-white" />
                <span 
                  className="font-bold tracking-wider"
                  style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
                >
                  신청 바로가기
                </span>
                <ArrowRight size={15} className="text-white group-hover:translate-x-0.5 transition-transform" />
              </button>
              <p 
                className="text-[11px] text-[#A7F3D0] font-medium"
                style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
              >
                원하는 시간에 1:1 맞춤 지원 신청
              </p>
            </div>

            {/* School department footer */}
            <div 
              className="text-center mt-3 pt-2 text-[11px] font-medium text-[#A7F3D0] tracking-wider border-t border-dashed border-white/15"
              style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
            >
              인천비즈니스고등학교 <span className="mx-0.5">|</span> 교육정보부
            </div>

            {/* Chalk tray details on bottom wooden frame */}
            <div className="flex items-center justify-between px-2 pt-2.5 text-[10px] opacity-80">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-2 rounded-xs bg-white shadow-xs" title="백색 분필" />
                <div className="w-6 h-2 rounded-xs bg-[#F472B6] shadow-xs" title="분홍 분필" />
                <div className="w-6 h-2 rounded-xs bg-[#FDE047] shadow-xs" title="노랑 분필" />
                <div className="w-6 h-2 rounded-xs bg-[#7DD3FC] shadow-xs" title="하늘색 분필" />
              </div>
              <div className="flex items-center" title="칠판 지우개">
                <div className="w-8 h-3.5 bg-[#3E2723] rounded-xs border-b-2 border-[#8D6E63] shadow-xs" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Poster Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="relative max-w-xl w-full bg-[#193a29] rounded-2xl overflow-hidden shadow-2xl border-[8px] sm:border-[10px] border-[#4a2e18] antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#361e0e] px-4 py-2.5 flex items-center justify-between text-white border-b border-[#261408]">
              <h3 className="font-bold text-sm flex items-center gap-2 font-['Gowun_Dodum',sans-serif]">
                <Sparkles size={16} className="text-yellow-400" />
                찾아가는 디지털 튜터 안내판 (확대 보기)
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-[#4e2912] rounded-lg transition-colors text-gray-300 hover:text-white cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 sm:p-6 max-h-[85vh] overflow-y-auto">
              {customImage ? (
                <img 
                  src={customImage} 
                  alt="찾아가는 디지털 튜터 포스터" 
                  referrerPolicy="no-referrer"
                  className="w-full h-auto object-contain rounded-xl"
                />
              ) : (
                <div className="p-6 sm:p-8 rounded-xl border border-[#2d563e] bg-[#193a29] text-white">
                  <div className="text-center my-3 pt-1">
                    <p 
                      className="text-2xl sm:text-3xl font-black text-white tracking-[0.35em] mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                      style={{ fontFamily: "'Gaegu', 'Gowun Dodum', cursive, sans-serif" }}
                    >
                      찾 아 가 는
                    </p>
                    <div className="flex items-center justify-center gap-4">
                      <span 
                        className="text-5xl sm:text-6xl font-black text-[#7DD3FC] tracking-wider drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]"
                        style={{ fontFamily: "'Gaegu', 'Gowun Dodum', cursive, sans-serif" }}
                      >
                        디지털
                      </span>
                      <span 
                        className="text-5xl sm:text-6xl font-black text-[#F472B6] tracking-wider drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]"
                        style={{ fontFamily: "'Gaegu', 'Gowun Dodum', cursive, sans-serif" }}
                      >
                        튜터
                      </span>
                    </div>
                  </div>

                  <div className="text-center my-4 py-2.5 px-4 rounded-lg border border-[#2d563e] bg-[#112a1d]">
                    <p 
                      className="text-sm font-bold text-[#FDE047]"
                      style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
                    >
                      필요한 순간, 필요한 기능만
                    </p>
                    <p 
                      className="text-base font-bold text-white mt-0.5"
                      style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
                    >
                      바로, 옆에서 도와드립니다!
                    </p>
                  </div>

                  <div className="bg-[#112a1d] p-4 sm:p-5 rounded-xl border border-[#2d563e] my-5 space-y-3">
                    {checklistItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-sm bg-[#F472B6]/10 border border-[#F472B6] flex items-center justify-center flex-shrink-0">
                          <Check size={14} className="text-[#F472B6] stroke-[3]" />
                        </div>
                        <span 
                          className="text-sm sm:text-base font-medium text-white"
                          style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
                        >
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/15 flex flex-col items-center">
                    <button 
                      onClick={() => {
                        setIsModalOpen(false);
                        if (onApplyClick) onApplyClick();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-base rounded-xl transition-all shadow-md cursor-pointer border border-[#FB7185]"
                      style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
                    >
                      <CalendarCheck2 size={20} />
                      <span>신청 바로가기</span>
                      <ArrowRight size={20} />
                    </button>
                    <p 
                      className="text-xs text-[#A7F3D0] mt-2"
                      style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
                    >
                      원하는 시간에 1:1 맞춤 지원을 신청하세요
                    </p>
                  </div>

                  <div 
                    className="text-center mt-6 text-xs text-[#A7F3D0] font-medium"
                    style={{ fontFamily: "'Gowun Dodum', sans-serif" }}
                  >
                    인천비즈니스고등학교 | 교육정보부
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
