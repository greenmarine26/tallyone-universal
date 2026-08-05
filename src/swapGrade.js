// V9.53: 계획과 다른 컨이 그 자리에 왔을 때 — **얼마나 세게 물어볼지** 한 곳에서 정한다.
//
// 현장 규칙 (사용자 확정 2026-08-03):
//   · 엠티는 **포트만 같으면** 자리를 바꿔도 된다.  (지침 Ⅱ: "같은 포트 엠티끼리 베이 교환 가능")
//   · 풀은 **같은 베이 안**이면 간단한 알림, **다른 베이**면 진짜 바꿀지 강하게 확인한다.
//   · 트윈 짝꿍 베이(19↔21)와 사이 짝수 베이(20)는 **한 슬롯이라 같은 베이로 본다** — 단 포트가 같을 때.
//   · 포트가 다르면 풀·엠티 가릴 것 없이 강한 확인이다(엉뚱한 항에 실리면 되돌릴 수 없다).
//
// 판정은 이 파일 한 벌만 쓴다 — 카드와 위치수정 창이 서로 다른 잣대를 대면 검수사가 헷갈린다.

import { isReeferIso } from './utils.js';   // V9.57: 리퍼 판정 단일 소스 (ISO 가드 정비에 사용)

const bn = (v) => (v !== undefined && v !== null && v !== '' ? String(parseInt(v, 10)) : '');

/** 두 베이가 같은 슬롯(트리오)인가 — 같은 번호 · 짝꿍 · 사이 짝수 */
/** TallyOne 1.8-09: 베이 → 그룹 대표값(center). 해치커버 상태 키에 쓴다.
 *
 *  왜 공용으로 빼나 — 종전엔 `GuidedWorkPanel` 안에만 있었다. 그래서 **수동 해치 보고**
 *  (WorkReportModal)는 같은 계산을 못 해 `info.hatchDone` 표시를 못 남겼고,
 *  검수사가 수동으로 커버를 닫아도 자동 유도가 그걸 모른 채 "닫을까요?"를 되물었다
 *  (검수사 신고 2026-08-05, STMJ 2644W 베이 18).
 *
 *  규칙(지침서 확정): 짝수 베이가 곧 그룹 대표. 홀수는 짝꿍 짝수와의 중앙값.
 *    짝꿍을 모르면 자기 자신 — 조용히 다른 그룹으로 섞이지 않게 한다.
 */
export function bayGroupCenter(bayStr, bayPairs = {}) {
  const b = parseInt(bayStr, 10);
  if (!Number.isFinite(b)) return null;
  if (b % 2 === 0) return b;
  const pair = bayPairs?.[String(b)];
  if (pair) return (b + parseInt(pair, 10)) / 2;
  return b;
}

export function sameBayGroup(bayA, bayB, bayPairs = {}) {
  const A = bn(bayA), B = bn(bayB);
  if (!A || !B) return false;
  if (A === B) return true;
  if (bayPairs[A] === B || bayPairs[B] === A) return true;
  const a = parseInt(A, 10), b = parseInt(B, 10);
  // V9.57: 죽은 가드 정리 — 인접 정수는 항상 한쪽이 짝수라 `(a%2===0||b%2===0)`은 상시 참이었다.
  if (Math.abs(a - b) === 1) return true;   // 19-20, 20-21
  return false;
}

const isEmptyCon = (c) => String(c?.fe || '').toUpperCase() === 'E';

// V9.53: 특수 컨은 **완화 규칙에서 뺀다**(사용자 확정 2026-08-03).
//   리퍼는 전원 자리, 위험물은 격리 규정, FR/OT/TK/OOG 는 치수·고박이 자리를 정한다 —
//   같은 베이·같은 포트라고 함부로 바꿀 수 있는 물건이 아니다. 언제나 강한 확인.
//   판정은 필드(rf/dg/fr/oog/tk/un)와 ISO 4번째 자리(형식코드)를 둘 다 본다.
export function isSpecialCon(c) {
  if (!c) return false;
  if (c.rf || c.dg || c.fr || c.oog || c.tk) return true;
  if (String(c.dgc || '').trim() || String(c.un || '').trim()) return true;
  if (c.tmp !== undefined && c.tmp !== null && String(c.tmp).trim() !== '') return true;   // 온도가 있으면 리퍼
  const iso = String(c.iso || c.ediIso || '').toUpperCase();
  // ISO 3번째 = 형식. R/H(리퍼) P(플랫) U(오픈탑) T(탱크) S(네임드) B(벌크)
  // V9.57: ISO꼴(첫 자리가 길이코드 2/4/9/L/M)일 때만 적용 — 'GPHC'·'DCHC' 같은 라벨/변형
  //   문자열의 3번째 글자('H')에 과잉 발동해 일반 드라이가 특수컨으로 묶이던 결함 교정.
  //   (표기 변형 리퍼 'RFHC' 등은 isReeferIso가 계속 잡는다 — 판정 누락 없음.)
  if (/^[249LM][0-9A-Z][RHPUTSB]/.test(iso)) return true;
  if (isReeferIso(iso)) return true;
  const tp = String(c.tp || '').toUpperCase();
  if (/RF|RH|OT|FR|TK|OOG|PL/.test(tp)) return true;
  return false;
}

