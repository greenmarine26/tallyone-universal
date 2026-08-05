// 번들을 jsdom 에 올려 실제로 그려 보고, 렌더 중 오류가 하나라도 나면 빌드를 실패시킨다.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const errs = [];
dom.window.addEventListener('error', (e) => errs.push(e.message));
const orig = console.error;
console.error = (...a) => { const s = a.map(String).join(' '); if (/Error/.test(s)) errs.push(s.split('\n')[0].slice(0, 200)); };
try { dom.window.eval(fs.readFileSync(process.argv[2], 'utf8')); }
catch (e) { errs.push('THROW: ' + e.message); }
setTimeout(() => {
  const t = dom.window.document.body.textContent || '';
  const uniq = [...new Set(errs)];
  if (uniq.length) { console.log('✗ 렌더 중 오류 ' + uniq.length + '건'); uniq.slice(0, 3).forEach((e) => console.log('   ' + e)); process.exit(1); }
  if (t.length < 500) { console.log('✗ 렌더 결과가 비었다 (' + t.length + '자) — 컴포넌트가 아무것도 안 그렸다'); process.exit(1); }
  const stg = (t.match(/임시창고\s*(\d+)/) || [])[1];
  if (stg !== '3') { console.log('✗ 미배정 3대가 임시창고로 안 갔다 (임시창고=' + stg + ')'); process.exit(1); }

  // V9.23-07: 빈 자리를 눌러 컨을 고르는 흐름까지 실제로 눌러 본다.
  const doc = dom.window.document;
  const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const open = doc.querySelector('.cpv2-cell.bge-open');
  if (!open) { console.log('✗ 놓을 수 있는 빈 자리(.bge-open)가 하나도 안 그려졌다'); process.exit(1); }
  click(open);
  setTimeout(() => {
    const pick = doc.querySelector('.bge-pick');
    if (!pick) { console.log('✗ 빈 자리를 눌렀는데 컨 고르기 창이 안 뜬다'); process.exit(1); }
    const item = pick.querySelector('.bge-pick-item');
    if (!item) { console.log('✗ 고르기 창에 컨 목록이 비었다'); process.exit(1); }
    const cn = item.querySelector('b').textContent;
    click(item);
    setTimeout(() => {
      if (doc.querySelector('.bge-pick')) { console.log('✗ 컨을 골랐는데 창이 안 닫힌다 = 배치 실패'); process.exit(1); }
      const t2 = doc.body.textContent || '';
      const stg2 = (t2.match(/임시창고\s*(\d+)/) || [])[1];
      if (stg2 !== '2') { console.log('✗ 배치 후 임시창고가 2대여야 하는데 ' + stg2 + '대'); process.exit(1); }
      const uniq2 = [...new Set(errs)];
      if (uniq2.length) { console.log('✗ 상호작용 중 오류 ' + uniq2.length + '건: ' + uniq2[0]); process.exit(1); }
      console.log('✓ 렌더 연막검사 통과 (' + t.length + '자 · 임시창고 3→2 · ' + cn + ' 배치 · 오류 0)');
    }, 600);
  }, 600);
  return;
}, 4000);
setTimeout(() => { console.error = orig; }, 9000);
