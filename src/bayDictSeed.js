// 기본 선박 사전 씨앗 읽기 — TallyUni 0.9
//
// 왜 있나: 새로 설치한 회사의 베이사전이 텅 비어 있으면 첫 배부터 매트릭스를 처음부터
//   그려야 한다. 검수사 확정 — "현장 정본 앱의 기존 선박 사전을 앱에 넣어 두었다가
//   설치하면 저장소에 들어가게" 한다. 그 씨앗 파일을 읽는 단 하나의 통로가 이 파일이다.
//
// 씨앗은 번들에 상주하지 않는다(710KB). public/seed/ 에 놓고 필요할 때만 fetch 한다.
//   → 설치 마법사 1회 · 관리자 [기본 사전 가져오기] 버튼 1회. 평소 앱 로딩과 무관.
//
// 만드는 쪽: tools/make_baydict_seed.cjs (재생성 가능).

export const SEED_PATH = 'seed/ship_bay_dict_seed.json';

/** 씨앗 파일의 절대 URL — GitHub Pages 하위 경로(/tallyone-universal/)에서도 맞게 풀린다. */
export function bayDictSeedUrl() {
  try {
    return new URL(SEED_PATH, document.baseURI).href;
  } catch {
    return './' + SEED_PATH;   // document 가 없는 곳(시뮬 등)
  }
}

/**
 * 씨앗 내려받기. 실패는 던진다 — 조용히 빈 객체를 돌려주면 "0척 심었다"가 성공처럼 보인다.
 * @param {number} timeoutMs 기본 30초 (배 안 약신호 고려)
 * @returns {Promise<{meta:object, ships:object, codes:string[]}>}
 */
export async function fetchBayDictSeed(timeoutMs = 30000) {
  const url = bayDictSeedUrl();
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(url, ctl ? { signal: ctl.signal, cache: 'no-cache' } : { cache: 'no-cache' });
  } catch (e) {
    throw new Error(`기본 사전 파일을 받지 못했습니다 (${url}) — ${e && e.name === 'AbortError' ? `${timeoutMs / 1000}초 안에 응답 없음` : (e && e.message) || e}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`기본 사전 파일 응답 HTTP ${res.status} (${url})`);
  let doc;
  try {
    doc = await res.json();
  } catch (e) {
    throw new Error(`기본 사전 파일이 JSON 이 아닙니다 (${url}) — ${(e && e.message) || e}`);
  }
  const ships = doc && doc.ships && typeof doc.ships === 'object' ? doc.ships : null;
  if (!ships) throw new Error(`기본 사전 파일 형식이 다릅니다 — ships 없음 (${url})`);
  const codes = Object.keys(ships);
  if (codes.length === 0) throw new Error(`기본 사전 파일이 비어 있습니다 (${url})`);
  return { meta: doc._meta || {}, ships, codes };
}

/** 사전 맵을 n척씩 끊어 준다 — 한 번에 100척을 던지면 약신호에서 통째로 실패한다. */
export function chunkShips(ships, size = 25) {
  const out = [];
  const codes = Object.keys(ships || {});
  for (let i = 0; i < codes.length; i += size) {
    const part = {};
    for (const c of codes.slice(i, i + size)) part[c] = ships[c];
    out.push(part);
  }
  return out;
}
