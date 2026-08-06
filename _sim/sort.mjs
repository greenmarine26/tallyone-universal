// 절차서 §5-4 — ② 홈 항차 정렬(자료 완성율 순) 시뮬 (TallyUni 0.8)
//
// 자료: tallyuni-gm RTDB `voyages` **실데이터 33키** (2026-08-06 읽기 GET, 익명인증).
//       /tmp/uni/vg/<키>.json 에 항차별로 받아 둔 것을 읽는다.
//
// 확인하는 것
//   1. 완성율 — 양하·선적 다 갖춘 항차 1.0 / 한쪽만 있는 항차(ATPR류)도 1.0 이 될 수 있는가
//   2. 2차 키 — EDI 만 온 항차가 자료 0 항차 위에 서는가
//   3. 파급 — 카드 숫자(평택·매칭·누락·완료)가 수정 전/후 한 자리도 안 변하는가
//
// 실행: node _sim/sort.mjs [--save before|after]
import fs from 'fs';
import path from 'path';

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { isPyeongtaekPort, ownDirCns, isVirtualCn } = await import('../src/utils.js');

const VG = '/tmp/uni/vg';
const voyages = {};
for (const f of fs.readdirSync(VG).sort()) {
  if (!f.endsWith('.json')) continue;
  const v = JSON.parse(fs.readFileSync(path.join(VG, f), 'utf8'));
  if (v && v.info) voyages[f.replace(/\.json$/, '')] = v;
}
console.log(`실 항차 ${Object.keys(voyages).length}키 로드`);

// ── 절차서 §5-2 완성율 — **HomePage.jsx 의 실제 코드를 뽑아서 돌린다** ────────
//   복사본을 시험하면 "시뮬은 통과했는데 화면은 다르다"가 된다. 소스에서 그대로 꺼내 쓴다.
const HOME = fs.readFileSync(new URL('../src/pages/HomePage.jsx', import.meta.url), 'utf8');
function extractBlock(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error(`HomePage.jsx 에서 못 찾음: ${startMarker}`);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('블록 끝을 못 찾음');
}
const READY_SRC = extractBlock(HOME, 'const _readyOf = (sec, mode) => {');
const _readyOf = new Function('isPyeongtaekPort', 'ownDirCns',
  `${READY_SRC}; return _readyOf;`)(isPyeongtaekPort, ownDirCns);
console.log(`HomePage.jsx 의 _readyOf 를 그대로 추출해 실행 (${READY_SRC.length}자)`);

// ── 카드 숫자 (HomePage.computeStats 재현 — 파급 검증용) ────────────────────
const cardOf = (sec, mode) => {
  if (!sec) return null;
  const edi = sec.ediContainers || {};
  const recs = sec.records || {};
  const completed = sec.completed || {};
  const ptk = new Set();
  Object.entries(edi).forEach(([key, c]) => {
    if (!c) return;
    const isPtk = mode === 'discharge' ? isPyeongtaekPort(c.pod) : isPyeongtaekPort(c.pol);
    if (isPtk) ptk.add(c.cn || key);
  });
  const rec = new Set(ownDirCns(recs, mode));
  const matched = [...ptk].filter(cn => rec.has(cn)).length;
  const dummyE = mode === 'loading' ? [...ptk].filter(cn => isVirtualCn(cn)).length : 0;
  const slots = [...ptk].filter(cn => String(cn).startsWith('__SLOT_')).length;
  return {
    ptk: ptk.size,
    matched,
    missing: Math.max(0, ptk.size - matched - dummyE - slots),
    total: rec.size > 0 ? rec.size : ptk.size,
    done: Object.keys(completed).length,
  };
};

const rows = Object.entries(voyages).map(([k, v]) => {
  const rs = [_readyOf(v.discharge, 'discharge'), _readyOf(v.loading, 'loading')].filter(Boolean);
  const num = rs.reduce((s, x) => s + x.matched, 0);
  const den = rs.reduce((s, x) => s + x.den, 0);
  return {
    key: k,
    secs: [v.discharge ? 'D' : '', v.loading ? 'L' : ''].filter(Boolean).join('+') || '-',
    _ready: den > 0 ? num / den : 0,
    _hasData: den > 0,
    num, den,
    cards: { discharge: cardOf(v.discharge, 'discharge'), loading: cardOf(v.loading, 'loading') },
  };
});

