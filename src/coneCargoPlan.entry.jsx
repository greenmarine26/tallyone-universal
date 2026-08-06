// 콘앱(cone.html)에서 검수앱 본체 카고플랜 V2를 그대로 띄우는 번들 진입점 (V7.45)
//   본체 PrintableCargoPlanV2 + cargoPlanCore + 베이사전(.def 내장 포함)을 React째 번들.
//   콘앱은 window.ConeCargoPlan.open(props) 한 줄로 본체와 100% 동일한 카고플랜을 연다.
import React from 'react';
import { createRoot } from 'react-dom/client';
import PrintableCargoPlanV2 from './components/PrintableCargoPlanV2.jsx';
import { parseBAPLIE, parseAscFile, normalizeBay, isoToLabel, isUserOwnedBayDict } from './utils.js';   // V9.05-03: 콘앱 파서 통합용 + ConeOne 1.2: 격자 파생용 + TallyUni 0.7-02: 정본 판정
// ConeOne 1.2: 베이뷰 격자 단일 소스 — 검수앱 BayPlan이 쓰는 바로 그 모듈들을 임포트해 재사용
import { getShipBayDictData } from './shipStructure.js';
import { isLoloShipByPolicy } from './shipPolicies.js';   // ConeOne 1.2-01: LOLO 판정 통합
import { enrichBayDef } from './bayDictAutoEnrich.js';
import { buildEmptyBayRenderData } from './cargoPlanCore.js';
import { extractShipMetaFromVoyage } from './shipMatrixBuilder.js';

let _root = null;
let _host = null;

function close() {
  try { if (_root) _root.unmount(); } catch (e) {}
  if (_host && _host.parentNode) _host.parentNode.removeChild(_host);
  _root = null; _host = null;
}

function open(props) {
  close();
  _host = document.createElement('div');
  document.body.appendChild(_host);
  _root = createRoot(_host);
  _root.render(
    <PrintableCargoPlanV2 {...props} onClose={close} />
  );
}

window.ConeCargoPlan = { open, close };

// V9.05-03: 파서 단일 소스 통합 — 콘앱(cone.html)이 본체 parseBAPLIE/parseAscFile을 그대로 쓰도록 노출.
//   콘앱 내부 약식 파서의 Full/Empty 미인식(실측: EQD 상태 +5/+4 안 읽음)·ISO 불일치 해소.
//   숫자코드 BAPLIE(CASP)·IFCSUM(RIZHAO)도 parseBAPLIE가 내부 라우팅하므로 콘앱에서 그대로 처리됨.
window.ConeParse = { parseBAPLIE, parseAscFile };

// ConeOne 1.2-01: LOLO 판정 단일 소스 — 검수앱 선박정책(lolo 플래그, RZOR 전용)을 콘앱에 노출.
window.ConeShipPolicy = { isLolo: isLoloShipByPolicy };

