// 로그인/로그아웃 인사 모달 (M3.6)
import React, { useEffect, useState } from 'react';
import { useBackHandler } from '../backHandler.js';   // TallyOne 1.0 (K3): 안드로이드 뒤로가기 = 닫기

export default function GreetingModal({ type, lines, workForecast, onClose }) {
  // 자동 닫힘 카운트다운 (로그인 시 12초, 로그아웃 시 5초 - 예보 보는 시간)
  const totalSec = type === 'login' ? 12 : 5;
  const [remaining, setRemaining] = useState(totalSec);

  // TallyOne 1.0 (K3): 폰 뒤로가기로도 인사 모달을 닫는다 (앱 이탈 방지)
  useBackHandler(onClose, true);

  useEffect(() => {
    if (remaining <= 0) {
      onClose();
      return;
    }
    const id = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, onClose]);

  const isLogin = type === 'login';
  const bgGradient = isLogin
    ? 'from-emerald-900 via-teal-900 to-blue-900'
    : 'from-purple-900 via-indigo-900 to-slate-900';
  const borderColor = isLogin ? 'border-emerald-500' : 'border-purple-500';
  const titleColor = isLogin ? 'text-emerald-300' : 'text-purple-300';
  const title = isLogin ? '✨ 환영합니다' : '👋 수고하셨습니다';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-gradient-to-br ${bgGradient} border-2 ${borderColor} rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`text-xs font-bold ${titleColor} mb-3 uppercase tracking-wider`}>
          {title}
        </div>

        <div className="space-y-3 mb-4">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`${i === 0 ? 'text-2xl font-black text-white' : 'text-base text-slate-100'} leading-snug`}
            >
              {line}
            </div>
          ))}
        </div>

        {/* M3.68: 근무 시간대 예보 (로그인 시만) */}
        {isLogin && workForecast && workForecast.length > 0 && (
          <div className="mb-4 p-3 bg-slate-900/50 border border-slate-600 rounded-lg">
            <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase">근무 시간 예보</div>
            <div className="space-y-1.5">
              {workForecast.map((line, i) => (
                <div key={i} className="text-sm font-mono text-slate-200">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3 text-[11px] text-slate-400">
          <div className="flex-1 bg-slate-800 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full ${isLogin ? 'bg-emerald-500' : 'bg-purple-500'} transition-all duration-1000`}
              style={{ width: `${(remaining / totalSec) * 100}%` }}
            />
          </div>
          <span className="font-mono">{remaining}s</span>
        </div>

        <button
          onClick={onClose}
          className={`w-full py-3 rounded-lg font-bold text-base ${
            isLogin
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-purple-600 hover:bg-purple-500 text-white'
          }`}
        >
          {isLogin ? '시작하기' : '로그아웃 완료'}
        </button>
      </div>
    </div>
  );
}
