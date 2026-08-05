// src/pdfBayParser.js
// PDF STOWAGE INSTRUCTION → 베이 매트릭스 추출 (pdf.js 기반) — M6.93.1
// 
// Python v3 프로토타입 포팅. PDF 자동 추출 한계:
//   - 베이 발견/페어 100%
//   - rowCount/hasZero 70-95%
//   - cells 마크 카운트만 가능 (빈 셀 PDF에 없음)
// → 사용자 검증 폼에서 보강 필수.

import * as pdfjsLib from 'pdfjs-dist/build/pdf';
// worker는 빌드 시 vite로 처리 (필요시 별도 설정)
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  // V7.94-13: Vite new URL 자산 처리가 해시를 중첩시켜 404 (pdf.worker.min-HASH-HASH.mjs)
  //   → public 정적 파일로 고정 (빌드 시 dist 루트로 복사됨)
  (import.meta.env?.BASE_URL || '/') + 'pdf.worker.min.mjs';

const RE_BAY_TAIL = /^(?:\((\d+)\)\s+)?(\d+)\s+(.+)$/;

function parseBayTail(tokens) {
  const s = tokens.join(' ');
  const m = s.match(RE_BAY_TAIL);
  if (!m) return null;
  return { bayNum: m[2], pairEven: m[1] || null };
}

function isTwoDigit(t) { return /^\d{1,2}$/.test(t); }
function isMark(t) { return /^[XPKSBLHo]$/.test(t); }
function isTierLabel(t) { return /^\d{1,3}$/.test(t) && parseInt(t) >= 2; }

function cluster1D(values, tol) {
  if (!values.length) return [];
  const vs = [...new Set(values.map(v => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  const groups = [[vs[0]]];
  for (let i = 1; i < vs.length; i++) {
    const v = vs[i];
    const last = groups[groups.length - 1];
    if (v - last[last.length - 1] <= tol) last.push(v);
    else groups.push([v]);
  }
  return groups.map(g => g.reduce((a, b) => a + b, 0) / g.length);
}

/**
 * PDF 파일 → 단어 + 좌표 배열
 * pdf.js의 좌표는 PDF 기준 (왼아래 원점), 위→아래로 변환
 */
async function extractWords(pdfFile) {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  
  const words = [];
  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue;
    // transform: [a, b, c, d, e, f] - e=x, f=y (PDF: 좌하단 원점)
    const x = item.transform[4];
    // top = pageHeight - y - height (위→아래 변환)
    const top = viewport.height - item.transform[5] - (item.height || 8);
    const text = item.str.trim();
    // 공백 포함된 텍스트 → 분할
    const parts = text.split(/\s+/);
    if (parts.length === 1) {
      words.push({ text, x0: x, x1: x + (item.width || 8), top });
    } else {
      // 단순 추정: 공백 위치마다 분할 (정확한 좌표는 모름)
      const w = (item.width || 8) / text.length;
      let cx = x;
      for (const p of parts) {
        words.push({ text: p, x0: cx, x1: cx + p.length * w, top });
        cx += (p.length + 1) * w;
      }
    }
  }
  return { words, pageWidth: viewport.width, pageHeight: viewport.height };
}

function findAnchors(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.text !== 'BAY' || w.top < 50) continue;
    const tail = [];
    for (let j = i + 1; j < Math.min(i + 8, words.length); j++) {
      const w2 = words[j];
      if (Math.abs(w2.top - w.top) < 3 && (w2.x0 - w.x1) < 100) {
        tail.push(w2.text);
      } else break;
    }
    const p = parseBayTail(tail);
    if (!p) continue;
    out.push({ x: w.x0, y: w.top, bayNum: p.bayNum, pairEven: p.pairEven });
  }
  return out;
}

function computeBoxBounds(anchors, pageWidth, pageHeight) {
  // y 행 그룹 (30px tolerance)
  const sortedY = anchors.map(a => a.y).sort((a, b) => a - b);
  const rowYs = [];
  for (const y of sortedY) {
    if (!rowYs.length || y - rowYs[rowYs.length - 1] > 30) rowYs.push(y);
  }
  // x 열 그룹 (40px tolerance)
  const sortedX = anchors.map(a => a.x).sort((a, b) => a - b);
  const colXs = [];
  for (const x of sortedX) {
    if (!colXs.length || x - colXs[colXs.length - 1] > 40) colXs.push(x);
  }
  const colStep = colXs.length >= 2 ? (colXs[colXs.length - 1] - colXs[0]) / (colXs.length - 1) : pageWidth / 5;
  const rowStep = rowYs.length >= 2 ? (rowYs[rowYs.length - 1] - rowYs[0]) / (rowYs.length - 1) : pageHeight / 4;
  return { colStep, rowStep };
}

