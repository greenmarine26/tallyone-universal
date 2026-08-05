// 가이드 작업 패널 (V7.94) — 앱이 크레인 순서대로 다음 컨테이너를 예측 제시, 검수사는 확인/수정만
// 흐름: 장비(호기) 결정 → 접안 방향(좌/우현, 확인 후 저장) → 베이 그룹 결정 → 예측 카드
// 설정 칩(장비·접안·베이)은 항상 표시 — 탭하면 해당 단계로 돌아가 변경 (접안 변경은 재확인)
// 수정 3연속 = 플랜대로 진행되지 않음 판단 → 자동으로 수동 모드 전환
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Check, Pencil, Hand, Link2, ChevronLeft, Volume2, VolumeX, AlertTriangle, Snowflake, Loader2, Anchor, Construction } from 'lucide-react';
import { buildGuidedQueue, availableCardsOf, conClassOf, cardMatchesPref } from '../guidedQueue.js';
import { getBayPairs, findTwinCandidate } from '../twin.js';
import { bayGroupCenter } from '../swapGrade.js';   // TallyOne 1.8-09: 해치 그룹 계산 단일 소스
import { getShipBayDictData } from '../shipStructure.js';
import { NUM_INPUT_PROPS } from '../inputUtils.js';
import { fbCompleteContainer, fbCompleteContainersAtomic, fbUpdateVoyageInfo, fbUpdateRecordSeal, fbSetXraySeal, fbReassignContainerPosition, fbAddWorkReport, fbSetInspectorActivity } from '../firebase.js';
import { speak, spellKo } from '../voice.js';
import { getEquipNumber, setEquipNumber, formatWt, getPierFromBerth, equipNumbersForPier } from '../utils.js';
import { buildHatchMessage, shareText } from '../kakaoShare.js';
import { TWIN_MAX_TOTAL_KG, twinDiffLimit } from '../nlSearch.js';

const AUTO_MANUAL_THRESHOLD = 3;   // 수정 연속 N회 → 수동 전환
// V8.50: 갈림 부류 라벨 (streamPref 키 → 표시·음성)
const PREF_LABEL = { F: '풀', E: '엠티', RF: '리퍼', GEN: '일반', '40': '40피트', '20': '20피트' };

// V9.12(2026-07-27): 양하 홀드까지 끝났을 때 "해치커버 닫을까요?"를 물을지 판정.
//   사용자 확정 — 선적 여부를 확인해서 **선적이 없을 때만** 묻는다.
//     · 그 베이 그룹에 평택 선적분이 있으면(완료·미완료 무관) 묻지 않는다 → 닫는 건 선적 흐름이 맡는다.
//     · 선적 자료(위치 있는 선적 컨)가 아예 없으면 = 모름 → 묻지 않는다.
//       (종전에는 '선적 EDI 미도착'이 '선적 없음'으로 읽혀 닫자고 물었다 — 그 구멍을 막는다.)
//   holdDone = 그 그룹 홀드에서 평택 양하분을 실제로 한 대라도 쳤는가(작업한 그룹만 대상).
export function shouldAskHatchClose(allContainers, group, centerOf) {
  const list = Array.isArray(allContainers) ? allContainers : [];
  const holdDone = list.some(c => c._mode === 'discharge' && c._ptk && c._comp &&
    centerOf(c.bay) === group && parseInt(c.tier, 10) < 80);
  if (!holdDone) return false;
  const loadingKnown = list.some(c => c._mode === 'loading' && centerOf(c.bay) != null);
  if (!loadingKnown) return false;                 // 선적을 모름 → 묻지 않음
  const loadingHere = list.some(c => c._mode === 'loading' && c._ptk && centerOf(c.bay) === group);
  if (loadingHere) return false;                   // 이 그룹에 선적 있음 → 묻지 않음
  return true;                                     // 선적 자료가 있고, 이 그룹엔 선적 없음 → 묻는다
}

