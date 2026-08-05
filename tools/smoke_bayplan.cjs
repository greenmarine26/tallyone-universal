const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost/' });
const errs = [];
dom.window.addEventListener('error', e => errs.push(e.message));
console.error = (...a) => { const s=a.map(String).join(' '); if (/Error|not defined/.test(s)) errs.push(s.split('\n')[0].slice(0,150)); };
try { dom.window.eval(fs.readFileSync(process.argv[2],'utf8')); } catch(e){ errs.push('THROW '+e.message); }
setTimeout(() => {
  const t = dom.window.document.body.textContent || '';
  const uniq = [...new Set(errs)];
  if (uniq.length) { console.log('✗ BayPlan 렌더 오류 ' + uniq.length + '건'); uniq.slice(0,3).forEach(e=>console.log('   '+e)); process.exit(1); }
  if (t.length < 200) { console.log('✗ BayPlan 렌더 결과가 비었다 (' + t.length + '자)'); process.exit(1); }
  const boxes = (t.match(/📦\+/g)||[]).length;
  if (!boxes) { console.log('✗ 배치 후보(📦+)가 하나도 안 그려졌다'); process.exit(1); }
  console.log('✓ BayPlan 연막검사 통과 (' + t.length + '자 · 📦+ ' + boxes + '칸 · 오류 0)');
  process.exit(0);
}, 900);
