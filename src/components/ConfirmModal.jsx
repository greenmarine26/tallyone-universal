// M3.74: confirm() 대체 모달
// 풀스크린 + 풀 너비 큰 버튼 (44px+) - 모바일 현장 최적화
// 사용: 단순 예/아니오 또는 위험한 작업 확인
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = '예',
  cancelLabel = '아니오',
  danger = false,           // true면 빨간색 (삭제 등 되돌릴 수 없는 작업)
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className={`bg-slate-900 border-2 ${danger ? 'border-red-700/60' : 'border-slate-700'} rounded-2xl w-full sm:max-w-md overflow-hidden shadow-2xl`}>
        {/* 헤더 */}
        <div className={`px-4 py-3 border-b ${danger ? 'bg-red-950/40 border-red-900/40' : 'bg-slate-800 border-slate-700'} flex items-center gap-2`}>
          {danger && <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0"/>}
          <div className={`flex-1 font-black text-base ${danger ? 'text-red-200' : 'text-slate-100'}`}>
            {title || (danger ? '⚠️ 확인 필요' : '확인')}
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 p-1">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* 본문 */}
        <div className="px-4 py-5">
          <div className="text-sm text-slate-200 whitespace-pre-line leading-relaxed">
            {message}
          </div>
        </div>

        {/* 버튼 - 풀 너비 큰 버튼 (44px+) */}
        <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-800 bg-slate-950">
          <button
            onClick={onCancel}
            className="py-3.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-slate-100 font-bold rounded text-sm"
            style={{ minHeight: 48 }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`py-3.5 font-bold rounded text-sm text-white ${
              danger
                ? 'bg-red-700 hover:bg-red-600 active:bg-red-800'
                : 'bg-amber-700 hover:bg-amber-600 active:bg-amber-800'
            }`}
            style={{ minHeight: 48 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// 함수형 헬퍼: 컴포넌트 안에서 useState 한 번 + 호출 한 번으로 confirm 대체
// 사용 예:
//   const [confirmState, askConfirm] = useConfirm();
//   ...
//   askConfirm({
//     title: '완료 취소',
//     message: `${cn} 검수 완료를 취소하시겠습니까?`,
//     onConfirm: async () => { await fbCancelComplete(...); },
//   });
//   ...
//   <ConfirmModal {...confirmState} />
export function useConfirm() {
  const [state, setState] = React.useState({ open: false });

  const askConfirm = React.useCallback((opts) => {
    setState({
      open: true,
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      danger: opts.danger,
      onConfirm: async () => {
        try { await opts.onConfirm?.(); } finally {
          setState({ open: false });
        }
      },
      onCancel: () => {
        opts.onCancel?.();
        setState({ open: false });
      },
    });
  }, []);

  return [state, askConfirm];
}
