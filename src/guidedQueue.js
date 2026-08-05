// 가이드 양하/선적 예측 큐 생성 — 베이·모드·접안방향 기준 크레인 순서 정렬
// 규칙 (사용자 확정 2026-06-11):
//   양하: 데크→홀드, 맨 위 티어부터, 같은 티어는 육상→해상 로우 순.
//   선적: 홀드→데크, 맨 아래 티어부터, 같은 티어는 해상→육상 로우 순.
//   로우 육상/해상 = 접안 방향 (우현 접안 = 짝수 로우가 해상쪽).
//   트윈: 홀수베이 짝(findTwinCandidate) 한 카드로 묶음. 40ft는 일반 작업.
//   싱글모드: 짝 없는 20ft — 양하는 맨 마지막, 선적은 맨 처음 (크레인 모드 전환 1회).
//     단, 적재 종속 예외: 싱글 아래에 일반 작업분이 있으면(위에 얹힌 싱글) 층 순서 유지.
//   FR(플랫랙) 특수화물: 우선 양하 / 마지막 선적 (사용자 확정 2026-06-12).
//   V7.94-08 선적 추가 규칙 (사용자 메모 확정 2026-06-12):
//     ① 선적 마지막 단계는 FR + OT (양하는 기존대로 FR만 우선).
//     ② 혼재 베이 선적: 20ft 트윈을 같은 로우 스택 단위로 바닥부터 연속으로 쌓고(로우는 해상→육상),
//        트윈 아래 깔린 40ft가 있으면 그 40ft를 먼저 끌어와 적재 종속을 지킨 뒤, 남은 40ft는 층 순서.
//     단, 물리 제약 예외 — 같은 줄 위에 다른 작업분이 있거나 홀드 FR인데 데크 작업이 남아 있으면
//     양하 우선 불가(층 순서 유지). 선적은 FR 위에 실릴 작업분이 있으면 마지막 불가(층 순서 유지).
//   40ft/20ft 혼재 시 40ft 먼저: 별도 규칙이 아니라 층 단위 정렬에서 자연 충족
//     (양하: 트윈 위 40ft가 위층 차례에 먼저 / 선적: 바닥 40ft가 아래층 차례에 먼저).
//   쉬프팅: 가이드 모드에서 감지하지 않음 — 발생 시 수동 모드 사용 (사용자 결정).
//   V8.50 (사용자 확정 2026-07-06 — 양하 우선순위 협의):
//     ① 기본 순서는 층(티어) 단위 절대 유지 — V8.09-04의 스택 통째 배치(로우 단위 붕괴) 폐기.
//        (실증: 625N bay26 위엠티/풀리퍼/바닥엠티 홀드에서 로우 단위로 파고들던 문제.)
//     ② 같은 층 안 부류 기본 순서 = 풀일반 → 풀리퍼 → 엠티 (같은 층 로우끼리는 물리 종속 없음).
//     ③ 갈림(지금 내릴 수 있는 카드에 부류 혼재) 시 검수사 선택 = streamPref('F'|'E'|'RF'|'GEN'|'40'|'20').
//        선택 부류를 물리 종속을 지키며 앞당겨 연속 제시(내리던 흐름 계속), 막히면 기본 순서 잔류.
//     ④ 예측과 다른 컨이 내려오면 그 부류로 자동 재앵커(무언 적응 — GuidedWorkPanel에서 처리).

const isDeckTier = (t) => parseInt(t, 10) >= 80;
const is20ft = (c) => String(c.tp || '').startsWith("20") || String(c.iso || '')[0] === '2';
const is40ft = (c) => { const f = String(c.iso || '')[0]; return f === '4' || f === 'L' || f === '9' || String(c.tp || '').includes('40'); };

// 같은 티어 안 로우 정렬 순위 (작을수록 먼저)
function rowRank(rowStr, { evenRowsSeaSide, landToSea }) {
  const r = parseInt(rowStr, 10);
  let seaToLand;
  if (r === 0) seaToLand = 1000;
  else if (evenRowsSeaSide ? r % 2 === 0 : r % 2 === 1) seaToLand = 1000 - r;
  else seaToLand = 1000 + r;
  return landToSea ? -seaToLand : seaToLand;
}

