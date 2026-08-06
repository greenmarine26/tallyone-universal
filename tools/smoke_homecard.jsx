// TallyUni 0.10 — 홈 카드 둘째 줄(작업일시 + 자료 상태) 렌더 연막검사.
//
//   왜 따로 있나 — `_sim/cardstate.mjs` 는 **판정**(무엇을 보여줄지)을 실데이터로 검사하고,
//   이 파일은 **칠하기**(실제로 그려지는지)를 검사한다. 빌드 성공도 번들 grep 도
//   "화면에 그 줄이 안 뜬다"를 못 잡는다 — V9.23-06 사고가 그 부류였다.
//   ⚠ 복사본이 아니라 **HomePage.jsx 를 그대로 올려** 여섯 가지 상태를 한 번에 그린다.
//
//   실행:
//     npx esbuild tools/smoke_homecard.jsx --bundle --loader:.js=jsx --loader:.jsx=jsx \
//       --jsx=automatic --outfile=/tmp/smoke_homecard.cjs --format=cjs --platform=node \
//       --define:process.env.NODE_ENV='"development"' --log-level=error
//     node /tmp/smoke_homecard.cjs
//
//   확인하는 것 (절차서 ③ §3-2 표기 형태 그대로)
//     🗓 작업 08-07 06:00 ~ 21:00        · ✅ 자료 확정
//     🗓 작업 08-07 06:00 ~ 21:00        · ✏ 수정본 08-06 18:39
//     🗓 작업 08-07 06:00 ~ 21:00        · ⏳ 선적자료 대기중 · 갱신 08-06 17:40
//     🗓 작업 08-07 06:00 ~ 21:00        · 갱신 —
//     🗓 작업 08-09 19:00 ~ 08-10 12:00  · 자료 없음
//   같은 날 끝나면 종료 날짜가 생략되고, 날이 넘어가면 붙는다는 것도 여기서 눈으로 확인된다.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../src/pages/HomePage.jsx';

const now = Date.now();
const mk = (over) => ({
  info: {
    vsl: 'TNJP', voy: '26356E', voy_d: '26356E', voy_l: '26356W', carrier: 'T',
    createdAt: now - 86400000, berth: '', pier: '',
    planDate: '2026-08-07 06:00 ~ 2026-08-07 21:00',
    ...(over.info || {}),
  },
  discharge: over.discharge,
  loading: over.loading,
});
const cn = 'ABCU1234567';
const sec = (mode) => ({
  ediContainers: { [cn]: { cn, pod: mode === 'discharge' ? 'KRPTK' : 'CNTAO', pol: mode === 'loading' ? 'KRPTK' : 'CNTAO' } },
  records: { [cn]: { cn, pod: mode === 'discharge' ? 'KRPTK' : 'CNTAO', pol: mode === 'loading' ? 'KRPTK' : 'CNTAO' } },
  dataAt: now - 3600000,
});
const voyages = {
  // 양+선 선언인데 양하만 왔다 — ④가 고친 바로 그 항차(TNJP 26356E 모양)
  WAIT: mk({ discharge: sec('discharge') }),
  // 둘 다 왔고 확정 기록이 자료 저장보다 나중 — ✅ 자료 확정
  FIXED: mk({ info: { voy_d: '1E', voy_l: '1W', dataFixedAt: now - 1800000 },
              discharge: sec('discharge'), loading: sec('loading') }),
  // 확정 1분 뒤에 자료가 또 들어왔다 — ✏ 수정본
  REVISED: mk({ info: { voy_d: '2E', voy_l: '2W', dataFixedAt: now - 7200000 },
                discharge: { ...sec('discharge'), dataAt: now - 60000 }, loading: sec('loading') }),
  // 예정 카드 — info 만 있고 섹션이 없다(수집기 autoStatus 'expected')
  NONE: mk({ info: { voy_d: '3E', voy_l: null, planDate: '2026-08-09 19:00 ~ 2026-08-10 12:00' } }),
  // 리스트만 있고 시각을 모른다 — 갱신 —
  LIST_ONLY: mk({ info: { voy_d: '4E', voy_l: null }, discharge: { records: { [cn]: { cn, pod: 'KRPTK' } } } }),
};

const html = renderToStaticMarkup(React.createElement(HomePage, {
  voyages, inspectors: {}, inspector: { name: '검수원' },
  onOpenVoyage: () => {}, onOpenChiefDashboard: () => {}, onOpenAux: () => {}, onRefreshData: () => {},
}));

const cards = [...new Set(html.split(/<\/?div[^>]*>/).filter((s) => s.includes('🗓'))
  .map((s) => s.replace(/<[^>]+>/g, '').trim()))];
console.log('렌더 성공 — %d자', html.length);
cards.forEach((c) => console.log('  카드 ' + c));

let fail = 0;
const chk = (name, ok) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
chk('✅ 자료 확정', html.includes('✅ 자료 확정'));
chk('✏ 수정본', html.includes('✏ 수정본'));
chk('⏳ 선적자료 대기중', html.includes('⏳ 선적자료 대기중'));
chk('갱신 —(자료는 있는데 시각 모름)', html.includes('갱신 —'));
chk('자료 없음(예정 카드)', html.includes('자료 없음'));
chk('작업일시 — 같은 날이면 종료 날짜 생략', cards.some((c) => c.includes('작업 08-07 06:00 ~ 21:00')));
chk('작업일시 — 날이 넘어가면 날짜를 붙인다', cards.some((c) => c.includes('~ 08-10 12:00')));
chk('⛔ 등록일자(🗂 등록)는 더 이상 없다', !html.includes('🗂 등록'));
console.log(fail === 0 ? '\n✅ 렌더 연막 전건 PASS' : `\n❌ FAIL ${fail}건`);
process.exit(fail ? 1 : 0);
