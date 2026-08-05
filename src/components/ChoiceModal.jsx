// M3.74: window.prompt() 대체 - 다중 선택 모달
// 풀스크린 + 풀 너비 카드형 버튼 (44px+) - 모바일 현장 최적화
// 사용: EDI/리스트 업로드 시 충돌 처리 (교체/병합/신규만 등)
import React from 'react';
import { X } from 'lucide-react';

export default function ChoiceModal({
  open,
  title,
  description,
  options,        // [{ key, label, desc, recommended? }, ...]
  onSelect,       // (key) => void
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border-2 border-amber-700/40 rounded-2xl w-full sm:max-w-md overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-4 py-3 border-b border-slate-700 bg-slate-800 flex items-center gap-2">
          <div className="flex-1 font-black text-base text-amber-200">
            {title}
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 p-1">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* 설명 */}
        {description && (
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/50 text-xs text-slate-300 whitespace-pre-line leading-relaxed">
            {description}
          </div>
        )}

        {/* 옵션 카드 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {(options || []).map((opt) => (
            <button
              key={opt.key}
              onClick={() => onSelect?.(opt.key)}
              className={`w-full text-left px-4 py-4 rounded-lg border-2 transition active:scale-[0.98] ${
                opt.recommended
                  ? 'bg-amber-900/30 hover:bg-amber-900/50 border-amber-700/50'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
              }`}
              style={{ minHeight: 56 }}
            >
              <div className={`text-base font-black flex items-center gap-2 ${
                opt.recommended ? 'text-amber-200' : 'text-slate-100'
              }`}>
                {opt.recommended && <span className="text-[10px] bg-amber-600 text-amber-100 px-1.5 py-0.5 rounded">추천</span>}
                {opt.label}
              </div>
              {opt.desc && (
                <div className={`text-xs mt-1 ${opt.recommended ? 'text-amber-300/80' : 'text-slate-400'}`}>
                  {opt.desc}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* 취소 버튼 */}
        <div className="p-3 border-t border-slate-800 bg-slate-950">
          <button
            onClick={onCancel}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded text-sm"
            style={{ minHeight: 48 }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// 함수형 헬퍼
export function useChoice() {
  const [state, setState] = React.useState({ open: false });

  const askChoice = React.useCallback((opts) => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title: opts.title,
        description: opts.description,
        options: opts.options,
        onSelect: (key) => {
          setState({ open: false });
          resolve(key);
        },
        onCancel: () => {
          setState({ open: false });
          resolve(null);
        },
      });
    });
  }, []);

  return [state, askChoice];
}
