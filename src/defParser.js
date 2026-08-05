// CASP SHIP DEFINE FILE (.def) 파서 — M4.4 신규
// 검증된 분석 방법론 기반 (CASP_DEF_ANALYSIS_GUIDE.md)
// TJTEN JUPITER (TNJP) .def로 검증 완료
//
// 추출 가능 (확정):
//   - 매직 헤더, 포맷 버전, 작성일, 선박명, 식별번호
//   - 베이 번호 리스트 (정확)
//   - 섹션/그룹 ID, 짝꿍 인덱스, 트리오 매핑
//   - Cell Type Code (((CC, ''DD 등)
//   - Hold/Deck 보유 여부
//
// 추출 불가능 (.def에 없음):
//   - 컨테이너 데이터 (BAPLIE EDI 영역)
//   - 정확한 ROW/TIER 의미 (CASP 사양 비공개 → 원시값만 추출, "추정" 표시)

// ─── 1단계: 매직 헤더 검증 + 헤더 파싱 ──────────────────
function bytesToAscii(bytes, start, length) {
  const slice = bytes.slice(start, start + length);
  let s = '';
  for (let i = 0; i < slice.length; i++) {
    const b = slice[i];
    if (b >= 0x20 && b <= 0x7E) s += String.fromCharCode(b);
    else s += '\u0000';
  }
  return s;
}

function findAsciiInRange(bytes, start, end) {
  // [\x20-\x7E]{4,} 패턴: 4글자 이상 인쇄가능 ASCII 연속 추출
  const results = [];
  let cur = '';
  let curStart = -1;
  for (let i = start; i < Math.min(end, bytes.length); i++) {
    const b = bytes[i];
    if (b >= 0x20 && b <= 0x7E) {
      if (cur.length === 0) curStart = i;
      cur += String.fromCharCode(b);
    } else {
      if (cur.length >= 4) results.push({ text: cur, start: curStart });
      cur = '';
      curStart = -1;
    }
  }
  if (cur.length >= 4) results.push({ text: cur, start: curStart });
  return results;
}

const MAGIC = 'CASP SHIP DEFINE FILE';

export function isCaspDefFile(bytes) {
  if (!bytes || bytes.length < MAGIC.length) return false;
  return bytesToAscii(bytes, 0, MAGIC.length) === MAGIC;
}

