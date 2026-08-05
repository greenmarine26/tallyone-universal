import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowDown, ArrowUp, Upload, Search as SearchIcon, ListChecks, MapPin,
  AlertCircle, Plus, FileSpreadsheet, FileText, X, RotateCcw, Download, Camera,
  BarChart3, FileCheck
} from 'lucide-react';
import {
  parseBAPLIE, parseAscFile, parseListExcel, parseXrayList, loadSheetJS,
  isoToLabel, isoCategory, formatWt, fmtPos
, formatBerth, isValidBerth, getShipStatus, parsePortMisDateTime, _storage, computeShiftingMapCached, ediMapFromRaw , tagForecastMarks, bayParityError, slotAdjacencyError, podZoneMismatch } from '../utils.js';
import {
  fbSaveEdiContainers, fbSaveListRecords, fbSaveXrayList,
  fbSaveEdiRaw, fbGetEdiRaw,
  fbCompleteContainer, fbCancelComplete, fbToggleXray,
  fbUpdateRecordSeal, fbUpdateVoyageInfo, fbSaveSectionData,
  fbSaveShipStructure, fbGetShipStructure, fbAddShipVoyage, fbAddShipStats,
  fbSetActualPosition, fbClearActualPosition,
  fbBatchMoveToStorage, fbBatchClearActual
  , fbSubscribeWorkReports, fbSetStowagePlan , fbRequestProcessNow, fbSubscribeProcessDone} from '../firebase.js';
import { extractShipInfo, analyzeShipStructure, compareStructures, augmentStructureWithBayDict, isShipInBayDict, getShipBayDictData } from '../shipStructure.js';
// M4.4: CASP .def 런타임 파서 + 사용자 베이사전
import { analyzeDefFile, isCaspDefFile, analysisToBayDictEntry } from '../defParser.js';
import { addToUserBayDict } from '../data/userBayDict.js';
import ContainerList from '../components/ContainerList.jsx';
import ValidationBox from '../components/ValidationBox.jsx';
import SearchPanel from '../components/SearchPanel.jsx';
import BayPlan from '../components/BayPlan.jsx';
import StatsTab from '../components/StatsTab.jsx';
import BayDictVerifyWidget from '../components/BayDictVerifyWidget.jsx';
import ReportTab from '../components/ReportTab.jsx';
import ContainerDetailModal from '../components/ContainerDetailModal.jsx';
import WorkReportModal from '../components/WorkReportModal.jsx';
import { getEquipNumber, isPyeongtaekPort, resolveShipKey } from '../utils.js';
import DiagnosticsPanel from '../components/DiagnosticsPanel.jsx';
import ShipIntroCard from '../components/ShipIntroCard.jsx';   // V9.18: 선박 소개·이름 유래
import ConflictReviewModal from '../components/ConflictReviewModal.jsx';
import ChoiceModal, { useChoice } from '../components/ChoiceModal.jsx';
import ShipPolicyModal from '../components/ShipPolicyModal.jsx';
import DisplacedSidebar from '../components/DisplacedSidebar.jsx';
import StorageBox from '../components/StorageBox.jsx';
import VoyageSummaryCard from '../components/VoyageSummaryCard.jsx';
import WorkClosingChecklist from '../components/WorkClosingChecklist.jsx';
import StowageReviewModal from '../components/StowageReviewModal.jsx'; // M6.14
import BulkStowageModal from '../components/BulkStowageModal.jsx'; // M6.42
import BulkAscModal from '../components/BulkAscModal.jsx'; // M6.47
import ShipMatrixBuilderModal from '../components/ShipMatrixBuilderModal.jsx'; // M6.93.1
import BayDictLibraryWidget from '../components/BayDictLibraryWidget.jsx'; // M6.43
import BayDictDiagnosticsWidget from '../components/BayDictDiagnosticsWidget.jsx'; // M6.50
import VoyFixWidget from '../components/VoyFixWidget.jsx'; // M6.46
import { runDiagnostics } from '../diagnostics.js';
import { logView, logQuerySettled } from '../activityLog.js';   // TallyOne 1.3: 활동 로그(열람·조회 기록)
import { matchShipPolicy, applyPolicyToContainer, fbSubscribeShipPolicies, isLoloShipByPolicy } from '../shipPolicies.js';
import { isDeckPlanWorkbook, parseDeckPlanWorkbook } from '../rzorPlan.js';
import DeckPlanView from '../components/DeckPlanView.jsx';
import MailboxFilePicker from '../components/MailboxFilePicker.jsx';   // V9.46: 메일함 폴더 직결
import { db } from '../firebase.js';
import { exportSectionToCSV } from '../components/CSVExport.jsx';
import PrintHubModal from '../components/PrintHubModal.jsx';
import TestLabModal from '../components/TestLabModal.jsx';   // V9.25: 검증 모드 — 성일님 전용
import ReeferMemoModal from '../components/ReeferMemoModal.jsx';   // TallyOne 1.8: 리퍼 온도 확인