// 정렬 1·2차 키도 HomePage.jsx 의 실제 문장을 뽑아서 쓴다.
//   3차(작업시간 근접순)는 PORT-MIS·도선 자료가 필요해 시뮬 밖 — 동률이면 원래 순서 유지로 본다.
const SORT_SRC = HOME.slice(HOME.indexOf('.sort((a, b) => {'), HOME.indexOf('// V9.01: 작업시간 근접순'));
const twoKeys = SORT_SRC.slice(SORT_SRC.indexOf('const _rd ='));
const cmp = new Function('a', 'b', `${twoKeys}\n return 0;`);
const sorted = [...rows].sort(cmp);

console.log('\n순위  항차            섹션  완성율    매칭/분모  자료');
console.log('---------------------------------------------------------');
sorted.forEach((r, i) => {
  console.log(
    String(i + 1).padStart(3) + '   ' +
    r.key.padEnd(15) + ' ' +
    r.secs.padEnd(5) + ' ' +
    (r._ready).toFixed(4).padStart(7) + '  ' +
    `${r.num}/${r.den}`.padStart(10) + '  ' +
    (r._hasData ? '있음' : '없음')
  );
});

let fail = 0;
const chk = (n, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? '  ' + extra : ''}`); };
console.log('');

// 1) 완성율 1.0 항차는 그 항차가 가진 섹션이 전부 맞아떨어진 것
const full = sorted.filter(r => r._ready >= 0.9999);
chk('완성율 1.0 항차 존재', full.length > 0, `${full.length}개: ${full.map(r => r.key + '(' + r.secs + ')').join(', ')}`);

// 2) ATPR류 — 한쪽 섹션만 있는 항차도 1.0 이 될 수 있어야 한다
const oneSide = rows.filter(r => r.secs === 'D' || r.secs === 'L');
const oneSideFull = oneSide.filter(r => r._ready >= 0.9999);
chk('한쪽만 있는 항차가 1.0 이 된다', oneSideFull.length > 0,
  `한쪽만=${oneSide.length}개 중 1.0=${oneSideFull.length}개: ${oneSideFull.map(r => r.key).join(', ') || '없음'}`);

// 3) 정렬 단조성 — 완성율 내림차순
let mono = true;
for (let i = 1; i < sorted.length; i++) if (sorted[i]._ready - sorted[i - 1]._ready > 0.0001) mono = false;
chk('완성율 내림차순', mono);

// 4) 2차 키 — 완성율 0 구간에서 자료 있는 항차가 자료 없는 항차보다 위
const zero = sorted.filter(r => r._ready < 0.0001);
let secondKey = true, seenNoData = false;
for (const r of zero) { if (!r._hasData) seenNoData = true; else if (seenNoData) secondKey = false; }
chk('완성율 0 구간에서 자료 있는 배가 위', secondKey,
  `완성율0=${zero.length}개 (자료있음 ${zero.filter(r => r._hasData).length} · 없음 ${zero.filter(r => !r._hasData).length})`);
const zeroWithData = zero.filter(r => r._hasData);
if (zeroWithData.length) console.log('      완성율 0 인데 자료는 있는 항차: ' + zeroWithData.map(r => `${r.key}(${r.num}/${r.den})`).join(', '));

// 5) 파급 — 카드 숫자 스냅샷 저장/대조
const snap = {};
rows.forEach(r => { snap[r.key] = r.cards; });
const arg = process.argv[2] === '--save' ? process.argv[3] : null;
const SNAP = '/tmp/uni/cards_';
if (arg) {
  fs.writeFileSync(SNAP + arg + '.json', JSON.stringify(snap, null, 1));
  console.log(`\n카드 숫자 스냅샷 저장 → ${SNAP}${arg}.json`);
}
if (fs.existsSync(SNAP + 'before.json')) {
  const before = JSON.parse(fs.readFileSync(SNAP + 'before.json', 'utf8'));
  const same = JSON.stringify(before) === JSON.stringify(snap);
  chk('카드 숫자 수정 전/후 불변', same);
  if (!same) {
    for (const k of Object.keys(snap)) {
      if (JSON.stringify(before[k]) !== JSON.stringify(snap[k]))
        console.log('  ✗', k, JSON.stringify(before[k]), '→', JSON.stringify(snap[k]));
    }
  }
}

console.log(fail === 0 ? '\n✅ 전체 PASS' : `\n❌ FAIL ${fail}건`);
process.exit(fail ? 1 : 0);
