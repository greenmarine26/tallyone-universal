// dgUnDict.js — M5.79 신규
// UN 위험물 번호 → 화물명 / IMDG Class / 현장 경고
//
// 평택항 양하/적재선에서 빈출하는 40개 코드 + 자주 보는 추가 케이스.
// 새 UN 번호가 보이면 이 파일에 추가만 하면 됨 (코드 수정 불필요).
//
// 사용:
//   import { lookupUN, formatDgLabel } from './dgUnDict.js';
//   lookupUN('1170') → { name: '에탄올', cls: '3', warn: '인화성 액체' }
//   formatDgLabel('3', '1170') → 'UN 1170 · Class 3 · 에탄올 (인화성 액체)'

export const UN_DICT = {
  // === Class 2 (가스) ===
  '1075': { name: 'LPG (액화석유가스)',         cls: '2', warn: '인화성 가스' },
  '1950': { name: '에어로졸 (스프레이 캔)',     cls: '2', warn: '가스 / 인화성' },
  '1965': { name: '탄화수소가스 혼합물',         cls: '2', warn: '인화성 가스' },
  '1978': { name: '프로판',                      cls: '2', warn: '인화성 가스' },

  // === Class 3 (인화성 액체) — 평택 다빈출 ===
  '1170': { name: '에탄올 / 에틸알코올',         cls: '3', warn: '인화성 액체' },
  '1197': { name: '향료 추출물 / 추출액',         cls: '3', warn: '인화성 액체' },
  '1202': { name: '디젤유 / 경유',               cls: '3', warn: '인화성 액체' },
  '1203': { name: '휘발유 / 가솔린',             cls: '3', warn: '인화성 액체' },
  '1219': { name: '이소프로판올',                 cls: '3', warn: '인화성 액체' },
  '1263': { name: '페인트 / 페인트 관련 물질',   cls: '3', warn: '인화성 액체' },
  '1267': { name: '원유 (석유)',                  cls: '3', warn: '인화성 액체' },
  '1268': { name: '석유 증류물 N.O.S',            cls: '3', warn: '인화성 액체' },
  '1300': { name: '테레빈유 유사물 (백색유)',     cls: '3', warn: '인화성 액체' },
  '1307': { name: '자일렌 (크실렌)',              cls: '3', warn: '인화성 액체' },
  '1866': { name: '수지 용액',                    cls: '3', warn: '인화성 액체' },
  '1987': { name: '알코올 N.O.S',                cls: '3', warn: '인화성 액체' },
  '1993': { name: '인화성 액체 N.O.S',            cls: '3', warn: '인화성 액체' },
  '3082': { name: '환경유해물질 액체 N.O.S',      cls: '9', warn: '환경유해' },
  '3295': { name: '탄화수소류 액체 N.O.S',        cls: '3', warn: '인화성 액체' },

  // === Class 4 (가연성 고체) ===
  '1325': { name: '인화성 고체 N.O.S',            cls: '4.1', warn: '가연성 고체' },
  '1361': { name: '석탄 / 갈탄',                  cls: '4.2', warn: '자연발화성' },
  '1428': { name: '나트륨 (금속)',                 cls: '4.3', warn: '물반응성' },

  // === Class 5 (산화제) ===
  '1942': { name: '질산암모늄 (비료)',            cls: '5.1', warn: '산화성 / 폭발 위험' },
  '2014': { name: '과산화수소 수용액',            cls: '5.1', warn: '산화성' },
  '2067': { name: '비료 (질산암모늄 기반)',       cls: '5.1', warn: '산화성' },

  // === Class 6 (독성/감염성) ===
  '1593': { name: '디클로로메탄 (염화메틸렌)',    cls: '6.1', warn: '독성 / 흡입주의' },
  '2588': { name: '농약 고체 N.O.S',              cls: '6.1', warn: '독성' },
  '2810': { name: '독성 액체 N.O.S',              cls: '6.1', warn: '독성' },
  '2814': { name: '감염성 물질 (인체)',           cls: '6.2', warn: '감염성' },

  // === Class 8 (부식성) — 평택 빈출 ===
  '1719': { name: '알칼리성 액체 N.O.S',           cls: '8', warn: '부식성' },
  '1759': { name: '부식성 고체 N.O.S',            cls: '8', warn: '부식성' },
  '1760': { name: '부식성 액체 N.O.S',            cls: '8', warn: '부식성' },
  '1789': { name: '염산 (HCl)',                   cls: '8', warn: '부식성 / 강산' },
  '1791': { name: '차아염소산염 용액',            cls: '8', warn: '부식성' },
  '1805': { name: '인산 용액 (H3PO4)',            cls: '8', warn: '부식성' },
  '1814': { name: '수산화칼륨 용액',              cls: '8', warn: '부식성 / 강염기' },
  '1824': { name: '수산화나트륨 용액 (가성소다)', cls: '8', warn: '부식성 / 강염기' },
  '1830': { name: '황산 (H2SO4)',                 cls: '8', warn: '부식성 / 강산' },
  '2796': { name: '배터리액 (산성)',              cls: '8', warn: '부식성' },
  '2797': { name: '배터리액 (알칼리성)',          cls: '8', warn: '부식성' },
  '2922': { name: '부식성 액체 (독성) N.O.S',     cls: '8', warn: '부식성 + 독성' },

  // === Class 9 (기타 위험) — 평택 빈출 ===
  '2807': { name: '자기적 물질',                   cls: '9', warn: '자기적' },
  '3077': { name: '환경유해물질 고체 N.O.S',      cls: '9', warn: '환경유해' },
  '3082': { name: '환경유해물질 액체 N.O.S',      cls: '9', warn: '환경유해' },
  '3090': { name: '리튬 금속 배터리',              cls: '9', warn: '리튬 배터리 / 화재' },
  '3091': { name: '리튬 금속 배터리 (장비 동봉)', cls: '9', warn: '리튬 배터리 / 화재' },
  '3166': { name: '엔진 / 차량 (내연기관)',        cls: '9', warn: '엔진 동력' },
  '3171': { name: '배터리 작동 차량 / 장비',      cls: '9', warn: '배터리 / 전기' },
  '3268': { name: '안전장치 (에어백 / 인플레이터)', cls: '9', warn: '폭발성 부품' },
  '3480': { name: '리튬이온 배터리',               cls: '9', warn: '리튬이온 / 화재' },
  '3481': { name: '리튬이온 배터리 (장비 동봉)',  cls: '9', warn: '리튬이온 / 화재' },
  '3528': { name: '내연기관 (가솔린)',             cls: '9', warn: '엔진' },
  '3529': { name: '내연기관 (가스)',               cls: '9', warn: '엔진' },
};

