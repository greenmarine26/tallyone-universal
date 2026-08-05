// M5.66: 모든 출력물 공통 toolbar (인쇄/PDF/엑셀)
// 사용법: 새 창 연 후 injectPrintToolbar(w, '제목') 호출

export const TOOLBAR_HTML = `
<div id="print-toolbar" class="print-toolbar" style="position:fixed;top:0;left:0;right:0;background:#1e293b;color:#fff;padding:8pt 10pt;display:flex;gap:8pt;justify-content:center;z-index:1000;border-bottom:2pt solid #f59e0b;font-family:'Malgun Gothic','맑은 고딕',sans-serif;">
  <button onclick="window.print()" style="background:#059669;color:#fff;border:none;padding:6pt 14pt;font-size:11pt;border-radius:4pt;cursor:pointer;font-weight:bold;">🖨 프린터 인쇄</button>
  <button onclick="window.__savePDF()" style="background:#0284c7;color:#fff;border:none;padding:6pt 14pt;font-size:11pt;border-radius:4pt;cursor:pointer;font-weight:bold;">📄 PDF 저장</button>
  <button onclick="window.__exportExcel()" style="background:#d97706;color:#fff;border:none;padding:6pt 14pt;font-size:11pt;border-radius:4pt;cursor:pointer;font-weight:bold;">📊 엑셀 다운로드</button>
  <button onclick="window.close()" style="background:#475569;color:#fff;border:none;padding:6pt 14pt;font-size:11pt;border-radius:4pt;cursor:pointer;">✕ 닫기</button>
</div>`;

export const TOOLBAR_CSS = `
@media print { .print-toolbar { display: none !important; } body { padding-top: 0 !important; } }
body { padding-top: 50pt; }`;

export const TOOLBAR_JS = `
window.__savePDF = function() {
  alert('인쇄 창에서 프린터를 "PDF로 저장"으로 선택하세요.\\n(Chrome: 대상 → PDF로 저장 / Edge: Microsoft Print to PDF)');
  setTimeout(() => window.print(), 100);
};
window.__exportExcel = function() {
  if (typeof XLSX === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
    s.onload = window.__doExport;
    s.onerror = () => alert('엑셀 라이브러리 로드 실패. 인터넷 연결 확인.');
    document.head.appendChild(s);
  } else {
    window.__doExport();
  }
};
window.__doExport = function() {
  try {
    const tables = document.querySelectorAll('table');
    if (tables.length === 0) { alert('내보낼 테이블이 없습니다.'); return; }
    const wb = XLSX.utils.book_new();
    tables.forEach((table, i) => {
      const sheetName = (table.getAttribute('data-sheet-name') || ('Sheet' + (i+1))).slice(0, 31);
      const ws = XLSX.utils.table_to_sheet(table);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    const date = new Date().toISOString().slice(0, 10);
    const title = (document.title || '출력물').replace(/[^가-힣a-zA-Z0-9_]/g, '_').slice(0, 30);
    XLSX.writeFile(wb, title + '_' + date + '.xlsx');
  } catch (e) {
    alert('엑셀 다운로드 실패: ' + e.message);
  }
};`;

// 새 창에 toolbar 주입
export function injectPrintToolbar(w) {
  if (!w || !w.document) return;
  try {
    // CSS 추가
    const style = w.document.createElement('style');
    style.textContent = TOOLBAR_CSS;
    w.document.head.appendChild(style);
    // toolbar HTML 추가 (body 최상단)
    w.document.body.insertAdjacentHTML('afterbegin', TOOLBAR_HTML);
    // JS 추가
    const script = w.document.createElement('script');
    script.textContent = TOOLBAR_JS;
    w.document.body.appendChild(script);
  } catch (e) {
    console.error('toolbar 주입 실패:', e);
  }
}

// 새 창 열기 + toolbar 자동 주입
export function openPrintWindow(html, title = '출력') {
  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.'); return null; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    injectPrintToolbar(w);
    try { w.focus(); } catch (e) {}
  }, 200);
  return w;
}
