// 확장 시뮬레이션: 여러 선박 시나리오에서 M6.94.5 수정이 동일하게 적용되는지 검증
//
// 시나리오:
//   A. 매트릭스 빌더만 등록된 선박 (user-only)
//   B. PDF만 등록된 선박 (auto-only, user 없음)
//   C. 같은 배가 PDF + 매트릭스 빌더 양쪽 등록 (DXQD 케이스 = 핵심 버그 패턴)
//   D. .def 파일로 등록된 선박 (verified, user 마킹)
//   E. Firebase 동기화로 들어온 entry (검수원 공유, user 마킹)

// ===== localStorage mock =====
const _store = {};
global.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
};

// ===== 사용자 보고 dict + 확장 (여러 선박) =====
const multiShipDict = {
  // === 시나리오 C: DXQD 케이스 (PDF + 매트릭스 빌더 분리) ===
  DXQD: {
    code: "DXQD", name: "XIN QUN DAO", callsign: "", imo: "",
    bayDef: { sourceFile: "DXQD2615E.pdf", baysSummary: [{ bay: "001" }], recordCount: 24 },
  },
  H3OI: {
    code: "H3OI", name: "DXQD", callsign: "H3OI", imo: "",
    bayDef: { source: "user", _userOwned: true, sourceFile: "matrix_builder",
              baysSummary: [{ bay: "001", rowCount: 10 }], recordCount: 18 },
  },

  // === 시나리오 C': 다른 선박도 같은 패턴 (PCBJ + V7XYZ 분리) ===
  PCBJ: {
    code: "PCBJ", name: "PCBJ CONTINENTAL", callsign: "", imo: "",
    bayDef: { sourceFile: "PCBJ_stowage.pdf", baysSummary: [], recordCount: 30 },
  },
  V7XY: {
    code: "V7XY", name: "PCBJ", callsign: "V7XY", imo: "",
    bayDef: { source: "user", _userOwned: true, sourceFile: "matrix_builder",
              baysSummary: [{ bay: "001", rowCount: 9 }], recordCount: 22 },
  },

  // === 시나리오 A: 매트릭스 빌더만 등록 (user-only, 다른 키 없음) ===
  TNJP: {
    code: "TNJP", name: "TEN JUPITER", callsign: "V7A576", imo: "9388417",
    bayDef: { source: "user", _userOwned: true, baysSummary: [{ bay: "001" }], recordCount: 20 },
  },

  // === 시나리오 B: PDF만 등록 (auto-only, user 데이터 없음) ===
  HESH: {
    code: "HESH", name: "HE SHENG", callsign: "", imo: "",
    bayDef: { sourceFile: "HESH_stowage.pdf", baysSummary: [{ bay: "001" }], recordCount: 15 },
  },

  // === 시나리오 D: .def 업로드 → user 소스 ===
  ATPR: {
    code: "ATPR", name: "ATLANTIC PIONEER", callsign: "V2BC4", imo: "9302345",
    bayDef: { source: "user", _userOwned: true, sourceFile: "ATPR.def",
              baysSummary: [{ bay: "001" }], recordCount: 16, verified: true },
  },

  // === 시나리오 E: Firebase 동기화 (다른 검수원이 등록한 user 데이터) ===
  KSKM: {
    code: "KSKM", name: "KSL KOMETIK", callsign: "9HA5060", imo: "9123456",
    bayDef: { source: "user", _userOwned: true, sourceFile: "fb_sync",
              baysSummary: [{ bay: "001" }], recordCount: 25 },
  },
};

localStorage.setItem('master_user_bay_dict_v1', JSON.stringify(multiShipDict));

// ===== 실제 수정된 코드 import =====
const { lookupUserBayDict } = await import('./src/data/userBayDict.js');

