// 베이 격자 편집기 (공용) — V9.07 신규
//   단독 선적플랜 편집기(planedit.html)에서 검증된 조작 방식을 검수앱으로 들여온 것.
//   저장 대상만 다르게 두 곳이 이 컴포넌트를 공유한다:
//     · ChiefBayEdit    — 실체위치(bay_actual) 정정
//     · LoadingPlanEdit — 선적 확정 플랜(planDraft → ediContainers)
//
// 확정된 조작 규칙 (단독본 V9.08~V9.14 실사용 검증):
//   · 격자는 베이매트릭스 기준 — 빈 슬롯도 전부 보이고, 그 자리로 옮길 수 있다
//   · 빈 칸 → 이동 / 컨 있는 칸 → 자리 맞교환
//   · 여러 대 선택 후 하나를 끌면 전체가 상대 위치 그대로 이동 (원자적)
//   · 셀 클릭 = 선택 토글, Shift+영역 = 추가, Ctrl/⌘+영역 = 제외
//   · 격자 기하는 편집 시작 시점으로 고정 (옮길 때마다 재계산되면 셀이 틀어짐)
//   · 드래그 하이라이트는 DOM 클래스 직접 처리 (리렌더 0) + 항상 한 칸만
//   · 상태 클래스는 크기에 영향 주는 속성 금지 (padding/border 변경 → 행 재배분)
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Undo2 } from 'lucide-react';
import { getShipBayDictData } from '../shipStructure.js';
import { enrichBayDef } from '../bayDictAutoEnrich.js';
import { isoToLabel, buildContainerColorMap, getContainerColorKey, isPyeongtaekPort } from '../utils.js';
import { autoPairBays, generatePdfBays, buildPosMap, computeBayRenderData, defaultGetSelfMark } from '../cargoPlanCore.js';
import { BayBoxV2, CARGO_V2_CSS } from './PrintableCargoPlanV2.jsx';
import * as P from '../planEditCore.js';