// ═══════════════════════════════════════════════════════════════════
// ConeOne 1.2: 콘앱 베이뷰 격자 파생 — 검수앱 BayPlan.jsx 규칙 그대로 (단일 소스)
//   목적: 콘앱 베이뷰가 검수앱 베이플랜과 같은 모양(존재 칸·X 그림자·숨김)이 되도록,
//   BayPlan.jsx의 격자 파생 로직을 행 번호 주석과 함께 재구성해 노출한다.
//   (BayPlan.jsx는 JSX/useMemo에 얽혀 함수 추출이 불가 — 규칙별 원본 행 번호를 주석으로 대응)
//   반환: { pages: [ { title, evenBay, oddBay, mode:'coord'|'flex', ... } ] }
// ═══════════════════════════════════════════════════════════════════
export function buildConeBayGrid(containers, shipInfo) {
  shipInfo = shipInfo || {};
  const shipImo = shipInfo.imo || '';
  const shipName = shipInfo.name || '';
  containers = Array.isArray(containers) ? containers : [];

  // BayPlan.jsx 232-235: _vslCode — 빌더와 동일 코드 신원 (voyage info 기반)
  let _vslCode = '';
  try { _vslCode = extractShipMetaFromVoyage({ info: shipInfo.voyageInfo || null })?.code || ''; } catch (e) { _vslCode = ''; }

  // BayPlan.jsx 115-127: bayGroups — 키를 정규화된 정수 문자열로 통일
  const bayGroups = {};
  containers.forEach(c => {
    if (!c.bay) return;
    const key = normalizeBay(c.bay);
    if (!key) return;
    if (!bayGroups[key]) bayGroups[key] = [];
    bayGroups[key].push(c);
  });

  // BayPlan.jsx 171-199: globalRowRange — 좌우 균형 (전 베이 통일, 데크/홀드 분리)
  const globalRowRange = (() => {
    let deckLeft = 0, deckRight = 0, deckHas00 = false;
    let holdLeft = 0, holdRight = 0, holdHas00 = false;
    for (const c of containers) {
      if (!c.row || !c.tier) continue;
      const n = parseInt(c.row);
      const tier = parseInt(c.tier || 0);
      if (!tier) continue;
      const isDeck = tier >= 80;
      if (n === 0) {
        if (isDeck) deckHas00 = true; else holdHas00 = true;
        continue;
      }
      if (isDeck) {
        if (n % 2 === 0) deckLeft = Math.max(deckLeft, n);
        else deckRight = Math.max(deckRight, n);
      } else {
        if (n % 2 === 0) holdLeft = Math.max(holdLeft, n);
        else holdRight = Math.max(holdRight, n);
      }
    }
    return {
      maxLeft: Math.max(deckLeft, holdLeft),
      maxRight: Math.max(deckRight, holdRight),
      has00: deckHas00 || holdHas00,
      deck: { maxLeft: deckLeft, maxRight: deckRight, has00: deckHas00 },
      hold: { maxLeft: holdLeft, maxRight: holdRight, has00: holdHas00 },
    };
  })();

  // BayPlan.jsx 204-211: globalTiers — 선박 전체 tier 풀
  const globalTiers = (() => {
    const ts = new Set();
    for (const c of containers) { if (c.tier) ts.add(c.tier); }
    return Array.from(ts);
  })();

  // BayPlan.jsx 222-229: ediBayCount — 현재 EDI 실제 베이 수
  const ediBayCount = (() => {
    const s = new Set();
    for (const c of containers) {
      const n = parseInt(c.bay, 10);
      if (Number.isFinite(n) && n > 0) s.add(n);
    }
    return s.size;
  })();

  // BayPlan.jsx 244·269: 사전 조회 — getShipBayDictData (검수앱과 동일 인자)
  let dict = null;
  if (shipImo || shipName) {
    try { dict = getShipBayDictData(shipImo, shipName, { ediBayCount, vslCode: _vslCode }); }
    catch (e) { console.warn('[ConeOne 1.2] 베이사전 조회 실패 — EDI 폴백', e); dict = null; }
  }

  // BayPlan.jsx 240-262: dictBayList — baysSummary 우선, 유령 bayList 미사용
  const dictBayList = (() => {
    if (!dict || !dict.bayDef) return null;
    const summary = dict.bayDef.baysSummary;
    let list = null;
    if (Array.isArray(summary) && summary.length > 0) {
      const sBays = summary
        .map(b => (b.bayNo != null ? b.bayNo : b.bay))
        .filter(x => x != null && String(x).trim() !== '');
      if (sBays.length > 0) list = sBays;
    }
    if (!list) return null;
    if (list.length < 2) return null;
    const ints = list.map(b => parseInt(b, 10)).filter(n => Number.isFinite(n) && n > 0);
    if (ints.length < 2) return null;
    return [...new Set(ints)].sort((a, b) => a - b);
  })();

  // BayPlan.jsx 268-287: dictBaysSummary — enrichBayDef 보강 (source='user'면 차단)
  const dictBaysSummary = (() => {
    if (!dict || !dict.bayDef || !dict.bayDef.baysSummary) return {};
    const m = {};
    try {
      // TallyUni 0.7-02: 판정은 조회 경로가 아니라 항목 안쪽으로.
      const enrichedEntry = enrichBayDef({ bayDef: dict.bayDef }, dict._v5Matrix, containers, isUserOwnedBayDict(dict) ? 'user' : dict.source);
      enrichedEntry.bayDef.baysSummary.forEach(b => { m[parseInt(b.bayNo, 10)] = b; });
    } catch (e) { console.warn('[ConeOne 1.2] 베이사전 보강 실패', e); return {}; }
    return m;
  })();

  // BayPlan.jsx 289-300: globalGridCols — 전 베이 최대 그리드 폭 (베이 간 정렬 기준)
  const globalGridCols = (() => {
    let w = 1;
    for (const k in dictBaysSummary) {
      const e = dictBaysSummary[k];
      if (!e) continue;
      const dc = Array.isArray(e.deckCells) && e.deckCells.length ? Math.max(...e.deckCells.map(n => parseInt(n) || 0)) : 0;
      const hc = Array.isArray(e.holdCells) && e.holdCells.length ? Math.max(...e.holdCells.map(n => parseInt(n) || 0)) : 0;
      w = Math.max(w, parseInt(e.rowCount) || 0, dc, hc);
    }
    const r = globalRowRange;
    const lenOf = (g) => (g ? Math.ceil((g.maxLeft || 0) / 2) + Math.ceil((g.maxRight || 0) / 2) + (g.has00 ? 1 : 0) : 0);
    w = Math.max(w, lenOf(r?.deck), lenOf(r?.hold));
    return w;
  })();

  // BayPlan.jsx 302-395: pages — .def(사전) 우선, 없으면 EDI 폴백 페어링
  const pages = (() => {
    const dispBay = (n) => n >= 100 ? String(n) : String(n).padStart(2, '0');
    const keyBay = (n) => String(n);
    let bayInts;
    let usingDictBays = false;
    if (dictBayList && dictBayList.length > 0) {
      bayInts = [...dictBayList];
      usingDictBays = true;
    } else {
      const bays = Object.keys(bayGroups);
      bayInts = bays.map(b => parseInt(b, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
    }
    if (bayInts.length === 0) return [];
    const baySet = new Set(bayInts);
    const out = [];
    const usedOddBays = new Set();
    if (usingDictBays) {
      for (const n of bayInts) {
        if (n % 2 === 0) {
          const evenKey = keyBay(n);
          const evenDisp = dispBay(n);
          const leftOddIn = baySet.has(n - 1);
          const rightOddIn = baySet.has(n + 1);
          if (!leftOddIn && !rightOddIn) {
            out.push({ title: `BAY ${evenDisp}`, evenBay: evenKey, oddBay: null, isStandalone: true });
          } else if (rightOddIn) {
            out.push({ title: `BAY (${evenDisp})${dispBay(n + 1)}`, evenBay: evenKey, oddBay: keyBay(n + 1) });
            usedOddBays.add(keyBay(n + 1));
          } else {
            out.push({ title: `BAY ${evenDisp}`, evenBay: evenKey, oddBay: null });
          }
        } else {
          const oddKey = keyBay(n);
          if (!usedOddBays.has(oddKey)) {
            out.push({ title: `BAY ${dispBay(n)}`, evenBay: null, oddBay: oddKey });
          }
        }
      }
    } else {
      const maxBay = Math.max(...bayInts);
      for (let n = 1; n <= maxBay; n++) {
        if (n % 2 === 0) {
          const evenKey = keyBay(n);
          const oddKey = keyBay(n + 1);
          const evenDisp = dispBay(n);
          const oddDisp = dispBay(n + 1);
          const oddInRange = (n + 1) <= maxBay;
          out.push({
            title: oddInRange ? `BAY (${evenDisp})${oddDisp}` : `BAY ${evenDisp}`,
            evenBay: evenKey,
            oddBay: oddInRange ? oddKey : null,
          });
          if (oddInRange) usedOddBays.add(oddKey);
        } else {
          const oddKey = keyBay(n);
          if (!usedOddBays.has(oddKey)) {
            out.push({ title: `BAY ${dispBay(n)}`, evenBay: null, oddBay: oddKey });
          }
        }
      }
    }
    return out;
  })();

  // ── 페이지별 격자 (BayPlan.jsx BayPage 파생부) ──────────────────────
  const outPages = pages.map(page => {
    // BayPlan.jsx 996-998: 페이지 컨테이너
    const evenContainers = page.evenBay ? (bayGroups[page.evenBay] || []) : [];
    const oddContainers = page.oddBay ? (bayGroups[page.oddBay] || []) : [];
    const allContainers = [...evenContainers, ...oddContainers];

    // BayPlan.jsx 1003-1036: xMarks — 단독 홀수 페이지에서 인접 짝수 베이 40/45ft 그림자
    const xMarks = (() => {
      const marks = new Set();
      if (!page.oddBay || page.evenBay) return marks;
      const occupied = new Set();
      for (const c of allContainers) {
        if (c.row && c.tier) occupied.add(`${c.row}-${c.tier}`);
      }
      const isLongContainer = (c) => {
        const iso = c.iso || '';
        const lbl = (isoToLabel ? isoToLabel(iso) : '') || '';
        if (lbl.startsWith('20')) return false;
        if (/^2/.test(iso)) return false;
        return true;
      };
      const oddN = parseInt(page.oddBay, 10);
      for (const adjEven of [oddN - 1, oddN + 1]) {
        if (adjEven <= 0) continue;
        for (const c of (bayGroups[String(adjEven)] || [])) {
          if (!c.row || !c.tier) continue;
          if (!isLongContainer(c)) continue;
          const xKey = `${c.row}-${c.tier}`;
          if (occupied.has(xKey)) continue;
          marks.add(xKey);
        }
      }
      return marks;
    })();

    // BayPlan.jsx 1041-1067: pageRange — 페이지 단위 deck/hold row 범위
    const pageRange = (() => {
      let deckLeft = 0, deckRight = 0, deckHas00 = false;
      let holdLeft = 0, holdRight = 0, holdHas00 = false;
      for (const c of allContainers) {
        if (!c.row || !c.tier) continue;
        const n = parseInt(c.row);
        const tier = parseInt(c.tier);
        if (!tier) continue;
        const isDeck = tier >= 80;
        if (n === 0) {
          if (isDeck) deckHas00 = true; else holdHas00 = true;
          continue;
        }
        if (isDeck) {
          if (n % 2 === 0) deckLeft = Math.max(deckLeft, n);
          else deckRight = Math.max(deckRight, n);
        } else {
          if (n % 2 === 0) holdLeft = Math.max(holdLeft, n);
          else holdRight = Math.max(holdRight, n);
        }
      }
      return {
        deck: { maxLeft: deckLeft, maxRight: deckRight, has00: deckHas00 },
        hold: { maxLeft: holdLeft, maxRight: holdRight, has00: holdHas00 },
      };
    })();

    // BayPlan.jsx 1070-1077: buildPageRows
    const buildPageRows = (range) => {
      const ml = range?.maxLeft || 0, mr = range?.maxRight || 0;
      if (!ml && !mr) return [];
      const left = []; for (let n = ml; n >= 2; n -= 2) left.push(String(n).padStart(2, '0'));
      const right = []; for (let n = 1; n <= mr; n += 2) right.push(String(n).padStart(2, '0'));
      return range.has00 ? [...left, '00', ...right] : [...left, ...right];
    };

    // BayPlan.jsx 1094-1148: pageBayDictGrid — 사전 기반 페이지 그리드 (flex 폴백용)
    const pageBayDictGrid = (() => {
      const bays = [page.evenBay, page.oddBay].filter(bn => bn != null);
      if (bays.length === 0) return null;
      let deckMaxCells = 0, holdMaxCells = 0;
      let pageRowCount = 0;
      let pageHasZero = false;
      let deckAlign = 'center', holdAlign = 'center';
      let deckPadLeft = 0, deckPadRight = 0;
      let holdPadLeft = 0, holdPadRight = 0;
      let foundAny = false;
      bays.forEach(bn => {
        const db = dictBaysSummary[parseInt(bn, 10)];
        if (!db) return;
        foundAny = true;
        if (Array.isArray(db.deckCells) && db.deckCells.length > 0) {
          const mDeck = Math.max(...db.deckCells.map(n => parseInt(n) || 0));
          if (mDeck > deckMaxCells) deckMaxCells = mDeck;
        }
        if (Array.isArray(db.holdCells) && db.holdCells.length > 0) {
          const mHold = Math.max(...db.holdCells.map(n => parseInt(n) || 0));
          if (mHold > holdMaxCells) holdMaxCells = mHold;
        }
        if (typeof db.rowCount === 'number' && db.rowCount > pageRowCount) {
          pageRowCount = db.rowCount;
        }
        if (db.hasZero) pageHasZero = true;
        if (db.deckAlign) deckAlign = db.deckAlign;
        if (db.holdAlign) holdAlign = db.holdAlign;
        if (typeof db.deckPadLeft === 'number') deckPadLeft = db.deckPadLeft;
        if (typeof db.deckPadRight === 'number') deckPadRight = db.deckPadRight;
        if (typeof db.holdPadLeft === 'number') holdPadLeft = db.holdPadLeft;
        if (typeof db.holdPadRight === 'number') holdPadRight = db.holdPadRight;
      });
      if (!foundAny) return null;
      const gridCells = Math.max(deckMaxCells, holdMaxCells, pageRowCount);
      if (gridCells === 0) return null;
      return {
        gridCells,
        hasZero: pageHasZero,
        deckCells: deckMaxCells || gridCells,
        holdCells: holdMaxCells || gridCells,
        deckAlign, holdAlign,
        deckPadLeft, deckPadRight,
        holdPadLeft, holdPadRight,
      };
    })();

    // BayPlan.jsx 1152-1218: pageMatrixRender — buildEmptyBayRenderData (매트릭스와 100% 동일)
    const pageMatrixRender = (() => {
      const evenBn = page.evenBay != null ? parseInt(page.evenBay, 10) : null;
      const oddBn = page.oddBay != null ? parseInt(page.oddBay, 10) : null;
      const primaryBn = evenBn != null ? evenBn : oddBn;
      if (primaryBn == null) return null;
      const isPair = evenBn != null && oddBn != null;
      const bayKey = isPair
        ? `(${String(evenBn).padStart(2, '0')})${String(oddBn).padStart(2, '0')}`
        : String(primaryBn).padStart(2, '0');

      let entry = dictBaysSummary[primaryBn];

      // BayPlan.jsx 1180-1197: 사전에 없으면 EDI 실데이터로 단면 골격 생성
      if (!entry) {
        if (!allContainers || allContainers.length === 0) return null;
        const deckTierSet = new Set(), holdTierSet = new Set();
        const deckRowsByTier = {}, holdRowsByTier = {};
        let dHas0 = false, hHas0 = false;
        for (const c of allContainers) {
          if (!c.row || !c.tier) continue;
          const t = parseInt(c.tier, 10);
          if (!t) continue;
          const isDeck = t >= 80;
          const isZero = parseInt(c.row, 10) === 0;
          if (isDeck) {
            deckTierSet.add(t);
            (deckRowsByTier[t] = deckRowsByTier[t] || new Set()).add(c.row);
            if (isZero) dHas0 = true;
          } else {
            holdTierSet.add(t);
            (holdRowsByTier[t] = holdRowsByTier[t] || new Set()).add(c.row);
            if (isZero) hHas0 = true;
          }
        }
        const deckTiers = [...deckTierSet].sort((a, b) => b - a);
        const holdTiers = [...holdTierSet].sort((a, b) => b - a);
        const deckCells = deckTiers.map(t => [...(deckRowsByTier[t] || [])].filter(r => parseInt(r, 10) !== 0).length);
        const holdCells = holdTiers.map(t => [...(holdRowsByTier[t] || [])].filter(r => parseInt(r, 10) !== 0).length);
        entry = {
          bayNo: String(primaryBn).padStart(2, '0'),
          deckTiers, holdTiers, deckCells, holdCells,
          deckHasZero: dHas0, holdHasZero: hHas0, hasZero: dHas0 || hHas0,
        };
      }

      // BayPlan.jsx 1199-1211: 매트릭스 명시값 우선 → EDI 폴백 판정
      const ediHasDeck = pageRange.deck.maxLeft > 0 || pageRange.deck.maxRight > 0 || pageRange.deck.has00;
      const ediHasHold = pageRange.hold.maxLeft > 0 || pageRange.hold.maxRight > 0 || pageRange.hold.has00;
      const matrixDeckZero = (entry.deckHasZero != null) ? entry.deckHasZero : (entry.hasZero != null ? entry.hasZero : null);
      const matrixHoldZero = (entry.holdHasZero != null) ? entry.holdHasZero : (entry.hasZero != null ? entry.hasZero : null);
      const effEntry = {
        ...entry,
        deckHasZero: matrixDeckZero != null ? matrixDeckZero : (ediHasDeck ? pageRange.deck.has00 : false),
        holdHasZero: matrixHoldZero != null ? matrixHoldZero : (ediHasHold ? pageRange.hold.has00 : false),
      };
      try {
        return buildEmptyBayRenderData(effEntry, bayKey, isPair);
      } catch (e) {
        console.warn('[ConeOne 1.2] 베이 매트릭스 렌더 실패', bayKey, e);
        return null;
      }
    })();

    // BayPlan.jsx 1694-1701: hatchCount
    let hatchCount = 1;
    for (const bn of [page.evenBay, page.oddBay]) {
      if (bn == null) continue;
      const db = dictBaysSummary[parseInt(bn, 10)];
      if (db && db.hatchCount) { hatchCount = Math.max(1, Math.min(3, db.hatchCount)); break; }
    }

    // BayPlan.jsx 1221-1250: pageCoordLayout — 좌표 기반 (active 셀만 그림)
    const pageCoordLayout = (() => {
      if (!pageMatrixRender) return null;
      const deckRows = pageMatrixRender.deckRows.filter(r => !r.invisible);
      const holdRows = pageMatrixRender.holdRows.filter(r => !r.invisible);
      const deckSet = new Set();
      deckRows.forEach(r => r.cells.forEach(c => { if (c.active && c.rowLbl) deckSet.add(c.rowLbl); }));
      const dEv = [...deckSet].filter(r => parseInt(r, 10) % 2 === 0).sort((a, b) => parseInt(b) - parseInt(a));
      const dOd = [...deckSet].filter(r => parseInt(r, 10) % 2 === 1).sort((a, b) => parseInt(a) - parseInt(b));
      const deckAxis = [...dEv, ...dOd];
      const holdSet = new Set();
      holdRows.forEach(r => r.cells.forEach(c => { if (c.active && c.rowLbl) holdSet.add(c.rowLbl); }));
      const hEv = [...holdSet].filter(r => r !== '00' && parseInt(r, 10) % 2 === 0).sort((a, b) => parseInt(b) - parseInt(a));
      const hOd = [...holdSet].filter(r => r !== '00' && parseInt(r, 10) % 2 === 1).sort((a, b) => parseInt(a) - parseInt(b));
      const holdAxis = [...hEv, ...(holdSet.has('00') ? ['00'] : []), ...hOd];
      const deckRowX = {}; deckAxis.forEach((r, i) => { deckRowX[r] = i; });
      const holdRowX = {}; holdAxis.forEach((r, i) => { holdRowX[r] = i; });
      const nCols = Math.max(deckAxis.length, holdAxis.length, globalGridCols || 0);
      const deckOff = (nCols - deckAxis.length) / 2;
      const holdOff = (nCols - holdAxis.length) / 2;
      return { deckRows, holdRows, deckAxis, holdAxis, deckRowX, holdRowX, deckOff, holdOff, nCols };
    })();

    if (pageCoordLayout) {
      // 좌표 모드: BayPlan.jsx 1775-1780·1806-1811 — active && rowLbl 셀만 그린다 (없는 칸은 아예 안 그림)
      const packRows = (rows) => rows.map(tr => ({
        tier: String(tr.tier).padStart(2, '0'),
        rows: tr.cells.filter(c => c.active && c.rowLbl != null).map(c => c.rowLbl),
      }));
      return {
        title: page.title, evenBay: page.evenBay, oddBay: page.oddBay,
        mode: 'coord',
        nCols: pageCoordLayout.nCols,
        deckAxis: pageCoordLayout.deckAxis, holdAxis: pageCoordLayout.holdAxis,
        deckOff: pageCoordLayout.deckOff, holdOff: pageCoordLayout.holdOff,
        deckRows: packRows(pageCoordLayout.deckRows),
        holdRows: packRows(pageCoordLayout.holdRows),
        xMarks: Array.from(xMarks),
        hatchCount,
      };
    }

    // ── flex 폴백 (BayPlan.jsx 1252-1377): 사전·컨테이너 모두 없을 때의 직사각 골격 ──
    // BayPlan.jsx 1252-1262: buildGridRowsFromCells
    const buildGridRowsFromCells = (cells, hasZero) => {
      if (!cells || cells === 0) return [];
      const nonZero = hasZero ? Math.max(0, cells - 1) : cells;
      const leftCount = Math.ceil(nonZero / 2);
      const rightCount = nonZero - leftCount;
      const left = [];
      for (let i = leftCount; i >= 1; i--) left.push(String(i * 2).padStart(2, '0'));
      const right = [];
      for (let i = 1; i <= rightCount; i++) right.push(String(i * 2 - 1).padStart(2, '0'));
      return hasZero ? [...left, '00', ...right] : [...left, ...right];
    };
    // BayPlan.jsx 1267-1281: sliceWithAlign
    const sliceWithAlign = (gridRowsArr, ownCells, align, padLeftAdj, padRightAdj) => {
      const grid = gridRowsArr.length;
      if (ownCells >= grid) return [...gridRowsArr];
      const remain = grid - ownCells;
      let padLeft = Math.floor(remain / 2);
      let padRight = remain - padLeft;
      if (align === 'left') { padLeft = 0; padRight = remain; }
      else if (align === 'right') { padLeft = remain; padRight = 0; }
      padLeft = Math.max(0, Math.min(grid, padLeft + (padLeftAdj || 0)));
      padRight = Math.max(0, Math.min(grid - padLeft, padRight + (padRightAdj || 0)));
      const ownStart = padLeft;
      const ownEnd = grid - padRight;
      return gridRowsArr.map((r, i) => (i >= ownStart && i < ownEnd) ? r : null);
    };
    // BayPlan.jsx 1283-1301: 최종 row 배열 (사전 그리드+align 또는 EDI 폴백)
    const voyDeck = globalRowRange?.deck || pageRange.deck;
    const voyHold = globalRowRange?.hold || pageRange.hold;
    const baseDeckRowsArr = buildPageRows(voyDeck);
    const baseHoldRowsArr = buildPageRows(voyHold);
    const gridRowsArr = pageBayDictGrid
      ? buildGridRowsFromCells(pageBayDictGrid.gridCells, pageBayDictGrid.hasZero)
      : null;
    const deckRowsArr = pageBayDictGrid && gridRowsArr
      ? sliceWithAlign(gridRowsArr, pageBayDictGrid.deckCells, pageBayDictGrid.deckAlign,
                       pageBayDictGrid.deckPadLeft, pageBayDictGrid.deckPadRight)
      : baseDeckRowsArr;
    const holdRowsArr = pageBayDictGrid && gridRowsArr
      ? sliceWithAlign(gridRowsArr, pageBayDictGrid.holdCells, pageBayDictGrid.holdAlign,
                       pageBayDictGrid.holdPadLeft, pageBayDictGrid.holdPadRight)
      : baseHoldRowsArr;
    // BayPlan.jsx 1341-1360: pageBayDictTiers — 사전 tier 정밀 적용
    const pageBayDictTiers = (() => {
      const deck = new Set();
      const hold = new Set();
      [page.evenBay, page.oddBay].forEach(bn => {
        if (bn == null) return;
        const db = dictBaysSummary[parseInt(bn, 10)];
        if (!db) return;
        (db.deckTiersLocal || db.deckTiers || []).forEach(t => deck.add(String(t).padStart(2, '0')));
        (db.holdTiersLocal || db.holdTiers || []).forEach(t => hold.add(String(t).padStart(2, '0')));
      });
      return { deck, hold };
    })();
    // BayPlan.jsx 1362-1377: allTiers → deck/hold 분리 + 상하 패딩
    const hasDictTiers = pageBayDictTiers.deck.size > 0 || pageBayDictTiers.hold.size > 0;
    const allTiers = hasDictTiers
      ? Array.from(new Set([
          ...pageBayDictTiers.deck,
          ...pageBayDictTiers.hold,
          ...allContainers.map(c => c.tier).filter(Boolean),
          ...Array.from(xMarks).map(k => k.split('-')[1])
        ]))
      : Array.from(new Set([
          ...globalTiers,
          ...allContainers.map(c => c.tier).filter(Boolean),
          ...Array.from(xMarks).map(k => k.split('-')[1])
        ]));
    const deckTiers = allTiers.filter(t => parseInt(t) >= 80).sort((a, b) => parseInt(b) - parseInt(a));
    const holdTiers = allTiers.filter(t => parseInt(t) < 80).sort((a, b) => parseInt(b) - parseInt(a));
    const tierMax = Math.max(deckTiers.length, holdTiers.length);
    const deckTiersPadded = [...Array(tierMax - deckTiers.length).fill(null), ...deckTiers];
    const holdTiersPadded = [...holdTiers, ...Array(tierMax - holdTiers.length).fill(null)];

    return {
      title: page.title, evenBay: page.evenBay, oddBay: page.oddBay,
      mode: 'flex',
      deckRowsArr, holdRowsArr,
      deckTiersPadded, holdTiersPadded,
      xMarks: Array.from(xMarks),
      hatchCount,
    };
  });

  return { pages: outPages };
}

// ConeOne 1.2: 콘앱 베이뷰가 검수앱 베이플랜과 같은 격자를 쓰도록 노출.
//   cone.html 베이뷰는 이 결과(pages)의 칸만 그린다 — 없는 칸은 아예 안 그림, X 그림자는 검수앱과 동일.
window.ConeBayGrid = { buildGrid: buildConeBayGrid, ver: 'ConeOne 1.2' };