function parseHeader(bytes) {
  // 헤더 영역 (0~200 바이트) 분석
  const headerSlice = bytes.slice(0, 220);

  // 버전: 23~28 부근 "X.XX" 패턴
  const versionStr = bytesToAscii(bytes, 22, 8).trim();
  const versionMatch = versionStr.match(/(\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : 'UNKNOWN';

  // 작성일: \r\n 다음 8자리 숫자
  let created = 'UNKNOWN';
  for (let i = 0; i < headerSlice.length - 10; i++) {
    if (headerSlice[i] === 0x0D && headerSlice[i + 1] === 0x0A) {
      const candidate = bytesToAscii(bytes, i + 2, 8);
      if (/^\d{8}$/.test(candidate)) {
        created = candidate;
        break;
      }
    }
  }

  // 선박명: \x1a (SUB) 다음 ASCII 문자열
  let vesselName = 'UNKNOWN';
  let identifier = 'UNKNOWN';
  for (let i = 0; i < Math.min(200, bytes.length); i++) {
    if (bytes[i] === 0x1A) {
      // 다음 60자 영역에서 영숫자/공백 추출
      const asciiBlock = bytesToAscii(bytes, i + 1, 60);
      // 첫 영숫자부터 공백 4개 이상 연속 전까지 = 선박명
      const m = asciiBlock.match(/^([A-Z][A-Z0-9 ]{2,40})/);
      if (m) vesselName = m[1].trim();
      // 그 뒤 식별번호 (영숫자 6~14자리)
      const idMatch = asciiBlock.match(/^[A-Z][A-Z0-9 ]{2,40}\s+([A-Z0-9]{6,15})/);
      if (idMatch) identifier = idMatch[1].trim();
      break;
    }
  }

  return { version, created, vesselName, identifier };
}

// ─── 4단계: 베이 마커 위치 매핑 ──────────────────────────
function findBayMarkers(bytes) {
  // 베이 마커 패턴: 2자리 숫자 + 공백 5개 ("01     ")
  // 정규식 대신 byte-level 스캔
  const positions = {};

  // ASCII 문자열 스캔 (135K~141K 영역에 베이 블록 위치)
  // 일반적으로 헤더 이후 바로 시작하지 않으므로 전체 스캔
  for (let i = 0; i < bytes.length - 7; i++) {
    // "DD     " 패턴 (D=숫자, 다음 5바이트 모두 0x20)
    const b0 = bytes[i], b1 = bytes[i + 1];
    if (b0 < 0x30 || b0 > 0x39) continue;
    if (b1 < 0x30 || b1 > 0x39) continue;
    if (bytes[i + 2] !== 0x20) continue;
    if (bytes[i + 3] !== 0x20) continue;
    if (bytes[i + 4] !== 0x20) continue;
    if (bytes[i + 5] !== 0x20) continue;
    if (bytes[i + 6] !== 0x20) continue;
    // 그 다음 바이트가 \x20이 아니어야 (정확히 5스페이스)
    if (bytes[i + 7] === 0x20) continue;

    const bay = String.fromCharCode(b0, b1);
    // 첫 출현만 기록 (베이 블록 시작점)
    if (!(bay in positions)) {
      positions[bay] = i;
    }
  }

  return positions;
}

// ─── 5단계: 블록 크기 계산 ──────────────────────────────
function detectBlockSize(positions) {
  const offsets = Object.values(positions).sort((a, b) => a - b);
  if (offsets.length < 2) return null;

  const deltas = [];
  for (let i = 0; i < offsets.length - 1; i++) {
    deltas.push(offsets[i + 1] - offsets[i]);
  }

  // 최빈값 찾기
  const counter = {};
  for (const d of deltas) counter[d] = (counter[d] || 0) + 1;
  let bestDelta = null, bestCount = 0;
  for (const [d, c] of Object.entries(counter)) {
    if (c > bestCount) { bestDelta = parseInt(d); bestCount = c; }
  }

  // 일관성 검사
  const consistent = bestCount === deltas.length;
  return { blockSize: bestDelta, consistent, deltas };
}

// ─── 6~8단계: 베이별 메타 추출 ──────────────────────────
function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function extractBayMeta(bytes, bayList, positions, blockSize) {
  const result = [];

  for (const bay of bayList) {
    const off = positions[bay];
    if (off === undefined || off + blockSize > bytes.length) continue;

    // byte 7: 섹션/그룹 ID
    const section = bytes[off + 7];

    // byte 89~92: Cell Type Code (4-byte ASCII 또는 \x00)
    const ccBytes = bytes.slice(off + 89, off + 93);
    let cellCode = '';
    let hasCellCode = false;
    for (const b of ccBytes) {
      if (b === 0) {
        cellCode += '\u0000';
      } else if (b >= 0x20 && b <= 0x7E) {
        cellCode += String.fromCharCode(b);
        hasCellCode = true;
      } else {
        cellCode += '?';
      }
    }
    const cellCodeClean = hasCellCode ? cellCode.replace(/\u0000/g, '') : '';

    // byte 121~124: Hold 메타 (rows/tiers max 추정)
    const holdRowsMax = bytes[off + 121];
    const holdTiersMax = bytes[off + 123];
    const hasHold = holdRowsMax !== 0;

    // byte 153~156: Deck 메타
    const deckRowsMax = bytes[off + 153];
    const deckTiersMax = bytes[off + 155];
    const hasDeck = deckTiersMax !== 0;

    // byte 72~79: 짝꿍 인덱스 (uint16 LE x 4)
    const pair0 = readUint16LE(bytes, off + 72);
    const pair1 = readUint16LE(bytes, off + 74);
    const pair2 = readUint16LE(bytes, off + 76);
    const pair3 = readUint16LE(bytes, off + 78);
    const isStandalone = pair0 === pair1;

    result.push({
      bay,
      section,
      cellCode: cellCodeClean,
      hasHold,
      holdRowsMax,
      holdTiersMax,
      hasDeck,
      deckRowsMax,
      deckTiersMax,
      pairIndices: [pair0, pair1, pair2, pair3],
      isStandalone,
    });
  }

  return result;
}

// ─── 9단계: 트리오/짝꿍 매핑 ────────────────────────────
function buildTrioMap(bayList) {
  const odd = bayList.filter(b => parseInt(b) % 2 === 1);
  const even = bayList.filter(b => parseInt(b) % 2 === 0);

  const trios = [];
  for (const e of even) {
    const n = parseInt(e);
    const a = String(n - 1).padStart(2, '0');
    const b = String(n + 1).padStart(2, '0');
    if (odd.includes(a) && odd.includes(b)) {
      trios.push({ left: a, mid: e, right: b });
    }
  }

  const inTrio = new Set();
  for (const t of trios) {
    inTrio.add(t.left); inTrio.add(t.mid); inTrio.add(t.right);
  }
  const standalone = odd.filter(b => !inTrio.has(b));

  return {
    oddBays: odd,
    evenBays: even,
    trios,
    standalone,
    sectionCount: trios.length + standalone.length,
  };
}

// ─── 메인 분석 함수 (외부 API) ──────────────────────────
/**
 * CASP .def 파일 분석
 * @param {Uint8Array | ArrayBuffer} buffer - 파일 바이너리 데이터
 * @returns {object} 분석 결과 (구조 / 헤더 / 베이 메타 / 통계)
 * @throws CASP 매직이 없거나 블록 크기가 비정상이면 throw
 */
export function analyzeDefFile(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

  if (!isCaspDefFile(bytes)) {
    throw new Error('CASP SHIP DEFINE FILE 매직 시그니처 불일치 — .def 파일이 아닙니다');
  }

  const header = parseHeader(bytes);
  const positions = findBayMarkers(bytes);
  const bayList = Object.keys(positions).sort();

  if (bayList.length < 2) {
    throw new Error(`베이 마커가 ${bayList.length}개 — 최소 2개 필요`);
  }

  const blockInfo = detectBlockSize(positions);
  if (!blockInfo || !blockInfo.blockSize) {
    throw new Error('베이 블록 크기 산출 실패');
  }

  // 일관성 경고
  let warning = null;
  if (!blockInfo.consistent) {
    warning = `블록 크기 불일치 — 최빈값 ${blockInfo.blockSize} 채택 (deltas: ${blockInfo.deltas.join(',')})`;
  }

  const bays = extractBayMeta(bytes, bayList, positions, blockInfo.blockSize);
  const structure = buildTrioMap(bayList);

  // Cell Code 분포
  const cellCodeCounts = {};
  for (const b of bays) {
    const k = b.cellCode || '(없음)';
    cellCodeCounts[k] = (cellCodeCounts[k] || 0) + 1;
  }

  return {
    fileSize: bytes.length,
    header,
    bayCount: bayList.length,
    bayList,
    blockSize: blockInfo.blockSize,
    blockConsistent: blockInfo.consistent,
    warning,
    bays,
    structure,
    cellCodeDistribution: cellCodeCounts,
    parsedAt: new Date().toISOString(),
    parserVersion: 'M4.4',
  };
}

// ─── 결과 → 베이사전 형식 변환 (shipBayDict.js 호환) ──
/**
 * .def 분석 결과를 SHIP_BAY_DICT 형식으로 변환
 * @param {object} analysis - analyzeDefFile() 결과
 * @param {string} fileName - 원본 파일명 (예: "TNJP.def")
 * @returns {object} userBayDict 항목 형식
 */
export function analysisToBayDictEntry(analysis, fileName) {
  const code = (fileName || '').replace(/\.def$/i, '').toUpperCase().slice(0, 8);
  const { header, bays, structure, bayCount, blockSize } = analysis;

  // SHIP_BAY_DICT 호환 형식의 bays 배열 생성
  const bayRecords = bays.map((b, i) => ({
    idx: i + 1,
    bayNo: b.bay,
    section: b.section,
    cellCode: b.cellCode,
    hasHold: b.hasHold,
    hasDeck: b.hasDeck,
    holdMeta: { rowsMax: b.holdRowsMax, tiersMax: b.holdTiersMax },
    deckMeta: { rowsMax: b.deckRowsMax, tiersMax: b.deckTiersMax },
    isStandalone: b.isStandalone,
  }));

  return {
    imo: '',  // .def에는 IMO 직접 없음 (TDT 세그먼트는 BAPLIE에)
    code,
    name: header.vesselName,
    callsign: header.identifier,
    specs: {},
    bayDef: {
      sourceFile: fileName,
      sourceVersion: header.version,
      sourceCreatedDate: header.created,
      parsedAt: analysis.parsedAt,
      parserVersion: 'M4.4',
      recordCount: bayCount,
      blockSize,
      bayList: analysis.bayList,
      bays: bayRecords,
      structure: {
        oddCount: structure.oddBays.length,
        evenCount: structure.evenBays.length,
        trioCount: structure.trios.length,
        standaloneCount: structure.standalone.length,
        sectionCount: structure.sectionCount,
        trios: structure.trios,
        standalone: structure.standalone,
      },
      cellCodeDistribution: analysis.cellCodeDistribution,
      verified: true,  // M4.4 검증된 방법론 사용
      methodology: 'CASP_DEF_ANALYSIS_GUIDE_M4_4',
    },
  };
}