export const BGE_CSS = `
.bge-overlay{position:fixed;inset:0;background:#0f172a;z-index:10000;display:flex;flex-direction:column;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic','맑은 고딕',sans-serif}
/* 카고플랜은 편집기 위로 — .cpv2-overlay 기본 z-index 50은 .bge-overlay 10000에 묻힌다.
   이 규칙은 편집기가 떠 있는 동안에만 주입되므로 다른 화면의 쌓임 순서에 영향 없음 */
.cpv2-overlay{z-index:10050 !important}
.bge-head{display:flex;align-items:center;gap:8px;padding:0 12px;height:44px;flex:0 0 44px;background:#0b1220;border-bottom:1px solid #1e293b;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;white-space:nowrap}
.bge-head h1{font-size:14px;margin:0;font-weight:800}
.bge-head>*{flex:0 0 auto}
.bge-badge{font-size:11px;background:#1e293b;border:1px solid #334155;border-radius:4px;padding:2px 7px;color:#94a3b8}
.bge-badge.warn{background:#78350f;border-color:#b45309;color:#fed7aa}
.bge-btn{padding:5px 10px;border-radius:5px;font-size:12px;font-weight:700;border:1px solid #334155;background:#1e293b;color:#cbd5e1;cursor:pointer}
.bge-btn:hover:not(:disabled){background:#334155}
.bge-btn:disabled{opacity:.4;cursor:default}
.bge-btn.p{background:#2563eb;border-color:#2563eb;color:#fff}
.bge-btn.g{background:#059669;border-color:#059669;color:#fff}
.bge-btn.r{background:#b91c1c;border-color:#b91c1c;color:#fff}
.bge-stats{display:flex;gap:12px;padding:0 12px;height:30px;flex:0 0 30px;background:#0f172a;border-bottom:1px solid #1e293b;font-size:12px;flex-wrap:nowrap;align-items:center;overflow:hidden;white-space:nowrap}
.bge-stats b{color:#f8fafc;font-size:13px}
.bge-msg{margin-left:auto;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;max-width:44%;flex-shrink:1}
.bge-nav{display:flex;gap:4px;flex-wrap:wrap;padding:5px 10px;min-height:34px;max-height:78px;flex:0 0 auto;background:#0b1220;overflow-y:auto;overflow-x:hidden;border-bottom:1px solid #1e293b;align-content:flex-start}
.bge-nav button{padding:4px 9px;border-radius:5px;font-size:12px;font-weight:700;border:1px solid #334155;background:#1e293b;color:#cbd5e1;cursor:pointer}
.bge-nav button.on{background:#2563eb;color:#fff;border-color:#2563eb}
.bge-nav button.chg{border-color:#f59e0b;border-width:2px}
.bge-body{flex:1;display:flex;min-height:0}
.bge-stage{flex:1;overflow:auto;padding:10px;background:#1e293b;position:relative}
.bge-sheet{background:#fff;border-radius:6px;padding:10px;color:#111;max-width:1180px;min-width:900px;margin:0 auto 12px;display:flex;flex-direction:column;height:calc(100vh - 138px);min-height:480px}
.bge-sheet:last-child{margin-bottom:0}
.bge-sheet-body{flex:1;display:flex;flex-direction:column;gap:8px;min-height:0}
.bge-boxwrap{flex:1 1 0;min-height:0;display:flex;flex-direction:column;border:1px solid #111;border-radius:3px;overflow:hidden}
.bge-boxh{font-size:12px;font-weight:800;color:#334155;background:#f1f5f9;padding:2px 0;text-align:center;flex-shrink:0;border-bottom:1px solid #cbd5e1}
.bge-boxbody{flex:1 1 0;min-height:0;display:flex;flex-direction:column;padding:3px}
.bge-side{width:258px;background:#0f172a;border-left:1px solid #334155;display:flex;flex-direction:column}
.bge-tabs{display:flex;border-bottom:1px solid #334155}
.bge-tabs button{flex:1;padding:7px 2px;font-size:11.5px;font-weight:800;background:#0b1220;border:none;color:#94a3b8;cursor:pointer;white-space:nowrap}
.bge-tabs button.on{background:#1e293b;color:#e2e8f0}
.bge-drop{margin:8px;border:2px dashed #38bdf8;border-radius:6px;padding:11px;text-align:center;font-size:12px;color:#7dd3fc;line-height:1.4}
.bge-drop.over{background:#0c4a6e;color:#e0f2fe}
.bge-list{flex:1;overflow:auto;padding:8px}
.bge-chip{background:#1e293b;border:1px solid #475569;border-radius:5px;padding:6px 8px;margin-bottom:5px;font-size:11px;cursor:grab;font-family:ui-monospace,monospace}
.bge-chg{background:#1e293b;border:1px solid #475569;border-left:3px solid #f59e0b;border-radius:4px;padding:5px 7px;margin-bottom:4px;font-size:11px}
.bge-chg b{font-family:ui-monospace,monospace}
.bge-chg i{font-style:normal;color:#94a3b8}
.bge-rubber{position:absolute;border:1.5px solid #2563eb;background:rgba(37,99,235,.15);pointer-events:none;z-index:5}
.bge-empty-msg{flex:1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;text-align:center;padding:30px;line-height:1.7}

/* 편집 오버레이 — 상태 클래스는 색만 바꾼다 (크기 속성 금지) */
.bge-edit .cpv2-cell{font-size:clamp(7px,0.68vw,10px) !important;line-height:1.05;border:1px solid #94a3b8 !important;box-sizing:border-box;flex:1 1 0 !important;min-width:0 !important;max-width:none !important;overflow:hidden}
.bge-edit .cpv2-bay-section{padding:1px}
.bge-edit .cpv2-cell.bge-fill{cursor:grab;background:#fff;border-color:#1e293b !important}
.bge-edit .cpv2-cell.bge-fill:active{cursor:grabbing}
.bge-edit .cpv2-cell.bge-lock{background:#cbd5e1;color:#475569;cursor:not-allowed;border-color:#64748b !important}
.bge-edit .cpv2-cell.bge-chgd{box-shadow:inset 0 0 0 2px #f59e0b}
.bge-edit .cpv2-cell.bge-picked{box-shadow:inset 0 0 0 3px #1d4ed8;background:#dbeafe !important}
.bge-edit .cpv2-cell.bge-chgd.bge-picked{box-shadow:inset 0 0 0 3px #1d4ed8,inset 0 0 0 5px #f59e0b}
.bge-edit .cpv2-cell.bge-over{background:#fde68a !important;border-color:#d97706 !important}
.bge-edit .cpv2-cell.bge-empty{cursor:copy;background:#fefefe;border-style:dashed !important;border-color:#cbd5e1 !important}
.bge-edit .cpv2-cell.bge-empty:hover{background:#e0f2fe}
.bge-edit .cpv2-cell.bge-open{background:#ecfccb;border-color:#84cc16 !important}
.bge-edit .cpv2-cell.bge-open:hover{background:#d9f99d}
.bge-pick-back{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px}
.bge-pick{background:#0b1220;border:1px solid #334155;border-radius:8px;width:min(420px,96vw);max-height:82vh;display:flex;flex-direction:column}
.bge-pick-h{padding:10px 12px;border-bottom:1px solid #334155;color:#e2e8f0;font-weight:800;font-size:14px;display:flex;flex-direction:column;gap:3px}
.bge-pick-h span{color:#a3e635;font-weight:600;font-size:11.5px}
.bge-pick-list{overflow:auto;padding:6px;display:flex;flex-direction:column;gap:5px}
.bge-pick-item{text-align:left;background:#1e293b;border:1px solid #334155;border-radius:6px;padding:9px 10px;color:#e2e8f0;font-size:13px;cursor:pointer;display:flex;flex-direction:column;gap:2px}
.bge-pick-item:hover{background:#334155}
.bge-pick-item span{color:#94a3b8;font-size:11px}
.bge-pick-item em{color:#fbbf24;font-style:normal}
/* 옆 짝수 베이가 차지한 자리 — 단독 홀수 박스에서만 생긴다. 표기는 카고플랜과 동일.
     bge-x      : 인접 40ft/45ft → 흰 배경에 X 글자 (카고플랜 각 베이와 같은 모양)
     bge-shadow : 인접 20ft      → 회색 빈 칸 (카고플랜과 같음)
   둘 다 배치 불가(드롭 차단). 크기에 영향 주는 속성은 쓰지 않는다 — 격자 기하 고정 규칙. */
.bge-edit .cpv2-cell.bge-x{background:#fff;border-color:#111 !important;cursor:not-allowed}
.bge-edit .cpv2-cell.bge-shadow{background:#e5e7eb !important;border-color:#9ca3af !important;cursor:not-allowed;color:transparent}
.bge-x-mark{font-weight:800;font-size:11px;color:#111;line-height:1}
.bge-edit .cpv2-cell.bge-x .bge-adjcn,.bge-edit .cpv2-cell.bge-shadow .bge-adjcn{color:#334155 !important;opacity:.85}
.bge-edit .cpv2-cell.bge-shadow{color:inherit !important}
.bge-cn{font-weight:800;font-size:9.5px;letter-spacing:-.3px;font-family:ui-monospace,monospace;display:block}
.bge-sub{font-size:8px;color:#64748b;display:block}
@media print{
  /* 인쇄 대상 확정 — CARGO_V2_CSS가 함께 주입되면서 그 안의
       body > *:not(.cpv2-overlay):not(.bd-print-modal){display:none}   (0,2,1)
     규칙이 편집기 오버레이까지 지운다. 종전 대응(body > #root{display:block})은
     우선순위 (1,0,1)로 이겨서 '본화면만' 남기는 바람에 뒤 화면이 인쇄됐다.
     클래스를 겹쳐 (0,3,1)~(0,4,1)을 확보해 결정적으로 이긴다. 소스 순서에 기대지 않는다. */
  body.bge-open.bge-open > *:not(.bge-overlay):not(.cpv2-overlay){display:none !important}
  body.bge-open.bge-open > .bge-overlay{display:flex !important}
  /* 카고플랜이 열려 있으면 인쇄 대상은 카고플랜 (cpv2 자체 인쇄 규칙이 처리) */
  body.bge-planopen.bge-planopen > .bge-overlay{display:none !important}
  .bge-head,.bge-stats,.bge-nav,.bge-side,.bge-noprint{display:none !important}
  .bge-overlay{position:static !important;background:#fff !important}
  .bge-stage{overflow:visible;padding:0;background:#fff}
  /* 베이 한 장씩 따로 인쇄 — 1과 (02)03을 각각 뽑을 수 있어야 한다 (사용자 확정 2026-07-26) */
  .bge-sheet{box-shadow:none;max-width:none;min-width:0;height:auto;margin:0;break-inside:avoid;page-break-inside:avoid;break-after:page;page-break-after:always}
  .bge-sheet:last-child{break-after:auto;page-break-after:auto}
  /* 브라우저 '배경 그래픽' 기본값이 꺼져 있으면 통과 고정분 회색이 날아간다 — 강제 출력 */
  .bge-sheet, .bge-sheet *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
}
@media (max-width:820px){
  .bge-body{flex-direction:column}
  .bge-side{width:100%;flex:0 0 auto;max-height:150px;border-left:none;border-top:1px solid #334155}
  .bge-sheet{min-width:0;height:auto;min-height:420px;padding:6px}
  /* V9.23-03: 폰에서 시트 머리글이 두세 줄로 늘어 베이탭을 밀어내던 것 — 한 줄로 줄인다 */
  .bge-sheet-title{font-size:11.5px !important;margin-bottom:3px !important;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis}
  .bge-boxh{font-size:11px;padding:1px 0}
  .bge-nav{max-height:64px;padding:4px 8px;gap:3px}
  .bge-nav button{padding:3px 7px;font-size:11.5px}
  .bge-stats{gap:8px;font-size:11px;overflow-x:auto}
  .bge-stage{padding:6px}
}
`;

const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const cnNorm = (s) => String(s || '').replace(/\s/g, '').toUpperCase();
const keyToNum = (k) => parseInt(String(k).startsWith('(') ? String(k).replace(/[()]/g, '').slice(2) : k, 10) || 0;
const keyLabel = (k) => { if (String(k).startsWith('(')) { const m = String(k).replace(/[()]/g, ''); return `(${m.slice(0, 2)})${m.slice(2)}`; } return String(k); };

/**
 * @param {object[]} containers  기준 위치가 반영된 컨 목록 (bay/row/tier)
 * @param {string[]} storageCns  처음부터 임시창고에 있는 컨
 * @param {string[]} lockedCns   이동 불가 컨 (미지정 시 평택분/쉬프팅 판정)
 * @param {(state)=>void} onSave 저장 — state.pos를 읽어 호출자가 처리
 */
