// 엠티 실 보고서 (M3.5.5)
// 사용자 요청 형식:
//   상단: 선박이름 / 항차수 / 선적일자
//   항목: 순번 / 컨번호 / 규격 / E / 엠티실번호 (verify는 +틀린실+리씰)
//
// M4.9b: "엠티 수정 리포트" 별도 추가 - 수정 이력(eseal_history)이 있는 컨테이너만 출력
//        TNJP 같은 verify 선박에서 입력은 단순화하고, 수정 발생 시 별도 보고서로 추적
// V9.57(I14): 죽은 export 정리 — 외부 참조는 generateEmptySealReport 하나뿐(전수 grep 확인).
//   loadSheetJSStyled·buildSealReportSheet는 내부 사용만 남기고 export 제거,
//   generateEmptySealEditReport·EmptySealReportButton(참조 0)은 삭제. React/lucide/loadSheetJS 임포트도 함께 정리.
import { isoToLabel } from '../utils.js';

// V7.42: 셀 스타일(음영·테두리·볼드)을 지원하는 SheetJS 호환 라이브러리 로더.
//   기존 loadSheetJS(xlsx@0.18.5)는 스타일 미지원 → 보고서 출력 전용으로 xlsx-js-style 사용.
//   파서 등 다른 코드는 기존 로더 그대로 (영향 없음).
async function loadSheetJSStyled() {
  if (window.XLSXS) return window.XLSXS;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  window.XLSXS = window.XLSX;  // xlsx-js-style도 window.XLSX로 노출 — 별도 키에 보관
  return window.XLSXS;
}

// 날짜를 안전하게 표기 — 파싱 실패 시 "Invalid Date" 대신 원문 또는 오늘 날짜
function fmtDateSafe(v) {
  if (!v) return new Date().toLocaleDateString('ko-KR');
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('ko-KR');
}

// V7.43: 엠티실 칸 ISO 타입 오염 제거 (사용자 확정 — 선사마다 규격 표기가 달라
//   22GP/45GP 같은 ISO형 표기가 엠티실번호 칸으로 들어오는 케이스).
//   4자 ISO 타입 패턴(첫 자 2/4/L/9 + 영숫자)이면 실번호가 아님 → 제거.
function looksLikeIsoType(v) {
  const s = String(v || '').trim().toUpperCase();
  return /^[24L9][0-9][A-Z][A-Z0-9]$/.test(s);
}
// 규격 표기: 라벨 + (선사 원표기) 병기 — 예: 20DC(22GP). 같으면 라벨만.
function sizeLabelWithRaw(iso) {
  const label = isoToLabel(iso) || iso || '-';
  const raw = String(iso || '').toUpperCase();
  return (raw && raw !== label) ? `${label}(${raw})` : label;
}

// 정렬: 20ft 먼저 → 40ft → 기타, 각 규격 안에서 컨번호순 (사용자 확정)
function sortBySizeThenCn(list) {
  const rank = (c) => {
    const f = String(c.iso || '')[0];
    return f === '2' ? 0 : f === '4' ? 1 : f === 'L' || f === '9' ? 2 : 3;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || String(a.cn || '').localeCompare(String(b.cn || '')));
}