export function buildGuidedQueue({ containers, mode, evenRowsSeaSide, findTwin = null, streamPref = null }) {
  const landToSea = mode === 'discharge';
  const topFirst = mode === 'discharge';

  // V7.94-23: 선적 시 같은 베이 안에서 POD(목적항)별로 묶어 제시 (현장: 포트별 선적).
  //   베이 순서·물리 적재순서(데크/홀드·티어)는 유지하고, 같은 베이+같은 단 안에서 POD가 같은 것끼리 인접.
  //   POD 우선순위 = 그 베이에서 먼저 등장하는 POD 순 (베이별 독립).
  const podOrderByBay = {};
  if (mode === 'loading') {
    const seen = {};
    for (const c of containers) {
      const b = String(parseInt(c.bay, 10));
      const pod = c.pod || '';
      podOrderByBay[b] ||= {};
      if (!(pod in podOrderByBay[b])) { seen[b] = (seen[b] || 0); podOrderByBay[b][pod] = seen[b]++; }
    }
  }
  const podRank = (c) => {
    if (mode !== 'loading') return 0;
    const b = String(parseInt(c.bay, 10));
    return podOrderByBay[b]?.[c.pod || ''] ?? 99;
  };

  const cmp = (a, b) => {
    const aDeck = isDeckTier(a.tier), bDeck = isDeckTier(b.tier);
    if (aDeck !== bDeck) return (mode === 'discharge') === aDeck ? -1 : 1;
    // 선적: 같은 단(데크/홀드) 안에서 같은 베이면 POD별로 묶기 (물리 적재순서보다 우선하지 않게 — 베이·단 동일 시에만)
    if (mode === 'loading' && parseInt(a.bay, 10) === parseInt(b.bay, 10)) {
      const ap = podRank(a), bp = podRank(b);
      if (ap !== bp) return ap - bp;
    }
    const at = parseInt(a.tier, 10), bt = parseInt(b.tier, 10);
    if (at !== bt) return topFirst ? bt - at : at - bt;
    // V7.99-6 (메모2): 양하 — 같은 티어에 40ft와 20ft가 공존하면(짝수 베이 40ft가 양옆 홀수 트윈 위에 걸침)
    //   작업 방해가 없으므로 40ft를 먼저 내린다. 선적은 holdTwins 스택 로직이 따로 처리하므로 양하에만 적용.
    if (mode === 'discharge') {
      const a40 = is40ft(a), b40 = is40ft(b);
      if (a40 !== b40) return a40 ? -1 : 1;
      // V8.50 ②: 같은 층 안에서 풀일반 → 풀리퍼 → 엠티 (V8.09-04 대체 — 층 순서는 안 깨짐)
      const ar2 = conClassRank(a), br2 = conClassRank(b);
      if (ar2 !== br2) return ar2 - br2;
    }
    const ar = rowRank(a.row, { evenRowsSeaSide, landToSea });
    const br = rowRank(b.row, { evenRowsSeaSide, landToSea });
    if (ar !== br) return ar - br;
    return parseInt(a.bay, 10) - parseInt(b.bay, 10); // 같은 슬롯은 낮은 베이(앞) 먼저
  };

  const sorted = [...containers].sort(cmp);

  // 1차: 트윈 짝짓기 → 카드화 + 싱글모드(짝 없는 20ft)·FR 식별
  const used = new Set();
  const normal = [], singles = [], frs = [];
  for (const c of sorted) {
    if (used.has(c.cn)) continue;
    used.add(c.cn);
    let twin = null;
    if (findTwin && is20ft(c)) {
      twin = findTwin(c, containers, used);
      if (twin) used.add(twin.cn);
    }
    const card = { kind: 'work', main: c, twin, pos: `${c.bay}-${c.row}-${c.tier}`, single: false, fr: false };
    const isSpecialLast = mode === 'loading'
      ? (c.fr || c.ot || c.oog || twin?.fr || twin?.ot || twin?.oog)   // 선적: FR+OT 마지막 (V7.94-15: oog 필드 누락 — SWRG 오픈탑 ISO 2261이 oog만 참)
      : (c.fr || twin?.fr);                       // 양하: FR만 우선
    if (isSpecialLast) { card.fr = true; frs.push(card); }
    else if (is20ft(c) && !twin && !isDeckTier(c.tier)) { card.single = true; singles.push(card); }
    else normal.push(card);
  }

  // 같은 줄(로우) 비교 헬퍼
  const sameRow = (card, row) => card.main.row === row || card.twin?.row === row;

  // 적재 종속 예외 ①: 싱글 '아래'에 일반/FR 작업분이 있으면 단계 분리 불가 → 층 순서 유지
  const slotCards = [...normal, ...frs].filter(card => !isDeckTier(card.main.tier));
  const keepInFlow = [];
  const pureSingles = [];
  for (const s of singles) {
    const st = parseInt(s.main.tier, 10), srow = s.main.row;
    const conflict = slotCards.some(card => {
      if (!sameRow(card, srow)) return false;
      return parseInt(card.main.tier, 10) < st;
    });
    (conflict ? keepInFlow : pureSingles).push(s);
  }

  // 적재 종속 예외 ②: FR 우선양하/마지막선적의 물리 제약
  //   양하 우선 불가: 같은 줄 '위'에 비FR 작업분 존재, 또는 홀드 FR인데 데크 작업이 남음
  //   선적 마지막 불가: 같은 줄 '위'에 비FR 작업분 존재(FR 위에 실어야 함), 또는 홀드 FR인데 데크 작업이 남음
  const nonFr = [...normal, ...singles];
  const deckWorkExists = nonFr.some(card => isDeckTier(card.main.tier));
  const pureFrs = [];
  for (const f of frs) {
    const ft = parseInt(f.main.tier, 10), frow = f.main.row;
    const frIsHold = !isDeckTier(f.main.tier);
    const aboveExists = nonFr.some(card => {
      if (!sameRow(card, frow)) return false;
      if (isDeckTier(card.main.tier) !== !frIsHold && frIsHold) return false; // 홀드 FR과 데크 컨은 위아래 비교 대신 deckWorkExists로 처리
      if (isDeckTier(card.main.tier) !== isDeckTier(f.main.tier)) return false;
      return parseInt(card.main.tier, 10) > ft;
    });
    const conflict = aboveExists || (frIsHold && deckWorkExists);
    (conflict ? keepInFlow : pureFrs).push(f);
  }
  pureFrs.sort((a, b) => cmp(a.main, b.main));

  // 최종 순서:
  //   양하 = FR(우선) → 일반(+예외 병합) → 순수 싱글
  //   선적 = 순수 싱글 → 트윈(같은 로우 스택 연속, 아래 깔린 40ft 종속 끌어오기) → 남은 40ft(층 순서) → FR·OT(마지막)
  const flow = [...normal, ...keepInFlow].sort((a, b) => cmp(a.main, b.main));
  if (mode === 'discharge') {
    // V8.09-03 (사용자 확정 2026-06-17): 양하는 "40ft 작업 전부 끝낸 뒤 20ft 작업".
    //   이유: 같은 단에 40/20 혼재 시 층마다 40↔20 순서가 되면 스프레더를 40전용↔20트윈으로
    //   반복 전환해 작업 시간이 지연됨. 40ft를 모아 먼저 다 내리고 20ft(트윈)를 나중에 모아 내린다.
    //   ★단, 적재 종속 유지 — 어떤 40ft 카드 '위'(같은 단·같은 로우·더 높은 티어)에 아직 안 내린
    //   20ft 작업분이 얹혀 있으면 그 40ft를 앞으로 끌어올 수 없다(20ft를 먼저 내려야 함). 이 경우
    //   해당 40ft는 20ft와의 상대 순서를 기존 층 순서대로 둔다. (이 베이는 40ft가 20ft 위/독립이라
    //   전부 앞으로 모임 — 검증 EDI STSE 2645E 24번 홀드로 PASS.)
    const ordered40First = reorder40FirstForDischarge(flow);
    const base = [...pureFrs, ...ordered40First, ...pureSingles];
    // V8.50 ③: 검수사가 고른 부류를 물리 종속 지키며 앞당김. FR 우선 양하는 그대로 고정.
    if (streamPref) return [...pureFrs, ...pullStreamForward(base.slice(pureFrs.length), streamPref)];
    return base;
  }
  // ── 선적: 홀드·데크 모두 "트윈 전부 → 40ft 전부" (각 단 내부). 단 사이는 홀드 먼저 → 데크. ──
  //   V8.09-03 (사용자 확정 2026-06-17): 선적 순서는 20ft싱글 → 트윈 → 40ft, 순서 절대 우선.
  //   도메인 사실(사용자 확정): 40ft 위에는 20ft가 절대 안 실린다(40ft 중간에 콘 구멍 없음).
  //   따라서 "트윈을 먼저 다 싣고 40ft를 나중에" 실어도 적재 종속이 깨지지 않는다(40ft가 20ft 위/독립).
  //   ★V7.99-6의 "트윈 아래 깔린 40ft 먼저 끌어오기"는 발동할 일이 없고, 발동 시 트윈↔40 순서를
  //     깨므로 제거. 트윈끼리 스택 순서(POD→로우→바닥티어)만 유지하고, 40ft는 그 뒤에 층 순서로.
  //   ★데크도 자동모드는 홀드와 동일 규칙으로 제시(사용자 확정 2026-06-17): 포트가 갈리거나 선적
  //     난이도로 순서가 달라지는 경우는 검수사가 수동 작업으로 보정한다(자동은 기본 제시).
  const buildStageOrder = (cards) => {
    const twins = cards.filter(card => card.twin);
    const single20 = cards.filter(card => !card.twin && !cardIs40(card));   // 짝 없는 20ft
    const forties = cards.filter(card => !card.twin && cardIs40(card));     // 40ft
    const podOrder = {}; let seq = 0;
    for (const c of twins) { const p = c.main.pod || ''; if (!(p in podOrder)) podOrder[p] = seq++; }
    twins.sort((a, b) => {
      const ap = podOrder[a.main.pod || ''] ?? 99, bp = podOrder[b.main.pod || ''] ?? 99;
      if (ap !== bp) return ap - bp;
      // V8.09-18 (사용자 보고 2026-06-18): 트윈 선적은 한 티어의 전체 로우를 다 채운 뒤 위 티어로.
      //   기존 로우→티어 순서는 한 로우의 02·04·06을 먼저 쌓아 올려 "02 전체 로우 미완"인 채 위로 감.
      //   → 티어를 로우보다 먼저 비교(바닥 02부터). 같은 티어 안에서는 로우 해상→육상.
      const at = parseInt(a.main.tier, 10), bt = parseInt(b.main.tier, 10);
      if (at !== bt) return at - bt;
      const ar = rowRank(a.main.row, { evenRowsSeaSide, landToSea: false });
      const br = rowRank(b.main.row, { evenRowsSeaSide, landToSea: false });
      return ar - br;
    });
    single20.sort((a, b) => cmp(a.main, b.main));
    forties.sort((a, b) => cmp(a.main, b.main));
    return [...single20, ...twins, ...forties];   // 단 내부: 20싱글 → 트윈 → 40ft
  };
  const holdOrdered = buildStageOrder(flow.filter(card => !isDeckTier(card.main.tier)));
  const deckOrdered = buildStageOrder(flow.filter(card => isDeckTier(card.main.tier)));
  // pureSingles(홀드 짝없는 20ft) → 홀드(싱글·트윈·40) → 데크(싱글·트윈·40) → FR(마지막)
  return [...pureSingles, ...holdOrdered, ...deckOrdered, ...pureFrs];
}

