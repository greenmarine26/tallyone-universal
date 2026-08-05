// 사용자 업로드 베이사전 — M4.4 신규
// localStorage 기반: 사용자가 .def 파일 업로드하면 여기에 누적
//
// 구조: { [code]: bayDictEntry, [code2]: ... }
// 키: 파일명에서 추출한 CASP 코드 (예: "TNJP", "ATPR")
//
// 우선순위 (shipStructure.js에서 사용):
//   1. userBayDict (이 모듈) — 사용자 업로드, 검증된 M4.4 메서드
//   2. SHIP_BAY_DICT (shipBayDict.js) — 임베드된 v1.1, 미검증

import { gateBayDictWrite } from '../bayDictGuard.js';   // V9.05: 베이사전 쓰기 중앙 게이트

const STORAGE_KEY = 'master_user_bay_dict_v1';

/**
 * V9.05: entry 최신 시각 판정 — updatedAt(숫자) 우선, 없으면 parsedAt(ISO 문자열)을 Date.parse.
 *   기존 결함: Number(parsedAt)이 ISO 문자열에서 NaN → "로컬이 최신이면 보존" 가드가 무작위 동작.
 */
export function entryTimestamp(e) {
  if (!e) return 0;
  const u = Number(e.updatedAt);
  if (Number.isFinite(u) && u > 0) return u;
  const p = Date.parse(e.bayDef?.parsedAt || e.parsedAt || '');
  return Number.isFinite(p) ? p : 0;
}

// localStorage 안전 접근 (사파리 시크릿 모드 등 fail-safe)
const _ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

/**
 * 사용자 베이사전 전체 로드
 * @returns {object} { code: bayDictEntry, ... }
 */
