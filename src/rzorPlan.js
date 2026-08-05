// V9.22: RZOR(RIZHAO ORIENT) 덱 스토우지 플랜 파서 — 선사 rzdf_ship_*.xls
//   시트: A/B/C/D/E-DECK-PTK. 컨테이너 = 병합 블록(여러 줄: 컨번호/무게/규격 "40 HC F"/긴급·활어).
//   실측 검증(R080E): D 75(20×4/40×68/45×3) · C 71 · B 14 = PDF SUB TOTAL과 완전 일치.
//   좌표: colStops/rowBands 정규화 — 화면 CSS grid와 인쇄가 같은 데이터를 쓴다.

/** SheetJS 워크북이 RZOR 덱 플랜인지 */
export function isDeckPlanWorkbook(wb) {
  return (wb?.SheetNames || []).some((n) => /-?DECK/i.test(String(n)));
}

// V9.54(2026-08-03): 덱플랜을 **좌표로** 읽는다 — 도면 실측(R082E 2甲/3甲/4甲.PDF)으로 축 확정.
//   · 도면 오른쪽 = 선수(양 모서리 사선) · 왼쪽 = 선미(B덱 도면에 RAMP)
//   · D덱 도면 오른쪽에 줄 번호 1~8 이 인쇄돼 있다(위=1, 아래=8)
//   · 선수가 오른쪽 → 위쪽이 좌현. 이 배는 항상 좌현 접안이라 **줄 1이 부두 쪽**.
//   → line = 좌현1→우현N · col = 선미1→선수N · 덱 = 티어. 표기는 "D덱 3줄 5칸".
//   수집기 collector/deckplan.py 와 **같은 규칙**이어야 한다(두 벌이 어긋나면 화면과 DB가 갈린다).
const DECK_TIER = { A: '82', B: '84', C: '86', D: '88', E: '90' };

// V9.55(2026-08-03): 셀 색이 **작업 방식**을 말한다 — 선사 메일 제목이 범례다.
//   "黄色为双背（2），绿色为落地（40）" = 노랑 双背(2단 적재) · 초록 落地(갑판 직접 적재).
//   落地 = 섀시에서 내려 갑판에 얹는 것 = **갠트리(LO/LO) 작업분**.
//   실측(R082E D덱): 초록 40 = 도면 "( + 40 )" = 선사 연락 "인바운드 갠트리 40van",
//   나머지 62 = 도면 CAPACITY 62(섀시·RO/RO). 40+62 = CONT 102 ✔
//   검수사가 크레인으로 검수하는 건 초록 분이다 — 색을 버리면 그걸 못 가린다.
const FILL_LOLO = 'FF92D050';   // 초록 — 落地 = 갠트리
const FILL_DBL = 'FFFFFF00';    // 노랑 — 双背 = 2단

function fillKind(ws, XLSX, r, c) {
  try {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    const rgb = cell && cell.s && cell.s.fgColor && cell.s.fgColor.rgb;
    if (!rgb) return '';
    const up = String(rgb).toUpperCase();
    if (up === FILL_LOLO || up === FILL_LOLO.slice(2)) return 'lolo';
    if (up === FILL_DBL || up === FILL_DBL.slice(2)) return 'dbl';
  } catch { /* 색을 못 읽으면 표시 없음으로 */ }
  return '';
}

const CN_RE = /([A-Z]{4})\s*(\d{7})/;
const ISO_RE = /(20|40|45)\s*(GP|HC|RH|RF|HA|OT|FR|TK|DC)\s*([FE])?/;

