// CASP .def 단면(베이별 행·tier) 디코더 — V7.36 신규. 파이썬 검증판(DJCT·KSKM·NBTD PDF 대조 PASS) 포팅.
// 6.00/6.10/6.30: 베이테이블 ~60500(144B) + 단면 레코드 ~89089(120B, [홀드행][tier][데크행], 포트측 wrap)
// 6.50/6.60:      베이테이블 ~135900(188~189B) + 단면 레코드 234B 창(공백 구분 ASCII)

// ─── 공통 유틸 ───────────────────────────────────────
function toLatin1(bytes) {
  // Uint8Array → latin1 문자열 (바이트 보존, 정규식용)
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return s;
}

export function detectDefFormat(bytes) {
  const head = toLatin1(bytes.subarray(0, 48));
  for (const v of ['6.50', '6.60', '6.10', '6.30', '6.00']) {
    if (head.includes('\r\n' + v)) return v;
  }
  return '?';
}

function labels2(s) {
  if (s.length % 2 !== 0) return null;
  const out = [];
  for (let i = 0; i < s.length; i += 2) out.push(s.slice(i, i + 2));
  return out;
}

function isRows(ls) {
  if (!ls || !ls.length) return false;
  const v = ls.map(Number);
  if (v.some(isNaN)) return false;
  const ev = v.filter(x => x % 2 === 0);
  const od = v.filter(x => x % 2 === 1);
  if (JSON.stringify(v) !== JSON.stringify([...ev, ...od])) return false;
  for (let i = 1; i < ev.length; i++) if (ev[i] >= ev[i - 1]) return false;
  for (let i = 1; i < od.length; i++) if (od[i] <= od[i - 1]) return false;
  if (new Set(v).size !== v.length) return false;
  return v.every(x => x <= 30);
}

function splitTiers(ls) {
  if (!ls || !ls.length) return null;
  const v = ls.map(Number);
  if (v.some(isNaN)) return null;
  let k = 0;
  while (k < v.length && v[k] < 80) k++;
  const hold = v.slice(0, k), deck = v.slice(k);
  if (!deck.length) return null;
  const asc = a => a.every((x, i) => i === 0 || x > a[i - 1]);
  if (!asc(hold) || !asc(deck)) return null;
  if (hold.some(x => x < 2 || x > 20) || deck.some(x => x < 80 || x > 98)) return null;
  if ([...hold, ...deck].some(x => x % 2 !== 0)) return null;
  return [hold, deck];
}

// ─── 6.00/6.10/6.30 ─────────────────────────────────
function findBayTable610(txt) {
  // 60200~70000 베이번호 히트 → 잡음 무시 그리디 체인(간격 140~150)
  const re = /(\d{2})( {3,}|\x00)/g;
  const seg = txt.slice(60200, 70000);
  const hits = [];
  let m;
  while ((m = re.exec(seg)) !== null) hits.push([m.index + 60200, m[1]]);
  const pos = new Map(hits);
  let best = [];
  for (const [o0, b0] of hits) {
    const cur = [[o0, b0]];
    let o = o0;
    for (;;) {
      let nxt = null;
      for (let d = 140; d <= 150; d++) if (pos.has(o + d)) { nxt = o + d; break; }
      if (nxt === null) break;
      cur.push([nxt, pos.get(nxt)]);
      o = nxt;
    }
    if (cur.length > best.length) best = cur;
  }
  if (best.length >= 3) return [best[0][0], best.map(h => h[1])];
  return [null, []];
}

function globalRuns(txt, lo, hi) {
  const out = [];
  const re = /\d+/g;
  const seg = txt.slice(lo, hi);
  let m;
  while ((m = re.exec(seg)) !== null) out.push([m.index + lo, m[0]]);
  return out;
}

function trySplitMerged(ls) {
  // 병합 run → [rows]+[tiers] 또는 [rows]+[tiers]+[rows]
  const n = ls.length;
  const results = [];
  for (let k = 2; k < n; k++) {
    const a = ls.slice(0, k), b = ls.slice(k);
    if (isRows(a) && splitTiers(b)) results.push([a, b, null]);
  }
  for (let k1 = 2; k1 < n - 2; k1++) {
    if (!isRows(ls.slice(0, k1))) continue;
    for (let k2 = k1 + 1; k2 < n; k2++) {
      const t = ls.slice(k1, k2), c = ls.slice(k2);
      if (splitTiers(t) && isRows(c)) results.push([ls.slice(0, k1), t, c]);
    }
  }
  if (!results.length) return null;
  results.sort((r1, r2) => {
    const bal1 = (r1[2] !== null && r1[0].length === r1[2].length) ? 0 : 1;
    const bal2 = (r2[2] !== null && r2[0].length === r2[2].length) ? 0 : 1;
    if (bal1 !== bal2) return bal1 - bal2;
    return r2[0].length - r1[0].length;
  });
  return results[0];
}

