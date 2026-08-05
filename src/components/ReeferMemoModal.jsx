// TallyOne 1.8: 리퍼 메모 — 항차에 들어가면 리퍼가 있을 때 먼저 뜨는 온도 확인 화면
//
// 왜 (검수사 확정 2026-08-04)
//   "작업전 먼저 선박을 선택합니다. 그러면 앱은 리퍼 유무를 판단하고 있으면 리퍼메모 화면을 띄워 줍니다.
//    메모화면엔 컨테이너 넘버 EDI온도 실제 셋팅온도 실제온도 3항목을 기본으로 보여 줍니다.
//    EDI 온도는 수정불가 나머지 2개는 수정가능. 셋팅온도가 맞으면 그대로 틀리면 수정, 실제온도도 마찬가지"
//   "리퍼가 많으면 일일이 확인 불가함 → 선원이 체크한 리스트를 받아서 앱이 읽어서 기록"
//
// 그래서 채우는 길이 셋이다. 어느 쪽이든 최종 확정은 사람이 한다.
//   ① 사진   — 선원이 적어 준 리스트를 찍으면 Gemini가 읽어 두 칸을 채운다(초안).
//   ② 일괄   — 「전부 리스트대로」: EDI 온도를 그대로 셋팅·실제로 인정한다.
//   ③ 개별   — 틀린 줄만 직접 고친다.
//
// 저장은 records/{cn}.rfSet · rfAct (firebase.js fbSetReeferTemp*).
//   텔리 RF condition report 의 Setting(F열) · Actual(G열) 이 이 값을 읽는다.
import React, { useState, useMemo, useRef } from 'react';
import { X, Camera, Check, Snowflake, Loader2 } from 'lucide-react';
import { fbSetReeferTempBulk } from '../firebase.js';
import { _storage, SK } from '../utils.js';

// 점검 대상 = **풀 리퍼만** (검수사 확정 2026-08-04).
//   공 리퍼는 전원을 안 꽂아 잴 것이 없다. 텔리 RF 시트(`fe !== 'E'` — 실물 관례 "양하 F 리퍼만
//   기재")와 출항 임박 경고(`fe === 'F'`)가 이미 이 기준이라, 여기까지 맞춰 세 곳을 일치시킨다.
//   ⚠ 1.8 첫 판은 F/E 를 안 갈라 공 리퍼까지 점검 목록에 올렸다 — 메모엔 뜨는데 텔리엔 안 실리는
//     컨이 생긴다(STMJ 2643E 는 24대가 전부 풀이라 드러나지 않았다).
//   리퍼드라이(rfdry, 넌플러그)·제작컨(mkcon)도 제외 — 지침서 5-5 "온도 경고 제외" 규칙과 같다.
const isReefer = (c) => {
  const rf = !!c.rf || String(c.iso || '').toUpperCase()[2] === 'R' || /^45[38]/.test(String(c.iso || ''));
  if (!rf) return false;
  if (c.rfdry || c.mkcon) return false;
  return c.fe === 'F' || !c.fe;     // fe 미상은 남긴다 — 조용히 빠뜨리지 않는다
};

/** 화면에 보일 온도 문자열 — 값이 없으면 빈 문자열(0으로 착각하게 두지 않는다) */
const tempStr = (v) => (v == null || String(v).trim() === '' ? '' : String(v).trim());

