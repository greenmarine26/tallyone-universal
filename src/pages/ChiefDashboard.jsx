import React, { useMemo, useState, useEffect } from 'react';
import { Users, Anchor, ChevronRight, Clock, Library, Ship, AlertTriangle, CheckCircle2, Trash2, Lock, FileSpreadsheet, Truck, Send } from 'lucide-react';
import { fbSubscribeShipLibrary, fbSubscribeFeedback, fbResolveFeedback, fbDeleteFeedback, fbClearFeedback, db, fbSubscribeAllReports, fbDeleteWorkReport, fbClearAllReports, fbClearAllReportsAllVoyages, fbClearAllActiveWork, tallyVoyagesByShip, fbArchiveVoyageBeforeDelete, fbDeleteVoyage, fbSubscribeBroadcast, fbSetBroadcast, fbClearBroadcast, fbSubscribeBroadcastReads, fbListArchive, fbListTallyPending, fbGetArchiveVoyage, fbRestoreVoyageFromArchive, fbCleanupArchive, fbIsOnline, fbGetActivityDays, fbCleanupActivityLog } from '../firebase.js';   // TallyOne 1.3: 활동 로그 조회·정리
import { isOwnerName } from '../adminGuard.js';   // TallyOne 1.3: 활동 로그는 소유자 전용(판2 "저만 다 볼수있게")
import { matchShipPolicy, applyPolicyToContainer, fbSubscribeShipPolicies, isLoloShipByPolicy } from '../shipPolicies.js';
import { tenant } from '../tenant.js';   // TallyUni 0.2: 주소 단일 소스
import { isPyeongtaekPort, ownDirCns, isBookingSlot, emptySealSpec, equipNumbersForPier, parsePortMisDateTime } from '../utils.js';  // V9.57: 장비 표 동적화(I1) // TallyOne 1.0: 일정 파싱(L3)
import { healthSummary, heartbeatState } from '../health.js';  // TallyOne 1.0(L1): 수집기 상태 배너 — HomePage 204행과 같은 판정 헬퍼
import { inWindow } from '../badgeRule.js';  // TallyOne 1.0(L2): 터미널 자료 작업창(±12h) 귀속 가드 — HomePage 909행과 동일 규칙
// TallyOne 1.7: 마감 서류 폴더 직결 — 다운로드를 거치지 않고 TALLYBOX에 바로 쓴다.
import { isTallyboxSupported, pickTallyboxRoot, getSavedTallybox, requestWritePermission, readyRoot, writeTallyboxFile } from '../tallyboxFs.js';
import { folderName, fileNameFor } from '../data/tallyBoxRules.js';
import KakaoLogImportModal from '../components/KakaoLogImportModal.jsx';   // TallyOne 1.8-15
import { buildLoloRows, buildActualSealListText, buildLoadingListText, downloadText } from '../loloReport.js';
import PortMisCaptureModal from '../components/PortMisCaptureModal.jsx';  // V9.42: 홈 상단에서 이리로 이동
import RefreshDataButton from '../components/RefreshDataButton.jsx';   // TallyOne 1.5
import { collectActualLoading, buildActualBaplie, buildActualAsc, buildEditExcel, parseEditExcel } from '../loadingEdiExport.js';
import { isChief } from '../staffList.js';
import { computeTallyData } from '../tallyReport.js';   // V9.19-01: 마감 텔리(수석 전용 이동)
import { generateEmptySealReport } from '../components/EmptySealReport.jsx';
import ConfirmModal, { useConfirm } from '../components/ConfirmModal.jsx';
import ChiefBayEdit from '../components/ChiefBayEdit.jsx';
import LoadingPlanEdit from '../components/LoadingPlanEdit.jsx';

// TallyOne 1.0: null 방어용 고정 빈 객체 — prop이 null로 와도 참조가 안 바뀌어 useMemo가 헛돌지 않는다
const _EMPTY_OBJ = {};

// TallyOne 1.0(L2/L3): 항차 일정 합성 — 우선순위는 HomePage 258행과 동일(선석배정 > 도선 예보).
//   PORT-MIS 자료는 이 화면에 없으므로 후보에서 제외. 전부 없으면 null(화면에 '자료 없음' 명시).
function scheduleOf(info, pfMap) {
  const pf = (pfMap || {})[(info?.vsl || '').toUpperCase()] || null;
  const pd = String(info?.planDate || '');
  const pdEta = pd ? parsePortMisDateTime(pd.split('~')[0].trim()) : null;
  const pdEtd = pd.includes('~') ? parsePortMisDateTime(pd.split('~')[1].trim()) : null;
  const pfArr = pf ? parsePortMisDateTime(pf.nextArr) : null;
  const pfDep = pf ? parsePortMisDateTime(pf.nextDep) : null;
  return { pf, planDate: pd, planSrc: String(info?.planSrc || ''),
           etaMs: pdEta ?? pfArr, etdMs: pdEtd ?? pfDep };
}

// TallyOne 1.0(L2): 터미널 실적 레코드 선택 — 자료가 **선박코드로만** 오므로 직전/다음 기항 자료가
//   붙는 것을 작업창(±12h, badgeRule.inWindow) 가드로 막는다(HomePage 908~909행과 같은 방식).
function twOf(info, twMap, sched) {
  const rec = (twMap || {})[(info?.vsl || '').toUpperCase()] || null;
  if (!rec) return null;
  return inWindow(parsePortMisDateTime(rec.startAt), sched.etaMs, sched.etdMs) ? rec : null;
}

// ── TallyOne 1.6: 마감 텔리 대상 판정 ─────────────────────────────────────────
//   사고 (2026-08-04) — 수석이 마감 텔리 「엑셀 생성」을 눌렀는데 **엉뚱한 항차**가 나왔다.
//     목록이 `info`만 있으면 전부 넣고 `createdAt` 내림차순으로 세웠다. 그래서
//       TNJP 26356E & 26356W ← 맨 위 (오늘 12:22 예정 등록, 입항 8/6, 작업한 적 없음)
//       TNJP 26355E & 26355W ← 13번째 (7/30 등록, 오늘 실제 작업·완료)
//     같은 TNJP 두 줄 중 위엣것이 아직 배도 안 온 항차였다. 등록 시각 정렬이 원인.
//
//   검수사 확정 흐름 — 「수석 완료 저장」이 마감의 방아쇠다.
//     작업중/검수 완료 → (잠김)  ─ 수석 완료 저장 ─→  보관소 이동 → 마감 텔리 활성
//     "완료 처리가 안되면 눌리면 안됩니다. 수석이 완료로 저장하면 마감텔리에 불이 들어 오게"
//     최종형은 완료 저장 즉시 텔리·마감자료가 TALLYBOX로 자동 생성. 지금은 시험 중이라
//     조각을 떼어 둔 상태이므로 **순서만 강제**한다(자동 생성은 당기지 않는다).
//
//   ⚠ 완료 **기록**(discharge/loading.completed)을 신호로 쓰면 안 된다.
//     TNJP 26355E 실측: dischargeDone·loadingDone 둘 다 true(12:34)인데 completed 는 null.
//     지금은 시험 운용이라 컨을 하나씩 확인하지 않고 완료만 누른다(검수사 확인 2026-08-04).
//     앱이 완성되면 한 대라도 남을 때 완료 버튼이 잠기므로 done 플래그가 곧 전량 확인을 뜻한다.
//     즉 completed 는 지금은 항상 0이고 나중엔 중복이라 쓸 이유가 없다.
//
//   반환: null(입항 전 — 목록에 없음) | 'working'(작업중) | 'done'(검수 완료·수석 대기)
export function tallyTargetState(v, pfMap, twMap, now = Date.now()) {
  const info = v?.info;
  if (!info) return null;
  if (info.dischargeDone || info.loadingDone || info.inspectorDone) return 'done';
  const sched = scheduleOf(info, pfMap);
  if (twOf(info, twMap, sched)) return 'working';          // 터미널이 실제 작업을 잡고 있다
  if (sched.etaMs != null && sched.etaMs <= now) return 'working';  // 작업 시작 시각이 지났다
  return null;                                             // 아직 배가 없다
}

// TallyOne 1.6: 마감 텔리 목록에 올릴 보관소 하한.
//   보관소에는 1년치(fbCleanupArchive 365일)가 쌓여 있고 그 대부분은 이 기능이 생기기 전에
//   사람이 수기로 만들어 보낸 것들이다. 전부 '미작성'으로 띄우면 목록이 거짓말을 한다.
//   → 이 기능 도입일 이후 완료 저장된 것만 올린다. 그 이전 것은 [완료 보관소] 메뉴에서 본다.
export const TALLY_LIST_SINCE = new Date('2026-08-04T00:00:00+09:00').getTime();