function parseOneRecord610(fieldsRaw) {
  let fields = [];
  for (const [, s] of fieldsRaw) {
    const ls = labels2(s);
    if (ls === null) return null;
    fields.push(ls);
  }
  const expanded = [];
  for (const ls of fields) {
    if (isRows(ls) || splitTiers(ls)) expanded.push(ls);
    else {
      const sp = trySplitMerged(ls);
      if (sp === null) return null;
      expanded.push(sp[0], sp[1]);
      if (sp[2] !== null) expanded.push(sp[2]);
    }
  }
  fields = expanded;
  if (fields.length < 2 || fields.length > 3) return null;
  let tierI = null;
  for (let i = 0; i < fields.length; i++) {
    if (splitTiers(fields[i]) && !isRows(fields[i])) {
      if (tierI !== null) return null;
      tierI = i;
    }
  }
  if (tierI === null) {
    for (let i = 0; i < fields.length; i++) if (splitTiers(fields[i])) tierI = i;
  }
  if (tierI === null) return null;
  const rows = fields.filter((_, i) => i !== tierI);
  if (!rows.every(isRows)) return null;
  const [ht, dt] = splitTiers(fields[tierI]);
  const [holdRows, deckRows] = rows.length === 2 ? rows : [[], rows[0]];
  return { holdRows, holdTiers: ht, deckTiers: dt, deckRows };
}

function tryParse610(txt, base, count) {
  const hi = base + count * 120;
  const runs = globalRuns(txt, Math.max(0, base - 20), hi + 140);
  const per = Array.from({ length: count }, () => []);
  for (const [o, s] of runs) {
    const end = o + s.length;
    if (end <= base) continue;
    if (end > hi) {
      if (o < hi) per[count - 1].push([o, s]); // 마지막 레코드 꼬리 오버플로
      continue;
    }
    const idx = Math.floor((end - 1 - base) / 120);
    if (idx >= 0 && idx < count) per[idx].push([o, s]);
  }
  return per.map(f => (f.length ? parseOneRecord610(f) : null));
}

function findSectionBase610(txt, nBays) {
  const runs = globalRuns(txt, 87000, 95000);
  for (const [o, s] of runs) {
    const ls = labels2(s);
    if (ls && isRows(ls)) {
      for (let base = o - 14; base <= o + 2; base++) {
        const got = tryParse610(txt, base, Math.min(3, nBays));
        if (got && got.every(g => g && g.deckRows.length && g.deckTiers.length)) return base;
      }
    }
  }
  return null;
}

function parseDef610(txt, bytes) {
  const [bt, bays] = findBayTable610(txt);
  if (!bays.length) return { error: '베이테이블 미발견' };
  const sec = findSectionBase610(txt, bays.length);
  if (sec === null) return { error: '단면 영역 미발견' };
  const recs = tryParse610(txt, sec, bays.length);
  const parsedN = recs.filter(Boolean).length;
  if (parsedN < Math.max(1, Math.floor(bays.length * 0.8))) {
    return { error: `단면 파싱 부족(${parsedN}/${bays.length})` };
  }
  const out = {}, unparsed = [];
  for (let i = 0; i < bays.length; i++) {
    const r = recs[i];
    if (!r) { unparsed.push(bays[i]); continue; }
    const noHold = bytes[bt + i * 144 + 121] === 0;
    out[bays[i]] = {
      deckRows: r.deckRows,
      deckTiers: [...r.deckTiers].sort((a, b) => b - a),
      holdRows: noHold ? [] : r.holdRows,
      holdTiers: noHold ? [] : [...r.holdTiers].sort((a, b) => b - a),
      rowCount: r.deckRows.length,
      hasZero: r.deckRows.includes('00'),
    };
  }
  return { bays: out, order: bays, unparsedBays: unparsed, warnings: [] };
}

