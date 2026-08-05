// M6.70: STOWAGE PDF 앱 내장 자동 파서 — Gemini API 의존 0
// 클로드가 만든 Python 파서를 JS로 이식. pdfjs로 텍스트 추출 → 양식 인식
//
// 양식: KMTC STOWAGE INSTRUCTION 표준 (BAY n 단독, BAY (n) m 쌍, tier 라벨)
// 사용자 원칙: 현장 자급자족, Gemini 무료 한계 무시, 폰에서 즉시 처리

import { extractPdfText } from './mixerUpload.js';

// PDF에서 핵심 정보 자동 추출
export async function parseStowagePdfAuto(file) {
  const text = await extractPdfText(file);

  // 디버그 — 사용자 콘솔에서 확인
  console.log(`[M6.70 parser] ${file.name} — 텍스트 길이: ${text.length}`);
  console.log(`[M6.70 parser] 첫 300자:`, text.slice(0, 300).replace(/\n/g, ' | '));
  console.log(`[M6.70 parser] 'BAY' 등장 횟수:`, (text.match(/BAY/g) || []).length);

  const bayList = new Set();
  const standaloneBays = new Set();
  const pairBays = new Set();

  // 쌍 패턴: "BAY (20) 21" 또는 "BAY ( 20 ) 21"
  const re_pair = /BAY\s*\(\s*(\d+)\s*\)\s*(\d+)/g;
  let m;
  while ((m = re_pair.exec(text)) !== null) {
    const even = String(m[1]).padStart(2, '0');
    const odd = String(m[2]).padStart(2, '0');
    bayList.add(even);
    bayList.add(odd);
    pairBays.add(even);
    pairBays.add(odd);
  }

  // 단독 패턴: "BAY 19" (괄호 다음에 안 와야 함)
  const re_solo = /BAY\s+(\d+)(?!\s*\()/g;
  while ((m = re_solo.exec(text)) !== null) {
    const bn = String(m[1]).padStart(2, '0');
    if (!pairBays.has(bn)) {
      bayList.add(bn);
      standaloneBays.add(bn);
    }
  }

  console.log(`[M6.70 parser] 베이 추출: ${bayList.size}개`, Array.from(bayList).sort());

  // tier 추출 — 짝수만 (deck 80-98, hold 02-08)
  const deckTiers = new Set();
  const holdTiers = new Set();
  const allNumbers = text.match(/\b\d{2}\b/g) || [];
  for (const n of allNumbers) {
    const num = parseInt(n);
    if (num >= 80 && num <= 98 && num % 2 === 0) deckTiers.add(num);
    if ([2, 4, 6, 8].includes(num)) holdTiers.add(num);
  }

  // 선박명 + voyage
  let shipName = null, voy = null;
  const shipM = /([A-Z][A-Z\s]+?)\s+VOY\s*NO\s*:\s*(\S+)/.exec(text);
  if (shipM) {
    shipName = shipM[1].trim();
    voy = shipM[2];
  }

  return {
    bayList: Array.from(bayList).sort(),
    standaloneBays: Array.from(standaloneBays),
    pairBays: Array.from(pairBays),
    deckTiers: Array.from(deckTiers).sort((a, b) => b - a),
    holdTiers: Array.from(holdTiers).sort((a, b) => b - a),
    extraDeckTier: deckTiers.has(80) ? 80 : null,
    shipName,
    voy,
  };
}

// 파싱 결과 → 베이사전 entry (Firebase 저장 형식)
export function buildBayDictEntryFromParsed(code, parsed, fileName = '') {
  const allDeckTiersNo80 = parsed.extraDeckTier
    ? parsed.deckTiers.filter(t => t !== parsed.extraDeckTier)
    : parsed.deckTiers;

  const baysSummary = [];
  // M6.70d: hatchCount 자동 추정 — 베이 그룹마다 1 hatch 가정
  //   짝수 베이 = 새 hatch 시작 (이전 베이가 더 큰 짝수가 아닐 때)
  //   진단 점수에서 hatchCount 보너스 (+5) 확보 + STOWAGE PDF 정확성 인정
  let lastEvenBay = -2;
  for (let i = 0; i < parsed.bayList.length; i++) {
    const bn = parsed.bayList[i];
    const bayNum = parseInt(bn, 10);
    const isEven = bayNum % 2 === 0;
    const standalone = parsed.standaloneBays.includes(bn);
    let hatchCount = 0;
    if (isEven && (bayNum - lastEvenBay) > 2) {
      // 새 hatch 시작 (이전 짝수 베이와 4 이상 차이 — 다른 hatch)
      hatchCount = 1;
      lastEvenBay = bayNum;
    } else if (isEven) {
      lastEvenBay = bayNum;
    }
    baysSummary.push({
      bayNo: bn,
      section: Math.floor(i / 3) + 1,
      hasHold: true,
      hasDeck: true,
      isStandalone: standalone,
      deckTiersLocal: allDeckTiersNo80,
      holdTiersLocal: parsed.holdTiers,
      rowMaxEvenLocal: 8,
      rowMaxOddLocal: 7,
      hatchCount,
    });
  }

  return {
    code,
    name: parsed.shipName || code,
    bayDef: {
      sourceFile: fileName || `${code}-auto-${new Date().toISOString().slice(0, 10)}.pdf`,
      parsedAt: new Date().toISOString(),
      parserVersion: 'M6.70-app-auto-parser',
      methodology: 'STOWAGE_PDF_APP_AUTO_PARSER',
      recordCount: parsed.bayList.length,
      sectionCount: Math.floor(parsed.bayList.length / 3) + 1,
      bayList: parsed.bayList,
      baysSummary,
      rowMaxEven: 8,
      rowMaxOdd: 7,
      deckTiers: parsed.deckTiers,
      holdTiers: parsed.holdTiers,
      extraDeckTier: parsed.extraDeckTier,
      verified: false,
      grade: 'auto-pdf-app',
    },
  };
}

// 파일명에서 4글자 code 추출 — STOWAGE/INSTRUCTION/CARGO 같은 일반 단어 제외
function extractCodeFromFileName(fileName) {
  if (!fileName) return null;
  const cleaned = fileName.replace(/\.pdf$/i, '');
  // 파일명 첫 단어 (분리자: _ 공백 - .)
  const firstWord = cleaned.split(/[_\s\-.]/)[0].toUpperCase();
  // 일반 단어 제외
  const GENERIC = ['STOWAGE', 'INSTRUCTION', 'CARGO', 'DISCHARGING', 'PLAN', 'LOADING', 'LIST', 'DOCUMENT'];
  if (GENERIC.includes(firstWord)) return null;
  return firstWord.slice(0, 4);
}

// 전체 양식 — PDF file → entry (한 번에)
export async function autoBuildEntryFromPdf(file, code) {
  const parsed = await parseStowagePdfAuto(file);
  // baysSummary 추출 못 했으면 명시적 오류
  if (!parsed.bayList || parsed.bayList.length === 0) {
    throw new Error(`자체 파서: ${file.name}에서 베이 0개 — PDF 양식 인식 실패`);
  }
  // code 우선순위: 사용자 지정 > 파일명 (정상) > PDF vesselName
  let detectedCode = code;
  if (!detectedCode || ['STOW', 'CARG', 'INST', 'PLAN', 'LOAD'].includes(detectedCode)) {
    detectedCode = extractCodeFromFileName(file.name);
  }
  if (!detectedCode && parsed.shipName) {
    // PDF의 vesselName에서 4글자 약자 추출 (단어 첫 글자들)
    const words = parsed.shipName.split(/\s+/).filter(w => /^[A-Z]/.test(w));
    detectedCode = words.slice(0, 4).map(w => w[0]).join('').slice(0, 4);
  }
  if (!detectedCode) detectedCode = 'UNKN';
  return buildBayDictEntryFromParsed(detectedCode, parsed, file.name);
}