export default function GuidedWorkPanel({ voyage, voyageKey, inspector, allContainers, workFilter, onSwitchManual, onOpenContainer, onPlaceUnassigned = null }) {   // V9.28
  const mode = workFilter;                                  // 'discharge' | 'loading'
  const shipImo = voyage?.info?.imo || '';
  const shipName = voyage?.info?.vsl || '';
  // V8.09-17 (메모4)→V8.10: 해치커버 계산·보고를 하지 않는 선박들.
  //   TMPZ는 해치가 자동(유압식)이고, TNJP·RZOR·OBWH도 해치커버 계산 대상이 아니다(사용자 확정 2026-06-19).
  //   네 선박은 해치 대신 주야간 작업갯수를 기록한다(작업보고 WorkReportModal의 주야간 보고). vsl/vslFull 어디든 매칭되면 해치 프롬프트·계산·보고를 건너뛴다.
  const isHatchSkipShip = /TMPZ|TNJP|RZOR|OBWH/i.test(`${voyage?.info?.vsl || ''} ${voyage?.info?.vslFull || ''}`);
  const berthSide = voyage?.info?.berthSide || '';          // 'starboard'(우현) | 'port'(좌현)
  // V8.10: 부두별 장비 목록. PCTC 1~4호기, PNCT 1~5호기(여객석 RORO 1대 추가). 부두 미상이면 1~5 전체.
  const equipNumbers = equipNumbersForPier(getPierFromBerth(voyage?.info?.berth || ''));

  // 장비(호기) — 헤더와 동일한 localStorage 공유 + equipChanged 이벤트 동기화
  const [equip, setEquip] = useState(getEquipNumber());
  const [equipStep, setEquipStep] = useState(() => !getEquipNumber());   // V7.94-23: 장비 미선택 시에만 선택 화면. 이미 있으면 건너뜀(로그인·선박선택 직후 1회만, 교체는 헤더 🏗 탭)
  useEffect(() => {
    const h = (e) => setEquip(e.detail || getEquipNumber());
    window.addEventListener('equipChanged', h);
    return () => window.removeEventListener('equipChanged', h);
  }, []);
  const pickEquip = (num) => {
    setEquipNumber(num);
    setEquip(num);
    window.dispatchEvent(new CustomEvent('equipChanged', { detail: num }));
    setEquipStep(false);
  };

  const [selectedGroup, setSelectedGroup] = useState(null); // 그룹 center 베이 번호
  const [selectedTier, setSelectedTier] = useState(null);   // V7.99-8 (메모6): 'hold'|'deck' — 검수사가 누른 작업 단
  // V8.50: 갈림 선택 — 검수사(또는 무언 적응)가 고른 부류 스트림. null = 기본 층 순서.
  const [streamPref, setStreamPref] = useState(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixQuery, setFixQuery] = useState('');
  // V7.94-08: 트윈 수정 — 앞/뒤 두 컨 번호 동시 수정 (사용자 메모 ⑤)
  const [fixQuery2, setFixQuery2] = useState('');
  const [fixPickFront, setFixPickFront] = useState(null);
  const [fixPickBack, setFixPickBack] = useState(null);
  // V7.94-08: 홀드 선적 완료 → 다음 베이 선택 프롬프트 (사용자 메모 ②)
  const [deckPromptDone, setDeckPromptDone] = useState(false);
  // V7.94-16: 해치커버 프롬프트 (사용자 요구 — 베이 데크/홀드 완료 시 해치 액션 선택창)
  // V7.99-9 (메모10): 로컬 state만 쓰면 자동→수동→자동 전환 시 GuidedWorkPanel이 언마운트·재마운트되어
  //   플래그가 false로 초기화 → 이미 처리한 해치 프롬프트가 또 떠 다시 눌러야 다음 진행됨.
  //   해결: voyage.info.hatchDone({"discharge_12":"open"...})에 영속 기록하고, 로컬 OR 영속으로 판정.
  const [hatchOpenDone, setHatchOpenDone] = useState(false);    // 양하: 데크 완료 → 오픈 프롬프트 처리됨(로컬 즉시반영)
  const [hatchCloseDone, setHatchCloseDone] = useState(false);  // 홀드 완료 → 클로즈 보고 발송됨(로컬 즉시반영)
  const [hatchBusy, setHatchBusy] = useState(false);
  const [consecFix, setConsecFix] = useState(0);
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  // V7.94-05: 카드 내 실번호/XRAY 번호 인라인 입력 (검수사가 카드에서 바로 확인·입력)
  const [editSealCn, setEditSealCn] = useState(null);
  const [sealVal, setSealVal] = useState('');
  const [editXCn, setEditXCn] = useState(null);
  const [xVal, setXVal] = useState('');
  const [xEVal, setXEVal] = useState('');

  // V8.09-16 (사용자 보고 2026-06-18): 실번호 중복 입력 차단. 같은 항차·같은 모드 안에서
  //   같은 실번호를 서로 다른 컨에 입력하면 막는다. 예외: '0000'(실 부족 표기)은 중복 허용.
  //   일반 실(c.sl)·XRAY 실(c._xraySeal.seal) 각각 자기 종류끼리만 비교한다.
  const dupSealOwner = (val, selfCn, kind) => {
    const v = String(val || '').trim();
    if (!v || v === '0000') return null;   // 빈값·0000은 검사 제외
    for (const o of allContainers) {
      if (!o || o.cn === selfCn || o._mode !== mode) continue;
      const ov = kind === 'xray'
        ? String(o._xraySeal?.seal || '').trim()
        : String(o.sl || '').trim();
      if (ov && ov === v) return o.cn;
    }
    return null;
  };

  const saveSeal = async (c) => {
    const dup = dupSealOwner(sealVal, c.cn, 'normal');
    if (dup) { alert(`실번호 중복입니다.\n${sealVal.trim()} 은(는) 이미 ${dup.slice(-4)} 컨에 입력돼 있습니다.\n(실 부족이면 0000으로 입력하세요.)`); return; }
    await fbUpdateRecordSeal(voyageKey, mode, c.cn, sealVal.trim(), inspector);
    setEditSealCn(null); setSealVal('');
  };
  const saveXSeal = async (c) => {
    const dup = dupSealOwner(xVal, c.cn, 'xray');
    if (dup) { alert(`XRAY 실번호 중복입니다.\n${xVal.trim()} 은(는) 이미 ${dup.slice(-4)} 컨에 입력돼 있습니다.\n(실 부족이면 0000으로 입력하세요.)`); return; }
    await fbSetXraySeal(voyageKey, c.cn, xVal.trim(), xEVal.trim(), inspector);
    setEditXCn(null); setXVal(''); setXEVal('');
  };

  // 접안 방향 저장 — 오선택 방지: 확인 후 저장
  const pickBerth = (side) => {
    const label = side === 'starboard' ? '우현' : '좌현';
    const seaRows = side === 'starboard' ? '짝수' : '홀수';
    if (!window.confirm(`접안 방향을 [${label} 접안]으로 저장합니다.\n(${seaRows} 로우가 해상쪽)\n\n양하/선적 순서가 모두 이 기준으로 계산됩니다. 맞습니까?`)) return;
    // V9.57(I8): fire-and-forget 저장 실패가 조용히 사라지던 것 — 실패를 알린다
    fbUpdateVoyageInfo(voyageKey, { berthSide: side })
      .catch(e => { console.warn('[V9.57] 접안 방향 저장 실패', e); alert('접안 방향 저장에 실패했습니다. 네트워크 확인 후 다시 선택해 주세요.'); });
  };
  const changeBerth = () => {
    if (!window.confirm('접안 방향을 변경하면 작업 순서(육상↔해상)가 뒤집힙니다.\n변경 화면으로 이동할까요?')) return;
    fbUpdateVoyageInfo(voyageKey, { berthSide: '' })
      .catch(e => { console.warn('[V9.57] 접안 방향 초기화 실패', e); alert('접안 방향 초기화에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.'); });  // V9.57(I8)
    setSelectedGroup(null);
  };

  // 모드 작업분 (평택분, 미완료)
  const remaining = useMemo(
    () => allContainers.filter(c => c._mode === mode && c._ptk && !c._comp && c.bay && c.row && c.tier),
    [allContainers, mode]
  );
  const modeAll = useMemo(
    () => allContainers.filter(c => c._mode === mode && c._ptk && c.bay),
    [allContainers, mode]
  );

  const bayPairs = useMemo(() => getBayPairs(modeAll, shipImo, shipName), [modeAll, shipImo, shipName]);

  // 베이 → 그룹 center (홀수+짝꿍은 사이 짝수가 center, 단독 홀수는 자기 자신)
  // TallyOne 1.8-09: 계산을 swapGrade.bayGroupCenter 로 단일화.
  //   수동 해치 보고(WorkReportModal)가 같은 그룹 키를 찍어야 자동 유도가 그걸 알아본다.
  //   두 곳이 각자 계산하면 반드시 갈라진다.
  const groupCenterOf = (bayStr) => bayGroupCenter(bayStr, bayPairs);

  // V7.99-9 (메모10): 해치 처리 영속 상태 — voyage.info.hatchDone["{mode}_{center}"] = 'open'|'close'
  //   모드 전환으로 재마운트돼도 voyage prop은 유지되므로 프롬프트가 다시 안 뜬다.
  const hatchKeyOf = (center) => `${mode}_${center}`;
  const isHatchDoneSaved = (center, action) => {
    if (center == null) return false;
    if (voyage?.info?.hatchDone?.[hatchKeyOf(center)] === action) return true;
    // TallyOne 1.8-10: **보고 기록으로 소급 인식**한다.
    //   검수사 지적 2026-08-05 — "닫았는데 또 닫았다는 이야기인데 맞질 않습니다."
    //   1.8-09 는 앞으로의 수동 보고만 hatchDone 에 찍는다. 그러면 이미 보낸 옛 보고
    //   (04:15·04:58 베이 18 CLOSE 등)는 여전히 되묻고, 거기서 누르면 **카톡이 또 나가**
    //   이미 닫은 커버를 또 닫았다고 보고하게 된다. 이중 보고가 되물음보다 나쁘다.
    //   → hatchDone 은 빠른 표시일 뿐이고 **reports 가 진실**이다. 둘 다 본다.
    //   ⚠ 옛 기록엔 mode 가 없다. 있으면 대조하고, 없으면 action+그룹만 맞으면 인정한다 —
    //     잘못 인정해도 결과는 '안 물어봄'이고 필요하면 수동 보고로 언제든 보낼 수 있다.
    const reps = voyage?.reports;
    if (reps) {
      for (const r of Object.values(reps)) {
        if (!r || r.type !== 'hatch' || r.action !== action) continue;
        if (r.mode && r.mode !== mode) continue;
        const bs = Array.isArray(r.bays) ? r.bays : [];
        if (bs.some(b => groupCenterOf(b) === center)) return true;
      }
    }
    return false;
  };
  const markHatchDone = async (center, action) => {
    if (center == null) return;
    const prev = voyage?.info?.hatchDone || {};
    // V9.57(I8): 빈 catch로 조용히 실패하던 것 — 저장 안 되면 모드 전환 때 프롬프트가 또 뜬다. 알린다.
    try { await fbUpdateVoyageInfo(voyageKey, { hatchDone: { ...prev, [hatchKeyOf(center)]: action } }); }
    catch (e) {
      console.warn('[V9.57] 해치 처리 상태 저장 실패', e);
      alert('해치 처리 상태 저장에 실패했습니다.\n(저장 안 되면 모드 전환 시 해치 안내가 다시 뜰 수 있습니다.)');
    }
  };

  // 그룹 목록 (남은 작업이 있는 그룹만) — V7.94-23: 홀드/데크 잔여 구분
  // V7.99-8 (메모6): 단(홀드/데크) 선택 버튼에 규격별(20FT/40FT) 내역 표시용 집계 추가.
  const groups = useMemo(() => {
    const is40 = (c) => { const f = String(c.iso || '')[0]; return f === '4' || f === 'L' || f === '9' || String(c.tp || '').includes('40'); };
    const map = {};
    for (const c of remaining) {
      const center = groupCenterOf(c.bay);
      if (center == null) continue;
      const g = (map[center] ||= { center, bays: new Set(), count: 0, deck: 0, hold: 0, deck20: 0, deck40: 0, hold20: 0, hold40: 0 });
      g.bays.add(parseInt(c.bay, 10));
      g.count++;
      const isDeck = parseInt(c.tier, 10) >= 80, big = is40(c);
      if (isDeck) { g.deck++; if (big) g.deck40++; else g.deck20++; }
      else { g.hold++; if (big) g.hold40++; else g.hold20++; }
    }
    return Object.values(map).sort((a, b) => a.center - b.center);
  }, [remaining, bayPairs]);

  // 선택 그룹의 예측 큐 — V7.99-8 (메모6): 선택된 단(selectedTier)만 큐에 (홀드 작업=홀드만/데크 작업=데크만)
  const queue = useMemo(() => {
    if (selectedGroup == null) return [];
    let targets = remaining.filter(c => groupCenterOf(c.bay) === selectedGroup);
    if (selectedTier === 'deck') targets = targets.filter(c => parseInt(c.tier, 10) >= 80);
    else if (selectedTier === 'hold') targets = targets.filter(c => parseInt(c.tier, 10) < 80);
    return buildGuidedQueue({
      containers: targets, mode,
      evenRowsSeaSide: berthSide === 'starboard',           // 우현 접안 = 짝수 로우 해상쪽
      findTwin: (t, all, used) => findTwinCandidate(t, all, used, shipImo, shipName),
      streamPref,                                           // V8.50: 갈림 선택 부류
    });
  }, [remaining, selectedGroup, selectedTier, mode, berthSide, bayPairs, shipImo, shipName, streamPref]);

  const card = queue[0] || null;

  // V8.50: 갈림 감지 — 지금 바로 내릴 수 있는 카드들에 부류가 섞여 있으면 선택 버튼 제시 (양하만).
  const availCards = useMemo(() => (mode === 'discharge' ? availableCardsOf(queue) : []), [queue, mode]);
  const forkChips = useMemo(() => {
    if (mode !== 'discharge' || availCards.length < 2) return null;
    const cnt = { F: 0, E: 0, RF: 0, GEN: 0, '40': 0, '20': 0 };
    for (const cd of availCards) {
      const k = conClassOf(cd.main);
      const size = cd.twin ? '20' : k.size;
      cnt[k.fe]++; cnt[size]++;
      if (k.fe === 'F') cnt[k.rf ? 'RF' : 'GEN']++;
    }
    const chips = [];
    if (cnt.F && cnt.E) chips.push(['F', cnt.F], ['E', cnt.E]);
    if (cnt.GEN && cnt.RF) chips.push(['GEN', cnt.GEN], ['RF', cnt.RF]);
    if (cnt['40'] && cnt['20']) chips.push(['40', cnt['40']], ['20', cnt['20']]);
    return chips.length ? chips : null;
  }, [availCards, mode]);

  // V8.50: 선택 부류가 소진되면 자동 해제 — 기본 층 순서로 복귀.
  useEffect(() => {
    if (!streamPref) return;
    if (!queue.some(cd => cardMatchesPref(cd, streamPref))) setStreamPref(null);
  }, [queue, streamPref]);

  // V8.50: 무언 적응 — 예측과 다른 컨이 실제로 내려오면(수정 입력) 그 부류를 흐름으로 잡는다 (양하만).
  const adaptStream = (actual) => {
    if (mode !== 'discharge' || !card?.main || !actual) return;
    const ac = conClassOf(actual), pc = conClassOf(card.main);
    let next = null;
    if (ac.fe !== pc.fe) next = ac.fe;
    else if (ac.fe === 'F' && ac.rf !== pc.rf) next = ac.rf ? 'RF' : 'GEN';
    else if (ac.size !== pc.size) next = ac.size;
    if (next && next !== streamPref) { setStreamPref(next); speak(`${PREF_LABEL[next]} 흐름으로 바꿉니다`); }
  };

  // V7.99-6 (메모3): 트윈 카드 무게 점검 — 합계 55톤 초과 = 트윈 불가, 무게차 부두한계 초과 = 수평 불가.
  //   nlSearch의 검증된 상수 재사용. 부두는 voyage.info.pier(미상이면 보수적 14톤).
  const twinWtWarn = useMemo(() => {
    if (!card?.twin) return null;
    const wa = parseInt(card.main.wt, 10) || 0, wb = parseInt(card.twin.wt, 10) || 0;
    if (!wa || !wb) return { noWt: true };
    const total = wa + wb, diff = Math.abs(wa - wb);
    const limit = twinDiffLimit(voyage?.info?.pier);
    if (total > TWIN_MAX_TOTAL_KG) return { over: true, total, diff };
    if (diff > limit) return { imbal: true, total, diff, limit };
    return null;
  }, [card, voyage]);

  const groupDone = useMemo(() => {
    if (selectedGroup == null) return 0;
    return allContainers.filter(c => c._mode === mode && c._ptk && c._comp && groupCenterOf(c.bay) === selectedGroup).length;
  }, [allContainers, mode, selectedGroup, bayPairs]);
  const groupTotal = groupDone + (selectedGroup == null ? 0 : remaining.filter(c => groupCenterOf(c.bay) === selectedGroup).length);

  // V7.99-8 (메모6): 현재 작업 위치(호기·베이·홀드/데크·잔여 컨번호 리스트)를 inspector 활동에 기록 →
  //   수석이 베이상세에서 "N호기 · 20번 홀드 · 남은 N개"를 보고 그 화면을 연다.
  //   작업 단 = 검수사가 명시적으로 누른 selectedTier(자동판단 아님 — 수석에게 의도를 전달하려면 검수사가 눌러야 함).
  const tierRemainConts = useMemo(() => {
    if (selectedGroup == null || !selectedTier) return [];
    return remaining.filter(c => groupCenterOf(c.bay) === selectedGroup &&
      (selectedTier === 'deck' ? parseInt(c.tier, 10) >= 80 : parseInt(c.tier, 10) < 80));
  }, [remaining, selectedGroup, selectedTier, bayPairs]);
  const tierRemainList = useMemo(() => tierRemainConts.map(c => c.cn), [tierRemainConts]);
  const bayLabelOf = (center) => {
    const bays = groupBaysOf(center);
    if (bays.length === 0) return center != null ? String(center).padStart(2, '0') : '';
    if (bays.length === 1) return bays[0];
    return `${bays[0]}-${bays[bays.length - 1]}`;  // 예: 19-21
  };
  useEffect(() => {
    if (!inspector) return;
    if (selectedGroup == null || !selectedTier) {
      // 베이/단 미선택 = 위치 정보 클리어(항차·모드는 유지)
      fbSetInspectorActivity(inspector, voyageKey, mode).catch(e => console.warn('[V9.57] 활동 위치 클리어 실패', e));  // V9.57(I8): 무음 catch → 로그
      return;
    }
    fbSetInspectorActivity(inspector, voyageKey, mode, {
      equip, bayLabel: bayLabelOf(selectedGroup), tier: selectedTier, remain: tierRemainList.length, auto: true,
    }).catch(e => console.warn('[V9.57] 활동 위치 보고 실패', e));  // V9.57(I8): 무음 catch → 로그
  }, [inspector, voyageKey, mode, equip, selectedGroup, selectedTier, tierRemainList.length]);

  // 카드/선택지 음성 안내는 프롬프트 조건(deckDonePromptD 등) 정의 이후로 이동 — 아래 참조.
  const lastSpokenRef = useRef('');

  // V8.09-06 (사용자 보고 2026-06-18): XRAY 대상은 XRAY 실번호(seal) 입력 전까지 양하확인 차단.
  //   기존엔 검증 없이 바로 완료돼, 실 체결 후 실번호 미입력인데도 양하확인됨.
  //   기준: 양하(discharge)에서 c._xray=true인데 c._xraySeal.seal이 비면 차단(공백도 미입력 취급).
  //   미입력 카드를 alert로 알리고 완료 중단. (선적/비XRAY는 영향 없음.)
  const xraySealMissing = (c) => mode === 'discharge' && c?._xray &&
    !String(c?._xraySeal?.seal || '').trim();
  const blockIfXrayMissing = () => {
    const miss = [];
    if (card?.main && xraySealMissing(card.main)) miss.push(card.main.l4 || card.main.cn?.slice(-4));
    if (card?.twin && xraySealMissing(card.twin)) miss.push(card.twin.l4 || card.twin.cn?.slice(-4));
    if (miss.length) {
      alert(`XRAY 실번호를 먼저 입력하세요.\nXRAY 대상 (${miss.join(', ')})은 실번호 입력 전까지 양하확인할 수 없습니다.`);
      return true;
    }
    return false;
  };

  // 확인 (트윈은 둘 다 한 번에)
  const handleConfirm = async () => {
    if (!card || busy) return;
    if (blockIfXrayMissing()) return;   // V8.09-06: XRAY 실번호 미입력 차단
    setBusy(true);
    try {
      // V8.71: 트윈 완료 2건을 멀티패스 한 번에 — 한 대만 먼저 선적되는 틈 제거.
      if (card.twin) await fbCompleteContainersAtomic(voyageKey, mode, [card.main.cn, card.twin.cn], inspector);
      else await fbCompleteContainer(voyageKey, mode, card.main.cn, inspector);
      setConsecFix(0);
      setFixOpen(false); setFixQuery('');
    } finally { setBusy(false); }
  };

  // 수정: 실제 나온 컨을 입력 → 그 컨을 완료 처리, 예측 컨은 큐에 남음
  // V8.70: 크로스베이 체인시프트 감안 — 그룹·단 제한을 "필터"에서 "정렬 우선순위"로 완화.
  //   (구 V7.99-8: 현재 단으로만 좁힘 → 다른 베이 계획 컨이 실제로 오면 후보 0건, 현장 진행 불가.)
  //   자기 카드의 반대편 컨도 후보 허용(앞뒤 얽힘: 뒤 예측 컨이 앞 자리에 오는 경우) — 그 칸 자신의 컨만 제외.
  const inWorkTier = (c) => {
    if (selectedGroup != null && groupCenterOf(c.bay) !== selectedGroup) return false;
    if (selectedTier === 'deck') return parseInt(c.tier, 10) >= 80;
    if (selectedTier === 'hold') return parseInt(c.tier, 10) < 80;
    return true;
  };
  const matchFor = (q0, excludeCns) => {
    const q = q0.replace(/\s/g, '').toUpperCase();
    if (q.length < 3) return [];
    const ex = new Set((Array.isArray(excludeCns) ? excludeCns : [excludeCns]).filter(Boolean));
    // V8.71: 완료로 기록된 컨도 후보에 포함 — 실물이 눈앞에 있으면 그 완료는 오선적 기록일 확률이 높다(사용자 확정).
    //   렌더에서 ⚠완료 배지 + 선택 시 확인. 정렬은 미완료 우선.
    const hits = modeAll.filter(c => !ex.has(c.cn) &&
      (c.cn.includes(q) || (c.l4 || c.cn.slice(-4)).includes(q)));
    // 정렬: 현재 카드 자리 > 현재 그룹·단 > 그 외(렌더에서 ⚠ 다른 베이 표시). 완료분은 항상 뒤.
    const pos = card?.main?.pos || (card?.main ? `${card.main.bay}-${card.main.row}-${card.main.tier}` : '');
    const rankOf = (c) => (c._comp ? 10 : 0) + (`${parseInt(c.bay,10)}-${c.row}-${c.tier}` === pos ? 0 : (inWorkTier(c) ? 1 : 2));
    return hits.sort((a, b) => rankOf(a) - rankOf(b)).slice(0, 6);
  };
  // V8.71: 완료 컨을 실제 온 컨으로 지정할 때 확인 — 오선적 기록 안내.
  const confirmIfDone = (c) => !c?._comp ||
    confirm(`${c.cn?.slice(-4)}는 이미 선적확인으로 기록된 컨입니다.\n실물이 지금 눈앞에 있다면 앞선 기록이 오선적일 수 있습니다.\n이 자리로 옮기고 진행할까요? (완료 기록은 유지)`);
  const fixMatches = useMemo(() => matchFor(fixQuery, [fixPickBack?.cn, card?.main?.cn]), [fixQuery, remaining, card, fixPickBack]);
  const fixMatches2 = useMemo(() => matchFor(fixQuery2, [fixPickFront?.cn, card?.twin?.cn]), [fixQuery2, remaining, card, fixPickFront]);

  // V7.94-08: 미배정(위치 빠진) 컨 — 수정으로 밀려난 컨테이너 추적 표시 (사용자 메모 ④)
  const unassigned = useMemo(
    () => allContainers.filter(c => c._mode === mode && c._ptk && !c._comp && (!c.bay || !c.row || !c.tier)),
    [allContainers, mode]
  );
  const [showUnassigned, setShowUnassigned] = useState(false);

  // V7.94-16: 그룹(베이) 변경 시 프롬프트 플래그 리셋
  useEffect(() => { setDeckPromptDone(false); setHatchOpenDone(false); setHatchCloseDone(false); setSelectedTier(null); setStreamPref(null); }, [selectedGroup]);
  useEffect(() => { setStreamPref(null); }, [selectedTier]);   // V8.50: 단 변경 시 스트림 리셋

  // V7.94-16: 그룹의 실제 베이 번호들 (해치 보고 표기용)
  // V7.99-6 (메모5): holdOnly=true면 홀드(t<80)에 평택 작업분이 있는 베이만.
  //   해치커버는 홀드 접근을 위한 물리 작업이므로, 데크만 평택분이고 홀드가 전부
  //   통과화물인 베이는 평택에서 열지 않는다(포트 무시하고 전부 오픈하던 버그).
  const groupBaysOf = (center, holdOnly = false) => {
    const set = new Set();
    allContainers.forEach(c => {
      if (c._mode === mode && c._ptk && groupCenterOf(c.bay) === center) {
        if (holdOnly && parseInt(c.tier, 10) >= 80) return;  // 데크분 제외
        const b = parseInt(c.bay, 10);
        if (Number.isFinite(b)) set.add(String(b).padStart(2, '0'));
      }
    });
    return [...set].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  };

  // V7.94-16: 해치커버 보고 발송 (가이드 흐름 통합 — WorkReportModal 해치 보고와 동일 형식)
  // V7.94-22: 그룹 베이들의 해치커버 장수 (매트릭스 hatchCount). 사전 없으면 0 → 메시지에서 베이 개수 폴백.
  // V7.99-6 (메모1): 같은 해치 묶음(트리오: 11·12·13 같은 페어 그룹)은 한 패널을 공유하므로
  //   베이별 hatchCount를 단순 합산하면 중복(2+2+2=6)된다. 같은 groupCenter끼리는 대표값(최댓값)을,
  //   서로 다른 그룹끼리만 합산한다.
  const hatchPanelsOf = (bays) => {
    try {
      const dict = getShipBayDictData(shipImo, shipName);
      const summary = dict?.bayDef?.baysSummary;
      if (!Array.isArray(summary) || !summary.length) return 0;
      const byNo = {};
      summary.forEach(bs => { const no = String(parseInt(bs.bayNo ?? bs.bay, 10)); if (Number.isFinite(parseInt(no,10))) byNo[no] = bs; });
      // groupCenter별로 hatchCount 최댓값을 모은 뒤, 그룹 간 합산
      const byGroup = {};
      let found = false;
      bays.forEach(b => {
        const bs = byNo[String(parseInt(b, 10))];
        if (bs && typeof bs.hatchCount === 'number') {
          found = true;
          const g = String(groupCenterOf(b));
          byGroup[g] = Math.max(byGroup[g] || 0, bs.hatchCount);
        }
      });
      const total = Object.values(byGroup).reduce((s, v) => s + v, 0);
      return found ? total : 0;
    } catch (e) { return 0; }
  };

  // TallyOne 1.8-18: **끝난 모드에서는 유도 해치 보고를 걸지 않는다.**
  //
  // 왜 (STMJ 2643E 2026-08-05 실사건)
  //   양하는 02:16 에 끝났는데, 08:19:08~08:21:07 사이 다른 검수사가 로그인한 2분 동안
  //   08:19:54 `open 05,06,07` · 08:20:25 `open 01,03` 두 건이 찍혔다. 그 커버들은 이미
  //   02:28·03:17 에 닫힌 것이라 타임시트가 "닫고 다시 연 채로 출항"으로 나왔다 — 불가능한 서류다.
  //
  // 왜 걸렸나 — 프롬프트가 **남은 컨테이너 수**만 본다. 그런데 검수원이 앱으로 일일이 체크하지 않아
  //   `remaining` 이 늘 남아 있다(검수사 확정: "검수원이 이 앱을 사용 안 한다는 이야기입니다").
  //   그래서 작업이 끝난 뒤에 들어와도 앱은 "아직 홀드가 남았다"고 믿고 오픈을 권했다.
  //
  // 그래서 판단 근거를 하나 더 둔다 — **완료 보고**. 이건 사람이 명시적으로 누른 것이라 믿을 수 있다.
  const modeFinished = useMemo(() => {
    const inf = voyage?.info || {};
    if (inf.inspectorDone) return true;
    if (mode === 'discharge' && inf.dischargeDone) return true;
    if (mode === 'loading' && inf.loadingDone) return true;
    for (const r of Object.values(voyage?.reports || {})) {
      if (r && r.type === 'work_status' && String(r.action) === `${mode}_done`) return true;
    }
    return false;
  }, [voyage, mode]);

  // TallyOne 1.8-19: **데크에 화물이 얹혀 있으면 그 커버는 열리지 않는다.**
  //
  // 검수사 2026-08-05: "화물이 있는 상태에서 커버를 연다고 열리면 안되니까요"
  //   물리 사실이다. 커버 위에 컨테이너가 한 대라도 있으면 크레인이 패널을 못 든다.
  //
  // ⚠ 종전엔 `deckRemain` 을 **평택분(_ptk)만** 셌다. 그래서 **통과화물**이 데크에 얹혀 있으면
  //   실제로는 못 여는데 앱은 "데크 비었다"고 보고 오픈을 권했다. 통과화물은 평택에서 손대지
  //   않으니 영영 안 빠진다 — 그 커버는 이 항차 내내 못 연다.
  //   (평택분 필터를 안 걸어 오집계하던 9.2-② 패턴의 **거울상**이다. 카운트엔 평택분만,
  //    물리 판단엔 배에 실제로 있는 것 전부.)
  //
  // 지금 데크에 있는 것 —
  //   양하: 아직 안 내린 것(평택분 미완료) + 통과화물 전부
  //   선적: 이미 실은 것(평택분 완료)     + 통과화물 전부
  const deckBlockers = (center) => {
    if (center == null) return [];
    return allContainers.filter((c) => {
      if (groupCenterOf(c.bay) !== center) return false;
      if (parseInt(c.tier, 10) < 80) return false;          // 홀드는 커버 아래다
      if (!c._ptk) return true;                             // 통과화물 — 늘 배 위에 있다
      if (c._mode !== mode) return false;
      return mode === 'discharge' ? !c._comp : !!c._comp;
    });
  };

  const sendHatchReport = async (action) => {
    if (hatchBusy) return;
    setHatchBusy(true);
    try {
      const bays = groupBaysOf(selectedGroup, true);  // V7.99-6: 홀드 평택분 베이만 (메모5)
      if (bays.length === 0) return;  // 열 홀드 없으면 보고 안 함 (finally에서 busy 해제)
      // 1.8-19: 데크에 화물이 얹혀 있으면 오픈은 물리적으로 불가능하다.
      //   자료가 틀렸을 수도 있으니 조용히 막지 않고, 무엇이 막고 있는지 보여 주고 묻는다.
      if (action === 'open') {
        const blk = deckBlockers(selectedGroup);
        if (blk.length) {
          const where = [...new Set(blk.map((c) => `${c.bay}/${c.row}/${c.tier}`))].slice(0, 6).join('  ');
          const thru = blk.filter((c) => !c._ptk).length;
          const ok = window.confirm(
            `이 커버 위 데크에 컨테이너 ${blk.length}대가 있습니다`
            + (thru ? ` (통과화물 ${thru}대 포함)` : '') + '.\n'
            + '화물이 얹힌 커버는 열 수 없습니다.\n\n' + where + '\n\n'
            + '자료가 틀렸다면 그래도 보고할 수 있습니다. 보고할까요?');
          if (!ok) return;
        }
      }
      // 1.8-18: 끝난 모드면 조용히 막지 않고 **사람에게 묻는다** — 진짜 뒤늦은 보고일 수도 있다.
      if (modeFinished) {
        const ok = window.confirm(
          `${mode === 'discharge' ? '양하' : '선적'}는 이미 완료 처리되었습니다.\n`
          + `그래도 해치커버 ${action === 'open' ? '오픈' : '클로즈'} 보고를 남길까요?\n\n`
          + '(실수로 눌렀다면 「취소」 — 마감 서류 타임시트에 그대로 실립니다)');
        if (!ok) return;
      }
      const voy = mode === 'discharge'
        ? (voyage?.info?.voy_d || voyage?.info?.voy || '')
        : (voyage?.info?.voy_l || voyage?.info?.voy || '');
      const panelCount = hatchPanelsOf(bays);
      const message = buildHatchMessage({ vsl: shipName, voy, bays, action, time: Date.now(), equip, panelCount });
      // V9.57(I8): DB 기록 실패를 삼키고 카톡만 나가던 것 — 수석 대시보드엔 보고가 없는데
      //   카톡엔 있는 불일치가 생겼다. 재시도 1회 후에도 실패면 공유 진행 여부를 묻는다.
      let dbOk = false;
      try { await fbAddWorkReport(voyageKey, { type: 'hatch', action, mode, bays, equip, panelCount, message }); dbOk = true; }
      catch (e1) {
        console.warn('[V9.57] 해치 보고 DB 기록 실패 — 1회 재시도', e1);
        try { await fbAddWorkReport(voyageKey, { type: 'hatch', action, mode, bays, equip, panelCount, message }); dbOk = true; }
        catch (e2) { console.warn('[V9.57] 해치 보고 DB 기록 재시도 실패', e2); }
      }
      if (!dbOk) {
        const goOn = window.confirm('해치 보고 DB 기록에 실패했습니다 (재시도 포함).\n수석 대시보드에는 이 보고가 남지 않습니다.\n\n카톡 공유만 진행할까요?');
        if (!goOn) return;  // finally에서 busy 해제
      }
      await shareText(message, '해치커버');
    } finally { setHatchBusy(false); }
  };

  // V7.94-16: 양하 — 베이 데크 완료 → [해치커버 오픈 → 홀드 진행] / [다른 데크 이동] (사용자 요구)
  const deckDonePromptD = useMemo(() => {
    if (isHatchSkipShip) return false;  // V8.10: TMPZ·TNJP·RZOR·OBWH 해치 계산/보고 안 함
    if (modeFinished) return false;   // 1.8-18: 끝난 모드엔 권하지 않는다
    if (mode !== 'discharge' || hatchOpenDone || isHatchDoneSaved(selectedGroup, 'open') || selectedGroup == null) return false;
    const groupRemain = remaining.filter(c => groupCenterOf(c.bay) === selectedGroup);
    const deckRemain = groupRemain.filter(c => parseInt(c.tier, 10) >= 80).length;
    if (deckBlockers(selectedGroup).length) return false;   // 1.8-19: 화물이 얹힌 커버는 권하지 않는다
    const holdRemain = groupRemain.filter(c => parseInt(c.tier, 10) < 80).length;
    const deckDone = allContainers.filter(c => c._mode === mode && c._ptk && c._comp &&
      groupCenterOf(c.bay) === selectedGroup && parseInt(c.tier, 10) >= 80).length;
    return deckRemain === 0 && holdRemain > 0 && deckDone > 0;
  }, [mode, hatchOpenDone, selectedGroup, remaining, allContainers, bayPairs, voyage, modeFinished]);

  // V7.94-16: 양하 — 그룹 홀드까지 완료 시 클로즈 제안 조건 (그룹 완료 화면에서 사용)
  // V8.09-05 (사용자 보고 2026-06-18): 같은 베이 그룹에 선적할 평택분이 남아 있으면 닫지 않는다.
  //   현장 순서 = 양하 끝 → (그 홀드에 실을 게 있으면) 선적 먼저 → 선적까지 끝나야 해치 클로즈.
  // V9.12 (사용자 확정 2026-07-27): "선적 여부 확인 후 선적이 없을 때만 질문. 모를 때·있을 때는 묻지 않는다."
  //   종전 구멍 — 선적 EDI가 아직 안 온 상태(=모름)가 loadRemain=0으로 읽혀 닫자고 물었다.
  //   판정은 shouldAskHatchClose()에 모아 두었다(순수 함수 — 시뮬 검증용).
  const holdWorkedD = useMemo(() => {
    if (isHatchSkipShip) return false;  // V8.10: 해치 클로즈 제안 안 함
    if (modeFinished) return false;   // 1.8-18
    if (mode !== 'discharge' || selectedGroup == null) return false;
    return shouldAskHatchClose(allContainers, selectedGroup, groupCenterOf);
  }, [mode, selectedGroup, allContainers, bayPairs, modeFinished]);

  // V7.94-08: 홀드 선적 완료 → 데크 진입 전 베이 선택 프롬프트 조건 (사용자 메모 ②)
  const holdDonePrompt = useMemo(() => {
    if (isHatchSkipShip) return false;  // V8.10: 해치 닫기 제안 안 함
    if (modeFinished) return false;   // 1.8-18
    if (mode !== 'loading' || deckPromptDone || selectedGroup == null) return false;
    const groupRemain = remaining.filter(c => groupCenterOf(c.bay) === selectedGroup);
    if (groupRemain.length === 0) return false;
    const holdRemain = groupRemain.filter(c => parseInt(c.tier, 10) < 80).length;
    const deckDone = allContainers.filter(c => c._mode === mode && c._ptk && c._comp &&
      groupCenterOf(c.bay) === selectedGroup && parseInt(c.tier, 10) >= 80).length;
    return holdRemain === 0 && deckDone === 0 && groupDone > 0;
  }, [mode, deckPromptDone, selectedGroup, remaining, allContainers, groupDone, bayPairs, modeFinished]);

  // V8.09-15 (사용자 점검 2026-06-18): 해치커버/베이 선택 갈림길 음성 처리.
  //   ① 선택 배너가 떠 있는 동안에는 "다음 컨테이너" 음성을 막는다(어디로 갈지 미정인데 앞서 말하던 버그).
  //   ② 대신 선택지 자체를 음성으로 읽어준다(문구 1가). ③ 12초 무응답이면 1회 반복, 선택/배너 사라지면 즉시 멈춤.
  //   prompt 종류: 'deckD'(양하 데크완료→홀드) / 'holdL'(선적 홀드완료→데크) / 'holdCloseD'(양하 홀드완료→닫기).
  const choicePrompt = useMemo(() => {
    if (deckDonePromptD && card) return 'deckD';
    if (holdDonePrompt && card) return 'holdL';
    if (mode === 'discharge' && holdWorkedD && !hatchCloseDone && !isHatchDoneSaved(selectedGroup, 'close') && !card) return 'holdCloseD';
    return null;
  }, [deckDonePromptD, holdDonePrompt, holdWorkedD, hatchCloseDone, selectedGroup, mode, card]);

  const CHOICE_VOICE = {
    deckD: '데크 양하 완료. 해치커버를 열까요, 다른 데크로 갈까요.',
    holdL: '홀드 선적 완료. 해치커버를 닫을까요, 다른 베이 홀드로 갈까요.',
    holdCloseD: '홀드 작업 끝. 해치커버를 닫을까요.',
  };

  // 선택지 음성 — 배너가 떠 있는 동안 읽고, 12초마다 1회 반복(무응답 대비). 선택/사라짐 시 정지.
  const lastChoiceRef = useRef('');
  useEffect(() => {
    if (!choicePrompt || !voiceOn) { lastChoiceRef.current = ''; return; }
    if (lastChoiceRef.current !== choicePrompt) {
      lastChoiceRef.current = choicePrompt;
      speak(CHOICE_VOICE[choicePrompt]);
    }
    const t = setInterval(() => { speak(CHOICE_VOICE[choicePrompt]); }, 12000);
    return () => clearInterval(t);
  }, [choicePrompt, voiceOn]);

  // 다음 컨테이너 음성 — 단, 선택 배너가 떠 있으면 말하지 않는다(choicePrompt 가드).
  useEffect(() => {
    if (!card || !voiceOn || choicePrompt) return;
    const key = card.main.cn + (card.twin?.cn || '');
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    const parts = [`다음, ${spellKo(card.main.l4 || card.main.cn.slice(-4))}`];
    if (card.twin) parts.push(`트윈 ${spellKo(card.twin.l4 || card.twin.cn.slice(-4))}`);
    if (card.main._xray || card.twin?._xray) parts.push('엑스레이');
    speak(parts.join(', '));
  }, [card, voiceOn, choicePrompt]);

  // 수정 1대 적용: 선적이면 실제 컨을 예측 슬롯 위치로 재배정(그 자리 예측 컨은 자동 미배정+완료취소 — 이중 수정 방지) 후 완료
  const applyFixOne = async (actual, slot) => {
    if (mode === 'loading') {
      await fbReassignContainerPosition(voyageKey, mode, actual.cn, slot.bay, slot.row, slot.tier, inspector);
    }
    await fbCompleteContainer(voyageKey, mode, actual.cn, inspector);
  };

  // V8.09-17 (메모6): 트윈 앞뒤 맞교환 — 선적 시 앞/뒤 위치가 바뀌어 들어가는 경우가 많아,
  //   버튼 한 번으로 두 컨의 자리만 맞바꾼다. 완료 처리는 안 함(위치만 교환).
  //   fbReassign이 swap을 지원: 앞 컨을 뒤 자리로 보내면 자리를 뺏긴 뒤 컨이 앞 자리로 자동 이동.
  const swapTwinPos = async () => {
    if (busy || !card?.main || !card?.twin) return;   // V8.25: 양하·선적 모두 허용
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    const a = card.main, b = card.twin;
    if (!confirm(`앞뒤 위치를 맞바꿉니다.\n앞 ${a.cn.slice(-4)} ↔ 뒤 ${b.cn.slice(-4)}\n(자리만 교환, 완료 처리는 안 됨)`)) return;
    setBusy(true);
    try {
      // 앞 컨을 뒤 자리로 → swap 로직이 뒤 컨을 앞 자리로 이동시킴
      await fbReassignContainerPosition(voyageKey, mode, a.cn, b.bay, b.row, b.tier, inspector);
      speak('앞뒤 위치를 맞바꿨습니다');
    } finally { setBusy(false); }
  };

  const afterFix = () => {
    const n = consecFix + 1;
    setConsecFix(n);
    setFixOpen(false); setFixQuery(''); setFixQuery2(''); setFixPickFront(null); setFixPickBack(null);
    if (n >= AUTO_MANUAL_THRESHOLD) {
      speak('수동 모드로 전환합니다');
      alert(`수정이 ${AUTO_MANUAL_THRESHOLD}회 연속되었습니다.\n플랜대로 진행되지 않는 것으로 판단해 수동 모드로 전환합니다.`);
      onSwitchManual?.();
    }
  };

  // V8.09-06: fix 경로용 — 실제 배정될 컨(actual)의 XRAY 실번호 검증.
  //   actual은 검색결과 객체라 _xray/_xraySeal가 없을 수 있어 allContainers에서 원본을 찾아 확인.
  const xrayMissingByCn = (cn) => {
    if (mode !== 'discharge' || !cn) return false;
    const src = allContainers.find(x => x.cn === cn && x._mode === mode) || {};
    if (!src._xray) return false;
    return !String(src._xraySeal?.seal || '').trim();
  };

  // 단독 카드 수정: 실제 온 컨 1대
  const handleFixPick = async (c) => {
    if (busy || !card) return;
    if (xrayMissingByCn(c.cn)) {   // V8.09-06: 실제 컨이 XRAY 대상인데 실번호 미입력이면 차단
      alert(`XRAY 실번호를 먼저 입력하세요.\n${c.cn?.slice(-4)}은 XRAY 대상으로 실번호 입력 전까지 양하확인할 수 없습니다.`);
      return;
    }
    if (!confirmIfDone(c)) return;   // V8.71: 완료 기록된 컨이면 오선적 안내 후 진행
    setBusy(true);
    try {
      await applyFixOne(c, card.main);
    } finally { setBusy(false); }
    adaptStream(c);   // V8.50: 실제 내려온 부류로 재앵커
    afterFix();
  };

  // 트윈 카드 수정: 앞/뒤 동시 — 바뀐 슬롯은 재배정+완료, 안 바뀐 슬롯은 예측 컨 그대로 완료
  const handleTwinFixApply = async () => {
    if (busy || !card || !card.twin) return;
    if (!fixPickFront && !fixPickBack) { alert('수정할 컨테이너를 선택하세요. (한쪽만 바뀌었으면 그쪽만 선택)'); return; }
    // V8.70: 한쪽만 선택하고 적용하면 나머지는 "예측대로" 완료된다 — 실물이 정말 예측 컨인지 확인.
    //   (둘 다 틀렸는데 한쪽만 수정·적용 → 남은 쪽이 허위 완료되던 함정.)
    if (!fixPickFront || !fixPickBack) {
      const sideName = !fixPickFront ? '앞' : '뒤';
      const sideCn = !fixPickFront ? card.main.cn : card.twin.cn;
      if (!confirm(`${sideName} 자리는 예측 컨 ${(sideCn || '').slice(-4)} 그대로 맞습니까?\n[확인] → 예측대로 완료 처리\n둘 다 틀렸으면 [취소] 후 ${sideName}쪽도 수정하세요.`)) return;
    }
    // V8.09-06: XRAY 실번호 검증 — 바뀐 쪽은 실제 컨, 안 바뀐 쪽은 예측 컨 기준.
    const frontCn = fixPickFront ? fixPickFront.cn : card.main.cn;
    const backCn = fixPickBack ? fixPickBack.cn : card.twin.cn;
    const frontMiss = fixPickFront ? xrayMissingByCn(frontCn) : xraySealMissing(card.main);
    const backMiss = fixPickBack ? xrayMissingByCn(backCn) : xraySealMissing(card.twin);
    if (frontMiss || backMiss) {
      const miss = [frontMiss && frontCn?.slice(-4), backMiss && backCn?.slice(-4)].filter(Boolean);
      alert(`XRAY 실번호를 먼저 입력하세요.\nXRAY 대상 (${miss.join(', ')})은 실번호 입력 전까지 양하확인할 수 없습니다.`);
      return;
    }
    if ((fixPickFront && !confirmIfDone(fixPickFront)) || (fixPickBack && !confirmIfDone(fixPickBack))) return;   // V8.71
    setBusy(true);
    // V8.71: 원자화 — 재배정(위치)을 앞·뒤 모두 끝낸 뒤에만 완료를 찍는다.
    //   (구: 앞 재배정+완료 → 뒤 재배정+완료 순서라, 뒤가 중간에 실패하면 앞 한 대만 선적된 채 멈춤 — 현장 보고 2026-07-08.)
    try {
      if (mode === 'loading') {
        if (fixPickFront) await fbReassignContainerPosition(voyageKey, mode, fixPickFront.cn, card.main.bay, card.main.row, card.main.tier, inspector);
        if (fixPickBack) await fbReassignContainerPosition(voyageKey, mode, fixPickBack.cn, card.twin.bay, card.twin.row, card.twin.tier, inspector);
      }
      await fbCompleteContainersAtomic(voyageKey, mode,
        [fixPickFront ? fixPickFront.cn : card.main.cn, fixPickBack ? fixPickBack.cn : card.twin.cn], inspector);
    } catch (e) {
      alert(`수정 적용 중 오류 — 선적확인은 찍지 않았습니다. 다시 시도하세요.\n(${e?.message || e})`);
      setBusy(false);
      return;
    } finally { setBusy(false); }
    adaptStream(fixPickFront || fixPickBack);   // V8.50: 실제 내려온 부류로 재앵커
    afterFix();
  };

  if (mode !== 'discharge' && mode !== 'loading') return null;

  // ── 설정 칩 바: 장비·접안·베이 — 항상 표시, 탭하면 변경 ──
  const SettingsBar = () => (
    <div className="flex gap-1.5 text-[11px]">
      <button onClick={() => setEquipStep(true)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-amber-300 font-bold hover:bg-slate-700">
        <Construction className="w-3.5 h-3.5"/>{equip || '장비?'}
      </button>
      <button onClick={changeBerth} disabled={!berthSide}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sky-300 font-bold hover:bg-slate-700 disabled:opacity-40">
        <Anchor className="w-3.5 h-3.5"/>{berthSide ? (berthSide === 'starboard' ? '우현 접안' : '좌현 접안') : '접안?'}
      </button>
      {selectedGroup != null && (
        <button onClick={() => setSelectedGroup(null)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-violet-300 font-bold hover:bg-slate-700">
          B{selectedGroup} 변경
        </button>
      )}
    </div>
  );


  // ── 1단계: 장비(호기) 결정 ──
  if (equipStep) {
    return (
      <div className="bg-slate-900 border-2 border-amber-700 rounded-lg p-4 space-y-3">
        <div className="text-sm font-bold text-amber-300 text-center flex items-center justify-center gap-1.5">
          <Construction className="w-4 h-4"/>작업 장비(호기)를 선택하세요
        </div>
        <div className="text-[11px] text-slate-400 text-center">헤더의 🏗 장비 표시·작업 보고와 공유됩니다.</div>
        <div className="grid grid-cols-2 gap-2">
          {equipNumbers.map(num => (
            <button key={num} onClick={() => pickEquip(num)}
              className={`py-4 rounded-lg border font-bold text-base ${
                equip === num ? 'bg-amber-700 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-amber-900'
              }`}>
              🏗 {num}
            </button>
          ))}
        </div>
        {equip && (
          <button onClick={() => setEquipStep(false)} className="w-full text-[11px] text-slate-400 py-1 hover:text-amber-300">
            현재 {equip} 유지하고 닫기
          </button>
        )}
      </div>
    );
  }

  // ── 2단계: 접안 방향 결정 (확인 후 저장 — 오선택 방지) ──
  if (!berthSide) {
    return (
      <div className="space-y-2">
        <SettingsBar/>
        <div className="bg-slate-900 border-2 border-violet-700 rounded-lg p-4 space-y-3">
          <div className="text-sm font-bold text-violet-300 text-center flex items-center justify-center gap-1.5">
            <Anchor className="w-4 h-4"/>접안 방향을 선택하세요
          </div>
          <div className="text-[11px] text-slate-400 text-center">크레인 작업 순서(육상↔해상)의 기준입니다. 선택 후 확인을 한 번 더 묻습니다.</div>
          <div className="flex gap-2">
            <button onClick={() => pickBerth('port')}
              className="flex-1 py-5 rounded-lg bg-slate-800 hover:bg-violet-800 border border-slate-700 font-bold text-base text-slate-100">
              좌현 접안<div className="text-[10px] font-normal text-slate-400 mt-1">홀수 로우가 해상쪽</div>
            </button>
            <button onClick={() => pickBerth('starboard')}
              className="flex-1 py-5 rounded-lg bg-slate-800 hover:bg-violet-800 border border-slate-700 font-bold text-base text-slate-100">
              우현 접안<div className="text-[10px] font-normal text-slate-400 mt-1">짝수 로우가 해상쪽</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 3단계: 베이 그룹 결정 ──
  if (selectedGroup == null) {
    return (
      <div className="space-y-2">
        <SettingsBar/>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="text-sm font-bold text-violet-300">작업할 베이를 선택하세요</div>
          {groups.length === 0 && unassigned.length === 0 && <div className="text-xs text-slate-500 text-center py-4">남은 {mode === 'discharge' ? '양하' : '선적'} 작업이 없습니다.</div>}
          {/* V9.23-08: 좌표 없는 컨은 어느 베이 묶음에도 안 들어간다. 여기서 안 보여 주면
              "대기 N대"인데 고를 베이가 없어 작업이 막힌다(2658W 신고). */}
          {unassigned.length > 0 && (
            <button onClick={() => setShowUnassigned(v => !v)}
              className="w-full py-3 rounded-lg bg-amber-950/60 hover:bg-amber-800 border border-amber-600 text-amber-100">
              <div className="font-bold text-base">⚠ 자리 미지정 {unassigned.length}대</div>
              <div className="text-[10px] text-amber-300">리스트엔 있는데 적부 좌표가 없습니다 — 눌러서 목록 보기</div>
            </button>
          )}
          {unassigned.length > 0 && showUnassigned && (
            <div className="space-y-1">
              {unassigned.map(c => (
                <div key={c.cn} className="flex items-center gap-1.5">
                  <button onClick={() => onOpenContainer?.(c)}
                    className="flex-1 flex justify-between items-center bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs">
                    <span className="mono font-bold text-slate-100">{c.cn}</span>
                    <span className="text-[10px] text-amber-400">조회</span>
                  </button>
                  {onPlaceUnassigned && (
                    <button onClick={() => onPlaceUnassigned(c)}
                      className="px-3 py-1.5 rounded bg-lime-800 hover:bg-lime-700 border border-lime-600 text-lime-100 text-xs font-black">🅿 배치</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {groups.map(g => (
              <button key={g.center} onClick={() => { setSelectedGroup(g.center); setConsecFix(0); setDeckPromptDone(false); setFixOpen(false); }}
                className="py-3 rounded-lg bg-slate-800 hover:bg-violet-800 border border-slate-700 text-slate-100">
                <div className="font-bold text-base">B{[...g.bays].sort((a, b) => a - b).join('·')}</div>
                <div className="text-[10px] text-slate-400">남은 {g.count}대</div>
                <div className="flex items-center justify-center gap-1.5 mt-0.5 text-[10px] font-bold">
                  {g.deck > 0 && <span className="text-sky-300">데크 {g.deck}</span>}
                  {g.deck > 0 && g.hold > 0 && <span className="text-slate-600">·</span>}
                  {g.hold > 0 && <span className="text-amber-300">홀드 {g.hold}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── 3.5단계: 작업 단(홀드/데크) 선택 (V7.99-8 메모6) ──
  //   검수사가 누른 단이 ① 수석에게 작업 위치 전달 ② 큐를 그 단만 표시 ③ 다른컨 수정 후보를 그 단으로 좁힘.
  if (selectedTier == null) {
    const g = groups.find(x => x.center === selectedGroup);
    const bayLbl = g ? `B${[...g.bays].sort((a, b) => a - b).join('·')}` : `B${selectedGroup}`;
    // #5 (V8.45): 자동 양하는 정상 작업(데크→홀드) 전제. 그 베이 데크가 남았으면 홀드 비활성 —
    //   커버 위 데크를 다 내려야 그 아래 홀드에 접근하기 때문. 커버 부분개방 등 예외 상황은 수동 몫(자동은 대처 못 함).
    const deckFirstBlock = mode === 'discharge' && !!g && g.deck > 0;
    return (
      <div className="space-y-2">
        <SettingsBar/>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedGroup(null)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-300">
              <ChevronLeft className="w-4 h-4"/>베이
            </button>
            <div className="text-sm font-bold text-violet-300">{bayLbl} — 작업할 단을 선택하세요</div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button disabled={!g || g.deck === 0} onClick={() => setSelectedTier('deck')}
              className={`py-4 rounded-lg border text-left px-4 ${!g || g.deck === 0 ? 'bg-slate-800/40 border-slate-800 text-slate-600' : 'bg-sky-950/40 border-sky-700 hover:bg-sky-900/50 text-sky-100'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-base">🔵 데크 {g ? g.deck : 0}개</span>
                <span className="text-xs mono text-sky-300">20FT:{g ? g.deck20 : 0} / 40FT:{g ? g.deck40 : 0}</span>
              </div>
            </button>
            <button disabled={!g || g.hold === 0 || deckFirstBlock} onClick={() => setSelectedTier('hold')}
              className={`py-4 rounded-lg border text-left px-4 ${!g || g.hold === 0 || deckFirstBlock ? 'bg-slate-800/40 border-slate-800 text-slate-600' : 'bg-amber-950/40 border-amber-700 hover:bg-amber-900/50 text-amber-100'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-base">🟠 홀드 {g ? g.hold : 0}개</span>
                <span className="text-xs mono text-amber-300">20FT:{g ? g.hold20 : 0} / 40FT:{g ? g.hold40 : 0}</span>
              </div>
              {deckFirstBlock && g.hold > 0 && <div className="text-[10px] text-rose-300 font-bold mt-1">데크 {g.deck}개 먼저 양하 — 커버 아래 (자동)</div>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 4단계: 예측 카드 (V7.94-05: 기본 정보 전부 표시 — 실번호 확인·XRAY 번호 입력·규격 확인) ──
  const renderCon = (c, label, color) => (
    <div className={`rounded-lg border-2 p-3 ${color === 'amber' ? 'border-amber-600 bg-amber-950/30' : 'border-cyan-600 bg-cyan-950/30'}`}>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className={`font-bold ${color === 'amber' ? 'text-amber-400' : 'text-cyan-400'}`}>{label}</span>
        <span className="text-slate-400 mono font-bold">{parseInt(c.bay, 10)}-{c.row}-{c.tier} {parseInt(c.tier, 10) >= 80 ? '데크' : '홀드'}</span>
      </div>
      <button onClick={() => onOpenContainer?.(c)} className="w-full text-left">
        <span className="mono text-xl font-bold text-slate-100">{c.cn.slice(0, -4)}</span>
        <span className="mono text-3xl font-black text-emerald-300">{c.cn.slice(-4)}</span>
      </button>
      {/* 기본 정보 줄: 규격·F/E·무게·선사·항로 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] mono text-slate-300">
        <span className="font-bold text-slate-100">{c.tp || c.iso}</span>
        <span className={c.fe === 'E' ? 'text-slate-400 font-bold' : 'text-emerald-400 font-bold'}>{c.fe === 'E' ? 'EMPTY' : 'FULL'}</span>
        {c.wt ? <span>{formatWt(c.wt)}</span> : null}
        {c.op && <span className="px-1 rounded bg-slate-800 text-slate-300">{c.op}</span>}
        <span className="text-slate-500">{c.pol} → {c.pod}</span>
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {c._xray && <span className="px-1.5 py-0.5 rounded bg-fuchsia-700 text-fuchsia-100 text-[10px] font-bold">★XRAY</span>}
        {c.rf && <span className="px-1.5 py-0.5 rounded bg-sky-700 text-sky-100 text-[10px] font-bold"><Snowflake className="w-3 h-3 inline"/>리퍼{c.tmp ? ` ${c.tmp}` : ''}</span>}
        {c.dg && <span className="px-1.5 py-0.5 rounded bg-red-700 text-red-100 text-[10px] font-bold">DG</span>}
        {c.fr && <span className="px-1.5 py-0.5 rounded bg-orange-700 text-orange-100 text-[10px] font-bold">FR</span>}
        {c.ot && <span className="px-1.5 py-0.5 rounded bg-yellow-700 text-yellow-100 text-[10px] font-bold">O/T</span>}
        {c.oog && <span className="px-1.5 py-0.5 rounded bg-rose-700 text-rose-100 text-[10px] font-bold">OOG</span>}
      </div>
      {/* 실번호 — 확인·수정 */}
      <div className="mt-1.5 pt-1.5 border-t border-slate-700/60">
        {editSealCn === c.cn ? (
          <div className="flex gap-1.5">
            <input autoFocus value={sealVal} onChange={e => setSealVal(e.target.value)} {...NUM_INPUT_PROPS}
              onKeyDown={e => { if (e.key === 'Enter') saveSeal(c); }}
              placeholder="실번호 입력" className="flex-1 min-w-0 bg-slate-800 border border-amber-600 rounded px-2 py-1 text-sm mono text-slate-100"/>
            <button onClick={() => saveSeal(c)} className="px-2.5 rounded bg-emerald-700 text-white text-xs font-bold">저장</button>
            <button onClick={() => { setEditSealCn(null); setSealVal(''); }} className="px-2 rounded bg-slate-800 text-slate-400 text-xs">취소</button>
          </div>
        ) : (
          <button onClick={() => { setEditSealCn(c.cn); setSealVal(c.sl || ''); }} className="w-full flex items-center gap-1.5 text-left">
            <span className="text-[11px] text-slate-500 flex-shrink-0">실:</span>
            <span className={`mono text-sm font-bold ${c.sl ? 'text-cyan-300' : 'text-amber-400'}`}>{c.sl || '⚠ 미입력'}</span>
            <Pencil className="w-3 h-3 text-slate-500"/>
          </button>
        )}
      </div>
      {/* XRAY 번호 — 대상만 표시·입력 */}
      {c._xray && (
        <div className="mt-1.5">
          {editXCn === c.cn ? (
            <div className="space-y-1">
              <div className="flex gap-1.5">
                <input autoFocus value={xVal} onChange={e => setXVal(e.target.value)} {...NUM_INPUT_PROPS}
                  placeholder="XRAY 실번호" className="flex-1 min-w-0 bg-slate-800 border border-fuchsia-600 rounded px-2 py-1 text-sm mono text-slate-100"/>
                <input value={xEVal} onChange={e => setXEVal(e.target.value)} {...NUM_INPUT_PROPS}
                  onKeyDown={e => { if (e.key === 'Enter') saveXSeal(c); }}
                  placeholder="E-실(선택)" className="w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm mono text-slate-100"/>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => saveXSeal(c)} className="flex-1 py-1 rounded bg-fuchsia-700 text-white text-xs font-bold">XRAY 저장</button>
                <button onClick={() => { setEditXCn(null); setXVal(''); setXEVal(''); }} className="px-2 rounded bg-slate-800 text-slate-400 text-xs">취소</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setEditXCn(c.cn); setXVal(c._xraySeal?.seal || ''); setXEVal(c._xraySeal?.eseal || ''); }} className="w-full flex items-center gap-1.5 text-left">
              <span className="text-[11px] text-fuchsia-400 font-bold flex-shrink-0">XRAY:</span>
              <span className={`mono text-sm font-bold ${c._xraySeal?.seal ? 'text-fuchsia-200' : 'text-amber-400'}`}>{c._xraySeal?.seal || '미입력'}{c._xraySeal?.eseal ? ` / E:${c._xraySeal.eseal}` : ''}</span>
              <Pencil className="w-3 h-3 text-slate-500"/>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <SettingsBar/>
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5">
        <button onClick={() => setSelectedGroup(null)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-300">
          <ChevronLeft className="w-4 h-4"/>베이 선택
        </button>
        <div className="text-xs font-bold text-violet-300">B{selectedGroup} 그룹 — {groupDone}/{groupTotal}대</div>
        <button onClick={() => setVoiceOn(v => !v)} className="text-slate-400 hover:text-violet-300">
          {voiceOn ? <Volume2 className="w-4 h-4"/> : <VolumeX className="w-4 h-4"/>}
        </button>
      </div>
      <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
        <div className="h-full bg-violet-600 transition-all" style={{ width: `${groupTotal ? (groupDone / groupTotal) * 100 : 0}%` }}/>
      </div>

      {/* V8.50: 갈림 — 지금 내릴 수 있는 컨에 부류 혼재 시 선택 버튼 (기사 흐름 따라가기) */}
      {card && (forkChips || streamPref) && (
        <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5">
          <span className={`text-[10px] font-bold mr-0.5 ${streamPref ? 'text-violet-300' : 'text-slate-500'}`}>
            {streamPref ? `${PREF_LABEL[streamPref]} 우선 중` : '갈림'}
          </span>
          {(forkChips || []).map(([k, n]) => (
            <button key={k} onClick={() => setStreamPref(p => (p === k ? null : k))}
              className={`px-2 py-1 rounded text-[11px] font-bold border ${streamPref === k
                ? 'bg-violet-700 border-violet-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
              {PREF_LABEL[k]}부터 {n}
            </button>
          ))}
          {streamPref && (
            <button onClick={() => setStreamPref(null)}
              className="px-2 py-1 rounded text-[11px] font-bold border bg-slate-800 border-amber-700 text-amber-300 hover:bg-slate-700">
              순서대로
            </button>
          )}
        </div>
      )}

      {deckDonePromptD && card ? (
        <div className="bg-amber-950/50 border-2 border-amber-600 rounded-lg p-4 text-center space-y-3">
          <div className="font-bold text-amber-200">⚓ 이 베이 데크 양하 완료!</div>
          <div className="text-[11px] text-slate-400">홀드를 하려면 해치커버를 열어야 합니다. 다음 작업을 선택하세요.</div>
          <div className="flex gap-2">
            <button disabled={hatchBusy} onClick={async () => { await sendHatchReport('open'); setHatchOpenDone(true); markHatchDone(selectedGroup, 'open'); }}
              className="flex-1 py-3 rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-bold text-sm">🔓 해치커버 오픈 → 홀드 진행</button>
            <button onClick={() => setSelectedGroup(null)}
              className="flex-1 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold text-sm">다른 데크로 이동</button>
          </div>
        </div>
      ) : holdDonePrompt && card ? (
        <div className="bg-sky-950/50 border-2 border-sky-600 rounded-lg p-4 text-center space-y-3">
          <div className="font-bold text-sky-200">⚓ 이 베이 홀드 선적 완료!</div>
          <div className="text-[11px] text-slate-400">데크를 하려면 해치커버를 닫아야 합니다. 다음 작업을 선택하세요.</div>
          <div className="flex gap-2">
            <button disabled={hatchBusy} onClick={async () => { await sendHatchReport('close'); setDeckPromptDone(true); markHatchDone(selectedGroup, 'close'); }}
              className="flex-1 py-3 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-bold text-sm">🔒 해치커버 클로즈 → 데크 계속</button>
            <button onClick={() => { setSelectedGroup(null); setDeckPromptDone(false); }}
              className="flex-1 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold text-sm">다른 베이 홀드 이동</button>
          </div>
        </div>
      ) : !card ? (
        <div className="bg-emerald-950/40 border border-emerald-700 rounded-lg p-6 text-center">
          <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2"/>
          <div className="font-bold text-emerald-300">이 베이 그룹 {mode === 'discharge' ? '양하' : '선적'} 완료!</div>
          {mode === 'discharge' && holdWorkedD && !hatchCloseDone && !isHatchDoneSaved(selectedGroup, 'close') ? (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] text-slate-400">홀드 작업이 끝났습니다. 해치커버를 닫을까요?</div>
              <div className="flex gap-2 justify-center">
                <button disabled={hatchBusy} onClick={async () => { await sendHatchReport('close'); setHatchCloseDone(true); markHatchDone(selectedGroup, 'close'); }}
                  className="flex-1 py-3 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-bold text-sm">🔒 해치커버 클로즈</button>
                <button onClick={() => setSelectedGroup(null)}
                  className="flex-1 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold text-sm">다른 베이 홀드 이동</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setSelectedGroup(null)} className="mt-3 px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm text-slate-200">다른 베이 선택</button>
          )}
        </div>
      ) : (
        <>
          <div className="text-[11px] text-center text-slate-400">
            다음 예측 <span className="text-violet-300 font-bold">{groupDone + 1}번째</span>
            {card.single && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-800 text-amber-100 font-bold">싱글모드 구간</span>}
          </div>
          {renderCon(card.main, card.twin ? '앞' : '단독', 'amber')}
          {card.twin && (
            <>
              <div className="flex items-center gap-2 px-2">
                <div className="flex-1 border-t border-slate-700"/>
                <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1"><Link2 className="w-3 h-3"/>트윈 짝꿍</div>
                <button onClick={swapTwinPos} disabled={busy}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-800 hover:bg-indigo-700 text-indigo-100 disabled:opacity-50 flex items-center gap-1">
                  ⇅ 앞뒤 맞교환
                </button>
                <div className="flex-1 border-t border-slate-700"/>
              </div>
              {renderCon(card.twin, '뒤', 'cyan')}
            </>
          )}

          {twinWtWarn && (twinWtWarn.over || twinWtWarn.imbal) && (
            <div className={`rounded-lg px-3 py-2 text-sm font-bold flex items-start gap-2 ${twinWtWarn.over ? 'bg-rose-950/60 border border-rose-700 text-rose-200' : 'bg-amber-950/60 border border-amber-700 text-amber-200'}`}>
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5"/>
              {twinWtWarn.over ? (
                <span>🚫 합계 {formatWt(twinWtWarn.total)} (55톤 초과) — 트윈 불가, 싱글 작업 검토</span>
              ) : (
                <span>⚠️ 무게차 {formatWt(twinWtWarn.diff)} (한계 {formatWt(twinWtWarn.limit)} 초과) — 수평 안 맞음, 트윈 주의</span>
              )}
            </div>
          )}

          <button onClick={handleConfirm} disabled={busy}
            className="w-full py-4 rounded-lg font-bold text-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin"/> : <Check className="w-6 h-6"/>}
            {card.twin ? `트윈 한 번에 ${mode === 'discharge' ? '양하' : '선적'}확인` : `${mode === 'discharge' ? '양하' : '선적'}확인`}
          </button>

          {!fixOpen ? (
            <button onClick={() => setFixOpen(true)}
              className="w-full py-2.5 rounded-lg font-bold text-sm bg-slate-800 hover:bg-amber-800 text-amber-300 flex items-center justify-center gap-2">
              <Pencil className="w-4 h-4"/>다른 컨테이너가 나옴 (수정{card.twin ? ' — 앞·뒤 동시' : ''})
            </button>
          ) : !card.twin ? (
            <div className="bg-slate-900 border border-amber-700 rounded-lg p-2 space-y-2">
              <div className="text-[11px] text-amber-300 font-bold">실제 나온 컨테이너 번호 (끝 4자리 이상){mode === 'loading' && <span className="text-slate-500 font-normal"> · 이 자리({card.pos})로 배정되고 예측 컨은 미배정 처리</span>}</div>
              <input autoFocus value={fixQuery} onChange={e => setFixQuery(e.target.value)}
                placeholder="예: 1234 또는 SKLU1972626"
                inputMode="numeric" autoComplete="off"
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm mono text-slate-100"/>
              {/* V7.99-8 (메모6): 4자리를 안 쳐도 이 단의 남은 리스트에서 바로 선택 — 끝4자리 오타 오양하 방지 */}
              {fixQuery.length < 3 && tierRemainConts.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500">또는 이 {selectedTier === 'deck' ? '데크' : '홀드'} 남은 컨에서 선택 ({tierRemainConts.filter(c => c.cn !== card?.main?.cn).length}대)</div>
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {tierRemainConts.filter(c => c.cn !== card?.main?.cn && c.cn !== card?.twin?.cn).map(c => (
                      <button key={c.cn} onClick={() => handleFixPick(c)} disabled={busy}
                        className="w-full flex justify-between items-center bg-slate-800 hover:bg-amber-900 rounded px-2 py-1.5 text-xs">
                        <span className="mono font-bold text-slate-100">{c.cn}</span>
                        <span className="mono text-slate-400">{c.bay ? `${parseInt(c.bay, 10)}-${c.row}-${c.tier}` : '미배정'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {fixMatches.length > 1 && (
                <div className="text-[11px] text-rose-300 font-bold bg-rose-950/40 border border-rose-800 rounded px-2 py-1 text-center">
                  ⚠️ 끝자리 같은 컨 {fixMatches.length}대 — 위치(Bay-Row-Tier) 확인 후 선택
                </div>
              )}
              {fixMatches.map(c => (
                <button key={c.cn} onClick={() => handleFixPick(c)} disabled={busy}
                  className="w-full flex justify-between items-center bg-slate-800 hover:bg-amber-900 rounded px-2 py-1.5 text-xs">
                  <span className="mono font-bold text-slate-100">{c.cn}</span>
                  <span className={`mono font-bold ${fixMatches.length > 1 ? 'text-rose-300' : 'text-slate-400'}`}>
                    {c._comp && <span className="mr-1 px-1 rounded bg-rose-800 text-rose-200 font-bold">⚠ 완료기록</span>}
                    {!inWorkTier(c) && <span className="mr-1 px-1 rounded bg-amber-800 text-amber-200 font-bold">⚠ 다른 베이</span>}
                    {c.bay ? `${parseInt(c.bay, 10)}-${c.row}-${c.tier}` : '미배정'}
                  </span>
                </button>
              ))}
              {fixQuery.length >= 3 && fixMatches.length === 0 && <div className="text-[11px] text-slate-500 text-center">남은 작업분에 일치하는 컨이 없습니다.</div>}
              <button onClick={() => { setFixOpen(false); setFixQuery(''); }} className="w-full text-[11px] text-slate-400 py-1">닫기</button>
            </div>
          ) : (
            <div className="bg-slate-900 border border-amber-700 rounded-lg p-2 space-y-2">
              <div className="text-[11px] text-amber-300 font-bold">트윈 수정 — 바뀐 쪽만 선택 (안 바뀐 쪽은 비워두면 예측대로 확인)</div>
              {[
                { label: `앞 (${card.pos})`, q: fixQuery, setQ: setFixQuery, pick: fixPickFront, setPick: setFixPickFront, matches: fixMatches },
                { label: `뒤 (${parseInt(card.twin.bay, 10)}-${card.twin.row}-${card.twin.tier})`, q: fixQuery2, setQ: setFixQuery2, pick: fixPickBack, setPick: setFixPickBack, matches: fixMatches2 },
              ].map((s) => (
                <div key={s.label} className="border border-slate-700 rounded p-1.5 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold">{s.label}</div>
                  {s.pick ? (
                    <div className="flex items-center justify-between bg-amber-950/50 border border-amber-700 rounded px-2 py-1.5">
                      <span className="mono text-sm font-bold text-amber-200">{s.pick.cn}</span>
                      <button onClick={() => s.setPick(null)} className="text-[11px] text-slate-400 px-1.5">✕ 취소</button>
                    </div>
                  ) : (
                    <>
                      <input value={s.q} onChange={e => s.setQ(e.target.value)}
                        placeholder="실제 온 컨 끝 4자리 이상"
                        inputMode="numeric" autoComplete="off"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm mono text-slate-100"/>
                      {s.matches.map(c => (
                        <button key={c.cn} onClick={() => { s.setPick(c); s.setQ(''); }} disabled={busy}
                          className="w-full flex justify-between items-center bg-slate-800 hover:bg-amber-900 rounded px-2 py-1.5 text-xs">
                          <span className="mono font-bold text-slate-100">{c.cn}</span>
                          <span className="mono text-slate-400">
                            {c._comp && <span className="mr-1 px-1 rounded bg-rose-800 text-rose-200 font-bold">⚠ 완료기록</span>}
                            {!inWorkTier(c) && <span className="mr-1 px-1 rounded bg-amber-800 text-amber-200 font-bold">⚠ 다른 베이</span>}
                            {c.bay ? `${parseInt(c.bay, 10)}-${c.row}-${c.tier}` : '미배정'}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              ))}
              <button onClick={handleTwinFixApply} disabled={busy || (!fixPickFront && !fixPickBack)}
                className="w-full py-2.5 rounded-lg font-bold text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4"/>}
                선택한 수정 적용 (나머지는 예측대로 확인)
              </button>
              <button onClick={() => { setFixOpen(false); setFixQuery(''); setFixQuery2(''); setFixPickFront(null); setFixPickBack(null); }} className="w-full text-[11px] text-slate-400 py-1">닫기</button>
            </div>
          )}

          {consecFix > 0 && (
            <div className="text-[11px] text-amber-400 text-center flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3"/>연속 수정 {consecFix}회 — {AUTO_MANUAL_THRESHOLD}회면 수동 모드로 전환됩니다
            </div>
          )}

          {/* 다음 예정 미리보기 */}
          {queue.length > 1 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
              <div className="text-[10px] text-slate-500 font-bold mb-1">다음 예정</div>
              {queue.slice(1, 5).map((q, i) => (
                <div key={q.main.cn} className="flex justify-between text-[11px] py-0.5 border-b border-slate-800 last:border-0">
                  <span className="text-slate-500">{groupDone + 2 + i}.</span>
                  <span className="mono text-slate-300">{q.main.cn}{q.twin ? ` +${q.twin.l4 || q.twin.cn.slice(-4)}` : ''}</span>
                  <span className="mono text-slate-500">{parseInt(q.main.bay, 10)}-{q.main.row}-{q.main.tier}{q.single ? ' 싱글' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {unassigned.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-700 rounded-lg p-2">
          <button onClick={() => setShowUnassigned(v => !v)} className="w-full flex items-center justify-center gap-1.5 text-[12px] font-bold text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5"/>위치 미배정 {unassigned.length}대 {showUnassigned ? '▲' : '▼'}
          </button>
          {showUnassigned && (
            <div className="mt-1.5 space-y-1">
              {unassigned.map(c => (
                <div key={c.cn} className="flex items-center gap-1.5">
                  <button onClick={() => onOpenContainer?.(c)}
                    className="flex-1 flex justify-between items-center bg-slate-900 rounded px-2 py-1.5 text-xs">
                    <span className="mono font-bold text-slate-100">{c.cn}</span>
                    <span className="text-[10px] text-amber-400">조회</span>
                  </button>
                  {onPlaceUnassigned && (
                    <button onClick={() => onPlaceUnassigned(c)}
                      className="px-3 py-1.5 rounded bg-lime-800 hover:bg-lime-700 border border-lime-600 text-lime-100 text-xs font-black">🅿 배치</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <button onClick={onSwitchManual}
        className="w-full py-2.5 rounded-lg font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center gap-2 border border-slate-700">
        <Hand className="w-4 h-4"/>수동 모드로 전환
      </button>
    </div>
  );
}