// ─── 6.50/6.60 ──────────────────────────────────────
function findBayTable650(txt) {
  const re = /[\x00 ](\d{2}) {3,6}/g;
  const seg = txt.slice(125000, 165000);
  const hits = [];
  let m;
  while ((m = re.exec(seg)) !== null) {
    hits.push([m.index + 125000, m[1]]);
    re.lastIndex = m.index + 1; // 겹침 허용
  }
  let best = [], cur = [];
  for (const h of hits) {
    if (cur.length && h[0] - cur[cur.length - 1][0] >= 180 && h[0] - cur[cur.length - 1][0] <= 200) cur.push(h);
    else {
      if (cur.length > best.length) best = cur;
      cur = [h];
    }
  }
  if (cur.length > best.length) best = cur;
  if (best.length >= 3) return [best[0][0], best.map(h => h[1])];
  return [null, []];
}

function looksSectionish(t) {
  const toks = [];
  for (const d of (t.match(/\d+/g) || [])) {
    if (d.length % 2) return false;
    for (let j = 0; j < d.length; j += 2) toks.push(d.slice(j, j + 2));
  }
  if (!toks.length) return false;
  if (toks.some(x => ['82', '84', '86', '88', '90', '92', '94', '96', '98'].includes(x))) return true;
  return isRows(toks.slice(0, Math.min(toks.length, 6)));
}

function splitRecord650(ls) {
  const n = ls.length;
  const sols = [];
  for (let k = 1; k < n; k++) {
    const t = splitTiers(ls.slice(0, k));
    if (t && isRows(ls.slice(k))) sols.push([[], t, ls.slice(k)]);
  }
  for (let k1 = 1; k1 < n - 1; k1++) {
    if (!isRows(ls.slice(0, k1))) continue;
    for (let k2 = k1 + 1; k2 < n; k2++) {
      const t = splitTiers(ls.slice(k1, k2));
      if (t && isRows(ls.slice(k2))) sols.push([ls.slice(0, k1), t, ls.slice(k2)]);
    }
  }
  if (!sols.length) return null;
  sols.sort((a, b) => {
    const e1 = a[0].length ? 0 : 1, e2 = b[0].length ? 0 : 1;
    if (e1 !== e2) return e1 - e2;
    const d1 = Math.abs((a[0].length || a[2].length) - a[2].length);
    const d2 = Math.abs((b[0].length || b[2].length) - b[2].length);
    if (d1 !== d2) return d1 - d2;
    return (b[1][0].length + b[1][1].length) - (a[1][0].length + a[1][1].length);
  });
  return sols[0];
}

const _splitCache = new Map();
function splitRecord650Tolerant(stream) {
  const key = stream.join(',');
  if (_splitCache.has(key)) return _splitCache.get(key);
  let sp = splitRecord650(stream);
  if (sp) { const r = [sp, []]; _splitCache.set(key, r); return r; }
  // 의심 라벨(이웃 단조성 위반) 1~2개 제거 재시도
  const n = stream.length;
  const v = stream.map(Number);
  const susp = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? v[i - 1] : null, nxt = i < n - 1 ? v[i + 1] : null;
    const odd = v[i] % 2 === 1;
    const brk = prev !== null && nxt !== null &&
      ((prev < nxt && !(prev < v[i] && v[i] < nxt)) || (prev > nxt && !(prev > v[i] && v[i] > nxt)));
    if (isNaN(v[i]) || (odd && prev !== null && prev % 2 === 0 && nxt !== null && nxt % 2 === 0) || brk) susp.push(i);
  }
  const cand = susp.slice(0, 6);
  const combos = [];
  for (const i of cand) combos.push([i]);
  for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) combos.push([cand[a], cand[b]]);
  for (const idx of combos) {
    const ss = stream.filter((_, i) => !idx.includes(i));
    sp = splitRecord650(ss);
    if (sp) {
      const r = [sp, idx.map(i => stream[i])];
      _splitCache.set(key, r); return r;
    }
  }
  const r = [null, null];
  _splitCache.set(key, r); return r;
}