export default function VoyagePage({ voyageKey, voyage, inspector, inspectors, portMisData = {}, pilotForecast = {}, onGoHome, onModeChange, initModeOverride = null }) {
  // 양하/선적 모드 — 둘 다 있으면 토글, 하나만 있으면 자동
  const hasDis = !!voyage?.discharge;
  const hasLoa = !!voyage?.loading;
  // V8.81: 홈에서 양하/선적 막대로 연 경우 그 모드 우선 (route.mode 전달).
  // V8.82-01: 양하·선적이 둘 다 있으면 양하 우선 — 수집기가 선적 항차를 먼저 등록해 info.mode='loading'이
  //   박혀 있어도, 작업 순서(양하→선적)대로 양하부터 연다. 양하가 완료 표시된 항차만 선적으로 바로.
  const dischargeMarkedDone = !!(voyage?.info?.inspectorDone || voyage?.info?.dischargeDone);
  const initMode = initModeOverride
    || (hasDis && hasLoa
      ? (dischargeMarkedDone ? 'loading' : 'discharge')
      : (voyage?.info?.mode || (hasDis ? 'discharge' : 'loading')));
  const [mode, setMode] = useState(initMode);
  const [tab, setTab] = useState('list');
  const [detailC, setDetailC] = useState(null); // 컨테이너 상세 모달
  const [procState, setProcState] = useState('');  // V9.37(판6): ⚡ 지금 처리 상태 ''|run|ok|fail|timeout
  const [procMsg, setProcMsg] = useState('');
  const [showWorkReport, setShowWorkReport] = useState(false);  // M3.5.6: 작업 보고 모달
  const [shipLib, setShipLib] = useState(null); // M3.0: 선박 라이브러리 (AI 컨텍스트용)
  // M3.5.4: 자동 진단 state (메인 컴포넌트에 두어야 useMemo에서 접근 가능)
  // M5.20: 기본값 false — 자동 진단 음성이 사용자 완료 음성을 cancel하지 않게.
  //   사용자가 필요 시 DiagnosticsPanel의 스피커 아이콘으로 켤 수 있음.
  //   배경: M5.19 listener fix 후 voyage 갱신 → DiagnosticsPanel useEffect 트리거 →
  //         600ms 후 진단 음성 호출 → speak()가 speaking=true 시 cancel() →
  //         사용자가 방금 시작한 "3050 완료" 음성이 끊김
  const [diagAutoSpeak, setDiagAutoSpeak] = useState(false);
  const [diagDismissed, setDiagDismissed] = useState(false);
  // M3.5.5: 선박 엠티 실 정책
  const [extraPolicies, setExtraPolicies] = useState({});
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyAsked, setPolicyAsked] = useState(false);
  // M4.9f 5단계 단순: 이동 진행 중 상태 (선적 모드 전용)
  //   { cn, fromBay, fromRow, fromTier } 또는 null
  //   pendingMove 설정 시 → 베이그리드 빈 셀 클릭 → 그 자리로 fbSetActualPosition
  const [pendingMove, setPendingMove] = useState(null);
  // M5.1 G: 작업 마감 체크리스트 모달
  const [closingOpen, setClosingOpen] = useState(false);
  // M5.1: 리스트 탭 필터 외부 제어 (마감 체크리스트 점프용)
  const [listFilter, setListFilter] = useState('all');

  // 선박 정책 Firebase 구독
  useEffect(() => {
    const unsub = fbSubscribeShipPolicies(db, (data) => setExtraPolicies(data || {}));
    return () => { try { unsub && unsub(); } catch (e) { console.warn('[선박정책] 구독 해제 실패', e); } };  // V9.57: 조용한 실패 금지
  }, []);

  useEffect(() => { onModeChange?.(mode); }, [mode]);

  // TallyOne 1.3: 열람 기록 — 항차 진입·탭 전환·모드 전환마다 1건.
  //   같은 대상(voyageKey+mode+tab) 30초 안 중복은 activityLog가 생략한다.
  useEffect(() => {
    logView({ route: 'voyage', voyageKey, mode, tab });
  }, [voyageKey, mode, tab]);

  // M3.0: 항차 IMO로 선박 라이브러리 로드 (AI에게 이전 항차 패턴 컨텍스트 제공)
  useEffect(() => {
    const imo = voyage?.info?.imo;
    if (!imo) { setShipLib(null); return; }
    let cancelled = false;
    fbGetShipStructure(imo).then(data => {
      if (!cancelled) setShipLib(data);
    }).catch(() => { if (!cancelled) setShipLib(null); });
    return () => { cancelled = true; };
  }, [voyage?.info?.imo]);

  // M6.39: 항차 진입 시 voy_d/voy_l 자동 복구 — 사용자 액션 0
  //   ediContainers의 첫 컨테이너에서 c.voy 추출 → voy_d/voy_l 자동 백필
  //   목적: 이전에 잘못 저장된 voy_d/voy_l을 EDI 재업로드 없이 자동 정정
  //   조건: c.voy가 있는 경우 (M6.39 이후 업로드된 EDI는 c.voy 메타 포함)
  useEffect(() => {
    if (!voyage?.info || !voyageKey) return;
    const info = voyage.info;
    const patch = {};

    // M6.46: 자동 복구 정책 변경
    //   - EDI의 c.voy로 voy_d/voy_l 덮어쓰기 ❌ (송신측 voy일 수도 있음 — 인천 등에서 양하 EDI 줄 때 자기네 선적 voy 포함)
    //   - 사용자가 항차 생성 시 입력한 voy (mode 일치) 신뢰
    //   - voy_d/voy_l 비어있는 케이스만 자동 채우기 시도
    //
    //   양하 EDI 있고 voy_d 비어있음:
    //     - mode='discharge'이면 voyage.info.voy = 양하 voy → voy_d로 백필
    //     - mode!='discharge'이면 voyage.info.voy = 다른 mode voy → 자동 백필 안 함 (사용자 입력 필요)
    const dischConts = Object.values(voyage?.discharge?.ediContainers || {});
    if (dischConts.length > 0 && !info.voy_d) {
      if (info.mode === 'discharge' && info.voy) {
        patch.voy_d = info.voy;
      }
      // mode !== 'discharge' 케이스는 자동 백필 안 함 — 자료 탭 정정 UI에서 사용자 입력
    }

    const loadConts = Object.values(voyage?.loading?.ediContainers || {});
    if (loadConts.length > 0 && !info.voy_l) {
      if (info.mode === 'loading' && info.voy) {
        patch.voy_l = info.voy;
      }
    }

    if (Object.keys(patch).length > 0) {
      fbUpdateVoyageInfo(voyageKey, patch).catch(e => console.error('[voy 자동 복구]', e));
    }
  }, [voyageKey, voyage?.discharge?.ediContainers, voyage?.loading?.ediContainers]);

  if (!voyage) {
    return (
      <div className="max-w-3xl mx-auto px-3 py-10 text-center">
        <div className="text-slate-400">항차를 찾을 수 없습니다</div>
        <button onClick={onGoHome} className="mt-4 px-4 py-2 bg-slate-800 rounded text-sm">홈으로</button>
      </div>
    );
  }

  const sec = voyage[mode] || {};
  const ediMap = sec.ediContainers || {};
  const recMap = sec.records || {};
  const xrayMap = sec.xrayList || {};
  const xraySeals = sec.xraySeals || {};
  const compMap = sec.completed || {};
  // V8.98-01: 쉬프팅(재적부) — raw EDI 원문 기반 대조 (ediContainers엔 통과화물 없음, MAMP 실측).
  const shiftingMap = useMemo(
    () => computeShiftingMapCached(voyageKey, voyage),
    [voyage?.discharge?.raw?.edi?.uploadedAt, voyage?.loading?.raw?.edi?.uploadedAt,
     voyage?.discharge?.raw?.edi?.sizeBytes, voyage?.loading?.raw?.edi?.sizeBytes, voyageKey]
  );

  // 평택 대상 (양하=POD, 선적=POL)
  //   V9.29: 양하도 '리스트(records)에 있으면 평택분' — 선적에 이미 있던 원칙을 맞춘다.
  //   근거(MCAP 629N 실측 2026-07-31): 선사 양하리스트·터미널 화면 278대인데 앱은 216대만 셌다.
  //   차이 62대는 POD가 CNTXG인 엠티 — 평택에서 내렸다가 다시 싣는 **환적(TS)** 화물이다
  //   (선사 메일 "please declare 62 x 40'HDRY empty ex L77-629N as TS ... create load plan in KRPYOTM").
  //   POD만 보면 이 62대가 통째로 빠진다. 선사가 양하리스트에 올린 컨은 평택에서 내리는 것이 진실.
  const isPtk = (c) => {
    if (!c) return false;
    if (mode === 'discharge') {
      if (isPyeongtaekPort(c.pod)) return true;
      return !!(c.cn && recMap && recMap[c.cn]);   // 양하리스트 등재분(TS 포함)
    }
    return (!!(c.cn && recMap && recMap[c.cn])) || isPyeongtaekPort(c.pol);
  };

  // M3.89: 베이플랜 전용 - 전체 EDI 컨테이너 (isPtk 필터 X)
  //   원칙: 베이플랜은 선박 적부도 = 모든 화물 표시. 평택 화물 0대 베이도 누락 X
  //   기존 containers는 평택만 (검색/통계/검수용)
  //   베이플랜에만 이 allEdiContainers 전달 → 어떤 EDI 와도 베이 누락 X
  // V8.98-02: 베이플랜/카고플랜 소스 = raw EDI 전문(통과화물 포함). 저장본 키는 저장본 우선. raw 없으면 기존 ediMap.
  const fullEdiMap = useMemo(() => {
    const rawMap = ediMapFromRaw(sec);
    if (!rawMap) return ediMap;
    // V8.98-04: raw(확정 EDI 전문)가 있으면 그것이 단일 진실.
    //   raw에 있는 키 = 저장본 필드 우선 병합(기존 동작). raw에 없는 저장본 키는
    //   실번호 형식(4영문+7숫자)이면 구판/가상(예: MAMP DUME 더미, pol=PTK) 잔재로 보고 표시에서 제외 —
    //   별첨·카고플랜이 평택 선적분으로 잘못 집계하던 원인. 컨번호 없는 자리(__SLOT_ 부킹 등)는 보존.
    const m = { ...rawMap };
    for (const [k, v] of Object.entries(ediMap)) {
      if (rawMap[k]) { m[k] = { ...rawMap[k], ...v }; continue; }
      if (!/^[A-Z]{4}\d{7}$/.test(String(k))) m[k] = v;
    }
    return m;
  }, [sec?.raw?.edi?.uploadedAt, sec?.raw?.edi?.sizeBytes, ediMap]);

  // V8.98-05: 검수 리스트용 쉬프팅 목록 — shiftingMap + 컨 정보(규격/POD) 보강
  const shiftingList = useMemo(() => {
    const keys = Object.keys(shiftingMap || {});
    if (!keys.length) return [];
    return keys.map(cn => {
      const c = fullEdiMap[cn] || {};
      return { cn, from: shiftingMap[cn].from, to: shiftingMap[cn].to, iso: c.iso || '', pod: c.pod || '', fe: c.fe || '' };
    }).sort((a, b) => a.from.localeCompare(b.from));
  }, [shiftingMap, fullEdiMap]);

  // V9.03: 긴급/수화물 컨번호 세트 — forecast.mode가 현재 모드와 일치할 때만 적용
  //   (선적 예보 마커가 양하 리스트에 새지 않게). 상세는 tagForecastMarks 주석.
  const _fc = voyage?.info?.forecast;
  const _fcApply = _fc && (_fc.mode || 'loading') === mode;
  const urgentSet = useMemo(
    () => new Set((_fcApply && Array.isArray(_fc.urgentCns)) ? _fc.urgentCns : []), [_fc, _fcApply]);
  const luggSet = useMemo(
    () => new Set((_fcApply && Array.isArray(_fc.luggageCns)) ? _fc.luggageCns : []), [_fc, _fcApply]);

  const allEdiContainersBase = useMemo(() => {
    const merged = {};
    // V8.87-01: 컨번호 없는 실자리(터미널 PRE 등)가 merged['']로 1개로 붕괴하던 버그 수정.
    //   베이플랜 화면 인쇄(카고플랜 V2)가 이 목록을 쓰는데, 붕괴+_inList 누락으로 별첨이 35(pol 있는 34+팬텀 1)로 잘못 집계됐다.
    //   메인 병합(containers)과 동일하게 __SLOT_ 키로 개별 유지 + 대기 표식.
    let _slotSeq2 = 0;
    Object.values(fullEdiMap).forEach(c => {
      if (c.cn) { merged[c.cn] = { ...c, _src: 'edi' }; return; }
      let k = `__SLOT_${c.bay || ''}_${c.row || ''}_${c.tier || ''}`;
      if (merged[k]) k = `${k}_${_slotSeq2++}`;
      merged[k] = { ...c, cn: k, pendingCn: true, _slot: true, _src: 'edi' };
    });
    // recMap에서 EDI에 없는 컨도 포함 (참고용) + EDI 매칭된 컨에는 records 전체 필드 보강
    Object.values(recMap).forEach(r => {
      if (!merged[r.cn]) {
        merged[r.cn] = { ...r, _src: 'list', _inList: true };   // V8.87-01: 별첨 평택 판정용(리스트=검수 대상)
      } else {
        // M4.9e-fix: 베이그리드용 컨테이너에도 records 핵심 필드 전부 보강
        //   사용자 신고: "검색은 수정 반영되는다 베이는 안 됨"
        //   원인: allEdiContainers가 sl/wt만 보강하고 bay_actual/eseal 등 누락
        // M6.21: ISO/op/pol/pod 보강
        //   증상: 같은 컨이 자연어 검색은 ISO "20DC" / 검수업체 "KMTC" / POL "CNAQG" 정상,
        //         베이 클릭은 ISO "XXXX" / 검수업체 "KMD" / POL "CNTCA" 비정상
        //   원인: EDI(BAPLIE)에 placeholder/약어/부정확 정보가 들어옴.
        //         LIST(IFCSUM/엑셀)에는 정확한 정보 → 보강 시 누락되어 베이 클릭 시 EDI 그대로 표시.
        //   해결: LIST 데이터가 있으면 항상 우선 (검수원이 직접 다루는 정확한 자료).
        //         단 LIST가 비어있으면 EDI 값 보존.
        const safeR = {};
        if (r.iso) safeR.iso = r.iso;
        if (r.op)  safeR.op  = r.op;
        // M6.94.31: EDI에 pol/pod 있으면 리스트가 덮지 못함 (EDI = 단일 진실).
        //   원인: 엠티 선적 엑셀(MCAT EMPTY)은 헤더가 없어 fallback 파서가 목적지(CNDLC 등)를
        //   pol 자리에 넣음 → 리스트 pol=CNDLC가 EDI pol=KRPTK를 덮어 카고플랜에서 285대 누락.
        //   EDI에 pol/pod 없을 때만 리스트로 보강.
        if (r.pol && !merged[r.cn].pol) safeR.pol = r.pol;
        if (r.pod && !merged[r.cn].pod) safeR.pod = r.pod;
        if (r.sl) safeR.sl = r.sl;
        if (r.sl_orig) safeR.sl_orig = r.sl_orig;
        // M8.07: EDI 실번호가 잘린 경우(IFCSUM 20자 컷 등) records의 완전한 실번호 우선.
        //   판정: EDI sl이 records sl의 앞부분이면서 더 짧으면 = 잘린 것.
        //   예) EDI 'LF102261LF102262LF10' ⊂ records 'LF102261LF102262LF102263LF102264'.
        {
          const ediSl = String(merged[r.cn].sl || '').trim();
          const recSl = String(r.sl || '').trim();
          if (recSl && ediSl && recSl.length > ediSl.length && recSl.startsWith(ediSl)) {
            safeR.sl = recSl;
          }
        }
        if (r.wt && !merged[r.cn].wt) safeR.wt = r.wt;
        // M8.07: 온도·품명·F/E·리퍼 보강.
        //   RIZHAO처럼 EDI에 온도/품명이 없는 양식에서 엑셀 리스트 값을 반영.
        //   EDI에 값이 있으면 보존(EDI 우선) — 다른 선박 영향 없음.
        if (r.tmp !== undefined && r.tmp !== '' && (merged[r.cn].tmp === undefined || merged[r.cn].tmp === '')) {
          safeR.tmp = r.tmp;
          if (r.tmp_missing !== undefined) safeR.tmp_missing = r.tmp_missing;
        }
        if (r.desc && !merged[r.cn].desc) safeR.desc = r.desc;
        if (r.fe && !merged[r.cn].fe) safeR.fe = r.fe;
        if (r.rf === true && merged[r.cn].rf !== true) safeR.rf = true;
        if (r.fr === true && merged[r.cn].fr !== true) safeR.fr = true;
        // 엠티실/리씰
        if (r.eseal) safeR.eseal = r.eseal;
        if (r.eseal_wrong) safeR.eseal_wrong = r.eseal_wrong;
        if (r.reseal) safeR.reseal = r.reseal;
        if (r.eseal_at) safeR.eseal_at = r.eseal_at;
        if (r.eseal_by) safeR.eseal_by = r.eseal_by;
        if (r.eseal_history) safeR.eseal_history = r.eseal_history;
        // ISO403 사진
        if (r.iso403_photo_ts) safeR.iso403_photo_ts = r.iso403_photo_ts;
        if (r.iso403_photo_by) safeR.iso403_photo_by = r.iso403_photo_by;
        // 실체 위치 (선적)
        if (r.bay_actual) safeR.bay_actual = r.bay_actual;
        if (r.row_actual) safeR.row_actual = r.row_actual;
        if (r.tier_actual) safeR.tier_actual = r.tier_actual;
        if (r.actual_at) safeR.actual_at = r.actual_at;
        if (r.actual_by) safeR.actual_by = r.actual_by;
        // M6.94.32: EDI에 위치(bay)가 있으면 리스트 bay/row/tier가 덮지 못함.
        //   원인: 엠티 선적 엑셀(MCAT EMPTY)에는 진짜 선내 위치가 없고 그룹 카운트만 있어,
        //   파서가 만든 가짜 bay/row/tier가 EDI의 정확한 위치(BAPLIE LOC+147)를 덮어
        //   카고플랜 그림이 엉뚱하게 그려짐. EDI 위치 = 단일 진실 (카스피도 EDI 위치 그대로 사용).
        //   사용자가 앱에서 직접 옮긴 위치는 bay_actual 경로(위에서 처리)라 영향 없음.
        //   EDI에 위치가 없을 때만(리스트 단독 컨 등) 리스트 위치 사용.
        const ediHasPos = merged[r.cn].bay !== undefined && merged[r.cn].bay !== '';
        if (!ediHasPos) {
          if (r.bay !== undefined) safeR.bay = r.bay;
          if (r.row !== undefined) safeR.row = r.row;
          if (r.tier !== undefined) safeR.tier = r.tier;
        }
        merged[r.cn] = { ...merged[r.cn], ...safeR, _inList: true };   // V8.87-01: 리스트 등록 표식(별첨 평택 판정)
      }
    });
    const list = Object.values(merged);

    // M4.9e-fix 2단계: 선적 모드 effective 위치 적용 (베이그리드도 실체 위치에 그려지게)
    // M5.1 I: STG 보관 컨은 베이 그리드에서 숨김 (bay='' 처리, _in_storage 플래그)
    if (mode === 'loading') {
      return list.map(c => {
        if (c.bay_actual === '__STG__') {
          // 보관함으로 빠진 컨 — 그리드에는 안 보이고 별도 StorageBox에서 처리
          return {
            ...c,
            _bay_planned: c.bay,
            _row_planned: c.row,
            _tier_planned: c.tier,
            bay: '',  // 그리드에서 빠짐 (bayGroups에 안 들어감)
            row: '',
            tier: '',
            _in_storage: true,
          };
        }
        if (c.bay_actual && c.row_actual && c.tier_actual) {
          return {
            ...c,
            bay: c.bay_actual,
            row: c.row_actual,
            tier: c.tier_actual,
            _bay_planned: c.bay,
            _row_planned: c.row,
            _tier_planned: c.tier,
            _position_moved: true,
          };
        }
        return c;
      });
    }
    return list;
  }, [fullEdiMap, recMap, mode]);

  // V9.03: 베이플랜/카고플랜용 목록에 긴급/수화물 마커 주입
  const allEdiContainers = useMemo(
    () => tagForecastMarks(allEdiContainersBase, urgentSet, luggSet, _fcApply ? _fc.luggageSeals : null),
    [allEdiContainersBase, urgentSet, luggSet, _fc, _fcApply]);

  // 표시용 컨테이너 (EDI 평택 + 리스트 병합)
  // M3.5.4-fix2: EDI = 단일 진실 원칙 강화
  //   - 리스트는 sl/wt 같은 보강 필드만 채울 수 있음
  //   - ISO, rf, fe, dg, bay/row/tier 등 핵심 필드는 EDI 절대 우선
  //   - 리스트가 EDI 리퍼를 일반 컨으로 덮어쓰는 사고 방지
  const containersBase = useMemo(() => {
    const merged = {};
    // V8.86: 컨번호 없는 EDI = '실제 자리'(규격·자리 확정, 컨번호 미지정 — 예: 터미널 PRE) →
    //   컨번호 키로 뭉개지 말고 자리별 __SLOT_ 키로 각각 유지(그림에 그려지고, 별첨·검수집계에선 제외).
    let _slotSeq = 0;
    Object.values(ediMap).forEach(c => {
      if (!isPtk(c)) return;
      if (c.cn) { merged[c.cn] = { ...c, _src: 'edi' }; return; }
      let k = `__SLOT_${c.bay || ''}_${c.row || ''}_${c.tier || ''}`;
      if (merged[k]) k = `${k}_${_slotSeq++}`;
      merged[k] = { ...c, cn: k, pendingCn: true, _slot: true, _src: 'edi' };
    });

    // 리스트가 채울 수 있는 필드 (보강 정보만)
    // EDI 핵심 필드(iso, rf, fr, ot, tk, dg, fe, bay, row, tier, pol, pod 등)는 제외
    // M4.9b-fix: 검수원이 폰에서 입력한 엠티실/ISO403 사진 필드도 records 단일 진실 원천
    //   → 이전: 화이트리스트에 없어서 c.eseal 등이 화면/보고서에서 누락되던 치명적 버그
    //   → 사용자 신고: "엠티에 실 다 입력했는데 표기 안 되고 보고서에도 비어있음"
    const ALLOWED_LIST_FIELDS = new Set([
      'sl', 'sl_orig', 'sl_history', 'wt',
      'bl', 'sh', 'gi', 'op',  // B/L, Shipper, Gross Index, Operator
      'tmp',  // 온도는 리스트가 보강 가능 (단, 비어있을 때만)
      'rfdry',  // V9.20-04: 리퍼드라이(넌플러그) — records/수집기 패치가 화면까지 오도록
      'mkcon',  // V9.23: 제작컨테이너 — 리스트 REMARK '특수컨' 자동 인식분이 화면까지 오도록
      // TallyOne 1.8-07: 리퍼 온도 확인값 — **여기 없으면 저장돼도 화면이 못 읽는다.**
      //   1.8 에서 이 다섯을 빠뜨려, 사진 판독·확인 완료까지 해도 재로그인하면 '미확인'으로
      //   되돌아가고 온도가 EDI 값으로 초기화됐다(검수사 신고 2026-08-04).
      //   ⚠ 바로 위 M4.9b-fix 주석의 엠티실 사고와 **같은 실수를 반복한 것**이다.
      //     records 에 새 필드를 만들면 이 목록에 넣었는지 반드시 확인할 것.
      'rfSet', 'rfAct', 'rfSrc', 'rfCheckedAt', 'rfCheckedBy',
      'sl_conflict',   // 1.8-03: 리스트끼리 실번호가 다를 때 두 값 모두 — 배지가 이걸 읽는다
      'desc',  // M8.07: 품명(내용물) — EDI에 없는 참조 정보, 카고플랜 그림에 영향 없음
      // M4.9b-fix: 엠티 실 — EDI에 봉인 정보 없는 게 일반적, records가 진실
      'eseal', 'eseal_orig', 'eseal_wrong', 'reseal',
      'eseal_at', 'eseal_by', 'eseal_mode', 'eseal_history',
      // M4.9b-fix: ISO403 사진 마킹
      'iso403_photo_ts', 'iso403_photo_by', 'iso403_photo_history',
      // M4.9d-fix: 선적 실체 위치 (계획 c.bay/row/tier는 보존, 실체는 별도)
      'bay_actual', 'row_actual', 'tier_actual',
      'actual_at', 'actual_by',
      // M6.72: 선적 위치 수정 — bay/row/tier records 우선 (사용자 위치 변경 + displaced 미배정)
      'bay', 'row', 'tier',
      'bay_orig', 'row_orig', 'tier_orig',
      'edits',
    ]);
    // M6.72: 빈 문자열을 명시 삭제로 인정할 필드 (위치 수정 시 displaced 컨 보관상자 이동)
    const POSITION_FIELDS = new Set(['bay', 'row', 'tier']);

    Object.values(recMap).forEach(r => {
      const ediBase = merged[r.cn];
      const safeR = {};
      Object.keys(r).forEach(k => {
        const v = r[k];
        const isPositionField = POSITION_FIELDS.has(k);
        // M6.72: bay/row/tier 빈 문자열은 명시 삭제 (보관상자 이동 의도)
        if (v === null || v === undefined) return;
        if (v === '' && !isPositionField) return;
        if (Array.isArray(v) && v.length === 0) return;

        if (ediBase) {
          // V9.23: 가상 EDI(실 EDI 없이 리스트로 만든 스텁 — cn/pol/wt뿐)는 규격·F/E의 진실이 아니다.
          //   스텁이거나 EDI 값이 비어 있으면 리스트가 핵심 필드를 채운다 (OBWH 2699E 실측:
          //   records엔 fe/iso 전수 있는데 화면은 미정·기타 — 사용자 신고 "풀엠티·규격 다 있는데 적용 안 됨").
          //   실 EDI에 값이 있으면 기존 원칙 그대로 EDI가 진실.
          const CORE_FILL = k === 'fe' || k === 'iso' || k === 'tp' || k === 'rf' || k === 'fr' ||
            k === 'ot' || k === 'tk' || k === 'dg' || k === 'dgc' || k === 'un' || k === 'pod' || k === 'tmp_missing';
          if (CORE_FILL && (ediBase._virtualEdi || ediBase[k] === undefined || ediBase[k] === '')) {
            safeR[k] = v; return;
          }
          // EDI 매칭됨 → 핵심 필드는 보호, 보강 필드만 허용
          if (!ALLOWED_LIST_FIELDS.has(k)) return;  // 핵심 필드 무시
          // M6.94.32: EDI에 위치(bay)가 있으면 리스트 bay/row/tier가 덮지 못함.
          //   엠티 선적 엑셀엔 진짜 위치가 없어 가짜 값이 EDI 정확한 위치를 덮으면 그림이 깨짐.
          //   사용자 직접 위치 수정은 bay_actual 경로로 처리되므로 영향 없음.
          if (isPositionField && ediBase.bay !== undefined && ediBase.bay !== '') return;
          // tmp는 EDI에 이미 있으면 덮어쓰지 않음 (EDI가 진실)
          if (k === 'tmp' && ediBase.tmp && !ediBase.tmp_missing) return;
          // wt는 EDI 값이 0일 때만 채움
          if (k === 'wt' && parseInt(ediBase.wt, 10) > 0) return;
          safeR[k] = v;
        } else {
          // EDI에 없는 컨번호 → 리스트만 있는 항목 (참고용으로 허용)
          if (v !== 0) safeR[k] = v;
        }
      });
      merged[r.cn] = { ...(ediBase || {}), ...safeR, _inList: true, _src: ediBase ? 'both' : 'list' };   // V8.86: 리스트 등록 표식(선적 평택 판정 — 별첨·베이와 동일 원칙)
    });
    // V7.99-16: 초과 컨(리스트·EDI에 없는데 내려진 것) 합치기 — 양하신고 점검이 보도록.
    //   completed에도 flag:'extra'로 기록되지만, 컨 목록에 없으면 집계에서 빠지므로 여기서 추가.
    const extrasMap = (mode === 'discharge' ? (sec.extras || {}) : {});
    Object.keys(extrasMap).forEach(cn => {
      if (!merged[cn]) merged[cn] = { cn, _src: 'extra', pod: 'KRPTK', _extraNote: extrasMap[cn]?.note || '' };
    });
    const baseContainers = Object.values(merged).sort((a, b) => {
      const ka = `${a.bay || 'zz'}-${a.row || 'zz'}-${a.tier || 'zz'}`;
      const kb = `${b.bay || 'zz'}-${b.row || 'zz'}-${b.tier || 'zz'}`;
      return ka.localeCompare(kb);
    });

    // M4.9e-fix 2단계: 선적 모드 — 실체 위치 적용
    //   actual 있으면 → 실체 위치로 그리드에 그려짐
    //   계획 위치는 _bay_planned/_row_planned/_tier_planned에 보존 (보고서/UI용)
    //   양하 모드는 변경 없음 (EDI가 실체)
    if (mode === 'loading') {
      return baseContainers.map(c => {
        if (c.bay_actual && c.row_actual && c.tier_actual) {
          return {
            ...c,
            // 그리드/검색용 effective 위치
            bay: c.bay_actual,
            row: c.row_actual,
            tier: c.tier_actual,
            // 계획 위치 보존 (보고서/모달 표시용)
            _bay_planned: c.bay,
            _row_planned: c.row,
            _tier_planned: c.tier,
            _position_moved: true,
          };
        }
        return c;
      });
    }
    return baseContainers;
  }, [ediMap, recMap, mode, sec.extras]);

  // V9.03: 검수 리스트/검색/출력허브용 목록에 긴급/수화물 마커 주입
  const containers = useMemo(
    () => tagForecastMarks(containersBase, urgentSet, luggSet, _fcApply ? _fc.luggageSeals : null),
    [containersBase, urgentSet, luggSet, _fc, _fcApply]);

  // ── TallyOne 1.8: 리퍼 온도 확인 ─────────────────────────────────────────
  //   "작업전 먼저 선박을 선택합니다. 그러면 앱은 리퍼 유무를 판단하고 있으면 리퍼메모 화면을
  //    띄워 줍니다"(검수사 확정 2026-08-04). 아직 확인 안 한 리퍼가 남아 있을 때만 자동으로 뜬다.
  //   확인을 마치면 다시 안 뜨고, 상단 「❄ 리퍼 N」 버튼으로 언제든 다시 연다.
  //   대상 = **풀 리퍼만**(검수사 확정 2026-08-04). 공 리퍼는 전원을 안 꽂아 잴 것이 없다.
  //   ReeferMemoModal.isReefer 와 **같은 식**이어야 한다 — 버튼 숫자와 모달 줄 수가 어긋나면 안 된다.
  const reefers = useMemo(
    () => (containers || []).filter((c) => {
      const rf = !!c.rf || String(c.iso || '').toUpperCase()[2] === 'R' || /^45[38]/.test(String(c.iso || ''));
      if (!rf || c.rfdry || c.mkcon) return false;
      return c.fe === 'F' || !c.fe;
    }),
    [containers]);
  const rfUnchecked = useMemo(() => reefers.filter(c => !c.rfCheckedAt).length, [reefers]);
  const [showReefer, setShowReefer] = useState(false);
  const rfAutoRef = React.useRef('');
  React.useEffect(() => {
    // 항차·모드가 바뀔 때 한 번만 판단한다(자료가 늦게 도착해 재렌더돼도 다시 띄우지 않는다).
    const key = `${voyageKey}|${mode}`;
    if (rfAutoRef.current === key) return;
    if (!reefers.length) return;          // 리퍼 자체가 없으면 아무 일 없다
    rfAutoRef.current = key;
    if (rfUnchecked > 0) setShowReefer(true);
  }, [voyageKey, mode, reefers.length, rfUnchecked]);

  // V8.06: LOLO/IFCSUM 선박 판정 — 컨테이너에 베이 위치가 하나도 없으면 LOLO 전용.
  //   RIZHAO ORIENT 등 RORO/LOLO 혼용선은 IFCSUM(베이 없음)으로 명세만 제공된다.
  //   베이 그림이 무의미하므로 리스트 기반 LOLO 탭을 노출한다(기존 베이 선박엔 영향 0).
  const isLoloShip = useMemo(() => {
    // V8.09-07: LOLO 판정을 선박정책(lolo 플래그)으로 변경 (사용자 확정 2026-06-18).
    //   기존 "모든 컨에 bay/row/tier 없음"은 일반 베이 선박(TPMZ)이 위치정보 없이 올라오면
    //   LOLO로 오판 → LOLO 탭 자동전환·수석 LOLO 리스트 오생성. LOLO는 RZOR만.
    const vsl = voyage?.info?.vsl || '';
    const hints = [voyage?.info?.voy, voyage?.info?.voyage, voyage?.info?.callsign].filter(Boolean);
    return isLoloShipByPolicy(vsl, extraPolicies, hints);
  }, [voyage, extraPolicies]);

  // V8.06: LOLO 선박(베이 없는 IFCSUM)이면 최초 1회 자동으로 LOLO 탭으로 전환.
  //   양하 탭의 EDI↔리스트 매칭 경고("리스트에 없음")는 이 선박엔 부적절(EDI가 곧 리스트)하므로
  //   LOLO 탭을 기본으로 열어 검수사가 바로 작업하게 한다. 이후 사용자가 탭을 바꾸면 그 선택을 존중.
  const loloAutoSwitched = useRef(false);
  useEffect(() => {
    if (isLoloShip && !loloAutoSwitched.current) {
      loloAutoSwitched.current = true;
      setTab('lolo');
    }
  }, [isLoloShip]);

  // M3.5.5: 선박 정책 매칭 (DEFAULT + Firebase extra)
  const shipPolicy = useMemo(() => {
    const vsl = voyage?.info?.vsl || '';
    return matchShipPolicy(vsl, extraPolicies);
  }, [voyage, extraPolicies]);

  // M3.5.5: 정책 적용 대상 컨테이너 (sealMode 표시용)
  const sealTargets = useMemo(() => {
    if (!shipPolicy) return { byCn: {}, list: [] };
    const byCn = {};
    const list = [];
    (containers || []).forEach(c => {
      const sm = applyPolicyToContainer(shipPolicy, c);
      if (sm) {
        byCn[c.cn] = sm;
        list.push({ ...c, _sealMode: sm });
      }
    });
    return { byCn, list };
  }, [shipPolicy, containers]);

  // 새 선박 정책 묻기 (M6.45: 1일 1회 — localStorage에 마지막 묻기 날짜 저장)
  //   - 정책 등록되면 shipPolicy 매칭되어 다시 안 뜸 (기존 동작)
  //   - 등록 안 하고 닫기 → 같은 날 다시 안 뜸, 다음 날부터 다시 표시
  //   - 선박별 키 (IMO 또는 vsl)로 구분 — 다른 선박 작업하면 그건 또 뜰 수 있음
  // M6.45: Firebase 백업 추가 — localStorage 작동 안 하는 환경에서도 적용
  //   다른 폰/브라우저에서 같은 검수원이 접속해도 1일 1회 보장
  useEffect(() => {
    if (policyAsked) return;
    if (!voyage?.info?.vsl) return;
    if (shipPolicy) return;  // 이미 매칭됨
    const hasEdi = (containers || []).length > 0;
    if (!hasEdi) return;

    const policyAskKey = voyage?.info?.imo || voyage?.info?.vsl || voyageKey;
    const todayStr = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
    const lastAskedKey = `policyAsked:${policyAskKey}`;

    // M6.45: localStorage 우선, 다음 Firebase 백업
    (async () => {
      const lsLastAsked = _storage.get(lastAskedKey);
      if (lsLastAsked === todayStr) {
        setPolicyAsked(true);
        return;
      }
      // Firebase 백업 확인 (다른 기기에서 오늘 이미 물어봤을 가능성)
      try {
        const { default: fb } = await import('../firebase.js');
        // inspectorActivity에 정책 확인 기록 — 검수원별
        const inspName = inspector || 'anon';
        const fbKey = `policyAsked/${inspName}/${policyAskKey}`;
        const snap = await fb.fbGetSimple ? await fb.fbGetSimple(fbKey) : null;
        if (snap === todayStr) {
          setPolicyAsked(true);
          _storage.set(lastAskedKey, todayStr);  // 로컬에도 동기화
          return;
        }
      } catch (_) { /* Firebase 실패해도 localStorage로 폴백 */ }

      setShowPolicyModal(true);
      setPolicyAsked(true);
      _storage.set(lastAskedKey, todayStr);  // 로컬 기록
      // Firebase 백업 저장 (실패해도 무시)
      try {
        const fb = await import('../firebase.js');
        if (fb.fbSetSimple) {
          await fb.fbSetSimple(`policyAsked/${inspector || 'anon'}/${policyAskKey}`, todayStr);
        }
      } catch (e) { console.warn('[정책질문 기록] Firebase 백업 저장 실패(로컬 기록은 유지)', e); }  // V9.57: 조용한 실패 금지
    })();
  }, [voyage, shipPolicy, policyAsked, containers, voyageKey, inspector]);

  // M3.5.4: 자동 진단 (containers/recMap/xrayMap 변경 시 재계산)
  const diagAlerts = useMemo(() => {
    if (!containers || containers.length === 0) return [];
    if (diagDismissed) return [];
    // 평택 화물만 필터된 ediMap 만들기
    const ediPtkObj = {};
    Object.values(ediMap || {}).forEach(c => {
      const isPtkC = isPtk(c);   // V9.29: TS 화물 포함 — 판정 단일 소스
      if (!isPtkC) return;
      // M8.07: 진단용 보강 — EDI에 온도/F/E가 없으면 검수 리스트(records) 값으로 채움.
      //   RIZHAO 등 IFCSUM은 EDI에 온도 필드가 없고 검수 엑셀에만 있음.
      //   EDI에 값이 있으면 보존(EDI 우선). 진단 입력만 보강, 원본 ediMap 불변.
      const r = recMap[c.cn];
      let merged = c;
      if (r) {
        const patch = {};
        const ediTmp = String(c.tmp || '').trim();
        const recTmp = String(r.tmp || '').trim();
        if (!ediTmp && recTmp) { patch.tmp = r.tmp; patch.tmp_missing = false; }
        if (!c.fe && r.fe) patch.fe = r.fe;
        if (Object.keys(patch).length) merged = { ...c, ...patch };
      }
      ediPtkObj[c.cn] = merged;
    });
    return runDiagnostics({
      ediContainers: ediPtkObj,
      listRecords: recMap,
      xrayList: xrayMap,
      mode,
      carrier: voyage?.info?.carrier || '',
      sealPolicy: shipPolicy,  // M3.5.5
    });
  }, [containers, ediMap, recMap, xrayMap, mode, diagDismissed, voyage, shipPolicy]);

  return (
    <div className="max-w-6xl mx-auto px-3 py-2">
      {/* 모드 탭 (둘 다 있을 때만) */}
      {hasDis && hasLoa && (
        <div className="flex gap-1 mb-3 bg-slate-900 border border-slate-800 rounded-lg p-1">
          <button
            onClick={() => setMode('discharge')}
            className={`flex-1 py-2 rounded text-sm font-bold flex items-center justify-center gap-1.5 transition ${
              mode === 'discharge' ? 'bg-blue-700 text-blue-100' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <ArrowDown className="w-4 h-4"/>양하
          </button>
          <button
            onClick={() => setMode('loading')}
            className={`flex-1 py-2 rounded text-sm font-bold flex items-center justify-center gap-1.5 transition ${
              mode === 'loading' ? 'bg-amber-700 text-amber-100' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <ArrowUp className="w-4 h-4"/>선적
          </button>
        </div>
      )}
      {!hasDis && !hasLoa && <ModeSetup voyageKey={voyageKey} />}

      {/* 모드 라벨 (한 모드만 있을 때) */}
      {(hasDis !== hasLoa) && (
        <div className="mb-2">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-black ${
            mode === 'discharge' ? 'bg-blue-900/50 text-blue-200' : 'bg-amber-900/50 text-amber-200'
          }`}>
            {mode === 'discharge' ? <><ArrowDown className="w-3 h-3"/>양하</> : <><ArrowUp className="w-3 h-3"/>선적</>}
          </span>
        </div>
      )}

      {/* V9.17: 출항 임박 마감 경고 — ETD 2시간 전인데 미완·X-RAY·리퍼 온도가 남아 있으면 붉은 배너.
          데이터(ETD·미완 판정)는 전부 있었는데 능동 경고가 0이었다(전면 점검 §6). */}
      {(() => {
        try {
          const info = voyage?.info || {};
          let pm = null;
          const cs = String(info.callsign || '').toUpperCase();
          if (cs && portMisData[cs]) pm = portMisData[cs];
          if (!pm && info.imo) pm = Object.values(portMisData).find(x => x && String(x.imo || '') === String(info.imo));
          if (!pm) return null;
          const etd = parsePortMisDateTime(pm.etd);
          if (!etd) return null;
          const left = etd - Date.now();
          if (left <= 0 || left > 2 * 3600000) return null;
          const undone = containers.filter(c => !compMap[c.cn]).length;
          const xrayPend = mode === 'discharge' ? Object.keys(xrayMap || {}).filter(cn => !(xraySeals || {})[cn]?.seal).length : 0;
          const rfMiss = containers.filter(c => (c.rf || (c.iso && c.iso[2] === 'R')) && !c.rfdry && !c.mkcon &&
            (c.fe === 'F' || !c.fe) && (!c.tmp || String(c.tmp).trim() === '')).length;
          if (!undone && !xrayPend && !rfMiss) return null;
          const mins = Math.round(left / 60000);
          const parts = [];
          if (undone) parts.push(`미완 ${undone}대`);
          if (xrayPend) parts.push(`X-RAY 미처리 ${xrayPend}대`);
          if (rfMiss) parts.push(`리퍼 온도 미입력 ${rfMiss}대`);
          return (
            <button onClick={() => setClosingOpen(true)}
              className="w-full mb-3 bg-red-950/70 border-2 border-red-600 rounded-lg px-3 py-2.5 text-left active:scale-[0.99]">
              <div className="text-[13px] font-black text-red-200">
                🚨 출항 {mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`} 전 — {parts.join(' · ')}
              </div>
              <div className="text-[11px] text-red-300/80 mt-0.5">탭하면 마감 점검이 열립니다</div>
            </button>
          );
        } catch { return null; }
      })()}

      {/* M5.0: 항차 요약 카드 — 진입 시 즉시 상황 파악 */}
      <VoyageSummaryCard voyage={voyage} mode={mode} />

      {/* M5.1 G: 작업 보고 + 마감 점검 두 큰 버튼 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <button onClick={() => setShowWorkReport(true)}
          className="py-3 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg">
          📤 작업 보고
        </button>
        <button onClick={() => setClosingOpen(true)}
          className="py-3 bg-amber-700 hover:bg-amber-600 active:bg-amber-800 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg">
          🏁 마감 점검
        </button>
      </div>

      {/* V9.15: 진단 경고는 탭 바 위(눈에 띄어야 하는 경고) — PORT-MIS 카드는 탭 본문 아래로 내림(전면 점검 2-1) */}
      {/* M3.5.4: 자동 진단 경고 패널 */}
      {diagAlerts.length > 0 && (
        <div className="mb-3">
          <DiagnosticsPanel
            alerts={diagAlerts}
            autoSpeak={diagAutoSpeak}
            onToggleSpeak={() => setDiagAutoSpeak(v => !v)}
            onDismiss={() => setDiagDismissed(true)}
            onOpenContainer={(cn) => {
              const c = (containers || []).find(x => x.cn === cn);
              if (c) setDetailC(c);
            }}
          />
        </div>
      )}


      {/* 탭 네비게이션 — M5.0: 명칭 산뜻하게 정리 */}
      <nav className="bg-slate-900 border border-slate-800 rounded-lg flex mb-3 overflow-x-auto sticky top-[52px] z-20 shadow-lg shadow-slate-950/60">
        {[
          { k: 'list', t: mode === 'discharge' ? '양하' : '선적', i: ListChecks },
          { k: 'search', t: '🎤 자연어', i: SearchIcon },
          ...(isLoloShip
            ? [{ k: 'lolo', t: 'LOLO', i: ListChecks }]
            : [{ k: 'bay', t: '베이', i: MapPin }]),
          { k: 'stats', t: '통계', i: BarChart3 },
          { k: 'report', t: '결과', i: FileCheck },
          { k: 'data', t: '업로드', i: Upload },
        ].map(({ k, t, i: Icon }) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 px-2 py-2.5 text-[11px] font-bold flex items-center justify-center gap-1 border-b-2 whitespace-nowrap ${
              tab === k ? 'border-amber-400 text-amber-300 bg-slate-800/30' : 'border-transparent text-slate-400'
            }`}>
            <Icon className="w-3.5 h-3.5"/>{t}
          </button>
        ))}
      </nav>

      {/* TallyOne 1.8: 리퍼가 있으면 언제든 온도 확인 화면을 다시 연다.
          미확인이 남아 있으면 숫자를 붉게 띄워 '아직 안 봤다'를 숨기지 않는다. */}
      {/* ⚠ 모달은 이 버튼 바로 옆(VoyagePage 트리 안)에 둔다. 1.8 첫 배포에서 파일 아래쪽
          DataTab(업로드 탭) 안에 넣는 바람에 상태는 켜지는데 그릴 곳이 없어 아무 일도 안 났다. */}
      {showReefer && (
        <ReeferMemoModal containers={containers} voyageKey={voyageKey} mode={mode} inspector={inspector}
          onClose={() => setShowReefer(false)}/>
      )}
      {reefers.length > 0 && (
        <button onClick={() => setShowReefer(true)}
          className={`w-full mb-3 px-3 py-2 rounded-lg border flex items-center justify-between ${
            rfUnchecked > 0 ? 'bg-cyan-900/30 border-cyan-700/60' : 'bg-slate-900 border-slate-800'}`}
          style={{ minHeight: 44 }}>
          <span className="text-[12px] font-bold text-cyan-200">❄ 리퍼 온도 확인 · {reefers.length}대</span>
          <span className={`text-[11px] font-bold ${rfUnchecked > 0 ? 'text-rose-300' : 'text-emerald-400'}`}>
            {rfUnchecked > 0 ? `미확인 ${rfUnchecked}대` : '확인 완료 ✓'}
          </span>
        </button>
      )}

      {/* M8.08: 양하/선적 작업 화면의 엠티 실 정책 배너·보고서 블록 제거.
          사용자 요구: 작업 화면엔 상단 요약만, 실번호 수정은 개별 카드, 보고서는 수석 대시보드.
          (EmptySealReportButton·SealPolicyBanner는 ChiefDashboard에 이미 구현됨.) */}

      {/* 탭 본문 */}
      {tab === 'list' && (
        <ListTab
          voyageKey={voyageKey} mode={mode}
          containers={containers} ediMap={ediMap} recMap={recMap}
          xrayMap={xrayMap} xraySeals={xraySeals} compMap={compMap}
          inspector={inspector}
          onOpenContainer={(c) => setDetailC(c)}
          externalFilter={listFilter}
          shiftingList={shiftingList}
        />
      )}
      {tab === 'search' && (
        // TallyOne 1.3: 조회(lookup)·자연어(nls) 기록 — 검색 실행부는 별도 파일
        //   (components/SearchPanel.jsx)이라 이번 판 수정 범위 밖. prop 계약을 건드리지 않고
        //   input 이벤트를 캡처해 질의를 기록한다. 숫자만이면 끝4 조회, 그 외는 자연어.
        //   textarea(인계 메모)는 제외. 확정 판정(타이핑 멈춤 1.2초)·중복 생략은 activityLog 담당.
        //   한계 — 음성 입력은 state로 직접 들어와 input 이벤트가 없어 기록되지 않는다
        //   (SearchPanel의 setQuery 지점에 1줄 보강 필요 — 다음 판).
        <div onInputCapture={(e) => {
          const t = e.target;
          if (!t || t.tagName !== 'INPUT') return;
          const v = String(t.value || '').trim();
          if (/^[0-9\s]+$/.test(v)) logQuerySettled('lookup', v, { voyageKey, mode });
          else logQuerySettled('nls', v, { voyageKey });
        }}>
        <SearchPanel
          voyage={voyage}
          voyageKey={voyageKey}
          inspector={inspector}
          onOpenContainer={(c) => setDetailC(c)}
          shipLib={shipLib}
          portMisData={portMisData}
          isLoloShip={isLoloShip}
          mode={mode}
          onWorkFilterChange={(m) => setMode(m)}
          onPlaceUnassigned={(c) => {
            // V9.28: 미배정 = 빈자리가 있다는 뜻 — 검수원이 베이 탭 빈 칸에 직접 배치 (사용자 확정:
            //   "앱이 빈자리를 보여주고 거기에 맞는 컨을 넣어야 한다. 수석 편집은 오입력 교정용")
            setPendingMove({ cn: c.cn, fromBay: '', fromRow: '', fromTier: '', fe: c.fe || '', iso: c.iso || c.tp || '' });
            setTab('bay');
          }}
        />
        </div>
      )}
      {tab === 'lolo' && (
        <>
        <DeckPlanView
          plan={voyage?.[mode]?.stowagePlan}
          containers={containers} compMap={compMap} xrayMap={xrayMap}
          voyageKey={voyageKey} mode={mode} inspector={inspector}
          onOpenContainer={(c) => setDetailC(c)}
        />
        <LoloTab
          voyageKey={voyageKey} mode={mode}
          containers={containers} compMap={compMap}
          xrayMap={xrayMap} xraySeals={xraySeals}
          inspector={inspector}
          onOpenContainer={(c) => setDetailC(c)}
        />
        </>
      )}
      {tab === 'bay' && (() => {
        // M4.9e 3단계: 자리 뺏긴 컨테이너 검출 (사용자 요청)
        //   컨 X가 actual 위치(11/11/11)로 이동 → 거기 원래 계획된 컨 Y는 자리 뺏김
        //   Y는 actual 없고, Y의 계획 위치를 다른 컨이 actual로 점유
        const displaced = (() => {
          if (mode !== 'loading') return [];
          // 1) actual 위치 → 점유한 컨번호 맵
          const occupiedBy = new Map();
          allEdiContainers.forEach(c => {
            if (c._position_moved && c.bay_actual) {
              const key = `${c.bay_actual}-${c.row_actual}-${c.tier_actual}`;
              occupiedBy.set(key, c.cn);
            }
          });
          // 2) 자기 계획 위치를 다른 컨이 점유했는데 자기는 actual 없음
          return allEdiContainers.filter(c => {
            if (c._position_moved) return false;  // 이미 옮긴 컨 제외
            // _bay_planned가 있으면 그것이 진짜 계획 (effective 변환된 경우)
            // 없으면 c.bay (원본 그대로)
            const planBay = c._bay_planned || c.bay;
            const planRow = c._row_planned || c.row;
            const planTier = c._tier_planned || c.tier;
            if (!planBay || !planRow || !planTier) return false;
            const key = `${planBay}-${planRow}-${planTier}`;
            const occupier = occupiedBy.get(key);
            if (!occupier || occupier === c.cn) return false;
            // 점유자 컨번호 부착 (UI 표시용)
            c._displacedBy = occupier;
            return true;
          });
        })();

        // M5.1 I: STG 보관 컨 검출 (선적 전용)
        const storedContainers = mode === 'loading'
          ? allEdiContainers.filter(c => c._in_storage)
          : [];

        return (
          <div className="space-y-2">
            {/* V9.57: BayDictStatusWidget 제거 — bayNum 결함으로 오표시, 기능은 자료 탭 BayDictVerifyWidget으로 이관(팀I) */}
            {/* 선적 모드 + 자리 뺏긴 컨 있을 때만 표시 */}
            {mode === 'loading' && displaced.length > 0 && (
              <DisplacedSidebar
                displaced={displaced}
                onOpenContainer={(c) => setDetailC(c)}
                onStartMove={(c) => {
                  // M4.9f 5단계: 이동 모드 진입 (토글)
                  if (pendingMove?.cn === c.cn) { setPendingMove(null); return; }
                  setPendingMove({
                    cn: c.cn,
                    fromBay: c._bay_planned || c.bay || '',
                    fromRow: c._row_planned || c.row || '',
                    fromTier: c._tier_planned || c.tier || '',
                    fe: c.fe || '', iso: c.iso || c.tp || '',
                  });
                }}
                pendingMoveCn={pendingMove?.cn}
              />
            )}
            {/* M5.1 I: 보관함 박스 (선적 전용) */}
            {mode === 'loading' && storedContainers.length > 0 && (
              <StorageBox
                stored={storedContainers}
                onOpenContainer={(c) => setDetailC(c)}
                onStartMove={(c) => {
                  if (pendingMove?.cn === c.cn) { setPendingMove(null); return; }
                  // 보관함에서 이동: 본위치는 계획 위치 사용 (짝/홀 매칭용)
                  setPendingMove({
                    cn: c.cn,
                    fromBay: c._bay_planned || '',
                    fromRow: c._row_planned || '',
                    fromTier: c._tier_planned || '',
                    fe: c.fe || '', iso: c.iso || c.tp || '',
                  });
                }}
                pendingMoveCn={pendingMove?.cn}
                onBatchRestore={async () => {
                  if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
                  if (!confirm(`보관함의 ${storedContainers.length}대를 모두 계획 위치로 복원하시겠습니까?`)) return;
                  try {
                    await fbBatchClearActual(voyageKey, mode, storedContainers.map(c => c.cn));
                  } catch (e) {
                    alert('복원 실패: ' + (e?.message || e));
                  }
                }}
              />
            )}
            <BayPlan
              containers={allEdiContainers} compMap={compMap} xrayMap={xrayMap} restowMap={shiftingMap} mode={mode}
              onOpenContainer={(c) => setDetailC(c)}
              shipImo={voyage?.info?.imo}
              shipName={voyage?.info?.vsl}
              voyageInfo={voyage?.info}
              voyageKey={voyageKey}
              pendingMove={pendingMove}
              onCancelMove={() => setPendingMove(null)}
              onCommitMove={async (bay, row, tier) => {
                // M4.9f 5단계: 빈 셀 클릭 시 그 자리로 이동
                if (!pendingMove) return;
                if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
                // V9.28: 물리 불가 가드 — 이 경로도 좌표 기록처다 (V9.27와 동일 원칙)
                const _pe = bayParityError({ iso: pendingMove.iso }, bay);
                if (_pe) { alert('⛔ ' + _pe); return; }
                // V9.28-04: 인접 슬롯 검사 — 40ft는 양옆 홀수 슬롯이 비어야 한다
                const _ae = slotAdjacencyError({ cn: pendingMove.cn, iso: pendingMove.iso }, bay, row, tier, allEdiContainers);
                if (_ae) { alert('⛔ ' + _ae); return; }
                // V9.28-05: POD 구역 경고 — 오선적 맞바꿈의 세 번째 그물 (경고 후 허용)
                const _pm = allEdiContainers.find(x => x.cn === pendingMove.cn);
                const _pz = podZoneMismatch({ cn: pendingMove.cn, pod: _pm?.pod }, bay, tier, allEdiContainers);
                if (_pz) { alert(`⛔ 이 구역은 ${_pz.zone} 화물 자리입니다 (주변 ${_pz.count}대). ${pendingMove.cn}의 포트는 ${_pz.pod}.\n계획에 없는 포트 섞임은 실을 수 없습니다 — 현장에서 막고 제 구역 빈자리로 보내세요.\n불가피한 변경은 수석검수사가 베이상세편집 또는 EDI 수정으로 처리합니다.`); return; }
                try {
                  await fbSetActualPosition(voyageKey, mode, pendingMove.cn,
                    String(bay).padStart(2,'0'),
                    String(row).padStart(2,'0'),
                    String(tier).padStart(2,'0'),
                    inspector);
                  setPendingMove(null);
                } catch (e) {
                  console.error(e);
                  alert('이동 저장 실패: ' + (e?.message || e));
                }
              }}
              // M5.1 I: 영역 선택 → 일괄 보관 (선적 전용)
              enableSelection={mode === 'loading'}
              onBatchToStorage={async (cns) => {
                if (!cns || cns.length === 0) return;
                if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
                if (!confirm(`선택된 ${cns.length}대를 보관함으로 보내시겠습니까?\n(언제든 보관함에서 [이동] 버튼으로 다시 배치 가능)`)) return;
                try {
                  await fbBatchMoveToStorage(voyageKey, mode, cns, inspector);
                } catch (e) {
                  console.error(e);
                  alert('보관 실패: ' + (e?.message || e));
                }
              }}
            />
          </div>
        );
      })()}
      {tab === 'stats' && (
        <div className="space-y-3">
          {/* V9.15: BayDictVerifyWidget(자료 진단)은 업로드 탭으로 — 통계 탭 첫 화면은 통계여야 한다(전면 점검 2-5) */}
          <StatsTab containers={containers} compMap={compMap} xrayMap={xrayMap} mode={mode}/>
        </div>
      )}
      {tab === 'report' && (
        <div className="space-y-3">
          {/* V9.19-01: 마감 텔리 카드는 수석 대시보드로 이동 — 검수원이 보면 안 되는 서류(사용자 확정 2026-07-28) */}
          <ReportTab
            voyageKey={voyageKey} mode={mode} voyageInfo={voyage.info}
            containers={containers} compMap={compMap} xrayMap={xrayMap} xraySeals={xraySeals}
          />
          {/* V9.16: 이 항차 작업 보고 이력 — 구독 함수는 있었는데 호출 0회였다(전면 점검 §1-7).
              검수원이 자기가 보낸 시작·중단·해치·콘박스 보고를 여기서 확인한다. */}
          <WorkReportHistory voyageKey={voyageKey}/>
        </div>
      )}
      {tab === 'data' && (
        <div className="space-y-3">
          {/* V9.15: 자료 진단은 자료 화면에 — 통계 탭에서 이사 */}
          <BayDictVerifyWidget
            shipInfo={voyage?.info ? { imo: voyage.info.imo, name: voyage.info.vsl } : null}
            ediContainers={Object.values(ediMap)}
          />
          <DataTab voyageKey={voyageKey} mode={mode} voyage={voyage} setMode={setMode} inspector={inspector} />
        </div>
      )}

      {/* 컨테이너 상세 모달 */}
      {detailC && (() => {
        // 검색에서 온 경우 _mode 사용, 아니면 현재 mode
        const cMode = detailC._mode || mode;
        const cSec = voyage[cMode] || {};
        // M3.87: 위치 수정 충돌 검사용 - 같은 모드 전체 컨테이너 머지
        const ediMap = cSec.ediContainers || {};
        const recMap = cSec.records || {};
        const compMap = cSec.completed || {};
        const allCnSet = new Set([...Object.keys(ediMap), ...Object.keys(recMap)]);
        const allContainersForMode = [...allCnSet].map(cn => {
          const e = ediMap[cn] || {};
          const r = recMap[cn] || {};
          return { ...e, ...Object.fromEntries(Object.entries(r).filter(([k,vv]) => vv !== '' && vv != null)), cn, _comp: compMap[cn] || null };
        });
        return (
          <ContainerDetailModal
            c={detailC}
            workBay={detailC.bay || detailC.bay_orig || (recMap[detailC.cn]?.bay_orig) || null}
            workTier={(() => { const t = parseInt(detailC.tier || detailC.tier_planned || recMap[detailC.cn]?.tier_orig || '', 10); return Number.isFinite(t) ? (t < 80 ? 'hold' : 'deck') : null; })()}
            comp={cSec.completed?.[detailC.cn]}
            isXray={cMode === 'discharge' && !!(cSec.xrayList?.[detailC.cn])}
            xraySeal={cSec.xraySeals?.[detailC.cn] || null}
            mode={cMode}
            voyageKey={voyageKey}
            voyageInfo={voyage.info}
            inspector={inspector}
            sealMode={sealTargets.byCn[detailC.cn] || null}
            onClose={() => setDetailC(null)}
            allContainers={allContainersForMode}
          />
        );
      })()}

      {/* M3.5.5: 새 선박 정책 등록 모달 */}
      <ShipPolicyModal
        open={showPolicyModal}
        vsl={voyage?.info?.vsl || ''}
        code={voyage?.info?.imo || ''}
        inspector={inspector}
        onSaved={() => { /* Firebase 구독으로 자동 반영 */ }}
        onClose={() => setShowPolicyModal(false)}
      />

      {/* M3.5.6: 작업 보고 모달 (양하/선적/해치/콘박스 + 카톡 공유) */}
      <WorkReportModal
        open={showWorkReport}
        voyageKey={voyageKey}
        voyage={voyage}
        lastEquip={getEquipNumber()}
        onClose={() => setShowWorkReport(false)}
      />

      {/* V9.18: 선박 소개 · 이름 유래 — 하단 정보 구역 */}
      <ShipIntroCard info={voyage?.info} inspector={inspector} portMisData={portMisData}/>

      {/* V9.37-01: ⚡ 지금 처리 버튼은 **홈 카드로 이동**(사용자 지시 2026-08-01) — 여기 중복 제거. */}
      {/* V9.15: PORT-MIS 카드 — 탭을 눌러도 이 카드 때문에 내용이 안 보이던 문제로 본문 아래 이동 */}
      {/* M5.21: PORT-MIS 입출항 정보 (Chrome 확장이 자동 수집한 데이터) */}
      {/* M5.23: 매칭 로직 강화 — 콜사인 prefix + IMO 매칭 fallback 추가 */}
      {/* M5.87: voyage.info의 callsign + vslFull 우선 사용 (베이사전 의존도 제거, EDI 자동 추출) */}
      {(() => {
        const vsl = (voyage?.info?.vsl || '').toUpperCase();
        const vslFull = (voyage?.info?.vslFull || '').toUpperCase();  // M5.87: EDI에서 자동 추출된 풀네임
        const dictData = (() => {
          try { return getShipBayDictData(voyage?.info?.imo, voyage?.info?.vsl, { vslFull: voyage?.info?.vslFull || '' }); }
          catch { return null; }
        })();
        // M5.87: voyage.info.callsign 우선 (EDI 자동 추출), 없으면 베이사전
        const dictCallsign = voyage?.info?.callsign || dictData?.callsign || dictData?.bayDef?.callsign || '';
        const dictImo = dictData?.imo || voyage?.info?.imo || '';
        let pm = null;
        let matchedBy = '';

        // 1) 콜사인 정확 매칭
        let matchedKey = '';   // M5.83: 매칭된 Firebase 키 추적
        // V7.30: 콜사인 매칭 신원 가드 — 콜사인이 맞아도 PORT-MIS 선박명이
        //   우리 항차 선박명(EDI 풀네임)과 명백히 다르면 오염된 콜사인으로 보고 버림.
        //   (사전에 잘못 저장된 콜사인(예: DJCT에 BSDU)이 PORT-MIS의 다른 배(XIN TAI PING)에
        //    매칭되던 버그. EDI 풀네임이 있을 때만 검증 — 없으면 기존 동작 유지.)
        const _nameMatchesPm = (pmRec) => {
          const raw = String(vslFull || '');
          const myName = raw.toUpperCase().replace(/[\s\-_.]/g, '');
          const pmName = String(pmRec?.vesselName || '').toUpperCase().replace(/[\s\-_.]/g, '');
          // V8.24-02: vslFull이 신뢰할 만한 '선박명'이 아니면(빈값·짧음·공백없는 코드형) 검증 불가 → 통과.
          //   EDI 자동추출이 항구코드(예: CNYNT=중국 옌타이)를 vslFull에 잘못 넣으면, 정확 콜사인 매칭(D5MO4)까지
          //   이 가드에 막혀 미매칭이 났다. 진짜 풀네임은 보통 공백(다단어)이거나 7자 이상 → 그 경우만 가드 적용.
          const looksLikeName = /\s/.test(raw.trim()) || myName.length >= 7;
          if (!myName || !looksLikeName || !pmName || pmName.length < 5) return true; // 검증 불가 → 통과
          return myName.includes(pmName.slice(0, 5)) || pmName.includes(myName.slice(0, 5));
        };
        if (dictCallsign && portMisData[dictCallsign] && _nameMatchesPm(portMisData[dictCallsign])) {
          pm = portMisData[dictCallsign];
          matchedBy = 'callsign';
          matchedKey = dictCallsign;
        }
        // 2) 콜사인 prefix 매칭 (D5RR5 ↔ D5RR5xx)
        // M5.86: 여러 후보 중 vesselName이 베이사전 풀네임과 일치하는 것 우선
        //   예: V7A545 → V7A5451(STARSHIP DRACO) + V7A5452(PEGASUS PROTO) 둘 다 prefix 매치
        //       베이사전 name "DPRTPEGASUS PROTO V7A545"와 vesselName "PEGASUS PROTO" 비교 → V7A5452 우선
        if (!pm && dictCallsign && dictCallsign.length >= 4) {
          const cs = dictCallsign.toUpperCase();
          const dictName = String(dictData?.name || voyage?.info?.vsl || '').toUpperCase().replace(/\s+/g, '');
          // prefix 매칭 후보 모두 수집
          const candidates = Object.entries(portMisData).filter(([k, p]) => {
            const pcs = (p.callsign || '').toUpperCase();
            return pcs && pcs.length >= 4 && (pcs.startsWith(cs) || cs.startsWith(pcs));
          });
          // V8.09-13 (사용자 보고 2026-06-18): 같은 선박이 여러 항차로 PORT-MIS에 있을 때
          //   '저장 최신(updatedAt)'이 아니라 '다음 작업할 항차(가장 나중 일정)'를 골라야 한다.
          //   증상: PACIFIC SHENZHEN이 6/19 입항 예정인데, 앱이 지난 6/17 항차를 집어
          //     "정박중·부두표시"로 잘못 표시. 실제는 항해중(입항 전)이어야 함.
          //   기준(현재시각 now 대비):
          //     ① 아직 안 끝난 항차(ETD>=now) 우선 — 그중 ETA가 가장 늦은(가장 나중) 일정
          //        (옛 항차가 출항 직전이라도, 미래 일정이 따로 있으면 그쪽이 다음 작업분)
          //     ② 모두 끝났으면(ETD<now) 가장 최근 종료(ETD 최신)
          //     ③ 시각 정보 없으면 updatedAt 최신
          const _now = Date.now();
          const _score = ([, p]) => {
            const eta = parsePortMisDateTime(p?.eta);
            const etd = parsePortMisDateTime(p?.etd);
            if (eta == null && etd == null) return { tier: 2, key: p?.updatedAt || 0 };
            const notEnded = (etd != null ? etd >= _now : (eta != null ? eta >= _now : false));
            if (notEnded) return { tier: 0, key: (eta != null ? eta : etd) };  // 안 끝남: ETA 늦을수록 우선
            return { tier: 1, key: (etd != null ? etd : eta) };                // 끝남: ETD 최신 우선
          };
          candidates.sort((a, b) => {
            const sa = _score(a), sb = _score(b);
            if (sa.tier !== sb.tier) return sa.tier - sb.tier;
            return sb.key - sa.key;
          });
          // 베스트 후보 선택
          let best = null;
          if (candidates.length === 1) {
            best = candidates[0];
          } else if (candidates.length > 1 && dictName) {
            // vesselName 매칭으로 정확한 후보 선택
            for (const entry of candidates) {
              const pn = String(entry[1].vesselName || '').toUpperCase().replace(/\s+/g, '');
              if (!pn || pn.length < 4) continue;
              // 베이사전 name 안에 vesselName 일부가 포함되는지
              if (dictName.includes(pn.slice(0, 5)) || pn.includes(dictName.slice(4, 4 + Math.min(pn.length, 8)))) {
                best = entry;
                break;
              }
            }
            // vesselName 매칭 못 찾으면 berth 있는 (M5.82 이후 새 데이터) 우선
            if (!best) {
              best = candidates.find(([k, p]) => p.berth) || candidates[0];
            }
          } else if (candidates.length > 1) {
            // dictName 없으면 berth 있는 새 데이터 우선
            best = candidates.find(([k, p]) => p.berth) || candidates[0];
          }
          if (best && _nameMatchesPm(best[1])) { pm = best[1]; matchedBy = 'callsign-prefix'; matchedKey = best[0]; }
        }
        // 3) IMO 매칭 (PORT-MIS 데이터에 IMO 컬럼 없을 수도 있어 보조)
        if (!pm && dictImo && /^\d{7}$/.test(dictImo)) {
          const entry = Object.entries(portMisData).find(([k, p]) => p.imo === dictImo);
          if (entry) { pm = entry[1]; matchedBy = 'imo'; matchedKey = entry[0]; }
        }
        // 4) 선박명 부분 매칭 fallback
        // M5.87: vslFull (EDI 추출 풀네임) 우선, 그 다음 vsl (사용자 입력 약자)
        if (!pm && (vslFull || vsl)) {
          const searchVsl = vslFull || vsl;
          const entry = Object.entries(portMisData).find(([k, p]) => {
            const pn = (p.vesselName || '').toUpperCase();
            return pn && (searchVsl.includes(pn) || pn.includes(searchVsl));
          });
          if (entry) { pm = entry[1]; matchedBy = 'name'; matchedKey = entry[0]; }
        }
        // 5) M5.71 — 선박명 정규화 매칭 (공백/특수문자 제거 + 부분 단어)
        // M5.87: vslFull 우선 사용
        if (!pm && (vslFull || vsl)) {
          const searchVsl = (vslFull || vsl).toUpperCase().replace(/[\s\-_\.]/g, '');
          const entry = Object.entries(portMisData).find(([k, p]) => {
            const pn = (p.vesselName || '').toUpperCase().replace(/[\s\-_\.]/g, '');
            if (!pn) return false;
            return pn.length >= 5 && searchVsl.length >= 5 && (pn.includes(searchVsl.slice(0,5)) || searchVsl.includes(pn.slice(0,5)));
          });
          if (entry) { pm = entry[1]; matchedBy = 'name-norm'; matchedKey = entry[0]; }
        }
        // 6) M5.72 — 베이사전 풀네임 매칭 (앱: 약자 DJCF / PORT-MIS: 풀네임 DONGJIN CONFIDENT)
        // V7.99-13 (버그수정): 기존 두 번째 조건 `pn.includes(dictNameNorm.slice(4, 4+8))`이
        //   너무 느슨해 무관한 선박이 오매칭됨(DXQD에 "그린오션호" 매칭 → 삭제해도 또 다른 오매칭).
        //   → 한쪽이 다른 쪽을 "통째로" 포함할 때만(진짜 약자↔풀네임 관계). 부분 슬라이스 매칭 제거.
        //   추가 가드: 포함되는 쪽 문자열이 충분히 길어야(≥5) 우연한 짧은 겹침 차단.
        if (!pm && dictData?.name) {
          const dictNameNorm = String(dictData.name).toUpperCase().replace(/\s+/g, '');
          const entry = Object.entries(portMisData).find(([k, p]) => {
            const pn = (p.vesselName || '').toUpperCase().replace(/\s+/g, '');
            if (!pn || pn.length < 5 || dictNameNorm.length < 5) return false;
            // 양방향 전체 포함만 인정 (긴 쪽이 짧은 쪽을 통째로 품을 때).
            //   예: dict="DONGJINCONFIDENT" ⊇ pn="DONGJINCONFIDENT", 또는 약자↔풀네임 통짜 포함.
            return dictNameNorm.includes(pn) || pn.includes(dictNameNorm);
          });
          if (entry) { pm = entry[1]; matchedBy = 'dict-fullname'; matchedKey = entry[0]; }
        }

        // M5.90: 매칭 결과를 후처리 — 평택 우선, 평택 없으면 인천 fallback 표시
        //   - 같은 선박이 평택 + 인천 둘 다 있으면 평택 데이터 사용
        //   - 평택만 없으면 인천 데이터 사용하되 "인천 출항 정보" 명시
        let fallbackInfo = null;  // { fromPort, etd } 평택 외 항만의 출항 정보
        if (pm) {
          const isPyeongtaek = (p) => {
            const port = (p?.port || '').toUpperCase().trim();
            return !port || port === '평택' || port === '평택항' || port === 'PYEONGTAEK';
          };
          // 매칭 결과가 평택이 아니면 같은 선박의 평택 데이터 검색
          if (!isPyeongtaek(pm)) {
            const matchedCs = (pm.callsign || '').toUpperCase();
            const matchedName = String(pm.vesselName || '').toUpperCase().replace(/\s+/g, '');
            const pyeongtaekEntry = Object.entries(portMisData).find(([k, p]) => {
              if (!p || k === matchedKey) return false;
              if (!isPyeongtaek(p)) return false;
              const pcs = (p.callsign || '').toUpperCase();
              const pn = String(p.vesselName || '').toUpperCase().replace(/\s+/g, '');
              // 콜사인 매칭
              if (pcs && matchedCs) {
                if (pcs === matchedCs) return true;
                if (pcs.length >= 4 && matchedCs.length >= 4 &&
                    (pcs.startsWith(matchedCs) || matchedCs.startsWith(pcs))) return true;
              }
              // 선박명 매칭
              if (pn && matchedName && pn.length >= 5 && matchedName.length >= 5 &&
                  (pn.includes(matchedName.slice(0, 5)) || matchedName.includes(pn.slice(0, 5)))) {
                return true;
              }
              return false;
            });
            if (pyeongtaekEntry) {
              // 평택 데이터 발견 → 그것을 메인으로 사용
              fallbackInfo = { fromPort: pm.port, etd: pm.etd, eta: pm.eta };
              pm = pyeongtaekEntry[1];
              matchedKey = pyeongtaekEntry[0];
              matchedBy += '+pyeongtaek-pref';
            } else {
              // 평택 데이터 없음 → 인천 등 외부 항만 정보 사용
              fallbackInfo = { fromPort: pm.port, etd: pm.etd, eta: pm.eta, isFallback: true };
            }
          }
        }

        // M5.71: 매칭 실패 시 디버그 카드 (어떤 선박이 안 잡히는지 보여줌)
        if (!pm) {
          if (Object.keys(portMisData).length === 0) return null;
          // 현재 항차와 비슷한 PORT-MIS 후보 찾기
          const candidates = Object.values(portMisData).slice(0, 3).map(p =>
            `${p.vesselName || '?'} (${p.callsign || 'no-callsign'})`
          ).join(', ');
          return (
            <div className="mb-3 bg-orange-950/40 border border-orange-700/50 rounded-lg px-3 py-2 text-xs">
              <span className="text-orange-300 font-bold">⚠ PORT-MIS 매칭 미확인</span>
              <span className="text-slate-300 ml-2">선박명: <b>{vsl}</b> · 콜사인: <b>{dictCallsign || '없음'}</b></span>
              <div className="text-slate-400 mt-1">PORT-MIS 후보: {candidates}</div>
              <div className="text-slate-500 text-[10px] mt-0.5">베이사전 callsign 또는 선박명을 PORT-MIS와 일치시키면 자동 매칭됩니다</div>
            </div>
          );
        }
        const fmtDT = (s) => {
          if (!s) return '-';
          const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
          return m ? `${m[2]}/${m[3]} ${m[4]}:${m[5]}` : s;
        };
        // M5.82: PORT-MIS의 berth/pier를 voyage.info에 자동 저장
        //   - voyage.info의 berth/pier가 PORT-MIS와 다르면 갱신 (선박 부두 이동 대응)
        //   - 다른 검수원도 즉시 공유 (Firebase 동기화)
        //   - voucher의 PIER/BERTH 자동 채움 효과
        // M6.13: 잘못된 berth 값 (MBM 등 코드) 검증 + 자동 정리
        // M6.18c: utils.js의 isValidBerth 사용 (블랙리스트 방식)
        //   확장 v1.0.0 또는 옛 PORT-MIS 파서가 "MBM" 같은 시설 코드를 berth로 저장한 경우 정리
        if (pm.berth && voyage?.info) {
          const currentBerth = voyage.info.berth || '';
          const currentPier = voyage.info.pier || '';
          const pmBerthValid = isValidBerth(pm.berth);
          const currentBerthInvalid = currentBerth && !isValidBerth(currentBerth);
          // 케이스 1: pm.berth가 잘못된 형식 (MBM 등) → 갱신 skip
          // 케이스 2: pm.berth가 정상 + currentBerth가 잘못된 형식 → 갱신
          // 케이스 3: 둘 다 정상 + 다른 값 → 갱신
          // 케이스 4: currentBerth가 잘못된 형식 + pm.berth 없음 → Firebase 정리 (berth: null)
          if (pmBerthValid) {
            const needsUpdate = (currentBerth !== pm.berth) ||
                                (pm.pier && currentPier !== pm.pier);
            if (needsUpdate) {
              const patch = {};
              if (currentBerth !== pm.berth) patch.berth = pm.berth;
              if (pm.pier && currentPier !== pm.pier) patch.pier = pm.pier;
              fbUpdateVoyageInfo(voyageKey, patch).catch(e =>
                console.warn('[M6.13] voyage.info berth 자동 저장 실패:', e)
              );
            }
          } else if (currentBerthInvalid) {
            // 옛 잘못된 값 정리 — berth, pier 둘 다 초기화 (사용자가 엑셀 재업로드 시 정상 채워짐)
            fbUpdateVoyageInfo(voyageKey, { berth: '', pier: '' }).catch(e =>
              console.warn('[M6.13] voyage.info berth 자동 정리 실패:', e)
            );
          }
        } else if (voyage?.info?.berth && !isValidBerth(voyage.info.berth)) {
          // pm 없어도 voyage.info.berth가 잘못된 형식이면 정리
          fbUpdateVoyageInfo(voyageKey, { berth: '', pier: '' }).catch(e =>
            console.warn('[M6.13] voyage.info berth 자동 정리 실패:', e)
          );
        }
        // V8.09-11/14: 선박 현재 상태 판정. ETD 지나도 작업 미완료면 '일정 미확정'(입항지연 등).
        //   작업 진행률(현재 모드 기준 완료/전체)을 함께 넘겨 '출항함'을 작업 완료 시에만 판정.
        const _wkTotal = containers.length;
        const _wkDone = containers.filter(c => compMap[c.cn]).length;
        const shipSt = getShipStatus(pm, Date.now(), { done: _wkDone, total: _wkTotal });
        const toneClass = {
          sailing: 'bg-sky-900/50 border-sky-700/50 text-sky-200',
          berthed: 'bg-emerald-900/40 border-emerald-700/50 text-emerald-200',
          departed: 'bg-slate-700/60 border-slate-600/50 text-slate-300',
          unsure: 'bg-amber-900/40 border-amber-600/50 text-amber-200',
          unknown: 'bg-slate-700 border-slate-600 text-slate-300',
        }[shipSt.tone] || 'bg-slate-700 text-slate-300';
        return (
          <div className="mb-3 bg-cyan-950/40 border border-cyan-700/50 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-cyan-300 font-bold">⚓ PORT-MIS</span>
              {/* V8.09-11: 평택 정박중 + 부두 있음 → 부두 배지 */}
              {shipSt.showBerth && pm.pier === 'PCTC' && pm.berth && (
                <span className="bg-blue-900/60 border border-blue-700/50 text-blue-200 px-2 py-0.5 rounded font-bold text-xs">
                  📍 PCTC · {formatBerth(pm.berth)}
                </span>
              )}
              {shipSt.showBerth && pm.pier === 'PNCT' && pm.berth && (
                <span className="bg-purple-900/60 border border-purple-700/50 text-purple-200 px-2 py-0.5 rounded font-bold text-xs">
                  📍 PNCT · {formatBerth(pm.berth)}
                </span>
              )}
              {shipSt.showBerth && !pm.pier && pm.berth && (
                <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-xs">
                  📍 {formatBerth(pm.berth)}
                </span>
              )}
              {/* 평택 정박중인데 부두 없음 → 옛 데이터 경고 */}
              {shipSt.showBerth && !pm.berth && !fallbackInfo?.isFallback && (
                <span className="bg-red-900/40 border border-red-700/40 text-red-300 px-2 py-0.5 rounded text-xs font-bold">
                  ⚠ 부두 정보 없음 (옛 데이터)
                </span>
              )}
              {/* 평택 정박중이 아니면 상태 라벨 (항해중·출항·타항만) */}
              {!shipSt.showBerth && !fallbackInfo?.isFallback && (
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${toneClass}`}>
                  {shipSt.label}
                </span>
              )}
              <span className="text-slate-200">
                입항 <span className="font-bold text-emerald-300">{fmtDT(pm.eta)}</span>
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-200">
                출항 <span className="font-bold text-amber-300">{fmtDT(pm.etd)}</span>
              </span>
              {pm.voyageType && <span className="text-slate-400 text-xs">[{pm.voyageType}]</span>}
            </div>
            {/* V9.33: 평택도선사회 도선 예보 (사용자 확정 2026-08-01 — "포트미스는 예보 성격,
                도선사협회는 확정과 비슷"). PORT-MIS 값을 덮지 않고 아래 줄에 확정시각으로 함께 표시. */}
            {(() => {
              const pf = pilotForecast[(voyage?.info?.vsl || '').toUpperCase()];
              if (!pf || (!pf.nextDep && !pf.nextArr)) return null;
              const fmtPf = (v) => {
                if (!v) return '';
                const [d, t] = String(v).split(' ');
                return `${(d || '').slice(5)} ${t || ''}`.trim();
              };
              return (
                <div className="mt-1 flex items-center gap-2 flex-wrap text-sm bg-sky-950/50 border border-sky-800/50 rounded px-2 py-1">
                  <span className="text-sky-300 font-bold text-xs">⚓ 도선 예보</span>
                  {pf.nextArr && (
                    <span className="text-slate-200">
                      입항 <span className="font-bold text-emerald-300">{fmtPf(pf.nextArr)}</span>
                      {pf.nextArrBerth && <span className="text-slate-400 text-xs ml-1">({pf.nextArrBerth})</span>}
                    </span>
                  )}
                  {pf.nextArr && pf.nextDep && <span className="text-slate-500">·</span>}
                  {pf.nextDep && (
                    <span className="text-slate-200">
                      출항 <span className="font-bold text-amber-300">{fmtPf(pf.nextDep)}</span>
                      {pf.nextDepBerth && <span className="text-slate-400 text-xs ml-1">({pf.nextDepBerth})</span>}
                    </span>
                  )}
                  <span className="text-sky-400/70 text-[10px]">평택도선사회 · 확정에 가까움</span>
                </div>
              );
            })()}
            {/* M5.90: 평택 데이터 없음 — 인천/타항만 출항 정보 fallback */}
            {fallbackInfo?.isFallback && (
              <div className="mt-1 bg-amber-950/50 border border-amber-700/50 rounded px-2 py-1 text-xs">
                <span className="text-amber-300 font-bold">⚠ 평택 PORT-MIS 등록 없음</span>
                <span className="text-amber-200 ml-2">
                  → <b>{fallbackInfo.fromPort}</b> 출항 <b>{fmtDT(fallbackInfo.etd)}</b> 정보로 평택 도착 예상 표시
                </span>
              </div>
            )}
            {/* M5.83: 매칭 진단 정보 (작은 글씨로 카드 아래) */}
            <div className="text-[10px] text-slate-500 mt-1 font-mono flex gap-3 flex-wrap">
              <span>매칭: <span className="text-cyan-400">{matchedBy}</span></span>
              <span>키: <span className="text-amber-400">{matchedKey || '?'}</span></span>
              <span>선박명: <span className="text-emerald-400">{pm.vesselName || '?'}</span></span>
              <span>저장: <span className="text-purple-400">{pm.updatedAt ? new Date(pm.updatedAt).toLocaleString('ko-KR', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '?'}</span></span>
              {!pm.berth && !fallbackInfo?.isFallback && (
                <button
                  onClick={async () => {
                    // V7.99-13: 삭제 확인에 선박명 명시. 오매칭(엉뚱한 배)이 잡혔을 때
                    //   키 번호만 보면 무슨 배인지 모르고 멀쩡한 데이터를 지우는 사고가 남.
                    if (!confirm(`PORT-MIS 데이터를 Firebase에서 삭제하시겠습니까?\n\n선박명: ${pm.vesselName || '?'}\n키: ${matchedKey}\n\n⚠ 이 선박명이 지금 작업 중인 배(${vsl})와 다르면, 잘못 매칭된 다른 배입니다. 그 경우 삭제하지 말고 새 PORT-MIS 엑셀을 업로드하세요.`)) return;
                    try {
                      const { ref, remove } = await import('firebase/database');
                      const { db } = await import('../firebase.js');
                      await remove(ref(db, `port_mis_data/${matchedKey}`));
                      alert(`✓ ${matchedKey} 삭제 완료. 화면 새로고침하세요.`);
                    } catch (e) {
                      alert(`삭제 실패: ${e.message}`);
                    }
                  }}
                  className="text-red-400 hover:text-red-300 underline"
                >
                  🗑 이 옛 데이터 삭제
                </button>
              )}
            </div>
          </div>
        );
      })()}


      {/* M5.1 G: 작업 마감 체크리스트 */}
      <WorkClosingChecklist
        open={closingOpen}
        voyage={voyage}
        mode={mode}
        onClose={() => setClosingOpen(false)}
        onJump={(target) => {
          // target: { tab, filter?, search? }
          if (target.tab) setTab(target.tab);
          if (target.filter) setListFilter(target.filter);   // V9.14: reeferTemp 필터 추가 — 리퍼 온도 미입력만
        }}
      />
    </div>
  );
}

