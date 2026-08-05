// 항차 카드 배지 판정 — **단일 규칙**. 검수앱(HomePage)·콘앱이 이 파일만 쓴다.
//
// 왜 모았나: 같은 판단이 HomePage.jsx 와 cone.html 두 곳에 복사돼 있었고 가드 구현이 서로 달랐다.
//   기준을 바꾸려면 두 곳을 고쳐야 했다(3금지①의 전형). 이제 고칠 자리는 여기 하나다.
//
// ── 기준 (사용자 확답 2026-08-02) ───────────────────────────────────────────
// ⛔ 종전 `진행률 ≥ 90%`는 틀린 자였다.
//    "600개의 10%는 60개, 2갱이면 한 시간 이상 / 100개의 10%면 10개, 2갱이면 5분이면 끝남."
//    같은 10%가 상황에 따라 한 시간이 되기도 5분이 되기도 하므로 준비 시간 확보에 쓸 수 없다.
// ✅ **남은 개수**로 본다. 마무리 단계에서는 갱이 하나씩 빠지고 **마지막 한 갱**이 남은 걸 처리하므로
//    갱수로 나누지 않는다(갱당 시간당 20개 → 잔여 20개 ≈ 1시간).
// ✅ **선적 잔여만 본다** — 양하는 먼저 끝나므로 출항 시점을 정하는 건 선적이다.
//    선적이 없는 항차(ATPR 2635E 등)는 양하 잔여로 본다.
// ✅ **터미널이 DEPARTED면 무조건** 출항 — 검수 완료 버튼을 미처 못 눌러 잔여가 남아 있어도 넘어간다.
// ✅ **한 번 뜨면 유지** — 자료가 늦게 도착해 잔여가 다시 늘어도 작업일시로 되돌아가지 않는다(깜빡임 방지).
//
// 잔여의 출처는 **검수앱 자신**이다(총 − completed). 검수 중이면 이게 실시간이고 가장 정확하다.
// 터미널 자료는 참조이자 폴백이지 기준이 아니다 — 콘앱처럼 잔여를 모르는 화면에서만 쓴다.

export const DEPART_REMAIN_MAX = 20;   // 잔여 이하이면 출항 배지. 갱당 시간당 20개 ≈ 1시간분.
export const WINDOW_H = 12;            // 터미널·도선 자료의 항차 귀속 가드(시간)
export const FALLBACK_PCT = 90;        // 잔여를 모를 때만 쓰는 옛 기준(콘앱 등)

/** 터미널·도선 값이 이 항차 것인가 — 자료가 선박코드로만 오므로 직전/다음 기항이 붙는 걸 막는다. */
export function inWindow(t, eta, etd) {
  if (t == null || (eta == null && etd == null)) return false;
  const lo = (eta ?? etd) - WINDOW_H * 3600000;
  const hi = (etd ?? eta) + WINDOW_H * 3600000;
  return t >= lo && t <= hi;
}

// V9.57: 미인식 terminalStatus 경고 1회 기록용 (decideBadge는 카드마다 렌더마다 불린다)
const _warnedStatus = new Set();

/**
 * @param {object}  a
 * @param {number?} a.remainLoad  선적 잔여(총−완료). 모르면 null
 * @param {number?} a.remainDis   양하 잔여. 모르면 null
 * @param {boolean} a.hasLoad     이 항차에 선적이 있는가
 * @param {string}  a.terminalStatus  'departed' | 'working' | 'planned' | ''  (판B에서 채워짐)
 * @param {object?} a.tw          terminal_work 레코드(폴백용: pct·delayed·depEtd)
 * @param {number?} a.pfDep       도선 nextDep(ms) — 창 가드 통과분만
 * @param {number?} a.twDep       터미널 ETD(ms)
 * @param {number?} a.stickyAt    이미 출항으로 전환된 시각(ms)
 * @param {number?} a.eta @param {number?} a.etd @param {string} a.src  작업일시
 * @returns {{kind:'depart'|'work', at:number|null, src:string, delayed:boolean, reason:string}|null}
 */
export function decideBadge(a) {
  const { remainLoad, remainDis, hasLoad, terminalStatus, tw,
          pfDep, twDep, stickyAt, eta, etd, src } = a || {};

  const dep = pfDep ?? twDep ?? null;
  const depSrc = pfDep != null ? 'pilot' : 'terminal';
  const late = !!(tw && tw.delayed && typeof tw.pct === 'number' && tw.pct < 100);

  // ③ 한 번 뜨면 유지 — 잔여가 다시 늘어도 되돌아가지 않는다
  if (stickyAt && dep != null) {
    return { kind: 'depart', at: dep, src: depSrc, delayed: late, reason: 'sticky' };
  }

  // ① 터미널이 끝났다고 하면 무조건 — 완료 버튼 미입력 보완
  // V9.57: 수집기·터미널 값에 공백/대소문자가 섞여 와도 인식(.trim 추가), 'done' 별칭 허용.
  //   dep이 없어도 명세("터미널이 DEPARTED면 무조건")대로 etd, 그것도 없으면 지금 시각으로 전환.
  const _ts = String(terminalStatus || '').trim().toLowerCase();
  if (_ts === 'departed' || _ts === 'done') {
    return { kind: 'depart', at: dep ?? etd ?? Date.now(), src: depSrc, delayed: false, reason: 'departed' };
  }
  // V9.57: 인식 못한 비어있지 않은 상태값은 조용히 무시하지 않고 경고(값당 1회 — 렌더 스팸 방지)
  if (_ts && _ts !== 'working' && _ts !== 'planned' && !_warnedStatus.has(_ts)) {
    _warnedStatus.add(_ts);
    console.warn(`[badgeRule] 인식 못한 terminalStatus 값: "${terminalStatus}" — departed/done/working/planned 외 값은 출항 판정에 쓰이지 않습니다`);
  }

  // ② 남은 개수 — 선적 우선, 선적 없는 항차는 양하
  const remain = hasLoad ? remainLoad : remainDis;
  if (remain != null && remain <= DEPART_REMAIN_MAX && dep != null) {
    return { kind: 'depart', at: dep, src: depSrc, delayed: late, reason: `remain${remain}` };
  }

  // 폴백 — 잔여를 아예 모르는 화면(콘앱)에서만. 옛 기준을 그대로 둔다.
  if (remain == null && tw && typeof tw.pct === 'number'
      && tw.pct >= FALLBACK_PCT && dep != null) {
    return { kind: 'depart', at: dep, src: depSrc, delayed: late, reason: 'pct' };
  }

  if (eta == null && etd == null) return null;
  return { kind: 'work', at: eta ?? null, etd: etd ?? null, src: src || '', delayed: false, reason: 'work' };
}