function findTierColumn(inbox, bx0, bx1) {
  const nums = inbox.filter(w => isTierLabel(w.text));
  const groups = {};
  for (const w of nums) {
    let matched = null;
    for (const k of Object.keys(groups)) {
      if (Math.abs(w.x0 - parseFloat(k)) < 3) { matched = k; break; }
    }
    const key = matched || w.x0.toFixed(1);
    if (!groups[key]) groups[key] = [];
    groups[key].push(w);
  }
  let best = null;
  let bestCount = 0;
  for (const k of Object.keys(groups)) {
    const ws = groups[k];
    if (ws.length < 4) continue;
    const kx = parseFloat(k);
    if (kx < bx0 + 50 || kx > bx1 - 15) continue;
    const wsSorted = [...ws].sort((a, b) => a.top - b.top);
    const vals = wsSorted.map(w => parseInt(w.text));
    let resets = 0;
    for (let i = 1; i < vals.length; i++) if (vals[i] > vals[i - 1]) resets++;
    if (resets > 1) continue;
    if (ws.length > bestCount) {
      best = kx;
      bestCount = ws.length;
    }
  }
  return { tierColX: best, tierWords: best ? groups[best.toFixed(1)] || Object.values(groups).find(g => Math.abs(g[0].x0 - best) < 1) : [] };
}

function estimateRowCount(inbox, tierColX) {
  const labelWords = inbox.filter(w => 
    isTwoDigit(w.text) && !(tierColX && Math.abs(w.x0 - tierColX) < 5)
  );
  const byY = {};
  for (const w of labelWords) {
    const ykey = Math.round(w.top);
    if (!byY[ykey]) byY[ykey] = [];
    byY[ykey].push(w);
  }
  const labelRows = Object.entries(byY)
    .filter(([_, ws]) => ws.length >= 5)
    .map(([y, ws]) => ({ y: parseInt(y), ws }))
    .sort((a, b) => a.y - b.y);
  if (!labelRows.length) return { rowCount: 0, hasZero: false };
  
  const linesToUse = labelRows.length >= 2 
    ? [labelRows[0].ws, labelRows[labelRows.length - 1].ws]
    : [labelRows[0].ws];
  
  const labelXs = [];
  let hasZero = false;
  for (const ws of linesToUse) {
    for (const w of ws) {
      labelXs.push(w.x0);
      if (w.text === '00') hasZero = true;
    }
  }
  // 마크 위치도 추가 (라벨 누락 보완)
  const markXs = inbox.filter(w => isMark(w.text)).map(w => w.x0);
  let allXs = [...labelXs, ...markXs];
  if (tierColX) allXs = allXs.filter(x => Math.abs(x - tierColX) > 5);
  const clusters = cluster1D(allXs, 4);
  return { rowCount: clusters.length, hasZero };
}

function extractBay(words, anchor, colStep, rowStep) {
  const bx0 = anchor.x - 13;
  const bx1 = bx0 + colStep - 4;
  const by0 = anchor.y + 8;
  const by1 = anchor.y + rowStep - 12;
  const inbox = words.filter(w => w.x0 >= bx0 && w.x0 < bx1 && w.top >= by0 && w.top < by1);
  if (!inbox.length) return null;
  
  const { tierColX, tierWords } = findTierColumn(inbox, bx0, bx1);
  const deckTiers = [];
  const holdTiers = [];
  if (tierWords && tierWords.length) {
    const sorted = [...tierWords].sort((a, b) => a.top - b.top);
    for (const w of sorted) {
      const n = parseInt(w.text);
      if (n >= 82) deckTiers.push(n);
      else if (n <= 12) holdTiers.push(n);
    }
  }
  
  const { rowCount, hasZero } = estimateRowCount(inbox, tierColX);
  
  // cells (tier별 가로 마크 카운트, 0이면 rowCount로 기본값)
  const marks = inbox.filter(w => isMark(w.text));
  const tierYs = {};
  if (tierWords) for (const w of tierWords) tierYs[parseInt(w.text)] = w.top;
  const deckCells = deckTiers.map(t => {
    const ty = tierYs[t];
    const cnt = marks.filter(m => Math.abs(m.top - ty) < 5).length;
    return cnt > 0 ? cnt : rowCount;
  });
  const holdCells = holdTiers.map(t => {
    const ty = tierYs[t];
    const cnt = marks.filter(m => Math.abs(m.top - ty) < 5).length;
    return cnt > 0 ? cnt : rowCount;
  });
  
  return {
    bayNum: anchor.bayNum,
    pairEven: anchor.pairEven,
    rowCount,
    hasZero,
    deckTiers,
    holdTiers,
    deckCells,
    holdCells,
  };
}

/**
 * PDF File → 베이 매트릭스
 * @param {File} pdfFile - 사용자가 업로드한 PDF
 * @returns {Promise<{shipName, voy, bays: [...]}>}
 */
export async function parsePdfStowage(pdfFile) {
  const { words, pageWidth, pageHeight } = await extractWords(pdfFile);
  
  // 헤더 (선박명/항차) — STOWAGE INSTRUCTION 다음 줄
  const header2 = words.filter(w => w.top >= 40 && w.top < 50);
  const header2Text = header2.map(w => w.text).join(' ');
  let shipName = '';
  let voy = '';
  const idxVoy = header2Text.indexOf('VOY');
  if (idxVoy >= 0) {
    shipName = header2Text.substring(0, idxVoy).trim();
    const m = header2Text.match(/NO\s*:\s*(\S+)/);
    if (m) voy = m[1];
  }
  
  const anchors = findAnchors(words);
  const { colStep, rowStep } = computeBoxBounds(anchors, pageWidth, pageHeight);
  
  const bays = [];
  for (const a of anchors) {
    const b = extractBay(words, a, colStep, rowStep);
    if (b) bays.push(b);
  }
  
  return { shipName, voy, bays, _meta: { colStep, rowStep, anchorCount: anchors.length } };
}
