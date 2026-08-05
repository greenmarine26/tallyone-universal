// 선박 엠티 실 정책 (M3.5.5)
// 일부 선박은 엠티 컨테이너에도 실 작업이 필요함
// - 'verify': 엠티에 실이 이미 부착됨 (확인/리씰)
// - 'attach': 엠티에 실을 부착해야 함 (작업)
//
// 데이터 모델:
//   /shipPolicies/{vsl_uppercase} = {
//     mode: 'verify' | 'attach',
//     target: 'all_empty' | 'empty_with_pod',
//     pod: ['CNWEH', ...],   // empty_with_pod인 경우만
//     label: '설명',
//     registered_at, registered_by
//   }
import { ref, set, get, onValue, off } from 'firebase/database';

// 하드코딩 기본 정책 (검수원이 알려준 선박들)
// aliases: 같은 선박이지만 다른 코드/표기 (ASC vs 사용자 표기)
export const DEFAULT_SHIP_POLICIES = {
  'TEN JUPITER': {
    name: 'TEN JUPITER',
    code: 'TNJP',
    aliases: ['TNJP', 'LYTJ'],  // ASC는 LYTJ로 표기
    mode: 'verify',
    target: 'all_empty',
    label: '엠티 실 확인 (리씰 가능)',
    description: '엠티 컨테이너에 이미 실이 부착되어 있음. 확인 또는 리씰.',
  },
  'RIZHAO ORIENT': {
    name: 'RIZHAO ORIENT',
    code: 'RZOR',
    aliases: ['RZOR', 'R063'],   // R063 = RZOR 항차 prefix (R063W/R063E). 선박명 누락 리스트도 LOLO 인식.
    mode: 'verify',
    target: 'all_empty',
    lolo: true,   // V8.09-07: LOLO 검수 대상 — IFCSUM(베이 없음) 명세 선박. RZOR만 LOLO 처리(사용자 확정 2026-06-18).
    label: '엠티 실 확인 (리씰 가능)',
    description: '엠티 컨테이너에 이미 실이 부착되어 있음. 확인 또는 리씰.',
  },
  'ATLANTIC PIONEER': {
    name: 'ATLANTIC PIONEER',
    code: 'ATRP',
    aliases: ['ATRP', 'ATPR'],  // ASC는 ATPR로 표기
    mode: 'attach',
    target: 'empty_with_pod',
    pod: ['CNWEH', 'CNWEI'],   // 위해 (WEH 표준 / WEI 축약 둘 다)
    label: 'POD 위해(CNWEI/CNWEH)행 엠티 실 부착',
    description: '목적지가 위해(CNWEI/CNWEH)인 엠티 컨테이너에 실을 부착해야 함.',
  },
};

// 선박명/코드 정규화 (대소문자/공백 무시)
export function normalizeVslName(vsl) {
  return String(vsl || '').toUpperCase().trim().replace(/\s+/g, ' ');
}

// 선박명/코드/항차코드에서 정책 매칭 (DEFAULT + 추가된 정책)
//   vsl: 선박명 (있으면 우선)
//   extraHints: ['ATPR2621W', 'CMA' 등] - 파일명, carrier 등 추가 매칭 단서
export function matchShipPolicy(vsl, extraPolicies = {}, extraHints = []) {
  const norm = normalizeVslName(vsl);
  const all = { ...DEFAULT_SHIP_POLICIES, ...extraPolicies };

  // 1. 선박명 정확 일치 우선
  if (norm && all[norm]) return all[norm];

  // 2. 선박명 부분 일치
  if (norm) {
    for (const [key, p] of Object.entries(all)) {
      if (norm.includes(key) || key.includes(norm)) return p;
    }
  }

  // 3. aliases (코드) 매칭 — 선박명 + extraHints 모두 검사
  const haystack = [norm, ...extraHints.map(h => normalizeVslName(h))].join('|');
  for (const p of Object.values(all)) {
    const aliases = p.aliases || [p.code].filter(Boolean);
    for (const alias of aliases) {
      const aliasNorm = normalizeVslName(alias);
      if (aliasNorm && haystack.includes(aliasNorm)) return p;
    }
  }

  return null;
}

