import React, { useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, Printer, FileDown, X } from 'lucide-react';
import { fmtPos, isPyeongtaekPort, loadSheetJS, isVirtualCn } from '../utils.js';

// V8.98-08: 쉬프팅(재적부) 목록 모달 — 검증 카드의 ◆ 칸 클릭 시. 인쇄/PDF/엑셀 저장(청구 근거용).
const _sp = (p) => `${String(p).slice(0, 3)}-${String(p).slice(3, 5)}-${String(p).slice(5, 7)}`;

function ShiftingModal({ list, voyageKey, onClose }) {
  const title = `쉬프팅(재적부) 목록 — ${String(voyageKey || '').replace('_', ' ')}`;
  const openPrint = () => {
    const rows = list.map((s, i) =>
      `<tr><td>${i + 1}</td><td class="mono">${s.cn}</td><td>${s.iso || ''}</td><td>${s.fe || ''}</td><td>${s.pod || ''}</td><td class="mono">${_sp(s.from)}</td><td class="mono">${_sp(s.to)}</td><td></td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body{font-family:'Malgun Gothic',sans-serif;margin:24px;color:#111}
      h2{font-size:16px;margin:0 0 2px}
      .sub{font-size:11px;color:#555;margin-bottom:10px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #999;padding:4px 6px;text-align:center}
      th{background:#eef} .mono{font-family:Consolas,monospace}
      @media print{body{margin:8mm}}
    </style></head><body>
      <h2>◆ ${title} · 총 ${list.length}대</h2>
      <div class="sub">통과화물 선내 위치 이동(양하+재선적 실작업) — 양하·선적 공통 · 출력 ${new Date().toLocaleString('ko-KR')}</div>
      <table><thead><tr><th>No</th><th>컨테이너 번호</th><th>규격</th><th>F/E</th><th>POD</th><th>전 위치</th><th>후 위치</th><th>확인</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 눌러주세요.'); return; }
    w.document.write(html); w.document.close();
  };
  const saveXlsx = async () => {
    try {
      const XLSX = await loadSheetJS();
      const aoa = [[title], [`총 ${list.length}대 · 통과화물 재적부(양하·선적 공통)`], [],
        ['No', '컨테이너 번호', '규격', 'F/E', 'POD', '전 위치', '후 위치'],
        ...list.map((s, i) => [i + 1, s.cn, s.iso || '', s.fe || '', s.pod || '', _sp(s.from), _sp(s.to)])];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 5 }, { wch: 15 }, { wch: 7 }, { wch: 5 }, { wch: 8 }, { wch: 10 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '쉬프팅');
      XLSX.writeFile(wb, `쉬프팅_${voyageKey || 'list'}.xlsx`);
    } catch (e) { alert('엑셀 저장 실패: ' + (e?.message || e)); }
  };
  return (
    <div className="fixed inset-0 z-[95] bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-slate-900 border border-blue-800/60 rounded-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2.5 bg-blue-950/60 rounded-t-xl flex items-center gap-2">
          <span className="text-blue-400 font-black">◆</span>
          <div className="text-[13px] font-black text-blue-100">쉬프팅(재적부) {list.length}</div>
          <div className="text-[10px] text-slate-400">양하·선적 공통</div>
          <button onClick={onClose} className="ml-auto p-1 text-slate-400 hover:text-white"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-2 flex gap-1.5 border-b border-slate-800">
          <button onClick={openPrint} className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-blue-800 hover:bg-blue-700 rounded text-[12px] font-bold text-white">
            <Printer className="w-3.5 h-3.5"/> 인쇄
          </button>
          <button onClick={openPrint} className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-slate-700 hover:bg-slate-600 rounded text-[12px] font-bold text-white">
            <FileDown className="w-3.5 h-3.5"/> PDF 저장
          </button>
          <button onClick={saveXlsx} className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-emerald-800 hover:bg-emerald-700 rounded text-[12px] font-bold text-white">
            <FileDown className="w-3.5 h-3.5"/> 엑셀 저장
          </button>
        </div>
        <div className="px-3 py-1 text-[10px] text-slate-500">인쇄·PDF는 새 창에서 열립니다 — PDF는 인쇄 대상에서 "PDF로 저장"을 선택하세요.</div>
        <div className="overflow-y-auto divide-y divide-slate-800">
          {list.map((s, i) => (
            <div key={s.cn} className="px-3 py-1.5 flex items-center gap-2 text-[12px]">
              <span className="text-slate-600 w-5 text-right">{i + 1}</span>
              <span className="mono font-bold text-slate-200">{s.cn}</span>
              <span className="text-slate-500">{s.iso}</span>
              {s.pod && <span className="text-slate-500">{s.pod}</span>}
              <span className="ml-auto mono text-blue-300">{_sp(s.from)} → {_sp(s.to)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ValidationBox({ ediContainers, records, mode, shiftingList = [], voyageKey = '' }) {
  const shiftCount = shiftingList.length;
  const [shiftOpen, setShiftOpen] = useState(false);
  const v = useMemo(() => {
    if (!ediContainers || ediContainers.length === 0) return null;
    const isPtk = (c) => {
      if (mode === 'discharge') return isPyeongtaekPort(c.pod);
      return isPyeongtaekPort(c.pol);
    };
    const ptkInEdi = ediContainers.filter(isPtk);
    const recCns = new Set((records || []).map(r => r.cn));
    const ediCns = new Set(ediContainers.map(c => c.cn));
    // V9.04-01: 가상(더미) 컨번호 분리 — MCSN 629S 사건 2026-07-18.
    //   EDI의 엠티 예약자리(DUME·CASP 더미)는 '리스트에 없음(누락)' 대상이 아니고,
    //   리스트의 엠티 실번호(E확정)가 그 자리를 채우는 짝이므로 '추가(EDI밖)' 경고에서도 뺀다.
    const virtualInEdi = ptkInEdi.filter(c => isVirtualCn(c.cn));
    const missingInList = ptkInEdi.filter(c => !isVirtualCn(c.cn) && !recCns.has(c.cn));
    let extraInList = (records || []).filter(r => !ediCns.has(r.cn));
    let emptyConfirmed = 0;
    if (virtualInEdi.length > 0) {
      // fe='E' 또는 공란(합본 F/E 공란 287행 실측 — 수집기 v2.17.11-17부터 엠티 출처는 E로 채움)을
      //   엠티 확정분으로 본다. 명시적 'F'(풀인데 EDI에 없음)만 진짜 '추가' 경고로 남긴다.
      const isE = (r) => String(r.fe || '').toUpperCase() !== 'F';
      emptyConfirmed = extraInList.filter(isE).length;
      extraInList = extraInList.filter(r => !isE(r));
    }

    // 선사별 누락
    const missingByOp = {};
    missingInList.forEach(c => {
      const op = c.op || '미지정';
      missingByOp[op] = (missingByOp[op] || 0) + 1;
    });

    // 선사별 추가
    const extraByOp = {};
    extraInList.forEach(r => {
      const op = r.op || '미지정';
      extraByOp[op] = (extraByOp[op] || 0) + 1;
    });

    return {
      ediTotal: ediContainers.length,
      ptkTotal: ptkInEdi.length,
      listTotal: (records || []).length,
      matched: ptkInEdi.filter(c => recCns.has(c.cn)).length,
      missingCount: missingInList.length,
      missingByOp,
      missingDetails: missingInList.slice(0, 5),
      extraCount: extraInList.length,
      extraByOp,
      extraDetails: extraInList.slice(0, 5),
      virtualCount: virtualInEdi.length,   // V9.04-01: 가상E(실번호 미배정 자리)
      emptyConfirmed,                      // V9.04-01: 리스트 엠티 실번호(가상 자리 확정분)
    };
  }, [ediContainers, records, mode]);

  if (!v) return null;
  const allOk = v.missingCount === 0 && v.extraCount === 0 && v.listTotal > 0;

  return (
    <div className={`rounded-lg p-3 ${
      allOk ? 'bg-emerald-950/40 border border-emerald-800' : 'bg-slate-900 border border-slate-800'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        {allOk ? (
          <ShieldCheck className="w-4 h-4 text-emerald-400"/>
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-400"/>
        )}
        <div className="text-xs font-bold text-slate-200">
          데이터 검증 (EDI ↔ 리스트)
        </div>
      </div>

      <div className={`grid ${shiftCount > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-2 text-center text-[11px] mb-2`}>
        <div className="bg-slate-800/60 rounded p-1.5">
          <div className="text-slate-500 text-[10px]">EDI 평택</div>
          <div className="text-amber-300 font-black mono">{v.ptkTotal}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-1.5">
          <div className="text-slate-500 text-[10px]">리스트</div>
          <div className="text-slate-200 font-black mono">{v.listTotal}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-1.5">
          <div className="text-slate-500 text-[10px]">매칭</div>
          <div className="text-emerald-400 font-black mono">{v.matched}</div>
        </div>
        {shiftCount > 0 && (
          <button onClick={() => setShiftOpen(true)}
            className="bg-blue-950/50 rounded p-1.5 border border-blue-800/40 hover:bg-blue-900/60 active:scale-95 transition">
            <div className="text-blue-300/80 text-[10px]">◆ 쉬프팅</div>
            <div className="text-blue-300 font-black mono">{shiftCount}</div>
            <div className="text-blue-400/60 text-[9px]">목록·인쇄 ▸</div>
          </button>
        )}
      </div>
      {/* V8.98-07: 총 작업 합계 — 쉬프팅(재적부)은 양하+재선적 실작업이라 청구 근거에 포함(사용자 확정 2026-07-14).
          상세 목록은 리스트 하단 ◆ 박스 + 인쇄 검수리스트 [별첨2]. */}
      {shiftCount > 0 && (
        <div className="mb-2 px-2 py-1.5 bg-blue-950/40 border border-blue-800/40 rounded text-[11px] text-blue-200 font-bold">
          총 작업 {v.listTotal + shiftCount}대 = 리스트 {v.listTotal} + 쉬프팅 {shiftCount}
          <span className="ml-1 font-normal text-blue-300/70">(재적부 상세는 하단 ◆ 목록 · 인쇄 [별첨2])</span>
        </div>
      )}

      {/* V9.04-01: 가상E·E확정 안내 — EDI 엠티 예약자리(더미번호)와 리스트 엠티 실번호의 짝.
          MCSN 629S: 가상 187이 '누락 187 + 추가 187' 이중 경고로 떠서 허수였음 — 정보 줄로 대체. */}
      {/* V9.08(2026-07-26, 사용자 확정): 가상E는 '예상치'다. 확정이 들어오면 그것이 진실이고
          예상 수와 달라도 부족이 아니다(예상 202·확정 201이어도 정상, 확정 2면 2가 맞다).
          확정이 있으면 예상 자리수는 표시하지 않는다 — 남아 있으면 미확정으로 오해된다. */}
      {v.virtualCount > 0 && (
        <div className="mb-2 px-2 py-1.5 bg-purple-950/40 border border-purple-800/40 rounded text-[11px] text-purple-200 font-bold">
          {v.emptyConfirmed > 0 ? (
            <>실 {v.ptkTotal - v.virtualCount} + E확정 {v.emptyConfirmed} = 총 {v.ptkTotal - v.virtualCount + v.emptyConfirmed}</>
          ) : (
            <>
              실 {v.ptkTotal - v.virtualCount} + 가상E {v.virtualCount}
              <span className="ml-1 font-normal text-purple-300/70">(가상E = 실번호 미배정 엠티 자리 — 누락 아님)</span>
            </>
          )}
        </div>
      )}

      {v.missingCount > 0 && (
        <div className="bg-red-950/40 border border-red-800/50 rounded p-2 mb-2">
          <div className="text-[11px] text-red-300 font-bold mb-1.5">
            🚢 EDI 평택 대상 → 리스트에 없음: {v.missingCount}대
          </div>
          <div className="bg-amber-950/40 border border-amber-800/40 rounded p-1.5 mb-1.5">
            <div className="text-[10px] text-amber-300/80 mb-1">▼ 선사별 누락 (해당 검수업체 리스트 추가 필요)</div>
            {Object.entries(v.missingByOp).sort((a, b) => b[1] - a[1]).map(([op, n]) => (
              <div key={op} className="flex items-center gap-1.5 text-amber-200 text-[11px] font-bold">
                <span className="bg-amber-700/60 text-amber-100 px-1.5 py-0.5 rounded text-[10px] mono">{op}</span>
                <span>{n}대</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-orange-300/70 mb-0.5">샘플:</div>
          {v.missingDetails.map((c, i) => (
            <div key={i} className="text-[10px] text-orange-200 mono">
              • {c.cn} ({c.op || '?'}) {fmtPos(c)}
            </div>
          ))}
          {v.missingCount > 5 && <div className="text-[10px] text-red-400/60">... 외 {v.missingCount - 5}대</div>}
        </div>
      )}

      {v.extraCount > 0 && (
        <div className="bg-orange-950/40 border border-orange-800/50 rounded p-2">
          <div className="text-[11px] text-orange-300 font-bold mb-1.5">
            📋 리스트에 있는데 EDI에 없음: {v.extraCount}대
          </div>
          {Object.entries(v.extraByOp).sort((a, b) => b[1] - a[1]).map(([op, n]) => (
            <div key={op} className="text-[11px] text-orange-200 ml-1">
              • {op}: {n}대 (해당 선사 EDI 추가 필요)
            </div>
          ))}
        </div>
      )}

      {shiftOpen && (
        <ShiftingModal list={shiftingList} voyageKey={voyageKey} onClose={() => setShiftOpen(false)} />
      )}
    </div>
  );
}