export default function ChiefDashboard({ voyages, inspectors, inspector, onOpenVoyage, onGoHome, onOpenGlobalSearch,
  // TallyOne 1.0: 팀K가 App에서 전달하는 새 prop 3개 — 전부 옵셔널(미전달·null이어도 기존 화면 동작 불변)
  collectorHb = null, pilotForecast = null, terminalWork = null,
  onRefreshData, refreshing = false, refreshedAt = 0,   // TallyOne 1.5: 화면 데이터만 새로고침
}) {
  const chief = isChief(inspector);  // V7.94-18: 완료 권한 — 수석검수/부수석만
  const owner = isOwnerName(inspector);   // TallyOne 1.3: 활동 로그 섹션 — 소유자가 아니면 렌더 자체를 안 한다
  const pfMap = pilotForecast || _EMPTY_OBJ;   // TallyOne 1.0: null 방어
  const twMap = terminalWork || _EMPTY_OBJ;    // TallyOne 1.0: null 방어
  // TallyOne 1.6-01: 마감 텔리 대기 목록 — **작은 색인 노드 하나만** 읽는다.
  //   1.6에서 fbListArchive()(키 1건당 get 7회 × 보관소 160건 = 1,120요청)를 대시보드 열 때마다
  //   돌려 화면이 멈췄다. 목록 때문에 보관소를 훑지 않는다.
  // TallyOne 1.7: TALLYBOX 폴더 직결 — "크롬은 폴더를 지정해야 하고 엣지는 다운로드로 가고
  //   일관성이 없음"(검수사 2026-08-04). 루트를 **한 번만** 지정받아 IndexedDB에 두면
  //   그 뒤로는 안 묻는다. 마감 텔리·실선적 EDI·ASC 가 모두 이 핸들을 쓴다.
  const [boxRoot, setBoxRoot] = useState(null);
  React.useEffect(() => { readyRoot().then(setBoxRoot).catch(() => {}); }, []);
  const onPickBox = React.useCallback(async () => {
    const h = await pickTallyboxRoot();            // 사용자 클릭 안에서만 열린다
    setBoxRoot(h);
    return h;
  }, []);
  // 저장은 돼 있는데 권한이 'prompt' 로 식은 경우가 있다 — 버튼 클릭 안에서 조용히 되살린다.
  const resolveBox = React.useCallback(async () => {
    if (boxRoot) return boxRoot;
    try {
      const saved = await getSavedTallybox();
      if (saved && (await requestWritePermission(saved)) === 'granted') { setBoxRoot(saved); return saved; }
    } catch { /* 폴백: 다운로드 */ }
    return null;
  }, [boxRoot]);

  const [arcList, setArcList] = useState(null);
  const reloadArchive = React.useCallback(() => {
    if (!isChief(inspector)) return;
    fbListTallyPending().then(setArcList).catch(e => console.warn('[마감텔리] 대기 목록 조회 실패:', e));
  }, [inspector]);
  React.useEffect(() => { reloadArchive(); }, [reloadArchive, refreshedAt]);
  // V9.19-02(2026-07-28): 대시보드가 길어 항목을 한참 찾아 내려가야 했다(사용자 보고).
  //   상단 바로가기 + 항목별 접기(버튼 누르면 보임). 작업 보드·진행 상황만 기본 펼침.
  const [openSecs, setOpenSecs] = useState({ board: true, progress: true });
  const [showPortMis, setShowPortMis] = useState(false);   // V9.42: 홈 상단에서 옮겨온 PORT-MIS 캡처
  const toggleSec = (id) => setOpenSecs(o => ({ ...o, [id]: !o[id] }));
  const jumpSec = (id) => {
    setOpenSecs(o => ({ ...o, [id]: true }));
    setTimeout(() => { try { document.getElementById('sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* skip */ } }, 60);
  };
  const [editKey, setEditKey] = useState(null); // V7.97: 베이상세 편집 대상 항차 (수석/관리자만)
  const [planKey, setPlanKey] = useState(null); // V9.07: 컨펌용 플랜편집 대상 항차
  const [shipLib, setShipLib] = useState({});
  const [feedback, setFeedback] = useState({});
  const [showResolved, setShowResolved] = useState(false);
  const [extraPolicies, setExtraPolicies] = useState({});
  const [allReports, setAllReports] = useState([]);  // M3.5.6: 작업 보고 이력
  // M3.74: confirm() → ConfirmModal
  const [confirmState, askConfirm] = useConfirm();
  // TallyOne 1.0(L5): 결과 통지 alert() → 섹션 안 인라인 알림 — 확인창(confirm) 성격은 유지
  const [fbNotice, setFbNotice] = useState(null);     // 오답 저금통(내보내기·비우기)
  const [repNotice, setRepNotice] = useState(null);   // 작업 보고(전체 삭제·개별 삭제)
  const [loloNotice, setLoloNotice] = useState(null); // LOLO 내보내기
  useEffect(() => {
    const u1 = fbSubscribeShipLibrary(setShipLib);
    const u2 = fbSubscribeFeedback(setFeedback);
    const u3 = fbSubscribeShipPolicies(db, setExtraPolicies);
    // V9.57(I3): 100건 절단으로 다항차·다보고 날에 "오늘 통계"가 조용히 모자랐다 — 300건으로 상향.
    //   그래도 넘치면 장비 표 헤더에 "최근 300건 기준" 캡션으로 절단 사실을 밝힌다(아래 렌더부).
    const u4 = fbSubscribeAllReports(setAllReports, 300);
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  // TallyOne 1.0(L1): 수집기 생존 판정용 시계 — HomePage 199~203행과 같은 30초 틱.
  //   끊김 기준은 heartbeatState(사이클 주기×2분, 사용자 확정 2026-07-03) 그대로 쓴다.
  const [hbNow, setHbNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setHbNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const hbView = heartbeatState(collectorHb, hbNow);
  // TallyOne 1.0(L1): 항차 건강 요약 — 홈 배지와 같은 healthSummary, 클릭 시 #/health 이동
  const healthIssueCount = useMemo(() => healthSummary(voyages).issueCount, [voyages]);

  // M3.5.6: 오늘 장비별 작업 보고 통계
  const equipStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const stats = {};
    (allReports || []).forEach(r => {
      if (!r.ts || r.ts < todayMs) return;
      const equip = r.equip || '미지정';
      if (!stats[equip]) stats[equip] = { total: 0, status: 0, hatch: 0, conbox: 0, damage: 0, sealError: 0, externalPause: 0, latest: 0 };
      stats[equip].total++;
      if (r.type === 'work_status') stats[equip].status++;
      else if (r.type === 'hatch') stats[equip].hatch++;
      else if (r.type === 'conbox') stats[equip].conbox++;
      else if (r.type === 'damage') stats[equip].damage++;
      else if (r.type === 'seal_error') stats[equip].sealError++;
      else if (r.type === 'external_pause') stats[equip].externalPause++;  // V9.57(I2): 작업중단(사고성) 분기 누락 — 표에 안 잡히던 것
      if (r.ts > stats[equip].latest) stats[equip].latest = r.ts;
    });
    return stats;
  }, [allReports]);

  // 최근 작업 보고 (시간순)
  const recentReports = useMemo(() => {
    return (allReports || []).slice(0, 30);
  }, [allReports]);

  // M3.5.5: 엠티 실 작업 중인 항차 (실시간 부착 현황)
  const sealVoyages = useMemo(() => {
    const list = [];
    Object.entries(voyages || {}).forEach(([key, v]) => {
      const policy = matchShipPolicy(v?.info?.vsl || '', extraPolicies);
      if (!policy) return;
      // M8.08: 엠티 실 작업은 선적(loading) 때만 적용. 양하는 제외.
      //   (양하 EDI엔 엠티 실 부착·확인 개념이 없음 — 선적 시 부착/확인하는 작업.)
      // V9.57(I5): 죽은 분기 정리 — ['loading'] 순회 안에서 discharge 비교하던 삼항 제거, mode 상수화.
      {
        const mode = 'loading';
        const sec = v[mode];
        if (!sec) return;
        const ediMap = sec.ediContainers || {};
        const recMap = sec.records || {};
        const targets = [];
        // V9.57(I5): 모수를 EDI만 → EDI∪리스트(records) 합집합으로 (LOLO 카드 156행과 동일 규칙).
        //   EDI 없이 리스트만 올라온 선적분(엠티 실 대상)이 현황에서 통째로 빠지던 것.
        const allCnSet = new Set([...Object.keys(ediMap), ...Object.keys(recMap)]);
        allCnSet.forEach(cn => {
          const e = ediMap[cn];
          const r = recMap[cn] || {};
          const c = e ? { ...e } : { ...r, cn };
          // V8.98-11: 부킹슬롯(__BOOK_ 예상자리, 실번호 없음) 제외 — 가상 엠티리스트 방지
          if (isBookingSlot(c)) return;
          // 평택만 — EDI가 있으면 POL로 판정. 리스트만 있으면 평택 선적 리스트(세관) 자체가
          // 평택분이므로 통과 (리스트 레코드엔 pol이 없어 판정 불가).
          if (e && !isPyeongtaekPort(c.pol)) return;
          const sm = applyPolicyToContainer(policy, c);
          if (!sm) return;
          // record로 보강 (eseal 등)
          targets.push({
            ...c,
            eseal: r.eseal || c.eseal || '',
            eseal_wrong: r.eseal_wrong || '',
            reseal: r.reseal || '',
            eseal_by: r.eseal_by || '',
            eseal_at: r.eseal_at || 0,
            _sealMode: sm,
          });
        });
        if (targets.length > 0) {
          // 최근 활동순 정렬 (eseal 있는 것 먼저, 없는 것은 위치순)
          targets.sort((a, b) => {
            if (a.eseal && b.eseal) return (b.eseal_at || 0) - (a.eseal_at || 0);
            if (a.eseal) return -1;
            if (b.eseal) return 1;
            return `${a.bay}-${a.row}-${a.tier}`.localeCompare(`${b.bay}-${b.row}-${b.tier}`);
          });
          list.push({
            voyageKey: key,
            voyage: v,
            mode,
            policy,
            targets,
            done: targets.filter(c => c.eseal).length,
            total: targets.length,
          });
        }
      }
    });
    return list;
  }, [voyages, extraPolicies]);

  // V8.06: LOLO 항차 감지 — 컨테이너에 베이 위치가 하나도 없으면 LOLO/IFCSUM 선박.
  //   각 모드(양하/선적)별로 처리된(completed) 건이 있으면 제출 리스트 내보내기 대상.
  const loloVoyages = useMemo(() => {
    const list = [];
    Object.entries(voyages || {}).forEach(([key, v]) => {
      ['discharge', 'loading'].forEach(mode => {
        const sec = v[mode];
        if (!sec) return;
        const ediMap = sec.ediContainers || {};
        const recMap = sec.records || {};
        const ediArr = Object.values(ediMap);
        const recArr = Object.values(recMap);
        // V8.09: EDI 없이 리스트(records)만 있어도 LOLO 카드 생성.
        //   RIZHAO 선적분처럼 IFCSUM/BAPLIE 없이 LOADING LIST 엑셀만 들어오는 경우,
        //   EDI 유무로만 판정하면 선적 카드가 안 떠 "선적이 어디 있나" 문제 발생.
        //   기준: EDI∪리스트에 컨테이너가 있고, 위치좌표(bay/row/tier)가 하나도 없으면 LOLO.
        //   일반 베이 선박은 EDI/리스트에 bay가 있어 isLolo=false → 영향 없음.
        const allArr = [...ediArr, ...recArr];
        if (allArr.length === 0) return;
        // V8.09-07: LOLO 판정을 선박정책(lolo 플래그) 기반으로 변경 (사용자 확정 2026-06-18).
        //   기존 "모든 컨에 bay/row/tier 없음"은 일반 베이 선박(TPMZ 등)이 위치정보 없이
        //   올라오면 LOLO로 오판 → 수석대시보드에 LOLO 리스트 잘못 생성. LOLO는 RZOR만.
        //   선박명/항차코드(voy)로 정책 매칭 후 lolo===true인 선박만 LOLO 카드 생성.
        const hints = [v?.info?.voy, v?.info?.voyage, v?.info?.callsign].filter(Boolean);
        const isLolo = isLoloShipByPolicy(v?.info?.vsl || '', extraPolicies, hints);
        if (!isLolo) return;
        const compMap = sec.completed || {};
        const doneCount = Object.keys(compMap).length;
        // M8.08: 컨테이너별 처리 상태 목록 — 실시간 표용. 리스트(세관) 기준 EDI∪records 합집합.
        const allCnSet = new Set([...Object.keys(ediMap), ...Object.keys(recMap)]);
        const rows = [...allCnSet].map(cn => {
          const e = ediMap[cn] || {}, r = recMap[cn] || {};
          const comp = compMap[cn] || null;
          return {
            cn,
            iso: r.iso || e.iso || '',
            fe: r.fe || e.fe || '',
            sl: r.sl || e.sl || '',
            done: !!comp,
            by: comp?.by || comp?.inspector || '',
            at: comp?.at || comp?.ts || 0,
          };
        });
        // 처리된 것 먼저(최근순), 미처리는 컨번호순.
        rows.sort((a, b) => {
          if (a.done && b.done) return (b.at || 0) - (a.at || 0);
          if (a.done) return -1;
          if (b.done) return 1;
          return a.cn.localeCompare(b.cn);
        });
        list.push({
          voyageKey: key,
          voyage: v,
          mode,
          vsl: v?.info?.vsl || '',
          voy: v?.info?.voy || v?.info?.voyage || '',
          total: allCnSet.size,        // 리스트(세관) 기준 전체.
          done: doneCount,
          rows,
          sec,
        });
      });
    });
    return list;
  }, [voyages, extraPolicies]);

  // LOLO 제출 리스트 내보내기 (두 양식)
  const exportLolo = (item, kind) => {
    const rows = buildLoloRows(item.sec);
    if (rows.length === 0) { setLoloNotice({ kind: 'err', text: '처리(완료)된 컨테이너가 없습니다. 검수사가 실체크·확인한 뒤 내보낼 수 있습니다.' }); return; }  // TallyOne 1.0(L5)
    const today = new Date();
    const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const meta = { vsl: item.vsl, voy: item.voy, date: stamp, port: tenant().addressEn, mode: item.mode };
    const modeKo = item.mode === 'discharge' ? '양하' : '선적';
    if (kind === 'seal') {
      downloadText(`LOLO_실번호리스트_${item.vsl}_${modeKo}_${stamp}.txt`, buildActualSealListText(meta, rows));
    } else {
      downloadText(`LOLO_검수리스트_${item.vsl}_${modeKo}_${stamp}.txt`, buildLoadingListText(meta, rows));
    }
  };

  // 오답 리포트 정렬 (최신순, 미해결 먼저)
  const feedbackList = useMemo(() => {
    // V9.36-02: 콘앱 신고는 POST(푸시키)라 ts 필드가 없다 — 배지엔 세어지고 목록엔 안 보이는
    //   유령 레코드가 됐다(미해결 1 · "미해결 오답 없음" 모순, 실DB 2026-07-04 1건으로 확인).
    //   DB 키를 _key로 붙이고 ts는 ts→at 폴백. 카운트·목록·해결처리 모두 같은 레코드를 본다.
    return Object.entries(feedback || {})
      .map(([k, f]) => (f ? { ...f, _key: k, ts: f.ts || f.at || 0 } : null))
      .filter(f => f && f.ts)
      .filter(f => showResolved || !f.resolved)
      .sort((a, b) => {
        // 미해결 먼저
        if (!!a.resolved !== !!b.resolved) return a.resolved ? 1 : -1;
        return (b.ts || 0) - (a.ts || 0);
      });
  }, [feedback, showResolved]);

  // V9.57(I6): 배지도 목록(feedbackList)과 같은 모수 — ts→at 폴백 후 ts 없는 유령 레코드 제외.
  //   종전엔 ts 필터 없이 세어 배지 숫자와 목록 건수가 어긋날 수 있었다(V9.36-02 유령 레코드 패턴).
  const unresolvedCount = useMemo(() =>
    Object.values(feedback || {})
      .map(f => (f ? { ...f, ts: f.ts || f.at || 0 } : null))
      .filter(f => f && f.ts && !f.resolved).length, [feedback]);

  // V8.02-02: 오답 '저금통' 내보내기 — 전체를 텍스트 파일로 다운로드.
  //   클로드(또는 개발자)에게 파일 하나로 전달하기 위함. 내보낸 시점의 ts 목록을 기억.
  // V9.57(I6): 내보내기·비우기도 목록(213행대)과 동일하게 _key·at 폴백 적용.
  //   종전엔 Object.values + f.ts 필터라 콘앱 신고(푸시키, ts 없음)가 내보내기에서 빠지고,
  //   비우기도 ts를 키로 삼아 푸시키 레코드를 못 지웠다. 이제 실제 DB 키(_key)로 삭제한다.
  const [exportedTs, setExportedTs] = useState([]);   // 내용물은 feedback DB 키(_key) 목록
  const exportFeedback = () => {
    const all = Object.entries(feedback || {})
      .map(([k, f]) => (f ? { ...f, _key: k, ts: f.ts || f.at || 0 } : null))
      .filter(f => f && f.ts)
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (all.length === 0) { setFbNotice({ kind: 'err', text: '내보낼 오답 리포트가 없습니다.' }); return; }  // TallyOne 1.0(L5)
    const lines = [];
    lines.push('# Tallyman 음성/질문 오답 리포트');
    lines.push(`# 내보낸 시각: ${new Date().toLocaleString('ko-KR')}`);
    lines.push(`# 총 ${all.length}건 (미해결 ${all.filter(f => !f.resolved).length}건)`);
    lines.push('');
    all.forEach((f, i) => {
      const d = new Date(f.ts);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      lines.push(`[${i + 1}] ${ds} · ${f.inspector || '익명'} · ${f.resolved ? '해결됨' : '미해결'} · v${f.appVersion || '?'}`);
      lines.push(`  선박: ${f.voyageVsl || '-'}`);
      lines.push(`  질문(Q): ${f.query || ''}`);
      lines.push(`  답변종류: ${f.answerType || '?'}`);
      if (f.answerText) lines.push(`  앱이 한 답: ${f.answerText}`);
      if (f.userNote) lines.push(`  검수사 메모: ${f.userNote}`);
      if (f.parsedSummary && Object.keys(f.parsedSummary).length) {
        lines.push(`  파싱: ${JSON.stringify(f.parsedSummary)}`);
      }
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `오답리포트_${stamp}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportedTs(all.map(f => f._key));   // V9.57(I6): 비우기 대상 = 방금 내보낸 것의 실제 DB 키
    setFbNotice({ kind: 'ok', text: `✅ 오답 ${all.length}건 내보냄 — 파일 다운로드 확인 후 [비우기]를 누르세요.` });  // TallyOne 1.0(L5)
  };
  // 내보낸 것만 비우기(안 본 것 보호). 내보내기 후에만 활성.
  const clearExported = async () => {
    if (exportedTs.length === 0) { setFbNotice({ kind: 'err', text: '먼저 내보내기를 하세요. 내보낸 건만 비웁니다.' }); return; }  // TallyOne 1.0(L5)
    try {
      const n = await fbClearFeedback(exportedTs);
      setExportedTs([]);
      setFbNotice({ kind: 'ok', text: `🧹 저금통 비움: ${n}건 삭제. 새 오답은 다시 쌓입니다.` });  // TallyOne 1.0(L5)
    } catch (e) {
      setFbNotice({ kind: 'err', text: '비우기 실패: ' + (e?.message || e) });  // TallyOne 1.0(L5): 조용한 실패 금지
    }
  };

  // 항차별 통계
  const voyageStats = useMemo(() => {
    return Object.entries(voyages || {})
      .filter(([k, v]) => v && v.info)
      .map(([k, v]) => {
        const dis = computeStats(v.discharge, 'discharge');
        const loa = computeStats(v.loading, 'loading');
        return {
          key: k,
          info: v.info,
          dis, loa,
          totalDone: dis.done + loa.done,
          totalAll: dis.total + loa.total,
        };
      })
      .sort((a, b) => (b.info.createdAt || 0) - (a.info.createdAt || 0));
  }, [voyages]);

  // 검수원별 일일 통계
  const inspectorStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const stats = {};
    Object.values(voyages || {}).forEach(v => {
      ['discharge', 'loading'].forEach(mode => {
        const sec = v?.[mode];
        if (!sec) return;
        Object.values(sec.completed || {}).forEach(comp => {
          if (!comp.by) return;
          if (!stats[comp.by]) stats[comp.by] = { name: comp.by, total: 0, today: 0, lastAt: 0, dis: 0, loa: 0 };
          stats[comp.by].total++;
          if (mode === 'discharge') stats[comp.by].dis++;
          else stats[comp.by].loa++;
          if (comp.at >= todayMs) stats[comp.by].today++;
          if (comp.at > stats[comp.by].lastAt) stats[comp.by].lastAt = comp.at;
        });
      });
    });

    // 활동 정보 합치기
    Object.values(inspectors || {}).forEach(i => {
      if (!i?.name) return;
      if (!stats[i.name]) stats[i.name] = { name: i.name, total: 0, today: 0, lastAt: 0, dis: 0, loa: 0 };
      stats[i.name].active = i.lastActive && (Date.now() - i.lastActive) < 90000;
      stats[i.name].lastVoyage = i.lastVoyage;
      stats[i.name].lastMode = i.lastMode;
    });

    return Object.values(stats).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  }, [voyages, inspectors]);

  // V7.40: 실시간 보드용 — 항차별 작업 중 검수원 (90초 이내 활동, HomePage activeInspectors와 동일 기준)
  // V7.99-8 (메모6): 작업 위치(호기·베이·홀드/데크·잔여)도 포함 — 수석이 어디 작업 중인지 본다.
  const activeByVoyage = useMemo(() => {
    const out = {};
    Object.values(inspectors || {}).forEach(i => {
      if (!i?.name || !i.lastVoyage || !i.lastActive) return;
      if (Date.now() - i.lastActive > 90000) return;
      if (!out[i.lastVoyage]) out[i.lastVoyage] = [];
      out[i.lastVoyage].push({
        name: i.name, mode: i.lastMode,
        equip: i.workEquip || null, bay: i.workBay || null,
        tier: i.workTier || null, remain: i.workRemain ?? null,
      });
    });
    return out;
  }, [inspectors]);

  // V7.40: 항차별 마지막 작업 보고 1건
  const lastReportByVoyage = useMemo(() => {
    const out = {};
    (allReports || []).forEach(r => {
      if (!r.voyageKey) return;
      if (!out[r.voyageKey] || (r.ts || 0) > (out[r.voyageKey].ts || 0)) out[r.voyageKey] = r;
    });
    return out;
  }, [allReports]);

  // V7.40: 항차별 오늘 경고(데미지·실오류) 건수
  const todayAlertsByVoyage = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const t0 = today.getTime();
    const out = {};
    (allReports || []).forEach(r => {
      if (!r.voyageKey || !r.ts || r.ts < t0) return;
      if (r.type !== 'damage' && r.type !== 'seal_error') return;
      if (!out[r.voyageKey]) out[r.voyageKey] = { damage: 0, sealError: 0 };
      if (r.type === 'damage') out[r.voyageKey].damage++;
      else out[r.voyageKey].sealError++;
    });
    return out;
  }, [allReports]);

  // 전체 합계
  const total = useMemo(() => {
    let done = 0, all = 0, ptkAll = 0, missing = 0;
    voyageStats.forEach(v => {
      done += v.totalDone;
      all += v.totalAll;
      ptkAll += v.dis.ptk + v.loa.ptk;
      // V8.90: 예상 EDI(리스트와 매칭 0) 항차의 '누락'은 허수 — 합계에서 제외(SWDN 2608S 사건)
      missing += (v.dis.forecastEdi ? 0 : v.dis.missing) + (v.loa.forecastEdi ? 0 : v.loa.missing);
    });
    return { done, all, ptkAll, missing };
  }, [voyageStats]);

  // TallyOne 1.0(L2): 작업 보드 행에 터미널 실적·출항 상태 합성.
  //   선박코드 매칭 = info.vsl 대문자(HomePage 908·913행과 동일), ±12h 작업창 가드(twOf).
  //   terminalStatus의 출항 별칭('departed'/'done')은 badgeRule 65행과 같은 판정.
  //   출항 항차는 보드 하단으로 내리고 카드를 흐리게 — 기존 최신순은 그룹 안에서 유지.
  const boardRows = useMemo(() => {
    const rows = voyageStats.map(v => {
      const sched = scheduleOf(v.info, pfMap);
      const tw = twOf(v.info, twMap, sched);
      const ts = String(v.info?.terminalStatus || '').trim().toLowerCase();
      return { ...v, _tw: tw, _departed: ts === 'departed' || ts === 'done' };
    });
    return [...rows.filter(r => !r._departed), ...rows.filter(r => r._departed)];
  }, [voyageStats, pfMap, twMap]);

  // ★ V9.44(사용자 확정 2026-08-02): **수석검수사만 진입한다.**
  //   종전엔 isChief 가 '완료 저장' 버튼에만 걸려 있어(V7.94-18) 일반 검수원도 화면에 들어와
  //   전체 통계·자료보관소·완료보관소·오답·공지작성·편집·항차삭제를 다 볼 수 있었다.
  //   사용자: "이제야 알았네요 일반 검수원이 수석대쉬보드 진입이 가능 하다는걸. 진입을 막아 주세요.
  //           물론 수석검수사만 출입이 가능하다는 문구와 함께."
  //   ⚠ 화면 가드일 뿐 데이터 차단이 아니다 — 진짜 권한 분리는 Firebase 규칙에서 해야 한다(다음 판).
  if (!chief) {
    return (
      <div className="max-w-3xl mx-auto px-3 py-10">
        <div className="bg-slate-900 border border-purple-800/50 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-lg font-bold text-purple-200 mb-2">수석 검수원 전용 화면입니다</div>
          <div className="text-sm text-slate-400 leading-relaxed">
            수석 검수원만 출입이 가능합니다.<br/>
            전체 진행률·보관소·편집 기능은 수석 검수원에게 요청해 주세요.
          </div>
          <div className="text-[11px] text-slate-500 mt-3">
            현재 로그인: <b className="text-slate-300">{inspector || '미상'}</b>
          </div>
          <button onClick={onGoHome}
            className="mt-5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-bold text-slate-200">
            ← 홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-3 py-3 space-y-3">
      <div>
        <div className="text-[10px] text-purple-400 font-bold uppercase mb-1">수석 검수원 대시보드</div>
        <div className="text-lg font-bold text-slate-100">전체 현황</div>
      </div>

      {/* TallyOne 1.0(L1): 수집기 상태 배너 — 끊기면 아래 모든 숫자가 갱신 정지임을 맨 위에서 알린다.
          하트비트 미수신(prop 미전달 포함)도 조용히 넘기지 않고 '자료 없음'으로 명시. */}
      <CollectorStatusBanner hbView={hbView} hb={collectorHb} issueCount={healthIssueCount} />

      {/* 전체 카운터 */}
      <div className="grid grid-cols-2 gap-2">
        <BigStat label="전체 확인" value={total.done.toLocaleString()} sub={`/ ${total.all.toLocaleString()}대`} color="emerald"/>
        <BigStat label="누락 (선사 추가 필요)" value={total.missing} sub={`평택 ${total.ptkAll}대 중`} color={total.missing > 0 ? "red" : "slate"}/>
      </div>

      {/* TallyOne 1.5: 화면 데이터만 새로고침 — 페이지 리로드 없이 구독 재연결(로그인 유지) */}
      <div className="flex justify-end">
        <RefreshDataButton onRefreshData={onRefreshData} refreshing={refreshing} refreshedAt={refreshedAt}/>
      </div>

      {/* V9.19-02: 바로가기 — 누르면 그 항목이 펼쳐지며 이동 */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-2">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {[
            ['board', '⚓ 작업 보드'], ['progress', '📋 진행 상황'], ['tally', '📑 마감 텔리'],
            ['inspectors', '👷 검수원'], ['reports', '📤 작업 보고'], ['equip', '🏗 장비 보고'],
            ['edit', '🖐 편집'], ['archive', '📚 자료 보관소'], ['restore', '🗄 완료 보관소'],
            ['seal', '🔒 엠티 실'], ['lolo', '🚛 LOLO'], ['feedback', '❌ 오답'],
            ['notice', '📢 공지'],
            // TallyOne 1.3: 활동 로그 바로가기 — 소유자에게만 노출
            ...(owner ? [['actlog', '🕵️ 활동 로그']] : []),
            // V9.42(사용자 지시 2026-08-02): 홈 상단 3카드를 없애면서 이 두 개를 여기 빈칸으로 옮겼다.
            //   섹션 접기가 아니라 각자 동작이 있어 onAct 로 구분한다.
            ['__search', '🔍 통합 검색'], ['__portmis', '📸 PORT-MIS 캡처'],
            // TallyOne 1.0(L4): 보조기능 바로가기 — 판2 신설 #/aux 라우트(팀K)로 이동
            ['__aux', '🧰 보조기능'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => (id === '__search' ? (onOpenGlobalSearch && onOpenGlobalSearch())
                                            : id === '__portmis' ? setShowPortMis(true)
                                            : id === '__aux' ? (window.location.hash = '#/aux')
                                            : jumpSec(id))}
              className="px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-[12px] font-bold text-slate-200 text-left truncate"
              style={{ minHeight: 40 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* V9.42: PORT-MIS 캡처 모달 — 홈 상단 3카드 정리로 이리로 옮겨왔다 */}
      {showPortMis && <PortMisCaptureModal onClose={() => setShowPortMis(false)} />}

      {/* V8.27: 검수원 공지 (흐르는 띠) */}
      <Fold id="notice" title="📢 검수원 공지 작성" open={!!openSecs.notice} onToggle={() => toggleSec('notice')}>
        <BroadcastComposer inspector={inspector} />
      </Fold>

      {/* 전체 검수원 진행률 (인원 무제한) */}
      <Fold id="inspectors" title={`👷 검수원 활동 (${inspectorStats.length}명)`} open={!!openSecs.inspectors} onToggle={() => toggleSec('inspectors')}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-amber-400"/>
          <div className="text-sm font-bold text-slate-100">검수원 활동 ({inspectorStats.length}명)</div>
        </div>
        {inspectorStats.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-4">아직 검수 기록 없음</div>
        ) : (
          <div className="space-y-1.5">
            {inspectorStats.map(s => (
              <InspectorRow key={s.name} s={s}/>
            ))}
          </div>
        )}
      </div>
      </Fold>

      {/* V7.40: ⚓ 실시간 작업 보드 — 동시 작업 선박을 카드로 한눈에 (기존 "항차별 진행" 대체) */}
      <Fold id="board" title={`⚓ 실시간 작업 보드 (${voyageStats.length}척)`} open={!!openSecs.board} onToggle={() => toggleSec('board')}>
      <div className="bg-slate-900 border border-blue-800/60 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-3">
          <Anchor className="w-4 h-4 text-blue-400"/>
          <div className="text-sm font-bold text-slate-100">실시간 작업 보드 ({voyageStats.length}척)</div>
          <span className="text-[10px] text-slate-500">실시간</span>
        </div>
        {voyageStats.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-4">진행 중 항차 없음</div>
        ) : (
          <div className={`grid gap-2 grid-cols-1 ${voyageStats.length >= 2 ? 'sm:grid-cols-2' : ''} ${voyageStats.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
            {/* TallyOne 1.0(L2): boardRows = voyageStats + 터미널 실적(_tw)·출항(_departed) 합성, 출항은 하단 */}
            {boardRows.map(v => (
              <LiveShipCard key={v.key} v={v}
                workers={activeByVoyage[v.key] || []}
                lastReport={lastReportByVoyage[v.key]}
                alerts={todayAlertsByVoyage[v.key]}
                tw={v._tw} departed={v._departed}
                onOpen={() => onOpenVoyage(v.key)}/>
            ))}
          </div>
        )}
      </div>
      </Fold>

      {/* M7.22: 라이브러리(진행 상황) + 선박별 자료 보관소(완료 기록) 분리 */}
      {chief && voyageStats.length > 0 && (
        <Fold id="edit" title="🖐 베이상세 편집 · 📐 컨펌용 플랜편집" open={!!openSecs.edit} onToggle={() => toggleSec('edit')}>
        <div className="bg-slate-900 border border-emerald-800/50 rounded-xl p-3">
          <div className="text-sm font-bold text-emerald-200 mb-2">🖐 베이상세 편집 <span className="text-[11px] text-slate-400 font-normal">— 오선적 정정 (수석 전용 · [저장]해야 검수사 화면 반영)</span></div>
          <div className="flex flex-wrap gap-2">
            {voyageStats.map(v => (
              <button key={v.key} onClick={() => setEditKey(v.key)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold bg-emerald-700 text-white hover:bg-emerald-600">
                {v.info?.vsl || v.key}
              </button>
            ))}
          </div>

          {/* V9.07: 선적 확정 플랜 편집 — 일항사 협의용. 초안(planDraft) → [확정] 시 검수앱 선적 플랜이 된다.
              실선적 기록(records.bay_actual)은 건드리지 않는다. */}
          <div className="text-sm font-bold text-violet-200 mt-3 mb-2">📐 컨펌용 플랜편집 <span className="text-[11px] text-slate-400 font-normal">— 일항사 협의용 ([확정] 눌러야 선적 플랜 반영 · 실선적 무관)</span></div>
          <div className="flex flex-wrap gap-2">
            {voyageStats.filter(v => voyages[v.key]?.loading?.ediContainers).map(v => (
              <button key={'p' + v.key} onClick={() => setPlanKey(v.key)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold bg-violet-700 text-white hover:bg-violet-600">
                {v.info?.vsl || v.key}
              </button>
            ))}
            {voyageStats.filter(v => voyages[v.key]?.loading?.ediContainers).length === 0 && (
              <span className="text-[11px] text-slate-500">선적 EDI가 올라온 항차가 없습니다</span>
            )}
          </div>
        </div>
        </Fold>
      )}
      {editKey && voyages[editKey] && (
        <ChiefBayEdit voyage={voyages[editKey]} voyageKey={editKey} inspector={inspector} activeWorkers={activeByVoyage[editKey] || []} onClose={() => setEditKey(null)} />
      )}
      {planKey && voyages[planKey] && (
        <LoadingPlanEdit voyage={voyages[planKey]} voyageKey={planKey} inspector={inspector} onClose={() => setPlanKey(null)} />
      )}
      <Fold id="progress" title="📋 진행 상황 · 완료 저장" open={!!openSecs.progress} onToggle={() => toggleSec('progress')}>
        {/* TallyOne 1.0(L3): 도선 예보 전달 — 진행 상황 줄에 일정 정보(완료 저장 타이밍 판단 근거) */}
        <LiveProgressSection voyages={voyages} onOpenVoyage={onOpenVoyage} chief={chief} inspector={inspector} pilotForecast={pfMap} />
      </Fold>
      <Fold id="archive" title="📚 선박별 자료 보관소" open={!!openSecs.archive} onToggle={() => toggleSec('archive')}>
        <ShipArchiveSection shipLib={shipLib} />
      </Fold>

      {/* V9.19-01: 마감 텔리 — 검수원이 보면 안 되는 서류라 수석 대시보드로 이동(사용자 확정) */}
      <Fold id="tally" title="📑 마감 텔리 (DEP.TALLY)" open={!!openSecs.tally} onToggle={() => toggleSec('tally')}>
        <TallyExportSection voyages={voyages} chief={chief} pfMap={pfMap} twMap={twMap}
          archiveList={arcList} onArchiveChanged={reloadArchive}
          boxRoot={boxRoot} onPickBox={onPickBox} resolveBox={resolveBox}/>
      </Fold>

      {/* V9.17: 완료 보관소 열람·복원 — 백엔드(archive/{key} + 복원·정리 함수)는 M7.18b에 완성돼
          있었는데 UI가 0이었다(전면 점검 §1-5). RZOR 통삭제 사건 같은 실수의 되돌리기가 이것. */}
      <Fold id="restore" title="🗄 완료 보관소 (복원)" open={!!openSecs.restore} onToggle={() => toggleSec('restore')}>
        <ArchiveRestoreSection chief={chief} onRestored={() => {}} />
      </Fold>

      {/* M3.5.6: 장비별 오늘 작업 보고 통계 */}
      {Object.keys(equipStats).length > 0 && (
        <Fold id="equip" title="🏗 오늘 장비별 작업 보고" open={!!openSecs.equip} onToggle={() => toggleSec('equip')}>
        <div className="bg-slate-900 border border-orange-700/40 rounded-xl p-3 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-orange-400"/>
            <div className="text-sm font-bold text-orange-100">오늘 장비별 작업 보고</div>
            <span className="text-[10px] text-slate-500">실시간</span>
            {/* V9.57(I3): 구독 한도(300건)에 걸리면 오늘 통계가 잘렸을 수 있음을 명시 */}
            {(allReports || []).length >= 300 && (
              <span className="text-[10px] text-amber-400 font-bold">최근 300건 기준 (더 오래된 보고는 미집계)</span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {/* V9.57(I1): 하드코딩 1~4호기 → 부두 최대 목록(1~5호기) ∪ 실제 보고에 등장한 장비.
                PNCT는 5호기가 있어 5호기 보고가 표에서 통째로 빠졌었다. '미지정'(장비 없는 보고,
                작업중단 등)은 맨 뒤 버킷으로 표시(I2). */}
            {(() => {
              const eqList = [...equipNumbersForPier(null)];
              Object.keys(equipStats).forEach(k => { if (k !== '미지정' && !eqList.includes(k)) eqList.push(k); });
              if (equipStats['미지정']) eqList.push('미지정');
              return eqList;
            })().map(eq => {
              const s = equipStats[eq];
              if (!s) return (
                <div key={eq} className="bg-slate-800/40 border border-slate-700/40 rounded p-2 opacity-50">
                  <div className="text-sm font-bold text-slate-400">🏗 {eq}</div>
                  <div className="text-[10px] text-slate-500">작업 없음</div>
                </div>
              );
              return (
                <div key={eq} className="bg-orange-900/20 border border-orange-700/40 rounded p-2">
                  <div className="text-sm font-bold text-orange-200">🏗 {eq}</div>
                  <div className="text-lg font-black text-orange-100">{s.total}건</div>
                  <div className="text-[10px] text-slate-400 space-y-0.5 mt-1">
                    {s.status > 0 && <div>📤 작업상태 {s.status}</div>}
                    {s.hatch > 0 && <div>🔓 해치 {s.hatch}</div>}
                    {s.conbox > 0 && <div>📦 콘박스 {s.conbox}</div>}
                    {s.damage > 0 && <div className="text-amber-300">⚠️ 데미지 {s.damage}</div>}
                    {s.sealError > 0 && <div className="text-red-300">🚨 실오류 {s.sealError}</div>}
                    {/* V9.57(I2): 작업중단(외부요인) — 사고성 보고라 가장 눈에 띄게 */}
                    {s.externalPause > 0 && <div className="text-red-300 font-black">⛔ 작업중단 {s.externalPause}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </Fold>
      )}

      {/* M3.5.6: 최근 작업 보고 (시간순) */}
      {recentReports.length > 0 && (
        <Fold id="reports" title="📤 최근 작업 보고 (30건)" open={!!openSecs.reports} onToggle={() => toggleSec('reports')}>
        <div className="bg-slate-900 border border-emerald-700/40 rounded-xl p-3 mt-3">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Send className="w-4 h-4 text-emerald-400"/>
            <div className="text-sm font-bold text-emerald-100">최근 작업 보고</div>
            <span className="text-[10px] text-slate-500">최근 30건</span>
            <div className="flex-1"/>
            <button onClick={() => {
              askConfirm({
                title: '⚠️ 모든 작업 보고 삭제',
                message: '모든 항차의 작업 보고와 사진을 삭제합니다.\n테스트 데이터 정리용입니다.\n\n되돌릴 수 없습니다. 계속하시겠습니까?',
                confirmLabel: '모두 삭제',
                cancelLabel: '취소',
                danger: true,
                onConfirm: async () => {
                  try {
                    await fbClearAllReportsAllVoyages();
                    await fbClearAllActiveWork();
                    setRepNotice({ kind: 'ok', text: '✅ 모든 작업 보고가 삭제되었습니다' });  // TallyOne 1.0(L5)
                  } catch (e) { setRepNotice({ kind: 'err', text: '삭제 실패: ' + e.message }); }  // TallyOne 1.0(L5)
                },
              });
            }}
              className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-[10px] font-bold flex items-center gap-1">
              <Trash2 className="w-3 h-3"/> 전체 삭제 (테스트용)
            </button>
          </div>
          {/* TallyOne 1.0(L5): 삭제 결과 인라인 통지 */}
          <InlineNotice notice={repNotice} onClose={() => setRepNotice(null)} />
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {recentReports.map((r, i) => {
              const time = r.ts ? new Date(r.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
              // V9.57(I2): external_pause(작업중단) 아이콘 누락 → 기본 '📋'로 묻히던 것. 사고성이라 ⛔ + 붉은 테두리.
              const icon = r.type === 'work_status' ? '📤' : r.type === 'hatch' ? '🔓' : r.type === 'conbox' ? '📦' : r.type === 'damage' ? '⚠️' : r.type === 'seal_error' ? '🚨' : r.type === 'external_pause' ? '⛔' : '📋';
              // V9.57(I7): 피드 voy는 firebase 구독이 voy_l 고정으로 붙인다 — 보고의 mode를 보고 voy_d/voy_l 선택.
              const rInfo = voyages?.[r.voyageKey]?.info;
              const rVoy = r.mode === 'discharge' ? (rInfo?.voy_d || rInfo?.voy || r.voy)
                : r.mode === 'loading' ? (rInfo?.voy_l || rInfo?.voy || r.voy)
                : r.voy;
              return (
                <div key={i} className={`bg-slate-950 border rounded p-2 text-xs group ${r.type === 'external_pause' ? 'border-red-700/70' : 'border-slate-800'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1">
                      <span>{icon}</span>
                      <span className="font-bold text-slate-200">{r.vsl} {rVoy}</span>
                      {r.equip && <span className="text-[10px] bg-orange-700 text-white px-1 py-0.5 rounded font-bold">{r.equip}</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 mono">{time}</span>
                      <button onClick={() => {
                        askConfirm({
                          title: '보고 삭제',
                          message: `${r.vsl} ${r.voy}\n${r.equip || ''} 보고를 삭제하시겠습니까?`,
                          confirmLabel: '삭제',
                          cancelLabel: '취소',
                          danger: true,
                          onConfirm: async () => {
                            try {
                              await fbDeleteWorkReport(r.voyageKey, r.ts);
                            } catch (e) { setRepNotice({ kind: 'err', text: '삭제 실패: ' + e.message }); }  // TallyOne 1.0(L5)
                          },
                        });
                      }}
                        className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded opacity-50 group-hover:opacity-100"
                        title="이 보고 삭제">
                        <Trash2 className="w-3 h-3"/>
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-300 whitespace-pre-line ml-4">{r.message || ''}</div>
                </div>
              );
            })}
          </div>
        </div>
        </Fold>
      )}

      {/* M3.5.5: 엠티 실 작업 실시간 현황 */}
      {sealVoyages.length > 0 && (
        <Fold id="seal" title={`🔒 엠티 실 작업 현황 (${sealVoyages.length})`} open={!!openSecs.seal} onToggle={() => toggleSec('seal')}>
        <div className="bg-slate-900 border border-amber-700/40 rounded-xl p-3 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-amber-400"/>
            <div className="text-sm font-bold text-amber-100">엠티 실 작업 실시간 현황</div>
            <span className="text-[10px] text-slate-500">실시간 갱신</span>
          </div>
          <div className="space-y-3">
            {sealVoyages.map(sv => (
              <SealVoyageCard key={`${sv.voyageKey}-${sv.mode}`} sv={sv} onOpenVoyage={onOpenVoyage}/>
            ))}
          </div>
        </div>
        </Fold>
      )}

      {/* V8.06: LOLO 검수 제출 리스트 (RIZHAO 등 RORO/LOLO 혼용선) */}
      {loloVoyages.length > 0 && (
        <Fold id="lolo" title={`🚛 LOLO 검수 제출 리스트 (${loloVoyages.length})`} open={!!openSecs.lolo} onToggle={() => toggleSec('lolo')}>
        <div className="bg-slate-900 border border-cyan-800/40 rounded-xl p-3 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-cyan-400"/>
            <div className="text-sm font-bold text-slate-100">LOLO 검수 제출 리스트</div>
            <span className="text-[10px] text-cyan-300/70">베이 없는 LOLO 선박 · 처리분만 내보냄</span>
          </div>
          {/* TallyOne 1.0(L5): 내보내기 결과 인라인 통지 */}
          <InlineNotice notice={loloNotice} onClose={() => setLoloNotice(null)} />
          <div className="space-y-2">
            {loloVoyages.map((item, idx) => (
              <LoloVoyageCard key={`${item.voyageKey}-${item.mode}`}
                item={item}
                onOpenVoyage={onOpenVoyage}
                onExport={exportLolo}
              />
            ))}
          </div>
        </div>
        </Fold>
      )}

      {/* M3.4: 오답 리포트 (검수원 신고 → 다음 버전 개선용) */}
      <Fold id="feedback" title={`❌ 오답 리포트${unresolvedCount > 0 ? ` (미해결 ${unresolvedCount})` : ''}`} open={!!openSecs.feedback} onToggle={() => toggleSec('feedback')}>
      <div className="bg-slate-900 border border-red-800/40 rounded-xl p-3 mt-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400"/>
            <div className="text-sm font-bold text-slate-100">오답 리포트</div>
            {unresolvedCount > 0 && (
              <span className="bg-red-700 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                미해결 {unresolvedCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={exportFeedback}
              title="오답 전체를 텍스트 파일로 내려받기 (클로드에게 전달용)"
              className="text-[10px] text-sky-300 hover:text-sky-100 px-2 py-0.5 rounded border border-sky-700/50 bg-sky-900/30">
              📥 내보내기
            </button>
            <button onClick={clearExported}
              title="방금 내보낸 오답만 비우기 (안 본 것은 보호)"
              disabled={exportedTs.length === 0}
              className={`text-[10px] px-2 py-0.5 rounded border ${exportedTs.length === 0
                ? 'text-slate-600 border-slate-800 cursor-not-allowed'
                : 'text-amber-300 hover:text-amber-100 border-amber-700/50 bg-amber-900/30'}`}>
              🧹 비우기
            </button>
            <button onClick={() => setShowResolved(v => !v)}
              className="text-[10px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded border border-slate-700">
              {showResolved ? '미해결만' : '해결된 것도'}
            </button>
          </div>
        </div>
        {/* TallyOne 1.0(L5): 내보내기·비우기 결과 인라인 통지 */}
        <InlineNotice notice={fbNotice} onClose={() => setFbNotice(null)} />
        <div className="text-[10px] text-slate-500 mb-2">
          검수원이 잘못된 답변에 ❌ 오답 버튼 누르면 여기 모입니다 → 다음 버전에서 패턴 보강
        </div>
        {feedbackList.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-4">
            {showResolved ? '오답 리포트 없음' : '미해결 오답 없음 ✓'}
          </div>
        ) : (
          <div className="space-y-2">
            {feedbackList.slice(0, 50).map(f => (
              <FeedbackRow key={f._key || f.ts} feedback={f}/>
            ))}
            {feedbackList.length > 50 && (
              <div className="text-[10px] text-slate-500 text-center pt-1">
                ... {feedbackList.length - 50}건 더 있음
              </div>
            )}
          </div>
        )}
      </div>
      </Fold>

      {/* TallyOne 1.3: 활동 로그 — 소유자 전용. 기본 접힘, 펼칠 때 조회+30일 정리 1회. */}
      {owner && (
        <Fold id="actlog" title="🕵️ 활동 로그" open={!!openSecs.actlog} onToggle={() => toggleSec('actlog')}>
          <ActivityLogSection voyages={voyages} />
        </Fold>
      )}

      {/* M3.74: confirm() → ConfirmModal */}
      <ConfirmModal {...confirmState} />
    </div>
  );
}

// M8.08: LOLO 검수 항차 카드 (실시간 표). 양하/선적 모두, 처리 현황을 컨테이너별로 표시.
//   ATRP 엠티 실 현황과 동일 형태 — 처리된 건 검수자·시각 표시, 미처리는 흐리게.
function LoloVoyageCard({ item, onOpenVoyage, onExport }) {
  const modeKo = item.mode === 'discharge' ? '양하' : '선적';
  return (
    <div className="border-2 border-cyan-700/50 bg-cyan-950/15 rounded-lg p-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-100">
            🔍 {item.vsl || '(선박명 없음)'} <span className="text-slate-400">{item.voy}</span>
          </div>
          <div className="text-[10px] text-slate-500">{modeKo} 검수 · LOLO(베이 없음)</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-black ${item.done === item.total ? 'text-emerald-400' : 'text-amber-400'}`}>
            {item.done} / {item.total}
          </div>
          <div className="text-[10px] text-slate-500">{item.total - item.done}대 남음</div>
        </div>
      </div>

      {/* 실시간 표 (최대 50줄) */}
      <div className="bg-slate-950 rounded border border-slate-700 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-800 text-slate-400">
            <tr>
              <th className="px-1.5 py-1 text-left w-8">No</th>
              <th className="px-1.5 py-1 text-left">컨번호</th>
              <th className="px-1.5 py-1 text-left w-14">규격</th>
              <th className="px-1.5 py-1 text-left w-10">F/E</th>
              <th className="px-1.5 py-1 text-left w-24">실번호</th>
              <th className="px-1.5 py-1 text-left w-14">검수자</th>
              <th className="px-1.5 py-1 text-left w-12">시각</th>
            </tr>
          </thead>
          <tbody>
            {item.rows.slice(0, 50).map((c, i) => (
              <tr key={i} className={`border-t border-slate-800 ${c.done ? '' : 'opacity-50'}`}>
                <td className="px-1.5 py-1 text-slate-500 mono">{i + 1}</td>
                <td className="px-1.5 py-1 mono text-slate-200">{c.cn}</td>
                <td className="px-1.5 py-1 mono text-slate-400">{c.iso}</td>
                <td className="px-1.5 py-1 mono">
                  {c.fe === 'E'
                    ? <span className="text-amber-300 font-bold">E</span>
                    : <span className="text-rose-300">F</span>}
                </td>
                <td className="px-1.5 py-1 mono text-slate-300 text-[10px] break-all">
                  {c.sl || <span className="text-slate-600">-</span>}
                </td>
                <td className="px-1.5 py-1 text-slate-400 text-[10px]">
                  {c.done ? (c.by || '✓') : <span className="text-slate-600">⏳ 대기</span>}
                </td>
                <td className="px-1.5 py-1 text-slate-500 text-[10px] mono">
                  {c.at ? new Date(c.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {item.rows.length > 50 && (
          <div className="text-[10px] text-slate-500 text-center py-1 border-t border-slate-800">
            ... 외 {item.rows.length - 50}대 (엑셀 다운로드로 전체 확인)
          </div>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button onClick={() => onOpenVoyage?.(item.voyageKey)}
          className="py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-bold">
          항차 열기
        </button>
        <button onClick={() => onExport(item, 'seal')}
          title="실번호 변경·리씰·실오류 건만 (ACTUAL SEAL LIST 형식)"
          className="py-2 bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-200 rounded text-xs font-bold flex items-center justify-center gap-1">
          <Send className="w-3 h-3"/>실번호
        </button>
        <button onClick={() => onExport(item, 'loading')}
          title="처리분 전체 (LOADING LIST 형식)"
          className="py-2 bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-200 rounded text-xs font-bold flex items-center justify-center gap-1">
          <FileSpreadsheet className="w-3 h-3"/>검수리스트
        </button>
      </div>
    </div>
  );
}

// M3.5.5: 엠티 실 작업 항차 카드 (실시간 표)
function SealVoyageCard({ sv, onOpenVoyage }) {
  const [downloading, setDownloading] = useState(false);
  // TallyOne 1.0(L5): 다운로드 결과 alert → 카드 안 인라인 통지
  const [notice, setNotice] = useState(null);
  const isAttach = sv.policy.mode === 'attach';
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const result = await generateEmptySealReport({
        voyage: sv.voyage,
        sealTargets: sv.targets,
        sealMode: sv.policy.mode,
      });
      setNotice({ kind: 'ok', text: `✅ 다운로드: ${result.filename}\n${result.rowCount}대` });
    } catch (e) {
      setNotice({ kind: 'err', text: '실패: ' + e.message });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={`border-2 rounded-lg p-2.5 ${isAttach ? 'border-red-700/50 bg-red-950/15' : 'border-cyan-700/50 bg-cyan-950/15'}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-100">
            {isAttach ? '🔧' : '🔍'} {sv.voyage?.info?.vsl} <span className="text-slate-400">{sv.voyage?.info?.voy_l || sv.voyage?.info?.voy}</span>
          </div>
          <div className="text-[10px] text-slate-500">{sv.policy.label}</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-black ${sv.done === sv.total ? 'text-emerald-400' : 'text-amber-400'}`}>
            {sv.done} / {sv.total}
          </div>
          <div className="text-[10px] text-slate-500">{sv.total - sv.done}대 남음</div>
        </div>
      </div>

      {/* TallyOne 1.0(L5): 다운로드 결과 인라인 통지 */}
      <InlineNotice notice={notice} onClose={() => setNotice(null)} />

      {/* 실시간 표 (최대 50줄) */}
      <div className="bg-slate-950 rounded border border-slate-700 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-800 text-slate-400">
            <tr>
              <th className="px-1.5 py-1 text-left w-8">No</th>
              <th className="px-1.5 py-1 text-left">컨번호</th>
              <th className="px-1.5 py-1 text-left w-14">규격</th>
              <th className="px-1.5 py-1 text-left w-20">엠티실</th>
              {sv.policy.mode === 'verify' && <th className="px-1.5 py-1 text-left w-20">리씰/틀린</th>}
              <th className="px-1.5 py-1 text-left w-14">검수자</th>
              <th className="px-1.5 py-1 text-left w-12">시각</th>
            </tr>
          </thead>
          <tbody>
            {sv.targets.slice(0, 50).map((c, i) => {
              const filled = !!c.eseal;
              return (
                <tr key={i} className={`border-t border-slate-800 ${filled ? '' : 'opacity-50'}`}>
                  <td className="px-1.5 py-1 text-slate-500 mono">{i + 1}</td>
                  <td className="px-1.5 py-1 mono text-slate-200">{c.cn || '(현장부여)'}</td>
                  <td className="px-1.5 py-1 mono text-slate-400">{emptySealSpec(c)}</td>
                  <td className="px-1.5 py-1 mono">
                    {c.eseal ? <span className="text-emerald-300 font-bold">{c.eseal}</span> : <span className="text-slate-600">⏳ 대기</span>}
                  </td>
                  {sv.policy.mode === 'verify' && (
                    <td className="px-1.5 py-1 mono">
                      {c.reseal && <span className="text-purple-300">🔄{c.reseal}</span>}
                      {c.eseal_wrong && <span className="text-amber-300 ml-1">⚠️{c.eseal_wrong}</span>}
                    </td>
                  )}
                  <td className="px-1.5 py-1 text-slate-400 text-[10px]">{c.eseal_by || '-'}</td>
                  <td className="px-1.5 py-1 text-slate-500 text-[10px] mono">
                    {c.eseal_at ? new Date(c.eseal_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sv.targets.length > 50 && (
          <div className="text-[10px] text-slate-500 text-center py-1 border-t border-slate-800">
            ... 외 {sv.targets.length - 50}대 (엑셀 다운로드로 전체 확인)
          </div>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={() => onOpenVoyage?.(sv.voyageKey)}
          className="py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-bold">
          항차 열기
        </button>
        <button onClick={handleDownload} disabled={downloading}
          className={`py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1 ${
            isAttach ? 'bg-red-700 hover:bg-red-600' : 'bg-cyan-700 hover:bg-cyan-600'
          } disabled:opacity-50`}>
          <FileSpreadsheet className="w-3 h-3"/>
          {downloading ? '...' : '엑셀'}
        </button>
      </div>
    </div>
  );
}

// 오답 리포트 한 줄
function FeedbackRow({ feedback: f }) {
  const [expanded, setExpanded] = useState(false);
  // M3.74: confirm() → ConfirmModal
  const [confirmState, askConfirm] = useConfirm();
  const date = new Date(f.ts);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const typeColor = f.answerType === 'ai' ? 'text-purple-300' : 'text-emerald-300';
  const typeLabel = f.answerType === 'ai' ? 'AI' : f.answerType === 'local' ? '즉답' : '?';

  return (
    <div className={`bg-slate-950 border ${f.resolved ? 'border-slate-800 opacity-60' : 'border-red-900/40'} rounded-lg p-2.5`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {f.resolved && <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0"/>}
          <span className="text-[10px] text-slate-500">{dateStr}</span>
          <span className="text-[10px] text-amber-300 font-bold">{f.inspector}</span>
          <span className={`text-[10px] font-bold ${typeColor}`}>[{typeLabel}]</span>
          {f.voyageVsl && <span className="text-[10px] text-slate-500 truncate">{f.voyageVsl}</span>}
          <span className="text-[9px] text-slate-600 mono">v{f.appVersion}</span>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => fbResolveFeedback(f._key || f.ts, !f.resolved)}
            title={f.resolved ? '미해결로 되돌리기' : '해결됨 표시'}
            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-700/40">
            {f.resolved ? '↩' : '✓'}
          </button>
          <button onClick={() => askConfirm({
            title: '오답 리포트 삭제',
            message: `Q: ${(f.query || '').slice(0, 50)}\n\n이 오답 리포트를 삭제하시겠습니까?`,
            confirmLabel: '삭제',
            cancelLabel: '취소',
            danger: true,
            onConfirm: async () => { await fbDeleteFeedback(f._key || f.ts); },
          })}
            title="삭제"
            className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-700/40">
            <Trash2 className="w-2.5 h-2.5"/>
          </button>
        </div>
      </div>
      <ConfirmModal {...confirmState} />
      <div className="text-xs text-amber-200 mono break-all mb-1">Q: {f.query}</div>
      {f.userNote && (
        <div className="text-xs text-slate-300 bg-slate-900/60 rounded px-2 py-1 mb-1 leading-relaxed">
          💬 {f.userNote}
        </div>
      )}
      <button onClick={() => setExpanded(v => !v)}
        className="text-[10px] text-slate-500 hover:text-slate-300">
        {expanded ? '▼ 답변 숨기기' : '▶ 앱 답변 보기'}
      </button>
      {expanded && (
        <div className="mt-1 text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed bg-slate-900/40 rounded p-2 max-h-40 overflow-y-auto">
          {f.answerText || '(없음)'}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// M7.22: 선박 라이브러리 (진행 상황) — 현재 살아있는 voyages 기준.
//   수석검수사가 최종 확인 후 [완료 저장] → archive 백업 + 보관소 기록 + voyages 삭제.
//   양하/선적 수는 평택분(tallyVoyagesByShip이 _ptkCountOfSection로 집계).
// ─────────────────────────────────────────────────────────────
function LiveProgressSection({ voyages, onOpenVoyage, chief, inspector, pilotForecast = {} }) {
  const [busyKey, setBusyKey] = useState(null);
  const [confirmKey, setConfirmKey] = useState(null);
  // TallyOne 1.0(L5): 결과 통지 alert() → 섹션 안 인라인 알림(확인창 성격 window.confirm은 유지)
  const [notice, setNotice] = useState(null);

  // 항차별 진행 행 (선박별 합계가 아니라 항차 단위 — 완료는 항차별로 누름)
  const rows = useMemo(() => {
    const out = [];
    for (const [key, v] of Object.entries(voyages || {})) {
      const info = v.info || {};
      const vsl = info.vsl || key.split('_')[0] || '(선박명 미상)';
      const dPtk = countPtkSection(v.discharge, 'discharge');
      const lPtk = countPtkSection(v.loading, 'loading');
      out.push({
        key, vsl,
        voyD: info.voy_d || '', voyL: info.voy_l || '',
        discharge: dPtk, loading: lPtk,
        // TallyOne 1.0(L3): 일정 정보 — 수집기가 채우는 planDate("ETA ~ ETD")·planSrc(출처 판단 결과)
        planDate: info.planDate || '', planSrc: info.planSrc || '',
        imo: info.imo || '',
        createdAt: info.createdAt || 0,
        // V7.90: 완료 분리 — 보유 모드가 전부 완료되면 수석 최종 저장 가능 (구 inspectorDone 하위호환)
        inspectorDone: !!info.inspectorDone
          || ((dPtk === 0 && lPtk === 0) ? false
              : (dPtk === 0 || !!info.dischargeDone) && (lPtk === 0 || !!info.loadingDone)),
        inspectorDoneAt: info.inspectorDoneAt || Math.max(info.dischargeDoneAt || 0, info.loadingDoneAt || 0),
        dDone: !!(info.inspectorDone || info.dischargeDone), dDoneAt: info.dischargeDoneAt || 0,
        lDone: !!(info.inspectorDone || info.loadingDone), lDoneAt: info.loadingDoneAt || 0,
      });
    }
    return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [voyages]);

  const doComplete = async (row) => {
    if (!chief) {   // V7.94-18: 수석검수/부수석만 완료 저장 가능
      alert('⚠️ 완료 저장 권한이 없습니다.\n\n항차 완료 저장은 수석검수사만 할 수 있습니다.\n(현재 로그인: ' + (inspector || '미상') + ')\n\n수석검수사에게 완료 저장을 요청하세요.');
      setConfirmKey(null);
      return;
    }
    // V8.92: 선적 미완 가드(RZOR R074E 사건 2026-07-13) — 선적 항차(voy_l)가 배정돼 있는데
    //   선적 완료 표시가 없으면(자료가 아직 안 와 lPtk=0이라 버튼이 열린 경우) 통삭제 전에
    //   명시적 확인을 받는다. 완료 저장은 항차 전체(양하+선적)를 보관소로 옮기고 화면에서 지운다.
    //   (실사고: RZOR 양하 완료 → 수석 완료 저장 → 선적 R074W 진행 예정인데 항차 전체 소실.)
    {
      const _info = (voyages[row.key] || {}).info || {};
      if (_info.voy_l && !_info.loadingDone && !_info.inspectorDone) {
        const go = window.confirm(
          `⚠ 이 항차에는 선적(${_info.voy_l})이 배정되어 있는데 선적 완료 표시가 없습니다.\n\n` +
          `완료 저장은 항차 전체(양하·선적)를 보관소로 옮기고 화면에서 지웁니다.\n` +
          `선적 작업이 남아 있으면 [취소]를 누르세요.\n\n정말 완료 저장할까요?`);
        if (!go) { setConfirmKey(null); return; }
      }
    }
    // TallyOne 1.8-12: **오프라인 배너를 믿고 막지 않는다.**
    //   1.8-11 은 `.info/connected` 가 false 면 완료 저장을 차단했다. 그런데 그 값이 **거짓으로
    //   false 에 멈춰 있는 경우**가 실측됐다(2026-08-05, 집 PC·유선). 배너가 떠 있는 상태에서
    //   누른 검수 완료가 서버에 정상 기록됐다(dischargeDoneAt·loadingDoneAt 11:39).
    //   `fbReconnect()` 의 goOffline→goOnline 이 `.info/connected` 구독을 끊고 복구를 못 한 탓으로
    //   보인다. 그 거짓 신호로 막으면 **완료 저장을 영영 못 하게 된다** — 원래 문제보다 나쁘다.
    //   → 막지 않는다. 아래 시간 제한이 '갇힘'을 막고, 시간이 넘으면 삭제하지 않는다.
    //     연결이 의심스러우면 알리기만 한다.
    if (!(await fbIsOnline())) {
      setNotice({ kind: 'warn', text: '⚠ 연결이 끊긴 것으로 보입니다 — 그래도 저장을 시도합니다.\n1분 안에 끝나지 않으면 중단하고 항차는 그대로 둡니다. (화면 새로고침으로 연결이 되살아나기도 합니다)' });
    }
    setBusyKey(row.key);
    try {
      // TallyOne 1.8-11: 시작한 뒤 신호가 끊겨도 **갇히지 않게** 시간 제한을 둔다.
      //   백업이 끝났는지 모르는 채로 삭제하는 일은 없어야 하므로, 시간이 넘으면 삭제하지 않고
      //   실패로 처리한다. 큐에 남은 쓰기는 연결이 살아나면 archive 에 들어가지만, **삭제는 안 한다.**
      const ok = await Promise.race([
        fbArchiveVoyageBeforeDelete(row.imo, row.key, voyages[row.key]),
        new Promise((res) => setTimeout(() => res('timeout'), 60000)),
      ]);
      if (ok === 'timeout') {
        setNotice({ kind: 'err', text: `완료 저장이 끝나지 않았습니다(${row.vsl}) — 신호가 끊긴 것으로 보입니다.\n항차는 그대로 두었습니다. 신호 잡히는 곳에서 다시 눌러 주세요.` });
        setBusyKey(null); setConfirmKey(null);
        return;
      }
      if (!ok) {
        // TallyOne 1.0(L5): alert → 인라인 알림
        setNotice({ kind: 'err', text: `완료 저장 실패(${row.vsl}) — 백업이 저장되지 않아 삭제하지 않았습니다. 네트워크 확인 후 다시 시도하세요.` });
        setBusyKey(null); setConfirmKey(null);
        return;
      }
      await fbDeleteVoyage(row.key);
      setNotice({ kind: 'ok', text: `✅ ${row.vsl} 완료 저장 — 보관소로 이동했습니다.` });  // TallyOne 1.0(L5): 성공도 화면에 명시
    } catch (e) {
      console.error('[수석 완료] 실패:', row.key, e);
      setNotice({ kind: 'err', text: `완료 저장 중 오류가 발생해 삭제하지 않았습니다(${row.vsl}). ${e?.message || e}` });  // TallyOne 1.0(L5)
    }
    setBusyKey(null); setConfirmKey(null);
  };

  // ── V8.93: 실선적 EDI(표준 BAPLIE) + 수정용 엑셀 왕복 (사용자 확정 2026-07-13) ──
  //   범위 = 평택 선적분(실체 위치 우선). 선적확인된 컨 우선 — 완료 0이면 전체(확인창).
  const ediFileRef = React.useRef(null);
  const [ediUpKey, setEdiUpKey] = useState(null);
  const _ediMeta = (key, v) => {
    const info = (v && v.info) || {};
    return { vsl: info.vsl || key.split('_')[0] || 'VSL', vslFull: info.vslFull || '',
             voy: info.voy_l || info.voy || '', callsign: info.callsign || '', imo: info.imo || '',
             carrier: info.carrier || '' };
  };
  const _collectOrWarn = (row) => {
    const v = voyages[row.key];
    if (!v) return null;
    const got = collectActualLoading(v);
    if (!got.rows.length) { setNotice({ kind: 'err', text: '평택 선적분 자료가 없습니다.' }); return null; }  // TallyOne 1.0(L5)
    if (!got.useDoneOnly && !window.confirm(
      `선적확인(완료)된 컨이 아직 없습니다.\n전체 평택 선적분 ${got.totalPtk}대 기준으로 만들까요?`)) return null;
    return { ...got, meta: _ediMeta(row.key, v) };
  };
  // TallyOne 1.7: TALLYBOX가 연결돼 있으면 다운로드 대신 `{선박}\{항차}\` 에 바로 쓴다.
  //   연결 안 됐거나 미지원 브라우저면 종전대로 다운로드(폴백). 실패해도 다운로드로 떨어진다.
  const _saveOrDownload = async (row, kind, filename, text) => {
    const v = voyages[row.key];
    const info = (v && v.info) || {};
    try {
      const root = await resolveBox();
      if (root) {
        const ext = filename.slice(filename.lastIndexOf('.'));
        const name = fileNameFor(kind, info.vsl || row.vsl, info.voy_d, info.voy_l, ext);
        const p = await writeTallyboxFile(root, info.vsl || row.vsl, folderName(info.voy_d, info.voy_l), name,
          new Blob([text], { type: 'text/plain' }));
        setNotice({ kind: 'ok', text: `✅ TALLYBOX\\${p} 저장 — 다운로드 폴더를 거치지 않았습니다.` });
        return;
      }
    } catch (e) {
      setNotice({ kind: 'err', text: `TALLYBOX 저장 실패 — 다운로드로 내려받습니다. (${e?.message || e})` });
    }
    downloadText(filename, text);
  };
  const exportActualEdi = (row) => {
    const got = _collectOrWarn(row);
    if (!got) return;
    _saveOrDownload(row, 'edi', `${got.meta.vsl}_${got.meta.voy}_ACTUAL_BAPLIE.edi`, buildActualBaplie(got.rows, got.meta));
  };
  // V8.94: 실선적 ASC(카스피 $604) — 선박코드는 기본 검수앱 코드, 저장 전 입력창에서 수정 가능(선박별 기억).
  const exportActualAsc = (row) => {
    const got = _collectOrWarn(row);
    if (!got) return;
    const lsKey = 'ascShipCode_' + got.meta.vsl;
    let saved = '';
    try { saved = localStorage.getItem(lsKey) || ''; } catch { /* 무시 */ }
    const input = window.prompt('ASC 선박코드(4자)\n기본은 검수앱 코드입니다. 카스피 코드가 따로 있으면 고쳐 주세요.', saved || got.meta.vsl);
    if (input == null) return;
    const shipCode = (input.trim().toUpperCase() || got.meta.vsl).slice(0, 4);
    try { localStorage.setItem(lsKey, shipCode); } catch { /* 무시 */ }
    _saveOrDownload(row, 'asc', `${got.meta.vsl}${got.meta.voy}.ASC`, buildActualAsc(got.rows, { ...got.meta, shipCode }));
  };
  const exportEditExcel = async (row) => {
    const got = _collectOrWarn(row);
    if (!got) return;
    try {
      const buf = await buildEditExcel(got.rows, got.meta);
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${got.meta.vsl}_${got.meta.voy}_EDIT.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setNotice({ kind: 'err', text: '엑셀 생성 실패: ' + (e && e.message || e) });  // TallyOne 1.0(L5)
    }
  };
  const startExcelToEdi = (row) => {
    setEdiUpKey(row.key);
    if (ediFileRef.current) { ediFileRef.current.value = ''; ediFileRef.current.click(); }
  };
  const onExcelpicked = async (e) => {
    const file = e.target.files && e.target.files[0];
    const key = ediUpKey;
    setEdiUpKey(null);
    if (!file || !key) return;
    try {
      const { rows, errors } = await parseEditExcel(await file.arrayBuffer());
      if (!rows.length) { setNotice({ kind: 'err', text: '엑셀에서 컨테이너를 읽지 못했습니다.\n' + errors.join('\n') }); return; }  // TallyOne 1.0(L5)
      if (errors.length && !window.confirm(`형식 경고 ${errors.length}건:\n` + errors.slice(0, 8).join('\n') + '\n\n그래도 EDI를 만들까요?')) return;
      const meta = _ediMeta(key, voyages[key] || {});
      downloadText(`${meta.vsl}_${meta.voy}_ACTUAL_BAPLIE_수정본.edi`, buildActualBaplie(rows, meta));
      setNotice({ kind: 'ok', text: `✅ 수정본 EDI 생성 완료 — ${rows.length}대 (엑셀 기준)` });  // TallyOne 1.0(L5)
    } catch (err) {
      setNotice({ kind: 'err', text: '엑셀 읽기 실패: ' + (err && err.message || err) });  // TallyOne 1.0(L5)
    }
  };

  return (
    <div className="bg-slate-900 border border-cyan-800/40 rounded-xl p-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Ship className="w-4 h-4 text-cyan-400" />
        <div className="text-sm font-bold text-slate-100 flex-1">
          진행 상황 ({rows.length}척 작업 중)
        </div>
      </div>
      {/* TallyOne 1.0(L5): 이 섹션의 결과 통지(완료 저장·EDI/엑셀 생성) 인라인 표시 */}
      <InlineNotice notice={notice} onClose={() => setNotice(null)} />
      {/* V8.93: 엑셀→EDI 업로드용 숨은 파일 선택 */}
      <input ref={ediFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onExcelpicked} />
      {rows.length === 0 ? (
        <div className="text-center text-slate-500 text-xs py-6">현재 작업 중인 항차가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenVoyage && onOpenVoyage(r.key)}
                  className="font-bold text-slate-100 text-sm flex-1 text-left hover:text-cyan-300 truncate"
                  title="항차 열기"
                >
                  🚢 {r.vsl}
                </button>
                {confirmKey === r.key ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-amber-300 mr-1">최종 저장?</span>
                    <button
                      onClick={() => doComplete(r)}
                      disabled={busyKey === r.key}
                      className="text-[11px] px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
                    >{busyKey === r.key ? '저장 중…' : '예'}</button>
                    <button
                      onClick={() => setConfirmKey(null)}
                      className="text-[11px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                    >취소</button>
                  </div>
                ) : r.inspectorDone ? (
                  chief ? (
                    <button
                      onClick={() => setConfirmKey(r.key)}
                      className="text-[11px] px-2 py-1 rounded bg-emerald-700/40 hover:bg-emerald-600/60 text-emerald-200 border border-emerald-700/50 font-bold"
                      title="검수사 완료 확인됨 — 수석 최종 저장 (보관소로 이동)"
                    >✓ 수석 완료 저장</button>
                  ) : (
                    <button
                      onClick={() => alert('⚠️ 완료 저장 권한이 없습니다.\n\n항차 완료 저장은 수석검수사만 할 수 있습니다.\n(현재 로그인: ' + (inspector || '미상') + ')\n\n수석검수사에게 완료 저장을 요청하세요.')}
                      className="text-[11px] px-2 py-1 rounded bg-slate-700/40 text-slate-400 border border-slate-600/40 font-bold"
                      title="수석검수사만 완료 저장할 수 있습니다"
                    >🔒 수석 전용</button>
                  )
                ) : (
                  <span
                    className="text-[10px] px-2 py-1 rounded bg-slate-700/40 text-slate-400 border border-slate-600/40"
                    title="검수사가 항차 화면에서 '검수 완료'를 눌러야 수석이 최종 저장할 수 있습니다"
                  >검수 진행 중</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <span className="text-sky-300">양하 <b className="text-sky-200">{r.discharge}</b>{r.discharge > 0 && r.dDone && <b className="text-emerald-400"> ✓{r.dDoneAt ? new Date(r.dDoneAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}</b>}</span>
                <span className="text-emerald-300">선적 <b className="text-emerald-200">{r.loading}</b>{r.loading > 0 && r.lDone && <b className="text-emerald-400"> ✓{r.lDoneAt ? new Date(r.lDoneAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}</b>}</span>
                {r.inspectorDone && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-700/40 font-bold">검수 완료 · 수석 확인 대기</span>
                )}
                {(r.voyD || r.voyL) && (
                  <span className="text-slate-500 text-[10px] ml-auto">
                    {r.voyD && `양하 ${r.voyD}`}{r.voyD && r.voyL && ' · '}{r.voyL && `선적 ${r.voyL}`}
                  </span>
                )}
              </div>
              {/* TallyOne 1.0(L3): 일정 정보 — 작업일자(출처 뱃지)·도선 입출항. 완료 저장 타이밍 판단 근거 */}
              <ScheduleLine planDate={r.planDate} planSrc={r.planSrc}
                pf={(pilotForecast || {})[(r.vsl || '').toUpperCase()]} />
              {/* TallyOne 1.0(L4): V8.93 도구 4종 — 10px 초소형 버튼을 줄 아래 40px 터치 타깃 행으로 재배치(기능 불변) */}
              {r.loading > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1.5">
                  <button onClick={() => exportActualEdi(r)} style={{ minHeight: 40 }}
                    className="px-2 rounded-lg bg-cyan-900/50 hover:bg-cyan-800/60 text-cyan-200 border border-cyan-700/40 text-[11px] font-bold"
                    title="실선적 EDI 내려받기 — 평택 선적분(실체 위치 기준)을 표준 BAPLIE로 생성. 카스피에서 읽을 수 있습니다.">실선적 EDI</button>
                  <button onClick={() => exportActualAsc(r)} style={{ minHeight: 40 }}
                    className="px-2 rounded-lg bg-cyan-900/50 hover:bg-cyan-800/60 text-cyan-200 border border-cyan-700/40 text-[11px] font-bold"
                    title="실선적 ASC 내려받기 — 카스피와 같은 $604 ASC 형식. 선박코드는 저장 전에 고칠 수 있습니다.">실선적 ASC</button>
                  <button onClick={() => exportEditExcel(r)} style={{ minHeight: 40 }}
                    className="px-2 rounded-lg bg-cyan-900/50 hover:bg-cyan-800/60 text-cyan-200 border border-cyan-700/40 text-[11px] font-bold"
                    title="EDI 수정용 엑셀 내려받기 — 컨번호·위치·POD 등을 고친 뒤 [엑셀→EDI]로 올리면 수정본 EDI가 나옵니다. 헤더 줄은 그대로 두세요.">수정 엑셀</button>
                  <button onClick={() => startExcelToEdi(r)} style={{ minHeight: 40 }}
                    className="px-2 rounded-lg bg-indigo-900/50 hover:bg-indigo-800/60 text-indigo-200 border border-indigo-700/40 text-[11px] font-bold"
                    title="수정한 엑셀을 선택하면 수정본 EDI 파일을 만들어 내려줍니다.">엑셀→EDI</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-slate-500 mt-2">평택분 기준 · 수석검수사 최종 확인 후 완료 저장 → 자료 보관소로 이동</div>
    </div>
  );
}

// 한 섹션(discharge/loading)의 평택분 컨테이너 수 — UI용 (firebase _ptkCountOfSection과 동일 기준)
function countPtkSection(section, mode) {
  // V7.40: 평택분 판정 모드별 정확화 (지침 7.1·8.3 — 양하=POD평택, 선적=POL평택).
  if (!section || !section.ediContainers) return 0;
  const set = new Set();
  for (const c of Object.values(section.ediContainers)) {
    const isPtk = mode === 'discharge' ? isPyeongtaekPort(c.pod)
      : mode === 'loading' ? isPyeongtaekPort(c.pol)
      : (isPyeongtaekPort(c.pol) || isPyeongtaekPort(c.pod));
    if (isPtk) set.add(c.cn || JSON.stringify(c));
  }
  return set.size;
}

// ─────────────────────────────────────────────────────────────
// M7.22: 선박별 자료 보관소 (완료 기록) — ships 노드 기준, 최근 완료순.
//   선박별 항차 줄(항차·양하·선적·일자) + 누적(항차 수·양하·선적).
// ─────────────────────────────────────────────────────────────
function ShipArchiveSection({ shipLib }) {
  const [search, setSearch] = useState('');

  const ships = useMemo(() => {
    const out = [];
    for (const [imo, s] of Object.entries(shipLib || {})) {
      const voys = s?.voyages || {};
      const voyRows = Object.entries(voys).map(([vk, v]) => ({
        key: vk,
        // V8.43: 항차 표시는 항차 키(검수사가 만든 항차) 기준 — EDI 헤더의 전항차/오기
        //   voy_d가 그대로 떠서 실제와 다른 번호가 보이던 버그(예: NSDC 2605N에 2611N 표시) 수정.
        // V8.84: 양하·선적 항차 둘 다 표시(사용자 요청 2026-07-08 '같이 마감했는데 항차가 둘다 기록 안 됨').
        //   완료 저장이 기록한 info 기반 voy_d/voy_l(신뢰)이 둘 다 있으면 "양하/선적"으로,
        //   아니면 기존대로 항차 키. EDI 헤더 voy 불신은 V8.43 그대로 유지.
        voy: (() => {
          const kv = vk.split('_').slice(1).join('_');
          const vd = String(v?.voy_d || '').trim().toUpperCase();
          const vl = String(v?.voy_l || '').trim().toUpperCase();
          if (vd && vl && vd !== vl) return `${vd}/${vl}`;
          return kv || vd || vl || v?.voy || vk;
        })(),
        discharge: v?.discharge_ptk || 0,
        loading: v?.loading_ptk || 0,
        at: v?.completed_at || v?.analyzed_at || 0,
        vsl: v?.vsl || '',
        vslFull: v?.vslFull || '',
      })).filter(r => r.discharge > 0 || r.loading > 0);
      if (voyRows.length === 0) continue;   // 완료 항차 없는 배(구조만)는 보관소에 안 보임
      voyRows.sort((a, b) => (b.at || 0) - (a.at || 0));
      const totalD = voyRows.reduce((s, r) => s + r.discharge, 0);
      const totalL = voyRows.reduce((s, r) => s + r.loading, 0);
      const lastAt = voyRows[0]?.at || 0;
      // 선박명 결정 (M7.24c): 사용자 입력 약자(vsl, 예 PCBJ/TNJP) 최우선 — 검수사가
      //   약자만 봐도 선박을 식별함. 약자 없으면 ships.name → vslFull(풀네임) → 키 순.
      const pick = (arr) => arr.find(v => v && String(v).trim()) || '';
      let shipName = pick(voyRows.map(r => r.vsl));        // 약자 우선
      if (!shipName) shipName = s?.name && !/^[0-9]{7}$/.test(s.name) ? s.name : '';
      if (!shipName) shipName = pick(voyRows.map(r => r.vslFull));
      if (!shipName) shipName = s?.name || imo;
      out.push({ imo, name: shipName, voyRows, totalD, totalL, lastAt });
    }
    return out.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));   // 최근 완료순
  }, [shipLib]);

  const q = search.trim().toLowerCase();
  const filtered = !q ? ships : ships.filter(s =>
    String(s.name).toLowerCase().includes(q) || String(s.imo).toLowerCase().includes(q));

  const fmtDate = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900 border border-purple-800/40 rounded-xl p-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Library className="w-4 h-4 text-purple-400" />
        <div className="text-sm font-bold text-slate-100 flex-1">
          선박별 자료 보관소 ({ships.length}척)
        </div>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="선박명 / IMO 검색"
        className="w-full mb-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs placeholder-slate-500"
      />
      {filtered.length === 0 ? (
        <div className="text-center text-slate-500 text-xs py-6">완료 저장된 항차가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.imo} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-slate-100 text-sm flex-1 truncate">⚓ {s.name}</span>
                <span className="text-[10px] text-slate-500">{/^[0-9]{7}$/.test(s.imo) ? `IMO ${s.imo}` : s.imo}</span>
              </div>
              <div className="space-y-0.5">
                {s.voyRows.map((r) => (
                  <div key={r.key} className="flex items-center gap-2 text-xs px-1 py-0.5 border-b border-slate-700/30 last:border-0">
                    {/* V8.84-01: 양하/선적 항차가 truncate로 잘려 선적이 안 보이던 문제 — 두 줄로 쌓아 표시 */}
                    <span className="text-amber-300 font-bold w-16 shrink-0 leading-tight">
                      {String(r.voy).includes('/')
                        ? String(r.voy).split('/').map((p, i) => <span key={i} className="block">{p}</span>)
                        : r.voy}
                    </span>
                    <span className="text-sky-300">양하 <b className="text-sky-200">{r.discharge}</b></span>
                    <span className="text-emerald-300">선적 <b className="text-emerald-200">{r.loading}</b></span>
                    <span className="text-slate-500 text-[10px] ml-auto">{fmtDate(r.at)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-1 pt-1 border-t border-slate-600/40 text-xs">
                <span className="text-slate-400">누적 <b className="text-slate-200">{s.voyRows.length}</b>항차</span>
                <span className="text-sky-400">양하 누적 <b className="text-sky-300">{s.totalD}</b></span>
                <span className="text-emerald-400">선적 누적 <b className="text-emerald-300">{s.totalL}</b></span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-slate-500 mt-2">평택분 기준 · 최근 완료순 · 완료 저장 시 자동 기록</div>
    </div>
  );
}

// TallyOne 1.0(L1): 수집기 상태 배너 — 끊김(주기×2분 초과)이면 붉은 경고, 살아있으면 컴팩트 한 줄,
//   하트비트 자체가 없으면(prop 미전달·수집기 미가동) '자료 없음'을 명시(조용한 실패 금지).
//   '검증 필요 N항차'는 health.js healthSummary 기준 — 누르면 #/health(항차 건강 점검)로 이동.
function CollectorStatusBanner({ hbView, hb, issueCount }) {
  const healthBtn = (
    <button onClick={() => { window.location.hash = '#/health'; }}
      title="항차 건강 점검(#/health)으로 이동"
      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border shrink-0 ${issueCount > 0
        ? 'bg-amber-900/40 border-amber-700/50 text-amber-300 hover:bg-amber-800/50'
        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
      style={{ minHeight: 36 }}>
      {issueCount > 0 ? `⚠ 검증 필요 ${issueCount}항차` : '✓ 항차 검증 이상 없음'}
    </button>
  );
  if (hbView.state === 'down') {
    return (
      <div className="bg-red-950/60 border-2 border-red-600/70 rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-red-200">🔴 수집기 끊김 — 아래 숫자는 갱신 정지 상태</div>
          <div className="text-[11px] text-red-300/80 mt-0.5">
            마지막 갱신 {hbView.ageMin}분 전{hb?.version ? ` · 수집기 v${hb.version}` : ''} · 끊김 기준 주기 {hbView.cycleMin}분×2
          </div>
        </div>
        {healthBtn}
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 flex-wrap rounded-xl border px-3 py-1.5 text-[11px] ${hbView.state === 'ok'
      ? 'bg-slate-900 border-emerald-800/40 text-slate-400' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
      {hbView.state === 'ok'
        ? <span>🟢 수집기 v{hb?.version || '?'} · {hbView.ageMin}분 전 갱신 (주기 {hbView.cycleMin}분)</span>
        : <span>⚪ 수집기 상태 자료 없음 — 하트비트 미수신</span>}
      <span className="flex-1"/>
      {healthBtn}
    </div>
  );
}

// TallyOne 1.0(L3): 진행 상황 줄 일정 표시 — planSrc 출처 뱃지는 HomePage 1026행 _MK와 같은 표기.
//   자리별 출처('입항출처|출항출처')도 같은 규칙으로 풀며, 일정이 전혀 없으면 '자료 없음'을 명시.
function ScheduleLine({ planDate, planSrc, pf }) {
  const MK = { mail: '📧메일', pilot: '⚓도선', portmis: '🚢신고', plan: '📋배정' };
  const pp = String(planSrc || '').split('|');
  const srcIn = MK[pp[0]] || '';
  const srcOut = MK[pp[1] || pp[0]] || '';
  const srcLabel = srcIn && srcOut && srcIn !== srcOut ? `${srcIn}/${srcOut}` : (srcIn || srcOut);
  const fmt = (s) => {
    const ms = parsePortMisDateTime(s);
    if (ms == null) return String(s || '');
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const hasAny = planDate || (pf && (pf.nextArr || pf.nextDep));
  if (!hasAny) return <div className="text-[10px] text-slate-600 mt-0.5">📅 일정 자료 없음 (수집기 미수신)</div>;
  return (
    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
      {planDate && <span>📅 {planDate}{srcLabel ? ` (${srcLabel})` : ''}</span>}
      {pf?.nextArr && <span className="text-sky-300">⚓ 입항 {fmt(pf.nextArr)}</span>}
      {pf?.nextDep && <span className="text-amber-300">⚓ 출항 {fmt(pf.nextDep)}</span>}
    </div>
  );
}

// TallyOne 1.0(L5): 결과 통지 인라인 알림 — alert() 대신 해당 섹션 안에서 보여준다. ✕로 닫음.
function InlineNotice({ notice, onClose }) {
  if (!notice) return null;
  const ok = notice.kind !== 'err';
  return (
    <div className={`flex items-start gap-2 text-[11px] rounded-lg border px-2.5 py-1.5 mb-2 ${ok
      ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-200'
      : 'bg-red-950/40 border-red-700/50 text-red-200'}`}>
      <span className="flex-1 whitespace-pre-line break-all">{notice.text}</span>
      <button onClick={onClose} title="알림 닫기"
        className="shrink-0 px-1.5 font-bold text-slate-400 hover:text-slate-200" style={{ minWidth: 28, minHeight: 24 }}>✕</button>
    </div>
  );
}

function BigStat({ label, value, sub, color }) {
  const map = {
    emerald: 'border-emerald-700/40 bg-emerald-950/30 text-emerald-300',
    red: 'border-red-700/40 bg-red-950/30 text-red-300',
    slate: 'border-slate-700 bg-slate-900 text-slate-300',
  };
  return (
    <div className={`rounded-xl border p-3 ${map[color]}`}>
      <div className="text-[10px] uppercase font-bold opacity-70">{label}</div>
      <div className="text-3xl font-black mono mt-0.5">{value}</div>
      <div className="text-[11px] opacity-60 mono">{sub}</div>
    </div>
  );
}

function InspectorRow({ s }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-2 flex items-center gap-2">
      <div className="relative">
        <div className="w-9 h-9 bg-amber-600 rounded-full flex items-center justify-center text-amber-100 font-black">
          {s.name[0]}
        </div>
        {s.active && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900"/>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-sm text-slate-200 truncate">{s.name}</div>
        <div className="text-[10px] text-slate-500 mono flex items-center gap-2 flex-wrap">
          <span><span className="text-emerald-400 font-bold">{s.today}</span> 오늘</span>
          <span>·</span>
          <span><span className="text-slate-300 font-bold">{s.total}</span> 누적</span>
          {s.lastAt > 0 && (
            <>
              <span>·</span>
              <span><Clock className="w-2.5 h-2.5 inline"/> {timeAgo(s.lastAt)}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 text-[10px] mono">
        {s.dis > 0 && <span className="bg-blue-900/60 text-blue-200 px-1.5 py-0.5 rounded font-black">양 {s.dis}</span>}
        {s.loa > 0 && <span className="bg-amber-900/60 text-amber-200 px-1.5 py-0.5 rounded font-black">선 {s.loa}</span>}
      </div>
    </div>
  );
}

// V7.40: 실시간 작업 보드 카드 — 한 선박의 진행·작업자·최근 보고·경고를 한눈에
// TallyOne 1.0(L2): tw(터미널 실적, ±12h 창 가드 통과분)·departed(터미널 출항 상태) 추가 — 옵셔널
function LiveShipCard({ v, workers, lastReport, alerts, onOpen, tw = null, departed = false }) {
  // V9.57(I4): 100% 클램프
  const pct = v.totalAll > 0 ? Math.min(100, Math.round((v.totalDone / v.totalAll) * 100)) : 0;
  const repIcon = lastReport ? (
    lastReport.type === 'work_status' ? '📤' : lastReport.type === 'hatch' ? '🔓' :
    lastReport.type === 'conbox' ? '📦' : lastReport.type === 'damage' ? '⚠️' :
    lastReport.type === 'seal_error' ? '🚨' :
    lastReport.type === 'external_pause' ? '⛔' : '📋') : null;  // V9.57(I2): 작업중단 아이콘 추가
  return (
    <button onClick={onOpen} className={`w-full text-left bg-slate-800/40 border border-slate-700 rounded-lg p-2.5 hover:bg-slate-800/70 flex flex-col gap-1.5 ${departed ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-slate-200 truncate flex items-center gap-1.5">
            {v.info.vsl}
            {/* TallyOne 1.0(L2): 터미널이 출항 처리한 항차 — 흐린 카드 + 출항 뱃지 */}
            {departed && <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-bold shrink-0">⚓ 출항</span>}
            {workers.length > 0 && <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shrink-0"/>}
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            {(() => {
              const d = v.info.voy_d, l = v.info.voy_l, vv = v.info.voy;
              if (d && l && d !== l) return `${d} / ${l}`;
              return d || l || vv || '';
            })()}
            {v.info.carrier ? ` · ${v.info.carrier}` : ''}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0"/>
      </div>
      <div className="space-y-1.5 text-[10px] mono">
        {v.dis.total > 0 && <MiniBar label="양하" color="blue" stats={v.dis}/>}
        {v.loa.total > 0 && <MiniBar label="선적" color="amber" stats={v.loa}/>}
      </div>
      {/* TallyOne 1.0(L2): 터미널 실적 대조 — 앱 내부 완료수 vs 트레드링스 실적(disDone/disPlan·lodDone/lodPlan).
          미수신도 조용히 비우지 않고 명시(±12h 창 밖 자료는 이 항차 것이 아니라 버려진 상태 포함). */}
      {tw ? (
        <div className="text-[10px] mono text-slate-400 flex items-center gap-1.5 flex-wrap">
          <span className="text-cyan-300 font-bold">🏗 터미널</span>
          {(tw.disPlan > 0 || tw.disDone > 0) && (
            <span>양하 {tw.disDone}/{tw.disPlan} <span className="text-slate-600">(앱 {v.dis.done})</span></span>
          )}
          {(tw.lodPlan > 0 || tw.lodDone > 0) && (
            <span>선적 {tw.lodDone}/{tw.lodPlan} <span className="text-slate-600">(앱 {v.loa.done})</span></span>
          )}
          {typeof tw.pct === 'number' && tw.pct >= 0 && <span className="text-slate-500">{tw.pct}%</span>}
          {tw.delayed && <span className="bg-red-900/60 text-red-200 px-1.5 rounded font-bold">지연</span>}
          {/* TallyOne 1.5: 신선도 — 이 값이 언제 것인지 화면이 말해주지 않아 새로고침하게 되던 문제.
              수집기 사이클이 5분이므로 10분 넘으면 이상 신호. 실측(2026-08-04): 같은 화면에
              9분 전(TNJP·DXQD)과 2일 전(XTPG)이 구분 없이 섞여 있었다. */}
          {(() => {
            const t = Number(tw.updatedAt) || 0;
            if (!t) return <span className="text-slate-600" title="갱신 시각 정보 없음">시각 미상</span>;
            const m = Math.floor((Date.now() - t) / 60000);
            const txt = m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
            const cls = m <= 10 ? 'text-emerald-300' : m <= 60 ? 'text-amber-300' : 'text-rose-300 font-bold';
            return <span className={cls} title={`터미널 자료 갱신 ${new Date(t).toLocaleString('ko-KR')}`}>← {txt}</span>;
          })()}
        </div>
      ) : (
        <div className="text-[10px] text-slate-600">터미널 실적 미수신</div>
      )}
      {/* 작업 중 검수원 */}
      <div className="flex items-center gap-1 flex-wrap min-h-[18px]">
        {workers.length > 0 ? workers.map(w => (
          <span key={w.name} className="inline-flex items-center gap-1 bg-emerald-900/50 border border-emerald-700/50 text-emerald-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"/>
            {w.name}{w.mode === 'discharge' ? ' (양하)' : w.mode === 'loading' ? ' (선적)' : ''}
          </span>
        )) : (
          <span className="text-[10px] text-slate-600">작업 중 검수원 없음</span>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1.5 border-t border-slate-700/50 text-[10px] flex-wrap">
        <span className="text-emerald-300 font-black mono">{v.totalDone}</span>
        <span className="text-slate-500">/{v.totalAll} ({pct}%)</span>
        <div className="flex-1"/>
        {alerts?.damage > 0 && <span className="bg-amber-900/60 text-amber-200 px-1.5 rounded font-bold">⚠️ {alerts.damage}</span>}
        {alerts?.sealError > 0 && <span className="bg-red-900/60 text-red-200 px-1.5 rounded font-bold">🚨 {alerts.sealError}</span>}
        {lastReport && (
          <span className="text-slate-500 mono">{repIcon} {lastReport.equip || ''} {timeAgo(lastReport.ts)}</span>
        )}
      </div>
    </button>
  );
}

function BroadcastComposer({ inspector }) {
  const [text, setText] = useState('');
  const [cur, setCur] = useState(null);
  const [reads, setReads] = useState({});
  useEffect(() => fbSubscribeBroadcast(setCur), []);
  useEffect(() => {
    if (!cur?.id) { setReads({}); return; }
    return fbSubscribeBroadcastReads(cur.id, setReads);
  }, [cur?.id]);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    await fbSetBroadcast(t, inspector || '수석');
    setText('');
  };
  const clear = async () => { await fbClearBroadcast(); };
  const readNames = Object.keys(reads || {});
  return (
    <div className="bg-slate-900 border border-amber-700/40 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <Send className="w-4 h-4 text-amber-400"/>
        <div className="text-sm font-bold text-slate-100">검수원 공지 (흐르는 띠)</div>
        <span className="text-[10px] text-slate-500">로그인된 검수원 모든 화면에 흘러감 · 확인 전까지</span>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
        placeholder="예: 이번 선박 23번 베이에 중요한 FR 실림 — 사진 촬영 바랍니다"
        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-100 resize-none"/>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={send} disabled={!text.trim()}
          className="px-3 py-1.5 rounded text-sm font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white flex items-center gap-1">
          <Send className="w-3.5 h-3.5"/> 보내기
        </button>
        {cur?.text && (
          <button onClick={clear} className="px-3 py-1.5 rounded text-sm font-bold bg-slate-700 hover:bg-slate-600 text-slate-200">공지 내리기</button>
        )}
      </div>
      {cur?.text && (
        <div className="mt-2 bg-amber-950/40 border border-amber-800/40 rounded p-2 text-xs">
          <div className="text-amber-200 font-bold">📢 현재 공지: {cur.text}</div>
          <div className="text-slate-400 mt-1">읽음 {readNames.length}명{readNames.length > 0 ? ` · ${readNames.join(', ')}` : ''}</div>
        </div>
      )}
    </div>
  );
}

function MiniBar({ label, color, stats }) {
  // V9.57(I4): 진행률 100% 클램프 — done이 모수 교집합으로 제한됐어도 표시 안전망 유지
  const pct = stats.total > 0 ? Math.min(100, Math.round((stats.done / stats.total) * 100)) : 0;
  const map = {
    blue: { tag: 'bg-blue-900/60 text-blue-200', bar: 'bg-blue-500' },
    amber: { tag: 'bg-amber-900/60 text-amber-200', bar: 'bg-amber-500' },
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`${map[color].tag} px-1.5 rounded text-[9px] font-black w-9 text-center`}>{label}</span>
      <div className="flex-1 bg-slate-900 rounded-full h-1.5 overflow-hidden">
        <div className={`${map[color].bar} h-full`} style={{ width: `${pct}%` }}/>
      </div>
      <span className="text-slate-400 w-16 text-right">{stats.done}/{stats.total}</span>
      {/* V9.57(I4): 모수 밖 완료(추가컨 등)는 진행률에 안 섞고 따로 알린다 */}
      {stats.extra > 0 && <span className="text-violet-300 text-right" title="리스트(모수) 밖에서 완료 처리된 컨테이너 — 추가컨·리스트 교체 잔재 등">+{stats.extra} 초과</span>}
      {stats.forecastEdi
        ? <span className="text-orange-300 text-right" title="EDI 컨번호가 리스트와 하나도 일치하지 않음 — 예상(프리스토우) EDI. 확정 EDI 대기.">예상EDI</span>
        : stats.missing > 0 && <span className="text-red-400 w-12 text-right">누락 {stats.missing}</span>}
    </div>
  );
}

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.floor(sec/60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec/3600)}시간 전`;
  return `${Math.floor(sec/86400)}일 전`;
}

function computeStats(section, mode) {
  // V7.40: 평택분 판정을 모드별로 정확히 (지침 7.1 — 양하=POD평택, 선적=POL평택).
  //   이전: POL∨POD 평택이면 카운트 → 양하 EDI에서 평택발 타항행 컨까지 평택분으로 잡혀 과대 집계.
  if (!section) return { total: 0, done: 0, ptk: 0, matched: 0, missing: 0 };
  const ediContainers = section.ediContainers || {};
  const records = section.records || {};
  const completed = section.completed || {};
  const ediValues = Object.values(ediContainers);
  const ptkCns = new Set();
  // V9.37-02: 홈 카드(HomePage.computeStats)와 **같은 규칙**. 플랜 가상 EDI는 cn 이 없어(확답 ④)
  //   c.cn 으로 넣으면 undefined 가 Set에서 1개로 합쳐진다(TMPZ 370 → 1). 키를 폴백 식별자로.
  Object.entries(ediContainers).forEach(([key, c]) => {
    if (!c) return;
    const isPtk = mode === 'discharge' ? isPyeongtaekPort(c.pod)
      : mode === 'loading' ? isPyeongtaekPort(c.pol)
      : (isPyeongtaekPort(c.pol) || isPyeongtaekPort(c.pod));
    if (isPtk) ptkCns.add(c.cn || key);
  });
  // TallyUni 0.7 (TallyOne 1.11 이식): 모수에서 **반대 방향 리스트**를 뺀다. 항차번호가 방향까지 같은
  //   배(N_N 타입)는 메일함 폴더가 하나라 양하·선적 리스트가 섞여 들어와, 양하 카드가 두 리스트를
  //   합산해 `평택 778`(= 양하 371 + 선적 407) 로 나왔다(SWSP 2606N, 2026-08-06 실측).
  //   POL/POD 로 확정된 것만 뺀다 — 근거 없는 레코드는 그대로 센다.
  const recordCns = new Set(ownDirCns(records, mode));
  const matched = [...ptkCns].filter(cn => recordCns.has(cn)).length;
  // V9.37-02: 플랜 슬롯(자리)은 누락이 아니다 — 컨번호는 NOLIST 담당.
  const planSlots = [...ptkCns].filter(cn => String(cn).startsWith('__SLOT_')).length;
  const missing = Math.max(0, ptkCns.size - matched - planSlots);
  const total = recordCns.size > 0 ? recordCns.size : ptkCns.size;
  // V9.57(I4): done을 completed 전체 개수로 세면 모수(리스트) 밖 완료(추가컨·리스트 교체 잔재)까지
  //   더해져 진행률이 100%를 넘었다. done은 모수(리스트 있으면 recordCns, 없으면 ptkCns)와의
  //   교집합으로 제한하고, 모수 밖 완료는 extra로 따로 센다(MiniBar "+N 초과" 표기).
  const compKeys = Object.keys(completed);
  const baseSet = recordCns.size > 0 ? recordCns : ptkCns;
  const done = compKeys.filter(cn => baseSet.has(cn)).length;
  const extra = compKeys.length - done;
  // V8.90: 예상 EDI 판정(홈 카드와 동일 규칙) — 리스트가 있는데 매칭 0이면 예상(프리스토우) EDI.
  const virtual = ediValues.some(c => c && (c._virtualFromList || c._virtualFromPlan));
  const forecastEdi = !virtual && ptkCns.size > 0 && recordCns.size > 0 && matched === 0;
  return { total, done, extra, ptk: ptkCns.size, matched, missing, forecastEdi, planSlots };  // V9.57(I4): extra 추가
}

// ── V9.17: 완료 보관소 (archive 노드) — 열람·복원·1년 정리. 수석 전용 조작. ──
function ArchiveRestoreSection({ chief }) {
  const [items, setItems] = useState(null);   // null=아직 안 불러옴
  const [busy, setBusy] = useState(false);
  // TallyOne 1.0(L5): 결과 통지 alert → 섹션 안 인라인 알림(권한·확인창은 유지)
  const [notice, setNotice] = useState(null);
  const load = async () => {
    setBusy(true);
    try { setItems(await fbListArchive()); }
    catch (e) { setNotice({ kind: 'err', text: '보관소 조회 실패: ' + (e?.message || e) }); }
    finally { setBusy(false); }
  };
  const restore = async (key) => {
    if (!chief) { alert('🔒 복원은 수석검수사만 가능합니다.'); return; }
    if (!window.confirm(`"${key}" 항차를 보관소에서 복원합니다.\n홈 목록에 다시 나타나고, 수집기도 다시 자료를 받기 시작합니다. 계속할까요?`)) return;
    setBusy(true);
    try {
      const ok = await fbRestoreVoyageFromArchive(key);
      setNotice(ok ? { kind: 'ok', text: `✅ ${key} 복원 완료 — 홈에서 확인하세요.` }
                   : { kind: 'err', text: '복원 실패 — 보관 기록이 없습니다.' });
      await load();
    } catch (e) { setNotice({ kind: 'err', text: '복원 실패: ' + (e?.message || e) }); }
    finally { setBusy(false); }
  };
  const cleanup = async () => {
    if (!chief) { alert('🔒 정리는 수석검수사만 가능합니다.'); return; }
    if (!window.confirm('1년(365일) 지난 보관 항차를 영구 삭제합니다.\n복구할 수 없습니다. 계속할까요?')) return;
    setBusy(true);
    try { const n = await fbCleanupArchive(365); setNotice({ kind: 'ok', text: `🧹 ${n}건 정리 완료` }); await load(); }
    catch (e) { setNotice({ kind: 'err', text: '정리 실패: ' + (e?.message || e) }); }
    finally { setBusy(false); }
  };
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-slate-200 text-sm">🗄 완료 보관소 (복원)</h2>
        <div className="flex gap-2">
          {items && items.length > 0 && (
            <button onClick={cleanup} disabled={busy}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] font-bold border border-slate-700">
              🧹 1년 지난 것 정리
            </button>
          )}
          <button onClick={load} disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-[12px] font-bold" style={{ minHeight: 36 }}>
            {busy ? '불러오는 중…' : items ? '새로고침' : '목록 불러오기'}
          </button>
        </div>
      </div>
      <div className="text-[11px] text-slate-500 mb-2">
        수석 [완료 저장]으로 화면에서 내려간 항차의 원본. 실수로 지웠거나 재작업이 잡히면 여기서 [복원].
      </div>
      {/* TallyOne 1.0(L5): 조회·복원·정리 결과 인라인 통지 */}
      <InlineNotice notice={notice} onClose={() => setNotice(null)} />
      {items === null ? (
        <div className="text-[12px] text-slate-600">버튼을 눌러 목록을 확인하세요 (필요할 때만 읽음).</div>
      ) : items.length === 0 ? (
        <div className="text-[12px] text-slate-600">보관된 항차가 없습니다.</div>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {items.map(it => (
            <div key={it.voyageKey} className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-slate-200 mono truncate">{it.voyageKey}</div>
                <div className="text-[11px] text-slate-500">
                  {it.archivedAt ? new Date(it.archivedAt).toLocaleDateString('ko-KR') : '?'} 저장
                  {it.discharge_ptk ? ` · 양하 ${it.discharge_ptk}` : ''}{it.loading_ptk ? ` · 선적 ${it.loading_ptk}` : ''}
                </div>
              </div>
              <button onClick={() => restore(it.voyageKey)} disabled={busy}
                className="px-3 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-[12px] font-bold shrink-0" style={{ minHeight: 40 }}>
                복원
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── V9.19-01: 마감 텔리 엑셀 생성 (수석 전용) ─────────────────────────
//   실물 DEP.TALLY 워크북을 배별 템플릿(실물 파일 서식 그대로)에 숫자만 채워 생성.
function TallyExportSection({ voyages, chief, pfMap, twMap, archiveList, onArchiveChanged, boxRoot, onPickBox, resolveBox }) {
  const [busyKey, setBusyKey] = useState('');
  const [msg, setMsg] = useState('');

  // 목록 = ① 보관소(수석 완료 저장됨) — 생성 가능  + ② 진행 중인 항차 — 잠김
  //   정렬 기준은 **작업 시각**이다. 등록 시각(createdAt)으로 세우면 오늘 막 예정 등록된
  //   미래 항차가 실제 작업한 항차보다 위로 올라온다(2026-08-04 TNJP 26356/26355 사고).
  const rows = React.useMemo(() => {
    const now = Date.now();
    const out = [];
    const archKeys = new Set();
    for (const a of (archiveList || [])) {
      if (!a || (a.archivedAt || 0) < TALLY_LIST_SINCE) continue;
      archKeys.add(a.voyageKey);
      out.push({ key: a.voyageKey, vsl: a.vsl, voy: [a.voy_d, a.voy_l].filter(Boolean).join(' & '),
                 state: 'ready', at: a.archivedAt || 0, madeAt: a.tallyMadeAt || 0 });
    }
    for (const [key, v] of Object.entries(voyages || {})) {
      if (archKeys.has(key)) continue;           // 복원된 항차가 양쪽에 있으면 보관소 쪽을 쓴다
      const st = tallyTargetState(v, pfMap, twMap, now);
      if (!st) continue;                          // 입항 전 — 목록에 올리지 않는다
      const i = v.info || {};
      out.push({ key, vsl: i.vsl || key.split('_')[0] || '', voy: [i.voy_d, i.voy_l].filter(Boolean).join(' & '),
                 state: st, at: scheduleOf(i, pfMap).etaMs || 0, madeAt: 0 });
    }
    const rank = { ready: 0, done: 1, working: 2 };
    return out.sort((a, b) => (rank[a.state] - rank[b.state]) || (b.at - a.at));
  }, [voyages, pfMap, twMap, archiveList]);

  const pickBox = async () => {
    try { await onPickBox(); setMsg('📁 TALLYBOX 폴더 연결됨 — 이제 만든 서류가 바로 그 안에 저장됩니다.'); }
    catch (e) { if (e?.name !== 'AbortError') setMsg(`폴더 지정 실패: ${e?.message || e}`); }
  };

  // TallyOne 1.8-15: 카톡 기록 보강 대상 항차. 완료 저장된 항차라 **보관소**에 넣어야
  //   마감 텔리를 다시 만들 때 반영된다.
  const [kakaoKey, setKakaoKey] = useState(null);
  const [kakaoVoyage, setKakaoVoyage] = useState(null);
  React.useEffect(() => {
    if (!kakaoKey) { setKakaoVoyage(null); return; }
    let alive = true;
    import('../firebase.js').then(({ fbGetArchiveVoyage }) => fbGetArchiveVoyage(kakaoKey))
      .then((v) => { if (alive) setKakaoVoyage(v || {}); })
      .catch((e) => { console.warn('[카톡 보강] 항차 조회 실패', e); if (alive) setKakaoVoyage({}); });
    return () => { alive = false; };
  }, [kakaoKey]);

  const gen = async (row) => {
    if (!chief) { alert('🔒 마감 텔리는 수석검수사만 생성할 수 있습니다.'); return; }
    if (row.state !== 'ready') return;            // 잠김 — 완료 저장 전에는 만들지 않는다
    setBusyKey(row.key); setMsg('');
    try {
      const { fbGetArchiveVoyage, fbMarkTallyMade } = await import('../firebase.js');
      const v = await fbGetArchiveVoyage(row.key);
      if (!v) throw new Error('보관소에서 항차를 찾지 못했습니다');
      const D = computeTallyData(v);
      const { generateTallyExcel } = await import('../tallyExcel.js');
      const root = await resolveBox();   // 권한이 식어 있으면 이 클릭 안에서 조용히 되살린다
      const r = await generateTallyExcel(D, { download: !root });
      let where = `${r.fname} 다운로드`;
      if (root) {
        const info = v.info || {};
        const folder = folderName(info.voy_d, info.voy_l);
        const name = fileNameFor('tally', info.vsl || row.vsl, info.voy_d, info.voy_l, '.xlsx');
        const p = await writeTallyboxFile(root, info.vsl || row.vsl, folder, name,
          new Blob([r.buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        where = `TALLYBOX\\${p}`;
      }
      await fbMarkTallyMade(row.key);
      if (onArchiveChanged) onArchiveChanged();
      setMsg(`✅ ${where}${r.note ? ` · ${r.note}` : ''} — 발송 전 Final Work 총계 확인.`);
    } catch (e) {
      setMsg(`생성 실패(${row.vsl} ${row.voy}): ${e?.message || e}`);
    } finally {
      setBusyKey('');
    }
  };
  return (
    <section className="bg-slate-900 border border-emerald-800/60 rounded-xl p-4">
      <h2 className="font-bold text-emerald-200 text-sm mb-1">📑 마감 텔리 (DEP.TALLY REPORT) {!chief && <span className="text-[10px] text-slate-500">— 🔒 수석 전용</span>}</h2>
      <div className="text-[11px] text-slate-500 mb-2">실물 양식 그대로 엑셀 생성 · 선사/포트 순서 선박별 고정 · 발송 전 숫자 확인 필수</div>
      <div className="text-[11px] text-amber-300/80 mb-2">🔒 「✓ 수석 완료 저장」을 누른 항차만 생성할 수 있습니다 — 작업 중인 항차는 잠겨 있습니다.</div>
      {/* ⚠ 모달은 이 섹션 트리 안에 둔다 — 1.8 에서 DataTab 안에 넣어 상태만 켜지고 안 뜬 적이 있다. */}
      {kakaoKey && kakaoVoyage && (
        <KakaoLogImportModal voyage={kakaoVoyage} voyageKey={kakaoKey} base={`archive/${kakaoKey}`}
          onClose={() => setKakaoKey(null)}
          onDone={() => { if (onArchiveChanged) onArchiveChanged(); }}/>
      )}
      {/* TallyOne 1.7: 폴더 직결 — 처음 한 번만 고르면 그 뒤로는 안 묻는다(IndexedDB 보관) */}
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        {boxRoot ? (
          <span className="text-[11px] text-emerald-300">📁 TALLYBOX 연결됨 — 만든 서류가 <b>{'{선박}\\{항차}'}</b> 폴더에 바로 저장됩니다 (다운로드 거치지 않음)</span>
        ) : isTallyboxSupported() ? (
          <>
            <button onClick={pickBox} className="px-3 py-2 rounded-lg text-[12px] font-bold bg-sky-800 hover:bg-sky-700 text-sky-100" style={{ minHeight: 40 }}>
              📁 TALLYBOX 폴더 지정 (처음 한 번만)
            </button>
            <span className="text-[11px] text-slate-500">지정하면 저장창 없이 바로 들어갑니다. 안 하면 종전대로 다운로드됩니다.</span>
          </>
        ) : (
          <span className="text-[11px] text-slate-500">이 브라우저는 폴더 직결을 지원하지 않아 다운로드로 저장됩니다 (크롬·엣지 데스크톱에서 지원).</span>
        )}
      </div>
      <div className="space-y-1">
        {rows.map((r) => {
          const ready = r.state === 'ready';
          return (
            <div key={r.key} className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              ready ? 'bg-emerald-900/20 border-emerald-800/50' : 'bg-slate-800/40 border-slate-800'}`}>
              <div className="flex-1 min-w-0">
                <span className={`text-[13px] font-bold ${ready ? 'text-emerald-100' : 'text-slate-500'}`}>{r.vsl}</span>
                <span className={`text-[11px] ml-2 ${ready ? 'text-emerald-300/70' : 'text-slate-600'}`}>{r.voy}</span>
                <div className="text-[10px] mt-0.5">
                  {ready
                    ? (r.madeAt
                        ? <span className="text-emerald-400">✓ 생성함 · {new Date(r.madeAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} — 다시 뽑을 수 있습니다</span>
                        : <span className="text-emerald-300 font-bold">● 완료 저장됨 — 지금 만드세요</span>)
                    : r.state === 'done'
                      ? <span className="text-amber-400/80">검수 완료 · 수석 완료 저장을 누르면 열립니다</span>
                      : <span className="text-slate-600">작업 중</span>}
                </div>
              </div>
              {/* TallyOne 1.8-15: 카톡방 기록으로 타임시트를 메운다 — 손으로 친 해치 보고가 앱에 없을 때 */}
              {ready && (
                <button onClick={() => setKakaoKey(r.key)}
                  title="카톡 작업방 기록을 붙여넣어 빠진 해치·작업 기록을 채웁니다"
                  className="shrink-0 px-2.5 py-2 rounded-lg text-[12px] font-bold bg-amber-800/70 hover:bg-amber-700 text-amber-100"
                  style={{ minHeight: 40 }}>📋 카톡</button>
              )}
              <button onClick={() => gen(r)} disabled={!ready || busyKey === r.key}
                title={ready ? '마감 텔리 엑셀 생성' : '수석 완료 저장 전에는 생성할 수 없습니다'}
                className={`shrink-0 px-3 py-2 rounded-lg text-[12px] font-bold ${
                  ready && chief ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                style={{ minHeight: 40 }}>
                {busyKey === r.key ? '생성 중…' : ready ? '엑셀 생성' : '🔒 잠김'}
              </button>
            </div>
          );
        })}
        {rows.length === 0 && <div className="text-[12px] text-slate-600">작업 중이거나 완료 저장된 항차가 없습니다. (입항 전 항차는 표시하지 않습니다)</div>}
      </div>
      {msg && <div className="mt-2 text-[11px] text-slate-300 whitespace-pre-wrap">{msg}</div>}
    </section>
  );
}

// ── V9.19-02: 접이식 항목 래퍼 — 대시보드 항목을 버튼으로 열고 닫는다 ─────────
//   상단 바로가기(jumpSec)가 열림 상태를 켜고 스크롤한다. 헤더 44px 터치 타깃.
function Fold({ id, title, open, onToggle, children }) {
  return (
    <div id={'sec-' + id} className="scroll-mt-16">
      <button onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 rounded-xl border text-left ${
          open ? 'bg-slate-800/80 border-slate-600' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}
        style={{ minHeight: 44 }}>
        <span className="text-[13px] font-bold text-slate-200 truncate">{title}</span>
        <span className="text-slate-500 text-xs shrink-0 ml-2">{open ? '▲ 접기' : '▼ 열기'}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ── TallyOne 1.3: 활동 로그 뷰어 — 소유자 전용 ─────────────────────────────
//   "검수원들이 로그인만 하고 뭘 보는지"를 시간순으로 보여준다(사용자 확정 2026-08-03).
//   완료 건수는 archive까지 합산하면 무거워 현재 voyages의 completed만 센다(캡션에 명시).

// 타임라인 한 줄 문구 — 순수 함수(노드 시뮬 검증 겸 단일 소스)
const _ACT_ROUTE_KO = { home: '홈', chief: '수석 대시보드', search: '통합 검색', health: '항차 건강', food: '맛집', aux: '보조기능' };
const _ACT_TAB_KO = { list: '검수', search: '자연어', bay: '베이', lolo: 'LOLO', stats: '통계', report: '결과', data: '자료' };
export function formatActivityLine(r, voyages) {
  if (!r) return '?';
  if (r.type === 'login') return '로그인';
  if (r.type === 'logout') return r.via === 'idle' ? '자동 로그아웃' : '로그아웃';
  if (r.type === 'view') {
    if (r.route === 'voyage') {
      const info = voyages?.[r.voyageKey]?.info;
      const vsl = info?.vsl || String(r.voyageKey || '').split('_')[0] || '';
      const voy = (r.mode === 'loading' ? info?.voy_l : info?.voy_d) || info?.voy || '';
      const modeKo = r.mode === 'loading' ? '선적' : r.mode === 'discharge' ? '양하' : '';
      const head = [vsl, voy, modeKo].filter(Boolean).join(' ');
      const tabKo = _ACT_TAB_KO[r.tab] ? `${_ACT_TAB_KO[r.tab]}탭 ` : '';
      return `${head || '항차'} · ${tabKo}열람`;
    }
    return `${_ACT_ROUTE_KO[r.route] || r.route || '?'} 열람`;
  }
  if (r.type === 'lookup') return `조회 '${r.q || ''}'`;
  if (r.type === 'nls') return `질문 '${r.q || ''}'`;
  return r.type || '?';
}

const _actHHMM = (at) => {
  const d = new Date(at || 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const _actMD = (at) => {
  const d = new Date(at || 0);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
// 타입별 색 — 열람은 무채색, 조회·질문은 눈에 띄게(뭘 찾으러 왔는지가 핵심 데이터)
const _ACT_COLOR = { login: 'text-emerald-300', logout: 'text-amber-300/80', view: 'text-slate-300', lookup: 'text-cyan-300', nls: 'text-purple-300' };

function ActivityLogSection({ voyages }) {
  const [period, setPeriod] = useState('today');   // today | yesterday | 7d
  const [who, setWho] = useState('');              // '' = 전체
  const [rows, setRows] = useState(null);          // null = 로딩 전·중
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(300);

  // 섹션을 펼칠 때(마운트) 1회 — 30일 지난 버킷 정리. 실패 무해(fb 함수가 warn 1줄).
  useEffect(() => { fbCleanupActivityLog(30); }, []);

  // 기간 변경 시 조회 — 오늘 1일 / 어제 2일 / 7일 버킷 병합
  useEffect(() => {
    let alive = true;
    setRows(null); setError(''); setLimit(300);
    const days = period === 'today' ? 1 : period === 'yesterday' ? 2 : 7;
    fbGetActivityDays(days)
      .then(list => { if (alive) setRows(list); })
      .catch(e => { if (alive) { setRows([]); setError(String((e && e.message) || e)); } });
    return () => { alive = false; };
  }, [period]);

  // 기간 경계(로컬 자정 기준) — 버킷은 일 단위지만 '어제'는 어제 하루만 잘라 보여준다
  const range = useMemo(() => {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const t0 = d0.getTime();
    if (period === 'today') return { from: t0, to: Infinity };
    if (period === 'yesterday') return { from: t0 - 86400000, to: t0 };
    return { from: t0 - 6 * 86400000, to: Infinity };
  }, [period]);

  const periodRows = useMemo(
    () => (rows || []).filter(r => (r.at || 0) >= range.from && (r.at || 0) < range.to),
    [rows, range]);
  const names = useMemo(() => [...new Set(periodRows.map(r => r.who).filter(Boolean))], [periodRows]);
  const view = useMemo(() => (who ? periodRows.filter(r => r.who === who) : periodRows), [periodRows, who]);

  // 검수원별 요약 — 로그인·열람·조회(lookup+nls)·완료(현재 voyages의 completed by 합산)
  const summary = useMemo(() => {
    const m = {};
    const ensure = (n) => (m[n] = m[n] || { login: 0, view: 0, lookup: 0, done: 0 });
    periodRows.forEach(r => {
      const s = ensure(r.who || '?');
      if (r.type === 'login') s.login++;
      else if (r.type === 'view') s.view++;
      else if (r.type === 'lookup' || r.type === 'nls') s.lookup++;
    });
    Object.values(voyages || {}).forEach(v => {
      ['discharge', 'loading'].forEach(md => {
        Object.values((v && v[md] && v[md].completed) || {}).forEach(c => {
          if (c && c.by && (c.at || 0) >= range.from && (c.at || 0) < range.to) ensure(c.by).done++;
        });
      });
    });
    return Object.entries(m).sort((a, b) => (b[1].view + b[1].lookup) - (a[1].view + a[1].lookup));
  }, [periodRows, voyages, range]);

  const shown = view.slice(0, limit);
  return (
    <div className="bg-slate-900 border border-fuchsia-800/40 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-bold text-slate-100">🕵️ 활동 로그</div>
        <span className="text-[10px] text-fuchsia-300/70">소유자 전용 — 열람 자체를 기록</span>
      </div>
      <div className="text-[10px] text-slate-500 mb-2">
        완료 건수는 현재 항차 기준(voyages의 completed만 합산 — 보관소로 넘어간 실적 제외)
      </div>

      {/* 기간 선택 + 검수원 필터 칩 */}
      <div className="flex gap-1 mb-2">
        {[['today', '오늘'], ['yesterday', '어제'], ['7d', '7일']].map(([k, t]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`px-2.5 py-1 rounded text-[11px] font-bold ${
              period === k ? 'bg-fuchsia-700 text-fuchsia-100' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-1 flex-wrap mb-2">
        <button onClick={() => setWho('')}
          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
            who === '' ? 'bg-amber-700 text-amber-100' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
          전체
        </button>
        {names.map(n => (
          <button key={n} onClick={() => setWho(n)}
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              who === n ? 'bg-amber-700 text-amber-100' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {n}
          </button>
        ))}
      </div>

      {/* 검수원별 요약 줄 */}
      {summary.length > 0 && (
        <div className="space-y-1 mb-2">
          {summary.map(([n, s]) => (
            <div key={n} className="text-[11px] text-slate-300 bg-slate-950/60 border border-slate-800 rounded px-2 py-1">
              <b className="text-slate-100">{n}</b>
              <span className="text-slate-500"> — </span>
              로그인 {s.login}회 · 열람 {s.view}건 · 조회 {s.lookup}건 · <span className={s.done > 0 ? 'text-emerald-300' : 'text-slate-500'}>완료 {s.done}건</span>
            </div>
          ))}
        </div>
      )}

      {/* 타임라인 — 최신순, 300건 + 더보기 */}
      {rows === null ? (
        <div className="text-xs text-slate-500 text-center py-4">불러오는 중…</div>
      ) : error ? (
        <div className="text-xs text-red-300 text-center py-3">활동 로그 조회 실패 — {error}</div>
      ) : shown.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-4">이 기간의 활동 기록이 없습니다</div>
      ) : (
        <div className="bg-slate-950 rounded border border-slate-800 divide-y divide-slate-800/60 max-h-[50vh] overflow-y-auto">
          {shown.map((r, i) => {
            const prev = shown[i - 1];
            const dayBreak = !prev || _actMD(prev.at) !== _actMD(r.at);
            return (
              <React.Fragment key={r.day + '_' + r.id}>
                {dayBreak && period !== 'today' && (
                  <div className="px-2 py-0.5 text-[10px] font-bold text-slate-500 bg-slate-900/80">{_actMD(r.at)}</div>
                )}
                <div className="px-2 py-1 flex items-baseline gap-2 text-[11px]">
                  <span className="mono text-slate-500 shrink-0">{_actHHMM(r.at)}</span>
                  <span className="font-bold text-slate-200 shrink-0">{r.who}</span>
                  <span className={`min-w-0 break-all ${_ACT_COLOR[r.type] || 'text-slate-300'}`}>{formatActivityLine(r, voyages)}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
      {view.length > limit && (
        <button onClick={() => setLimit(l => l + 300)}
          className="mt-2 w-full py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300">
          더보기 ({view.length - limit}건 남음)
        </button>
      )}
    </div>
  );
}