export default function BayGridEditor({
  title = '베이 격자 편집', subtitle = '', voyageInfo = null,
  containers = [], storageCns = [], lockedCns = null, shiftCns = [],
  shipImo, shipName, mode = 'loading',
  saving = false, saveLabel = '저장', onSave, onClose,
  headerExtra = null, sideExtra = null, onStateChange = null,
  lockHint = '통과 고정분',
}) {
  const [state, setState] = useState(null);
  const [tick, setTick] = useState(0);
  const [selIdx, setSelIdx] = useState(0);
  const [tab, setTab] = useState('sel');
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [stgOver, setStgOver] = useState(false);
  const [picker, setPicker] = useState(null);   // V9.23-07: 빈 자리 → 놓을 컨 고르기
  const stageRef = useRef(null);
  const rubberStart = useRef(null);
  const [rubber, setRubber] = useState(null);
  const bump = () => setTick((t) => t + 1);

  // 편집 상태는 최초 1회만 만든다 (편집 중 부모 갱신에 흔들리지 않게)
  useEffect(() => {
    if (state || !containers.length) return;
    setState(P.buildState(containers, [], shiftCns, { storageCns, lockedCns }));
  }, [containers, state, storageCns, lockedCns, shiftCns]);

  useEffect(() => { if (state && onStateChange) onStateChange(state, tick); }, [state, tick, onStateChange]);

  // 인쇄 대상 판별용 표식 — 편집기가 떠 있는 동안에만 body에 붙는다
  useEffect(() => {
    document.body.classList.add('bge-open');
    return () => document.body.classList.remove('bge-open');
  }, []);

  const ediBayNums = useMemo(() => {
    const s = new Set();
    for (const c of containers) { const n = num(c.bay); if (n && n < 99) s.add(n); }
    return [...s].sort((a, b) => a - b);
  }, [containers]);

  const dictData = useMemo(() => {
    if (!containers.length || (!shipImo && !shipName)) return null;
    const base = getShipBayDictData(shipImo || '', shipName || '', { ediBayCount: ediBayNums.length, vslFull: shipName || '' });
    if (!base) return null;
    const en = enrichBayDef({ bayDef: base.bayDef }, base._v5Matrix, containers, base.source);
    return { ...base, bayDef: { ...en.bayDef, source: base.source } };
  }, [containers, shipImo, shipName, ediBayNums]);

  const matrixBays = useMemo(() => {
    if (!dictData) return [];
    const rawM = dictData?._v5Matrix?.matrixBays || [];
    const v2 = dictData.bayDef || {};
    const deckAll = v2.deckTiers || [], holdAll = v2.holdTiers || [];
    const summary = v2.baysSummary || [];
    const byBay = new Map();
    for (const s of summary) { const n = Number(s.bayNo); if (Number.isFinite(n)) byBay.set(n, s); }
    const ediT = new Map();
    for (const c of containers) {
      const b = Number(c.bay), t = Number(c.tier);
      if (!Number.isFinite(b) || !Number.isFinite(t)) continue;
      if (!ediT.has(b)) ediT.set(b, new Set());
      ediT.get(b).add(t);
    }
    let bays = rawM;
    if (bays.length === 0 && summary.length > 0) {
      bays = summary.map((s) => ({ bayNum: Number(s.bayNo), cells: [], hasHold: !!s.hasHold, hasDeck: s.hasDeck !== false, isStandalone: !!s.isStandalone }));
    }
    if (rawM.length > 0 && summary.length > 0) {
      if (dictData.source === 'user') {
        const allow = new Set(summary.map((s) => Number(s.bayNo)).filter(Number.isFinite));
        bays = rawM.filter((b) => allow.has(Number(b.bayNum)));
      } else {
        // 자동추출 사전은 v2가 v5보다 불완전할 수 있다 (홀수 베이 누락 → 페어 붕괴)
        const have = new Set(rawM.map((b) => Number(b.bayNum)));
        const extra = summary.map((s) => Number(s.bayNo)).filter((n) => Number.isFinite(n) && n > 0 && !have.has(n))
          .map((n) => ({ bayNum: n, cells: [], hasHold: !!byBay.get(n)?.hasHold, hasDeck: byBay.get(n)?.hasDeck !== false, isStandalone: !!byBay.get(n)?.isStandalone }));
        bays = [...rawM, ...extra].sort((a, b) => Number(a.bayNum) - Number(b.bayNum));
      }
    }
    return bays.filter((b) => Number(b.bayNum) < 99).map((b) => {
      const sm = byBay.get(b.bayNum);
      const tiers = ediT.get(b.bayNum); const et = tiers ? [...tiers] : [];
      const hasDeck = sm?.hasDeck !== undefined ? sm.hasDeck : (b.hasDeck !== false || et.some((t) => t >= 80));
      const hasHold = sm?.hasHold !== undefined ? sm.hasHold : (b.hasHold || et.some((t) => t < 80));
      const cells = b.cells ? [...b.cells].reverse() : [];
      const sDeck = (sm?.deckTiers?.length ? sm.deckTiers : (sm?.deckTiersLocal?.length ? sm.deckTiersLocal : null));
      const sHold = (sm?.holdTiers?.length ? sm.holdTiers : (sm?.holdTiersLocal?.length ? sm.holdTiersLocal : null));
      const deckTiers = hasDeck ? (sDeck ? sDeck.map(Number) : deckAll) : [];
      const holdTiers = hasHold ? (sHold ? sHold.map(Number) : holdAll) : [];
      const nD = deckTiers.length, nH = holdTiers.length;
      const sdc = sm?.deckCells?.length ? sm.deckCells : null, shc = sm?.holdCells?.length ? sm.holdCells : null;
      const deckCells = sdc ? sdc.slice(0, nD).map(Number) : (nD > 0 ? cells.slice(0, nD) : []);
      const holdCells = shc ? shc.slice(0, nH).map(Number) : (nH > 0 ? cells.slice(nD, nD + nH) : []);
      return { ...b, hasDeck, hasHold, deckCells, holdCells, deckTiers, holdTiers, isStandalone: sm?.isStandalone || b.isStandalone || false };
    });
  }, [dictData, containers]);

  const { trios, singles } = useMemo(() => (matrixBays.length ? autoPairBays(matrixBays) : { trios: [], singles: [] }), [matrixBays]);
  const pdfBays = useMemo(() => (matrixBays.length ? generatePdfBays(matrixBays, trios, singles) : {}), [matrixBays, trios, singles]);

  const pages = useMemo(() => {
    const list = [];
    trios.forEach(([top, pair]) => list.push({ key: pair, label: `${top}·${keyLabel(pair)}`, num: keyToNum(pair), boxKeys: [top, pair] }));
    singles.forEach((s) => list.push({ key: s, label: String(s), num: keyToNum(s), boxKeys: [s] }));
    return list.sort((a, b) => a.num - b.num);
  }, [trios, singles]);
  const page = pages[selIdx] || null;
  useEffect(() => { if (selIdx >= pages.length) setSelIdx(0); }, [pages, selIdx]);

  // 격자 기하는 편집 시작 시점 배치로 고정 — 옮길 때마다 재계산되면 셀이 틀어진다
  const basePosMap = useMemo(() => buildPosMap(containers), [containers]);
  const colorMap = useMemo(() => buildContainerColorMap(containers, mode), [containers, mode]);
  const pod = useMemo(() => {
    const c = {}; for (const x of containers) { const p = x.pod; if (p) c[p] = (c[p] || 0) + 1; }
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || 'KRPTK';
  }, [containers]);
  const getColorKey = useCallback((c) => getContainerColorKey(c, mode), [mode]);
  const getIsThrough = useCallback((c) => (mode === 'discharge' ? !isPyeongtaekPort(c.pod) : !(c._inList || isPyeongtaekPort(c.pol))), [mode]);

  const mk = useCallback((key) => (key && matrixBays.length
    ? computeBayRenderData(key, pdfBays, matrixBays, basePosMap, pod, defaultGetSelfMark, {}, getColorKey, getIsThrough, dictData?.bayDef, dictData?.code)
    : null), [pdfBays, matrixBays, basePosMap, pod, getColorKey, getIsThrough, dictData]);

  const boxes = useMemo(() => {
    if (!page || !state) return [];
    return page.boxKeys.map((k) => {
      const isPair = String(k).startsWith('(');
      const m = String(k).replace(/[()]/g, '');
      const even = isPair ? m.slice(0, 2) : null;
      const odd = isPair ? m.slice(2) : String(k);
      const bays = isPair ? [num(even), num(odd)] : [num(k)];
      const cellMap = {};
      // V9.07-05: 옆 짝수 베이 점유 맵. mark 'X'로 판정하면 안 된다 —
      //   'X'는 defaultGetSelfMark가 자기 컨의 POD 불일치에도 주는 값이라,
      //   컨을 옮기면 비운 자리가 잘못 막힌다. 현재 위치(state.pos)로 직접 계산한다.
      const adjMap = {}, adjCnMap = {}, adjBayMap = {};
      const oddNum = isPair ? null : num(k);
      for (const [cn, p] of Object.entries(state.pos)) {
        if (p.storage) continue;
        const b = num(p.bay);
        if (bays.includes(b)) { cellMap[`${p.tier}-${p.row}`] = cn; continue; }
        if (oddNum != null && (b === oddNum - 1 || b === oddNum + 1)) {
          const k2 = `${p.tier}-${p.row}`;
          adjMap[k2] = P.sizeOf(state.byCn.get(cn) || {}) === '20' ? '20' : '40';
          adjCnMap[k2] = cn;                       // V9.23-03: 누가 차지했는지 기억
          adjBayMap[k2] = p.bay;
        }
      }
      const data = mk(k);
      const mkSec = (rows) => {
        if (!rows || !rows.length) return null;
        const width = Math.max(...rows.map((r) => (r.cells || []).length));
        const cols = new Array(width).fill(null);
        for (const r of rows) (r.cells || []).forEach((c, i) => { if (cols[i] == null && c.rowLbl) cols[i] = c.rowLbl; });
        return { tiers: rows.map((r) => P.pad2(r.tier)), cols, active: rows.map((r) => (r.cells || []).map((c) => !!c.active)) };
      };
      return { key: k, label: keyLabel(k), even, odd, bays, cellMap, adjMap, adjCnMap, adjBayMap, data, sections: { deck: mkSec(data?.deckRows), hold: mkSec(data?.holdRows) } };
    });
  }, [page, state, mk, tick]);

  // V9.23-04: 격자에 안 나타나는 컨 찾기 (사용자 신고 — 놓였는데 보이지도 고치지도 못함)
  //   ① 좌표중복: 같은 bay/row/tier에 둘 이상 → cellMap이 덮어써 하나만 그려진다
  //   ② 격자 밖: 베이사전에 없는 베이·비활성 칸 → 어느 페이지에도 안 그려진다
  //   둘 다 편집기에서 손댈 방법이 없었다. 목록으로 꺼내 선택·보관할 수 있게 한다.
  const issues = useMemo(() => (state ? P.validate(state) : null), [state, tick]);

  const drawable = useMemo(() => {
    const ok = new Set();
    if (!state || !matrixBays.length) return ok;
    for (const pg of pages) {
      for (const k of pg.boxKeys) {
        const isPair = String(k).startsWith('(');
        const m = String(k).replace(/[()]/g, '');
        const bs = isPair ? [num(m.slice(0, 2)), num(m.slice(2))] : [num(k)];
        const d = mk(k);
        if (!d) continue;
        const active = new Set();
        for (const r of [...(d.deckRows || []), ...(d.holdRows || [])]) {
          for (const c of (r.cells || [])) if (c.active && c.rowLbl) active.add(`${P.pad2(r.tier)}-${c.rowLbl}`);
        }
        for (const [cn, pos2] of Object.entries(state.pos)) {
          if (pos2.storage || ok.has(cn)) continue;
          if (!bs.includes(num(pos2.bay))) continue;
          if (active.has(`${pos2.tier}-${pos2.row}`)) ok.add(cn);
        }
      }
    }
    return ok;
  }, [state, pages, mk, matrixBays, tick]);

  const hidden = useMemo(() => {
    // V9.23-06: 베이사전이 아직 없으면 '격자 밖' 판정 자체가 불가능하다.
    //   막으로 두면 사전 로딩 전에 전 컨이 '안 보임'으로 잡혀 겁을 준다(실측 390/405).
    if (!state || !matrixBays.length) return [];
    const dupCns = new Set();
    for (const d of (issues?.dup || [])) for (const cn of d.cns.slice(1)) dupCns.add(cn);
    const out = [];
    for (const [cn, pos2] of Object.entries(state.pos)) {
      if (pos2.storage) continue;
      const isDup = dupCns.has(cn);
      const offGrid = !drawable.has(cn);
      if (!isDup && !offGrid) continue;
      out.push({ cn, bay: pos2.bay, row: pos2.row, tier: pos2.tier,
                 why: isDup ? '좌표중복' : '격자 밖' });
    }
    return out.sort((a, b) => (a.bay + a.row + a.tier).localeCompare(b.bay + b.row + b.tier));
  }, [state, drawable, issues, matrixBays, tick]);

  // V9.23-07: 선적 안 된 자리를 먼저 보여 준다 (사용자 요구 2026-07-30).
  //   종전 흐름은 "임시창고 컨을 집어 좌표에 끌어다 놓기"라 폰에서 쓰기 어려웠다.
  //   뒤집는다 — 빈 자리를 목록으로 내고, 그 자리를 누르면 놓을 컨을 골라 준다.
  const openSlots = useMemo(() => {
    const out = [];
    if (!state || !matrixBays.length) return out;
    pages.forEach((pg, pi) => {
      for (const k of pg.boxKeys) {
        const isPair = String(k).startsWith('(');
        const m = String(k).replace(/[()]/g, '');
        const even = isPair ? m.slice(0, 2) : null;
        const odd = isPair ? m.slice(2) : String(k);
        const bays = isPair ? [num(even), num(odd)] : [num(k)];
        const oddNum = isPair ? null : num(k);
        const d = mk(k);
        if (!d) continue;
        const occ = new Set(), blocked = new Set();
        for (const [, pos2] of Object.entries(state.pos)) {
          if (pos2.storage) continue;
          const b = num(pos2.bay);
          const key = `${pos2.tier}-${pos2.row}`;
          if (bays.includes(b)) occ.add(key);
          else if (oddNum != null && (b === oddNum - 1 || b === oddNum + 1)) blocked.add(key);
        }
        for (const [secName, rows] of [['데크', d.deckRows], ['홀드', d.holdRows]]) {
          for (const r of (rows || [])) {
            for (const c of (r.cells || [])) {
              if (!c.active || !c.rowLbl) continue;
              const key = `${P.pad2(r.tier)}-${c.rowLbl}`;
              if (occ.has(key) || blocked.has(key)) continue;
              out.push({ page: pi, boxKey: k, label: keyLabel(k), even, odd,
                         sec: secName, row: c.rowLbl, tier: P.pad2(r.tier) });
            }
          }
        }
      }
    });
    return out;
  }, [state, pages, mk, matrixBays, tick]);

  // 베이별로 묶어 목록에 낸다 — 자리 하나하나보다 "어느 베이에 몇 자리"가 먼저 보여야 한다
  const openByBox = useMemo(() => {
    const m = new Map();
    for (const e of openSlots) {
      if (!m.has(e.boxKey)) m.set(e.boxKey, { label: e.label, page: e.page, slots: [] });
      m.get(e.boxKey).slots.push(e);
    }
    return [...m.entries()].map(([k, v]) => ({ boxKey: k, ...v }));
  }, [openSlots]);

  const stats = useMemo(() => (state ? P.summarize(state) : null), [state, tick]);
  const changes = useMemo(() => (state ? P.diffChanges(state) : []), [state, tick]);
  const changedSet = useMemo(() => new Set(changes.map((c) => c.cn)), [changes]);
  const stgList = useMemo(() => (state ? P.storageList(state) : []), [state, tick]);
  const changedBays = useMemo(() => {
    const s = new Set();
    if (state) for (const c of changes) { const p = state.pos[c.cn]; if (!p?.storage) s.add(num(p.bay)); }
    return s;
  }, [changes, state, tick]);
  const emptySlots = useMemo(() => {
    let n = 0;
    for (const b of boxes) {
      const rows = [...(b.data?.deckRows || []), ...(b.data?.holdRows || [])];
      for (const r of rows) for (const c of r.cells) if (c.active && !b.cellMap[`${P.pad2(r.tier)}-${c.rowLbl}`]) n++;
    }
    return n;
  }, [boxes]);

  const clearOver = useCallback(() => {
    document.querySelectorAll('.bge-edit .cpv2-cell.bge-over').forEach((el) => el.classList.remove('bge-over'));
  }, []);
  const toggleSel = useCallback((cn) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(cn)) n.delete(cn); else n.add(cn); return n; });
  }, []);
  const dropSel = useCallback((cn) => {
    setSelected((prev) => { const n = new Set(prev); n.delete(cn); return n; });
  }, []);

  const dragStart = (e, cn) => {
    if (state.locked.has(cn)) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', cn);
    e.dataTransfer.effectAllowed = 'move';
    if (!selected.has(cn)) setSelected(new Set());
  };

  const locate = (box, cn) => {
    const p = state.pos[cn];
    if (!p || p.storage || !box.bays.includes(num(p.bay))) return null;
    for (const [name, sec] of Object.entries(box.sections)) {
      if (!sec) continue;
      const ti = sec.tiers.indexOf(P.pad2(p.tier));
      const ci = sec.cols.indexOf(p.row);
      if (ti >= 0 && ci >= 0) return { name, sec, ti, ci };
    }
    return null;
  };

  const dropCell = (e, box, rowLbl, tier) => {
    e.preventDefault(); clearOver();
    const cn = e.dataTransfer.getData('text/plain');
    if (!cn || !state || !rowLbl) return;
    const targetBayOf = (c) => {
      if (!box.even) return box.odd;
      const sz = P.sizeOf(c);
      return (sz === '40' || sz === '45') ? box.even : box.odd;
    };

    if (selected.size > 1 && selected.has(cn)) {
      const anchor = locate(box, cn);
      const tgt = (() => {
        for (const [name, sec] of Object.entries(box.sections)) {
          if (!sec) continue;
          const ti = sec.tiers.indexOf(P.pad2(tier)), ci = sec.cols.indexOf(rowLbl);
          if (ti >= 0 && ci >= 0) return { name, sec, ti, ci };
        }
        return null;
      })();
      if (!anchor || !tgt) { setMsg('이동 불가: 기준 컨과 목적 칸을 격자에서 찾지 못했습니다'); return; }
      if (anchor.name !== tgt.name) { setMsg('이동 불가: 여러 대 이동은 데크↔홀드를 넘을 수 없습니다'); return; }
      const dT = tgt.ti - anchor.ti, dC = tgt.ci - anchor.ci;
      const sec = anchor.sec;
      const moves = [];
      for (const c of selected) {
        const L = locate(box, c);
        if (!L) { setMsg(`이동 불가: ${c}는 이 베이/섹션 밖입니다`); return; }
        if (L.name !== anchor.name) { setMsg('이동 불가: 선택분이 데크와 홀드에 걸쳐 있습니다'); return; }
        const nt = L.ti + dT, nc = L.ci + dC;
        if (nt < 0 || nt >= sec.tiers.length || nc < 0 || nc >= sec.cols.length) { setMsg(`이동 불가: ${c}가 격자 밖으로 나갑니다`); return; }
        if (!sec.active?.[nt]?.[nc]) { setMsg(`이동 불가: ${c}의 목적지(${sec.cols[nc]}열 ${sec.tiers[nt]}단)는 슬롯이 없습니다`); return; }
        moves.push({ cn: c, bay: targetBayOf(state.byCn.get(c)), row: sec.cols[nc], tier: sec.tiers[nt] });
      }
      const res = P.placeMany(state, moves);
      setMsg(res.ok ? `선택 ${res.moved}대 동시 이동 (상대 위치 유지)` : `이동 불가: ${res.reason}`);
      if (res.ok) setSelected(new Set());
      bump();
      return;
    }

    const opts = box.even ? { pairEven: box.even, pairOdd: box.odd } : {};
    const res = P.placeAt(state, cn, box.even || box.odd, rowLbl, tier, opts);
    setMsg(res.ok
      ? (res.swappedWith ? `${cn} ↔ ${res.swappedWith} 자리 맞교환` : `${cn} → ${P.pad2(rowLbl)}열 ${P.pad2(tier)}단 이동`)
      : `이동 불가: ${res.reason}`);
    bump();
  };

  const dropStorage = (e) => {
    e.preventDefault(); setStgOver(false); clearOver();
    const cn = e.dataTransfer.getData('text/plain');
    if (!cn || !state) return;
    const cns = selected.has(cn) ? [...selected] : [cn];
    const r = P.moveToStorage(state, cns);
    setMsg(`임시창고 보관 ${r.done.length}대${r.skipped.length ? ` (거부 ${r.skipped.length})` : ''}`);
    setSelected(new Set()); bump();
  };
  // V9.23-04: 목록에서 직접 보관 (안 보임 패널용)
  const sendCns = (cns) => {
    if (!state || !cns.length) return;
    const r = P.moveToStorage(state, cns);
    setMsg(`임시창고 보관 ${r.done.length}대${r.skipped.length ? ` (${lockHint} ${r.skipped.length} 제외)` : ''}`);
    setSelected(new Set()); bump();
  };
  const sendSelected = () => {
    const r = P.moveToStorage(state, [...selected]);
    setMsg(`임시창고 보관 ${r.done.length}대${r.skipped.length ? ` (${lockHint} ${r.skipped.length} 제외)` : ''}`);
    setSelected(new Set()); bump();
  };

  const stageDown = (e) => {
    if (e.button !== 0 || !stageRef.current) return;
    if (e.target.closest('[data-cn]')) return;
    const r = stageRef.current.getBoundingClientRect();
    // 시트가 세로로 쌓이면서 스테이지가 스크롤된다 — 절대배치 러버밴드는 스크롤량을 더해야 제자리에 그려진다
    const sl = stageRef.current.scrollLeft, st = stageRef.current.scrollTop;
    rubberStart.current = { x: e.clientX, y: e.clientY, rl: r.left - sl, rt: r.top - st, add: e.shiftKey, sub: e.ctrlKey || e.metaKey };
    setRubber({ left: e.clientX - r.left + sl, top: e.clientY - r.top + st, w: 0, h: 0 });
  };
  const stageMove = (e) => {
    if (!rubberStart.current) return;
    const s = rubberStart.current;
    setRubber({ left: Math.min(s.x, e.clientX) - s.rl, top: Math.min(s.y, e.clientY) - s.rt, w: Math.abs(e.clientX - s.x), h: Math.abs(e.clientY - s.y) });
  };
  const stageUp = (e) => {
    if (!rubberStart.current) return;
    const s = rubberStart.current; rubberStart.current = null; setRubber(null);
    const x1 = Math.min(s.x, e.clientX), y1 = Math.min(s.y, e.clientY);
    const x2 = Math.max(s.x, e.clientX), y2 = Math.max(s.y, e.clientY);
    if (x2 - x1 < 5 && y2 - y1 < 5) return;
    const found = new Set();
    stageRef.current?.querySelectorAll('[data-cn]').forEach((el) => {
      const cn = el.getAttribute('data-cn');
      if (!cn || state.locked.has(cn)) return;
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) found.add(cn);
    });
    if (!found.size) return;
    if (s.sub) setSelected((prev) => { const n = new Set(prev); let k = 0; for (const cn of found) if (n.delete(cn)) k++; setMsg(`영역 ${k}대 선택 해제 → 남은 ${n.size}대`); return n; });
    else if (s.add) setSelected((prev) => { const n = new Set(prev); for (const cn of found) n.add(cn); setMsg(`영역 ${found.size}대 추가 → 총 ${n.size}대`); return n; });
    else { setSelected(found); setTab('sel'); setMsg(`${found.size}대 선택 · 셀 클릭으로 하나씩 넣고 뺄 수 있습니다`); }
  };

  const resetAll = () => {
    if (!changes.length) return;
    if (!window.confirm(`변경 ${changes.length}건을 모두 버립니다. 계속할까요?`)) return;
    setState(P.buildState(containers, [], shiftCns, { storageCns, lockedCns }));
    setSelected(new Set()); bump(); setMsg('원래 상태로 되돌림');
  };

  const tryClose = () => {
    if (changes.length && !window.confirm(`저장하지 않은 변경 ${changes.length}건이 있습니다. 닫으면 버려집니다. 닫을까요?`)) return;
    onClose?.();
  };

  if (!state) {
    return createPortal(
      <div className="bge-overlay">
        <style>{CARGO_V2_CSS}</style><style>{BGE_CSS}</style>
        <div className="bge-head"><h1>{title}</h1>
          <button className="bge-btn" style={{ marginLeft: 'auto' }} onClick={onClose}><X size={16} /></button></div>
        <div className="bge-empty-msg">컨테이너 자료가 없습니다.<br />자료 탭에서 EDI를 먼저 올려주세요.</div>
      </div>, document.body);
  }

  const makeContent = (box) => (cell, tier) => {
    const cn = box.cellMap[`${P.pad2(tier)}-${cell.rowLbl}`];
    if (!cn) {
      // 옆 짝수 베이 40ft가 차지한 자리 — 카고플랜 각 베이와 같은 X 글자
      if (cell.rowLbl) {
        const k2 = `${P.pad2(tier)}-${cell.rowLbl}`;
        const aCn = box.adjCnMap[k2];
        if (aCn) {
          // V9.23-03: 옆 베이 컨이 차지한 자리 — 번호를 보여 잡을 수 있게 한다.
          //   종전엔 'X'만 찍혀 그 컨을 편집기에서 건드릴 방법이 없었다(사용자 신고: 28데크 X 3개).
          return (<><span className="bge-cn bge-adjcn">{aCn.slice(4)}</span>
            <span className="bge-sub">{box.adjBayMap[k2]}베이 {box.adjMap[k2]}ft</span></>);
        }
      }
      return null;
    }
    const c = state.byCn.get(cn) || {};
    const unplaced = mode === 'loading' && c._placed === false;
    return (<><span className="bge-cn">{state.shiftSet.has(cn) ? '◆' : ''}{unplaced ? '·' : ''}{cn.slice(4)}</span>
      <span className="bge-sub">{cn.slice(0, 4)} {isoToLabel(c.iso) || ''}</span></>);
  };
  const makeExtra = (box) => (cell, tier) => {
    const cn = cell.rowLbl ? box.cellMap[`${P.pad2(tier)}-${cell.rowLbl}`] : null;
    // V9.07-05: 옆 짝수 베이가 차지한 자리 — 표기는 카고플랜과 동일, 드롭은 차단.
    //   판정은 adjMap(현재 위치 기준). cell.mark는 자기 컨 마크와 섞이므로 쓰지 않는다.
    const akey = cell.rowLbl ? `${P.pad2(tier)}-${cell.rowLbl}` : null;
    const adj = !cn && akey ? box.adjMap[akey] : null;
    if (adj) {
      // V9.23-03: 이 자리에 새로 놓는 건 여전히 막지만(드롭 없음),
      //   차지하고 있는 컨 자체는 끌어 옮기거나 눌러 선택할 수 있어야 한다.
      const aCn = box.adjCnMap[akey];
      const aLock = aCn ? state.locked.has(aCn) : true;
      // V9.23-04: 폰에는 풍선말이 안 뜬다 — 눌렀을 때·떨어뜨렸을 때 상태줄로 이유를 말한다.
      const why = aCn
        ? `이 자리는 ${box.adjBayMap[akey]}베이 ${aCn}(${adj}ft)이 차지하고 있습니다`
        : `이 자리는 옆 베이 ${adj}ft가 차지하고 있습니다`;
      const tell = () => setMsg(aLock
        ? `${why} — ${lockHint}이라 옮길 수 없습니다`
        : `${why} — 그 컨을 먼저 옮기면 이 자리가 납니다 (선택됨)`);
      return {
        'data-cn': aCn || undefined,
        draggable: !!aCn && !aLock,
        onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; },
        onDrop: (e) => { e.preventDefault(); clearOver(); tell(); },
        className: `cpv2-cell ${adj === '40' ? 'bge-x' : 'bge-shadow'}`
          + (aCn && selected.has(aCn) ? ' bge-picked' : '')
          + (aCn && changedSet.has(aCn) ? ' bge-chgd' : ''),
        title: aCn
          ? `${aCn}\n옆 ${box.adjBayMap[akey]}베이 ${adj}ft가 이 자리를 차지\n${aLock ? `${lockHint} — 이동 불가` : '끌어서 옮기거나 눌러 선택'}`
          : `옆 베이 ${adj}ft가 차지한 자리 — 배치 불가`,
        onDragStart: aCn && !aLock ? (e) => dragStart(e, aCn) : undefined,
        onDragEnd: aCn && !aLock ? () => clearOver() : undefined,
        onClick: (e) => { e.stopPropagation(); if (aCn && !aLock) toggleSel(aCn); tell(); },
      };
    }
    // 슬롯이 없는 칸도 조용히 넘기지 않는다
    if (!cell.active && akey) {
      return { className: 'cpv2-cell',
        onClick: (e) => { e.stopPropagation(); setMsg('이 자리는 이 배에 슬롯이 없습니다 (베이사전 기준)'); } };
    }
    const dropProps = cell.active && cell.rowLbl ? {
      onDragOver: (e) => {
        e.preventDefault();
        if (e.currentTarget.classList.contains('bge-over')) return;
        clearOver(); e.currentTarget.classList.add('bge-over');
      },
      onDrop: (e) => dropCell(e, box, cell.rowLbl, tier),
    } : {};
    if (!cn) return { ...dropProps, className: `cpv2-cell${cell.active ? ' bge-empty' : ''}${cell.active && stgList.length ? ' bge-open' : ''}`,
      onClick: cell.active ? (e) => { e.stopPropagation();
        // V9.23-07: 좌표를 외워 끌어 놓게 하지 않는다 — 자리를 누르면 놓을 컨을 골라 준다.
        if (stgList.length) { setPicker({ even: box.even, odd: box.odd, row: cell.rowLbl, tier: P.pad2(tier), label: box.label }); return; }
        setMsg(selected.size
          ? `빈 자리 ${P.pad2(cell.rowLbl)}열 ${P.pad2(tier)}단 — 선택한 ${selected.size}대를 여기로 끌어 놓으십시오`
          : `빈 자리 ${P.pad2(cell.rowLbl)}열 ${P.pad2(tier)}단 — 놓을 컨이 임시창고에 없습니다`);
      } : undefined };
    const c = state.byCn.get(cn) || {};
    const locked = state.locked.has(cn);
    return {
      ...dropProps,
      'data-cn': cn, draggable: !locked,
      className: `cpv2-cell ${locked ? 'bge-lock' : 'bge-fill'}${changedSet.has(cn) ? ' bge-chgd' : ''}${selected.has(cn) ? ' bge-picked' : ''}`,
      title: `${cn}\n${isoToLabel(c.iso) || c.iso} · ${c.pol || ''}→${c.pod || ''}${locked ? `\n${lockHint} — 이동 불가` : ''}${state.shiftSet.has(cn) ? '\n◆ 쉬프팅(재적부)' : ''}`,
      onDragStart: (e) => dragStart(e, cn),
      onDragEnd: () => clearOver(),
      onClick: (e) => {
        e.stopPropagation(); toggleSel(cn);
        const p2 = state.pos[cn] || {};
        setMsg(locked
          ? `${cn} · ${p2.bay}베이 ${p2.row}열 ${p2.tier}단 — ${lockHint}이라 이동 불가`
          : `${cn} · ${p2.bay}베이 ${p2.row}열 ${p2.tier}단 (${isoToLabel(c.iso) || c.iso || ''}) — 끌어서 옮기거나 보관하십시오`);
      },
    };
  };

  const gridCols = Math.max(1, ...boxes.map((b) => Math.max(b.data?.nDeckCols || 0, b.data?.nHoldCols || 0)));

  return createPortal(
    <div className="bge-overlay">
      <style>{CARGO_V2_CSS}</style><style>{BGE_CSS}</style>
      <div className="bge-head">
        <h1>{title}</h1>
        {subtitle && <span className="bge-badge">{subtitle}</span>}
        <span className={`bge-badge${dictData?.source === 'user' ? '' : ' warn'}`}>
          {dictData?.source === 'user' ? '★정본' : '⚠비정본'} {dictData?.code || '?'} · {(dictData?.bayDef?.baysSummary || []).length}베이
        </span>
        {headerExtra}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
          <button className="bge-btn" onClick={() => window.print()} title="인쇄">🖨</button>
          <button className="bge-btn r" onClick={resetAll} disabled={!changes.length} title="변경 되돌리기"><Undo2 size={13} /></button>
          <button className="bge-btn g" onClick={() => onSave?.(state)} disabled={!changes.length || saving}>
            <Save size={13} /> {saving ? '저장 중…' : `${saveLabel}${changes.length ? ` (${changes.length})` : ''}`}
          </button>
          <button className="bge-btn" onClick={tryClose}><X size={14} /></button>
        </div>
      </div>

      <div className="bge-stats">
        <span>전체 <b>{stats.total}</b></span>
        <span style={{ color: '#38bdf8' }}>이동가능 <b style={{ color: '#38bdf8' }}>{stats.moveable}</b></span>
        <span style={{ color: '#94a3b8' }}>{lockHint} <b style={{ color: '#94a3b8' }}>{stats.locked}</b></span>
        {stats.shifting > 0 && <span style={{ color: '#a5b4fc' }}>◆ 쉬프팅 <b style={{ color: '#a5b4fc' }}>{stats.shifting}</b></span>}
        <span style={{ color: '#fbbf24' }}>변경 <b style={{ color: '#fbbf24' }}>{stats.changed}</b></span>
        <span style={{ color: '#7dd3fc' }}>임시창고 <b style={{ color: '#7dd3fc' }}>{stats.storage}</b></span>
        <span style={{ color: '#a3e635' }}>빈 슬롯 <b style={{ color: '#a3e635' }}>{emptySlots}</b></span>
        {selected.size > 0 && <span style={{ color: '#93c5fd' }}>선택 <b style={{ color: '#93c5fd' }}>{selected.size}</b></span>}
        {issues?.dup.length > 0 && <span style={{ color: '#f87171' }}>⚠ 좌표중복 <b style={{ color: '#f87171' }}>{issues.dup.length}</b></span>}
        <span className="bge-msg" title={msg}>{msg}</span>
      </div>

      <div className="bge-nav">
        {pages.length === 0 && <span style={{ color: '#94a3b8', fontSize: 12 }}>베이사전/매트릭스 없음 — 신규 선박 등록 필요</span>}
        {pages.map((p, i) => (
          <button key={p.key} className={`${i === selIdx ? 'on' : ''}${p.boxKeys.some((k) => String(k).replace(/[()]/g, '').match(/\d{2}/g)?.some((n) => changedBays.has(num(n)))) ? ' chg' : ''}`}
            onClick={() => setSelIdx(i)}>{p.label}</button>
        ))}
      </div>

      <div className="bge-body">
        <div className="bge-stage" ref={stageRef} onMouseDown={stageDown} onMouseMove={stageMove} onMouseUp={stageUp}
          onDragLeave={(e) => { if (!stageRef.current?.contains(e.relatedTarget)) clearOver(); }} onDrop={clearOver} onDragEnd={clearOver}>
          {rubber && <div className="bge-rubber" style={{ left: rubber.left, top: rubber.top, width: rubber.w, height: rubber.h }} />}
          {boxes.map((b) => (
            <div key={b.key} className="bge-sheet bge-edit">
              <div className="bge-sheet-title" style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, marginBottom: 6, flexShrink: 0 }}>
                {shipName} {voyageInfo || ''} — {mode === 'loading' ? '선적' : '양하'} (BAY {b.label})
              </div>
              <div className="bge-sheet-body">
                <div className="bge-boxwrap">
                  <div className="bge-boxh">BAY {b.label}{b.even ? ` — 40ft ${b.even} / 20ft ${b.odd}` : ' — 20ft 단독'}</div>
                  <div className="bge-boxbody">
                    {b.data
                      ? <BayBoxV2 data={b.data} colorMap={colorMap} gridCols={gridCols} applyHatch
                          renderCellContent={makeContent(b)} cellExtra={makeExtra(b)} />
                      : <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>매트릭스 없음</div>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bge-side bge-noprint">
          <div className="bge-tabs">
            <button className={tab === 'sel' ? 'on' : ''} onClick={() => setTab('sel')}>✓ 선택 {selected.size}</button>
            <button className={tab === 'stg' ? 'on' : ''} onClick={() => setTab('stg')}>📦 창고 {stgList.length}</button>
            <button className={tab === 'chg' ? 'on' : ''} onClick={() => setTab('chg')}>변경 {changes.length}</button>
            <button className={tab === 'opn' ? 'on' : ''} style={stgList.length ? { color: '#a3e635' } : undefined}
              onClick={() => setTab('opn')}>🅿 빈자리 {openSlots.length}</button>
            <button className={tab === 'hid' ? 'on' : ''} style={hidden.length ? { color: '#fca5a5' } : undefined}
              onClick={() => setTab('hid')}>⚠ 안 보임 {hidden.length}</button>
          </div>

          {tab === 'sel' && (
            <>
              <div style={{ padding: '8px 8px 4px', fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                셀 <b style={{ color: '#e2e8f0' }}>클릭</b> = 하나씩 넣고 빼기<br />
                <b style={{ color: '#e2e8f0' }}>Shift</b>+영역 = 추가 · <b style={{ color: '#e2e8f0' }}>Ctrl</b>(⌘)+영역 = 제외<br />
                선택분 중 하나를 끌면 <b style={{ color: '#e2e8f0' }}>전체가 함께</b> 이동
              </div>
              <div style={{ padding: '0 8px 6px', display: 'flex', gap: 6 }}>
                <button className="bge-btn p" style={{ flex: 1 }} disabled={!selected.size} onClick={sendSelected}>선택 {selected.size}대 보관</button>
                <button className="bge-btn" disabled={!selected.size} onClick={() => setSelected(new Set())}>전체 해제</button>
              </div>
              <div className="bge-list">
                {selected.size === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>선택 없음</div>}
                {[...selected].sort().map((cn) => (
                  <div key={cn} className="bge-chip" style={{ cursor: 'default', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1 }}>{cn} <span style={{ opacity: .55 }}>{isoToLabel(state.byCn.get(cn)?.iso) || ''}</span></span>
                    <button className="bge-btn r" style={{ padding: '1px 7px', fontSize: 12 }} title="선택에서 빼기" onClick={() => dropSel(cn)}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'stg' && (
            <>
              <div className={`bge-drop${stgOver ? ' over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setStgOver(true); }}
                onDragLeave={() => setStgOver(false)} onDrop={dropStorage}>
                여기로 컨을 끌어다 놓기<br />= 임시창고 보관
                <br /><span style={{ color: '#fbbf24' }}>미배정</span> = EDI에 자리 없는 컨 (호출해서 베이에 놓으십시오)
              </div>
              <div className="bge-list">
                {stgList.length === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>비어 있음</div>}
                {stgList.map((cn) => (
                  <div key={cn} className="bge-chip" draggable onDragStart={(e) => dragStart(e, cn)} onDragEnd={clearOver} title="베이 칸으로 끌어 배치">
                    {cn} <span style={{ opacity: .55 }}>{isoToLabel(state.byCn.get(cn)?.iso) || ''}</span>
                    {state.unplaced?.has(cn) && <span style={{ color: '#fbbf24', marginLeft: 4 }}>미배정</span>}
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'opn' && (
            <>
              <div className="bge-drop" style={{ borderColor: '#65a30d', color: '#a3e635' }}>
                선적 안 된 자리 <b>{openSlots.length}</b>곳
                <br />{stgList.length
                  ? <>임시창고에 <b>{stgList.length}대</b> 대기 중 — 자리를 누르면 놓을 컨을 골라 줍니다</>
                  : '놓을 컨이 임시창고에 없습니다'}
              </div>
              <div className="bge-list">
                {openByBox.length === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>빈 자리 없음</div>}
                {openByBox.map((g) => (
                  <div key={g.boxKey} className="bge-chg" style={{ cursor: 'pointer' }}
                    onClick={() => { setSelIdx(g.page); setMsg(`BAY ${g.label} — 빈 자리 ${g.slots.length}곳. 자리를 누르면 놓을 컨을 고릅니다`); }}>
                    <b>BAY {g.label}</b> — 빈 자리 {g.slots.length}곳<br />
                    <i>{g.slots.slice(0, 8).map((e) => `${e.sec} ${e.row}열 ${e.tier}단`).join(' · ')}{g.slots.length > 8 ? ` 외 ${g.slots.length - 8}곳` : ''}</i>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'chg' && (
            <div className="bge-list">
              {changes.length === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>변경 없음</div>}
              {changes.map((c) => (
                <div key={c.cn} className="bge-chg"><b>{c.shifting ? '◆ ' : ''}{c.cn}</b><br /><i>{c.fromLabel} → {c.toLabel}</i></div>
              ))}
            </div>
          )}

          {tab === 'hid' && (
            <>
              <div style={{ padding: '8px 8px 4px', fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                격자에 그려지지 않아 손댈 수 없던 컨입니다.<br />
                <b style={{ color: '#e2e8f0' }}>좌표중복</b> = 같은 칸에 둘 이상 ·
                <b style={{ color: '#e2e8f0' }}> 격자 밖</b> = 베이사전에 없는 자리<br />
                보관으로 빼낸 뒤 원하는 칸에 다시 놓으십시오.
              </div>
              <div style={{ padding: '0 8px 6px' }}>
                <button className="bge-btn p" style={{ width: '100%' }} disabled={!hidden.length}
                  onClick={() => { const cns = hidden.map((h) => h.cn); setSelected(new Set(cns)); sendCns(cns); }}>
                  {hidden.length}대 전부 임시창고로
                </button>
              </div>
              <div className="bge-list">
                {hidden.length === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>없음 — 모두 격자에 보입니다</div>}
                {hidden.map((h) => (
                  <div key={h.cn} className="bge-chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1 }}>{h.cn}
                      <span style={{ opacity: .6 }}> {isoToLabel(state.byCn.get(h.cn)?.iso) || ''}</span><br />
                      <span style={{ fontSize: 11, color: h.why === '좌표중복' ? '#fca5a5' : '#fcd34d' }}>
                        {h.why} · {h.bay}베이 {h.row}행 {h.tier}단</span>
                    </span>
                    <button className="bge-btn p" style={{ padding: '2px 7px', fontSize: 11 }}
                      title="임시창고로 보내기" onClick={() => sendCns([h.cn])}>보관</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {sideExtra}
        </div>
      </div>

      {/* V9.23-07: 빈 자리를 누르면 뜨는 '놓을 컨 고르기'. 좌표를 외워 끌 필요가 없다. */}
      {picker && (
        <div className="bge-pick-back" onClick={() => setPicker(null)}>
          <div className="bge-pick" onClick={(e) => e.stopPropagation()}>
            <div className="bge-pick-h">
              BAY {picker.label} · {P.pad2(picker.row)}열 {picker.tier}단
              <span>여기에 놓을 컨을 고르십시오</span>
            </div>
            <div className="bge-pick-list">
              {stgList.length === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 20 }}>임시창고가 비어 있습니다</div>}
              {stgList.map((cn) => {
                const c = state.byCn.get(cn) || {};
                return (
                  <button key={cn} className="bge-pick-item" onClick={() => {
                    const opts = picker.even ? { pairEven: picker.even, pairOdd: picker.odd } : {};
                    const r = P.placeAt(state, cn, picker.even || picker.odd, picker.row, picker.tier, opts);
                    setMsg(r.ok
                      ? `${cn} → BAY ${picker.label} ${P.pad2(picker.row)}열 ${picker.tier}단 선적`
                      : `놓을 수 없습니다: ${r.reason}`);
                    if (r.ok) setPicker(null);
                    bump();
                  }}>
                    <b>{cn}</b>
                    <span>{isoToLabel(c.iso) || c.iso || ''} {c.pol || ''}→{c.pod || ''}
                      {state.unplaced?.has(cn) && <em> · 미배정</em>}</span>
                  </button>
                );
              })}
            </div>
            <button className="bge-btn r" style={{ margin: 8 }} onClick={() => setPicker(null)}>닫기</button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
