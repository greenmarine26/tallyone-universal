// V9.20: 배 옆모습(종단면) 프로파일 뷰 — 3D 카드뷰 대체 (사용자 선택: 프로파일 방향)
//   V9.20-01: 40/20 구분 — x축을 20ft 슬롯(홀수 베이)으로 깔고, 짝수 베이(40ft)는 두 슬롯을
//   차지하는 넓은 칸으로 그림(물리 그대로). 상단 여백 = 베이별 특수화물 아이콘(❄RF ⚠DG ⊞FR △OT ▣TK).
//   셀 = (베이,티어) 집계: 숫자=컨 수, 초록=완료, 모드색=미완료, 회색=통과. 베이 클릭 → 2D 이동.
//   진실원: 사전 tiers, 없으면 tier>=60 데크 폴백. 베이 홀짝 = 20/40 (베이매트릭스가 진실).
import React, { useMemo } from 'react';
import { isPyeongtaekPort, isReeferContainer } from '../utils.js';

export default function ShipProfileView({
  containers = [], dictBaysSummary = {}, mode = 'discharge',
  compMap = {}, xrayMap = {}, onPickBay,
}) {
  const dict = useMemo(() => {
    const m = {};
    const arr = Array.isArray(dictBaysSummary) ? dictBaysSummary : Object.values(dictBaysSummary || {});
    for (const b of arr) {
      if (!b) continue;
      const n = parseInt(b.bayNo ?? b.bayNum ?? b.bay, 10);
      if (!Number.isFinite(n)) continue;
      m[n] = {
        deck: new Set((b.deckTiers || []).map(Number).filter(Number.isFinite)),
        hold: new Set((b.holdTiers || []).map(Number).filter(Number.isFinite)),
      };
    }
    return m;
  }, [dictBaysSummary]);

  const model = useMemo(() => {
    const cell = {};              // `${bay}|${tier}` → {n, done, ptk, xray}
    const spec = {};              // bay → {rf, dg, fr, ot, tk}
    const bays = new Set();
    const deckT = new Set(), holdT = new Set();
    for (const c of containers) {
      if (!c || !c.cn || !c.bay) continue;
      const bn = parseInt(c.bay, 10);
      const tn = parseInt(c.tier, 10);
      if (!Number.isFinite(bn) || bn >= 99 || !Number.isFinite(tn)) continue;
      bays.add(bn);
      const d = dict[bn];
      const isDeck = d ? d.deck.has(tn) : tn >= 60;
      (isDeck ? deckT : holdT).add(tn);
      const k = `${bn}|${tn}`;
      const e = (cell[k] ||= { n: 0, done: 0, ptk: 0, xray: 0 });
      e.n += 1;
      if (compMap[c.cn]) e.done += 1;
      if (xrayMap[c.cn]) e.xray += 1;
      const port = mode === 'discharge' ? c.pod : c.pol;
      if (isPyeongtaekPort(port)) e.ptk += 1;
      // 특수화물 (상단 아이콘) — 리퍼/DG/FR/OT/TK
      const sp = (spec[bn] ||= { rf: 0, dg: 0, fr: 0, ot: 0, tk: 0 });
      if (isReeferContainer(c)) sp.rf += 1;
      if (c.dg) sp.dg += 1;
      if (c.fr) sp.fr += 1;
      if (c.ot) sp.ot += 1;
      if (c.tk) sp.tk += 1;
    }
    for (const bn of Object.keys(dict)) bays.add(parseInt(bn, 10));
    // 20ft 슬롯 축(홀수 베이): 짝수 베이 bn은 bn-1·bn+1 두 슬롯을 차지
    const slotSet = new Set();
    for (const bn of bays) {
      if (bn % 2 === 1) slotSet.add(bn);
      else { slotSet.add(bn - 1); slotSet.add(bn + 1); }
    }
    const slots = [...slotSet].sort((a, b) => a - b);
    const bayList = [...bays].sort((a, b) => a - b);
    const deckTiers = [...deckT].sort((a, b) => b - a);
    const holdTiers = [...holdT].sort((a, b) => b - a);
    return { cell, spec, bayList, slots, deckTiers, holdTiers };
  }, [containers, dict, mode, compMap, xrayMap]);

  const { cell, spec, bayList, slots, deckTiers, holdTiers } = model;
  if (!bayList.length) {
    return <div className="text-slate-400 text-sm p-6 text-center">표시할 베이가 없습니다 (EDI/사전 확인)</div>;
  }

  // ── 좌표계: 선수(bow) 오른쪽 — 슬롯 번호가 작을수록 오른쪽
  const CW = 30, CH = 16, GAP = 3;
  const slotIdx = new Map(slots.map((s, i) => [s, i]));
  const sxOf = (slot) => 60 + (slots.length - 1 - slotIdx.get(slot)) * (CW + GAP);
  // 베이 → x·폭 (짝수=두 슬롯 스팬: 화면상 왼쪽 슬롯은 큰 번호 bn+1)
  const geo = (bn) => (bn % 2 === 1)
    ? { x: sxOf(bn), w: CW }
    : { x: sxOf(bn + 1), w: CW * 2 + GAP };

  const specH = 34;                                    // 상단 특수화물 아이콘 밴드
  const yDeckTop = 24 + specH;
  const deckH = deckTiers.length * CH;
  const yHatch = yDeckTop + deckH + 4;
  const yHoldTop = yHatch + 8;
  const holdH = holdTiers.length * CH;
  const H = yHoldTop + holdH + 46;
  const W = 60 + slots.length * (CW + GAP) + 90;

  const modeFill = mode === 'discharge' ? '#0284c7' : '#d97706';
  const cellRect = (bn, tn, y) => {
    const e = cell[`${bn}|${tn}`];
    const { x, w } = geo(bn);
    if (!e) return null;                               // 빈 (베이,티어)는 안 그림 — 40/20 겹침 방지
    const allDone = e.done >= e.n && e.n > 0;
    const fill = e.ptk === 0 ? '#475569' : allDone ? '#059669' : modeFill;
    return (
      <g key={`${bn}|${tn}`}>
        <rect x={x} y={y} width={w} height={CH} fill={fill} stroke={e.xray ? '#facc15' : '#0f172a'} strokeWidth={e.xray ? 1.5 : 0.5} rx="1.5" />
        <text x={x + w / 2} y={y + CH / 2 + 3.5} textAnchor="middle" fontSize="9" fontWeight="700"
              fill={allDone ? '#d1fae5' : '#f8fafc'}>{allDone ? `✓${e.n}` : e.n}</text>
      </g>
    );
  };
  // 빈 격자 배경 (슬롯 축 기준 — 구조감)
  const bgRect = (slot, y) => (
    <rect key={`bg${slot}|${y}`} x={sxOf(slot)} y={y} width={CW} height={CH} fill="#0f172a" stroke="#1e293b" strokeWidth="0.5" />
  );

  // 특수화물 아이콘 (베이 상단) — 있는 것만 위로 쌓음
  const SPEC = [
    ['rf', '❄', '#22d3ee'], ['dg', '⚠', '#f87171'], ['fr', '⊞', '#c084fc'],
    ['ot', '△', '#e879f9'], ['tk', '▣', '#fb923c'],
  ];
  const specIcons = (bn) => {
    const sp = spec[bn];
    if (!sp) return null;
    const items = SPEC.filter(([k]) => sp[k] > 0);
    if (!items.length) return null;
    const { x, w } = geo(bn);
    return items.slice(0, 3).map(([k, glyph, color], i) => (
      <text key={`${bn}${k}`} x={x + w / 2} y={yDeckTop - 8 - i * 11} textAnchor="middle"
            fontSize="9" fontWeight="800" fill={color}>{glyph}{sp[k]}</text>
    ));
  };

  const xL = 46, xR = 60 + slots.length * (CW + GAP) + 14;
  const yBot = yHoldTop + holdH + 14;
  const hull = `M ${xL} ${yHatch - 2} L ${xL} ${yBot - 8} Q ${xL} ${yBot} ${xL + 16} ${yBot} L ${xR - 34} ${yBot} Q ${xR + 24} ${yBot - 6} ${xR + 30} ${yHatch - 2}`;

  return (
    <div className="overflow-auto">
      <svg viewBox={`0 0 ${W + 40} ${H}`} className="w-full min-w-[760px]" style={{ maxHeight: '74vh' }}>
        <path d={hull} fill="none" stroke="#334155" strokeWidth="2.5" />
        <line x1={xL - 30} y1={yHatch - 2} x2={xR + 32} y2={yHatch - 2} stroke="#64748b" strokeWidth="2" strokeDasharray="6 3" />
        <text x={xR + 26} y={yBot + 12} textAnchor="end" fontSize="9" fill="#64748b">▶ 선수</text>

        {deckTiers.map((t, r) => (
          <text key={`dt${t}`} x={40} y={yDeckTop + r * CH + CH / 2 + 3} textAnchor="end" fontSize="8.5" fill="#7dd3fc">{String(t).padStart(2, '0')}</text>
        ))}
        {holdTiers.map((t, r) => (
          <text key={`ht${t}`} x={40} y={yHoldTop + r * CH + CH / 2 + 3} textAnchor="end" fontSize="8.5" fill="#a5b4fc">{String(t).padStart(2, '0')}</text>
        ))}

        {/* 빈 격자(슬롯) → 40ft(넓은 칸) → 20ft 순서로 겹침 */}
        {slots.map((s) => deckTiers.map((t, r) => bgRect(s, yDeckTop + r * CH)))}
        {slots.map((s) => holdTiers.map((t, r) => bgRect(s, yHoldTop + r * CH)))}
        {bayList.filter((b) => b % 2 === 0).map((bn) => (
          <g key={bn} className="cursor-pointer" onClick={() => onPickBay?.(bn)}>
            {deckTiers.map((t, r) => cellRect(bn, t, yDeckTop + r * CH))}
            {holdTiers.map((t, r) => cellRect(bn, t, yHoldTop + r * CH))}
            {specIcons(bn)}
          </g>
        ))}
        {bayList.filter((b) => b % 2 === 1).map((bn) => (
          <g key={bn} className="cursor-pointer" onClick={() => onPickBay?.(bn)}>
            {deckTiers.map((t, r) => cellRect(bn, t, yDeckTop + r * CH))}
            {holdTiers.map((t, r) => cellRect(bn, t, yHoldTop + r * CH))}
            {specIcons(bn)}
          </g>
        ))}

        {/* 슬롯(홀수 베이) 라벨 + 클릭 */}
        {slots.map((s) => (
          <g key={`lb${s}`} className="cursor-pointer" onClick={() => onPickBay?.(s)}>
            <text x={sxOf(s) + CW / 2} y={H - 22} textAnchor="middle" fontSize="9" fontWeight="800"
                  fill="#e2e8f0">{String(s).padStart(2, '0')}</text>
            <rect x={sxOf(s)} y={yDeckTop - specH} width={CW} height={H - yDeckTop + specH - 22} fill="transparent" />
          </g>
        ))}

        <g fontSize="8.5" fill="#94a3b8">
          <rect x={60} y={H - 12} width="10" height="8" fill={modeFill} rx="1.5" /><text x={74} y={H - 5}>미완료</text>
          <rect x={112} y={H - 12} width="10" height="8" fill="#059669" rx="1.5" /><text x={126} y={H - 5}>완료</text>
          <rect x={158} y={H - 12} width="10" height="8" fill="#475569" rx="1.5" /><text x={172} y={H - 5}>통과</text>
          <rect x={204} y={H - 12} width="10" height="8" fill="#0f172a" stroke="#facc15" strokeWidth="1.5" rx="1.5" /><text x={218} y={H - 5}>XRAY</text>
          <rect x={252} y={H - 12} width="20" height="8" fill="#0f172a" stroke="#64748b" strokeWidth="1" rx="1.5" /><text x={276} y={H - 5}>넓은 칸=40ft</text>
          <text x={344} y={H - 5} fill="#22d3ee">❄RF</text>
          <text x={372} y={H - 5} fill="#f87171">⚠DG</text>
          <text x={402} y={H - 5} fill="#c084fc">⊞FR</text>
          <text x={430} y={H - 5} fill="#e879f9">△OT</text>
          <text x={458} y={H - 5} fill="#fb923c">▣TK</text>
        </g>
      </svg>
    </div>
  );
}
