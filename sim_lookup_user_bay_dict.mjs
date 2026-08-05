// 시뮬레이션: lookupUserBayDict (현재 M6.94.4) vs 수정안 (M6.94.5)
// 실데이터: 사용자가 F12 → master_user_bay_dict_v1에서 확인한 dict 구조
//
// 핵심 검증: lookupUserBayDict("", "DXQD") 호출 시 H3OI entry (user 소스) 반환되는지

// ========== 실데이터 기반 mock dict ==========
const mockDict = {
  // PDF 자동 파싱으로 등록된 entry (source 마킹 없음)
  DXQD: {
    code: "DXQD",
    name: "XIN QUN DAO",
    callsign: "",
    imo: "",
    caspVersion: "",
    bayDef: {
      sourceFile: "DXQD2615E.pdf",
      parsedAt: "2026-05-17T04:49:07.228Z",
      // source 필드 없음, _userOwned 없음
      baysSummary: [
        // PDF에서 자동 추출된 더미 데이터 (수량만 비교)
        { bay: "001", rowCount: 8 }, { bay: "003", rowCount: 8 },
        { bay: "005", rowCount: 8 }, // ... PDF 베이들
      ],
      recordCount: 24,
    },
    sourceCreatedDate: "20260412",
  },

  // 매트릭스 빌더로 저장된 사용자 entry (source: "user", _userOwned: true)
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
        // 사용자가 매트릭스 빌더에서 입력한 18개 베이
        { bay: "001", rowCount: 10, source: "user" },
        { bay: "003", rowCount: 10, source: "user" },
        // ... 18건
      ],
    },
  },

  // 추가: 다른 정상 선박 (영향 없음 검증용)
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

// ========== 현재 코드 (M6.94.4) — userBayDict.js:42-101 1:1 복사 ==========
function lookupUserBayDict_CURRENT(dict, imo, codeOrName) {
  if (!dict || Object.keys(dict).length === 0) return null;

  const arg = String(codeOrName || '').trim();
  const argU = arg.toUpperCase();
  const argClean = argU.replace(/\s+/g, '');
  const imoU = String(imo || '').trim().toUpperCase();

  // 1) IMO 키 직접
  if (imoU && dict[imoU]) return dict[imoU];
  // 2) code 키 직접
  if (arg && dict[arg]) return dict[arg];
  if (argU && dict[argU]) return dict[argU];
  // 3) entry.imo 필드
  if (imoU) {
    for (const k of Object.keys(dict)) {
      const eimo = String(dict[k]?.imo || '').trim().toUpperCase();
      if (eimo && eimo === imoU) return dict[k];
    }
  }
  // 4) entry.code 필드
  if (argU) {
    for (const k of Object.keys(dict)) {
      const ec = String(dict[k]?.code || '').trim().toUpperCase();
      if (ec && ec === argU) return dict[k];
    }
  }
  // 5) entry.callsign 필드
  if (imoU) {
    for (const k of Object.keys(dict)) {
      const cs = String(dict[k]?.callsign || '').trim().toUpperCase();
      if (cs && cs === imoU) return dict[k];
    }
  }
  if (argU) {
    for (const k of Object.keys(dict)) {
      const cs = String(dict[k]?.callsign || '').trim().toUpperCase();
      if (cs && cs === argU) return dict[k];
    }
  }
  // 6) entry.name fuzzy
  if (argClean && argClean.length >= 4) {
    for (const k of Object.keys(dict)) {
      const n = String(dict[k]?.name || '').toUpperCase().replace(/\s+/g, '');
      if (!n) continue;
      if (n === argClean) return dict[k];
      if (n.startsWith(argClean) || argClean.startsWith(n)) return dict[k];
      if (n.length >= 5 && argClean.length >= 5 && n.slice(0, 5) === argClean.slice(0, 5)) return dict[k];
    }
  }
  return null;
}