export default function ReeferMemoModal({ containers, voyageKey, mode, inspector, onClose }) {
  const list = useMemo(
    () => (containers || []).filter(isReefer).sort((a, b) => String(a.cn).localeCompare(String(b.cn))),
    [containers]);

  // 편집 중인 값 — 처음엔 저장된 값, 없으면 EDI 온도로 미리 채운다(맞으면 그대로 두면 된다).
  const [vals, setVals] = useState(() => {
    const o = {};
    for (const c of list) {
      const edi = tempStr(c.tmp);
      o[c.cn] = { set: tempStr(c.rfSet) || edi, act: tempStr(c.rfAct) || edi, src: c.rfSrc || '' };
    }
    return o;
  });
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const camRef = useRef(null);
  const albumRef = useRef(null);

  const setField = (cn, k, v) => setVals((o) => ({ ...o, [cn]: { ...o[cn], [k]: v, src: 'manual' } }));

  /** ② 전부 리스트대로 — EDI 온도를 셋팅·실제로 일괄 인정 */
  const applyAll = () => {
    setVals((o) => {
      const n = { ...o };
      for (const c of list) {
        const edi = tempStr(c.tmp);
        n[c.cn] = { set: edi, act: edi, src: 'list' };
      }
      return n;
    });
    setNote('EDI 온도를 전부 그대로 적용했습니다 — 다른 것만 고치세요.');
  };

  /** ① 선원 리스트 사진 판독 */
  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy('photo'); setNote('');
    try {
      const key = _storage.get(SK.geminiKey) || '';
      const { ocrReeferTemps } = await import('../mixerUpload.js');
      const { items, note: n } = await ocrReeferTemps(f, key);
      const byCn = new Map(items.map((i) => [i.cn, i]));
      let hit = 0; const miss = [];
      setVals((o) => {
        const nx = { ...o };
        for (const c of list) {
          const g = byCn.get(c.cn);
          if (!g) { miss.push(c.cn); continue; }
          hit += 1;
          nx[c.cn] = {
            set: g.set || nx[c.cn].set,
            act: g.act || nx[c.cn].act,
            src: 'photo',
          };
        }
        return nx;
      });
      // 사진에 있는데 이 항차 리퍼가 아닌 컨은 버렸다는 걸 숨기지 않는다.
      const extra = items.filter((i) => !list.some((c) => c.cn === i.cn)).length;
      setNote(`${n} → 이 항차 리퍼 ${hit}대 채움`
        + (miss.length ? ` · 못 찾은 ${miss.length}대는 직접 확인하세요` : '')
        + (extra ? ` · 이 항차에 없는 ${extra}대는 무시` : ''));
    } catch (err) {
      setNote(`판독 실패: ${err?.message || err}`);
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      const rows = list.map((c) => ({ cn: c.cn, set: vals[c.cn]?.set ?? '', act: vals[c.cn]?.act ?? '', src: vals[c.cn]?.src || 'manual' }));
      await fbSetReeferTempBulk(voyageKey, mode, rows, inspector);
      onClose?.(true);
    } catch (e) {
      setNote(`저장 실패: ${e?.message || e}`);
      setBusy('');
    }
  };

  if (!list.length) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-cyan-800/60 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Snowflake className="w-4 h-4 text-cyan-400"/>
            <span className="font-bold text-cyan-200 text-[14px]">리퍼 온도 확인</span>
            <span className="text-[11px] text-slate-500">{list.length}대</span>
          </div>
          <button onClick={() => onClose?.(false)} className="text-slate-500 p-2" style={{ minHeight: 40 }}><X className="w-5 h-5"/></button>
        </div>

        {/* 상단 — 많을 때 일일이 못 하니 사진·일괄 두 길을 먼저 준다 */}
        <div className="px-4 py-2 border-b border-slate-800 flex items-center gap-2 flex-wrap">
          <button onClick={() => camRef.current?.click()} disabled={!!busy}
            className="px-3 py-2 rounded-lg text-[12px] font-bold bg-violet-800 hover:bg-violet-700 text-violet-100 flex items-center gap-1 disabled:opacity-50"
            style={{ minHeight: 40 }}>
            {busy === 'photo' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Camera className="w-4 h-4"/>}
            {busy === 'photo' ? '읽는 중…' : '선원 리스트 촬영'}
          </button>
          <button onClick={() => albumRef.current?.click()} disabled={!!busy}
            className="px-3 py-2 rounded-lg text-[12px] bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
            style={{ minHeight: 40 }}>앨범에서</button>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 text-[12px] text-slate-300 cursor-pointer" style={{ minHeight: 40 }}>
            <input type="checkbox" onChange={(e) => e.target.checked && applyAll()} className="w-4 h-4 accent-cyan-500"/>
            전부 리스트대로 (EDI 온도 그대로 인정)
          </label>
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden"/>
          <input ref={albumRef} type="file" accept="image/*" onChange={onPhoto} className="hidden"/>
        </div>
        {note && <div className="px-4 py-1.5 text-[11px] text-amber-300 border-b border-slate-800">{note}</div>}

        <div className="px-4 py-1 grid grid-cols-[1fr_58px_72px_72px] gap-1 text-[10px] text-slate-500 border-b border-slate-800">
          <span>컨테이너 번호</span><span className="text-center">EDI</span><span className="text-center">셋팅</span><span className="text-center">실제</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {list.map((c) => {
            const edi = tempStr(c.tmp);
            const v = vals[c.cn] || { set: '', act: '' };
            const changed = (v.set !== edi) || (v.act !== edi);
            return (
              <div key={c.cn} className="grid grid-cols-[1fr_58px_72px_72px] gap-1 items-center py-1 border-b border-slate-800/50">
                <div className="min-w-0">
                  <div className="text-[12px] mono text-slate-200 truncate">{c.cn}</div>
                  <div className="text-[10px] text-slate-600">
                    {[c.bay, c.row, c.tier].filter(Boolean).join('/')}
                    {v.src === 'photo' && <span className="text-violet-400 ml-1">📷</span>}
                    {changed && <span className="text-amber-400 ml-1">수정</span>}
                  </div>
                </div>
                <div className="text-[12px] mono text-center text-slate-500">{edi || '—'}</div>
                <input value={v.set} onChange={(e) => setField(c.cn, 'set', e.target.value)}
                  inputMode="text" placeholder="—"
                  className="bg-slate-800 border border-slate-700 focus:border-cyan-600 rounded px-1 py-1.5 text-[12px] mono text-center text-cyan-200 focus:outline-none w-full"/>
                <input value={v.act} onChange={(e) => setField(c.cn, 'act', e.target.value)}
                  inputMode="text" placeholder="—"
                  className="bg-slate-800 border border-slate-700 focus:border-emerald-600 rounded px-1 py-1.5 text-[12px] mono text-center text-emerald-200 focus:outline-none w-full"/>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-slate-800 flex items-center gap-2">
          <button onClick={() => onClose?.(false)} className="px-3 py-2 rounded-lg text-[12px] bg-slate-800 text-slate-400" style={{ minHeight: 44 }}>나중에</button>
          <button onClick={save} disabled={!!busy}
            className="flex-1 px-3 py-2 rounded-lg text-[13px] font-bold bg-cyan-700 hover:bg-cyan-600 text-white flex items-center justify-center gap-1 disabled:opacity-50"
            style={{ minHeight: 44 }}>
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4"/>}
            확인 완료 ({list.length}대)
          </button>
        </div>
      </div>
    </div>
  );
}
