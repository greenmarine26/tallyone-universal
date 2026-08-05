// TallyOne 1.3: 활동 로그 — "누가 언제 무엇을 봤는지" 기록의 단일 진입점
//   배경(사용자 확정 2026-08-03) — 검수원들이 로그인만 하고 작업량이 없다.
//   뭘 보려고 들어왔는지 알아야 앱 개선 방향이 나오므로, 쓰기 행위만이 아니라
//   화면 열람(view)·끝4 조회(lookup)·자연어 검색(nls)·로그인/로그아웃을 남긴다.
//   저장 구조 — activity_log/{YYMMDD}/{pushKey} = { who, at, type, ...detail }
//   원칙 — fire-and-forget. 실패해도 화면을 절대 막지 않는다(열람 로그는 유실 허용,
//   오프라인 큐 없음 — 단순함 우선). 실패는 console.warn 1줄(같은 사유 60초 1회).

// ── 현재 검수원 — App(로그인·로그아웃 지점)이 주입한다. 미로그인이면 기록하지 않는다 ──
let _user = '';
export function setActivityUser(name) {
  _user = String(name || '').trim();
}

// ── 일 단위 버킷 키(YYMMDD, 로컬 시각) — firebase.js 조회·정리와 공용하는 단일 소스 ──
export function activityDayKey(ts) {
  const d = new Date(ts);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getFullYear() % 100)}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
}

// ── 30일 정리 대상 버킷 고르기(순수 함수 — 노드 시뮬 검증 대상) ──
//   keepDays=30이면 오늘 포함 30개 버킷을 남기고, 그보다 오래된 키만 돌려준다.
//   YYMMDD 여섯 자리 고정이라 문자열 비교가 곧 날짜 비교다(2100년까지 안전).
export function pickExpiredActivityBuckets(keys, keepDays = 30, now = Date.now()) {
  const cutoff = activityDayKey(now - (keepDays - 1) * 86400000);
  return (keys || []).filter(k => /^\d{6}$/.test(k) && k < cutoff);
}

// ── 실패 경고 폭주 방지 — 같은 사유는 60초에 1회만 warn(조용한 실패 금지·화면 방해 금지의 절충) ──
const _warnAt = {};
function _warnOnce(e) {
  const reason = String((e && e.message) || e || 'unknown');
  const now = Date.now();
  if (_warnAt[reason] && now - _warnAt[reason] < 60000) return;
  _warnAt[reason] = now;
  console.warn('[활동로그] 기록 실패(무해) —', reason);
}

// ── firebase 지연 로드 — firebase.js가 이 파일의 activityDayKey를 정적 import하므로
//   이쪽은 동적 import로 순환 참조를 피한다. 로드 실패도 _warnOnce로 드러난다.
let _fbPushActivity = null;
async function _push(dayKey, payload) {
  if (!_fbPushActivity) {
    const m = await import('./firebase.js');
    _fbPushActivity = m.fbPushActivity;
  }
  return _fbPushActivity(dayKey, payload);
}

// ── 활동 1건 기록 — fire-and-forget. 렌더·이벤트 경로를 절대 막지 않는다 ──
export function logActivity(type, detail = {}) {
  if (!_user || !type) return;
  try {
    const at = Date.now();
    const payload = { who: _user, at, type };
    for (const [k, v] of Object.entries(detail || {})) {
      if (v === undefined || v === null || v === '') continue;   // Firebase는 undefined 거부 — 빈 값은 버킷만 키운다
      payload[k] = v;
    }
    _push(activityDayKey(at), payload).catch(_warnOnce);
  } catch (e) {
    _warnOnce(e);
  }
}

// ── view 전용 — 같은 대상(route+voyageKey+mode+tab) 연속 중복은 30초 스로틀 ──
const VIEW_THROTTLE_MS = 30000;
let _lastViewSig = '';
let _lastViewAt = 0;
export function logView(detail = {}) {
  const sig = [detail.route || '', detail.voyageKey || '', detail.mode || '', detail.tab || ''].join('|');
  const now = Date.now();
  if (sig === _lastViewSig && now - _lastViewAt < VIEW_THROTTLE_MS) return;
  _lastViewSig = sig;
  _lastViewAt = now;
  logActivity('view', detail);
}

// ── 조회(lookup)·자연어(nls) 확정 판정 — 검색창이 라이브 필터라 확정 버튼이 없다 ──
//   타이핑이 멈춘 시점(settleMs)을 조회 확정 1회로 본다. 같은 질의가 30초 안에
//   다시 확정되면 생략(지웠다 되친 중복 방지). 질의는 80자로 자른다(버킷 절약).
const QUERY_DEDUPE_MS = 30000;
const _qTimers = {};
const _qLast = {};
export function logQuerySettled(type, q, detail = {}, settleMs = 1200) {
  const key = `${type}|${detail.voyageKey || ''}`;
  const s = String(q || '').trim();
  clearTimeout(_qTimers[key]);
  if (s.length < 2) return;
  _qTimers[key] = setTimeout(() => {
    const prev = _qLast[key];
    const now = Date.now();
    if (prev && prev.q === s && now - prev.at < QUERY_DEDUPE_MS) return;
    _qLast[key] = { q: s, at: now };
    logActivity(type, { ...detail, q: s.slice(0, 80) });
  }, settleMs);
}
