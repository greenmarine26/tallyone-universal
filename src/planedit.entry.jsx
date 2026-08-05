// 선적 플랜 편집기 (단독) — V9.14
//   일항사 협의용 확정 플랜 작성 전용. 검수앱과 완전 분리 — Firebase를 import하지 않는다.
//   V9.08: 격자를 베이매트릭스 기준으로 교체(빈 슬롯 전부 표시·이동 가능), 선박 직접 선택, 카고플랜 보기.
//   V9.09: 격자 기하를 편집 시작 시점으로 '고정'(컨을 옮길 때마다 격자가 다시 계산돼 셀이 틀어지던 문제),
//          선택분 여러 대 동시 이동(상대 위치 유지·원자적).
//   V9.10: 선택 개별 추가·취소 — 셀 클릭 토글, Shift+영역=추가, Ctrl/⌘+영역=제외, 선택 목록 개별 ×.
//          격자 흔들림 제거 — 상단 바 높이 고정(메시지 길이로 줄바꿈되며 격자가 밀리던 문제),
//          셀 테두리 두께 통일(1px, 색만 변경), 드래그 중 하이라이트를 DOM 클래스로 직접 처리(리렌더 0).
//   V9.11: 드래그가 지나간 칸의 하이라이트가 지워지지 않고 쌓이던 문제 수정
//          (React는 자기가 붙이지 않은 클래스를 지우지 않는다 → 항상 한 칸만 남도록 전역 정리).
//   V9.12: 사전 오매칭 수정 — 같은 선박명이 두 코드로 중복 등록된 경우(TEN JUPITER = TNJP/LYTJ)
//          이름 fuzzy가 불완전 사전을 잡아 페어(트리오)가 붕괴했다. EDI 베이 포함 여부 + 트리오 수로 최적 사전 선정.
//          v5 매트릭스를 불완전한 v2 목록으로 걸러 홀수 베이가 사라지던 문제(페어 붕괴의 실원인) 수정.
//          인쇄 백지 수정 — CARGO_V2_CSS의 body>*:not(.cpv2-overlay) display:none 규칙이 #root를 숨기던 문제.
//   V9.13: 인쇄 시 배경색 강제 출력(print-color-adjust:exact) — 브라우저 '배경 그래픽' 기본값이
//          꺼져 있으면 통과 고정분 회색·선택 파랑이 전부 사라져 흑백 격자로 나오던 문제.
//   V9.14: 베이사전 JSON 불러오기 — 검수앱 [선박목록]에서 내보낸 {코드}_baydict_{날짜}.json을 받아
//          정본(source='user')으로 등록. 번들 사전이 옛 코드(LYTJ)로 남아 '⚠비정본'이 뜨던 문제 해소.
//   파서·베이사전·격자 계산은 검수앱 소스를 그대로 재사용 (별도 약식 파서 금지).
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { parseBAPLIE, parseListExcel, isoToLabel, isPyeongtaekPort, getContainerColorKey, buildContainerColorMap } from './utils.js';
import { extractShipInfo, getShipBayDictData } from './shipStructure.js';
import { enrichBayDef } from './bayDictAutoEnrich.js';
import { autoPairBays, generatePdfBays, buildPosMap, computeBayRenderData, defaultGetSelfMark } from './cargoPlanCore.js';
import { BayBoxV2, CARGO_V2_CSS } from './components/PrintableCargoPlanV2.jsx';
import PrintableCargoPlanV2 from './components/PrintableCargoPlanV2.jsx';
import { SHIP_BAY_DICT_V2 } from './data/shipBayDict_v2.js';
import * as P from './planEditCore.js';

// 오프라인 동작: parseListExcel의 loadSheetJS가 CDN을 받지 않도록 번들 XLSX 주입
if (typeof window !== 'undefined') window.XLSX = window.XLSX || XLSX;

