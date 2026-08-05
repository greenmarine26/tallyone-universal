import { fmtPos } from '../utils';
// 자동 진단 경고 패널 (M3.5.4)
//   - 자료 업로드 후 자동 호출
//   - critical: 빨강 점멸 + 자동 음성
//   - warning: 주황 + 자동 음성
//   - info: 파랑 + 화면만 (음성 X)
//   - 음성 ON/OFF 토글, 닫기 버튼
import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, AlertCircle, Info, Volume2, VolumeX, ChevronDown, ChevronUp, X } from 'lucide-react';
import { speak, stopSpeak } from '../voice.js';
import { buildVoiceMessage, summarizeAlerts } from '../diagnostics.js';

export default function DiagnosticsPanel({ alerts, autoSpeak, onToggleSpeak, onDismiss, onOpenContainer }) {
  const [expanded, setExpanded] = useState(false);
  const lastAlertSig = useRef('');

  // 새 경고 등장 시 자동 음성 (한 번만)
  useEffect(() => {
    if (!alerts || alerts.length === 0) return;
    if (!autoSpeak) return;
    // 시그니처: 알람 코드+카운트 합 (변경 시 다시 음성)
    const sig = alerts.map(a => `${a.code}:${a.count || 0}`).join('|');
    if (lastAlertSig.current === sig) return;
    lastAlertSig.current = sig;
    const msg = buildVoiceMessage(alerts);
    if (msg) {
      const t = setTimeout(() => speak(msg), 600);
      return () => clearTimeout(t);
    }
  }, [alerts, autoSpeak]);

  if (!alerts || alerts.length === 0) return null;

  const summary = summarizeAlerts(alerts);
  const hasCritical = summary.critical > 0;
  const hasWarning = summary.warning > 0;

  const borderClass = hasCritical
    ? 'border-red-500 bg-red-950/40'
    : hasWarning
    ? 'border-amber-500 bg-amber-950/30'
    : 'border-blue-500 bg-blue-950/30';
  const iconClass = hasCritical ? 'text-red-400 animate-pulse' : hasWarning ? 'text-amber-400' : 'text-blue-400';

  return (
    <div className={`border-2 rounded-xl p-3 ${borderClass} ${hasCritical ? 'shadow-lg shadow-red-900/50' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertTriangle className={`w-5 h-5 ${iconClass} flex-shrink-0`}/>
          <div className="flex flex-wrap gap-1.5">
            {summary.critical > 0 && (
              <span className="bg-red-700 text-white text-[11px] font-black px-2 py-0.5 rounded-full animate-pulse">
                🔴 위험 {summary.critical}
              </span>
            )}
            {summary.warning > 0 && (
              <span className="bg-amber-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">
                🟡 주의 {summary.warning}
              </span>
            )}
            {summary.info > 0 && (
              <span className="bg-blue-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">
                🔵 정보 {summary.info}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => {
            if (autoSpeak) stopSpeak();
            else speak(buildVoiceMessage(alerts));
            onToggleSpeak();
          }}
            title={autoSpeak ? '자동 음성 끄기' : '자동 음성 켜기'}
            className={`p-1.5 rounded ${autoSpeak ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {autoSpeak ? <Volume2 className="w-3.5 h-3.5"/> : <VolumeX className="w-3.5 h-3.5"/>}
          </button>
          <button onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded bg-slate-800 text-slate-300">
            {expanded ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
          </button>
          {onDismiss && (
            <button onClick={onDismiss}
              title="경고 닫기"
              className="p-1.5 rounded bg-slate-800 text-slate-400 hover:bg-red-900/50 hover:text-red-400">
              <X className="w-3.5 h-3.5"/>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {alerts.map((a, i) => (
          <AlertRow key={i} alert={a} forceOpen={expanded} onOpenContainer={onOpenContainer}/>
        ))}
      </div>
    </div>
  );
}

function AlertRow({ alert, forceOpen, onOpenContainer }) {
  const [open, setOpen] = useState(false);
  const isOpen = open || forceOpen;
  const colorClass = alert.level === 'critical'
    ? 'bg-red-900/30 border-red-700/40 text-red-200'
    : alert.level === 'warning'
    ? 'bg-amber-900/30 border-amber-700/40 text-amber-200'
    : 'bg-blue-900/30 border-blue-700/40 text-blue-200';
  const Icon = alert.level === 'critical' ? AlertTriangle : alert.level === 'warning' ? AlertCircle : Info;
  const hasDetails = alert.details && (Array.isArray(alert.details) ? alert.details.length > 0 : Object.keys(alert.details).length > 0);

  return (
    <div className={`border rounded-lg p-2 ${colorClass}`}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-start gap-2 text-left">
        <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>
        <div className="text-xs flex-1 leading-relaxed font-bold">{alert.msg}</div>
        {hasDetails && (
          <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}/>
        )}
      </button>
      {isOpen && hasDetails && (
        <AlertDetails alert={alert} onOpenContainer={onOpenContainer}/>
      )}
    </div>
  );
}

function AlertDetails({ alert, onOpenContainer }) {
  const d = alert.details;

  if (alert.code === 'empty_seal_pending') {
    const isAttach = (Array.isArray(d) ? d[0]?.sealMode : null) === 'attach';
    return (
      <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px] space-y-0.5">
        <div className={`mb-1 ${isAttach ? 'text-red-300' : 'text-cyan-300'}`}>
          📌 클릭하면 컨테이너 모달에서 실 {isAttach ? '부착' : '확인'} 입력 가능
        </div>
        {(Array.isArray(d) ? d : []).slice(0, 30).map((c, i) => (
          <button key={i}
            onClick={(e) => { e.stopPropagation(); onOpenContainer?.(c.cn); }}
            className="mono w-full text-left px-1.5 py-1 rounded hover:bg-slate-700/50 active:bg-slate-700 flex items-center justify-between gap-2"
          >
            <span className="font-bold">{c.cn}</span>
            <span className="text-slate-400 text-[9px]">{c.iso} · POD {c.pod} · @{fmtPos(c) || '?-?-?'}</span>
            <span className={`text-[9px] ${isAttach ? 'text-red-400' : 'text-cyan-400'}`}>🔒 입력</span>
          </button>
        ))}
        {Array.isArray(d) && d.length > 30 && (
          <div className="text-slate-500">... 외 {d.length - 30}대</div>
        )}
      </div>
    );
  }

  if (alert.code === 'unknown_iso') {
    return (
      <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px] space-y-0.5">
        <div className="text-amber-300 mb-1">📌 클릭하면 컨테이너 모달에서 규격 수정 가능</div>
        {(Array.isArray(d) ? d : []).slice(0, 30).map((c, i) => (
          <button key={i}
            onClick={(e) => { e.stopPropagation(); onOpenContainer?.(c.cn); }}
            className="mono w-full text-left px-1.5 py-1 rounded hover:bg-slate-700/50 active:bg-slate-700 flex items-center justify-between gap-2"
          >
            <span className="font-bold">{c.cn}</span>
            <span className="text-slate-400">ISO: {c.iso} @ {fmtPos(c) || '?-?-?'}</span>
            <span className="text-amber-400 text-[9px]">✏️ 수정</span>
          </button>
        ))}
        {Array.isArray(d) && d.length > 30 && (
          <div className="text-slate-500">... 외 {d.length - 30}대</div>
        )}
      </div>
    );
  }

  if (alert.code === 'reefer_no_temp' || alert.code === 'dg_no_class' || alert.code === 'dg_no_un') {
    return (
      <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px] space-y-0.5">
        {(Array.isArray(d) ? d : []).slice(0, 20).map((c, i) => (
          <button key={i}
            onClick={(e) => { e.stopPropagation(); onOpenContainer?.(c.cn); }}
            className="mono w-full text-left px-1.5 py-1 rounded hover:bg-slate-700/50 active:bg-slate-700 flex items-center justify-between gap-2"
          >
            <span className="font-bold">{c.cn}</span>
            <span className="text-slate-400">@ {fmtPos(c) || '?-?-?'}</span>
            <span className="text-amber-400 text-[9px]">✏️ 수정</span>
          </button>
        ))}
        {Array.isArray(d) && d.length > 20 && (
          <div className="text-slate-500">... 외 {d.length - 20}대</div>
        )}
      </div>
    );
  }

  if (alert.code === 'list_short' || alert.code === 'list_extra') {
    return (
      <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px]">
        EDI {d.ediCount || '?'}대 / 리스트 {d.listCount || '?'}대 (매칭 {d.matchedCount ?? '?'}대)
        {d.missing && d.missing.length > 0 && (
          <div className="mt-1">
            <div className="text-amber-400 mb-0.5">리스트에 없는 컨번호 (부족):</div>
            {d.missing.slice(0, 10).map((m, i) => (
              <div key={i} className="mono">• {m.cn} {m.iso ? `(${m.iso})` : ''} {m.fe || ''}</div>
            ))}
            {d.missing.length > 10 && <div className="text-slate-500">... 외 {d.missing.length - 10}건</div>}
          </div>
        )}
        {d.extraCns && d.extraCns.length > 0 && (
          <div className="mt-1">
            <div className="text-slate-400 mb-0.5">EDI에 없는 컨번호:</div>
            {d.extraCns.slice(0, 10).map((cn, i) => <div key={i} className="mono">• {cn}</div>)}
            {d.extraCns.length > 10 && <div className="text-slate-500">... 외 {d.extraCns.length - 10}건</div>}
          </div>
        )}
      </div>
    );
  }

  if (alert.code === 'weight_diff') {
    return (
      <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px] space-y-0.5">
        {d.slice(0, 20).map((w, i) => (
          <button key={i}
            onClick={(e) => { e.stopPropagation(); onOpenContainer?.(w.cn); }}
            className="mono w-full text-left px-1.5 py-1 rounded hover:bg-slate-700/50 active:bg-slate-700 flex items-center justify-between gap-2"
          >
            <span className="font-bold">{w.cn}</span>
            <span className="text-slate-400">EDI {(w.ediW/1000).toFixed(1)}t / 리스트 {(w.lrW/1000).toFixed(1)}t</span>
            <span className="text-amber-400 text-[9px]">✏️</span>
          </button>
        ))}
      </div>
    );
  }

  if (alert.code === 'seal_diff') {
    return (
      <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px] space-y-0.5">
        {d.slice(0, 20).map((s, i) => (
          <button key={i}
            onClick={(e) => { e.stopPropagation(); onOpenContainer?.(s.cn); }}
            className="mono w-full text-left px-1.5 py-1 rounded hover:bg-slate-700/50 active:bg-slate-700"
          >
            <div className="font-bold flex items-center justify-between">
              <span>{s.cn}</span>
              <span className="text-amber-400 text-[9px]">✏️</span>
            </div>
            <div className="text-slate-400 ml-2">EDI: {s.ediSl} | 리스트: {s.lrSl}</div>
          </button>
        ))}
      </div>
    );
  }

  if (alert.code === 'imdg_violation') {
    return (
      <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px] space-y-1">
        {d.slice(0, 10).map((v, i) => (
          <div key={i}>
            <div className="font-bold">위치 {v.location} · 클래스 {v.classes}</div>
            {v.containers.map((cn, j) => (
              <button key={j}
                onClick={(e) => { e.stopPropagation(); onOpenContainer?.(cn); }}
                className="mono ml-2 hover:text-amber-300"
              >• {cn} ✏️</button>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (alert.code === 'xray_no_location') {
    return (
      <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px] space-y-0.5">
        {(Array.isArray(d) ? d : []).slice(0, 20).map((cn, i) => (
          <button key={i}
            onClick={(e) => { e.stopPropagation(); onOpenContainer?.(cn); }}
            className="mono w-full text-left px-1.5 py-1 rounded hover:bg-slate-700/50 active:bg-slate-700 flex items-center justify-between"
          >
            <span>• {cn}</span>
            <span className="text-amber-400 text-[9px]">✏️</span>
          </button>
        ))}
      </div>
    );
  }

  return null;
}