export function loadUserBayDict() {
  const raw = _ls.get(STORAGE_KEY);
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

/**
 * 6단계 fuzzy 매칭 핵심 로직 (subset에 적용 가능)
 *   M6.94.5: 2-Phase 구조에서 user-only / 전체 dict 양쪽에서 재사용
 */
// V7.01: entry에 실제 베이 데이터가 있는지 (빈 깡통 판별).
//   원인: 같은 배가 빈 깡통(baysSummary의 bay가 전부 빈 문자열)과 알맹이 두 벌로 저장된 경우,
//   코드/이름 직접 매칭에서 빈 깡통이 먼저 잡혀 카고플랜 베이가 안 그려짐 (STSE 사례).
//   유효한 베이가 하나도 없으면 매칭 후보에서 제외 → 알맹이 벌을 잡게 함.
function _hasRealBays(e) {
  const bs = e?.bayDef?.baysSummary;
  if (!Array.isArray(bs) || bs.length === 0) return false;
  return bs.some(b => {
    const v = (b && b.bay != null) ? String(b.bay).trim() : '';
    return v !== '' && Number.isFinite(parseInt(v, 10));
  });
}

function _matchInDict(subDictRaw, imo, codeOrName) {
  if (!subDictRaw || Object.keys(subDictRaw).length === 0) return null;
  // 빈 깡통 제외한 유효 entry만 매칭 대상으로.
  const subDict = {};
  for (const k of Object.keys(subDictRaw)) {
    if (_hasRealBays(subDictRaw[k])) subDict[k] = subDictRaw[k];
  }
  if (Object.keys(subDict).length === 0) return null;
  const arg = String(codeOrName || '').trim();
  const argU = arg.toUpperCase();
  const argClean = argU.replace(/\s+/g, '');
  const imoU = String(imo || '').trim().toUpperCase();

  // 1) IMO를 키로 직접
  if (imoU && subDict[imoU]) return subDict[imoU];
  // 2) code를 키로 직접
  if (arg && subDict[arg]) return subDict[arg];
  if (argU && subDict[argU]) return subDict[argU];
  // 3) entry.imo 필드
  if (imoU) {
    for (const k of Object.keys(subDict)) {
      const eimo = String(subDict[k]?.imo || '').trim().toUpperCase();
      if (eimo && eimo === imoU) return subDict[k];
    }
  }
  // 4) entry.code 필드
  if (argU) {
    for (const k of Object.keys(subDict)) {
      const ec = String(subDict[k]?.code || '').trim().toUpperCase();
      if (ec && ec === argU) return subDict[k];
    }
  }
  // 5) entry.callsign 필드 (imo 또는 codeOrName 인자 어느 쪽에 callsign이 들어와도)
  if (imoU) {
    for (const k of Object.keys(subDict)) {
      const cs = String(subDict[k]?.callsign || '').trim().toUpperCase();
      if (cs && cs === imoU) return subDict[k];
    }
  }
  if (argU) {
    for (const k of Object.keys(subDict)) {
      const cs = String(subDict[k]?.callsign || '').trim().toUpperCase();
      if (cs && cs === argU) return subDict[k];
    }
  }
  // 6) entry.name fuzzy (공백 무시, prefix 양방향, 5글자+ overlap)
  if (argClean && argClean.length >= 4) {
    for (const k of Object.keys(subDict)) {
      const n = String(subDict[k]?.name || '').toUpperCase().replace(/\s+/g, '');
      if (!n) continue;
      if (n === argClean) return subDict[k];
      if (n.startsWith(argClean) || argClean.startsWith(n)) return subDict[k];
      if (n.length >= 5 && argClean.length >= 5 && n.slice(0, 5) === argClean.slice(0, 5)) return subDict[k];
    }
  }
  return null;
}

/**
 * 단일 항목 조회 (M6.93.12 fix #1: 6단계 fuzzy 매칭)
 *   M6.94.5: 2-Phase 구조로 user-source entry 우선 매칭 (원칙 ① 절대 보호).
 *   같은 배에 대해 PDF 자동 파싱본(source 없음)과 매트릭스 빌더본(source:"user")이
 *   동시에 존재할 때, user entry가 우선 매칭되도록 보장.
 *
 *   배경: M6.94.4 버그 — DXQD 자동 PDF entry가 H3OI matrix_builder entry를 가림.
 *   카고플랜이 PDF 자동본 사용 → 사용자 매트릭스 빌더 정의 반영 안 됨.
 *
 * @param {string} imo
 * @param {string} codeOrName  - code 또는 선박명 또는 콜사인
 * @returns {object|null}
 */
export function lookupUserBayDict(imo, codeOrName) {
  const dict = loadUserBayDict();
  if (!dict || Object.keys(dict).length === 0) return null;

  // Phase 1: user 소스 entry만 대상으로 6단계 매칭 (원칙 ① 절대 보호)
  //   bayDef.source === 'user' 또는 bayDef._userOwned === true
  const userOnly = {};
  for (const k of Object.keys(dict)) {
    const e = dict[k];
    if (e?.bayDef?.source === 'user' || e?.bayDef?._userOwned === true) {
      userOnly[k] = e;
    }
  }
  const userMatch = _matchInDict(userOnly, imo, codeOrName);
  if (userMatch) return userMatch;

  // Phase 2: 전체 dict 대상으로 매칭 (PDF 자동 파싱 등 fallback)
  return _matchInDict(dict, imo, codeOrName);
}

/**
 * .def 또는 매트릭스 빌더 결과를 사전에 추가 (또는 갱신)
 * 키 우선순위: code (IMO는 .def에 없음)
 *
 * M6.94.5 추가: cross-fill 보강
 *   같은 dict에 다른 키로 이미 같은 배가 등록되어 있을 때(callsign/imo/name 매칭),
 *   양쪽 entry의 비어있는 식별자 필드를 상호 보완해서 채워줌.
 *   효과: 후속 lookupUserBayDict의 6단계 fuzzy 매칭이 두 entry를 연결 가능.
 *
 * @param {object} entry - analysisToBayDictEntry() 결과
 * @returns {boolean} 저장 성공 여부
 */
export function addToUserBayDict(entry) {
  if (!entry || !entry.code) return false;
  // V9.05: 로컬 사전 쓰기도 중앙 게이트 통과 필수 (관리자 원칙)
  if (!gateBayDictWrite('로컬 사전 저장')) return false;
  const dict = loadUserBayDict();

  // M6.94.5: 같은 배 다른 키 entry 탐색 (imo/callsign/name 매칭)
  //   PDF 자동 파싱본과 매트릭스 빌더본이 다른 키로 들어와도 식별자 연결.
  const entryImoU = String(entry.imo || '').trim().toUpperCase();
  const entryCsU = String(entry.callsign || '').trim().toUpperCase();
  const entryNameClean = String(entry.name || '').toUpperCase().replace(/\s+/g, '');
  for (const k of Object.keys(dict)) {
    if (k === entry.code) continue;
    const other = dict[k];
    if (!other) continue;
    const oImoU = String(other.imo || '').trim().toUpperCase();
    const oCsU = String(other.callsign || '').trim().toUpperCase();
    const oNameClean = String(other.name || '').toUpperCase().replace(/\s+/g, '');
    // 비어있지 않은 식별자가 하나라도 일치하면 "같은 배" 판정
    const sameShip =
      (entryImoU && oImoU && entryImoU === oImoU) ||
      (entryCsU && oCsU && entryCsU === oCsU) ||
      (entryNameClean && oNameClean && entryNameClean.length >= 4 &&
       (entryNameClean === oNameClean ||
        entryNameClean.startsWith(oNameClean) ||
        oNameClean.startsWith(entryNameClean)));
    if (sameShip) {
      // 양쪽 비어있는 식별자 상호 보완 (식별자는 새 entry로 흡수)
      if (!entry.imo && other.imo) entry.imo = other.imo;
      if (!entry.callsign && other.callsign) entry.callsign = other.callsign;
      // M6.94.36: 새 entry가 사용자 확정본이면 같은 배의 옛 다른 키 entry를 제거.
      //   원인: 매트릭스 빌더에서 베이를 삭제·확정·저장해도, 같은 배가 다른 키(PDF 자동파싱본 등)로
      //   남아 있으면 lookupUserBayDict가 옛 키를 잡아 "지운 베이가 다시 살아나" 카고플랜과 불일치.
      //   확정본 = 유일한 진실 → 옛 중복 entry 삭제. (사용자 확정 저장일 때만, 데이터 보호 위해 user 소스끼리만)
      const newIsUser = entry.bayDef?._userOwned === true || entry.bayDef?.source === 'user';
      if (newIsUser) {
        delete dict[k];  // 옛 중복 제거 → 새 확정본만 남김
      } else {
        // 새 entry가 자동본이면 옛 것 보존 (사용자 데이터 보호)
        if (!other.imo && entry.imo) other.imo = entry.imo;
        if (!other.callsign && entry.callsign) other.callsign = entry.callsign;
        dict[k] = other;
      }
    }
  }

  dict[entry.code] = entry;
  return _ls.set(STORAGE_KEY, JSON.stringify(dict));
}

/**
 * 항목 삭제 (사용자가 잘못 업로드한 경우 등)
 * @param {string} key - code 또는 IMO
 * @returns {boolean}
 */
export function removeFromUserBayDict(key) {
  // V9.05: 삭제도 수정 — 게이트 통과 필수
  if (!gateBayDictWrite('로컬 사전 삭제')) return false;
  const dict = loadUserBayDict();
  if (!(key in dict)) return false;
  delete dict[key];
  return _ls.set(STORAGE_KEY, JSON.stringify(dict));
}

/**
 * 등록된 모든 사용자 베이사전 목록 (UI 표시용)
 * @returns {Array} [{ code, name, bayCount, sourceFile, parsedAt }, ...]
 */
export function listUserBayDict() {
  const dict = loadUserBayDict();
  return Object.values(dict).map(entry => ({
    imo: entry.imo || '',
    code: entry.code,
    name: entry.name,
    callsign: entry.callsign,
    bayCount: entry.bayDef?.recordCount || 0,
    sourceFile: entry.bayDef?.sourceFile || '',
    parsedAt: entry.bayDef?.parsedAt || '',
    sourceVersion: entry.bayDef?.sourceVersion || '',
    verified: entry.bayDef?.verified || false,
  }));
}

/**
 * V8.98-15: 공유(파이어베이스) 사전 → 이 기기 로컬 사본 동기화 (명시적 가져오기)
 *   배경: 조회는 로컬 사본이 절대 우선(§6.3)이고 FB→로컬 자동 병합이 없어,
 *   기기/브라우저마다 사본이 어긋남(크롬≠엣지 사고). 이 함수는 사용자가
 *   라이브러리 위젯의 '공유 사전 가져오기' 버튼을 누를 때만 실행된다.
 *   병합 규칙: 같은 키는 공유본으로 덮어쓰기, 이 기기에만 있는 선박은 유지.
 */
export function mergeUserBayDictFrom(sharedDict) {
  if (!sharedDict || typeof sharedDict !== 'object') return { ok: false, updated: 0, added: 0, kept: 0, total: 0 };
  // V9.05-02: 게이트 해제 — FB 정본→로컬 복사는 원본을 건드리지 않으므로 모든 검수원 허용.
  //   (V9.05에서 과잉 차단되어 권한자 미선택 폰에서 카고플랜이 틀리게 보이던 문제 수정.
  //    원본(FB) 쓰기와 로컬 직접 수정 게이트는 그대로 유지.)
  const dict = loadUserBayDict() || {};
  let updated = 0, added = 0;
  for (const [k, v] of Object.entries(sharedDict)) {
    if (!v || typeof v !== 'object') continue;
    if (dict[k]) updated++; else added++;
    dict[k] = v;
  }
  const total = Object.keys(dict).length;
  const kept = total - updated - added;
  const ok = _ls.set(STORAGE_KEY, JSON.stringify(dict));
  return { ok, updated, added, kept, total };
}

/**
 * V9.05: 공유 정본 승인 반영 — App.jsx 배너에서 관리자가 승인했을 때만 실행.
 *   기존 자동 머지(조용한 덮어쓰기)를 대체. 지정된 코드만 FB 정본으로 교체.
 * @param {object} fbDict  window.__fbShipBayDict
 * @param {string[]} codes 교체할 키 목록
 */
export function applyApprovedSync(fbDict, codes) {
  if (!fbDict || !Array.isArray(codes) || codes.length === 0) return { ok: false, applied: 0 };
  // V9.05-02: 게이트 해제 — FB 정본→로컬 반영도 원본 훼손 불가, 모든 검수원 허용.
  const dict = loadUserBayDict() || {};
  let applied = 0;
  for (const code of codes) {
    const e = fbDict[code];
    if (!e || typeof e !== 'object') continue;
    dict[code] = e;
    applied++;
  }
  const ok = applied > 0 ? _ls.set(STORAGE_KEY, JSON.stringify(dict)) : true;
  return { ok, applied };
}

/**
 * 통계 (디버그/대시보드용)
 */
export function getUserBayDictStats() {
  const dict = loadUserBayDict();
  const ships = Object.values(dict);
  return {
    totalShips: ships.length,
    totalBays: ships.reduce((sum, s) => sum + (s.bayDef?.recordCount || 0), 0),
    storageKey: STORAGE_KEY,
  };
}

/**
 * 사용자 베이사전 전체 초기화 (위험! 확인 필수)
 */
export function clearUserBayDict() {
  return _ls.set(STORAGE_KEY, '{}');
}