// 컨테이너에 정책 적용 → sealMode 결정
// 결과: 'attach' | 'verify' | null (해당 없음)
export function applyPolicyToContainer(policy, container) {
  if (!policy || !container) return null;
  const fe = String(container.fe || '').toUpperCase();
  if (fe !== 'E') return null;  // Empty가 아니면 적용 X

  if (policy.target === 'all_empty') {
    return policy.mode;  // 'verify' 또는 'attach'
  }

  if (policy.target === 'empty_with_pod') {
    const pod = String(container.pod || '').toUpperCase();
    const targetPods = (policy.pod || []).map(p => p.toUpperCase());
    if (targetPods.includes(pod)) return policy.mode;
    // 특정 POD가 아니면 일반 처리
    return null;
  }

  return null;
}

// V8.09-07: LOLO 검수 대상 선박인지 — 선박정책의 lolo 플래그로만 판정.
//   기존엔 "모든 컨테이너에 bay/row/tier 없음"으로 판정했는데, 일반 베이 선박(TPMZ 등)이
//   위치정보 없이 올라오면 LOLO로 오판돼 수석대시보드에 LOLO 리스트가 잘못 생성됐다.
//   → LOLO는 RZOR(RIZHAO ORIENT)만(사용자 확정 2026-06-18). 선박명/코드로 정책 매칭 후 lolo===true만 LOLO.
export function isLoloShipByPolicy(vsl, extraPolicies = {}, extraHints = []) {
  const policy = matchShipPolicy(vsl, extraPolicies, extraHints);
  return !!(policy && policy.lolo === true);
}

// Firebase에서 추가 정책 가져오기
export async function fbGetShipPolicies(db) {
  const snap = await get(ref(db, 'shipPolicies'));
  return snap.val() || {};
}

export function fbSubscribeShipPolicies(db, callback) {
  const r = ref(db, 'shipPolicies');
  const unsub = onValue(r, (snap) => callback(snap.val() || {}));
  return () => off(r);
}

export async function fbSaveShipPolicy(db, vsl, policy, by) {
  const norm = normalizeVslName(vsl);
  if (!norm) throw new Error('선박명 비어있음');
  const r = ref(db, `shipPolicies/${norm.replace(/[.#$\[\]\/]/g, '_')}`);
  await set(r, {
    ...policy,
    name: policy.name || norm,
    registered_at: Date.now(),
    registered_by: by || '',
  });
}

export async function fbDeleteShipPolicy(db, vsl) {
  const norm = normalizeVslName(vsl);
  const r = ref(db, `shipPolicies/${norm.replace(/[.#$\[\]\/]/g, '_')}`);
  await set(r, null);
}

// 정책에 따른 컨테이너 그룹화
//   { matched: [...], notMatched: [...] }
export function groupContainersByPolicy(policy, containers) {
  const matched = [];
  const notMatched = [];
  containers.forEach(c => {
    const mode = applyPolicyToContainer(policy, c);
    if (mode) matched.push({ ...c, _sealMode: mode });
    else notMatched.push(c);
  });
  return { matched, notMatched };
}

// 부착/확인 진행 상황 카운트
//   { total, done, pending, missingSeal: [] }
export function countSealProgress(matchedContainers, recordsMap) {
  let done = 0;
  const pending = [];
  matchedContainers.forEach(c => {
    const r = recordsMap?.[c.cn] || {};
    const eseal = String(r.eseal || c.eseal || '').trim();
    if (eseal) done++;
    else pending.push(c);
  });
  return {
    total: matchedContainers.length,
    done,
    pending: pending.length,
    missingSeal: pending,
  };
}
