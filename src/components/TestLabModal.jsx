// V9.25: 🧪 검증 모드 (테스트 랩) — 성일님(검수원 '김성일') 전용.
//   실항차로 기능을 재검수할 때 쓰는 도구 모음. 첫 도구: 검수확인 전체 취소.
//   위험 작업이므로 이중 확인 + 실행 결과를 숫자로 보고한다.
import React, { useMemo, useState } from 'react';
import { FlaskConical, X, Loader2 } from 'lucide-react';
import { fbBulkCancelComplete, fbCancelComplete } from '../firebase.js';

export default function TestLabModal({ voyage, voyageKey, onClose }) {
  const [busy, setBusy] = useState(false);
  const [resetActuals, setResetActuals] = useState(true);
  const [log, setLog] = useState([]);

  const stat = useMemo(() => {
    const s = {};
    for (const mode of ['discharge', 'loading']) {
      const sec = voyage?.[mode] || {};
      const comp = Object.keys(sec.completed || {}).length;
      let actuals = 0;
      for (const r of Object.values(sec.records || {})) {
        if (r && r.bay_actual !== undefined && r.bay_actual !== null && r.bay_actual !== '') actuals++;
      }
      s[mode] = { comp, actuals };
    }
    return s;
  }, [voyage]);

  const run = async (mode) => {
    if (busy) return;
    const name = mode === 'loading' ? '선적' : '양하';
    const st = stat[mode];
    if (!window.confirm(`⚠ ${name}확인 ${st.comp}건을 전체 취소합니다.${resetActuals ? `\n수동 배치·임시창고 기록 ${st.actuals}건도 원계획으로 원복됩니다.` : ''}\n\n검증(재검수)용 도구입니다. 계속할까요?`)) return;
    if (!window.confirm(`정말입니까? ${voyageKey} ${name} 검수 기록이 지워집니다.\n(리스트·EDI·실번호는 유지)`)) return;
    setBusy(true);
    try {
      const r = await fbBulkCancelComplete(voyageKey, mode, { resetActuals });
      setLog(l => [`✅ ${name}: 확인 취소 ${r.canceled}건 · 배치 원복 ${r.actualsReset}건 · 마감 플래그 해제`, ...l]);
    } catch (e) {
      setLog(l => [`❌ ${name}: 실패 — ${e?.message || e}`, ...l]);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-fuchsia-700 rounded-2xl w-full sm:max-w-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-950">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-fuchsia-400"/>
            <div>
              <div className="text-base font-black text-fuchsia-300">검증 모드 (테스트 랩)</div>
              <div className="text-[10px] text-slate-400">{voyageKey} · 성일님 전용 — 다른 검수원에겐 보이지 않습니다</div>
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
        </div>
        <div className="p-4 space-y-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 rounded-lg px-3 py-2.5">
            <input type="checkbox" checked={resetActuals} onChange={e => setResetActuals(e.target.checked)} className="w-4 h-4"/>
            수동 배치·임시창고 기록도 원계획으로 원복 (완전 초기화)
          </label>
          {['loading', 'discharge'].map(mode => (
            <button key={mode} onClick={() => run(mode)} disabled={busy || !stat[mode].comp}
              className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 border ${mode === 'loading' ? 'bg-rose-900/60 hover:bg-rose-800 border-rose-600 text-rose-100' : 'bg-indigo-900/60 hover:bg-indigo-800 border-indigo-600 text-indigo-100'} disabled:opacity-40`}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : '🧨'}
              {mode === 'loading' ? '선적' : '양하'}확인 전체 취소 — {stat[mode].comp}건{resetActuals && stat[mode].actuals ? ` (+배치 원복 ${stat[mode].actuals})` : ''}
            </button>
          ))}
          <div className="text-[10px] text-slate-500 leading-relaxed">
            리스트·EDI·실번호·X-RAY 기록은 지우지 않습니다. 완료 체크와 (옵션) 수동 배치만 초기화해
            처음부터 다시 검수 흐름을 태울 수 있습니다.
          </div>
          {/* V9.26: 부분 취소 — 베이 격자에서 드래그/탭으로 일부만 골라 취소 (사용자: "일부분이 잘못되었을 때 전체를 수정할 필요는 없다") */}
          <PartialCancel voyage={voyage} voyageKey={voyageKey} busy={busy} setBusy={setBusy} setLog={setLog}/>
          {log.length > 0 && (
            <div className="bg-slate-950 rounded-lg p-2 space-y-1 max-h-32 overflow-y-auto">
              {log.map((l, i) => <div key={i} className="text-[11px] mono text-slate-300">{l}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ── V9.26: 부분 취소 격자 — 완료 컨만 셀로 그려, 마우스 드래그(PC)·탭(폰)으로 선택 ──
//   취소는 기존 단건 취소(fbCancelComplete)와 동일 정책: 완료 해제 + 위치 원계획(bay_orig) 원복.
function PartialCancel({ voyage, voyageKey, busy, setBusy, setLog }) {
  const [mode, setMode] = useState('loading');
  const [selBay, setSelBay] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const dragRef = React.useRef(false);

  const byBay = useMemo(() => {
    const sec = voyage?.[mode] || {};
    const comp = sec.completed || {};
    const rec = sec.records || {};
    const edi = sec.ediContainers || {};
    const m = {};
    for (const cn of Object.keys(comp)) {
      const r = rec[cn] || {};
      const e = edi[cn] || {};
      const hasA = r.bay_actual !== undefined && r.bay_actual !== null && r.bay_actual !== '' && !String(r.bay_actual).startsWith('__');
      const b = hasA ? r.bay_actual : (e.bay || r.bay || '');
      const row = hasA ? r.row_actual : (e.row || r.row || '');
      const tier = hasA ? r.tier_actual : (e.tier || r.tier || '');
      const key = b ? String(parseInt(b, 10)) : '미배정';
      (m[key] = m[key] || []).push({ cn, row: String(row || ''), tier: String(tier || '') });
    }
    return m;
  }, [voyage, mode]);

  const bays = useMemo(() => Object.keys(byBay).sort((a, b) => (parseInt(a, 10) || 999) - (parseInt(b, 10) || 999)), [byBay]);
  const grid = useMemo(() => {
    if (!selBay || !byBay[selBay]) return null;
    const list = byBay[selBay];
    const tiers = [...new Set(list.map(c => c.tier))].sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    const rows = [...new Set(list.map(c => c.row))].sort();
    const at = {};
    list.forEach(c => { at[`${c.tier}-${c.row}`] = c; });
    return { tiers, rows, at };
  }, [selBay, byBay]);

  const toggle = (cn, force) => setSel(prev => {
    const n = new Set(prev);
    if (force === true) n.add(cn);
    else if (force === false) n.delete(cn);
    else n.has(cn) ? n.delete(cn) : n.add(cn);
    return n;
  });

  const cancelSel = async () => {
    if (busy || !sel.size) return;
    if (!window.confirm(`선택한 ${sel.size}건의 ${mode === 'loading' ? '선적' : '양하'}확인을 취소합니다.\n(완료 해제 + 위치는 원계획으로 원복 — 단건 취소와 동일)`)) return;
    setBusy(true);
    let ok = 0, fail = 0;
    try {
      for (const cn of sel) {
        try { await fbCancelComplete(voyageKey, mode, cn); ok++; }
        catch { fail++; }
      }
      setLog(l => [`✅ 부분 취소: ${ok}건 완료${fail ? ` · 실패 ${fail}` : ''} (${mode === 'loading' ? '선적' : '양하'})`, ...l]);
      setSel(new Set());
    } finally { setBusy(false); }
  };

  return (
    <div className="border border-slate-700 rounded-lg p-2.5 space-y-2"
      onMouseUp={() => { dragRef.current = false; }} onMouseLeave={() => { dragRef.current = false; }}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-slate-200">✂️ 부분 취소 — 드래그/탭으로 골라서</div>
        <div className="flex gap-1">
          {['loading', 'discharge'].map(m2 => (
            <button key={m2} onClick={() => { setMode(m2); setSelBay(null); setSel(new Set()); }}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${mode === m2 ? 'bg-fuchsia-700 text-fuchsia-50' : 'bg-slate-800 text-slate-400'}`}>
              {m2 === 'loading' ? '선적' : '양하'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {bays.length === 0 && <div className="text-[10px] text-slate-500">완료된 컨이 없습니다</div>}
        {bays.map(b => (
          <button key={b} onClick={() => setSelBay(selBay === b ? null : b)}
            className={`px-2 py-1 rounded text-[10px] font-black ${selBay === b ? 'bg-fuchsia-600 text-fuchsia-50' : 'bg-slate-800 text-slate-300'}`}>
            {b === '미배정' ? '미배정' : `B${b}`} {byBay[b].length}
          </button>
        ))}
      </div>
      {grid && (
        <div className="overflow-x-auto select-none">
          <div className="inline-block">
            {grid.tiers.map(t => (
              <div key={t} className="flex gap-0.5 mb-0.5 items-center">
                <span className="text-[9px] text-slate-500 mono w-5 flex-shrink-0">{t}</span>
                {grid.rows.map(rw => {
                  const c = grid.at[`${t}-${rw}`];
                  if (!c) return <div key={rw} className="w-12 h-8 rounded-sm border border-dashed border-slate-800 flex-shrink-0"/>;
                  const on = sel.has(c.cn);
                  return (
                    <button key={rw}
                      onMouseDown={(e) => { e.preventDefault(); dragRef.current = true; toggle(c.cn); }}
                      onMouseEnter={() => { if (dragRef.current) toggle(c.cn, true); }}
                      onTouchStart={(e) => { e.preventDefault(); toggle(c.cn); }}
                      className={`w-12 h-8 rounded-sm border text-[10px] mono font-bold flex-shrink-0 ${on ? 'bg-rose-700 border-rose-400 text-rose-50' : 'bg-emerald-900/70 border-emerald-600 text-emerald-100'}`}>
                      {c.cn.slice(-4)}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="flex gap-0.5 mt-0.5">
              <span className="w-5 flex-shrink-0"/>
              {grid.rows.map(rw => <span key={rw} className="w-12 text-center text-[9px] text-slate-500 mono flex-shrink-0">{rw}</span>)}
            </div>
          </div>
        </div>
      )}
      {sel.size > 0 && (
        <button onClick={cancelSel} disabled={busy}
          className="w-full py-2.5 rounded-lg font-bold text-sm bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white">
          선택 {sel.size}건 검수확인 취소
        </button>
      )}
      <div className="text-[9.5px] text-slate-500">초록=완료(선택 가능) · 빨강=선택됨 · PC는 누른 채 드래그, 폰은 탭</div>
    </div>
  );
}
