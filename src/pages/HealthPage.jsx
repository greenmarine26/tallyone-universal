// 항차 건강 점검 페이지 — 수집기 하트비트 + 항차별 EDI/리스트/빈규격/플래그 점검표 (V8.40).
import React, { useMemo, useState, useEffect } from 'react';
import { healthSummary, heartbeatState } from '../health.js';

export default function HealthPage({ voyages, heartbeat, onOpenVoyage }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const { list, issueCount } = useMemo(() => healthSummary(voyages), [voyages]);
  const hb = heartbeatState(heartbeat, now);

  const hbCard = hb.state === 'none'
    ? { cls: 'border-slate-600/50 bg-slate-800/40', dot: 'bg-slate-500', title: '수집기 기록 없음', desc: '하트비트가 아직 수신되지 않았습니다 (수집기 v2.15.0 이상 필요).' }
    : hb.state === 'ok'
      ? { cls: 'border-emerald-700/50 bg-emerald-950/30', dot: 'bg-emerald-400', title: `수집기 정상 · ${hb.ageMin}분 전 사이클`, desc: `주기 ${hb.cycleMin}분 · 끊김 기준 ${hb.cycleMin * 2}분` }
      : { cls: 'border-red-700/60 bg-red-950/40', dot: 'bg-red-500', title: `수집기 끊김 · 마지막 사이클 ${hb.ageMin}분 전`, desc: `주기 ${hb.cycleMin}분의 2배(${hb.cycleMin * 2}분)를 넘었습니다 — PC의 수집기를 확인하세요.` };

  return (
    <div className="max-w-6xl mx-auto px-3 py-3">
      <div className="mb-3">
        <div className="text-lg font-black text-slate-100">항차 건강 점검</div>
        <div className="text-[11px] text-slate-500">수집기 상태와 항차별 자료 이상(빈규격·수량불일치)을 한눈에 — 규칙은 수집기 품질 게이트와 동일</div>
      </div>

      {/* 수집기 하트비트 */}
      <div className={`border rounded-lg px-3 py-2.5 mb-3 ${hbCard.cls}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${hbCard.dot} ${hb.state === 'ok' ? 'animate-pulse' : ''}`} />
          <span className="text-sm font-bold text-slate-100">{hbCard.title}</span>
          {heartbeat?.version ? <span className="text-[10px] text-slate-500 ml-auto">v{heartbeat.version}</span> : null}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5 ml-4">{hbCard.desc}</div>
        {heartbeat?.autoreg && (heartbeat.autoreg.done || heartbeat.autoreg.flagged) ? (
          <div className="text-[11px] text-slate-400 ml-4">마지막 사이클 자동등록 {heartbeat.autoreg.done || 0}건{heartbeat.autoreg.flagged ? ` · 플래그 ${heartbeat.autoreg.flagged}건` : ''}</div>
        ) : null}
      </div>

      {/* 요약 */}
      <div className={`border rounded-lg px-3 py-2 mb-3 ${issueCount ? 'border-amber-700/50 bg-amber-950/30' : 'border-emerald-700/40 bg-emerald-950/20'}`}>
        <span className={`text-sm font-bold ${issueCount ? 'text-amber-200' : 'text-emerald-200'}`}>
          {issueCount ? `⚠ 검증 필요 항차 ${issueCount}건` : '✓ 모든 항차 자료 정상'}
        </span>
        <span className="text-[11px] text-slate-500 ml-2">전체 {list.length}개 항차 점검</span>
      </div>

      {/* 항차별 점검표 */}
      <div className="space-y-2">
        {list.map(h => (
          <button key={h.key} onClick={() => onOpenVoyage && onOpenVoyage(h.key)}
            className={`w-full text-left border rounded-lg px-3 py-2 transition-colors ${h.flags.length
              ? 'border-amber-700/60 bg-amber-950/25 hover:bg-amber-950/40'
              : 'border-slate-700/40 bg-slate-900/50 hover:bg-slate-800/60'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {/* V9.57(I17): health.js(h.voy)는 legacy info.voy 단일 — 양하/선적 항차 분리 미지원.
                  화면에서 voyages prop으로 voy_d/voy_l을 직접 조회해 병기한다 (health.js는 팀G 소관, 미수정). */}
              <span className="font-bold text-sm text-slate-100">{h.vsl} {(() => {
                const info = voyages?.[h.key]?.info || {};
                const d = info.voy_d, l = info.voy_l;
                if (d && l && d !== l) return `${d} / ${l}`;
                return d || l || h.voy;
              })()}</span>
              <span className="text-[10px] text-slate-500">{h.key}</span>
              {h.auto && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300 border border-sky-700/40">
                  🤖 {h.autoStatus === 'confirmed' ? '자동(확정)' : '자동(수집중)'}
                </span>
              )}
              {h.flags.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/70 text-amber-200 border border-amber-600/50 font-bold">
                  ⚠ 검증 필요
                </span>
              )}
            </div>
            <div className="flex gap-4 mt-1 flex-wrap">
              {h.rows.map(r => (
                <div key={r.mode} className="text-[11px] text-slate-400">
                  <span className={`font-bold ${r.mode === 'discharge' ? 'text-blue-300' : 'text-orange-300'}`}>{r.label}</span>
                  {' '}EDI {r.ediN} · 리스트 {r.recN}
                  {r.noIso > 0 && <span className={r.flags.some(f => f.startsWith('빈규격')) ? 'text-amber-300 font-bold' : ''}> · 빈규격 {r.noIso}</span>}
                </div>
              ))}
              {h.rows.length === 0 && <div className="text-[11px] text-slate-600">자료 없음</div>}
            </div>
            {h.flags.length > 0 && (
              <div className="mt-1 text-[11px] text-amber-300 font-bold">{h.flags.join(' · ')}</div>
            )}
          </button>
        ))}
        {list.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-8">등록된 항차가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