/** 특수 사유 문구 */
function specialWhy(c) {
  if (!c) return '특수 컨테이너';
  if (c.rf || (c.tmp !== undefined && c.tmp !== null && String(c.tmp).trim() !== '')) return '리퍼(냉동)';
  if (c.dg || String(c.dgc || '').trim() || String(c.un || '').trim()) return '위험물(DG)';
  if (c.fr) return 'FR(플랫랙)';
  if (c.tk) return '탱크';
  if (c.oog) return 'OOG(규격초과)';
  return '특수 규격';
}
const podOf = (c) => String(c?.pod || '').trim().toUpperCase();

/**
 * 등급 판정.
 *   incoming: 실제 온 컨 / planned: 그 자리의 계획 컨 (없으면 자리만 이동)
 * 반환 { level:'ok'|'mild'|'strong', reason, podSame, sameBay, empty }
 */
export function gradeSwap(incoming, planned, bayPairs = {}) {
  if (!incoming || !planned) return { level: 'mild', reason: '', podSame: true, sameBay: true, empty: false };
  const podSame = !podOf(incoming) || !podOf(planned) || podOf(incoming) === podOf(planned);
  const sameBay = sameBayGroup(incoming.bay, planned.bay, bayPairs);
  const empty = isEmptyCon(incoming) && isEmptyCon(planned);

  // ★ 특수 컨은 완화 대상이 아니다 — 어느 쪽이든 특수면 강한 확인
  const sp = isSpecialCon(incoming) ? incoming : (isSpecialCon(planned) ? planned : null);
  if (sp) {
    return { level: 'strong', podSame, sameBay, empty, special: specialWhy(sp),
             reason: `${specialWhy(sp)} 컨테이너입니다 — 자리가 정해져 있어 함부로 바꿀 수 없습니다` };
  }

  if (!podSame) {
    return { level: 'strong', podSame, sameBay, empty,
             reason: `목적지가 다릅니다 — 온 컨 ${podOf(incoming)} · 이 자리 ${podOf(planned)}` };
  }
  if (empty) {
    return { level: 'ok', podSame, sameBay, empty,
             reason: `엠티 · 같은 포트(${podOf(incoming) || '-'}) — 자리를 바꿔도 됩니다` };
  }
  if (sameBay) {
    return { level: 'mild', podSame, sameBay, empty,
             reason: `같은 베이 안에서 바뀝니다 (${bn(planned.bay)} ↔ ${bn(incoming.bay)})` };
  }
  return { level: 'strong', podSame, sameBay, empty,
           reason: `다른 베이에서 온 풀 컨입니다 — 계획 ${bn(incoming.bay)}번 → 이 자리 ${bn(planned.bay)}번` };
}

/** 강한 등급일 때 저장 전 한 번 더 묻는 문구 (없으면 묻지 않는다) */
export function confirmTextOf(g, incoming, planned) {
  if (!g || g.level !== 'strong') return '';
  return `${incoming?.cn || ''} 를 이 자리에 넣습니다.\n\n${g.reason}\n\n`
       + `이 자리의 계획 컨 ${planned?.cn || ''} 는 ${incoming?.cn || ''} 의 원래 자리로 옮겨집니다.\n`
       + `진짜로 바꿉니까?`;
}

export const GRADE_STYLE = {
  ok:     { box: 'bg-emerald-950/40 border-emerald-700/60', text: 'text-emerald-300', icon: '✅' },
  mild:   { box: 'bg-amber-950/30 border-amber-700/50',     text: 'text-amber-300',   icon: '⚠' },
  strong: { box: 'bg-rose-950/50 border-rose-600',          text: 'text-rose-200',    icon: '🚫' },
};