// === 리스트 탭 ===
function ListTab({ voyageKey, mode, containers, ediMap, recMap, xrayMap, xraySeals, compMap, inspector, onOpenContainer, externalFilter, shiftingList = [] }) {
  const [filter, setFilter] = useState('all'); // all | done | undone | xray
  const [search, setSearch] = useState('');

  // M5.1: 외부 filter (마감 체크리스트 점프) 동기화
  useEffect(() => {
    if (externalFilter && externalFilter !== filter) setFilter(externalFilter);
  }, [externalFilter]);

  // TallyOne 1.3: 조회 기록 — 이 검색창은 라이브 필터라 확정 버튼이 없다.
  //   타이핑 멈춤을 확정으로 본다(판정·중복 생략은 activityLog가 담당, 타이핑마다 기록 아님).
  useEffect(() => { logQuerySettled('lookup', search, { voyageKey, mode }); }, [search, voyageKey, mode]);

  const filtered = useMemo(() => {
    let arr = containers;
    if (filter === 'done') arr = arr.filter(c => compMap[c.cn]);
    else if (filter === 'undone') arr = arr.filter(c => !compMap[c.cn]);
    else if (filter === 'xray') arr = arr.filter(c => xrayMap[c.cn]);
    // V9.14: 마감 점검 「리퍼 온도 미입력」 점프용 — Full 리퍼인데 온도 빈 것만 (판정은 체크리스트와 동일)
    else if (filter === 'reeferTemp') arr = arr.filter(c =>
      (c.rf || /^..R/.test(c.iso || '')) && !c.rfdry && !c.mkcon &&
      (c.fe === 'F' || c.fe === '' || c.fe == null) && (!c.tmp || String(c.tmp).trim() === ''));
    if (search) {
      const q = search.toUpperCase();
      arr = arr.filter(c => c.cn?.includes(q) || c.l4?.includes(q) || c.bay?.includes(q));
    }
    return arr;
  }, [containers, filter, search, compMap, xrayMap]);

  const stats = useMemo(() => ({
    total: containers.length,
    done: containers.filter(c => compMap[c.cn]).length,
    xray: mode === 'discharge' ? containers.filter(c => xrayMap[c.cn]).length : 0,
  }), [containers, compMap, xrayMap, mode]);

  const handleExport = () => {
    exportSectionToCSV(voyageKey, mode, containers, compMap, xrayMap, xraySeals);
  };

  return (
    <div className="space-y-3">
      <ValidationBox
        ediContainers={Object.values(ediMap)}
        records={Object.values(recMap)}
        mode={mode}
        shiftingList={shiftingList}
        voyageKey={voyageKey}
      />

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value.toUpperCase())}
            placeholder="끝4자리 / 컨번호 / 베이"
            className="w-full bg-slate-800 border border-slate-700 rounded pl-8 pr-2 py-1.5 text-sm mono focus:outline-none focus:border-amber-500"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"><X className="w-4 h-4"/></button>}
        </div>
        <button
          onClick={handleExport}
          className="bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700/40 text-emerald-200 px-2 py-1.5 rounded text-xs font-bold flex items-center gap-1"
          title="CSV 내보내기"
        >
          <Download className="w-3.5 h-3.5"/>CSV
        </button>
      </div>

      <div className="flex gap-1 flex-wrap text-[11px]">
        {[
          { k: 'all', t: `전체 ${stats.total}` },
          { k: 'undone', t: `미완 ${stats.total - stats.done}` },
          { k: 'done', t: `완료 ${stats.done}` },
          ...(mode === 'discharge' ? [{ k: 'xray', t: `🔍 X-RAY ${stats.xray}` }] : []),
        ].map(({ k, t }) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-2.5 py-1 rounded font-bold ${
              filter === k ? 'bg-amber-700 text-amber-100' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}>{t}</button>
        ))}
      </div>

      <ContainerList
        list={filtered}
        compMap={compMap}
        xrayMap={xrayMap}
        xraySeals={xraySeals}
        mode={mode}
        voyageKey={voyageKey}
        inspector={inspector}
        onOpenContainer={onOpenContainer}
      />

      {/* V8.98-05: 쉬프팅(재적부) 목록 — 통과화물이라 검수 완료 대상은 아니지만 크레인 작업 확인용 */}
      {shiftingList.length > 0 && (
        <div className="mt-3 bg-slate-900 border border-blue-800/50 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-blue-950/60 text-blue-200 text-[12px] font-black flex items-center gap-1.5">
            <span className="text-blue-400">◆</span> 쉬프팅(재적부) {shiftingList.length}
            <span className="ml-auto text-[10px] font-normal text-slate-500">통과화물 위치 이동 — 양하·선적 공통</span>
          </div>
          <div className="divide-y divide-slate-800">
            {shiftingList.map(sc => (
              <div key={sc.cn} className="px-3 py-1.5 flex items-center gap-2 text-[12px]">
                <span className="mono font-bold text-slate-200">{sc.cn}</span>
                <span className="text-slate-500">{sc.iso}</span>
                {sc.pod && <span className="text-slate-500">{sc.pod}</span>}
                <span className="ml-auto mono text-blue-300">{sc.from} → {sc.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 옛 BayTab 제거 (BayPlan 컴포넌트로 대체됨)

// === LOLO 탭 (V8.06) ===
// RIZHAO ORIENT 등 RORO/LOLO 혼용선 전용. 베이 그림 없이 리스트로 검수.
//   기존 ContainerList·ContainerDetailModal·firebase 함수를 그대로 재사용.
//   "조회·실체크한 것만 누적" — 검수사가 실제 처리(완료)한 컨만 누적분으로 모음.
function LoloTab({ voyageKey, mode, containers, compMap, xrayMap, xraySeals, inspector, onOpenContainer }) {
  const [filter, setFilter] = useState('all'); // all | done(누적) | undone
  const [search, setSearch] = useState('');

  // TallyOne 1.3: 조회 기록 — ListTab과 같은 기준(타이핑 멈춤 = 조회 확정 1회)
  useEffect(() => { logQuerySettled('lookup', search, { voyageKey, mode }); }, [search, voyageKey, mode]);

  const filtered = useMemo(() => {
    let arr = containers;
    if (filter === 'done') arr = arr.filter(c => compMap[c.cn]);
    else if (filter === 'undone') arr = arr.filter(c => !compMap[c.cn]);
    if (search) {
      const q = search.toUpperCase();
      arr = arr.filter(c => c.cn?.includes(q) || c.l4?.includes(q));
    }
    return arr;
  }, [containers, filter, search, compMap]);

  const stats = useMemo(() => ({
    total: containers.length,
    done: containers.filter(c => compMap[c.cn]).length,
  }), [containers, compMap]);

  // 규격별 누적 집계 (제출 양식 하단 합계와 동일 기준)
  const sizeStats = useMemo(() => {
    const acc = { '20': 0, '40': 0, '45': 0 };
    containers.filter(c => compMap[c.cn]).forEach(c => {
      const lbl = isoToLabel(c.iso) || '';
      if (lbl.startsWith('20')) acc['20']++;
      else if (lbl.startsWith('45')) acc['45']++;
      else acc['40']++;
    });
    return acc;
  }, [containers, compMap]);

  return (
    <div className="space-y-3">
      <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-3 py-2 text-[12px] text-cyan-200">
        <b>LOLO 검수</b> — 베이 없이 리스트로 작업합니다. 컨테이너를 조회해 실체크·데미지·확인하면 누적분에 모입니다.
        <div className="mt-1 text-cyan-300/80">
          누적 {stats.done} / 전체 {stats.total}
          <span className="ml-2 text-cyan-400/70">(20′ {sizeStats['20']} · 40′ {sizeStats['40']} · 45′ {sizeStats['45']})</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value.toUpperCase())}
            placeholder="끝4자리 / 컨번호"
            className="w-full bg-slate-800 border border-slate-700 rounded pl-8 pr-2 py-1.5 text-sm mono focus:outline-none focus:border-cyan-500"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"><X className="w-4 h-4"/></button>}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap text-[11px]">
        {[
          { k: 'all', t: `전체 ${stats.total}` },
          { k: 'undone', t: `미처리 ${stats.total - stats.done}` },
          { k: 'done', t: `누적(처리) ${stats.done}` },
        ].map(({ k, t }) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-2.5 py-1 rounded font-bold ${
              filter === k ? 'bg-cyan-700 text-cyan-100' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}>{t}</button>
        ))}
      </div>

      <ContainerList
        list={filtered}
        compMap={compMap}
        xrayMap={xrayMap}
        xraySeals={xraySeals}
        mode={mode}
        voyageKey={voyageKey}
        inspector={inspector}
        onOpenContainer={onOpenContainer}
      />
    </div>
  );
}

// === 자료 탭 ===
function DataTab({ voyageKey, mode, voyage, setMode, inspector }) {
  const [status, setStatus] = useState('');
  // M3.5.4-fix2: 업로드 충돌 검토 모달
  const [conflictData, setConflictData] = useState(null);
  // M3.74: prompt() 대체 - 카드형 3택 모달
  const [choiceState, askChoice] = useChoice();
  // M6.14a: STOWAGE PDF 자동 분석 검토 모달 — DataTab 스코프에서만 사용
  const [stowagePdfFile, setStowagePdfFile] = useState(null);
  // M6.42: 일괄 STOWAGE PDF 등록 모달
  const [bulkStowageOpen, setBulkStowageOpen] = useState(false);
  // M6.47: 일괄 ASC 등록 모달 (Gemini 0)
  const [bulkAscOpen, setBulkAscOpen] = useState(false);
  // M6.93.1: 신규 선박 베이 매트릭스 빌더 (EDI + 사전 + PDF + 사용자 폼)
  const [matrixBuilderOpen, setMatrixBuilderOpen] = useState(false);
  const ediRef = useRef(null);
  const listRef = useRef(null);
  const cameraRef = useRef(null);
  const xrayRef = useRef(null);
  const sec = voyage[mode] || {};

  // M5.11: 보관된 EDI 원본 메타데이터 (재처리 가능 여부)
  const [rawMeta, setRawMeta] = useState(null);
  useEffect(() => {
    let alive = true;
    fbGetEdiRaw(voyageKey, mode).then(d => {
      if (alive) setRawMeta(d);
    }).catch(() => {});
    return () => { alive = false; };
  }, [voyageKey, mode]);

  // M5.11: EDI 원본 재처리 — 앱 업데이트 후 자료 재업로드 없이 새 로직 적용
  //   1. 보관된 원본 텍스트 가져옴
  //   2. ----- FILE: ... ----- 구분자로 분할
  //   3. 각 텍스트를 parseBAPLIE/parseAscFile로 다시 파싱
  //   4. ediContainers 덮어쓰기 (records, completed, xrayList 등은 보존)
  const handleReprocess = async () => {
    if (!rawMeta?.text) {
      alert('보관된 EDI 원본이 없습니다.\n다음 EDI 업로드부터 자동으로 보관됩니다.');
      return;
    }
    if (!confirm(
      `보관된 EDI 원본(${(rawMeta.sizeBytes/1024).toFixed(1)}KB)을 현재 앱 로직으로 다시 파싱합니다.\n\n` +
      `· EDI 컨테이너 데이터(베이/위치/POL/POD)는 새로 파싱됨\n` +
      `· 검수원 입력 데이터(실번호/완료/사진/X-RAY)는 보존됨\n` +
      `· 진행 중 작업에 영향 없음\n\n` +
      `진행하시겠습니까?`
    )) return;

    try {
      setStatus('🔄 EDI 원본 재파싱 중...');
      const text = rawMeta.text;
      // 파일 구분자로 분할
      const sections = text.split(/----- FILE: ([^-]+) -----\n/).filter(s => s.trim());
      // 짝수 인덱스: 파일명, 홀수: 내용 (split 결과)
      const files = [];
      for (let i = 0; i < sections.length; i += 2) {
        files.push({ name: sections[i].trim(), text: sections[i + 1] || '' });
      }
      if (files.length === 0) {
        // 구분자 없는 단일 텍스트 (이전 형식)
        files.push({ name: rawMeta.fileName || 'edi', text });
      }

      const allCns = {};
      const messages = [];
      for (const f of files) {
        const isAsc = /\.asc$/i.test(f.name) || /^\$604/.test(f.text.slice(0, 10));
        const r = isAsc ? parseAscFile(f.text) : parseBAPLIE(f.text);
        r.containers.forEach(c => {
          const podPtk = isPyeongtaekPort(c.pod);
          const polPtk = isPyeongtaekPort(c.pol);
          let containerMode;
          if (mode === 'discharge') {
            containerMode = podPtk ? 'discharge' : 'transit';
          } else {
            containerMode = polPtk ? 'loading' : 'transit';
          }
          const key = c.cn && c.cn.length === 11 ? c.cn : `__SLOT_${c.bay}_${c.row}_${c.tier}`;
          allCns[key] = { ...c, _slotKey: key, _mode: containerMode };
        });
        messages.push(`${f.name}: ${r.containers.length}대`);
      }

      // ediContainers 덮어쓰기 (records 등은 그대로)
      // V9.06-05: 0대 가드 — 빈 파싱 결과로 기존 노드를 지우지 않는다 (TNJP 26352E 리퍼 사건 2026-07-24).
      //   보관 raw가 손상·타형식(ASC 인코딩 깨짐 등)이면 파싱이 0대가 되는데, 그대로 저장하면
      //   chunkedReplace가 노드를 삭제해 살아있던 EDI 158대가 증발했다. 0대면 저장 없이 중단.
      if (Object.keys(allCns).length === 0) {
        setStatus(`❌ 재처리 중단 — 파싱 결과 0대 (${messages.join(', ')}). 기존 EDI 데이터는 보존했습니다.\nEDI 파일을 다시 업로드해 주세요.`);
        return;
      }
      await fbSaveEdiContainers(voyageKey, mode, allCns);
      setStatus(`✅ 재처리 완료 — ${messages.join(', ')}\n검수 입력 데이터(실번호 등)는 보존됨`);
    } catch (e) {
      setStatus(`❌ 재처리 실패: ${e?.message || e}`);
    }
  };

  const handleEdiUpload = async (files) => {
    if (!files || files.length === 0) return;
    setStatus(`${files.length}개 파일 처리 중...`);
    const results = [];
    let allCns = {};
    let shipInfo = null;          // EDI에서 추출한 선박 정보
    let allEdiContainers = [];    // 베이 분석용 (평택 필터 X 전체)
    let prevStruct = null;        // 기존 학습된 구조

    // M4.4: .def 파일 분리 처리 — 컨테이너 데이터 없음, 베이사전만 등록
    // M6.14: STOWAGE PDF도 분리 처리 — Gemini Vision으로 베이 구조 추출
    const defFiles = [];
    const stowagePdfFiles = [];  // M6.14
    const ediCandidates = [];
    for (const file of Array.from(files)) {
      const isDefByExt = /\.def$/i.test(file.name);
      if (isDefByExt) {
        defFiles.push(file);
        continue;
      }
      // 매직 바이트로 .def 추가 검사 (확장자 다른 경우 대비)
      try {
        const head = await file.slice(0, 21).arrayBuffer();
        const headBytes = new Uint8Array(head);
        if (isCaspDefFile(headBytes)) {
          defFiles.push(file);
          continue;
        }
      } catch (e) { console.warn('[파일판별] .def 매직바이트 검사 실패 — 일반 파일로 계속 진행:', file.name, e); }  // V9.57: 조용한 실패 금지

      // M6.14a (핫픽스): 파일명 키워드만으로 즉시 판별 — PDF.js 텍스트 추출 안 함
      //   이유: 양하 리스트 PDF(50+페이지)에서 extractPdfText가 수십 초 블로킹 → 먹통 현상
      //   STOWAGE PDF는 파일명에 STOWAGE/LOAD/PLAN/답안지 키워드 사용 권장
      //   파일명 매칭 안 되면 별도 [📄 STOWAGE PDF 등록] 버튼으로 명시적 처리
      const isPdfByExt = /\.pdf$/i.test(file.name);
      if (isPdfByExt) {
        try {
          const { isStowagePdf } = await import('../mixerUpload.js');
          if (isStowagePdf(file.name)) {
            stowagePdfFiles.push(file);
            continue;
          }
        } catch (e) {
          // 판별 실패 → 일반 EDI 후보로 진행
        }
      }

      ediCandidates.push(file);
    }

    // M6.14: STOWAGE PDF 처리 — 첫 번째 파일만 모달로 열기 (사용자 검토)
    //   여러 PDF면 사용자가 하나씩 처리하도록 (정확성 우선)
    if (stowagePdfFiles.length > 0) {
      setStowagePdfFile(stowagePdfFiles[0]);
      if (stowagePdfFiles.length > 1) {
        results.push(`📄 STOWAGE PDF ${stowagePdfFiles.length}개 검출 — 첫 번째 처리 후 나머지는 다시 업로드해주세요`);
      } else {
        results.push(`📄 STOWAGE PDF 자동 분석 시작: ${stowagePdfFiles[0].name}`);
      }
    }

    // .def 파일 먼저 처리 (베이사전 등록)
    for (const file of defFiles) {
      try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const analysis = analyzeDefFile(bytes);
        const entry = analysisToBayDictEntry(analysis, file.name);
        // 1단계: localStorage 저장 (기존)
        const saved = addToUserBayDict(entry);
        // M5.88: 2단계 — Firebase에도 동시 저장 (모든 검수원 공유)
        let fbSaved = false;
        try {
          const { fbSaveShipBayDict } = await import('../firebase.js');
          fbSaved = await fbSaveShipBayDict(entry.code, {
            ...entry,
            source: 'def-upload',
            _inspector: inspector || '',
          });
        } catch (e) {
          console.warn('[M5.88] Firebase 베이사전 저장 실패:', e);
        }
        const verifiedMark = saved ? '✅' : '⚠️';
        const fbMark = fbSaved ? '☁' : '';
        results.push(
          `${verifiedMark} 📚 ${file.name}: ${analysis.header.vesselName} — ` +
          `${analysis.bayCount}개 베이, ${analysis.structure.sectionCount}섹션 ` +
          `(트리오 ${analysis.structure.trios.length}, 단독 ${analysis.structure.standalone.length}) ` +
          `→ 베이사전 등록${saved ? '됨' : ' 실패'}${fbMark ? ` ${fbMark} 클라우드 동기화` : ''}`
        );
      } catch (e) {
        results.push(`❌ ${file.name} (.def): ${e.message}`);
      }
    }

    // M5.11: EDI 원본 텍스트 누적 — 미래 [🔄 자료 재처리]를 위한 보관
    const rawEdiTexts = [];
    const rawEdiFileNames = [];

    // M7.14: 선박 통계용 평택분 누적 (화면 mode 의존 제거 — EDI 자동 판정 기준)
    //   양하/선적 한쪽만 0으로 박히던 버그 root cause: fbAddShipStats가 화면 mode + 전체 대수(통과 포함)를 썼음.
    //   여기서 EDI 내용으로 판정한 ediKind 기준 평택(PTK)분만 양/적하로 따로 누적.
    let statDischargePtk = 0;
    let statLoadingPtk = 0;

    for (const file of ediCandidates) {
      try {
        const text = await file.text();
        // M5.11: 원본 보관 (BAPLIE/ASC 모두)
        rawEdiTexts.push(text);
        rawEdiFileNames.push(file.name);
        const isAsc = /\.asc$/i.test(file.name) || /^\$604/.test(text.slice(0, 10));
        const r = isAsc ? parseAscFile(text) : parseBAPLIE(text);
        const total = r.containers.length;

        // ===== V8.24-03: 다른 선박/항차 EDI 차단 (사용자 확정 2026-06-24) =====
        //   다른 배 EDI나 항차 안 맞는 EDI를 넣어도 경고 없이 적용되던 위험 버그 차단.
        //   선박: 콜사인(확실) 우선, 없으면 '진짜 선박명'끼리만 비교(코드형 쓰레기값 CNYNT 등은 비교 제외).
        //   항차: 양하 EDI는 voy_d, 선적 EDI는 voy_l 과 대조(평택분 기준 ediKind 자동판정).
        //         항차 안 맞으면 적용 안 함 — 평택분 있으면 "파일명 항차 고쳐 재등록" 유도, 없으면 다른 항차로 차단.
        {
          const _norm = (x) => String(x || '').toUpperCase().replace(/[\s\-_.]/g, '');
          const _looksName = (x) => /\s/.test(String(x || '').trim()) || _norm(x).length >= 7;
          const _voyCs = _norm(voyage.info.callsign), _ediCs = _norm(r.callsign);
          const _voyNm = _norm(voyage.info.vslFull), _ediNm = _norm(r.vsl);
          let _shipBad = '';
          if (_voyCs && _ediCs && _voyCs !== _ediCs) {
            _shipBad = `콜사인 ${voyage.info.callsign} ≠ EDI ${r.callsign}`;
          } else if (_voyNm && _ediNm && _looksName(voyage.info.vslFull) && _looksName(r.vsl)
                     && !(_voyNm.includes(_ediNm.slice(0, 5)) || _ediNm.includes(_voyNm.slice(0, 5)))) {
            _shipBad = `선박명 ${voyage.info.vslFull} ≠ EDI ${r.vsl}`;
          }
          if (_shipBad) {
            results.push(`⛔ ${file.name}: 다른 선박 EDI (${_shipBad}) — 적용 안 함. 이 항차(${voyage.info.vsl}) 자료가 맞는지 확인하세요.`);
            continue;
          }
          let _podPtk = 0, _polPtk = 0;
          r.containers.forEach((c) => { if (isPyeongtaekPort(c.pod)) _podPtk++; if (isPyeongtaekPort(c.pol)) _polPtk++; });
          const _ediKind = _podPtk > _polPtk ? 'discharge' : _polPtk > _podPtk ? 'loading' : mode;
          let _regVoy = _ediKind === 'discharge' ? voyage.info.voy_d : voyage.info.voy_l;
          // V9.57: 수집기 자동등록 항차는 voy_d/voy_l이 비어 있어 항차 대조를 통째로 건너뛰고
          //   무검증 통과하던 구멍. 등록값이 없으면 Firebase 키({VSL}_{VOY} — HomePage handleCreate와
          //   수집기가 같은 구조)의 마지막 '_' 뒤 항차를 추출해 그것과 대조한다.
          let _regVoyFromKey = false;
          if (!_regVoy && typeof voyageKey === 'string' && voyageKey.includes('_')) {
            const _kv = voyageKey.slice(voyageKey.lastIndexOf('_') + 1).trim();
            if (_kv) { _regVoy = _kv; _regVoyFromKey = true; }
          }
          // V8.28: 항차 비교를 '번호 기준'으로 — E/W/N/S 방향·앞0 무시. 인천 출발 선박은 선사가 왕복을
          //   한 항차(예 0529W)로 표기해 평택 양하분도 그 번호로 온다. leg는 위에서 내용(POD/POL)으로 이미
          //   확정했으니 같은 번호면 통과(0529==0529), 번호가 다르면(0530 vs 0529) 그대로 차단.
          const _voyCore = (x) => _norm(x).replace(/[EWNS]+$/, '').replace(/^0+/, '') || _norm(x);
          if (_regVoy && r.voy && _voyCore(r.voy) !== _voyCore(_regVoy)) {
            const _leg = _ediKind === 'discharge' ? '양하' : '선적';
            const _ptkLeg = _ediKind === 'discharge' ? _podPtk : _polPtk;
            // V8.29: 인천발 선박은 평택 항차가 한 항차 낮게·방향이 바뀔 수 있다(사용자 확정).
            //   콜사인이 같고 EDI에 평택분이 있으면 즉시 차단 대신 경고 모달로 사용자가
            //   등록 항차 흡수 여부를 결정. 콜사인 비교 불가하거나 평택분 없으면 기존대로 차단.
            // V9.05-03: 흡수 모달 트리거 확대 — 콜사인 비교 불가 시 모달 없이 즉시 차단되던 버그.
            //   실측 두 갈래: (a) DJCT 계열 EDI는 TDT 식별자가 '9891' 같은 숫자 코드라 콜사인 자체가 없음.
            //   (b) 자동등록(수집기) 항차 info에는 callsign이 아예 저장되지 않아 등록 측이 항상 공란.
            //   여기 도달 = 상단 선박 가드 통과(콜사인·선박명이 '비교 가능한데 다른' EDI는 이미 차단됨)
            //   → 불일치 증거 없음. 평택분이 있으면 식별 근거를 문구로 보여주고 사용자가 결정한다.
            const _csComparable = _voyCs && _ediCs;   // V9.57: 행번호 정정 — 위 선박 가드(_voyCs·_ediCs 계산부, 종전 '1596행' 주석은 옛 위치)
            // V9.39: **IMO도 식별 근거로 쓴다.** SKR·동진 계열 EDI는 콜사인이 없고 IMO만 있어
            //   종전엔 근거가 '비교 불가'로 떨어져, 실제로는 같은 배라는 증거가 있는데도
            //   검수사가 맨눈으로 확인해야 했다. 차단 로직은 건드리지 않는다 — 문구(근거)만 정확해진다.
            const _voyImo = String(voyage.info.imo || '').replace(/\D/g, '');
            const _ediImo = String(r.imo || '').replace(/\D/g, '');
            const _imoSame = !!(_voyImo && _ediImo && _voyImo === _ediImo);
            const _idBasis = _csComparable ? `같은 배 (콜사인 ${voyage.info.callsign})`
              : _imoSame ? `같은 배 (IMO ${_ediImo})`
              : (_voyNm && _ediNm) ? `선박명 대조 통과 (${r.vsl})`
              : `⚠ 선박 식별자 비교 불가 — EDI 선박 '${r.vsl || '미상'}'이 이 배가 맞는지 직접 확인하세요`;
            if (_ptkLeg > 0) {
              const _absorb = await askChoice({
                title: '항차 번호가 다릅니다',
                description:
                  `인천발 선박은 평택 항차가 한 항차 낮게, 방향이 바뀔 수 있습니다.\n\n` +
                  `EDI 항차 ${r.voy} ↔ 등록 ${_leg} 항차 ${_regVoy}${_regVoyFromKey ? ' (항차 키에서 추출)' : ''}\n` +
                  `${_idBasis}\n` +
                  `EDI에 평택 ${_leg}분 ${_ptkLeg}대 있음\n\n` +
                  `등록 항차 ${_regVoy} 로 흡수할까요?`,
                options: [
                  { key: 'absorb', label: `✅ ${_regVoy} 로 흡수`, desc: '같은 입항으로 보고 이 항차에 적용', recommended: true },
                  { key: 'skip', label: '⛔ 적용 안 함', desc: '다른 항차 자료 — 넣지 않음' },
                ],
              });
              if (_absorb !== 'absorb') {
                results.push(`⛔ ${file.name}: 항차 불일치 — EDI ${r.voy} ≠ 등록 ${_leg} ${_regVoy}, 사용자가 적용 안 함 선택.`);
                continue;
              }
              results.push(`🔀 ${file.name}: 인천발 항차 오프셋 — EDI ${r.voy} 를 등록 ${_leg} 항차 ${_regVoy} 로 흡수 (${_csComparable ? `콜사인 ${voyage.info.callsign} 일치` : '사용자 확인'}, 평택 ${_ptkLeg}대).`);
              // 흡수: 가드 통과 (아래 정상 병합 흐름 진입)
              // V9.05-03: 콜사인 비교 불가+평택분 있음의 옛 즉시 차단 분기는 모달로 대체(위).
            } else if (_csComparable || _imoSame) {
              // V9.57: 평택분 0이어도 콜사인·IMO가 같은 배면 즉시 차단하지 않고 사용자 판단(흡수 모달).
              //   여기 도달 = 상단 선박 가드 통과 → 콜사인이 둘 다 있으면 이미 일치한 것.
              //   통과 화물뿐인 EDI일 수 있으므로 기본 권장은 '적용 안 함'.
              const _absorb0 = await askChoice({
                title: '항차 번호가 다릅니다',
                description:
                  `EDI 항차 ${r.voy} ↔ 등록 ${_leg} 항차 ${_regVoy}${_regVoyFromKey ? ' (항차 키에서 추출)' : ''}\n` +
                  `${_idBasis}\n` +
                  `⚠ EDI에 평택 ${_leg}분 없음 — 다른 항차(통과 화물) 자료일 수 있습니다\n\n` +
                  `그래도 등록 항차 ${_regVoy} 로 흡수할까요?`,
                options: [
                  { key: 'absorb', label: `✅ ${_regVoy} 로 흡수`, desc: '같은 입항으로 보고 이 항차에 적용' },
                  { key: 'skip', label: '⛔ 적용 안 함', desc: '다른 항차 자료 — 넣지 않음', recommended: true },
                ],
              });
              if (_absorb0 !== 'absorb') {
                results.push(`⛔ ${file.name}: 항차 불일치 — EDI ${r.voy} ≠ 등록 ${_leg} ${_regVoy}, 평택 ${_leg}분 없음, 사용자가 적용 안 함 선택.`);
                continue;
              }
              results.push(`🔀 ${file.name}: EDI ${r.voy} 를 등록 ${_leg} 항차 ${_regVoy} 로 흡수 (평택 ${_leg}분 없음, 같은 배 확인 후 사용자 결정).`);
            } else {
              results.push(`⛔ ${file.name}: 다른 항차 자료 — EDI 항차 ${r.voy} ≠ 등록 ${_leg} 항차 ${_regVoy}, 평택 ${_leg}분 없음 → 적용 안 함.`);
              continue;
            }
          }
        }
        // ===== 가드 끝 =====

        // 선박 정보 추출 (첫 파일에서). M7.20: ASC도 처리 — 기존엔 BAPLIE만 추출해
        //   ASC로 올린 작업이 ships(선박 라이브러리/통계)에 누락되던 버그.
        if (!shipInfo) {
          if (isAsc) {
            // ASC는 TDT 없음 → parseAscFile의 $604 헤더값(vsl/voy/serviceCode) 사용.
            //   ASC엔 IMO 없으므로 식별키 = serviceCode > 선박명(공백제거). 콜사인 fallback과 동일 취지.
            const ascId = (r.serviceCode || '').toUpperCase().trim()
                       || (r.vsl ? r.vsl.toUpperCase().replace(/\s+/g, '') : '');
            if (ascId) {
              shipInfo = { imo: ascId, name: r.vsl || '', voyage: r.voy || '', callsign: (r.serviceCode || '').toUpperCase(), imoIsNumeric: false };
            }
          } else {
            shipInfo = extractShipInfo(text);
          }
          if (shipInfo) {
            try {
              prevStruct = await fbGetShipStructure(resolveShipKey(shipInfo.imo));   // V8.43: 별칭 → 정식 키
              if (prevStruct?.structure) {
                results.push(`📚 학습된 선박: ${shipInfo.name} (${shipInfo.imoIsNumeric ? 'IMO ' : ''}${shipInfo.imo}) — 이전 분석 ${prevStruct.voyages ? Object.keys(prevStruct.voyages).length : 0}개 항차`);
              } else {
                results.push(`🆕 새 선박: ${shipInfo.name} (${shipInfo.imoIsNumeric ? 'IMO ' : ''}${shipInfo.imo})`);
              }
            } catch (e) { console.warn('[선박 라이브러리] 이전 구조 조회 실패(학습 없이 계속 진행)', e); }  // V9.57: 조용한 실패 금지
          }
        }

        // 베이 분석용 전체 컨테이너 누적
        allEdiContainers.push(...r.containers);

        // M4.3 ★ 진짜 베이 누락 root cause fix
        //   이전 버그: 이 EDI 업로드 경로(VoyagePage 자체 업로드)에 평택 필터가 살아있었음
        //   M3.91 fix는 별도 경로에만 적용 → 이 경로는 여전히 평택 297대만 저장
        //   증상: 사용자님 보고 "새 EDI 업로드해도 297대만 보임" — 진짜 원인이 여기였음
        //   수정: 모든 컨 저장 + _mode 태그로 구분 (discharge/loading/transit)
        // M6.38: EDI 자체에서 양하/선적 자동 판정 — mode 화면 의존 제거 (자동화 원칙)
        //   사용자가 mode 잘못 선택하고 EDI 업로드해도 EDI 내용으로 자동 판정
        //   양하 EDI: POD가 PTK인 컨이 다수 (도착 항구가 평택)
        //   선적 EDI: POL이 PTK인 컨이 다수 (출발 항구가 평택)
        let podPtkTotal = 0;
        let polPtkTotal = 0;
        r.containers.forEach(c => {
          if (isPyeongtaekPort(c.pod)) podPtkTotal++;
          if (isPyeongtaekPort(c.pol)) polPtkTotal++;
        });
        const ediKind = podPtkTotal > polPtkTotal ? 'discharge'
                      : polPtkTotal > podPtkTotal ? 'loading'
                      : mode;  // 동률 — 화면 mode fallback

        let ptkCount = 0;
        r.containers.forEach(c => {
          const podPtk = isPyeongtaekPort(c.pod);
          const polPtk = isPyeongtaekPort(c.pol);
          let containerMode;
          if (ediKind === 'discharge') {
            if (podPtk) { containerMode = 'discharge'; ptkCount++; }
            else containerMode = 'transit';
          } else {
            if (polPtk) { containerMode = 'loading'; ptkCount++; }
            else containerMode = 'transit';
          }
          const key = c.cn && c.cn.length === 11 ? c.cn : `__SLOT_${c.bay}_${c.row}_${c.tier}`;
          allCns[key] = { ...c, _slotKey: key, _mode: containerMode };
        });
        const ediKindLabel = ediKind === 'discharge' ? '양하' : '선적';
        // M7.14: 선박 통계용 — 이 파일의 평택분을 ediKind 기준으로 누적
        if (ediKind === 'discharge') statDischargePtk += ptkCount;
        else statLoadingPtk += ptkCount;
        results.push(`✅ ${file.name}: ${ediKindLabel} EDI 자동 판정 — 평택 ${ptkCount}대 (전체 ${total}, 통과 ${total - ptkCount}대 포함 저장)`);
        // 항차 정보 자동 보완
        // M5.87: callsign + vsl도 자동 저장 (EDI TDT 세그먼트에서 추출 → PORT-MIS 매칭 자동화)
        // M6.16: voy_d / voy_l 자동 저장
        // M6.38: ediKind 기준 — mode 화면 의존 제거
        if (r.vsl && r.voy) {
          const infoPatch = {
            etd: r.etd || voyage.info.etd || '',
            carrier: r.carrier || voyage.info.carrier || '',
          };
          // V9.57: 등록 항차 표기를 EDI 표기로 덮어쓰지 않는다 — 위 대조 가드에서 voyCore 동일
          //   (0패딩·방향 차이, 예 0529W vs 529W)로 통과했거나 사용자가 흡수한 EDI가 여기서
          //   voy_d/voy_l을 갈아치우면 Firebase 키({VSL}_{VOY})·목록 표기와 어긋난다.
          //   등록값이 비어 있을 때만 자동 보완한다. (utils voyCore/voyEq 승격은 팀F 진행 중 —
          //   가드가 핵심번호 불일치를 이미 차단/흡수 처리하므로 여기선 '빈 값만 채움'으로 충분)
          if (ediKind === 'discharge') {
            if (!voyage.info.voy_d) infoPatch.voy_d = r.voy;
          } else if (ediKind === 'loading') {
            if (!voyage.info.voy_l) infoPatch.voy_l = r.voy;
          }
          // M5.87: callsign 자동 저장 (EDI에서 새로 추출됐고 voyage.info에 없거나 다르면)
          if (r.callsign && r.callsign !== voyage.info.callsign) {
            infoPatch.callsign = r.callsign;
          }
          // M5.87: 풀네임 자동 저장 (베이사전 매칭 없어도 PORT-MIS 매칭 가능하게)
          if (r.vsl && r.vsl !== voyage.info.vsl && !voyage.info.vslFull) {
            infoPatch.vslFull = r.vsl;  // 별도 필드 (vsl은 사용자 입력 약자 유지)
          }
          await fbUpdateVoyageInfo(voyageKey, infoPatch);

          // M5.89: EDI에서 추출한 콜사인 + 풀네임으로 베이사전 자동 등록
          //   - 베이사전에 해당 약자(code) 없거나 콜사인이 비어있으면 등록
          //   - def는 베이 구조 / EDI는 콜사인+풀네임 → 보완 관계
          //   - 모든 검수원과 즉시 공유 (Firebase)
          // V7.30: 콜사인 없어도 선박명(r.vsl)이 있으면 사전 교정 (오염 콜사인 자동 정리).
          //   정상 EDI는 TDT 호출부호 칸이 비어 callsign='' 인 경우가 많음 → 선박명으로 교정.
          if ((r.callsign || r.vsl) && (r.vsl || r.carrier)) {
            try {
              const { fbSaveShipBayDict } = await import('../firebase.js');
              const code = (voyage.info.vsl || '').toUpperCase().replace(/\s+/g, '');
              if (code && code.length >= 2 && code.length <= 8) {
                await fbSaveShipBayDict(code, {
                  code,
                  name: r.vsl,
                  callsign: r.callsign || '',
                  source: 'edi-auto',
                  _inspector: inspector || '',
                });
                results.push(`☁ ${file.name}: 베이사전 자동 등록 (${code} · ${r.callsign || '(콜사인없음)'} · ${r.vsl})`);
              }
            } catch (e) {
              console.warn('[M5.89] EDI 베이사전 자동 등록 실패:', e);
            }
          }
        }
      } catch (e) {
        results.push(`❌ ${file.name}: ${e.message}`);
      }
    }

    if (Object.keys(allCns).length > 0) {
      const existing = sec.ediContainers || {};
      const existingCount = Object.keys(existing).length;
      const newCount = Object.keys(allCns).length;

      // M3.5.4-fix2: 기존 EDI 데이터 있으면 사용자에게 처리 방식 묻기
      // M3.74: window.prompt() → ChoiceModal (풀 너비 카드 버튼)
      if (existingCount > 0) {
        const overlap = Object.keys(allCns).filter(cn => existing[cn]).length;
        const onlyNew = newCount - overlap;
        const choice = await askChoice({
          title: '기존 EDI 데이터 처리',
          description:
            `기존 EDI: ${existingCount}대\n` +
            `새로 업로드: ${newCount}대 (중복 ${overlap}대, 신규 ${onlyNew}대)\n\n` +
            `어떻게 할까요?`,
          options: [
            {
              key: '1',
              label: '🔄 교체',
              desc: '기존 모두 삭제 후 새 것만',
              recommended: true,  // 같은 EDI 다시 올릴 때가 가장 흔함
            },
            {
              key: '2',
              label: '📥 추가 병합',
              desc: '중복은 새 값으로 덮어쓰기',
            },
            {
              key: '3',
              label: '➕ 신규만 추가',
              desc: '중복은 기존 유지',
            },
          ],
        });
        if (!choice) {
          setStatus('취소됨');
          if (ediRef.current) ediRef.current.value = '';
          return;
        }
        if (choice === '1') {
          // 교체: 기존 완전 삭제 후 새 것만
          await fbSaveEdiContainers(voyageKey, mode, allCns);
          results.push(`🔄 교체 완료: ${existingCount}대 → ${newCount}대`);
        } else if (choice === '2') {
          await fbSaveEdiContainers(voyageKey, mode, { ...existing, ...allCns });
          results.push(`📥 병합: 기존 ${existingCount}대 + 신규 ${onlyNew}대 (중복 ${overlap}대 덮어씀)`);
        } else if (choice === '3') {
          // 신규만 추가
          const onlyNewObj = {};
          Object.entries(allCns).forEach(([cn, c]) => {
            if (!existing[cn]) onlyNewObj[cn] = c;
          });
          await fbSaveEdiContainers(voyageKey, mode, { ...existing, ...onlyNewObj });
          results.push(`➕ 신규만 추가: ${Object.keys(onlyNewObj).length}대 (기존 ${existingCount}대 유지)`);
        }
      } else {
        // 기존 데이터 없으면 그냥 저장
        await fbSaveEdiContainers(voyageKey, mode, allCns);
      }
    }

    // M5.11: EDI 원본 텍스트 보관 (미래 [🔄 자료 재처리]에 사용)
    //   여러 파일 합쳐서 단일 텍스트로 저장 (구분자: \n----- FILE: ... -----\n)
    if (rawEdiTexts.length > 0) {
      try {
        const combined = rawEdiTexts.map((t, i) =>
          `----- FILE: ${rawEdiFileNames[i]} -----\n${t}`
        ).join('\n\n');
        await fbSaveEdiRaw(voyageKey, mode, combined, {
          fileName: rawEdiFileNames.join(', '),
          parserVersion: 'M5.11',
        });
        results.push(`💾 EDI 원본 자동 보관됨 (${(combined.length / 1024).toFixed(1)}KB)`);
      } catch (e) {
        // 원본 저장 실패해도 메인 흐름엔 영향 없음
        console.warn('EDI raw save failed:', e);
      }
    }

    // 선박 구조 분석 + 저장 (전체 컨테이너 기반, 평택 필터 X)
    if (shipInfo && allEdiContainers.length > 0) {
      try {
        const baseStruct = analyzeShipStructure(allEdiContainers);

        // M3.90: 베이사전(.def 파일 기반) 자동 매칭
        const newStruct = augmentStructureWithBayDict(baseStruct, shipInfo.imo, shipInfo.name);
        if (newStruct.bayDictApplied) {
          results.push(`📚 베이사전 매칭: ${shipInfo.name} (${shipInfo.imo}) - .def 데이터 적용됨`);
        }

        const cmp = compareStructures(prevStruct?.structure, newStruct);
        if (cmp.isFirst) {
          results.push(`📊 선박 구조 학습: 베이 ${newStruct.bay_count}개, 짝꿍 ${Object.keys(newStruct.pairs).length / 2}쌍, 단독 ${newStruct.singles.length}개`);
        } else if (cmp.hasChanges) {
          results.push(`📊 선박 구조 업데이트: ${cmp.changes.join(' / ')}`);
        } else {
          results.push(`📊 선박 구조 일치 (이전 분석과 동일)`);
        }
        // 저장
        // V8.43: ships/{키} 저장은 정식 키로 통일 — BAPLIE/ASC 경로가 같은 배를
        //   다른 키(콜사인 vs 약자/서비스코드)로 갈라 보관소에 중복 표시되던 버그 방지.
        const shipStoreKey = resolveShipKey(shipInfo.imo);
        await fbSaveShipStructure(shipStoreKey, {
          imo: shipInfo.imo,
          name: shipInfo.name,
          structure: newStruct,
        });
        await fbAddShipVoyage(shipStoreKey, voyageKey, {
          voy: shipInfo.voyage,
          // V8.84: 항차 등록 정보의 양하/선적 항차를 보관소 기록에도 — 빈값은 제외(기존 값 보존).
          ...(voyage?.info?.voy_d ? { voy_d: voyage.info.voy_d } : {}),
          ...(voyage?.info?.voy_l ? { voy_l: voyage.info.voy_l } : {}),
          vsl: shipInfo.name,
          mode,
          container_count: allEdiContainers.length,
          ptk_count: Object.keys(allCns).length,
          // M7.15: 항차별 평택 양/적하 대수. _uploadKind로 이번 올린 mode만 덮어쓰기.
          discharge_ptk: statDischargePtk,
          loading_ptk: statLoadingPtk,
          // 이번 업로드에 포함된 mode (값이 집계된 쪽). 둘 다면 'both'.
          _uploadKind: (statDischargePtk > 0 && statLoadingPtk > 0) ? 'both'
                     : statDischargePtk > 0 ? 'discharge'
                     : statLoadingPtk > 0 ? 'loading'
                     : (ediKind || mode),
          analyzed_by: inspector || '',   // M6.15: EDI 업로드한 검수원
        });
        // M7.15: stats는 voyages에서 합산만 (fbAddShipVoyage가 기록 전담)
        await fbAddShipStats(shipStoreKey, {}, voyageKey);
      } catch (e) {
        console.error('Ship structure save failed:', e);
      }
    }

    // M4.4: .def만 업로드한 경우와 EDI도 같이 한 경우 모두 적절히 표시
    let summary;
    const cnCount = Object.keys(allCns).length;
    const defCount = defFiles.length;
    if (cnCount > 0 && defCount > 0) {
      summary = `\n\n총 평택 대상: ${cnCount}대 · 베이사전 등록: ${defCount}척`;
    } else if (cnCount > 0) {
      summary = `\n\n총 평택 대상: ${cnCount}대`;
    } else if (defCount > 0) {
      summary = `\n\n📚 베이사전 등록: ${defCount}척 (다음 EDI 업로드 시 자동 매칭)`;
    } else {
      summary = '';
    }
    setStatus(results.join('\n') + summary);
    if (ediRef.current) ediRef.current.value = '';
  };

  const handleListUpload = async (files) => {
    if (!files || files.length === 0) return;

    // M3.5.4-fix2: 기존 리스트 데이터 있으면 사용자에게 묻기
    // M3.74: window.prompt() → ChoiceModal
    const existing = sec.records || {};
    const existingCount = Object.keys(existing).length;
    let startMap = { ...existing };
    let skipExisting = false;
    if (existingCount > 0) {
      const choice = await askChoice({
        title: '기존 리스트 데이터 처리',
        description: `기존 리스트: ${existingCount}대\n\n어떻게 할까요?`,
        options: [
          {
            key: '1',
            label: '🔄 교체',
            desc: '기존 모두 삭제 후 새 것만',
            recommended: true,
          },
          {
            key: '2',
            label: '📥 추가 병합',
            desc: '중복은 새 값으로 덮어쓰기',
          },
          {
            key: '3',
            label: '➕ 신규만 추가',
            desc: '중복은 기존 유지',
          },
        ],
      });
      if (!choice) {
        setStatus('취소됨');
        if (listRef.current) listRef.current.value = '';
        return;
      }
      if (choice === '1') {
        startMap = {};  // 교체: 기존 비우고 시작
      }
      // 신규만 모드는 cn별 처리 시 기존 값 보존
      skipExisting = choice === '3';
    }

    setStatus(`${files.length}개 파일 처리 중...`);
    const results = [];
    let cnMap = startMap;
    let added = 0;

    // M3.5.3: PDF/사진 자동 분기 (mixerUpload 모듈 활용)
    // V9.32: 동적 import 실패를 삼키지 않는다 — 새 버전 배포 후 캐시가 옛 청크를 가리키면
    //   여기서 예외가 나고 함수가 조용히 죽어 화면이 "처리 중"에서 영영 멈춘다(사용자 신고 2026-07-31,
    //   OBWH 2702W). 실패하면 이유를 화면에 띄우고 새로고침을 안내한다.
    let detectFileType, extractPdfText, parsePdfContainers, ocrImageContainers, GEMINI_API_KEY, _storage, SK;
    try {
      ({ detectFileType, extractPdfText, parsePdfContainers, ocrImageContainers } = await import('../mixerUpload.js'));
      ({ GEMINI_API_KEY } = await import('../gemini.js'));
      ({ _storage, SK } = await import('../utils.js'));
    } catch (impErr) {
      setStatus(`❌ 업로드 모듈을 불러오지 못했습니다 — 앱이 새 버전으로 갱신되었습니다.\n화면을 새로고침한 뒤 다시 올려 주세요.\n(${impErr?.message || impErr})`);
      if (listRef.current) listRef.current.value = '';
      return;
    }
    const geminiKey = _storage.get(SK.geminiKey) || GEMINI_API_KEY;

    for (const file of Array.from(files)) {
      try {
        const ftype = await detectFileType(file);
        let records = [];

        if (ftype === 'pdf') {
          // PDF 처리
          setStatus(`📄 ${file.name} PDF 분석 중...`);
          const text = await extractPdfText(file);
          const parsed = parsePdfContainers(text);
          records = Object.values(parsed.containers || {});
          if (records.length === 0) {
            results.push(`❌ ${file.name}: PDF에서 컨번호 인식 실패`);
            continue;
          }
        } else if (ftype === 'image') {
          // 사진 OCR
          setStatus(`📷 ${file.name} 사진 분석 중 (Gemini Vision)...`);
          if (!geminiKey) {
            results.push(`❌ ${file.name}: Gemini API 키 없음 (헤더 🔑 버튼에서 설정)`);
            continue;
          }
          try {
            const parsed = await ocrImageContainers(file, geminiKey);
            records = Object.values(parsed.containers || {});
            if (records.length === 0) {
              results.push(`❌ ${file.name}: 사진에서 컨번호 인식 실패 (선명한 사진 권장)`);
              continue;
            }
          } catch (e) {
            results.push(`❌ ${file.name} 사진 OCR 실패: ${e.message}`);
            continue;
          }
        } else {
          // 엑셀/CSV (기존 로직)
          const buf = await file.arrayBuffer();
          // V9.22: RZOR 덱 스토우지 플랜(rzdf_ship_*.xls, 시트 A~E-DECK) 감지 → 플랜으로 저장(리스트 아님)
          //   V9.31: 파일명이 rzdf_ 이거나 RZOR 선박일 때만 검사한다. 종전엔 모든 리스트 파일을
          //   cellStyles:true(스타일 전체 파싱)로 통째 읽어 — 큰 CLL(OBWH 2702W 등)에서 업로드가
          //   "처리 중"에서 수 분간 멈춘 것처럼 보였다(사용자 신고 2026-07-31). 무관한 파일엔 건너뛴다.
          const _mayBeDeckPlan = /rzdf|deck/i.test(file.name) ||
            String(voyage?.info?.vsl || voyageKey || '').toUpperCase().includes('RZOR');
          try {
            if (!_mayBeDeckPlan) throw new Error('skip-deckplan');
            const XLSX0 = await loadSheetJS();
            const wb0 = XLSX0.read(new Uint8Array(buf.slice(0)), { type: 'array', cellStyles: true });   // V9.22-02: 회색(불가) 구역 구분
            if (isDeckPlanWorkbook(wb0)) {
              const plan0 = parseDeckPlanWorkbook(wb0, XLSX0);
              if (plan0.total > 0) {
                await fbSetStowagePlan(voyageKey, mode, plan0);
                results.push(`✅ 🗺 ${file.name}: 덱 플랜 ${plan0.decks.map(d => `${d.deck}${d.slots.length}`).join('/')} = ${plan0.total}대`);
                continue;
              }
            }
          } catch (e0) { /* 덱 플랜 아님 → 리스트 흐름 계속 */ }
          const parseResult = await parseListExcel(buf);
          records = parseResult.records || [];
          if (records.length === 0) {
            if (/cbf|booking|bkg|confirm/i.test(file.name)) {
              results.push(`ℹ️ ${file.name}: 예약 양식 (Booking) — 컨번호 없음, 정상`);
            } else {
              results.push(`❌ ${file.name}: 컨번호 인식 실패 (양식 확인 필요)`);
            }
            continue;
          }
        }

        // 공통: cnMap에 병합 (skipExisting이면 기존 컨번호는 건너뜀)
        for (const r of records) {
          if (!r.cn) continue;
          if (cnMap[r.cn]) {
            if (skipExisting) continue;  // 신규만 모드 → 기존 유지
            // M8.08: 스마트 병합 — 새 값(주로 세관리스트)이 비어있으면 기존 값(선사리스트) 보존.
            //   작업 순서 EDI→선사→세관: 세관이 마지막이라 온도(빈값)가 선사 온도를 덮던 문제.
            //   실번호는 더 완전한(긴) 쪽 유지 — 세관 20자 컷 vs 선사 완전값.
            const prev = cnMap[r.cn];
            const merged = { ...prev };
            for (const [k, v] of Object.entries(r)) {
              if (v === '' || v == null) continue;          // 빈 새 값은 기존 보존
              if (k === 'tmp' && (v === '' || r.tmp_missing)) continue;  // 빈 온도 보존
              merged[k] = v;
            }
            // 실번호: 한쪽이 다른 쪽의 앞부분이면서 더 길면 긴 쪽 채택(잘림 보정).
            const a = String(prev.sl || '').trim(), b = String(r.sl || '').trim();
            if (a && b) {
              if (a.length > b.length && a.startsWith(b)) merged.sl = a;
              else if (b.length > a.length && b.startsWith(a)) merged.sl = b;
            } else {
              merged.sl = a || b;
            }
            // 온도: 기존(선사)에 유효 온도 있으면 보존.
            const prevTmp = String(prev.tmp || '').trim();
            if (prevTmp && !prev.tmp_missing) { merged.tmp = prev.tmp; merged.tmp_missing = false; }
            cnMap[r.cn] = merged;
          } else {
            added++;
            cnMap[r.cn] = r;
          }
        }
        const typeLabel = ftype === 'pdf' ? '📄 PDF' : ftype === 'image' ? '📷 사진' : '📊 엑셀';
        results.push(`✅ ${typeLabel} ${file.name}: +${records.length}대`);
      } catch (e) {
        results.push(`❌ ${file.name}: ${e.message}`);
      }
    }

    // M3.5.4-fix2: 충돌 검출 — EDI vs 리스트 비교
    const ediMap = sec.ediContainers || {};
    const newRecords = {};
    Object.values(cnMap).forEach(r => {
      // 신규 업로드된 것만 비교 (기존 records에 없던 것)
      if (r.cn) newRecords[r.cn] = r;
    });

    const unmatched = [];      // EDI에 없는 컨번호
    const weightDiffs = [];    // 무게 차이 1톤 이상
    const sealDiffs = [];      // 실번호 불일치

    Object.values(newRecords).forEach(r => {
      const ediC = ediMap[r.cn];
      if (!ediC) {
        // EDI에 없는 컨 (단, 기존에 records로 있던 것은 이미 처리된 거니 신규만)
        const wasInRecords = (sec.records || {})[r.cn];
        if (!wasInRecords) {
          unmatched.push({ cn: r.cn, sl: r.sl || '', wt: r.wt || 0, iso: r.iso || '', fe: r.fe || '' });
        }
        return;
      }
      // 무게 차이
      const ediW = parseInt(ediC.wt, 10) || 0;
      const lrW = parseInt(r.wt, 10) || 0;
      if (ediW > 0 && lrW > 0 && Math.abs(ediW - lrW) >= 1000) {
        weightDiffs.push({ cn: r.cn, ediW, listW: lrW });
      }
      // 실번호 불일치 (EDI에 sl 있고 리스트에도 있는데 다름)
      const ediSl = String(ediC.sl || '').trim();
      const lrSl = String(r.sl || '').trim();
      if (ediSl && lrSl && ediSl !== lrSl) {
        sealDiffs.push({ cn: r.cn, ediSl, listSl: lrSl });
      }
    });

    const totalConflicts = unmatched.length + weightDiffs.length + sealDiffs.length;

    if (totalConflicts > 0) {
      // 충돌 있음 → 모달로 검수원에게 확인
      setStatus(results.join('\n') + `\n\n⚠️ 검토 필요 ${totalConflicts}건 — 확인 후 저장`);
      setConflictData({
        cnMap,             // 임시 저장 (적용 시 사용)
        results,
        added,
        conflicts: { unmatched, weightDiffs, sealDiffs },
      });
      if (listRef.current) listRef.current.value = '';
      return;
    }

    // 충돌 없음 → 그대로 저장
    // V9.32-02: 저장 실패(undefined 거부 등)를 삼키지 않는다 — 종전엔 여기서 예외가 나면
    //   함수가 조용히 죽어 "처리 중"이 영영 남았다(OBWH 2702W 재현 확정).
    try {
      await fbSaveListRecords(voyageKey, mode, cnMap);
      setStatus(results.join('\n') + `\n\n전체 ${Object.keys(cnMap).length}대 (신규 ${added})`);
    } catch (e) {
      setStatus(`❌ 리스트 저장 실패 — ${e?.message || e}\n다시 시도하거나 이 메시지를 개발자에게 알려 주세요.`);
    }
    if (listRef.current) listRef.current.value = '';
  };

  // M3.5.4-fix2: 충돌 검토 결과 적용
  const applyConflictResolution = async (resolution) => {
    if (!conflictData) return;
    const { cnMap, results, added } = conflictData;
    const ediMap = sec.ediContainers || {};
    const finalMap = { ...cnMap };

    // 1. EDI에 없는 컨: ignore면 제거, add면 유지
    resolution.unmatchedActions.forEach(a => {
      if (a.action === 'ignore') {
        delete finalMap[a.cn];
      }
      // add는 그대로 두면 됨 (이미 cnMap에 있음)
    });

    // 2. 무게: 'edi' 선택 시 EDI 무게로, 'list'면 리스트 무게 그대로
    resolution.weightActions.forEach(a => {
      if (a.action === 'edi' && finalMap[a.cn]) {
        finalMap[a.cn].wt = a.ediW;
      }
      // list는 그대로 (이미 리스트 값)
    });

    // 3. 실번호: 'edi' 선택 시 EDI 실번호로
    resolution.sealActions.forEach(a => {
      if (a.action === 'edi' && finalMap[a.cn]) {
        finalMap[a.cn].sl = a.ediSl;
      }
    });

    await fbSaveListRecords(voyageKey, mode, finalMap);
    const ignoredCount = resolution.unmatchedActions.filter(a => a.action === 'ignore').length;
    setStatus(results.join('\n') + `\n\n✅ 저장 완료 — 전체 ${Object.keys(finalMap).length}대${ignoredCount > 0 ? ` (무시 ${ignoredCount}대)` : ''}`);
    setConflictData(null);
  };

  const handleXrayUpload = async (files) => {
    if (!files || files.length === 0 || mode !== 'discharge') return;
    setStatus(`${files.length}개 파일 처리 중...`);
    let cnObj = { ...(sec.xrayList || {}) };
    let added = 0;
    for (const file of Array.from(files)) {
      try {
        const buf = await file.arrayBuffer();
        const { containers } = await parseXrayList(buf);
        containers.forEach(cn => {
          if (!cnObj[cn]) { cnObj[cn] = { at: Date.now() }; added++; }
        });
      } catch (e) { console.warn('[X-RAY] 파일 파싱 실패 — 이 파일은 건너뜀:', file.name, e); }  // V9.57: 조용한 실패 금지
    }
    await fbSaveXrayList(voyageKey, cnObj);
    setStatus(`✅ X-RAY: +${added}대 (전체 ${Object.keys(cnObj).length}대)`);
    if (xrayRef.current) xrayRef.current.value = '';
  };

  // 양하/선적 섹션 추가 (다른 모드)
  const otherMode = mode === 'discharge' ? 'loading' : 'discharge';
  const hasOther = !!voyage[otherMode];
  // M6.46: 다른 mode 섹션 추가 시 voy 입력
  const [otherVoyInput, setOtherVoyInput] = useState('');

  // M5.26: 통합 출력 허브 모달
  const [showPrintHub, setShowPrintHub] = useState(false);
  const [showTestLab, setShowTestLab] = useState(false);   // V9.25: 검증 모드 (검수원 '김성일'만 노출)

  return (
    <div className="space-y-3">
      {/* M6.46: 항차 번호 확인/정정 위젯 — 정확한 voy_d/voy_l 보장 */}
      <VoyFixWidget voyage={voyage} voyageKey={voyageKey}/>
      {/* M6.43: 베이사전 라이브러리 위젯 — PDF 등록 + 누락 선박 식별 통합 */}
      <BayDictLibraryWidget
        onSingleUpload={(file) => setStowagePdfFile(file)}
        onBulkUpload={() => setBulkStowageOpen(true)}
        onAscUpload={() => setBulkAscOpen(true)}
      />
      {/* M6.93.1: 신규 선박 베이 매트릭스 빌더 */}
      <button
        onClick={() => setMatrixBuilderOpen(true)}
        className="w-full bg-gradient-to-br from-emerald-900/40 to-teal-900/40 hover:from-emerald-900/60 border border-emerald-700/50 rounded-lg p-3 flex items-center gap-3 active:scale-[0.98] transition"
      >
        <span className="text-xl">🚢</span>
        <div className="text-left flex-1">
          <div className="text-sm font-bold text-emerald-300">신규 선박 베이 매트릭스 빌더</div>
          <div className="text-[11px] text-emerald-400/70 mt-0.5">
            현재 EDI 자동 분석 → 베이사전 보강 → PDF 추가 → 사용자 검증 → 즉시 등록
          </div>
        </div>
      </button>
      {/* M6.50: 베이사전 진단 위젯 — 등록 entry 필드 완성도 + 잠재 오류 자동 감지 */}
      <BayDictDiagnosticsWidget/>
      {/* M5.26: 통합 출력 진입 */}
      <button
        onClick={() => setShowPrintHub(true)}
        className="w-full bg-gradient-to-br from-amber-900/40 to-orange-900/40 hover:from-amber-900/60 border border-amber-700/50 rounded-lg p-3 flex items-center gap-3 active:scale-[0.98] transition"
      >
        <span className="text-2xl">📄</span>
        <div className="flex-1 text-left">
          <div className="font-bold text-amber-100">검수 자료 출력</div>
          <div className="text-[10px] text-amber-300/80">양하/선적 × 검수리스트 / 카고플랜 / 베이상세 통합</div>
        </div>
        <span className="text-amber-300">›</span>
      </button>
      {showPrintHub && (
        <PrintHubModal
          voyage={voyage}
          voyageKey={voyageKey}
          onClose={() => setShowPrintHub(false)}
        />
      )}
      {/* V9.25: 🧪 검증 모드 — 검수원 '김성일' 선택 시에만 노출 (사용자 요청: "저만 보이게") */}
      {inspector === '김성일' && (
        <button onClick={() => setShowTestLab(true)}
          className="w-full bg-fuchsia-950/40 hover:bg-fuchsia-900/50 border border-fuchsia-700/50 rounded-lg p-3 flex items-center gap-3 active:scale-[0.98] transition">
          <span className="text-2xl">🧪</span>
          <div className="flex-1 text-left">
            <div className="font-bold text-fuchsia-200">검증 모드 (테스트 랩)</div>
            <div className="text-[10px] text-fuchsia-300/70">검수확인 전체 취소 등 재검수 도구 — 성일님 전용</div>
          </div>
          <span className="text-fuchsia-300">›</span>
        </button>
      )}
      {showTestLab && inspector === '김성일' && (
        <TestLabModal voyage={voyage} voyageKey={voyageKey} onClose={() => setShowTestLab(false)}/>
      )}
      {/* M6.14: STOWAGE PDF 자동 분석 검토 모달 */}
      {stowagePdfFile && (
        <StowageReviewModal
          file={stowagePdfFile}
          inspector={inspector}
          voyage={voyage}  /* M6.14e: 항차 정보 자동 채우기용 */
          onClose={() => setStowagePdfFile(null)}
          onRegistered={() => {
            // 등록 성공 시 자동으로 모달 닫고 사용자에게 즉시 반영 안내
            setStatus('✅ 베이사전 등록 완료 — 새로고침하면 베이플랜에 반영됩니다');
          }}
        />
      )}
      {/* M6.42: STOWAGE PDF 일괄 등록 */}
      {bulkStowageOpen && (
        <BulkStowageModal
          open={bulkStowageOpen}
          inspector={inspector}
          onClose={() => setBulkStowageOpen(false)}
          onCompleted={(res) => {
            setStatus(`✅ 베이사전 일괄 등록: ${res.saved}개 성공, ${res.failed}개 실패`);
          }}
        />
      )}
      {/* M6.47: ASC 일괄 등록 (Gemini 0) */}
      {bulkAscOpen && (
        <BulkAscModal
          open={bulkAscOpen}
          inspector={inspector}
          onClose={() => setBulkAscOpen(false)}
          onCompleted={(res) => {
            setStatus(`⚡ ASC 일괄 등록: ${res.saved}개 성공, ${res.failed}개 실패 (Gemini 0회)`);
          }}
        />
      )}
      {/* M6.93.1: 신규 선박 베이 매트릭스 빌더 */}
      {matrixBuilderOpen && (
        <ShipMatrixBuilderModal
          voyage={voyage}
          containers={Object.values(sec.ediContainers || {})}
          onClose={() => setMatrixBuilderOpen(false)}
          onSaved={(entry) => {
            setStatus(`✅ ${entry.code} 베이 매트릭스 저장 (${entry.bayDef.recordCount} 베이)`);
          }}
        />
      )}
      {/* V9.46: 이 항차의 메일함 폴더를 바로 펼친다 — 파일 창에서 찾아 들어갈 필요가 없다.
          지원 안 되는 브라우저(폰 등)에서는 아무것도 안 그리고 아래 파일 입력이 그대로 쓰인다. */}
      <MailboxFilePicker
        vessel={(voyage?.info?.vsl || String(voyageKey || '').split('_')[0] || '').trim()}
        voy={(mode === 'discharge' ? voyage?.info?.voy_d : voyage?.info?.voy_l)
             || voyage?.info?.voy
             || String(voyageKey || '').split('_').slice(1).join('_')}
        voyageKey={voyageKey}
        mode={mode}
        onEdi={handleEdiUpload}
        onList={handleListUpload}
        onXray={handleXrayUpload}
      />
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="text-sm font-bold mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400"/>
          1. EDI / ASC (필수) <span className="text-[10px] text-cyan-400 font-normal">+ .def / STOWAGE PDF</span>
        </div>
        <input ref={ediRef} type="file" multiple accept="*/*"
          onChange={e => handleEdiUpload(e.target.files)}
          className="text-xs text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-700 file:text-blue-100 file:font-bold file:cursor-pointer"/>
        <div className="text-[10px] text-slate-500 mt-1">
          현재 EDI 컨테이너: {Object.keys(sec.ediContainers || {}).length}대
          <br/>지원: .edi .asc .txt (확장자 무관, 내용으로 판별)
          <br/><span className="text-cyan-400">📚 .def (CASP) 같이 올리면 베이사전 자동 등록</span>
        </div>

        {/* M6.43: PDF 등록 + 베이사전 라이브러리 현황 통합 위젯 (자료 탭 상단으로 이동) */}

        {/* M5.11: 보관된 EDI 원본 + 재처리 버튼 */}
        {rawMeta?.text ? (
          <div className="mt-2 pt-2 border-t border-slate-800/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-emerald-400 font-bold">💾 EDI 원본 보관됨</span>
              <span className="text-[10px] text-slate-500 mono">
                {(rawMeta.sizeBytes / 1024).toFixed(1)}KB
                · {rawMeta.parserVersion || '?'}
                {rawMeta.uploadedAt && ` · ${new Date(rawMeta.uploadedAt).toLocaleString('ko-KR', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}`}
              </span>
            </div>
            <button onClick={handleReprocess}
              className="mt-1.5 w-full bg-slate-700/60 hover:bg-slate-700 active:bg-slate-800 text-slate-200 px-3 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5">
              🔄 EDI 다시 분석 <span className="text-slate-400 font-normal">(선택사항)</span>
            </button>
            <div className="text-[10px] text-slate-500 mt-1 leading-tight">
              필요시에만. 검수 입력(실번호/사진/완료/X-RAY)은 항상 보존됨.
            </div>
          </div>
        ) : null /* M5.27: "다음 EDI 업로드부터..." 안내 메시지 제거 — 사용자 혼란 유발 */}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="text-sm font-bold mb-2 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400"/>
          2. {mode === 'discharge' ? '양하' : '선적'} 리스트
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input ref={listRef} type="file" multiple
            accept="*/*"
            onChange={e => handleListUpload(e.target.files)}
            className="flex-1 text-xs text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-emerald-700 file:text-emerald-100 file:font-bold file:cursor-pointer"/>
          <button
            onClick={() => cameraRef.current?.click()}
            className="bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 flex-shrink-0"
            title="카메라로 종이 리스트 촬영"
          >
            <Camera className="w-3.5 h-3.5"/>📷
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment"
            onChange={e => { handleListUpload(e.target.files); if (cameraRef.current) cameraRef.current.value = ''; }}
            className="hidden"/>
        </div>
        <div className="text-[10px] text-slate-500">
          현재 리스트: {Object.keys(sec.records || {}).length}대
          <br/>📊 엑셀 (.xls .xlsx .csv) · 📄 PDF · 📷 사진 (자동 인식)
        </div>
      </div>

      {mode === 'discharge' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-sm font-bold mb-2 flex items-center gap-2">
            🔍 3. X-RAY 리스트 (양하만)
          </div>
          <input ref={xrayRef} type="file" multiple
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*"
            onChange={e => handleXrayUpload(e.target.files)}
            className="text-xs text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-purple-700 file:text-purple-100 file:font-bold file:cursor-pointer"/>
          <div className="text-[10px] text-slate-500 mt-1">
            현재 X-RAY: {Object.keys(sec.xrayList || {}).length}대
            {(() => {   // V7.94-03: EDI/리스트에 없는 X-RAY 컨번호 노출 + V7.94-04: 잔존 키 정리 버튼
              //   업로드는 누적(merge) 방식 — 이전 업로드의 옛 키가 안 지워져 미매칭 잔존 발생 (사용자 제보)
              const cnSet = new Set([...Object.keys(sec.ediContainers || {}), ...Object.keys(sec.records || {})]);
              const um = Object.keys(sec.xrayList || {}).filter(cn => !cnSet.has(cn));
              if (um.length === 0) return null;
              const cleanUnmatched = async () => {
                if (!window.confirm(`미매칭 X-RAY ${um.length}대를 리스트에서 삭제합니다.\n${um.join(', ')}\n\n(EDI/리스트에 없는 번호 — 이전 업로드 잔존/오타)\n진행할까요?`)) return;
                const kept = {};
                Object.entries(sec.xrayList || {}).forEach(([cn, v]) => { if (cnSet.has(cn)) kept[cn] = v; });
                await fbSaveXrayList(voyageKey, kept);
                setStatus(`🧹 미매칭 X-RAY ${um.length}대 삭제 — 남은 ${Object.keys(kept).length}대`);
              };
              return (
                <span className="text-red-400 font-bold"> · ⚠미매칭 {um.length}대: {um.join(', ')} (EDI/리스트에 없는 번호)
                  <button onClick={cleanUnmatched}
                    className="ml-2 px-2 py-0.5 rounded bg-red-800 hover:bg-red-700 text-red-100 font-bold">
                    🧹 미매칭 삭제
                  </button>
                </span>
              );
            })()}
            <br/>지원: .xls .xlsx
          </div>
        </div>
      )}

      {!hasOther && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="text-xs text-slate-400">이 항차에 {otherMode === 'discharge' ? '양하' : '선적'} 작업이 같이 있나요?</div>
          {/* M6.46: voy 입력 받기 — 추측하지 않음 */}
          <input
            type="text"
            value={otherVoyInput}
            onChange={e => setOtherVoyInput(e.target.value.toUpperCase())}
            placeholder={`${otherMode === 'discharge' ? '양하' : '선적'} 항차 번호 (예: ${otherMode === 'discharge' ? '0521E' : '0521W'})`}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs uppercase mono focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={async () => {
              const upVoy = otherVoyInput.trim().toUpperCase();
              if (!upVoy) {
                setStatus('❌ 항차 번호를 입력해주세요');
                return;
              }
              const patch = {};
              if (otherMode === 'discharge') patch.voy_d = upVoy;
              else patch.voy_l = upVoy;
              await fbUpdateVoyageInfo(voyageKey, patch);
              await fbSaveSectionData(voyageKey, otherMode, { _created: Date.now() });
              setOtherVoyInput('');
              setMode(otherMode);
            }}
            disabled={!otherVoyInput.trim()}
            className={`w-full py-2 rounded text-sm font-bold ${
              otherMode === 'discharge'
                ? 'bg-blue-900/50 hover:bg-blue-800 disabled:bg-slate-800 text-blue-100 border border-blue-700/40 disabled:text-slate-500'
                : 'bg-amber-900/50 hover:bg-amber-800 disabled:bg-slate-800 text-amber-100 border border-amber-700/40 disabled:text-slate-500'
            }`}
          >
            + {otherMode === 'discharge' ? '양하' : '선적'} 섹션 추가
          </button>
        </div>
      )}

      {status && (
        <pre className="bg-slate-950 border border-slate-800 rounded p-2 text-[11px] text-slate-300 whitespace-pre-wrap mono">
{status}
        </pre>
      )}

      {/* M3.5.4-fix2: 충돌 검토 모달 */}
      <ConflictReviewModal
        open={!!conflictData}
        conflicts={conflictData?.conflicts}
        onClose={() => {
          setConflictData(null);
          setStatus(prev => prev + '\n\n❌ 저장 취소됨');
        }}
        onResolve={applyConflictResolution}
      />

      {/* M3.74: prompt() 대체 - EDI/리스트 업로드 충돌 처리 */}
      <ChoiceModal {...choiceState} />
    </div>
  );
}