const VERSION = 'V9.14';

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic','맑은 고딕',sans-serif;background:#0f172a;color:#e2e8f0}
.pe-app{display:flex;flex-direction:column;height:100vh}
.pe-head{display:flex;align-items:center;gap:8px;padding:0 12px;height:44px;flex:0 0 44px;background:#0b1220;border-bottom:1px solid #1e293b;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;white-space:nowrap}
.pe-head h1{font-size:15px;margin:0;font-weight:800}
.pe-badge{font-size:11px;background:#1e293b;border:1px solid #334155;border-radius:4px;padding:2px 7px;color:#94a3b8}
.pe-badge.warn{background:#78350f;border-color:#b45309;color:#fed7aa}
.pe-btn{padding:5px 10px;border-radius:5px;font-size:12px;font-weight:700;border:1px solid #334155;background:#1e293b;color:#cbd5e1;cursor:pointer}
.pe-btn:hover:not(:disabled){background:#334155}
.pe-btn:disabled{opacity:.4;cursor:default}
.pe-btn.p{background:#2563eb;border-color:#2563eb;color:#fff}
.pe-btn.g{background:#059669;border-color:#059669;color:#fff}
.pe-btn.r{background:#b91c1c;border-color:#b91c1c;color:#fff}
.pe-shipsel{padding:4px 7px;border-radius:5px;font-size:12px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;width:250px;flex:0 0 250px}
.pe-head h1,.pe-head .pe-badge,.pe-head button{flex:0 0 auto}
.pe-stats{display:flex;gap:13px;padding:0 12px;height:30px;flex:0 0 30px;background:#0f172a;border-bottom:1px solid #1e293b;font-size:12px;flex-wrap:nowrap;align-items:center;overflow:hidden;white-space:nowrap}
.pe-msg{margin-left:auto;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;max-width:46%;flex-shrink:1}
.pe-stats b{color:#f8fafc;font-size:13px}
.pe-nav{display:flex;gap:4px;flex-wrap:wrap;padding:5px 10px;height:44px;flex:0 0 44px;background:#0b1220;overflow:auto;border-bottom:1px solid #1e293b;align-content:flex-start}
.pe-nav button{padding:4px 9px;border-radius:5px;font-size:12px;font-weight:700;border:1px solid #334155;background:#1e293b;color:#cbd5e1;cursor:pointer}
.pe-nav button.on{background:#2563eb;color:#fff;border-color:#2563eb}
.pe-nav button.chg{border-color:#f59e0b;border-width:2px}
.pe-body{flex:1;display:flex;min-height:0}
.pe-stage{flex:1;overflow:auto;padding:10px;background:#1e293b;position:relative}
.pe-sheet{background:#fff;border-radius:6px;padding:10px;color:#111;max-width:1180px;min-width:940px;margin:0 auto;display:flex;flex-direction:column;height:calc(100vh - 138px);min-height:520px}
.pe-sheet-body{flex:1;display:flex;flex-direction:column;gap:8px;min-height:0}
.pe-boxwrap{flex:1 1 0;min-height:0;display:flex;flex-direction:column;border:1px solid #111;border-radius:3px;overflow:hidden}
.pe-boxbody{flex:1 1 0;min-height:0;display:flex;flex-direction:column;padding:3px}
.pe-boxh{font-size:12px;font-weight:800;color:#334155;background:#f1f5f9;padding:2px 0;text-align:center;flex-shrink:0;border-bottom:1px solid #cbd5e1}
.pe-side{width:262px;background:#0f172a;border-left:1px solid #334155;display:flex;flex-direction:column}
.pe-tabs{display:flex;border-bottom:1px solid #334155}
.pe-tabs button{flex:1;padding:7px 2px;font-size:11.5px;font-weight:800;background:#0b1220;border:none;color:#94a3b8;cursor:pointer;white-space:nowrap}
.pe-tabs button.on{background:#1e293b;color:#e2e8f0}
.pe-drop{margin:8px;border:2px dashed #38bdf8;border-radius:6px;padding:11px;text-align:center;font-size:12px;color:#7dd3fc;line-height:1.4}
.pe-drop.over{background:#0c4a6e;color:#e0f2fe}
.pe-list{flex:1;overflow:auto;padding:8px}
.pe-chip{background:#1e293b;border:1px solid #475569;border-radius:5px;padding:6px 8px;margin-bottom:5px;font-size:11px;cursor:grab;font-family:ui-monospace,monospace}
.pe-chg{background:#1e293b;border:1px solid #475569;border-left:3px solid #f59e0b;border-radius:4px;padding:5px 7px;margin-bottom:4px;font-size:11px}
.pe-chg b{font-family:ui-monospace,monospace}
.pe-chg i{font-style:normal;color:#94a3b8}
.pe-load{flex:1;display:flex;align-items:center;justify-content:center;padding:26px;overflow:auto}
.pe-load-box{max-width:580px;width:100%;background:#1e293b;border:2px dashed #475569;border-radius:10px;padding:24px;text-align:center}
.pe-load-box h2{font-size:17px;margin:0 0 6px}
.pe-load-box p{font-size:13px;color:#94a3b8;margin:4px 0 14px;line-height:1.6}
.pe-file{display:block;margin:9px auto;font-size:12px}
.pe-warn{background:#78350f;border:1px solid #b45309;color:#fed7aa;padding:6px 10px;font-size:12px;border-radius:5px;margin:8px 0}
.pe-rubber{position:absolute;border:1.5px solid #2563eb;background:rgba(37,99,235,.15);pointer-events:none;z-index:5}

/* 편집 오버레이 — 카고플랜 셀 위에 얹는다 */
.pe-edit .cpv2-cell{font-size:clamp(7px,0.68vw,10px) !important;line-height:1.05;border:1px solid #94a3b8 !important;box-sizing:border-box;flex:1 1 0 !important;min-width:0 !important;max-width:none !important;overflow:hidden}
.pe-edit .cpv2-bay-section{padding:1px}
.pe-edit .cpv2-cell.pe-fill{cursor:grab;background:#fff;border-color:#1e293b !important}
.pe-edit .cpv2-cell.pe-fill:active{cursor:grabbing}
.pe-edit .cpv2-cell.pe-lock{background:#cbd5e1;color:#475569;cursor:not-allowed;border-color:#64748b !important}
.pe-edit .cpv2-cell.pe-chgd{box-shadow:inset 0 0 0 2px #f59e0b}
.pe-edit .cpv2-cell.pe-chgd.pe-sel{box-shadow:inset 0 0 0 3px #2563eb,inset 0 0 0 5px #f59e0b}
.pe-edit .cpv2-cell.pe-sel{box-shadow:inset 0 0 0 3px #1d4ed8;background:#dbeafe !important}
.pe-edit .cpv2-cell.pe-over{background:#fde68a !important;border-color:#d97706 !important}
.pe-edit .cpv2-cell.pe-empty{cursor:copy;background:#fefefe;border-style:dashed !important;border-color:#cbd5e1 !important}
.pe-edit .cpv2-cell.pe-empty:hover{background:#e0f2fe}
.pe-cn2{font-weight:800;font-size:9.5px;letter-spacing:-.3px;font-family:ui-monospace,monospace;display:block}
.pe-sub2{font-size:8px;color:#64748b;display:block}
@media print{
  /* CARGO_V2_CSS의 body > *:not(.cpv2-overlay) display:none 규칙이 #root까지 숨긴다.
     편집 화면 인쇄가 백지가 되던 원인 — 되살리되, 카고플랜이 열려 있을 때는 그쪽만 인쇄한다. */
  body > #root{display:block !important}
  body.pe-planopen > #root{display:none !important}
  body{background:#fff}
  /* 브라우저 인쇄 대화상자의 '배경 그래픽' 기본값이 꺼진 경우(엣지 등) 통과 고정분 회색이
     통째로 날아가 흑백 격자가 된다 — 배경을 강제로 출력한다. */
  .pe-sheet, .pe-sheet *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
  .pe-head,.pe-stats,.pe-nav,.pe-side,.pe-noprint{display:none !important}
  .pe-stage{overflow:visible;padding:0;background:#fff}
  .pe-sheet{box-shadow:none;max-width:none}
}
`;

const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const cnNorm = (s) => String(s || '').replace(/\s/g, '').toUpperCase();
const keyToNum = (k) => parseInt(String(k).startsWith('(') ? String(k).replace(/[()]/g, '').slice(2) : k, 10) || 0;
const keyLabel = (k) => { if (String(k).startsWith('(')) { const m = String(k).replace(/[()]/g, ''); return `(${m.slice(0, 2)})${m.slice(2)}`; } return String(k); };

// 사전 선박 목록 (직접 선택용)
const SHIP_LIST = Object.entries(SHIP_BAY_DICT_V2 || {})
  .map(([code, v]) => ({ code, name: v?.name || code, bays: (v?.bayDef?.baysSummary || []).length }))
  .filter((s) => s.bays > 0)
  .sort((a, b) => a.name.localeCompare(b.name));

// 유효 베이 = v5 매트릭스 ∪ v2 baysSummary.
//   배경(실사고): TEN JUPITER는 TNJP(v5 없음·페어 2)와 LYTJ(v5 25베이·페어 8)로 중복 등록돼 있고,
//   v5를 v2 목록으로 거르면 홀수 베이(3·7·11·15…)가 전부 날아가 카고플랜 페어가 붕괴한다.
//   사용자가 직접 고친 사전(source='user')일 때만 v2 목록을 정답으로 삼는다.
const effBaysOf = (code) => {
  try {
    const d = getShipBayDictData('', code, { vslCode: code });
    if (!d) return [];
    const v5 = (d._v5Matrix?.matrixBays || []).map((b) => Number(b.bayNum));
    const sm = (d.bayDef?.baysSummary || []).map((x) => Number(x.bayNo));
    const set = (d.source === 'user' && v5.length && sm.length)
      ? new Set(v5.filter((n) => sm.includes(n)))
      : new Set([...v5, ...sm]);
    return [...set].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  } catch (e) { return []; }
};
const _effCache = new Map();
const dictBaysOf = (code) => {
  if (!_effCache.has(code)) _effCache.set(code, effBaysOf(code));
  return _effCache.get(code);
};

// 트리오(짝수 e가 e-1·e+1을 거느리는 3베이 묶음) 개수 — 사전 완전성의 핵심 지표
function trioCount(bayNums) {
  const set = new Set(bayNums);
  let n = 0;
  for (const e of bayNums) if (e % 2 === 0 && set.has(e - 1) && set.has(e + 1)) n++;
  return n;
}

// EDI 베이 구성으로 가장 알맞은 사전 코드 고르기.
//   배경(실사고): 같은 배가 두 코드로 중복 등록돼 있고(TEN JUPITER = TNJP 20베이 / LYTJ 18베이),
//   선박명 fuzzy가 홀수 베이(3·7)가 빠진 불완전 사전 LYTJ를 먼저 잡아 카고플랜 페어가 전부 붕괴했다.
//   → EDI 베이를 모두 담는 사전 중 트리오가 가장 많고 베이 수가 많은 것을 고른다.
function pickBestDict(ediBayNums, preferNames = []) {
  const want = ediBayNums.filter((n) => n > 0);
  if (!want.length) return '';
  const norm = (v) => String(v || '').toUpperCase().replace(/[\s\-_.]/g, '');
  const wantNames = preferNames.map(norm).filter((x) => x.length >= 4);
  let best = null;
  for (const s of SHIP_LIST) {
    const nums = dictBaysOf(s.code);
    if (!nums.length) continue;
    const set = new Set(nums);
    const covered = want.filter((n) => set.has(n)).length;
    if (covered < want.length) continue;                 // EDI 베이를 다 담지 못하면 탈락
    const e = SHIP_BAY_DICT_V2[s.code];
    const nameHit = wantNames.some((w) => {
      const dn = norm(e?.name); const dc = norm(s.code);
      return (dn.length >= 4 && (dn.includes(w) || w.includes(dn))) || dc === w;
    });
    const score = [nameHit ? 1 : 0, trioCount(nums), nums.length];
    if (!best || score[0] > best.score[0]
      || (score[0] === best.score[0] && score[1] > best.score[1])
      || (score[0] === best.score[0] && score[1] === best.score[1] && score[2] > best.score[2])) {
      best = { code: s.code, score };
    }
  }
  return best?.code || '';
}

// 검수앱이 내보낸 베이사전 JSON을 이 페이지의 사용자 사전(localStorage)에 등록한다.
//   형식: 단일 entry {imo,code,name,callsign,bayDef} · 배열 · {코드:entry} 맵 모두 허용.
//   addToUserBayDict()는 관리자 게이트를 타므로 단독본에서는 저장소에 직접 쓴다.
const USER_DICT_KEY = 'master_user_bay_dict_v1';
function importUserDict(json) {
  let list = [];
  if (Array.isArray(json)) list = json;
  else if (json && json.bayDef) list = [json];
  else if (json && typeof json === 'object') list = Object.values(json).filter((v) => v && v.bayDef);
  const ok = [];
  let store = {};
  try { store = JSON.parse(localStorage.getItem(USER_DICT_KEY) || '{}') || {}; } catch (e) { store = {}; }
  for (const e of list) {
    const code = String(e?.code || '').trim().toUpperCase();
    const bs = e?.bayDef?.baysSummary;
    if (!code || !Array.isArray(bs) || bs.length === 0) continue;
    store[code] = { ...e, code, bayDef: { ...e.bayDef, source: 'user', _userOwned: true, verified: true } };
    ok.push({ code, name: e.name || code, bays: bs.length });
  }
  if (ok.length) localStorage.setItem(USER_DICT_KEY, JSON.stringify(store));
  return ok;
}

function download(name, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
}

function App() {
  const [raw, setRaw] = useState('');
  const [containers, setContainers] = useState([]);
  const [ship, setShip] = useState(null);
  const [shipCode, setShipCode] = useState('');       // 사용자가 고른 선박 코드 (''=자동)
  const [userDict, setUserDict] = useState(() => { try { return Object.keys(JSON.parse(localStorage.getItem(USER_DICT_KEY) || '{}')); } catch (e) { return []; } });
  const [listCns, setListCns] = useState([]);
  const [shiftCns, setShiftCns] = useState([]);
  const [state, setState] = useState(null);
  const [tick, setTick] = useState(0);
  const [selIdx, setSelIdx] = useState(0);
  const [tab, setTab] = useState('stg');
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [stgOver, setStgOver] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const stageRef = useRef(null);
  const rubberStart = useRef(null);
  const [rubber, setRubber] = useState(null);
  const bump = () => setTick((t) => t + 1);

  const ediBayNums = useMemo(() => {
    const s = new Set();
    for (const c of containers) { const n = num(c.bay); if (n) s.add(n); }
    return [...s].sort((a, b) => a - b);
  }, [containers]);

  // ── 파일 로드 ──
  const loadEdi = async (file) => {
    const text = new TextDecoder('latin1').decode(await file.arrayBuffer());
    const r = await parseBAPLIE(text);
    const cs = (r.containers || r || []).filter((c) => c && c.cn);
    if (!cs.length) { setMsg('EDI에서 컨테이너를 찾지 못했습니다.'); return; }
    setRaw(text); setContainers(cs); setShip(extractShipInfo(text));
    setMsg(`초벌 EDI ${cs.length}대 로드 — ${file.name}`);
  };
  const loadList = async (file) => {
    const recs = await parseListExcel(await file.arrayBuffer());
    const cns = (recs || []).map((r) => cnNorm(r.cn)).filter(Boolean);
    setListCns(cns);
    setMsg(`선적 리스트 ${cns.length}대 로드 — ${file.name}`);
  };
  const loadDischargeEdi = async (file) => {
    const text = new TextDecoder('latin1').decode(await file.arrayBuffer());
    const r = await parseBAPLIE(text);
    const dis = new Map();
    for (const c of (r.containers || r || [])) dis.set(cnNorm(c.cn), `${P.pad2(c.bay)}${P.pad2(c.row)}${P.pad2(c.tier)}`);
    const sh = [];
    for (const c of containers) {
      const k = cnNorm(c.cn); const d = dis.get(k);
      if (d && d !== `${P.pad2(c.bay)}${P.pad2(c.row)}${P.pad2(c.tier)}`) sh.push(k);
    }
    setShiftCns(sh);
    setMsg(`양하 EDI 대조 — 쉬프팅(재적부) ${sh.length}대 식별`);
  };

  // ── 베이사전 조회 ──
  //   V9.08 수정: 콜사인을 imo 자리에 넘기면 조회가 오염돼 null이 되던 문제.
  //   extractShipInfo.imoIsNumeric이 false면 imo를 비우고 선박명으로만 찾는다.
  const dictData = useMemo(() => {
    if (!containers.length) return null;
    const opts = { ediBayCount: ediBayNums.length };
    let base = null;
    if (shipCode) base = getShipBayDictData('', shipCode, { ...opts, vslCode: shipCode });
    if (!base && ship) {
      const imo = ship.imoIsNumeric ? ship.imo : '';
      base = getShipBayDictData(imo, ship.name || '', { ...opts, vslFull: ship.name || '' });
    }
    if (!base) return null;
    const en = enrichBayDef({ bayDef: base.bayDef }, base._v5Matrix, containers, base.source);
    return { ...base, bayDef: { ...en.bayDef, source: base.source } };
  }, [containers, ship, shipCode, ediBayNums]);

  // 자동 판정 — 이름 조회 결과가 EDI 베이를 못 담거나 트리오가 붕괴하면 더 나은 사전으로 교체
  useEffect(() => {
    if (!containers.length || shipCode || !ediBayNums.length) return;
    const cur = dictData?.code || '';
    const curNums = cur ? dictBaysOf(cur) : [];
    const curSet = new Set(curNums);
    const curCovers = curNums.length > 0 && ediBayNums.every((n) => curSet.has(n));
    const curTrios = curCovers ? trioCount(curNums) : -1;
    const best = pickBestDict(ediBayNums, [ship?.name, ship?.callsign]);
    if (!best) return;
    if (!cur) { setShipCode(best); setMsg(`선박명 자동판정 실패 → 베이 구성이 맞는 ${best}로 지정`); return; }
    if (best !== cur && trioCount(dictBaysOf(best)) > curTrios) {
      setShipCode(best);
      setMsg(`사전 ${cur}(페어 ${Math.max(curTrios, 0)}개)보다 ${best}(페어 ${trioCount(dictBaysOf(best))}개)가 정확 → ${best}로 지정`);
    }
  }, [containers, dictData, shipCode, ediBayNums, ship]);

  // ── 매트릭스 격자 (검수앱 카고플랜과 동일 prep) ──
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
        // 사용자가 직접 고친 사전이 정답 — v5의 유령 베이를 걷어낸다
        const allow = new Set(summary.map((s) => Number(s.bayNo)).filter(Number.isFinite));
        bays = rawM.filter((b) => allow.has(Number(b.bayNum)));
      } else {
        // 자동추출 사전 — v2 목록이 불완전할 수 있으므로 v5에만 있는 베이도 살린다.
        //   (TEN JUPITER/LYTJ: v2 18베이·페어 0 vs v5 25베이·페어 8 — 거르면 페어가 전멸)
        const have = new Set(rawM.map((b) => Number(b.bayNum)));
        const extra = summary.map((s) => Number(s.bayNo)).filter((n) => Number.isFinite(n) && n > 0 && !have.has(n))
          .map((n) => ({ bayNum: n, cells: [], hasHold: !!byBay.get(n)?.hasHold, hasDeck: byBay.get(n)?.hasDeck !== false, isStandalone: !!byBay.get(n)?.isStandalone }));
        bays = [...rawM, ...extra].sort((a, b) => Number(a.bayNum) - Number(b.bayNum));
      }
    }
    return bays.map((b) => {
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

  // 페이지 = 트리오(홀수 단독 박스 + 짝수·홀수 합본 박스) 또는 단독 베이
  const pages = useMemo(() => {
    const list = [];
    trios.forEach(([top, pair]) => list.push({ key: pair, label: `${top}·${keyLabel(pair)}`, num: keyToNum(pair), boxKeys: [top, pair] }));
    singles.forEach((s) => list.push({ key: s, label: String(s), num: keyToNum(s), boxKeys: [s] }));
    return list.sort((a, b) => a.num - b.num);
  }, [trios, singles]);
  const page = pages[selIdx] || null;
  useEffect(() => { if (selIdx >= pages.length) setSelIdx(0); }, [pages, selIdx]);
  useEffect(() => {
    document.body.classList.toggle('pe-planopen', planOpen);
    return () => document.body.classList.remove('pe-planopen');
  }, [planOpen]);

  // ── 편집 반영된 컨테이너 목록 (격자·카고플랜·검증 공통 입력) ──
  const editedContainers = useMemo(() => {
    if (!state) return containers;
    const out = [];
    for (const c of containers) {
      const cn = cnNorm(c.cn); const p = state.pos[cn];
      if (!p) { out.push(c); continue; }
      if (p.storage) continue;                       // 임시창고 = 격자에서 뺀다
      out.push({ ...c, bay: p.bay, row: p.row, tier: p.tier });
    }
    return out;
  }, [containers, state, tick]);

  // V9.09: 격자 기하는 편집 시작 시점 배치로 '고정'한다.
  //   computeBayRenderData는 posMap으로 행/단을 넓히므로, 편집 중 posMap이 바뀌면
  //   단(tier) 행이 늘거나 열이 줄어 격자 전체가 밀린다(사용자 신고 "셀이 틀어짐").
  //   셀 내용은 cellMap이 담당하므로 기하만 고정하면 된다.
  const basePosMap = useMemo(() => buildPosMap(containers), [containers]);
  const posMap = basePosMap;
  const colorMap = useMemo(() => buildContainerColorMap(editedContainers, 'loading'), [editedContainers]);
  const pod = useMemo(() => {
    const c = {}; for (const x of containers) { const p = x.pod; if (p) c[p] = (c[p] || 0) + 1; }
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || 'KRPTK';
  }, [containers]);
  const getColorKey = useCallback((c) => getContainerColorKey(c, 'loading'), []);
  const getIsThrough = useCallback((c) => !(c._inList || isPyeongtaekPort(c.pol)), []);

  const mk = useCallback((key) => (key && matrixBays.length
    ? computeBayRenderData(key, pdfBays, matrixBays, posMap, pod, defaultGetSelfMark, {}, getColorKey, getIsThrough, dictData?.bayDef, dictData?.code)
    : null), [pdfBays, matrixBays, posMap, pod, getColorKey, getIsThrough, dictData]);

  // 박스별: 렌더데이터 + 셀맵(`tier-row` → 컨번호) + 대상 베이
  const boxes = useMemo(() => {
    if (!page || !state) return [];
    return page.boxKeys.map((k) => {
      const isPair = String(k).startsWith('(');
      const m = String(k).replace(/[()]/g, '');
      const even = isPair ? m.slice(0, 2) : null;
      const odd = isPair ? m.slice(2) : String(k);
      const bays = isPair ? [num(even), num(odd)] : [num(k)];
      const cellMap = {};
      for (const [cn, p] of Object.entries(state.pos)) {
        if (p.storage) continue;
        if (!bays.includes(num(p.bay))) continue;
        cellMap[`${p.tier}-${p.row}`] = cn;
      }
      const data = mk(k);
      const mkSec = (rows) => {
        if (!rows || !rows.length) return null;
        // 열 라벨은 행마다 비활성(null)이 섞이므로 전 행을 인덱스별로 합쳐서 뽑는다.
        //   (첫 행만 보면 최상단 단이 전부 비어 있는 베이에서 cols가 통째로 null이 된다 — V9.09 실사고)
        const width = Math.max(...rows.map((r) => (r.cells || []).length));
        const cols = new Array(width).fill(null);
        for (const r of rows) (r.cells || []).forEach((c, i) => { if (cols[i] == null && c.rowLbl) cols[i] = c.rowLbl; });
        const active = rows.map((r) => (r.cells || []).map((c) => !!c.active));
        return { tiers: rows.map((r) => P.pad2(r.tier)), cols, active };
      };
      return { key: k, label: keyLabel(k), even, odd, bays, cellMap, data,
        sections: { deck: mkSec(data?.deckRows), hold: mkSec(data?.holdRows) } };
    });
  }, [page, state, mk, tick]);

  const stats = useMemo(() => (state ? P.summarize(state) : null), [state, tick]);
  const changes = useMemo(() => (state ? P.diffChanges(state) : []), [state, tick]);
  const changedSet = useMemo(() => new Set(changes.map((c) => c.cn)), [changes]);
  const stgList = useMemo(() => (state ? P.storageList(state) : []), [state, tick]);
  const issues = useMemo(() => (state ? P.validate(state) : null), [state, tick]);
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



  const loadDict = async (file) => {
    try {
      const ok = importUserDict(JSON.parse(await file.text()));
      if (!ok.length) { setMsg('베이사전 형식이 아닙니다 — 검수앱 [선박목록]의 내보내기 JSON을 넣어주세요'); return; }
      _effCache.clear();
      setUserDict(Object.keys(JSON.parse(localStorage.getItem(USER_DICT_KEY) || '{}')));
      setShipCode(ok[0].code);
      setMsg(`정본 베이사전 등록 — ${ok.map((x) => `${x.code}(${x.bays}베이)`).join(', ')}`);
    } catch (e) { setMsg('JSON을 읽지 못했습니다: ' + (e?.message || e)); }
  };

  const start = () => {
    if (!containers.length) { setMsg('초벌 EDI를 먼저 불러오세요.'); return; }
    setState(P.buildState(containers, listCns, shiftCns));
    setSelIdx(0); bump();
  };

  // ── 드래그 ──
  // 드래그 하이라이트는 항상 한 칸만 남긴다.
  //   React는 VDOM에 없던 클래스(pe-over)를 지우지 않으므로, 직접 붙였으면 직접 걷어야 한다.
  //   dragleave는 자식 요소(span)를 드나들 때도 발생해 신뢰할 수 없다 → dragover에서 전역 정리.
  const clearOver = useCallback(() => {
    document.querySelectorAll('.pe-edit .cpv2-cell.pe-over').forEach((el) => el.classList.remove('pe-over'));
  }, []);

  // 선택 토글 — 클릭 한 번으로 넣고 빼기
  const toggleSel = useCallback((cn) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(cn)) n.delete(cn); else n.add(cn);
      return n;
    });
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
  // 컨의 현재 좌표가 이 박스의 어느 섹션/인덱스인지
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
    e.preventDefault();
    clearOver();
    const cn = e.dataTransfer.getData('text/plain');
    if (!cn || !state || !rowLbl) return;
    const targetBayOf = (c) => {
      if (!box.even) return box.odd;
      const sz = P.sizeOf(c);
      return (sz === '40' || sz === '45') ? box.even : box.odd;
    };

    // ── 선택분 여러 대 동시 이동 (상대 위치 유지) ──
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
        if (!L) { setMsg(`이동 불가: ${c}는 이 베이/섹션 밖입니다 — 같은 구역끼리만 함께 옮길 수 있습니다`); return; }
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

    // ── 1대 이동 (빈 칸이면 이동, 컨이 있으면 자리 맞교환) ──
    const opts = box.even ? { pairEven: box.even, pairOdd: box.odd } : {};
    const res = P.placeAt(state, cn, box.even || box.odd, rowLbl, tier, opts);
    setMsg(res.ok
      ? (res.swappedWith ? `${cn} ↔ ${res.swappedWith} 자리 맞교환` : `${cn} → ${P.pad2(rowLbl)}열 ${P.pad2(tier)}단 이동`)
      : `이동 불가: ${res.reason}`);
    bump();
  };
  const dropStorage = (e) => {
    e.preventDefault(); setStgOver(false);
    e.currentTarget.classList.remove('over');
    const cn = e.dataTransfer.getData('text/plain');
    if (!cn || !state) return;
    const cns = selected.has(cn) ? [...selected] : [cn];
    const r = P.moveToStorage(state, cns);
    setMsg(`임시창고 보관 ${r.done.length}대${r.skipped.length ? ` (거부 ${r.skipped.length})` : ''}`);
    setSelected(new Set()); bump();
  };
  const sendSelected = () => {
    const r = P.moveToStorage(state, [...selected]);
    setMsg(`임시창고 보관 ${r.done.length}대${r.skipped.length ? ` (통과 고정분 ${r.skipped.length} 제외)` : ''}`);
    setSelected(new Set()); bump();
  };

  // ── 영역 선택 ──
  const stageDown = (e) => {
    if (e.button !== 0 || !stageRef.current) return;
    if (e.target.closest('[data-cn]')) return;
    const r = stageRef.current.getBoundingClientRect();
    // Shift=기존 선택에 추가, Ctrl/⌘=영역 안의 것을 선택에서 제외, 없으면 새 선택
    rubberStart.current = { x: e.clientX, y: e.clientY, rl: r.left, rt: r.top, add: e.shiftKey, sub: e.ctrlKey || e.metaKey };
    setRubber({ left: e.clientX - r.left, top: e.clientY - r.top, w: 0, h: 0 });
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
    if (s.sub) {
      setSelected((prev) => { const n = new Set(prev); let k = 0; for (const cn of found) if (n.delete(cn)) k++; setMsg(`영역 ${k}대 선택 해제 → 남은 ${n.size}대`); return n; });
    } else if (s.add) {
      setSelected((prev) => { const n = new Set(prev); for (const cn of found) n.add(cn); setMsg(`영역 ${found.size}대 추가 → 총 ${n.size}대 선택`); return n; });
    } else {
      setSelected(found); setTab('sel'); setMsg(`${found.size}대 선택 (통과 고정분 제외) · 셀을 클릭하면 하나씩 넣고 뺄 수 있습니다`);
    }
  };

  // ── 내보내기 ──
  const expBaplie = () => {
    const w = P.rewriteBaplie(raw, state);
    download(`${ship?.voyage || 'PLAN'}_확정플랜.edi`, new Blob([new TextEncoder().encode(w.text)]));
    setMsg(`BAPLIE 저장 — 좌표교체 ${w.replaced} / 창고제외 ${w.removed} / 무변경 ${w.untouched}`);
  };
  const expJson = () => {
    download(`${ship?.voyage || 'PLAN'}_변경내역.json`, JSON.stringify({
      version: VERSION, ship: ship?.name || '', shipCode: dictData?.code || shipCode || '', voyage: ship?.voyage || '',
      mode: 'loading', exportedAt: new Date().toISOString(), summary: stats, changes,
      storage: stgList.map((cn) => ({ cn, iso: state.byCn.get(cn)?.iso || '' })),
    }, null, 2), 'application/json');
    setMsg(`변경내역 JSON 저장 — ${changes.length}건`);
  };
  const expXlsx = () => {
    const rows = changes.map((c, i) => ({
      번호: i + 1, 컨테이너: c.cn, ISO: c.iso, 규격: isoToLabel(c.iso) || '',
      POL: c.pol, POD: c.pod, 쉬프팅: c.shifting ? 'Y' : '',
      '변경전 위치': c.fromLabel, '변경후 위치': c.toLabel,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '변경표');
    XLSX.writeFile(wb, `${ship?.voyage || 'PLAN'}_변경표.xlsx`);
    setMsg(`엑셀 변경표 저장 — ${changes.length}건`);
  };
  const resetAll = () => {
    if (!confirm(`변경 ${changes.length}건을 모두 버리고 초벌 EDI 상태로 되돌립니다. 계속할까요?`)) return;
    setState(P.buildState(containers, listCns, shiftCns)); setSelected(new Set()); bump();
    setMsg('초벌 EDI 상태로 되돌림');
  };

  const shipPicker = (
    <select className="pe-shipsel" value={shipCode} onChange={(e) => { setShipCode(e.target.value); setMsg(e.target.value ? `선박 지정: ${e.target.value}` : '선박 자동 판정'); }}>
      <option value="">자동 판정{dictData ? ` (${dictData.code || '매칭됨'})` : ' — 실패'}</option>
      {userDict.length > 0 && <optgroup label="정본 (검수앱에서 불러옴)">
        {userDict.map((c) => <option key={'u' + c} value={c}>★ {c} ({dictBaysOf(c).length}베이 · 페어 {trioCount(dictBaysOf(c))})</option>)}
      </optgroup>}
      <optgroup label="번들 사전 (비정본)">
        {SHIP_LIST.filter((s) => !userDict.includes(s.code)).map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name} ({s.bays}베이 · 페어 {trioCount(dictBaysOf(s.code))})</option>)}
      </optgroup>
    </select>
  );

  // ── 로드 화면 ──
  if (!state) {
    return (
      <div className="pe-app">
        <style>{CSS}</style><style>{CARGO_V2_CSS}</style>
        <div className="pe-head">
          <h1>📐 선적 플랜 편집기</h1>
          <span className="pe-badge">{VERSION} · 단독 · 검수앱 미연결</span>
        </div>
        <div className="pe-load">
          <div className="pe-load-box">
            <h2>초벌 EDI + 선적 리스트를 넣으세요</h2>
            <p>일항사와 협의할 확정 플랜을 만드는 화면입니다.<br />
              Firebase에 연결하지 않으므로 검수앱 데이터는 절대 바뀌지 않습니다.</p>
            <label className="pe-file">① 초벌 선적 EDI (필수)<br />
              <input type="file" accept=".edi,.EDI,.txt" onChange={(e) => e.target.files[0] && loadEdi(e.target.files[0])} /></label>
            <label className="pe-file">② 선적 리스트 엑셀 (평택분 판정)<br />
              <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files[0] && loadList(e.target.files[0])} /></label>
            <label className="pe-file">③ 양하 EDI (선택 — 쉬프팅 자동 식별)<br />
              <input type="file" accept=".edi,.EDI,.txt" onChange={(e) => e.target.files[0] && loadDischargeEdi(e.target.files[0])} /></label>
            <label className="pe-file">④ 베이사전 JSON (선택 — 검수앱 [선박목록] 내보내기 파일)<br />
              <input type="file" accept=".json" onChange={(e) => e.target.files[0] && loadDict(e.target.files[0])} /></label>
            {msg && <div className="pe-warn">{msg}</div>}
            {ship && (
              <>
                <p style={{ fontSize: 12, margin: '8px 0 4px' }}>
                  EDI 선박 <b>{ship.name}</b> · 항차 <b>{ship.voyage}</b> · 컨 {containers.length}대 · 베이 {ediBayNums.length}개
                  {listCns.length > 0 && <> · 리스트 {listCns.length}대</>}{shiftCns.length > 0 && <> · 쉬프팅 {shiftCns.length}대</>}
                </p>
                <div style={{ margin: '8px 0 14px', fontSize: 12 }}>
                  베이매트릭스 선박: {shipPicker}
                  <div style={{ marginTop: 6, color: dictData ? '#86efac' : '#fca5a5' }}>
                    {dictData
                      ? `${dictData.source === 'user' ? '★ 정본' : '✓ 번들'} 매트릭스 ${dictData.code || ''} — ${(dictData.bayDef?.baysSummary || []).length}베이 적용 (EDI 베이 ${ediBayNums.length}개)`
                      : '✗ 베이사전 미매칭 — 목록에서 배를 직접 고르세요 (매트릭스 없이는 빈 슬롯을 그릴 수 없습니다)'}
                  </div>
                </div>
              </>
            )}
            <button className="pe-btn p" style={{ padding: '9px 22px', fontSize: 14 }} disabled={!containers.length || !dictData} onClick={start}>편집 시작</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 셀 렌더 (BayBoxV2 주입) ──
  const makeContent = (box) => (cell, tier) => {
    const cn = box.cellMap[`${P.pad2(tier)}-${cell.rowLbl}`];
    if (!cn) return null;
    const c = state.byCn.get(cn) || {};
    return (<><span className="pe-cn2">{state.shiftSet.has(cn) ? '◆' : ''}{cn.slice(4)}</span>
      <span className="pe-sub2">{cn.slice(0, 4)} {isoToLabel(c.iso) || ''}</span></>);
  };
  const makeExtra = (box) => (cell, tier) => {
    const cn = cell.rowLbl ? box.cellMap[`${P.pad2(tier)}-${cell.rowLbl}`] : null;
    // 활성 슬롯이면 비어 있어도 드롭을 받는다 — 빈 자리로 이동이 되어야 편집이 가능하다.
    // 드래그 중 하이라이트는 React 상태가 아니라 DOM 클래스로 직접 처리한다.
    //   dragover는 초당 수십 번 발생하므로 상태로 두면 189셀이 매번 리렌더되며 격자가 흔들린다.
    const dropProps = cell.active && cell.rowLbl ? {
      onDragOver: (e) => {
        e.preventDefault();
        if (e.currentTarget.classList.contains('pe-over')) return;
        clearOver();
        e.currentTarget.classList.add('pe-over');
      },
      onDrop: (e) => dropCell(e, box, cell.rowLbl, tier),
    } : {};
    if (!cn) {
      return { ...dropProps, className: `cpv2-cell${cell.active ? ' pe-empty' : ''}` };
    }
    const c = state.byCn.get(cn) || {};
    const locked = state.locked.has(cn);
    return {
      ...dropProps,
      'data-cn': cn, draggable: !locked,
      className: `cpv2-cell ${locked ? 'pe-lock' : 'pe-fill'}${changedSet.has(cn) ? ' pe-chgd' : ''}${selected.has(cn) ? ' pe-sel' : ''}`,
      title: `${cn}\n${isoToLabel(c.iso) || c.iso} · ${c.pol}→${c.pod}${locked ? '\n통과 고정분 — 이동 불가' : ''}${state.shiftSet.has(cn) ? '\n◆ 쉬프팅(재적부)' : ''}`,
      onDragStart: (e) => dragStart(e, cn),
      onDragEnd: () => clearOver(),
      onClick: (e) => { e.stopPropagation(); toggleSel(cn); },
    };
  };

  const gridCols = Math.max(1, ...boxes.map((b) => Math.max(b.data?.nDeckCols || 0, b.data?.nHoldCols || 0)));

  return (
    <div className="pe-app">
      <style>{CARGO_V2_CSS}</style><style>{CSS}</style>
      <div className="pe-head">
        <h1>📐 선적 플랜 편집기</h1>
        <span className="pe-badge">{VERSION}</span>
        <span className="pe-badge">{ship?.name} · {ship?.voyage}</span>
        <span className={`pe-badge${dictData?.source === 'user' ? '' : ' warn'}`}>
          {dictData?.source === 'user' ? '★정본' : '⚠비정본'} {dictData?.code || '?'} · {(dictData?.bayDef?.baysSummary || []).length}베이
        </span>
        <label className="pe-btn" style={{ cursor: 'pointer' }} title="검수앱 [선박목록]에서 내보낸 베이사전 JSON">📖 사전
          <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && loadDict(e.target.files[0])} />
        </label>
        {shipPicker}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button className="pe-btn p" onClick={() => setPlanOpen(true)}>🗺 카고플랜 보기</button>
          <button className="pe-btn" onClick={() => window.print()}>🖨 베이플랜 인쇄</button>
          <button className="pe-btn g" onClick={expBaplie}>선적 EDI</button>
          <button className="pe-btn" onClick={expJson} disabled={!changes.length}>JSON</button>
          <button className="pe-btn" onClick={expXlsx} disabled={!changes.length}>엑셀</button>
          <button className="pe-btn r" onClick={resetAll} disabled={!changes.length}>되돌리기</button>
        </div>
      </div>

      <div className="pe-stats">
        <span>전체 <b>{stats.total}</b></span>
        <span style={{ color: '#38bdf8' }}>이동가능 <b style={{ color: '#38bdf8' }}>{stats.moveable}</b></span>
        <span style={{ color: '#94a3b8' }}>통과 고정 <b style={{ color: '#94a3b8' }}>{stats.locked}</b></span>
        {stats.shifting > 0 && <span style={{ color: '#a5b4fc' }}>◆ 쉬프팅 <b style={{ color: '#a5b4fc' }}>{stats.shifting}</b></span>}
        <span style={{ color: '#fbbf24' }}>변경 <b style={{ color: '#fbbf24' }}>{stats.changed}</b></span>
        <span style={{ color: '#7dd3fc' }}>임시창고 <b style={{ color: '#7dd3fc' }}>{stats.storage}</b></span>
        <span style={{ color: '#a3e635' }}>이 베이 빈 슬롯 <b style={{ color: '#a3e635' }}>{emptySlots}</b></span>
        {issues?.dup.length > 0 && <span style={{ color: '#f87171' }}>⚠ 좌표중복 <b style={{ color: '#f87171' }}>{issues.dup.length}</b></span>}
        {issues?.warnings.length > 0 && <span style={{ color: '#fdba74' }}>⚠ 적재경고 {issues.warnings.length}</span>}
        {selected.size > 0 && <span style={{ color: '#93c5fd' }}>선택 <b style={{ color: '#93c5fd' }}>{selected.size}</b></span>}
        <span className="pe-msg" title={msg}>{msg}</span>
      </div>

      <div className="pe-nav">
        {pages.map((p, i) => (
          <button key={p.key} className={`${i === selIdx ? 'on' : ''}${p.boxKeys.some((k) => String(k).replace(/[()]/g, '').match(/\d{2}/g)?.some((n) => changedBays.has(num(n)))) ? ' chg' : ''}`}
            onClick={() => setSelIdx(i)}>{p.label}</button>
        ))}
      </div>

      <div className="pe-body">
        <div className="pe-stage" ref={stageRef} onMouseDown={stageDown} onMouseMove={stageMove} onMouseUp={stageUp}
          onDragLeave={(e) => { if (!stageRef.current?.contains(e.relatedTarget)) clearOver(); }}
          onDrop={clearOver} onDragEnd={clearOver}>
          {rubber && <div className="pe-rubber" style={{ left: rubber.left, top: rubber.top, width: rubber.w, height: rubber.h }} />}
          <div className="pe-sheet pe-edit">
            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, marginBottom: 6, flexShrink: 0 }}>
              {ship?.name} {ship?.voyage} — 컨펌용 플랜편집 (BAY {page?.label})
            </div>
            <div className="pe-sheet-body">
              {boxes.map((b) => (
                <div key={b.key} className="pe-boxwrap">
                  <div className="pe-boxh">BAY {b.label}{b.even ? ` — 40ft ${b.even} / 20ft ${b.odd}` : ' — 20ft 단독'}</div>
                  <div className="pe-boxbody">
                    {b.data
                      ? <BayBoxV2 data={b.data} colorMap={colorMap} gridCols={gridCols}
                          applyHatch renderCellContent={makeContent(b)} cellExtra={makeExtra(b)} />
                      : <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>매트릭스 없음</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pe-side pe-noprint">
          <div className="pe-tabs">
            <button className={tab === 'stg' ? 'on' : ''} onClick={() => setTab('stg')}>📦 창고 {stgList.length}</button>
            <button className={tab === 'sel' ? 'on' : ''} onClick={() => setTab('sel')}>✓ 선택 {selected.size}</button>
            <button className={tab === 'chg' ? 'on' : ''} onClick={() => setTab('chg')}>변경 {changes.length}</button>
          </div>
          {tab === 'sel' ? (
            <>
              <div style={{ padding: '8px 8px 4px', fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                셀을 <b style={{ color: '#e2e8f0' }}>클릭</b>하면 하나씩 넣고 뺍니다.<br />
                <b style={{ color: '#e2e8f0' }}>Shift</b>+영역 드래그 = 추가 · <b style={{ color: '#e2e8f0' }}>Ctrl</b>(⌘)+영역 드래그 = 제외
              </div>
              <div style={{ padding: '0 8px 6px', display: 'flex', gap: 6 }}>
                <button className="pe-btn p" style={{ flex: 1 }} disabled={!selected.size} onClick={sendSelected}>선택 {selected.size}대 보관</button>
                <button className="pe-btn" disabled={!selected.size} onClick={() => setSelected(new Set())}>전체 해제</button>
              </div>
              <div className="pe-list">
                {selected.size === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>선택 없음</div>}
                {[...selected].sort().map((cn) => (
                  <div key={cn} className="pe-chip" style={{ cursor: 'default', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1 }}>{cn} <span style={{ opacity: .55 }}>{isoToLabel(state.byCn.get(cn)?.iso) || ''}</span></span>
                    <button className="pe-btn r" style={{ padding: '1px 7px', fontSize: 12, lineHeight: 1.3 }} title="선택에서 빼기" onClick={() => dropSel(cn)}>×</button>
                  </div>
                ))}
              </div>
            </>
          ) : tab === 'stg' ? (
            <>
              <div className={`pe-drop${stgOver ? ' over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setStgOver(true); }}
                onDragLeave={() => setStgOver(false)} onDrop={dropStorage}>
                여기로 컨을 끌어다 놓기<br />= 임시창고 보관
              </div>
              <div style={{ padding: '0 8px 6px', display: 'flex', gap: 6 }}>
                <button className="pe-btn p" style={{ flex: 1 }} disabled={!selected.size} onClick={sendSelected}>선택 {selected.size}대 보관</button>
                <button className="pe-btn" disabled={!selected.size} onClick={() => setSelected(new Set())}>전체 해제</button>
              </div>
              <div className="pe-list">
                {stgList.length === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>비어 있음</div>}
                {stgList.map((cn) => (
                  <div key={cn} className="pe-chip" draggable onDragStart={(e) => dragStart(e, cn)} onDragEnd={clearOver} title="베이 칸으로 끌어 배치">
                    {cn} <span style={{ opacity: .55 }}>{isoToLabel(state.byCn.get(cn)?.iso) || ''}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="pe-list">
              {changes.length === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>변경 없음</div>}
              {changes.map((c) => (
                <div key={c.cn} className="pe-chg">
                  <b>{c.shifting ? '◆ ' : ''}{c.cn}</b><br /><i>{c.fromLabel} → {c.toLabel}</i>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {planOpen && (
        <PrintableCargoPlanV2
          containers={editedContainers}
          shipImo={ship?.imoIsNumeric ? ship.imo : ''}
          shipName={ship?.name || dictData?.name}
          voyNo={ship?.voyage}
          mode="loading"
          onClose={() => setPlanOpen(false)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
