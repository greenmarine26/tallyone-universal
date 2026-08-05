// RIZHAO 계열 LOLO 검수 제출 리스트 생성 (V8.06).
//   수석 대시보드에서 검수 완료분을 두 양식으로 내보낸다.
//   ① ACTUAL SEAL LIST — 매니페스트와 실제(실번호)가 다른 건만. 실오류 'V', 리씰 '★'.
//   ② LOADING LIST — 처리분 전체. NO·컨번호·실번호·규격·F/E·ACT(변경 시).
//   기존 records(실번호 수정/리씰/실오류) + completed(처리)를 병합해 생성.

import { isoToLabel } from './utils.js';
import { tenant } from './tenant.js';   // TallyUni 0.1: 회사·주소 단일 소스

// 모드 구역(discharge/loading)에서 처리된(=completed) 컨 목록을 만든다.
//   records의 수정 필드(sl/sl_orig/eseal/eseal_wrong/reseal)를 ediContainers에 덮어쓴다.
export function buildLoloRows(sec) {
  if (!sec) return [];
  const ediMap = sec.ediContainers || {};
  const recMap = sec.records || {};
  const compMap = sec.completed || {};
  const rows = [];
  const seen = new Set();
  // completed에 있는 것만 누적 (검수사가 처리한 것)
  Object.keys(compMap).forEach(cn => {
    if (seen.has(cn)) return;
    seen.add(cn);
    const e = ediMap[cn] || {};
    const r = recMap[cn] || {};
    const comp = compMap[cn] || {};
    const slOrig = r.sl_orig || r.sl || e.sl || '';
    const slNow = r.sl != null ? r.sl : (e.sl || '');
    const sealError = slOrig && slNow && slOrig !== slNow;     // 실오류(V)
    const reseal = r.reseal || '';                              // 리씰(★)
    const esealWrong = r.eseal_wrong || '';
    rows.push({
      cn,
      iso: e.iso || r.iso || '',
      sizeLabel: isoToLabel(e.iso || r.iso || '') || '',
      fe: e.fe || r.fe || 'F',
      manifestSeal: slOrig,
      actualSeal: slNow,
      eseal: e.eseal || r.eseal || '',
      esealWrong,
      reseal,
      sealError,
      hasReseal: !!reseal,
      damage: comp.flag === 'damage' || comp.damage === '있음' ? (comp.note || '데미지') : '',
      flag: comp.flag || 'normal',
      by: comp.by || '',
    });
  });
  // 컨번호 정렬
  rows.sort((a, b) => a.cn.localeCompare(b.cn));
  return rows;
}

// 사이즈 그룹 (20/40/45) × F/E 집계
function tally(rows) {
  const t = { '20': { F: 0, E: 0 }, '40': { F: 0, E: 0 }, '45': { F: 0, E: 0 } };
  rows.forEach(r => {
    const g = r.sizeLabel.startsWith('20') ? '20' : r.sizeLabel.startsWith('45') ? '45' : '40';
    t[g][r.fe === 'E' ? 'E' : 'F']++;
  });
  return t;
}

// ① ACTUAL CONTAINER & SEAL NUMBER LIST — 매니페스트와 실제가 다른 건만.
export function buildActualSealListText(meta, rows) {
  const diff = rows.filter(r => r.sealError || r.hasReseal || r.esealWrong);
  const lines = [];
  lines.push(`${tenant().companyEn}   ${tenant().addressEn}`);
  lines.push('ACTUAL CONTAINER & SEAL NUMBER LIST');
  lines.push(`M/V : ${meta.vsl || ''}    VOY.NO : ${meta.voy || ''}    DATE : ${meta.date || ''}`);
  lines.push(`PORT : ${meta.port || tenant().addressEn}    MODE : ${meta.mode === 'discharge' ? '양하' : '선적'}`);
  lines.push('');
  lines.push('NO | MANIFEST(CONT/SEAL) | SIZE | ACTUAL(CONT/SEAL) | RESEAL | REMARKS');
  lines.push('-'.repeat(78));
  if (diff.length === 0) {
    lines.push('(실번호 변경·리씰·실오류 없음)');
  } else {
    diff.forEach((r, i) => {
      const mark = r.sealError ? 'V' : r.hasReseal ? '★' : '';
      const remark = [r.sealError ? '실오류' : '', r.hasReseal ? '리씰' : '', r.damage ? `데미지:${r.damage}` : '']
        .filter(Boolean).join(' ');
      lines.push(
        `${String(i + 1).padStart(2)} | ${r.cn} / ${r.manifestSeal || '-'} | ${r.sizeLabel} | ` +
        `${r.cn} / ${r.actualSeal || '-'} | ${r.reseal || '-'} | ${mark} ${remark}`.trim()
      );
    });
  }
  lines.push('-'.repeat(78));
  const t = tally(rows);
  lines.push(`TOTAL 처리: 20FT F${t['20'].F}/E${t['20'].E}  40FT F${t['40'].F}/E${t['40'].E}  45FT F${t['45'].F}/E${t['45'].E}  (총 ${rows.length})`);
  lines.push(`변경 건수: ${diff.length}`);
  return lines.join('\n');
}

// ② LOADING LIST — 처리분 전체. ACT 칸에 변경 표기(V/★/실번호).
export function buildLoadingListText(meta, rows) {
  const lines = [];
  lines.push(`${meta.mode === 'discharge' ? 'DISCHARGING' : 'LOADING'} LIST   ${meta.vsl || ''} ${meta.voy || ''} (${meta.date || ''})`);
  lines.push('');
  lines.push('NO | CONTAINER | SEAL | SZ | F/E | ACT.');
  lines.push('-'.repeat(70));
  rows.forEach((r, i) => {
    let act = '';
    if (r.sealError) act = `V ${r.actualSeal}`;          // 실오류: V + 실제 실번호
    else if (r.hasReseal) act = `★ ${r.reseal}`;          // 리씰: ★ + 리씰 번호
    if (r.damage) act += (act ? ' ' : '') + `[데미지]`;
    lines.push(
      `${String(i + 1).padStart(3)} | ${r.cn} | ${(r.actualSeal || r.eseal || '-')} | ${r.sizeLabel} | ${r.fe} | ${act}`.trimEnd()
    );
  });
  lines.push('-'.repeat(70));
  const t = tally(rows);
  lines.push('합계:');
  lines.push(`  20FT  FULL ${t['20'].F}  EMPTY ${t['20'].E}`);
  lines.push(`  40FT  FULL ${t['40'].F}  EMPTY ${t['40'].E}`);
  lines.push(`  45FT  FULL ${t['45'].F}  EMPTY ${t['45'].E}`);
  lines.push(`  TOTAL ${rows.length}`);
  lines.push('  (V=실오류, ★=리씰)');
  return lines.join('\n');
}

// 브라우저 텍스트 다운로드
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
