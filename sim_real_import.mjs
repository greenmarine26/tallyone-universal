// 실데이터 시뮬레이션 v2: 수정된 userBayDict.js를 실제 import해서 검증
// localStorage mock 설정 후 동적 import

// ===== localStorage mock =====
const _store = {};
global.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
};

// ===== 실데이터 (사용자가 F12로 확인한 master_user_bay_dict_v1) =====
const realDict = {
  DXQD: {
    code: "DXQD",
    name: "XIN QUN DAO",
    callsign: "",
    imo: "",
    caspVersion: "",
    bayDef: {
      sourceFile: "DXQD2615E.pdf",
      parsedAt: "2026-05-17T04:49:07.228Z",
      baysSummary: [{ bay: "001", rowCount: 8 }, { bay: "003", rowCount: 8 }],
      recordCount: 24,
    },
    sourceCreatedDate: "20260412",
  },
  H3OI: {
    code: "H3OI",
    name: "DXQD",
    callsign: "H3OI",
    imo: "",
    bayDef: {
      source: "user",
      _userOwned: true,
      recordCount: 18,
      sourceFile: "matrix_builder",
      parsedAt: "2026-05-20T12:00:00.000Z",
      sourceVersion: "M6.94.4",
      verified: true,
      baysSummary: [
        { bay: "001", rowCount: 10, source: "user" },
        { bay: "003", rowCount: 10, source: "user" },
      ],
    },
  },
  TNJP: {
    code: "TNJP",
    name: "TEN JUPITER",
    callsign: "V7A576",
    imo: "9388417",
    bayDef: {
      source: "user",
      _userOwned: true,
      recordCount: 20,
      baysSummary: [{ bay: "001", rowCount: 8, source: "user" }],
    },
  },
};

localStorage.setItem('master_user_bay_dict_v1', JSON.stringify(realDict));

// ===== 실제 수정된 userBayDict.js import =====
const mod = await import('./src/data/userBayDict.js');
const { lookupUserBayDict, addToUserBayDict, loadUserBayDict } = mod;

// ===== 테스트 케이스 =====
const tests = [
  {
    name: 'T1. DXQD 룩업 → H3OI user entry (M6.94.4 버그 수정 검증)',
    args: ['', 'DXQD'],
    expect: e => e?.code === 'H3OI' && e?.bayDef?.source === 'user',
  },
  {
    name: 'T2. H3OI 룩업 → H3OI entry 그대로',
    args: ['', 'H3OI'],
    expect: e => e?.code === 'H3OI' && e?.bayDef?.source === 'user',
  },
  {
    name: 'T3. XIN QUN DAO 이름 룩업 → DXQD entry (H3OI.name="DXQD"라 미매칭, Phase 2 fallback)',
    args: ['', 'XIN QUN DAO'],
    expect: e => e?.code === 'DXQD',
  },
  {
    name: 'T4. 빈 인자 → null',
    args: ['', ''],
    expect: e => e === null,
  },
  {
    name: 'T5. TNJP IMO 매칭 정상 (다른 선박 영향 없음)',
    args: ['9388417', ''],
    expect: e => e?.code === 'TNJP' && e?.bayDef?.source === 'user',
  },
  {
    name: 'T6. TNJP callsign 매칭 정상',
    args: ['', 'V7A576'],
    expect: e => e?.code === 'TNJP' && e?.bayDef?.source === 'user',
  },
  {
    name: 'T7. 소문자 dxqd 룩업 → H3OI user entry (대소문자 무시)',
    args: ['', 'dxqd'],
    expect: e => e?.code === 'H3OI' && e?.bayDef?.source === 'user',
  },
];

console.log('═'.repeat(80));
console.log('실데이터 시뮬레이션 — 수정된 userBayDict.js (M6.94.5)');
console.log('═'.repeat(80));

let pass = 0;
for (const t of tests) {
  const res = lookupUserBayDict(...t.args);
  const ok = t.expect(res);
  if (ok) pass++;
  console.log(`${ok ? '✅' : '❌ FAIL'} ${t.name}`);
  if (!ok) {
    console.log(`   실제 결과: code=${res?.code}, source=${res?.bayDef?.source}`);
  }
}

// ===== addToUserBayDict cross-fill 검증 =====
console.log('\n' + '─'.repeat(80));
console.log('addToUserBayDict cross-fill 검증');
console.log('─'.repeat(80));

// Scenario: 새 선박 PDF로 entry 추가 (callsign 비어있음)
localStorage.clear();
addToUserBayDict({
  code: 'TEST',
  name: 'TEST VESSEL',
  callsign: '',
  imo: '1234567',
  bayDef: { sourceFile: 'test.pdf', baysSummary: [] },
});
// 같은 배 매트릭스 빌더로 다른 키 추가 (imo 일치)
addToUserBayDict({
  code: 'TSTC',
  name: 'TEST VESSEL',
  callsign: 'V7XYZ',
  imo: '1234567',
  bayDef: { source: 'user', _userOwned: true, baysSummary: [] },
});

const final = loadUserBayDict();
const test1 = final.TEST;
const test2 = final.TSTC;
const crossFillOk = test1?.callsign === 'V7XYZ' && test1?.imo === '1234567';
console.log(`${crossFillOk ? '✅' : '❌ FAIL'} TEST.callsign이 V7XYZ로 cross-fill됐는지 → 실제: callsign=${test1?.callsign}`);
if (crossFillOk) pass++;

// 같은 배 lookup 시 user entry 우선 반환되는지
const sameShipLookup = lookupUserBayDict('1234567', 'TEST');
const lookupOk = sameShipLookup?.code === 'TSTC';
console.log(`${lookupOk ? '✅' : '❌ FAIL'} IMO 매칭 시 TSTC(user) 우선 → 실제: ${sameShipLookup?.code}`);
if (lookupOk) pass++;

const total = tests.length + 2;
console.log('\n' + '═'.repeat(80));
console.log(`최종: ${pass}/${total} PASS`);
console.log('═'.repeat(80));

process.exit(pass === total ? 0 : 1);
