// V9.22: RZOR 덱 스토우지 플랜 뷰 — LOLO 선박용 카고플랜 (선사 rzdf 플랜 자동 파싱분)
//   덱 칩 선택 → CSS grid. 셀: 끝4 + 규격, 완료=초록, 리퍼=청록 테두리, 긴급/활어 배지.
//   셀 클릭 → 컨 상세(기존 모달).
import React, { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { fbAssignDeckSlot } from '../firebase.js';

export default function DeckPlanView({ plan, containers = [], compMap = {}, xrayMap = {}, onOpenContainer, voyageKey, mode, inspector }) {
  const decks = plan?.decks || [];
  const [sel, setSel] = useState(0);
  const [loloOnly, setLoloOnly] = useState(false);   // V9.55: 갠트리(LO/LO) 분만 보기
  const byCn = useMemo(() => {
    const m = {};
    for (const c of containers) if (c && c.cn) m[c.cn] = c;
    return m;
  }, [containers]);
  if (!decks.length) return null;
  const d = decks[Math.min(sel, decks.length - 1)];
  const conts = d.slots.filter((s) => !s.empty);
  const done = conts.filter((s) => compMap[s.cn]).length;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 mb-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-sm font-black text-cyan-200 flex items-center gap-1">
          <Layers className="w-4 h-4" /> 덱 플랜{plan.voy ? ` · ${plan.voy}` : ''}
        </span>
        {decks.map((dk, i) => (
          <button key={dk.deck} onClick={() => setSel(i)}
            className={`px-2.5 py-1 rounded text-xs font-black ${i === sel ? 'bg-cyan-600 text-cyan-50' : 'bg-slate-800 text-slate-300'}`}>
            {dk.deck}덱 {dk.slots.filter((s) => !s.empty && compMap[s.cn]).length}/{dk.slots.filter((s) => !s.empty).length}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-400">이 덱 {done}/{conts.length} 완료 · 빈자리 {d.slots.length - conts.length}</span>
        {/* V9.55: 갠트리(LO/LO) 분만 보기 — 크레인으로 검수하는 건 이것뿐이다 */}
        {(d.lolo > 0) && (
          <button onClick={() => setLoloOnly(!loloOnly)}
            className={`px-2 py-1 rounded text-[11px] font-black border ${loloOnly
              ? 'bg-lime-600 border-lime-400 text-lime-50'
              : 'bg-slate-800 border-lime-700/60 text-lime-300'}`}>
            🏗 갠트리 {d.lolo}van{loloOnly ? ' 만 보는 중' : ''}
          </button>
        )}
      </div>
      {/* V9.54: 도면과 같은 방향으로 읽는다 — 줄은 좌현(부두)→우현, 칸은 선미(램프)→선수 */}
      <div className="text-[10px] text-slate-500 mb-1">
        ↕ 줄 1~{d.lines || d.rows} <span className="text-slate-600">(1=좌현·부두쪽)</span>
        <span className="mx-2 text-slate-700">|</span>
        ↔ 칸 1~{d.colsN || d.cols} <span className="text-slate-600">(1=선미·램프쪽 → 선수)</span>
      </div>
      <div className="overflow-auto">
        <div className="grid gap-0.5 min-w-[720px]"
             style={{ gridTemplateColumns: `repeat(${d.cols}, minmax(30px, 1fr))`, gridTemplateRows: `repeat(${d.rows}, 58px)` }}>
          {d.slots.map((s, si) => {
            // V9.22-02: 빈자리 — 선적 시 탭해서 컨 지정 (assign 맵), 재탭 해제
            if (s.empty) {
              if (loloOnly) return null;   // V9.55
              const slotKey = `${d.deck}-${s.ri}-${s.ci}`;
              const asg = plan.assign && plan.assign[slotKey];
              return (
                <button key={`e${si}`}
                  title={s.pos || ''}
                  onClick={async () => {
                    if (!voyageKey) return;
                    if (asg) {
                      if (window.confirm(`${asg.cn} 지정을 해제할까요?`)) await fbAssignDeckSlot(voyageKey, mode, slotKey, null);
                      return;
                    }
                    const q = window.prompt('이 자리에 실을 컨번호(전체 또는 끝 4자리):');
                    if (!q) return;
                    const qq = q.trim().toUpperCase();
                    let cn = qq;
                    if (!/^[A-Z]{4}\d{7}$/.test(qq)) {
                      const hits = containers.filter((c) => c.cn && c.cn.endsWith(qq));
                      if (hits.length === 1) cn = hits[0].cn;
                      else { alert(hits.length ? `끝자리 일치 ${hits.length}건 — 전체 번호로 입력하세요` : '일치하는 컨 없음'); return; }
                    }
                    await fbAssignDeckSlot(voyageKey, mode, slotKey, { cn, by: inspector || '', at: Date.now() });
                  }}
                  className={`rounded-sm border border-dashed text-center overflow-hidden leading-tight
                    ${asg ? 'bg-amber-900/70 border-amber-400' : 'bg-slate-800/40 border-slate-600'}`}
                  style={{ gridColumn: `${s.ci + 1} / span ${s.span}`, gridRow: `${s.ri + 1}` }}>
                  {asg
                    ? <div className="text-[10px] font-black mono text-amber-200 truncate">📌{asg.cn.slice(-4)}<div className="text-[8px] text-amber-300/80">{asg.cn.slice(0,4)}</div></div>
                    : <div className="text-[9px] text-slate-500">빈자리{s.line ? <div className="text-[8px] mono text-slate-600">{s.line}-{s.col}</div> : null}</div>}
                </button>
              );
            }
            if (loloOnly && !s.lolo) return null;   // V9.55: 갠트리 분만 보기
            const isDone = !!compMap[s.cn];
            const c = byCn[s.cn];   // V9.22-01: 리스트(records) 정보 합류 — 실번호·온도·DG·POD (사용자 요청)
            const fe = (c && (c.fe === 'F' || c.fe === 'E')) ? c.fe : s.fe;
            const isRf = /RH|RF/.test(s.iso) || (c && c.rf);
            const isDg = !!(c && c.dg);
            const isXray = !!xrayMap[s.cn];
            const tmp = c && c.tmp != null && String(c.tmp).trim() !== '' ? String(c.tmp) : '';
            const sl = c && c.sl ? String(c.sl) : (c && c.eseal ? String(c.eseal) : '');
            const marks = [isRf ? (tmp ? `❄${tmp}` : '❄') : '', isDg ? '⚠DG' : '',
                           s.flags && s.flags.length ? s.flags.join('·') : ''].filter(Boolean).join(' ');
            return (
              <button key={`${s.cn}${s.ri}${s.ci}`}
                title={s.pos || ''}   /* V9.54: 자리 표기 — "D덱 3줄 5칸" */
                onClick={() => onOpenContainer?.(c || { cn: s.cn, iso: String(s.iso || '').replace(/\s/g, ''), fe, pos: s.pos, tier: s.tier, row: s.row, bay: s.bay })}  /* V9.57(I11): s.iso null 가드 — 플랜에 iso 없는 슬롯 클릭 시 크래시 방지 */
                className={`rounded-sm border text-left px-1 py-0.5 overflow-hidden leading-tight
                  ${isDone ? 'bg-emerald-800/90 border-emerald-500' : fe === 'E' ? 'bg-slate-700/80 border-slate-500' : 'bg-sky-900/80 border-sky-600'}
                  ${isRf ? 'ring-1 ring-cyan-400' : ''} ${isXray ? 'ring-2 ring-yellow-400' : ''}
                  ${s.lolo ? 'ring-2 ring-lime-400' : ''} ${s.dbl ? 'ring-2 ring-amber-300' : ''}`}
                style={{ gridColumn: `${s.ci + 1} / span ${s.span}`, gridRow: `${s.ri + 1}` }}>
                <div className="text-[10px] font-black mono text-slate-100 truncate">
                  {s.lolo ? <span className="text-lime-300">🏗</span> : null}{s.dbl ? <span className="text-amber-300">⇅</span> : null}{s.cn.slice(-4)}{isDone ? ' ✓' : ''}{marks ? <span className="text-cyan-300 font-bold"> {marks}</span> : null}
                </div>
                <div className="text-[8.5px] text-slate-300 truncate">{s.iso} {fe}</div>
                {s.line ? <div className="text-[8px] mono text-slate-400/90 truncate">{s.line}줄 {s.col}칸</div> : null}
                {sl ? <div className="text-[8.5px] mono text-amber-200/90 truncate">🔒{sl}</div> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-3 mt-2 text-[10px] text-slate-400 flex-wrap">
        <span><span className="inline-block w-2.5 h-2.5 bg-sky-900 border border-sky-600 rounded-sm mr-1" />풀</span>
        <span><span className="inline-block w-2.5 h-2.5 bg-slate-700 border border-slate-500 rounded-sm mr-1" />엠티</span>
        <span><span className="inline-block w-2.5 h-2.5 bg-emerald-800 border border-emerald-500 rounded-sm mr-1" />완료</span>
        <span><span className="inline-block w-2.5 h-2.5 border border-cyan-400 rounded-sm mr-1" />리퍼</span>
        <span><span className="inline-block w-2.5 h-2.5 border-2 border-yellow-400 rounded-sm mr-1" />X-RAY</span>
        <span><span className="inline-block w-2.5 h-2.5 border border-dashed border-slate-500 rounded-sm mr-1" />빈자리(탭=지정)</span>
        <span><span className="inline-block w-2.5 h-2.5 bg-amber-900 border border-amber-400 rounded-sm mr-1" />📌지정됨</span>
        <span><span className="inline-block w-2.5 h-2.5 border-2 border-lime-400 rounded-sm mr-1" />🏗갠트리(落地·LO/LO)</span>
        <span><span className="inline-block w-2.5 h-2.5 border-2 border-amber-300 rounded-sm mr-1" />⇅双背(2단)</span>
      </div>
    </div>
  );
}
