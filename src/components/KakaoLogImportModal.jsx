// TallyOne 1.8-15: 카톡 작업방 기록으로 타임시트를 메운다
//
// 왜 (검수사 확정 2026-08-05)
//   해치커버를 앱이 아니라 카톡에 손으로 쳐서 보고한 건이 많다. 그래서 앱 기록엔 오픈만 남고
//   클로즈가 비어, 마감 텔리 타임시트가 "커버가 열린 채 마감"으로 나왔다 — 불가능한 서류다.
//   카톡방에는 실제로 다 남아 있으니 **그 방을 정본으로 삼아 빠진 것만 메운다.**
//   "마감텔리후 부족할걸 카톡 메시지 복사로 해결" — 예보 파서와 같은 방식.
//
// ⚠ 지어내지 않는다. 붙여넣은 글에 있는 것만 담고, 이미 앱에 있는 건 회색으로 빼 둔다.
//   추가는 사람이 눌러야 들어간다.
import React, { useState, useMemo } from 'react';
import { X, ClipboardPaste, Check, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { parseKakaoWorkLog, diffAgainstReports } from '../kakaoWorkLog.js';
import { bayGroupCenter } from '../swapGrade.js';
import { getBayPairs } from '../twin.js';
import { fbAddReportsAt, fbDeleteReport } from '../firebase.js';

const HHMM = (ms) => new Date(ms).toLocaleString('ko-KR',
  { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

const ACT_KO = {
  discharge_start: '양하 시작', discharge_done: '양하 완료',
  loading_start: '선적 시작', loading_done: '선적 완료',
  pause: '중단', resume: '재개',
};

export default function KakaoLogImportModal({ voyage, voyageKey, base, onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [picked, setPicked] = useState(null);   // null = 아직 안 골랐으면 '빠진 것' 전부 선택
  // TallyOne 1.8-18: 탭 둘 — 모자란 것을 채우고, 잘못 들어온 것을 지운다.
  const [tab, setTab] = useState('add');        // 'add' | 'clean'
  const [confirmKey, setConfirmKey] = useState(null);
  const [gone, setGone] = useState(() => new Set());

  const bayPairs = useMemo(() => {
    const all = [];
    for (const m of ['discharge', 'loading']) {
      for (const c of Object.values((voyage?.[m] || {}).ediContainers || {})) if (c) all.push(c);
    }
    return getBayPairs(all, voyage?.info?.imo || '', voyage?.info?.vsl || '');
  }, [voyage]);
  const groupOf = (b) => bayGroupCenter(b, bayPairs);

  // 이 항차에 실제로 들어 있는 작업 보고 전부 — 지울 대상을 고르는 목록이다.
  const saved = useMemo(() => Object.entries(voyage?.reports || {})
    .filter(([, r]) => r && r.ts && (r.type === 'hatch' || r.type === 'work_status'))
    .sort((a, b) => a[1].ts - b[1].ts), [voyage]);

  // 작업 시작일 — 붙여넣은 글에 날짜 전환선이 나오기 전까지의 기준일
  const baseDate = useMemo(() => {
    const pd = String(voyage?.info?.planDate || '');
    const m = pd.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  }, [voyage]);

  const rows = useMemo(() => {
    if (!text.trim()) return [];
    const { items } = parseKakaoWorkLog(text, { baseDate });
    return diffAgainstReports(items, voyage?.reports || {}, groupOf);
  }, [text, voyage, bayPairs, baseDate]);   // eslint-disable-line react-hooks/exhaustive-deps

  const missing = rows.filter((r) => !r.dup);
  const sel = picked || new Set(missing.map((r) => r.ts + '|' + r.raw));
  const keyOf = (r) => r.ts + '|' + r.raw;
  const toggle = (r) => {
    const n = new Set(sel);
    const k = keyOf(r);
    if (n.has(k)) n.delete(k); else n.add(k);
    setPicked(n);
  };

  const add = async () => {
    const take = missing.filter((r) => sel.has(keyOf(r)));
    if (!take.length) { setMsg('추가할 항목이 없습니다.'); return; }
    setBusy(true); setMsg('');
    try {
      const items = take.map((r) => (r.kind === 'hatch'
        ? { ts: r.ts, type: 'hatch', action: r.action, bays: r.bays, panelCount: r.panelCount ?? null, equip: r.equip || '', message: r.raw }
        : { ts: r.ts, type: 'work_status', action: r.action, mode: r.mode || '', equip: r.equip || '', message: r.raw }));
      const { added, skipped } = await fbAddReportsAt(base, items);
      setMsg(`✅ ${added}건 기록에 추가${skipped ? ` · ${skipped}건 건너뜀(이미 있음)` : ''} — 마감 텔리를 다시 만들면 타임시트에 반영됩니다.`);
      setPicked(new Set());
      if (onDone) onDone();
    } catch (e) {
      setMsg(`추가 실패: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  const del = async (k) => {
    setBusy(true); setMsg('');
    try {
      await fbDeleteReport(base, k);
      setGone((g) => new Set(g).add(k));
      setConfirmKey(null);
      setMsg('🗑 지웠습니다 — 마감 텔리를 다시 만들면 타임시트에서 빠집니다.');
      if (onDone) onDone();
    } catch (e) {
      setMsg(`삭제 실패: ${e?.message || e}`);   // 조용히 삼키지 않는다
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-amber-800/60 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="w-4 h-4 text-amber-400"/>
            <span className="font-bold text-amber-200 text-[14px]">작업 기록 보강 · 정리</span>
          </div>
          <button onClick={onClose} className="text-slate-500 p-2" style={{ minHeight: 40 }}><X className="w-5 h-5"/></button>
        </div>

        <div className="px-4 pt-2 flex gap-1 border-b border-slate-800">
          {[['add', '카톡으로 채우기'], ['clean', `기록 정리 (${saved.length})`]].map(([k, lbl]) => (
            <button key={k} onClick={() => { setTab(k); setMsg(''); setConfirmKey(null); }}
              className={`px-3 py-2 text-[12px] rounded-t-lg border-b-2 ${
                tab === k ? 'border-amber-500 text-amber-200 font-bold' : 'border-transparent text-slate-500'}`}
              style={{ minHeight: 40 }}>{lbl}</button>
          ))}
        </div>

        {tab === 'add' && (<>
        <div className="px-4 py-2 border-b border-slate-800">
          <div className="text-[11px] text-slate-400 mb-1">
            작업방 대화를 그대로 붙여넣으세요. 앱이 보낸 것·손으로 친 것 섞여 있어도 됩니다.
            <span className="text-slate-500"> (사진·잡담은 자동으로 걸러집니다)</span>
          </div>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setPicked(null); setMsg(''); }}
            rows={5} placeholder={'[검수사] [22:16] 26번베이 커버 2장 오픈\n[검수사] [22:47] 13&15 H/O 2장 입니다'}
            className="w-full bg-slate-800 border border-slate-700 focus:border-amber-600 rounded px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none"/>
        </div>

        {text.trim() && (
          <div className="px-4 py-1.5 text-[11px] border-b border-slate-800 flex items-center gap-3 flex-wrap">
            <span className="text-slate-400">읽음 <b className="text-slate-200">{rows.length}</b>건</span>
            <span className="text-amber-300">앱에 없음 <b>{missing.length}</b>건</span>
            <span className="text-slate-600">이미 있음 {rows.length - missing.length}건</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {rows.map((r) => {
            const k = keyOf(r);
            const on = !r.dup && sel.has(k);
            const label = r.kind === 'hatch'
              ? `해치커버 ${r.action === 'open' ? '오픈' : '클로즈'} · 베이 ${r.bays.join('&')}${r.panelCount ? ` · ${r.panelCount}장` : ''}`
              : (ACT_KO[r.action] || r.action);
            return (
              <button key={k + Math.random()} onClick={() => !r.dup && toggle(r)} disabled={r.dup}
                className={`w-full text-left px-2 py-1.5 rounded border flex items-start gap-2 ${
                  r.dup ? 'bg-slate-900 border-slate-800 opacity-50'
                    : on ? 'bg-amber-900/25 border-amber-700/60' : 'bg-slate-800/40 border-slate-700'}`}>
                <span className={`mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center text-[10px] ${
                  r.dup ? 'bg-slate-700 text-slate-500' : on ? 'bg-amber-600 text-white' : 'border border-slate-600'}`}>
                  {r.dup ? '–' : on ? '✓' : ''}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-[12px] text-slate-200">{HHMM(r.ts)}</span>
                  <span className="text-[12px] text-amber-200 ml-2">{label}</span>
                  {r.equip && <span className="text-[11px] text-slate-500 ml-2">{r.equip}</span>}
                  {r.dup && <span className="text-[10px] text-slate-500 ml-2">이미 기록됨</span>}
                  <span className="block text-[10px] text-slate-600 truncate">← {r.raw}</span>
                </span>
              </button>
            );
          })}
          {text.trim() && rows.length === 0 && (
            <div className="text-[12px] text-slate-500 py-4 text-center">읽을 수 있는 작업 기록이 없습니다.</div>
          )}
        </div>
        </>)}

        {tab === 'clean' && (
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          <div className="text-[11px] text-slate-400 flex items-start gap-1.5 pb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px"/>
            <span>테스트하다 묻어 들어온 보고를 지웁니다. 앱이 쓴 기록이라 앱은 진짜와 구분하지 못합니다 — <b className="text-amber-300">판단은 수석이</b> 합니다. 지우면 되돌릴 수 없습니다.</span>
          </div>
          {saved.map(([k, r]) => {
            const label = r.type === 'hatch'
              ? `해치커버 ${String(r.action) === 'open' ? '오픈' : '클로즈'}${r.bays ? ` · 베이 ${(r.bays || []).join('&')}` : ''}${r.panelCount ? ` · ${r.panelCount}장` : ''}`
              : (ACT_KO[r.action] || r.action);
            const asking = confirmKey === k;
            return (
              <div key={k} className={`px-2 py-1.5 rounded border flex items-center gap-2 ${
                gone.has(k) ? 'bg-slate-900 border-slate-800 opacity-40'
                  : asking ? 'bg-rose-900/30 border-rose-700' : 'bg-slate-800/40 border-slate-700'}`}>
                <span className="flex-1 min-w-0">
                  <span className="text-[12px] text-slate-200">{HHMM(r.ts)}</span>
                  <span className="text-[12px] text-amber-200 ml-2">{label}</span>
                  <span className={`text-[10px] ml-2 px-1 rounded ${r._src === 'kakao' ? 'bg-amber-900/60 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                    {r._src === 'kakao' ? '카톡' : '앱'}
                  </span>
                  {gone.has(k) && <span className="text-[10px] text-rose-400 ml-2">지움</span>}
                </span>
                {!gone.has(k) && (asking ? (
                  <>
                    <button onClick={() => del(k)} disabled={busy}
                      className="px-2 py-1.5 rounded text-[11px] font-bold bg-rose-700 hover:bg-rose-600 text-white disabled:opacity-50"
                      style={{ minHeight: 36 }}>{busy ? '…' : '지웁니다'}</button>
                    <button onClick={() => setConfirmKey(null)} className="px-2 py-1.5 rounded text-[11px] bg-slate-700 text-slate-300" style={{ minHeight: 36 }}>취소</button>
                  </>
                ) : (
                  <button onClick={() => { setConfirmKey(k); setMsg(''); }} className="p-2 text-slate-500 hover:text-rose-400" style={{ minHeight: 36 }}>
                    <Trash2 className="w-4 h-4"/>
                  </button>
                ))}
              </div>
            );
          })}
          {!saved.length && <div className="text-[12px] text-slate-500 py-4 text-center">작업 보고가 없습니다.</div>}
        </div>
        )}

        {msg && <div className={`px-4 py-1.5 text-[11px] border-t border-slate-800 ${/실패/.test(msg) ? 'text-rose-300' : 'text-emerald-300'}`}>{msg}</div>}
        <div className="px-4 py-3 border-t border-slate-800 flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-[12px] bg-slate-800 text-slate-400" style={{ minHeight: 44 }}>닫기</button>
          {tab === 'add' && (
          <button onClick={add} disabled={busy || !missing.length}
            className="flex-1 px-3 py-2 rounded-lg text-[13px] font-bold bg-amber-700 hover:bg-amber-600 text-white flex items-center justify-center gap-1 disabled:opacity-50"
            style={{ minHeight: 44 }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4"/>}
            기록에 추가 ({missing.filter((r) => sel.has(keyOf(r))).length}건)
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