// ========== 수정안 (M6.94.5) — user-source 우선 2-Phase ==========
// 사용자 원칙 ① userBayDict 절대 보호: source:"user" 또는 _userOwned:true entry가
// 모든 비-user entry보다 우선 매칭되어야 함.
function lookupUserBayDict_FIXED(dict, imo, codeOrName) {
  if (!dict || Object.keys(dict).length === 0) return null;

  // 6단계 매칭 핵심 로직을 닫힌 함수로 (subset에 적용 가능하게)
  const matchIn = (subDict) => {
    if (!subDict || Object.keys(subDict).length === 0) return null;
    const arg = String(codeOrName || '').trim();
    const argU = arg.toUpperCase();
    const argClean = argU.replace(/\s+/g, '');
    const imoU = String(imo || '').trim().toUpperCase();

    if (imoU && subDict[imoU]) return subDict[imoU];
    if (arg && subDict[arg]) return subDict[arg];
    if (argU && subDict[argU]) return subDict[argU];

    if (imoU) {
      for (const k of Object.keys(subDict)) {
        const eimo = String(subDict[k]?.imo || '').trim().toUpperCase();
        if (eimo && eimo === imoU) return subDict[k];
      }
    }
    if (argU) {
      for (const k of Object.keys(subDict)) {
        const ec = String(subDict[k]?.code || '').trim().toUpperCase();
        if (ec && ec === argU) return subDict[k];
      }
    }
    if (imoU) {
      for (const k of Object.keys(subDict)) {
        const cs = String(subDict[k]?.callsign || '').trim().toUpperCase();
        if (cs && cs === imoU) return subDict[k];
      }
    }
    if (argU) {
      for (const k of Object.keys(subDict)) {
        const cs = String(subDict[k]?.callsign || '').trim().toUpperCase();
        if (cs && cs === argU) return subDict[k];
      }
    }
    if (argClean && argClean.length >= 4) {
      for (const k of Object.keys(subDict)) {
        const n = String(subDict[k]?.name || '').toUpperCase().replace(/\s+/g, '');
        if (!n) continue;
        if (n === argClean) return subDict[k];
        if (n.startsWith(argClean) || argClean.startsWith(n)) return subDict[k];
        if (n.length >= 5 && argClean.length >= 5 && n.slice(0, 5) === argClean.slice(0, 5)) return subDict[k];
      }
    }
    return null;
  };

  // Phase 1: user 소스 entry만 대상으로 매칭 (원칙 ① 보호)
  const userOnly = {};
  for (const k of Object.keys(dict)) {
    const e = dict[k];
    if (e?.bayDef?.source === 'user' || e?.bayDef?._userOwned === true) {
      userOnly[k] = e;
    }
  }
  const userMatch = matchIn(userOnly);
  if (userMatch) return userMatch;

  // Phase 2: 전체 dict 대상으로 기존 6단계 매칭 (현행 호환)
  return matchIn(dict);
}

// ========== 테스트 케이스 ==========
const tests = [
  {
    name: 'T1. DXQD 룩업 → 매트릭스 빌더(H3OI) user entry 반환되어야',
    args: ['', 'DXQD'],
    expectKey: 'H3OI',     // user 우선이라 H3OI 반환되어야 함
    expectSource: 'user',
  },
  {
    name: 'T2. H3OI 룩업 → H3OI entry 그대로',
    args: ['', 'H3OI'],
    expectKey: 'H3OI',
    expectSource: 'user',
  },
  {
    name: 'T3. XIN QUN DAO 이름 룩업 → H3OI 우선 (user 보호)',
    // H3OI.name="DXQD"여서 name fuzzy 매칭 실패하지만
    // DXQD.name="XIN QUN DAO"는 user 아님 → Phase 2에서 DXQD 반환
    args: ['', 'XIN QUN DAO'],
    expectKey: 'DXQD',
    expectSource: undefined,
  },
  {
    name: 'T4. 빈 인자 → null',
    args: ['', ''],
    expectKey: null,
  },
  {
    name: 'T5. 무관한 선박 (TNJP) — IMO 매칭 정상',
    args: ['9388417', ''],
    expectKey: 'TNJP',
    expectSource: 'user',
  },
  {
    name: 'T6. 무관한 선박 (TNJP) — callsign 매칭 정상',
    args: ['', 'V7A576'],
    expectKey: 'TNJP',
    expectSource: 'user',
  },
];

// ========== 실행 + 비교 ==========
function findKey(dict, entry) {
  if (!entry) return null;
  for (const k of Object.keys(dict)) {
    if (dict[k] === entry) return k;
  }
  return '?';
}

console.log('═'.repeat(80));
console.log('시뮬레이션: lookupUserBayDict — 현재(M6.94.4) vs 수정안(M6.94.5)');
console.log('═'.repeat(80));

let curPass = 0, fixPass = 0;
for (const t of tests) {
  const curRes = lookupUserBayDict_CURRENT(mockDict, ...t.args);
  const fixRes = lookupUserBayDict_FIXED(mockDict, ...t.args);
  const curKey = findKey(mockDict, curRes);
  const fixKey = findKey(mockDict, fixRes);
  const curSrc = curRes?.bayDef?.source;
  const fixSrc = fixRes?.bayDef?.source;

  const curOk = (curKey === t.expectKey) && (t.expectSource === undefined || curSrc === t.expectSource);
  const fixOk = (fixKey === t.expectKey) && (t.expectSource === undefined || fixSrc === t.expectSource);

  if (curOk) curPass++;
  if (fixOk) fixPass++;

  console.log(`\n${t.name}`);
  console.log(`  Expected: key=${t.expectKey}${t.expectSource ? `, source=${t.expectSource}` : ''}`);
  console.log(`  CURRENT:  key=${curKey}, source=${curSrc} ${curOk ? '✅' : '❌ FAIL'}`);
  console.log(`  FIXED:    key=${fixKey}, source=${fixSrc} ${fixOk ? '✅' : '❌ FAIL'}`);
}

console.log('\n' + '═'.repeat(80));
console.log(`결과: CURRENT ${curPass}/${tests.length} PASS, FIXED ${fixPass}/${tests.length} PASS`);
console.log('═'.repeat(80));

// 종료 코드: 수정안이 모두 통과해야 0
process.exit(fixPass === tests.length ? 0 : 1);