function ModeSetup({ voyageKey }) {
  return (
    <div className="bg-amber-900/30 border border-amber-800 rounded-lg p-4 text-center mb-3">
      <div className="text-amber-200 text-sm mb-2">자료를 업로드해주세요</div>
      <div className="text-[11px] text-amber-300/70">자료 탭에서 EDI/ASC 파일부터 시작하세요</div>
    </div>
  );
}

// M8.08: SealPolicyBanner 제거 — 양하/선적 작업 화면에서 엠티 실 작업 패널 미표시.
//   동일 기능은 수석 대시보드(ChiefDashboard)에 구현됨.

// ── V9.16: 이 항차 작업 보고 이력 (읽기 전용) ─────────────────────────
function WorkReportHistory({ voyageKey }) {
  const [reports, setReports] = useState({});
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const unsub = fbSubscribeWorkReports(voyageKey, setReports);
    return () => { try { unsub(); } catch { /* skip */ } };
  }, [voyageKey]);
  const list = Object.entries(reports || {})
    .map(([k, r]) => ({ k, ...(r || {}) }))
    .sort((a, b) => (b.ts || b.at || 0) - (a.ts || a.at || 0));
  if (list.length === 0) return null;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left" style={{ minHeight: 44 }}>
        <span className="text-[13px] font-bold text-slate-200">📤 이 항차 작업 보고 {list.length}건 {open ? '접기' : '보기'}</span>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 max-h-80 overflow-y-auto space-y-1">
          {list.slice(0, 50).map(r => (
            <div key={r.k} className="text-[12px] bg-slate-800/60 rounded px-2.5 py-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">{({work_status:'작업',hatch:'해치',conbox:'콘박스',daynight:'주야간',stop:'중단'}[r.type]) || r.type || '보고'}{r.action ? ` · ${r.action}` : ''}{r.equip ? ` · ${r.equip}호기` : ''}</span>
                <span className="text-slate-500 mono">{(r.ts || r.at) ? new Date(r.ts || r.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              {(r.text || r.message || r.summary) && (
                <div className="text-slate-400 whitespace-pre-wrap mt-0.5 leading-snug">{String(r.text || r.message || r.summary).slice(0, 200)}</div>
              )}
              {r.by && <div className="text-slate-600 text-[11px] mt-0.5">{r.by}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