function parseDef650(txt) {
  const [bt, bays] = findBayTable650(txt);
  if (!bays.length) return { error: '베이테이블 미발견(6.50)' };
  const n = bays.length;
  const re = /\d{2}(?: \d{2}){2,}/g;
  const seg = txt.slice(bt, bt + 400000);
  const cand = [];
  let m;
  while ((m = re.exec(seg)) !== null) {
    if (looksSectionish(m[0])) cand.push([m.index + bt, m[0]]);
  }
  if (!cand.length) return { error: '단면 영역 미발견(6.50)' };

  const tryBase = (base, quick) => {
    const out = {}, warn = [];
    let parsed = 0;
    const limit = quick ? Math.min(n, 3) : n;
    for (let i = 0; i < limit; i++) {
      const lo = base + i * 234, hi = lo + 234;
      if (hi > txt.length) return null;
      const segr = txt.slice(lo, hi);
      const stream = [];
      let bad = false;
      for (const d of (segr.match(/\d+/g) || [])) {
        if (d.length % 2) { bad = true; break; }
        for (let j = 0; j < d.length; j += 2) stream.push(d.slice(j, j + 2));
      }
      if (bad || !stream.length) { out[bays[i]] = null; continue; }
      const [sp, dropped] = splitRecord650Tolerant(stream);
      if (!sp) { out[bays[i]] = null; continue; }
      const [holdRows, [holdT, deckT], deckRows] = sp;
      if (dropped && dropped.length) warn.push(`bay${bays[i]} 잡음 ${dropped.join(',')} 제거`);
      const noHold = !holdT.length;
      out[bays[i]] = {
        deckRows,
        deckTiers: [...deckT].sort((a, b) => b - a),
        holdRows: noHold ? [] : holdRows,
        holdTiers: noHold ? [] : [...holdT].sort((a, b) => b - a),
        rowCount: deckRows.length,
        hasZero: deckRows.includes('00'),
      };
      parsed++;
    }
    return [out, warn, parsed];
  };

  const tried = new Set();
  let best = null;
  for (const [s, t] of cand.slice(0, 80)) {
    const digitStart = s + (t.length - t.trimStart().length);
    for (let base = digitStart - 234; base <= digitStart; base++) {
      if (tried.has(base)) continue;
      tried.add(base);
      const q = tryBase(base, true);
      if (!q || q[2] < Math.min(n, 3)) continue;
      const full = tryBase(base, false);
      if (full && full[2] >= Math.max(1, Math.floor(n * 0.8))) {
        if (!best || full[2] > best[3]) best = [base, full[0], full[1], full[2]];
        if (full[2] === n) break;
      }
    }
    if (best && best[3] === n) break;
  }
  if (!best) return { error: '단면 레코드 정렬 실패' };
  const [, outRaw, warn] = best;
  const unparsed = bays.filter(b => !outRaw[b]);
  const out = {};
  for (const b of bays) if (outRaw[b]) out[b] = outRaw[b];
  return { bays: out, order: bays, unparsedBays: unparsed, warnings: warn };
}

// ─── 진입점 ─────────────────────────────────────────
/**
 * .def 바이트 → 베이별 단면 구조
 * @param {Uint8Array} bytes
 * @returns {{format, vesselCode, vesselName, callsign, bays:{[bay]:{deckRows,deckTiers,holdRows,holdTiers,rowCount,hasZero}}, order, unparsedBays, warnings} | {error, format}}
 */
export function parseDefSections(bytes) {
  _splitCache.clear();
  const txt = toLatin1(bytes);
  const format = detectDefFormat(bytes);
  let res;
  if (format === '6.50' || format === '6.60') {
    res = parseDef650(txt);
  } else if (format === '6.00' || format === '6.10' || format === '6.30') {
    res = parseDef610(txt, bytes);
  } else {
    res = parseDef610(txt, bytes);
    if (res.error) res = parseDef650(txt);
  }
  res.format = format;
  // 선박 헤더 (코드 50~54, 이름 54~84, 콜사인 84~93 — 6.50 계열에서 검증된 위치)
  // ⚠️ 콜사인은 6.10/6.30에서 위치가 달라 오염값이 나옴 → 잘못된 콜사인 자동 주입은
  //    PORT-MIS 오매칭 위험(지침 7.5)이므로 6.50/6.60에서만 채운다.
  const clean = s => s.replace(/[\x00]/g, ' ').split(/\s{2,}/)[0].trim();
  res.vesselCode = clean(txt.slice(50, 54));
  res.vesselName = clean(txt.slice(54, 84));
  res.callsign = (format === '6.50' || format === '6.60') ? clean(txt.slice(84, 93)) : '';
  return res;
}
