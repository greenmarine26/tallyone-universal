import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Download, ArrowDown, ArrowUp, AlertOctagon, FileWarning, Copy } from 'lucide-react';
import { exportSectionToCSV, exportSealErrorsToCSV } from './CSVExport.jsx';

export default function ReportTab({ voyageKey, mode, voyageInfo, containers, compMap, xrayMap, xraySeals }) {
  const [groupBy, setGroupBy] = useState('time');
  const [section, setSection] = useState('main'); // main | errors

  // M6.37: mode 기반 voy — 양하 보고는 voy_d, 선적 보고는 voy_l
  const voy = mode === 'discharge'
    ? (voyageInfo?.voy_d || voyageInfo?.voy || '')
    : mode === 'loading'
      ? (voyageInfo?.voy_l || voyageInfo?.voy || '')
      : (voyageInfo?.voy || '');

  const records = useMemo(() => {
    return Object.entries(compMap || {})
      .map(([cn, c]) => {
        const cont = containers.find(x => x.cn === cn);
        return cont ? { ...cont, ...c, completedAt: c.at } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  }, [compMap, containers]);

  // 실오류 컨테이너 추출
  const sealErrors = useMemo(() => {
    const list = [];
    containers.forEach(c => {
      const slOrig = c.sl_orig != null ? c.sl_orig : c.sl;
      if (c.sl && slOrig && c.sl !== slOrig) {
        const last = (c.sl_history || []).slice(-1)[0];
        list.push({
          ...c,
          errType: '실번호',
          orig: slOrig, actual: c.sl,
          by: last?.by || '', at: last?.at || 0
        });
      }
      if (mode === 'discharge') {
        const xs = xraySeals[c.cn] || {};
        const xSealOrig = xs.seal_orig != null ? xs.seal_orig : xs.seal;
        if (xs.seal && xSealOrig && xs.seal !== xSealOrig) {
          const last = (xs.history || []).slice(-1)[0];
          list.push({
            ...c,
            errType: 'X-RAY세관봉인',
            orig: xSealOrig, actual: xs.seal,
            by: last?.by || '', at: last?.at || 0
          });
        }
      }
    });
    return list;
  }, [containers, xraySeals, mode]);

  const groups = useMemo(() => {
    if (groupBy === 'inspector') {
      const g = {};
      records.forEach(r => {
        const k = r.by || '미지정';
        if (!g[k]) g[k] = [];
        g[k].push(r);
      });
      return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
    } else {
      const g = {};
      records.forEach(r => {
        if (!r.completedAt) return;
        const d = new Date(r.completedAt);
        const k = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}시`;
        if (!g[k]) g[k] = [];
        g[k].push(r);
      });
      return Object.entries(g);
    }
  }, [records, groupBy]);

  const handleExportFull = () => {
    exportSectionToCSV(voyageKey, mode, containers, compMap, xrayMap, xraySeals);
  };

  const handleExportErrors = () => {
    // V9.57(I7): mode별 항차(voy_d/voy_l)를 CSV에 넘긴다 — legacy info.voy 고정 해소
    exportSealErrorsToCSV(voyageKey, mode, voyageInfo, containers, xraySeals, voy);
  };

  const handleCopyErrorReport = () => {
    if (sealErrors.length === 0) return;
    const lines = [
      `==== ${voyageInfo?.vsl} ${voy} 실오류 신고 ====`,
      `모드: ${mode === 'discharge' ? '양하' : '선적'}`,
      `날짜: ${new Date().toLocaleString('ko-KR')}`,
      `총 ${sealErrors.length}건`,
      ``,
      ...sealErrors.map((e, i) =>
        `${i+1}. [${e.errType}] ${e.cn} (${e.bay}-${e.row}-${e.tier}) — 원: ${e.orig} → 실제: ${e.actual} [${e.by}]`
      )
    ];
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert(`실오류 보고서 복사됨 (${sealErrors.length}건)`);
    });
  };

  return (
    <div className="space-y-3">
      {/* 섹션 토글 */}
      <div className="flex gap-1">
        <button onClick={() => setSection('main')}
          className={`flex-1 py-2 rounded text-xs font-bold ${section === 'main' ? 'bg-amber-700 text-amber-100' : 'bg-slate-800 text-slate-400'}`}>
          📋 검수 보고서
        </button>
        <button onClick={() => setSection('errors')}
          className={`flex-1 py-2 rounded text-xs font-bold flex items-center justify-center gap-1 ${
            section === 'errors'
              ? 'bg-red-700 text-red-100'
              : sealErrors.length > 0 ? 'bg-red-900/40 text-red-300 border border-red-800' : 'bg-slate-800 text-slate-400'
          }`}>
          <AlertOctagon className="w-3.5 h-3.5"/>실오류 신고 {sealErrors.length > 0 && `(${sealErrors.length})`}
        </button>
      </div>

      {/* 메인 보고서 */}
      {section === 'main' && (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {mode === 'discharge'
                  ? <ArrowDown className="w-4 h-4 text-blue-400"/>
                  : <ArrowUp className="w-4 h-4 text-amber-400"/>}
                <div className="text-sm font-bold text-slate-100">검수 진행 보고서</div>
              </div>
              <button onClick={handleExportFull}
                className="bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700/40 text-emerald-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">
                <Download className="w-3.5 h-3.5"/>전체 CSV
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center mt-2">
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-[10px] text-slate-500 font-bold">전체</div>
                <div className="text-2xl font-black mono text-slate-100">{containers.length}</div>
              </div>
              <div className="bg-emerald-900/30 rounded p-2">
                <div className="text-[10px] text-emerald-400 font-bold">완료</div>
                <div className="text-2xl font-black mono text-emerald-300">{records.length}</div>
              </div>
              <div className="bg-amber-900/30 rounded p-2">
                <div className="text-[10px] text-amber-400 font-bold">미완</div>
                <div className="text-2xl font-black mono text-amber-300">{containers.length - records.length}</div>
              </div>
            </div>
          </div>

          <div className="flex gap-1">
            <button onClick={() => setGroupBy('time')}
              className={`flex-1 py-2 rounded text-xs font-bold ${groupBy === 'time' ? 'bg-amber-700 text-amber-100' : 'bg-slate-800 text-slate-400'}`}>
              시간순
            </button>
            <button onClick={() => setGroupBy('inspector')}
              className={`flex-1 py-2 rounded text-xs font-bold ${groupBy === 'inspector' ? 'bg-amber-700 text-amber-100' : 'bg-slate-800 text-slate-400'}`}>
              검수원별
            </button>
          </div>

          {/* V9.16: 미완 목록 — "결과" 탭에 정작 '아직 안 한 것'이 없었다(전면 점검 §6-2) */}
          <UndoneSection containers={containers} compMap={compMap}/>

          {records.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-500 text-sm">
              아직 완료된 검수 없음
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map(([key, items]) => (
                <ReportGroup key={key} title={key} items={items} groupBy={groupBy}/>
              ))}
            </div>
          )}
        </>
      )}

      {/* 실오류 신고 섹션 */}
      {section === 'errors' && (
        <SealErrorReport
          errors={sealErrors}
          voyageInfo={voyageInfo}
          voy={voy}
          mode={mode}
          onExport={handleExportErrors}
          onCopy={handleCopyErrorReport}
        />
      )}
    </div>
  );
}

function SealErrorReport({ errors, voyageInfo, voy, mode, onExport, onCopy }) {   // V9.14: voy 스코프 버그 수리 — 실오류 1건 이상이면 ReferenceError로 앱 전체 크래시였다
  if (errors.length === 0) {
    return (
      <div className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2"/>
        <div className="text-emerald-300 font-bold">실오류 없음</div>
        <div className="text-[11px] text-emerald-400/70 mt-1">모든 컨테이너 원본·실제 일치</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-red-950/40 border-2 border-red-700 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileWarning className="w-5 h-5 text-red-400"/>
            <div>
              <div className="font-black text-red-200">🚨 세관 신고 대상</div>
              <div className="text-[10px] text-red-300/70">항차: {voyageInfo?.vsl} {voy} · 모드: {mode === 'discharge' ? '양하' : '선적'}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black mono text-red-300">{errors.length}</div>
            <div className="text-[10px] text-red-400">건</div>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <button onClick={onCopy}
            className="flex-1 bg-red-800 hover:bg-red-700 text-red-100 px-3 py-2 rounded text-xs font-bold flex items-center justify-center gap-1">
            <Copy className="w-3.5 h-3.5"/>텍스트 복사
          </button>
          <button onClick={onExport}
            className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-emerald-100 px-3 py-2 rounded text-xs font-bold flex items-center justify-center gap-1">
            <Download className="w-3.5 h-3.5"/>실오류 CSV
          </button>
        </div>

        <div className="text-[11px] text-red-300/70 mb-2 font-bold">신고 양식 (원번호 → 실제번호)</div>
        <div className="space-y-1.5">
          {errors.map((e, i) => (
            <div key={`${e.cn}-${e.errType}`} className="bg-red-950/60 border border-red-800/60 rounded p-2 text-[11px]">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="text-red-400 font-black mono">{i + 1}.</span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                  e.errType === '실번호' ? 'bg-amber-700/60 text-amber-100' : 'bg-purple-700/60 text-purple-100'
                }`}>{e.errType}</span>
                <span className="text-amber-300 font-black mono">{e.cn?.slice(-4)}</span>
                <span className="text-slate-400 mono text-[10px]">{e.cn}</span>
                {e.bay && <span className="text-amber-400 mono text-[10px]">{e.bay}-{e.row}-{e.tier}</span>}
              </div>
              <div className="font-mono text-[12px] ml-4">
                <span className="text-slate-500">원번호:</span>
                <span className="text-slate-300 font-bold ml-1">{e.orig}</span>
                <span className="text-red-400 mx-2">→</span>
                <span className="text-slate-500">실제:</span>
                <span className="text-red-300 font-black ml-1">{e.actual}</span>
              </div>
              {e.by && (
                <div className="text-[10px] text-slate-500 ml-4 mt-0.5">
                  수정: {e.by} · {e.at ? new Date(e.at).toLocaleString('ko-KR') : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ReportGroup({ title, items, groupBy }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 bg-slate-800/50 flex items-center justify-between text-left">
        <div className="flex items-center gap-2">
          {groupBy === 'inspector'
            ? <span className="w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center text-amber-100 text-xs font-black">{title[0]}</span>
            : <Clock className="w-4 h-4 text-slate-400"/>}
          <span className="font-bold text-sm text-slate-200">{title}</span>
          <span className="bg-emerald-900/50 text-emerald-300 text-[10px] px-1.5 rounded font-black">{items.length}</span>
        </div>
        <span className="text-xs text-slate-500">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="p-2 space-y-1">
          {items.map(r => (
            <div key={r.cn} className="bg-slate-950/50 rounded px-2 py-1.5 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0"/>
              <span className="font-black text-amber-300 mono text-sm">{r.l4 || r.cn?.slice(-4)}</span>
              <span className="text-[11px] mono text-slate-400 truncate flex-1">{r.cn}</span>
              {r.bay && <span className="text-[10px] mono text-amber-400">{r.bay}-{r.row}-{r.tier}</span>}
              {groupBy === 'time' && r.by && <span className="text-[10px] text-emerald-400 font-bold">[{r.by}]</span>}
              {r.completedAt && (
                <span className="text-[10px] text-slate-500 mono">{new Date(r.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── V9.16: 미완 목록 (접이식, 위치와 함께) ─────────────────────────────
function UndoneSection({ containers, compMap }) {
  const [open, setOpen] = React.useState(false);
  const undone = containers.filter(c => !compMap[c.cn]);
  if (undone.length === 0) return (
    <div className="bg-emerald-950/30 border border-emerald-800 rounded-lg px-3 py-2 text-[12px] text-emerald-300 font-bold">
      ✅ 미완 0건 — 전량 완료
    </div>
  );
  return (
    <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left" style={{ minHeight: 44 }}>
        <span className="text-[13px] font-bold text-amber-200">⏳ 미완 {undone.length}건 {open ? '접기' : '보기'}</span>
        <span className="text-amber-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 max-h-72 overflow-y-auto space-y-1">
          {undone.map(c => (
            <div key={c.cn} className="flex items-center justify-between text-[12px] bg-slate-900/70 rounded px-2 py-1.5">
              <span className="mono text-slate-200 font-bold">{c.cn}</span>
              <span className="mono text-slate-400">{[c.bay, c.row, c.tier].filter(Boolean).join('-') || '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