// UN 번호 표준화: "UN1170", "1170", " 1170 " 등 모두 "1170"으로
export function normalizeUN(un) {
  if (!un) return '';
  return String(un).toUpperCase().replace(/^UN/, '').replace(/[\s\-]/g, '').trim();
}

// UN 조회: 없으면 null
export function lookupUN(un) {
  const key = normalizeUN(un);
  if (!key) return null;
  return UN_DICT[key] || null;
}

// 화면 표시용 라벨 한 줄
//   formatDgLabel('3', '1170')         → 'UN 1170 · Class 3 · 에탄올 / 에틸알코올 (인화성 액체)'
//   formatDgLabel('', '1170')          → 'UN 1170 · Class 3 · 에탄올 / 에틸알코올 (인화성 액체)'
//   formatDgLabel('9', '99999')        → 'UN 99999 · Class 9 (코드 미등록)'
//   formatDgLabel('', '')              → 'DG (UN 미상)'
export function formatDgLabel(dgc, un) {
  const key = normalizeUN(un);
  const info = lookupUN(key);
  if (!info) {
    if (!key) return 'DG (UN 미상)';
    return `UN ${key}${dgc ? ' · Class ' + dgc : ''} (코드 미등록)`;
  }
  // info.cls 우선 (사전 등록값이 더 정확), 폴백으로 EDI 값
  const cls = info.cls || dgc || '?';
  return `UN ${key} · Class ${cls} · ${info.name} (${info.warn})`;
}

// 짧은 라벨 (베이그리드/카드 작은 공간용)
//   formatDgShort('1170') → '에탄올 (Cl.3)'
//   formatDgShort('99999') → 'UN 99999'
export function formatDgShort(un) {
  const key = normalizeUN(un);
  const info = lookupUN(key);
  if (!info) return key ? `UN ${key}` : 'DG';
  return `${info.name.split(/[\/(]/)[0].trim()} (Cl.${info.cls})`;
}
