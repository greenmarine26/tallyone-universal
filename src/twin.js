// 트윈 짝꿍 (V2 - EDI 베이 분포 기반 자동 분석)
// M6.22: 베이사전 bayList도 통합 — EDI에 짝수 베이(22 등) 누락 시에도 짝꿍 매칭 보장
//
// 알고리즘:
// 1. EDI에 있는 모든 베이 + 베이사전 bayList 통합
// 2. 짝수 베이(40ft 슬롯)가 있으면 → 양 옆 홀수 베이가 짝꿍
// 3. 짝수 베이가 없으면(통로) → 그 양옆 홀수 베이는 단독
//
// 예: XTPG section 7: bayList = [21, 22, 23]
//   - EDI에 22번 컨이 없어도 베이사전에 있으면 baySet.has(22)=true
//   - 21번 짝꿍 = 23 정상 매칭

import { getShipBayDictData } from './shipStructure.js';

// M6.22: cache 구조 변경 — (allContainers, shipKey) 조합으로 캐싱
const cache = new WeakMap();

function buildBayPairs(allContainers, shipImo = '', shipName = '') {
  const shipKey = `${shipImo || ''}|${shipName || ''}`;
  const containerCache = cache.get(allContainers);
  if (containerCache?.[shipKey]) return containerCache[shipKey];

  // 베이 구조 수집 — 우선순위: 베이매트릭스/베이사전(baysSummary 우선, 없으면 bayList) → EDI 폴백
  //   getShipBayDictData가 user(매트릭스 빌더) → v2 → firebase 순으로 이미 우선순위대로 반환.
  //   짝꿍 판정의 근본 출처는 이 베이 구조이며, EDI 적재 여부가 아니다.
  const bays = new Set();      // 존재하는 모든 베이(홀+짝)
  let structBays = [];          // 베이사전/매트릭스에서 온 베이 목록
  if (shipImo || shipName) {
    const dict = getShipBayDictData(shipImo, shipName);
    const bd = dict?.bayDef;
    if (bd) {
      if (Array.isArray(bd.baysSummary) && bd.baysSummary.length > 0) {
        structBays = bd.baysSummary.map(b => b.bayNo ?? b.bay ?? b.idx).filter(v => v != null);
      } else if (Array.isArray(bd.bayList) && bd.bayList.length > 0) {
        structBays = bd.bayList;
      }
    }
  }
  structBays.forEach(b => {
    const n = parseInt(b, 10);
    if (Number.isFinite(n)) bays.add(n);
  });
  // EDI 폴백 — 베이매트릭스/베이사전에 없는 베이도 실물이 있으면 포함
  // M3.86 fix2: c.bay normalize (Firebase zero-padded "025" 옛 데이터 호환)
  for (const c of allContainers) {
    if (c.bay) {
      const n = parseInt(c.bay, 10);
      if (Number.isFinite(n)) bays.add(n);
    }
  }
  const bayInts = Array.from(bays).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  const baySet = new Set(bayInts);

  // 짝꿍 매핑: 홀수 베이 → 짝꿍 베이
  // 23번이면 사이 24가 베이 구조에 있나 본다 → 있으면 25가 짝꿍(23-24-25 한 슬롯).
  //   24가 없으면(통로) 22를 본다 → 있으면 21이 짝꿍. 양쪽 다 없으면 단독.
  //   ★ 짝수 베이 유무는 '실제 베이 구조(matrix/사전/EDI)' 기준이지 40ft 적재 여부가 아님.
  // M3.86 fix: pairs 키와 값을 정수 문자열로 통일
  const pairs = {}; // 'XX' → 'YY' or null (단독)
  for (const b of bayInts) {
    if (b % 2 === 0) continue;

    const bStr = String(b);

    let pairBay = null;
    if (baySet.has(b + 1) && baySet.has(b + 2)) {
      pairBay = String(b + 2);
    }
    else if (baySet.has(b - 1) && baySet.has(b - 2)) {
      pairBay = String(b - 2);
    }
    pairs[bStr] = pairBay;
  }

  if (!containerCache) cache.set(allContainers, {});
  cache.get(allContainers)[shipKey] = pairs;
  return pairs;
}

// 짝꿍 후보 찾기 (모드별, 위치별)
//   target: 검색된 컨테이너
//   allContainers: 전체 컨테이너
//   excludeCns: 이미 페어링된 컨번호 set (제외)
// M6.22: shipImo/shipName 추가 — 베이사전 활용으로 매칭 정확도 향상
export function findTwinCandidate(target, allContainers, excludeCns = new Set(), shipImo = '', shipName = '') {
  if (!target?.bay || !target?.row || !target?.tier) return null;

  const targetBay = parseInt(target.bay);
  if (!Number.isFinite(targetBay)) return null;
  if (targetBay % 2 === 0) return null;

  const pairs = buildBayPairs(allContainers, shipImo, shipName);
  const targetBayStr = String(targetBay);
  const pairBayStr = pairs[targetBayStr];

  if (!pairBayStr) return null;

  const found = allContainers.find(c => {
    if (c.cn === target.cn) return false;
    if (excludeCns.has(c.cn)) return false;
    const cBayNorm = c.bay ? String(parseInt(c.bay, 10)) : '';
    return cBayNorm === pairBayStr &&
      c.row === target.row &&
      c.tier === target.tier &&
      c._mode === target._mode;
  });
  return found || null;
}

// 베이 짝꿍 맵 가져오기 (UI에서 표시용)
// M6.22: shipImo/shipName 추가
export function getBayPairs(allContainers, shipImo = '', shipName = '') {
  return buildBayPairs(allContainers, shipImo, shipName);
}

// V9.57: findStackMates 삭제 — 저장소 전체 grep 참조 0 (같은 슬롯 다중 적재 조회는 미사용 잔재).