// 카드의 대표 규격이 40ft인지 (트윈 카드는 20ft 짝이므로 20ft 취급)
function cardIs40(card) {
  if (card.twin) return false;            // 트윈 = 20ft 두 개
  return is40ft(card.main);
}

// V8.09-03: 양하 — 같은 단(데크/홀드) 안에서 40ft 카드를 20ft 카드보다 앞으로 모은다.
//   적재 종속 유지: 40ft '위'(같은 단·같은 로우·더 높은 티어)에 아직 안 내린 20ft 카드가 있으면
//   그 40ft는 앞으로 끌어올 수 없다(그 20ft를 먼저 내려야 하므로) → 기존 상대 순서 유지.
//   입력 flow는 이미 cmp(데크먼저 → 위층먼저 → 같은 티어 40먼저 → 로우)로 정렬돼 있다.
//   여기서는 그 안에서 40ft를 안전하게 앞당기기만 한다(stable).
function reorder40FirstForDischarge(flow) {
  // 단(데크/홀드)별로 분리 — 단 사이 순서(데크 먼저)는 그대로 유지.
  const deckCards = flow.filter(c => isDeckTier(c.main.tier));
  const holdCards = flow.filter(c => !isDeckTier(c.main.tier));

  const reorderWithinTier = (cards) => {
    // 같은 단 안에서, 어떤 20ft 카드가 어떤 40ft '아래'에 깔려 있는지(=그 40ft를 먼저 내려야 함)
    //   판정은 "같은 로우 + 더 높은 티어에 40ft가 있는 20ft"로 한다. 그런 20ft는 40ft보다 뒤여야 하므로
    //   40ft 우선과 충돌하지 않는다(40ft가 어차피 앞). 반대로 40ft 위에 20ft가 얹힌 경우만 종속 위반이 되는데,
    //   그 20ft는 해당 40ft보다 앞에 와야 한다.
    const rowsBlock = new Set();   // 'row' 키: 이 로우엔 (40ft 위에 20ft가 얹힘) → 단순 40우선 금지
    for (const card of cards) {
      const isC40 = cardIs40(card);
      const t = parseInt(card.main.tier, 10);
      const row = card.main.row;
      if (!isC40) {
        // 이 20ft보다 '아래'(낮은 티어) 같은 로우에 40ft가 있으면 = 40ft 위에 20ft 얹힘 → 종속
        const fortyBelow = cards.some(o => cardIs40(o) && o.main.row === row && parseInt(o.main.tier,10) < t);
        if (fortyBelow) rowsBlock.add(row);
      }
    }
    // 종속 없는 로우는 40ft를 앞으로, 20ft를 뒤로 (각 그룹 내부는 기존 cmp 순서 유지=stable).
    // 종속 있는 로우(rowsBlock)는 기존 층 순서를 그대로 둔다.
    const safe40 = [], safe20 = [], blocked = [];
    for (const card of cards) {
      if (rowsBlock.has(card.main.row)) blocked.push(card);
      else if (cardIs40(card)) safe40.push(card);
      else safe20.push(card);
    }
    // V8.50 ①: reorderFullReeferLast(스택 통째 배치) 폐기 — safe40은 cmp 층 순서 그대로 둔다.
    return [...safe40, ...safe20, ...blocked];
  };

  return [...reorderWithinTier(deckCards), ...reorderWithinTier(holdCards)];
}

