// 수석 공지를 광고판처럼 흘려보내는 띠 — 로그인된 검수원에게만, "확인" 전까지 계속 흐름.
import React, { useState, useEffect } from 'react';
import { fbSubscribeBroadcast, fbMarkBroadcastRead } from '../firebase.js';

export default function BroadcastMarquee({ inspector }) {
  const [msg, setMsg] = useState(null);
  const [readId, setReadId] = useState(() => {
    try { return localStorage.getItem('gm_broadcast_read') || ''; } catch (e) { return ''; }
  });

  useEffect(() => fbSubscribeBroadcast(setMsg), []);

  // 로그인된 작업자만. 공지 없거나 이미 확인했으면 표시 안 함.
  if (!inspector) return null;
  if (!msg || !msg.text || !msg.id) return null;
  if (readId === msg.id) return null;

  const onConfirm = () => {
    try { localStorage.setItem('gm_broadcast_read', msg.id); } catch (e) {}
    setReadId(msg.id);
    fbMarkBroadcastRead(msg.id, inspector);
  };

  // 글자 수에 따라 흐르는 속도 조정 (길수록 느리게)
  const dur = Math.max(10, Math.min(40, Math.round(String(msg.text).length * 0.45)));

  return (
    <div className="sticky top-[52px] z-30 flex items-center gap-2 bg-amber-500 text-slate-900 px-2 py-1 shadow-md border-b-2 border-amber-300">
      <span className="font-black text-sm shrink-0">📢 수석</span>
      <div className="flex-1 overflow-hidden">
        <div className="gm-marq inline-block whitespace-nowrap font-bold text-sm" style={{ animationDuration: `${dur}s` }}>
          {msg.text}{msg.by ? `   — ${msg.by}` : ''}
        </div>
      </div>
      <button onClick={onConfirm}
        className="shrink-0 text-xs font-black bg-slate-900 text-amber-300 px-3 py-1 rounded hover:bg-slate-800">
        확인
      </button>
      <style>{`@keyframes gm-marq-kf { from { transform: translateX(100%); } to { transform: translateX(-100%); } } .gm-marq { animation-name: gm-marq-kf; animation-timing-function: linear; animation-iteration-count: infinite; }`}</style>
    </div>
  );
}
