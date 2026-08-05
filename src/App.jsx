// 그린마린 평택항 검수 — Master V1.1
// TallyOne 1.0 (판2 팀K): 로그인 화면 강제 · 역할 게이트 · 해시 라우팅 수리(B-1/6/8/12)
import React, { useState, useEffect, useCallback } from 'react';
import { APP_VERSION, _storage, SK } from './utils.js';
import { loadUserBayDict, entryTimestamp, applyApprovedSync } from './data/userBayDict.js';
import {
  fbSubscribeVoyages, fbSubscribeInspectors, fbSetInspector,
  fbSubscribeConnection, fbSetInspectorActivity, fbLogoutInspector, fbSubscribePortMis, fbSubscribePilotForecast, fbSubscribeTerminalWork,
  fbSubscribeStaffList, fbSubscribeDeletedStaff, fbSubscribeShipBayDict, fbSubscribeHeartbeat,
  fbSubscribeMatrixEditors, fbGetAdminGuard, fbReconnect, hasFirebase, fbAuthReady
} from './firebase.js';
import { tenant } from './tenant.js';               // TallyUni 0.2: 회사·앱 이름 단일 소스
import SetupWizard from './pages/SetupWizard.jsx';  // TallyUni 0.2: 첫 실행 마법사(미설정 상태 전용 화면)
import { isAdminName, isOwnerName } from './adminGuard.js';   // V9.11: 관리자 판정 + TallyOne 1.0: 소유자 판정(라우트 게이트)
import { isChief, setServerRoles } from './staffList.js';     // TallyOne 1.0: 역할 게이트 + 서버 직책 캐시(B-4 선행분 연결)
import { IDLE_LOGOUT_MS, isIdleLogout } from './inspectorStatus.js';   // V9.13: 30분 무조작 자동 로그아웃
import { parseHash, exitApp } from './backHandler.js';        // TallyOne 1.0: 해시 파서 단일 소스 + 홈 뒤로가기 종료(B-6)
import { setActivityUser, logActivity, logView } from './activityLog.js';   // TallyOne 1.3: 활동 로그(로그인·로그아웃·화면 열람)
import HomePage from './pages/HomePage.jsx';
import VoyagePage from './pages/VoyagePage.jsx';
import GlobalSearchPage from './pages/GlobalSearchPage.jsx';
import ChiefDashboard from './pages/ChiefDashboard.jsx';
import HealthPage from './pages/HealthPage.jsx';  // V8.40: 항차 건강 점검
import FoodPage from './pages/FoodPage.jsx';       // V8.60: 맛집 수첩+돌림판
import AuxPage from './pages/AuxPage.jsx';         // TallyOne 1.0: 보조기능 화면(#/aux — 팀M 구현)
import LoginPage from './pages/LoginPage.jsx';     // TallyOne 1.0: 로그인 전용 화면 (구 InspectorModal 승격)
import Header from './components/Header.jsx';
import BroadcastMarquee from './components/BroadcastMarquee.jsx';
import StaffManagerModal from './components/StaffManagerModal.jsx';
import GreetingModal from './components/GreetingModal.jsx';
import { fetchPyeongtaekWeather, buildGreetingMessage, buildFarewellMessage, saveLoginTime, getLoginTime, clearLoginTime } from './greeting.js';
import ContainerDetailModal from './components/ContainerDetailModal.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';

// TallyOne 1.0 (K2): 수석 전용 라우트(#/chief·#/search) 접근 차단 안내 화면
function DeniedChiefOnly({ onGoHome }) {
  return (
    <div className="max-w-3xl mx-auto px-3 py-16 text-center text-slate-400">
      <div className="text-5xl mb-4">🔒</div>
      <div className="text-lg font-bold text-slate-200 mb-1">수석 검수사 전용</div>
      <div className="text-sm mb-5">이 화면은 수석·부수석 검수사와 소유자만 열 수 있습니다.</div>
      <button onClick={onGoHome} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-bold">홈으로</button>
    </div>
  );
}