// 리퍼 판정 (이 모듈 자체 완결성 위해 로컬 헬퍼 — ISO 3번째 글자 R 또는 변형코드)
function cardIsReefer(c) {
  if (!c) return false;
  if (c.rf === true) return true;
  const iso = String(c.iso || '').toUpperCase();
  if (iso.length >= 3 && iso[2] === 'R') return true;
  if (/^R[FE]/.test(iso)) return true;
  if (/^[24]58[25]$/.test(iso)) return true;
  return false;
}

// ── V8.50: 부류·물리 종속 헬퍼 (V8.09-04 reorderFullReeferLast 대체) ──
// 컨테이너 부류 — 패널의 갈림 감지·무언 적응과 공용.
export function conClassOf(c) {
  return { size: is40ft(c) ? '40' : '20', fe: c.fe === 'E' ? 'E' : 'F', rf: cardIsReefer(c) };
}
// 같은 층 안 부류 기본 순서: 풀일반 0 → 풀리퍼 1 → 엠티 2.
function conClassRank(c) {
  if (c.fe === 'E') return 2;
  return cardIsReefer(c) ? 1 : 0;
}
// 카드가 선호 부류에 맞는지.
export function cardMatchesPref(card, pref) {
  const c = card.main;
  if (pref === 'F') return c.fe !== 'E';
  if (pref === 'E') return c.fe === 'E';
  if (pref === 'RF') return cardIsReefer(c);
  if (pref === 'GEN') return !cardIsReefer(c) && c.fe !== 'E';
  if (pref === '40') return cardIs40(card);
  if (pref === '20') return !cardIs40(card);
  return true;
}
// 같은 수직 스택 판정 — 같은 로우 + (같은 베이거나 한쪽이 짝수베이 40(양쪽 20슬롯에 걸침)).
function sameStackPos(a, b) {
  if (a.row !== b.row) return false;
  const ab = parseInt(a.bay, 10), bb = parseInt(b.bay, 10);
  if (ab === bb) return true;
  return ab % 2 === 0 || bb % 2 === 0;
}
function cardPositions(card) { return card.twin ? [card.main, card.twin] : [card.main]; }
// 남은 카드들 중 이 카드 '위'(같은 스택·더 높은 티어)에 안 내린 게 있는지. 단(데크/홀드)이 다르면 비교 안 함.
function blockedByAbove(card, cards) {
  const poss = cardPositions(card);
  return cards.some(o => {
    if (o === card) return false;
    if (isDeckTier(o.main.tier) !== isDeckTier(card.main.tier)) return false;
    return cardPositions(o).some(op => poss.some(p =>
      sameStackPos(op, p) && parseInt(op.tier, 10) > parseInt(p.tier, 10)));
  });
}
// 지금 바로 내릴 수 있는 카드들 — 패널의 갈림 감지용.
export function availableCardsOf(queue) { return queue.filter(card => !blockedByAbove(card, queue)); }
// 선호 부류를 물리 종속 지키며 앞으로 — 위가 막힌 카드는 못 당기고, 못 당긴 것은 기본 순서에 남는다.
function pullStreamForward(cards, pref) {
  const rest = [...cards];
  const out = [];
  for (;;) {
    const idx = rest.findIndex(card => cardMatchesPref(card, pref) && !blockedByAbove(card, rest));
    if (idx === -1) break;
    out.push(...rest.splice(idx, 1));
  }
  return [...out, ...rest];
}

// V9.57: resolveBayGroup 삭제 — 저장소 전체 grep 참조 0 (베이 그룹 선택 UI가 쓰지 않는 잔재).