// ===== 시나리오별 테스트 =====
const scenarios = [
  // --- 시나리오 C: DXQD 패턴 (핵심 버그 수정) ---
  { group: 'C. 같은 배 PDF+매트릭스 빌더 분리',
    cases: [
      { name: 'DXQD 코드 룩업', args: ['', 'DXQD'], expect: 'H3OI', expectSrc: 'user' },
      { name: 'H3OI 콜사인 룩업', args: ['', 'H3OI'], expect: 'H3OI', expectSrc: 'user' },
      { name: 'PCBJ 코드 룩업 (다른 선박도 동일 패턴)', args: ['', 'PCBJ'], expect: 'V7XY', expectSrc: 'user' },
      { name: 'V7XY 콜사인 룩업', args: ['', 'V7XY'], expect: 'V7XY', expectSrc: 'user' },
    ]
  },

  // --- 시나리오 A: 매트릭스 빌더만 ---
  { group: 'A. 매트릭스 빌더만 등록 (user-only)',
    cases: [
      { name: 'TNJP 코드 룩업', args: ['', 'TNJP'], expect: 'TNJP', expectSrc: 'user' },
      { name: 'TEN JUPITER 이름 룩업', args: ['', 'TEN JUPITER'], expect: 'TNJP', expectSrc: 'user' },
      { name: 'IMO 9388417 룩업', args: ['9388417', ''], expect: 'TNJP', expectSrc: 'user' },
      { name: 'V7A576 콜사인 룩업', args: ['', 'V7A576'], expect: 'TNJP', expectSrc: 'user' },
    ]
  },

  // --- 시나리오 B: PDF만 (user 없음) ---
  { group: 'B. PDF 자동 파싱만 (user 없음 → Phase 2 정상 동작)',
    cases: [
      { name: 'HESH 코드 룩업', args: ['', 'HESH'], expect: 'HESH', expectSrc: undefined },
      { name: 'HE SHENG 이름 룩업', args: ['', 'HE SHENG'], expect: 'HESH', expectSrc: undefined },
    ]
  },

  // --- 시나리오 D: .def 업로드 ---
  { group: 'D. .def 업로드 (user-verified)',
    cases: [
      { name: 'ATPR 코드 룩업', args: ['', 'ATPR'], expect: 'ATPR', expectSrc: 'user' },
      { name: 'V2BC4 콜사인 룩업', args: ['', 'V2BC4'], expect: 'ATPR', expectSrc: 'user' },
      { name: 'IMO 9302345 룩업', args: ['9302345', ''], expect: 'ATPR', expectSrc: 'user' },
    ]
  },

  // --- 시나리오 E: Firebase 동기화 entry ---
  { group: 'E. Firebase 동기화 entry (다른 검수원 공유)',
    cases: [
      { name: 'KSKM 코드 룩업', args: ['', 'KSKM'], expect: 'KSKM', expectSrc: 'user' },
      { name: 'KSL KOMETIK 이름 룩업', args: ['', 'KSL KOMETIK'], expect: 'KSKM', expectSrc: 'user' },
    ]
  },

  // --- 교차 영향 검증: 한 선박 룩업이 다른 선박 entry를 가리키지 않음 ---
  { group: 'X. 교차 영향 격리 (다른 선박 데이터 안 가져옴)',
    cases: [
      { name: 'DXQD 룩업이 TNJP/ATPR/KSKM 가져오지 않음', args: ['', 'DXQD'], expect: 'H3OI', expectSrc: 'user' },
      { name: 'TNJP 룩업이 H3OI 가져오지 않음', args: ['', 'TNJP'], expect: 'TNJP', expectSrc: 'user' },
      { name: '존재하지 않는 코드 → null', args: ['', 'XXXX'], expect: null, expectSrc: undefined },
      { name: '존재하지 않는 IMO → null', args: ['9999999', ''], expect: null, expectSrc: undefined },
    ]
  },
];

// ===== 실행 + 결과 =====
console.log('═'.repeat(85));
console.log('확장 시뮬레이션: M6.94.5가 다양한 선박 시나리오에 동일 적용되는지 검증');
console.log('═'.repeat(85));

let totalPass = 0, totalTests = 0;
for (const g of scenarios) {
  console.log(`\n[${g.group}]`);
  for (const t of g.cases) {
    totalTests++;
    const res = lookupUserBayDict(...t.args);
    const code = res?.code || null;
    const src = res?.bayDef?.source;
    const codeOk = code === t.expect;
    const srcOk = t.expectSrc === undefined ? true : src === t.expectSrc;
    const ok = codeOk && srcOk;
    if (ok) totalPass++;
    console.log(`  ${ok ? '✅' : '❌'} ${t.name}`);
    if (!ok) {
      console.log(`     expect: code=${t.expect}, src=${t.expectSrc}`);
      console.log(`     actual: code=${code}, src=${src}`);
    }
  }
}

console.log('\n' + '═'.repeat(85));
console.log(`결과: ${totalPass}/${totalTests} PASS`);
console.log('═'.repeat(85));

process.exit(totalPass === totalTests ? 0 : 1);