/** SheetJS 워크북 → {voy, decks:[{deck,name,cols,rows,slots:[{cn,wt,iso,fe,ri,ci,span,flags}]}]} */
export function parseDeckPlanWorkbook(wb, XLSX) {
  const decks = [];
  let voy = '';
  for (const name of wb.SheetNames) {
    if (!/-?DECK/i.test(name)) continue;
    const ws = wb.Sheets[name];
    if (!ws || !ws['!merges'] || !ws['!merges'].length) continue;
    const deckLetter = (String(name).match(/([A-E])\s*-?\s*DECK/i) || [])[1]?.toUpperCase() || name;
    const cellText = (r, c) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      return cell && cell.v != null ? String(cell.v) : '';
    };
    // 항차 (헤더 어딘가 R###E 패턴)
    if (!voy) {
      for (let r = 0; r < 10; r++) for (let c = 0; c < 30; c++) {
        const t = cellText(r, c).trim();
        const m = t.match(/^R?\d{3,4}[EWNS]$/i);
        if (m) { voy = t.toUpperCase(); r = 99; break; }
      }
    }
    const rawSlots = [];
    const seen = new Set();
    for (const m of ws['!merges']) {
      const raw = cellText(m.s.r, m.s.c).trim();
      if (!raw) continue;
      const joined = raw.split(/\n/).map((s) => s.trim()).filter(Boolean).join(' ');
      const cnM = joined.replace(/\s+/g, '').match(/([A-Z]{4})(\d{7})/);
      if (!cnM) continue;
      const cn = cnM[1] + cnM[2];
      const key = `${cn}@${m.s.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isoM = joined.match(ISO_RE);
      const wtM = joined.replace(CN_RE, '').match(/\b(\d{4,6})\b/);
      const flags = [];
      if (/긴급/.test(joined)) flags.push('긴급');
      if (/활어/.test(joined)) flags.push('활어');
      if (/LUG/i.test(joined)) flags.push('LUG');
      rawSlots.push({
        cn,
        kind: fillKind(ws, XLSX, m.s.r, m.s.c),   // V9.55: lolo(갠트리) / dbl(2단)
        wt: wtM ? parseInt(wtM[1], 10) : null,
        iso: isoM ? `${isoM[1]} ${isoM[2]}` : '',
        fe: isoM && isoM[3] ? isoM[3] : 'F',
        r1: m.s.r, c1: m.s.c, c2: m.e.c,
        flags,
      });
    }
    if (!rawSlots.length) continue;
    // V9.22-02: 빈자리(선적 지정용) — 데이터 구역 내 글자 없는 병합. 회색 solid 채움은 적재불가 구역으로 제외.
    //   실측(R080E D덱): 빈 101(none/흰색) + 회색 1(불가). 스타일 정보 없으면 빈자리로 간주(안전측).
    const rMin = Math.min(...rawSlots.map((s) => s.r1));
    const rMax = Math.max(...rawSlots.map((s) => s.r1)) + 6;
    for (const m of ws['!merges']) {
      const raw = cellText(m.s.r, m.s.c).trim();
      if (raw) continue;
      if (m.s.r < rMin || m.s.r > rMax) continue;
      if ((m.e.r - m.s.r) < 3) continue;
      const cell = ws[XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c })];
      const rgb = cell && cell.s && cell.s.fgColor && (cell.s.fgColor.rgb || '');
      if (rgb && !/^F{2}?FFFFFF$/i.test(String(rgb)) && String(rgb).toUpperCase() !== 'FFFFFF') continue;   // 회색 등 = 불가
      rawSlots.push({ cn: '', kind: '', wt: null, iso: '', fe: '', r1: m.s.r, c1: m.s.c, c2: m.e.c, flags: [], empty: true });
    }
    // 좌표 정규화: colStops = 모든 블록 경계, rowBands = 블록 시작행들
    const stopSet = new Set();
    rawSlots.forEach((s) => { stopSet.add(s.c1); stopSet.add(s.c2 + 1); });
    const colStops = [...stopSet].sort((a, b) => a - b);
    const bandSet = new Set(rawSlots.map((s) => s.r1));
    const rowBands = [...bandSet].sort((a, b) => a - b);
    // V9.54: 줄·칸 번호 — 블록 시작 좌표 순번(폭은 덱마다 달라 쓸 수 없다)
    const colStarts = [...new Set(rawSlots.map((s) => s.c1))].sort((a, b) => a - b);
    const lineOf = (r1) => rowBands.indexOf(r1) + 1;
    const colOf = (c1) => colStarts.indexOf(c1) + 1;
    const tier = DECK_TIER[String(deckLetter).toUpperCase()] || '';
    const slots = rawSlots.map((s) => {
      const ci = colStops.indexOf(s.c1);
      const span = Math.max(1, colStops.indexOf(s.c2 + 1) - ci);
      // 빈자리는 colStops에 정확한 경계가 없을 수 있음 — 가장 가까운 스톱으로
      const ci2 = ci >= 0 ? ci : Math.max(0, colStops.findIndex((x) => x > s.c1) - 1);
      const end = colStops.indexOf(s.c2 + 1);
      const span2 = end >= 0 ? Math.max(1, end - ci2) : Math.max(1, span);
      const ln = lineOf(s.r1), cl = colOf(s.c1);
      return { cn: s.cn, wt: s.wt, iso: s.iso, fe: s.fe, ri: rowBands.indexOf(s.r1), ci: ci2, span: span2, flags: s.flags, empty: !!s.empty,
               lolo: s.kind === 'lolo', dbl: s.kind === 'dbl',   // V9.55
               // V9.54: 자리 좌표 — 화면 표기는 "D덱 3줄 5칸"
               line: ln, col: cl, tier,
               row: ln ? String(ln).padStart(2, '0') : '',
               bay: cl ? String(cl).padStart(2, '0') : '',
               pos: (ln && cl) ? `${deckLetter}덱 ${ln}줄 ${cl}칸` : '' };
    }).filter((s) => s.ri >= 0 && s.ci >= 0);
    decks.push({ deck: deckLetter, name, cols: colStops.length - 1, rows: rowBands.length, slots,
                 tier, lines: rowBands.length, colsN: colStarts.length,
                 lolo: slots.filter((x) => x.lolo).length, dbl: slots.filter((x) => x.dbl).length });
  }
  // 덱 순서: 위(D)→아래(B) 실물 페이지 순 아님 — 알파벳 역순(D,C,B,A)로 위 데크 먼저
  decks.sort((a, b) => (b.deck < a.deck ? -1 : b.deck > a.deck ? 1 : 0));
  return { voy, decks,
           total: decks.reduce((a, d) => a + d.slots.filter((s) => !s.empty).length, 0),
           lolo: decks.reduce((a, d) => a + (d.lolo || 0), 0),
           dbl: decks.reduce((a, d) => a + (d.dbl || 0), 0) };
}
