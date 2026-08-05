// CSV 내보내기 — 결재용 + 세관 신고용
import { isoToLabel, formatWt, fmtPos, isReeferContainer } from '../utils.js';

export function exportSectionToCSV(voyageKey, mode, containers, compMap, xrayMap, xraySeals) {
  const headers = [
    '순번', '위치', '컨번호',
    '원실번호', '실제실번호', '실오류',
    '원XRAY세관봉인', '실제XRAY세관봉인', '실제XRAY전자봉인', 'XRAY오류',
    '규격', 'F/E', '무게(kg)', '검수업체', 'POL', 'POD',
    '리퍼온도', '온도미입력', 'X-RAY대상', '검수완료', '검수자', '완료시각',
    '실번호수정자', '실번호수정시각', 'XRAY수정자', 'XRAY수정시각'
  ];

  const rows = [headers];
  containers.forEach((c, i) => {
    const comp = compMap[c.cn];
    const isX = mode === 'discharge' && !!xrayMap[c.cn];
    const xs = xraySeals[c.cn] || {};
    const slOrig = c.sl_orig != null ? c.sl_orig : c.sl || '';
    const slErr = c.sl && slOrig && c.sl !== slOrig ? 'O' : '';
    const xSealOrig = xs.seal_orig != null ? xs.seal_orig : xs.seal || '';
    const xErr = xs.seal && xSealOrig && xs.seal !== xSealOrig ? 'O' : '';
    const lastSlHist = (c.sl_history || []).slice(-1)[0];
    const lastXHist = (xs.history || []).slice(-1)[0];
    const completedAt = comp?.at ? new Date(comp.at).toLocaleString('ko-KR') : '';

    // M3.5.4: 온도 미입력 체크 (리퍼인데 온도 없거나 0)
    // M3.75: 엠티 리퍼는 정상 (온도 없는 게 맞음) → 풀 리퍼만 경고
    const isReefer = isReeferContainer(c);
    const tmpStr = String(c.tmp || '').trim();
    const isFullReefer = isReefer && (c.fe === 'F' || c.fe === '' || c.fe == null);
    const tmpMissing = isFullReefer && !c.rfdry && !c.mkcon && (c.tmp_missing || tmpStr === '');

    rows.push([
      i + 1,
      fmtPos(c),
      c.cn || '',
      slOrig, c.sl || '', slErr,
      xSealOrig, xs.seal || '', xs.eseal || '', xErr,
      isoToLabel(c.iso) || c.tp || '',
      c.fe || '',
      c.wt || '',
      c.op || '',
      c.pol || '',
      c.pod || '',
      tmpMissing ? '' : (c.tmp || ''),
      tmpMissing ? '⚠️미입력' : '',
      isX ? 'O' : '',
      comp ? 'O' : '',
      comp?.by || '',
      completedAt,
      lastSlHist?.by || '',
      lastSlHist?.at ? new Date(lastSlHist.at).toLocaleString('ko-KR') : '',
      lastXHist?.by || '',
      lastXHist?.at ? new Date(lastXHist.at).toLocaleString('ko-KR') : '',
    ]);
  });

  download(rows, `${voyageKey}_${mode}_${dateStr()}.csv`);
}

// 세관 신고용 — 실오류 컨테이너만 추출
export function exportSealErrorsToCSV(voyageKey, mode, voyageInfo, containers, xraySeals, voyArg = '') {
  // V9.57(I7): 종전엔 legacy info.voy 고정이라 양하/선적 항차가 구분되지 않았다.
  //   호출부(ReportTab)가 mode별로 계산한 voy(voy_d/voy_l)를 끝 인자로 넘겨받아 사용.
  //   미전달 시 기존 폴백(info.voy) 유지 — 이 함수 호출부는 ReportTab 하나뿐(전수 grep 확인).
  const voy = voyArg || voyageInfo?.voy || '';
  const headers = [
    '항차', '선박', '항해번호', '모드',
    '순번', '위치', '컨번호',
    '오류구분', '원번호', '실제번호',
    '검수업체', 'POL', 'POD',
    '수정자', '수정시각'
  ];
  const rows = [headers];
  let no = 1;

  containers.forEach(c => {
    const slOrig = c.sl_orig != null ? c.sl_orig : c.sl || '';
    if (c.sl && slOrig && c.sl !== slOrig) {
      const last = (c.sl_history || []).slice(-1)[0];
      rows.push([
        voyageKey, voyageInfo?.vsl || '', voy, mode === 'discharge' ? '양하' : '선적',
        no++, fmtPos(c),
        c.cn,
        '실번호',
        slOrig, c.sl,
        c.op || '', c.pol || '', c.pod || '',
        last?.by || '',
        last?.at ? new Date(last.at).toLocaleString('ko-KR') : '',
      ]);
    }
    if (mode === 'discharge') {
      const xs = xraySeals[c.cn] || {};
      const xSealOrig = xs.seal_orig != null ? xs.seal_orig : xs.seal || '';
      if (xs.seal && xSealOrig && xs.seal !== xSealOrig) {
        const last = (xs.history || []).slice(-1)[0];
        rows.push([
          voyageKey, voyageInfo?.vsl || '', voy, '양하',
          no++, fmtPos(c),
          c.cn,
          'X-RAY 세관봉인',
          xSealOrig, xs.seal,
          c.op || '', c.pol || '', c.pod || '',
          last?.by || '',
          last?.at ? new Date(last.at).toLocaleString('ko-KR') : '',
        ]);
      }
    }
  });

  download(rows, `${voyageKey}_실오류신고_${dateStr()}.csv`);
}

function download(rows, filename) {
  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const csv = '\uFEFF' + rows.map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStr() {
  return new Date().toISOString().slice(0, 10);
}
