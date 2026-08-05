// TallyOne 1.7: 마감 서류 파일명·폴더명 규칙 (선박별)
//
// ⚠ 이 표는 수집기 `collector/tallybox.py` 의 SHIP_RULES·_folder_name 과 **같은 규칙**이다.
//   한쪽만 고치면 앱이 쓴 파일과 수집기가 옮긴 파일의 이름이 갈라진다. 고칠 땐 둘 다 고친다.
//
// 출처: MAILBOX `_마감텔리` 58통(19척) 전수 조사 2026-08-04. 선사가 실제로 보내온 파일명이다.
//   없는 선박은 DEFAULT_RULE(다수파)을 쓴다.

export const DEFAULT_RULE = {
  tally: '{CODE} {E}&{W} PTK TALLY REPORT.xlsx',
  tally_single: '{CODE} {V} PTK TALLY REPORT.xlsx',
  asc: '{CODE} {W} PTK.ASC',
  edi: '{CODE} {W} PTK.EDI',
};

export const SHIP_RULES = {
  OBWH: { full: 'OCEAN BLUE WHALE', tally: '{FULL} {E} & {W} PTK TALLY REPORT.xls' },
  DXQD: { full: 'XIN QUN DAO', tally: '{FULL} - {E} & {W}_PTK-TALLY_REPORT.xls', edi: '{CODE} {W} PTK(2.0).EDI' },
  TMPZ: { full: 'TIAN HAI PING ZE', tally: '{FULL} - {E}&{W}_PTK-TALLY_REPORT.xls.xlsx', edi: '{CODE} {W} PTK(2.0).EDI' },
  ATPR: { edi: '{CODE} {W} PTK(2.0).EDI' },
  STSE: { edi: '{CODE} {W} PTK(2.0).EDI' },
  NSDC: { tally: '{CODE} {E} & {W} PTK TALLY REPORT.xlsx' },   // & 앞뒤 공백
  PCSZ: { edi: '{CODE}{W}PTK.EDI' },
  YKTD: { asc: '{CODE}{W}PTK.ASC', edi: '{CODE}{W}PTK.edi' },
  DJCF: { edi: '{CODE}{W}PTK.EDI' },
  DPRT: { asc: '{CODE}{W}PTK.ASC', edi: '{CODE}{W}PTK.EDI' },
  STMJ: { edi: '{CODE}{W}PTK.EDI' },
  SWAT: { asc: '{CODE}{W}PTK.ASC', edi: '{CODE}{W}PTK.edi' },
  XTPG: { asc: '{CODE}{W}PTK.ASC', edi: '{CODE}{W}PTK.EDI' },
};

// 항차 = 숫자부 + 방향 접미사(E 동항 / W 서항 / N 북항 / S 남항)
const RE_VOYDIR = /^(.*?)([EWNS])$/i;

/**
 * 항차 폴더 이름. 검수사 확정 2026-08-04 (직접 만든 `TNJP\26355E_W` 를 정본으로 삼음).
 *
 *   양하만              → `2643E`
 *   선적만              → `2634W`
 *   숫자 같고 방향만 다름 → `26355E_W`      TNJP · DXQD 2630E_W · XTPG 535E_W · RZOR R083E_W
 *   숫자가 다름          → `2643E_2644W`   STMJ · OBWH 2705E_2706W · DJCF 0149N_0150S
 *   완전히 같음          → `2608N_2608N`   SWDN · SWRG — 줄이면 한쪽만 있는 항차와 구분이 사라진다
 *
 * 왜 축약하나 — 선사가 보낸 실제 서류 제목이 이미 그렇다:
 *   `TNJP 26353E&W PTK TALLY REPORT`, `RIZHAO ORIENT R079E&W PTK TALLY REPORT`
 */
export function folderName(e, w) {
  e = String(e || '').toUpperCase();
  w = String(w || '').toUpperCase();
  if (!(e && w)) return e || w || '_미상';
  if (e === w) return `${e}_${w}`;
  const me = RE_VOYDIR.exec(e);
  const mw = RE_VOYDIR.exec(w);
  if (me && mw && me[1] === mw[1]) return `${e}_${mw[2]}`;
  return `${e}_${w}`;
}

function render(tpl, code, full, e, w, v) {
  return tpl.replace(/\{CODE\}/g, code)
    .replace(/\{FULL\}/g, full || code)
    .replace(/\{E\}/g, e || v || '')
    .replace(/\{W\}/g, w || v || '')
    .replace(/\{V\}/g, v || w || e || '');
}

/**
 * 마감 서류 파일명.
 * @param kind 'tally' | 'edi' | 'asc'
 * @param srcExt 실제로 만든 파일의 확장자(예 '.xlsx'). 주면 규칙표 확장자보다 우선한다 —
 *   규칙표의 `.xls` 는 선사가 보내온 옛 파일의 것이라, 앱이 만든 xlsx 를 .xls 로 이름 붙이면
 *   엑셀이 "형식이 다릅니다" 경고를 낸다(수집기 1.0-06 에서 같은 이유로 고쳤다).
 */
export function fileNameFor(kind, code, voyD, voyL, srcExt) {
  code = String(code || '').toUpperCase();
  const e = String(voyD || '').toUpperCase();
  const w = String(voyL || '').toUpperCase();
  const rule = { ...DEFAULT_RULE, ...(SHIP_RULES[code] || {}) };
  const full = rule.full || code;
  const tpl = kind === 'tally'
    ? ((e && w) ? rule.tally : (rule.tally_single || rule.tally))
    : rule[kind];
  if (!tpl) throw new Error(`파일명 규칙 없음: ${kind}`);
  let name = render(tpl, code, full, e, w, (w || e));
  if (srcExt) {
    const i = name.lastIndexOf('.');
    const cur = i >= 0 ? name.slice(i) : '';
    if (cur.toLowerCase() !== String(srcExt).toLowerCase()) {
      name = (i >= 0 ? name.slice(0, i) : name) + srcExt;
    }
  }
  return name;
}