export default function App() {
  // TallyOne 1.0 (B-8): 초기 라우트도 해시 파싱으로 — 홈 깜빡임 제거 (단 아래 로그인 강제가 우선)
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  // TallyOne 1.0: 로그인 전에 열려던 딥링크(#/voyage/... 등) — 로그인 후 그 화면으로 보낸다
  const pendingHashRef = React.useRef('');
  const [voyages, setVoyages] = useState({});
  const [voyagesLoaded, setVoyagesLoaded] = useState(false);  // V8.27: 딥링크 #310 방지 — 로드 전엔 VoyagePage 미마운트
  const [inspectors, setInspectors] = useState({});
  const [extraStaff, setExtraStaff] = useState({});
  const [deletedStaff, setDeletedStaff] = useState({});  // M5.74: 퇴사자 마커  // M5.62: 김성일이 추가한 동적 명단
  // V9.11: 관리자 가드 — 종전에는 `inspector === '김성일'` 하드코딩이라 V9.09에서 권한을 넘겨받은
  //   관리자에게 헤더 ⚙(인원 관리) 버튼이 아예 안 보였다(인수인계가 실질적으로 반쪽).
  const [adminGuard, setAdminGuard] = useState(null);
  // V9.13: 무조작 자동 로그아웃 — 마지막 화면 조작 시각(ref: 리렌더 없이 갱신) + 안내 문구
  const lastInputRef = React.useRef(Date.now());
  const [autoLogoutNotice, setAutoLogoutNotice] = useState('');
  // M5.21: PORT-MIS 입출항 데이터 (Chrome 확장이 저장 — 호출부호로 매칭)
  const [portMisData, setPortMisData] = useState({});
  // V9.33: 평택도선사회 도선 예보(수집기 기록) — 선박코드 키
  const [pilotForecast, setPilotForecast] = useState({});
  // V9.36: 터미널 작업 현황(진행률·출항 ETD) — 작업 마무리 시 출항시간 표기용
  const [terminalWork, setTerminalWork] = useState({});
  // M3.6: 자동 로그인 제거 - 매번 검수원 입력 (TallyOne 1.0: 모달 → 로그인 화면으로 승격)
  const [inspector, setInspector] = useState('');
  const [showStaffManager, setShowStaffManager] = useState(false);  // M5.73
  const [online, setOnline] = useState(true);
  // TallyOne 1.5: 화면 데이터만 새로고침 — 페이지 리로드 없이 실시간 구독 재연결(로그인 유지).
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(0);
  const handleRefreshData = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // TallyOne 1.8-12: 재연결 결과를 확인한다. 끊고 다시 붙이는 동작이라, 못 붙으면
      //   상단 배너가 '오프라인'에 멈춘 채 남는다(2026-08-05 실측). 그걸 조용히 넘기지 않는다.
      const r = await fbReconnect();
      setRefreshedAt(Date.now());
      if (r && r.online === false) {
        alert('데이터 새로고침 — 서버 재연결을 확인하지 못했습니다.\n\n상단에 오프라인 표시가 남아 있으면 화면을 새로고침(F5) 해 주세요.\n저장한 내용은 사라지지 않습니다.');
      }
    } catch (e) {
      console.warn('[새로고침] 재연결 실패', e);   // 조용히 실패하지 않는다(3금지 3번)
      alert('데이터 새로고침 실패 — 네트워크를 확인해 주세요.');
    } finally {
      setRefreshing(false);
    }
  };
  const [globalDetail, setGlobalDetail] = useState(null);
  // M3.6: 인사 모달
  const [greeting, setGreeting] = useState(null);  // {type: 'login'|'logout', lines, voice, ...}
  const [weather, setWeather] = useState(null);
  const [heartbeat, setHeartbeat] = useState(null);  // V8.40: 수집기 하트비트
  // V9.05: 공유 정본보다 오래된 로컬 베이사전 사본 목록 (관리자 승인 후 갱신)
  const [bayDictSyncPending, setBayDictSyncPending] = useState([]);

  // TallyOne 1.0: 앱 시작은 항상 로그인 화면(자동 로그인 없음 — 사용자 확정 사양).
  //   원래 열려던 해시는 pendingHashRef에 보관 → 로그인 성공 시 권한 검사 후 그 해시로 진입.
  //   replaceState라 히스토리에 로그인 이전 엔트리가 쌓이지 않는다.
  useEffect(() => {
    const h = window.location.hash;
    if (h && h !== '#' && h !== '#/' && !h.startsWith('#/login')) pendingHashRef.current = h;
    window.history.replaceState(null, '', '#/login');
    setRoute({ name: 'login' });
  }, []);

  useEffect(() => {
    // TallyUni 0.2: Firebase 미설정(첫 실행)이면 구독을 아예 걸지 않는다 — db가 null이라 ref()가 던진다.
    //   이 상태에서는 아래 렌더 게이트가 SetupWizard만 그린다.
    if (!hasFirebase()) return;
    // TallyUni 0.3: 보안 규칙이 `auth != null`이라 익명 로그인이 끝나기 전에 구독을 걸면
    //   전부 permission_denied로 끊긴다. 로그인 완료를 기다린 뒤에 등록한다.
    //   해제 함수는 subs 배열에 모아 cleanup에서 호출한다(await 사이에 언마운트되면 alive=false로 등록 자체를 건너뛴다).
    let alive = true;
    const subs = [];
    (async () => {
      await fbAuthReady();
      if (!alive) return;
    const u1 = fbSubscribeVoyages((v) => { setVoyages(v); setVoyagesLoaded(true); });
    const u2 = fbSubscribeInspectors(setInspectors);
    // TallyOne 1.0 (K5): 서버 직책을 staffList 모듈 캐시에 먼저 밀어 넣고(setServerRoles),
    //   그 다음 state 반영(setExtraStaff) — 순서가 바뀌면 첫 렌더가 옛 직책으로 판정한다.
    const unsub2 = fbSubscribeStaffList((m) => { setServerRoles(m); setExtraStaff(m); });
    const unsub3 = fbSubscribeDeletedStaff(setDeletedStaff);
    const u3 = fbSubscribeConnection(setOnline);
    const u4 = fbSubscribePortMis(setPortMisData);  // M5.21: PORT-MIS 데이터
    const u4b = fbSubscribePilotForecast(setPilotForecast);  // V9.33: 도선 예보
    const u4c = fbSubscribeTerminalWork(setTerminalWork);   // V9.36: 터미널 작업 현황
    const u6 = fbSubscribeHeartbeat(setHeartbeat);  // V8.40: 수집기 하트비트
    // M5.88: Firebase 베이사전 구독 — 전역 객체 window.__fbShipBayDict에 저장
    //   shipStructure.js가 이 데이터를 우선 조회 (베이사전 매칭 자동화)
    // M6.94.20: user 소스 매트릭스를 localStorage userBayDict에도 머지
    //   → PC에서 만든 user 매트릭스를 폰에서도 받아서 카고플랜 룩업 가능 (읽기 전용 수신).
    //   원칙 ① 보호: source==='user'(또는 _userOwned) entry만 머지하고,
    //   로컬에 이미 더 최신(updatedAt) user entry가 있으면 덮어쓰지 않는다.
    // V9.05: 베이사전 쓰기 게이트용 권한자 명단 캐시 (bayDictGuard.js가 참조)
    const u7 = fbSubscribeMatrixEditors(list => { window.__gmMatrixEditors = Array.isArray(list) ? list : []; });
    const u5 = fbSubscribeShipBayDict(data => {
      window.__fbShipBayDict = data || {};
      // V7.94-07: 콘앱(Firebase 미로드, 같은 오리진)이 읽을 수 있게 localStorage에 미러.
      //   용량 초과(QuotaExceeded) 시 조용히 생략 — 메인 앱 동작에는 영향 없음.
      try { localStorage.setItem('gm_fb_baydict_cache', JSON.stringify(data || {})); } catch (e) { /* skip */ }
      // ── V9.05: 조용한 자동 덮어쓰기 제거 (관리자 원칙: 매트릭스는 앱이 스스로 수정 금지) ──
      //   기존 M6.94.20 자동 머지는 ①타임스탬프 비교가 NaN(ISO 문자열)으로 깨져 있었고
      //   ②알림·이력 없이 로컬 user 사전을 덮어썼다 (2026-07-21 SWAT 사건 계기 재설계).
      //   이제는 "공유 정본이 로컬 사본보다 최신"인 항목을 탐지만 하고,
      //   관리자가 배너에서 승인해야 applyApprovedSync로 반영한다.
      //   (오프라인 조회는 gm_fb_baydict_cache 폴백이 있어 자동 머지 없이도 동작.)
      try {
        const fb = data || {};
        const local = loadUserBayDict() || {};
        const pending = [];
        for (const code of Object.keys(fb)) {
          const e = fb[code];
          const isUser =
            e?.source === 'user' || e?.bayDef?.source === 'user' ||
            e?._userOwned === true || e?.bayDef?._userOwned === true;
          if (!isUser || !e?.bayDef) continue;
          const cur = local[code];
          if (!cur) continue;   // 로컬에 사본이 없으면 FB 폴백 조회 — 문제 없음
          if (entryTimestamp(e) > entryTimestamp(cur)) pending.push(code);
        }
        setBayDictSyncPending(pending);
      } catch (err) {
        console.error('[App] 베이사전 정본 대조 실패', err);
      }
    });
    subs.push(u1, u2, u3, u4, u4b, u4c, u5, u6, u7, unsub2, unsub3);
    })();
    return () => { alive = false; subs.forEach(f => { try { f(); } catch (e) { /* skip */ } }); };
  }, []);

  useEffect(() => {
    // TallyUni 0.2: 미설정(첫 실행) 상태에서는 조회하지 않는다 — db=null이라 조회가 실패하며
    //   콘솔에 오류만 남긴다(마법사 화면에서 무의미). 게이트를 구독 useEffect와 같은 조건으로 맞춘다.
    if (!hasFirebase()) return;
    let alive = true;
    // TallyUni 0.3: 익명 로그인 뒤에 조회 — 로그인 전이면 규칙(auth != null)에 막혀 항상 실패한다.
    (async () => {
      await fbAuthReady();
      if (!alive) return;
      fbGetAdminGuard().then(g => { if (alive) setAdminGuard(g); }).catch(() => {});
    })();
    return () => { alive = false; };
  }, [inspector]);
  const isAdmin = isAdminName(adminGuard, inspector);
  // TallyOne 1.0 (K2): 라우트 게이트 — 수석(부수석 포함) 또는 소유자만 #/chief·#/search
  const chiefOrOwner = isChief(inspector) || isOwnerName(inspector);

  // V9.05: 관리자 승인 시 공유 정본을 로컬 사본에 반영
  const handleApproveBayDictSync = useCallback(() => {
    const codes = bayDictSyncPending;
    if (!codes || codes.length === 0) return;
    const okGo = window.confirm(`베이사전 로컬 사본 ${codes.length}건(${codes.join(', ')})을 공유 정본으로 갱신할까요?`);
    if (!okGo) return;
    const res = applyApprovedSync(window.__fbShipBayDict || {}, codes);
    if (res.ok && res.applied > 0) {
      setBayDictSyncPending([]);
      alert(`✅ ${res.applied}건 갱신 완료`);
    } else if (!res.ok) {
      alert('갱신 실패 — 권한 또는 저장 오류. 콘솔을 확인하세요.');
    }
  }, [bayDictSyncPending]);

  // TallyOne 1.0 (B-12): 해시 → 라우트 동기화는 parseHash 단일 파서만 쓴다
  // TallyUni 0.2: 브라우저 탭 제목도 테넌트 값으로 (기본 테넌트면 "TallyOne — 평택항 검수").
  useEffect(() => {
    const T = tenant();
    document.title = `${T.appTitle} — ${T.homePortName}항 검수`;
  }, []);

  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // TallyOne 1.0 (B-6): 홈 뒤로가기 — 종전에는 홈 진입마다 pushState를 무조건 반복해
  //   가짜 엔트리가 무한 누적됐다. 이제 가드 엔트리(gmHomeGuard)를 1개만 유지하고,
  //   홈에서 뒤로가면 종료 확인 → 확인 시 exitApp, 취소 시 가드 재장전.
  useEffect(() => {
    if (route.name !== 'home' || !inspector) return;
    if (!(window.history.state && window.history.state.gmHomeGuard)) {
      window.history.pushState({ gmHomeGuard: true }, '', '#/');
    }
    const handler = () => {
      const h = window.location.hash;
      if (h && h !== '#' && h !== '#/') return;   // 다른 라우트로의 정상 이동은 통과
      const okExit = window.confirm('TallyOne 검수앱을 종료할까요?');
      if (okExit) exitApp();
      else window.history.pushState({ gmHomeGuard: true }, '', '#/');
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [route.name, inspector]);

  useEffect(() => {
    if (!inspector) return;
    const tick = () => {
      const voyageKey = route.name === 'voyage' ? route.voyageKey : null;
      const mode = route.name === 'voyage' ? (route.mode || null) : null;
      fbSetInspectorActivity(inspector, voyageKey, mode).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [inspector, route]);

  // TallyOne 1.3: 화면 열람 기록 — 라우트 변경마다 1건(30초 중복 생략은 activityLog가 처리).
  //   voyage는 VoyagePage가 탭·모드까지 붙여 기록하므로 여기서 빼고(이중 기록 방지), login도 제외.
  useEffect(() => {
    if (!inspector) return;
    if (route.name === 'login' || route.name === 'voyage') return;
    logView({ route: route.name });
  }, [inspector, route.name]);

  // TallyOne 1.0: 로그인 화면 강제(자동 로그아웃·로그아웃 완료 시) — replaceState라 스택에 안 쌓임
  const forceLoginScreen = useCallback(() => {
    window.history.replaceState(null, '', '#/login');
    setRoute({ name: 'login' });
  }, []);

  // ── V9.13(2026-07-27): 30분 무조작 자동 로그아웃 (사용자 요청) ───────────────
  //   왜: 로그인해 두고 앱을 만지지 않아도 30초 하트비트 때문에 계속 '로그인/작업중'으로 남았다.
  //   기준은 화면 조작(터치·클릭·키·스크롤). 조작이 30분 없으면 그 기기에서 스스로 로그아웃하고
  //   로그인 화면을 띄운다. 작업 기록은 그대로 남는다(로그아웃 마킹만).
  useEffect(() => {
    if (!inspector) return;
    lastInputRef.current = Date.now();
    const mark = () => { lastInputRef.current = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
    evs.forEach(e => window.addEventListener(e, mark, { passive: true, capture: true }));
    const check = () => {
      if (!isIdleLogout(lastInputRef.current)) return;
      // TallyOne 1.3: 자동 로그아웃 기록 — 사용자 이름이 지워지기 전에 남긴다(fire-and-forget)
      logActivity('logout', { via: 'idle' });
      setActivityUser('');
      fbLogoutInspector(inspector).catch(() => {});
      clearLoginTime();
      _storage.set(SK.activeInspector, '');
      setInspector('');
      setAutoLogoutNotice(`${Math.round(IDLE_LOGOUT_MS / 60000)}분 동안 사용이 없어 자동 로그아웃됐습니다. 이름을 다시 선택하세요.`);
      forceLoginScreen();   // TallyOne 1.0: 모달 대신 로그인 화면으로
    };
    const id = setInterval(check, 30000);
    // 폰이 잠겨 타이머가 멈췄다 돌아오는 경우 — 화면 복귀 즉시 한 번 더 검사
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      evs.forEach(e => window.removeEventListener(e, mark, { capture: true }));
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(id);
    };
  }, [inspector, forceLoginScreen]);

  // M6.42: STOWAGE PDF는 영구 보관 — 시간 기반 자동 폐기 제거
  //   비용 분석: 300척 × 3MB = 900MB → 월 ₩25 (매우 적음)
  //   사용자 결정: 자동 폐기보다 라이브러리로 영구 보관이 더 가치 있음
  //   같은 선박 새 PDF 등록 시 이전 자동 삭제 (덮어쓰기) 정책은 유지 — fbUploadStowagePdf 내부 로직

  const handleSelectInspector = useCallback(async (name) => {
    setInspector(name);
    lastInputRef.current = Date.now();     // V9.13: 로그인 순간부터 무조작 시간 다시 셈
    setAutoLogoutNotice('');
    _storage.set(SK.activeInspector, name);
    // TallyOne 1.3: 로그인 기록 — 검수원 선택 성공이 유일한 로그인 경로(자동 로그인 없음)
    setActivityUser(name);
    logActivity('login', { via: 'select' });
    await fbSetInspector(name);
    // M3.6: 로그인 시각 저장
    saveLoginTime(name);
    // TallyOne 1.0: 역할별 진입 — 수석·소유자는 #/chief, 그 외 #/.
    //   로그인 전 딥링크(pendingHash)가 있으면 거기로(수석 전용 화면은 권한 통과 시에만).
    //   replaceState로 로그인 엔트리를 대체 — 뒤로가기 스택에 로그인 화면이 남지 않는다.
    const roleGate = isChief(name) || isOwnerName(name);
    let target = pendingHashRef.current || '';
    pendingHashRef.current = '';
    if (target) {
      const r = parseHash(target);
      if (r.name === 'login') target = '';
      else if ((r.name === 'chief' || r.name === 'search') && !roleGate) target = '';
    }
    if (!target) target = roleGate ? '#/chief' : '#/';
    window.history.replaceState(null, '', target);
    setRoute(parseHash(target));
    // M3.6: 날씨 + 인사 (화면 전환 뒤에 조회 — 날씨 응답을 기다리며 로그인이 멈추지 않게)
    const w = await fetchPyeongtaekWeather();
    setWeather(w);
    // M4.2: 인사말 하루 1회 — 같은 날(YYYY-MM-DD) 재로그인 시 인사말 스킵
    //   사용자 요청: 수시로 접속하는데 매번 인사가 나와서 보기 불편
    //   날짜가 바뀌면 다시 표시 (자정 지나면 새로 인사)
    const today = new Date().toISOString().slice(0, 10);
    const lastGreetingDay = _storage.get(SK.lastGreetingDay);
    if (lastGreetingDay !== today) {
      const g = buildGreetingMessage(name, w);
      setGreeting({ type: 'login', ...g });
      _storage.set(SK.lastGreetingDay, today);
    }
    // M3.88: 로그인 인사 음성 제거 (호불호 많음 - 사용자 요청)
  }, []);

  // M3.6: 로그아웃 처리 — TallyOne 1.0 (B-7): 확인 단계는 Header(ConfirmModal)가 먼저 밟는다.
  //   여기 도달했다는 것은 사용자가 이미 [로그아웃]을 확인했다는 뜻 — 그때만 서버에 마킹한다.
  const handleLogout = useCallback(async () => {
    if (!inspector) return;
    // TallyOne 1.3: 수동 로그아웃 기록 — Header ConfirmModal 확인을 거쳐 여기 도달한 시점이 확정
    logActivity('logout', { via: 'manual' });
    fbLogoutInspector(inspector).catch(() => {});   // V7.94-14: 서버에 로그아웃 즉시 마킹
    const loginTime = getLoginTime();
    const workDuration = loginTime ? (Date.now() - loginTime) : 0;
    // 최신 날씨 다시 조회
    const w = await fetchPyeongtaekWeather();
    const f = buildFarewellMessage(inspector, w, workDuration);
    setGreeting({ type: 'logout', ...f, inspectorName: inspector });
    // M3.88: 로그아웃 인사 음성도 제거
  }, [inspector]);

  // 인사 모달 닫기 + 로그아웃 시 실제 로그아웃 진행
  const handleCloseGreeting = useCallback(() => {
    if (greeting?.type === 'logout') {
      // 실제 로그아웃 진행 → TallyOne 1.0: #/login으로
      clearLoginTime();
      _storage.set(SK.activeInspector, '');
      setInspector('');
      setActivityUser('');   // TallyOne 1.3: 로그아웃 완료 — 이후 열람은 기록하지 않는다
      forceLoginScreen();
    }
    setGreeting(null);
  }, [greeting, forceLoginScreen]);

  const navigate = useCallback((target) => {
    if (target === 'home') window.location.hash = '#/';
    else if (target === 'search') window.location.hash = '#/search';
    else if (target === 'chief') window.location.hash = '#/chief';
    else if (target === 'health') window.location.hash = '#/health';  // V8.40
    else if (target === 'food') window.location.hash = '#/food';      // V8.60
    else if (target === 'aux') window.location.hash = '#/aux';        // TallyOne 1.0: 보조기능
    else if (target === 'login') window.location.hash = '#/login';    // TallyOne 1.0: 검수원 변경
    // TallyOne 1.0 (B-1): 양하/선적 모드까지 해시에 인코딩 — #/voyage/KEY/discharge|loading
    else if (target.voyageKey) window.location.hash = `#/voyage/${encodeURIComponent(target.voyageKey)}${target.mode ? `/${target.mode}` : ''}`;
  }, []);

  // ── TallyUni 0.2: 첫 실행 게이트 — Firebase 설정이 없으면 마법사만 그린다. ──
  //   로그인·라우팅·구독 전부 건너뛴다(구독 useEffect도 같은 조건으로 조기 return).
  if (!hasFirebase()) return <SetupWizard />;

  // ── TallyOne 1.0: 로그인 게이트 — 로그인 전에는 어떤 라우트도 렌더하지 않는다. ──
  //   로그인 상태에서 #/login에 오면 검수원 변경 화면(돌아가기 버튼 제공).
  if (!inspector || route.name === 'login') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <UpdatePrompt/>
        <LoginPage
          current={inspector}
          inspectors={inspectors}
          extraStaff={extraStaff}
          deletedStaff={deletedStaff}
          notice={autoLogoutNotice}
          onSelect={handleSelectInspector}
          onCancel={inspector ? () => window.history.back() : null}
        />
        {/* 로그아웃 작별 인사 모달 — 닫으면 로그인 화면 유지 */}
        {greeting && (
          <GreetingModal
            type={greeting.type}
            lines={greeting.lines}
            workForecast={greeting.workForecast}
            onClose={handleCloseGreeting}
          />
        )}
        <footer className="text-center text-[11px] text-slate-600 pb-8 pt-2 leading-relaxed">
          © 2026 {tenant().company} · 개발 연지아빠 · 저작권은 개발자 연지아빠에게 있습니다<br/>
          <span className="opacity-70">{APP_VERSION}</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <UpdatePrompt/>
      <Header
        version={APP_VERSION}
        inspector={inspector}
        online={online}
        route={route}
        voyages={voyages}
        onChangeInspector={() => { setAutoLogoutNotice(''); navigate('login'); }}
        onOpenStaffManager={isAdmin ? () => setShowStaffManager(true) : null}
        onGoHome={() => navigate('home')}
        onOpenAux={() => navigate('aux')}
        onLogout={handleLogout}
      />

      <BroadcastMarquee inspector={inspector} />

      {/* V9.05: 베이사전 정본 갱신 대기 배너 — 관리자에게만, 승인해야 반영 */}
      {isAdmin && bayDictSyncPending.length > 0 && (
        <div className="bg-amber-900/60 border-b border-amber-600/50 text-amber-100 text-xs px-3 py-2 flex items-center justify-between gap-2">
          <span>📚 베이사전 로컬 사본 {bayDictSyncPending.length}건이 공유 정본보다 오래됨: {bayDictSyncPending.slice(0, 6).join(', ')}{bayDictSyncPending.length > 6 ? ' 외' : ''}</span>
          <button onClick={handleApproveBayDictSync} className="bg-amber-600 hover:bg-amber-500 text-slate-900 font-bold px-3 py-1 rounded flex-shrink-0">정본으로 갱신</button>
        </div>
      )}
      <main className="pb-20">
        {route.name === 'home' && (
          <HomePage
            voyages={voyages} inspectors={inspectors} inspector={inspector}
            portMisData={portMisData}
            pilotForecast={pilotForecast}
            terminalWork={terminalWork}
            onRefreshData={handleRefreshData} refreshing={refreshing} refreshedAt={refreshedAt}
            onOpenVoyage={(voyageKey, mode) => navigate(mode ? { voyageKey, mode } : { voyageKey })}
            onOpenChiefDashboard={() => navigate('chief')}
            heartbeat={heartbeat}
            onOpenAux={() => navigate('aux')}
          />
        )}
        {route.name === 'food' && (
          <FoodPage inspector={inspector} onGoHome={() => navigate('home')}/>
        )}
        {route.name === 'health' && (
          <HealthPage
            voyages={voyages} heartbeat={heartbeat}
            onOpenVoyage={(voyageKey, mode) => navigate(mode ? { voyageKey, mode } : { voyageKey })}
          />
        )}
        {/* TallyOne 1.0 (K2): 통합검색은 수석·소유자 전용 */}
        {route.name === 'search' && (
          chiefOrOwner ? (
            <GlobalSearchPage
              voyages={voyages}
              onOpenContainer={(c) => setGlobalDetail(c)}
            />
          ) : (
            <DeniedChiefOnly onGoHome={() => navigate('home')}/>
          )
        )}
        {/* TallyOne 1.0 (K2): 수석 대시보드 게이트 (ChiefDashboard 내부 가드와 이중 방어) */}
        {route.name === 'chief' && (
          chiefOrOwner ? (
            <ChiefDashboard
              voyages={voyages} inspectors={inspectors} inspector={inspector}
              collectorHb={heartbeat}
              pilotForecast={pilotForecast}
              terminalWork={terminalWork}
              onRefreshData={handleRefreshData} refreshing={refreshing} refreshedAt={refreshedAt}
              onOpenVoyage={(voyageKey, mode) => navigate(mode ? { voyageKey, mode } : { voyageKey })}
              onGoHome={() => navigate('home')}
              onOpenGlobalSearch={() => navigate('search')}
            />
          ) : (
            <DeniedChiefOnly onGoHome={() => navigate('home')}/>
          )
        )}
        {/* TallyOne 1.0: 보조기능 화면 (#/aux — 구현은 팀M AuxPage) */}
        {route.name === 'aux' && (
          <AuxPage
            inspector={inspector}
            isChief={isChief(inspector)}
            isOwner={isOwnerName(inspector)}
            voyages={voyages}
            collectorHb={heartbeat}
          />
        )}
        {route.name === 'voyage' && (
          voyages[route.voyageKey] ? (
          <VoyagePage
            initModeOverride={route.mode || null}
            voyageKey={route.voyageKey}
            voyage={voyages[route.voyageKey]}
            inspector={inspector}
            inspectors={inspectors}
            portMisData={portMisData}
            pilotForecast={pilotForecast}
            onGoHome={() => navigate('home')}
            onModeChange={(mode) => {
              // TallyOne 1.0 (B-1/B-2): 모드를 해시에도 기록 — 새로고침·공유 시 모드 유지.
              //   replaceState라 모드 전환이 뒤로가기 스택에 쌓이지 않는다(hashchange 미발화 → setRoute 직접).
              const h = `#/voyage/${encodeURIComponent(route.voyageKey)}${mode ? `/${mode}` : ''}`;
              window.history.replaceState(window.history.state, '', h);
              setRoute(r => ({ ...r, mode }));
            }}
          />
          ) : voyagesLoaded ? (
            <div className="max-w-3xl mx-auto px-3 py-16 text-center text-slate-400">
              항차를 찾을 수 없습니다.
              <div className="mt-3"><button onClick={() => navigate('home')} className="px-4 py-2 bg-slate-800 rounded text-slate-200">홈으로</button></div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-3 py-16 text-center text-slate-400">항차 불러오는 중…</div>
          )
        )}
      </main>

      <footer className="text-center text-[11px] text-slate-600 pb-24 pt-4 leading-relaxed">
        © 2026 {tenant().company} · 개발 연지아빠 · 저작권은 개발자 연지아빠에게 있습니다<br/>
        <span className="opacity-70">{APP_VERSION}</span>
      </footer>

      {showStaffManager && (
        <StaffManagerModal
          current={inspector}
          inspectors={inspectors}
          extraStaff={extraStaff}
          deletedStaff={deletedStaff}
          onClose={() => setShowStaffManager(false)}
        />
      )}

      {/* M3.68: 로그인/로그아웃 인사 모달 + 근무 시간대 예보 */}
      {greeting && (
        <GreetingModal
          type={greeting.type}
          lines={greeting.lines}
          workForecast={greeting.workForecast}
          onClose={handleCloseGreeting}
        />
      )}

      {globalDetail && (() => {
        const v = voyages[globalDetail.voyageKey];
        if (!v) return null;
        const sec = v[globalDetail.mode];
        const xrayMap = sec?.xrayList || {};
        const compMap = sec?.completed || {};
        const xraySeals = sec?.xraySeals || {};
        // M3.87: 위치 수정 충돌 검사용 - 같은 모드의 모든 컨테이너 (EDI + records 머지)
        const ediMap = sec?.ediContainers || {};
        const recMap = sec?.records || {};
        const allCnSet = new Set([...Object.keys(ediMap), ...Object.keys(recMap)]);
        const allContainers = [...allCnSet].map(cn => {
          const e = ediMap[cn] || {};
          const r = recMap[cn] || {};
          return { ...e, ...Object.fromEntries(Object.entries(r).filter(([k,vv]) => vv !== '' && vv != null)), cn, _comp: compMap[cn] || null };
        });
        return (
          <ContainerDetailModal
            c={globalDetail}
            comp={compMap[globalDetail.cn]}
            isXray={globalDetail.mode === 'discharge' && !!xrayMap[globalDetail.cn]}
            xraySeal={xraySeals[globalDetail.cn] || ''}
            mode={globalDetail.mode}
            voyageKey={globalDetail.voyageKey}
            voyageInfo={v.info}
            inspector={inspector}
            onClose={() => setGlobalDetail(null)}
            allContainers={allContainers}
          />
        );
      })()}
    </div>
  );
}