// 공용 스타일 (xlsx-js-style 형식)
const _B = { style: 'thin', color: { rgb: 'FF9CA3AF' } };
const STY = {
  title: { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center', vertical: 'center' } },
  metaK: { font: { bold: true, sz: 10, color: { rgb: 'FF475569' } } },
  metaV: { font: { sz: 10 } },
  head: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFFFF' } },
    fill: { fgColor: { rgb: 'FF334155' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: _B, bottom: _B, left: _B, right: _B } },
  cell: { font: { sz: 10 }, alignment: { horizontal: 'center' },
    border: { top: _B, bottom: _B, left: _B, right: _B } },
  cellL: { font: { sz: 10 }, alignment: { horizontal: 'left' },
    border: { top: _B, bottom: _B, left: _B, right: _B } },
  band: { font: { sz: 10 }, alignment: { horizontal: 'center' },
    fill: { fgColor: { rgb: 'FFF1F5F9' } },
    border: { top: _B, bottom: _B, left: _B, right: _B } },
  bandL: { font: { sz: 10 }, alignment: { horizontal: 'left' },
    fill: { fgColor: { rgb: 'FFF1F5F9' } },
    border: { top: _B, bottom: _B, left: _B, right: _B } },
  subtotal: { font: { bold: true, sz: 10, color: { rgb: 'FF1D4ED8' } },
    fill: { fgColor: { rgb: 'FFDBEAFE' } },
    alignment: { horizontal: 'left' },
    border: { top: _B, bottom: _B, left: _B, right: _B } },
  total: { font: { bold: true, sz: 11 },
    fill: { fgColor: { rgb: 'FFFEF3C7' } },
    alignment: { horizontal: 'left' },
    border: { top: _B, bottom: _B, left: _B, right: _B } },
};

// 표 한 장을 스타일 입혀 시트로 — 규격 바뀔 때 소계 행, 마지막 합계 행, 줄무늬(밴딩)
function buildSealReportSheet(XLSX, { title, meta, cols, rows, leftCols = [1] }) {
  const aoa = [];
  aoa.push([title]);
  aoa.push([]);
  for (const [k, v] of meta) aoa.push([k, '', v]);  // 라벨 A:B 병합(좁은 A열 잘림 방지), 값은 C열
  aoa.push([]);
  const headRowIdx = aoa.length;
  aoa.push(cols);
  const styleMap = [];  // [{r, c, s}]
  // 제목·메타 스타일
  styleMap.push({ r: 0, c: 0, s: STY.title });
  for (let i = 0; i < meta.length; i++) {
    styleMap.push({ r: 2 + i, c: 0, s: STY.metaK });
    styleMap.push({ r: 2 + i, c: 2, s: STY.metaV });
  }
  for (let c = 0; c < cols.length; c++) styleMap.push({ r: headRowIdx, c, s: STY.head });

  let prevSize = null, sizeCount = 0, band = false;
  const flushSubtotal = () => {
    if (prevSize == null) return;
    const r = aoa.length;
    aoa.push([`${prevSize} 소계: ${sizeCount}대`]);
    for (let c = 0; c < cols.length; c++) styleMap.push({ r, c, s: STY.subtotal });
  };
  for (const row of rows) {
    const size = row._size;
    if (size !== prevSize) {
      flushSubtotal();
      prevSize = size; sizeCount = 0; band = false;
    }
    sizeCount++;
    const r = aoa.length;
    aoa.push(row.cells);
    for (let c = 0; c < cols.length; c++) {
      const left = leftCols.includes(c);
      styleMap.push({ r, c, s: band ? (left ? STY.bandL : STY.band) : (left ? STY.cellL : STY.cell) });
    }
    band = !band;
  }
  flushSubtotal();
  const totalR = aoa.length;
  aoa.push([`총 ${rows.length}대`]);
  for (let c = 0; c < cols.length; c++) styleMap.push({ r: totalR, c, s: STY.total });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 스타일 적용
  for (const { r, c, s } of styleMap) {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = s;
  }
  // 병합: 제목 전체폭 + 소계/합계 행 전체폭
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }];
  for (let i = 0; i < meta.length; i++) merges.push({ s: { r: 2 + i, c: 0 }, e: { r: 2 + i, c: 1 } });
  for (let r = headRowIdx + 1; r < aoa.length; r++) {
    const first = aoa[r][0];
    if (typeof first === 'string' && (first.includes('소계') || first.startsWith('총 '))) {
      merges.push({ s: { r, c: 0 }, e: { r, c: cols.length - 1 } });
    }
  }
  ws['!merges'] = merges;
  ws['!rows'] = [{ hpt: 26 }];
  return ws;
}

export async function generateEmptySealReport({ voyage, sealTargets, sealMode }) {
  const XLSX = await loadSheetJSStyled();

  const vsl = voyage?.info?.vsl || '-';
  const voy = voyage?.info?.voy_l || voyage?.info?.voy || '-';
  const etd = fmtDateSafe(voyage?.info?.etd);

  // V7.42: 20ft 먼저 → 40ft, 규격 안에서 컨번호순 (사용자 확정 정렬)
  const targets = sortBySizeThenCn(sealTargets || []);
  const isVerify = sealMode === 'verify';

  const cols = ['순번', '컨번호', '규격', 'E', '엠티실번호', '검수자', '시각', '선적위치'];
  // V7.43: 시각 압축 표기 (06/10 09:12) — 인쇄 한 장 폭 확보
  const fmtTimeShort = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  // V7.43: 선적위치(베이/열/단) — 놓친 컨테이너를 자리로 바로 찾기 (사용자 확정)
  const posOf = (c) => {
    const pp = (v) => String(v ?? '').padStart(2, '0');
    return (c.bay || c.row || c.tier) ? `${pp(c.bay)}/${pp(c.row)}/${pp(c.tier)}` : '';
  };
  const rows = targets.map((c, i) => {
    // V7.43: 엠티실 칸의 ISO형 오염값(22GP/45GP 등)은 실번호가 아니므로 제거
    const eseal = looksLikeIsoType(c.eseal) ? '' : (c.eseal || '');
    return {
      _size: isoToLabel(c.iso) || c.iso || '-',   // 소계 그룹은 순수 라벨 기준
      cells: [
        i + 1,
        c.cn || '(현장 부여)',
        sizeLabelWithRaw(c.iso),                  // 표기는 병기 — 20DC(22GP)
        'E',
        eseal,                                    // V7.43: 입력 있으면 표시, 없으면 빈칸 (수기 기입 공간)
        c.eseal_by || '',
        fmtTimeShort(c.eseal_at),
        posOf(c),
      ],
    };
  });

  const ws = buildSealReportSheet(XLSX, {
    title: `엠티 실 ${isVerify ? '표기' : '부착'} 보고서`,
    meta: [
      ['선박', vsl], ['항차', voy], ['선적일자', etd],
      ['총 대수', `${targets.length}대`],
      ['검수 모드', isVerify ? '표기 (verify)' : '부착 (attach)'],
    ],
    cols, rows, leftCols: [1, 4, 5],
  });
  ws['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 12 }, { wch: 4 }, { wch: 14 },
    { wch: 9 }, { wch: 12 }, { wch: 9 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '엠티실 보고서');

  const filename = `엠티실_${vsl.replace(/\s+/g, '')}_${voy}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  return { filename, rowCount: targets.length };
}
/* V9.57(I14): 이하 generateEmptySealEditReport·EmptySealReportButton 삭제 — 참조 0 (전수 grep 확인).
   수정 리포트 기능이 다시 필요하면 git 이력(V9.56 이전)에서 복원. */
