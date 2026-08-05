import React, { useMemo } from 'react';
import { isoToLabel, fmtPos} from '../utils.js';
import { Snowflake, AlertTriangle, Box } from 'lucide-react';

export default function StatsTab({ containers, compMap, xrayMap, mode }) {
  const stats = useMemo(() => computeAllStats(containers, compMap, xrayMap, mode), [containers, compMap, xrayMap, mode]);

  if (containers.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-500 text-sm">
        통계할 데이터 없음
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 핵심 카운터 */}
      <div className="grid grid-cols-3 gap-2">
        <SmallStat label="전체" value={stats.total} mono="text-slate-100"/>
        <SmallStat label="완료" value={stats.done} sub={`${stats.total ? Math.round(stats.done/stats.total*100) : 0}%`} mono="text-emerald-300"/>
        <SmallStat label="미완" value={stats.total - stats.done} mono="text-amber-300"/>
      </div>

      {/* V9.16: 이상 3종 + 리퍼 온도 — 신고·마감에 직결되는 숫자를 통계 맨 위에 */}
      {(stats.anomaly.missing + stats.anomaly.extra + stats.anomaly.swapped + stats.reeferTempMissing.length) > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <SmallStat label="누락" value={stats.anomaly.missing} mono={stats.anomaly.missing ? 'text-red-300' : 'text-slate-500'}/>
          <SmallStat label="초과" value={stats.anomaly.extra} mono={stats.anomaly.extra ? 'text-orange-300' : 'text-slate-500'}/>
          <SmallStat label="바뀜" value={stats.anomaly.swapped} mono={stats.anomaly.swapped ? 'text-rose-300' : 'text-slate-500'}/>
          <SmallStat label="온도 미입력" value={stats.reeferTempMissing.length} mono={stats.reeferTempMissing.length ? 'text-cyan-300' : 'text-slate-500'}/>
        </div>
      )}

      {/* V9.16: 시간대별 처리량 + 페이스 */}
      {Object.keys(stats.byHour).length > 0 && (
        <Section title={`시간대별 처리량${stats.paceHour != null ? ` — 지금 페이스 시간당 ${stats.paceHour}대` : ''}`}>
          <div className="space-y-1">
            {Object.entries(stats.byHour).slice(-12).map(([h, n]) => {
              const max = Math.max(...Object.values(stats.byHour));
              return (
                <div key={h} className="flex items-center gap-2 text-[12px]">
                  <span className="w-20 shrink-0 text-slate-400 mono">{h}</span>
                  <div className="flex-1 bg-slate-800 rounded h-4 overflow-hidden">
                    <div className="h-full bg-emerald-600/70 rounded" style={{ width: `${Math.max(4, Math.round(n / max * 100))}%` }}/>
                  </div>
                  <span className="w-9 text-right mono text-emerald-300 font-bold">{n}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* V9.16: 검수원별 완료 */}
      {Object.keys(stats.byInspector).length > 0 && (
        <Section title="검수원별 완료">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(stats.byInspector).sort((a, b) => b[1] - a[1]).map(([name, n]) => (
              <div key={name} className="flex items-center justify-between bg-slate-800/60 rounded px-2.5 py-1.5 text-[12px]">
                <span className="text-slate-300 font-bold truncate">{name}</span>
                <span className="mono text-emerald-300 font-bold">{n}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* V9.16: 항구별 (양하=선적항 POL / 선적=목적항 POD) */}
      {Object.keys(stats.byPort).length > 1 && (
        <Section title={mode === 'loading' ? '목적항(POD)별' : '선적항(POL)별'}>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(stats.byPort).sort((a, b) => b[1].total - a[1].total).map(([port, st]) => (
              <StatRow key={port} label={port} stats={st}/>
            ))}
          </div>
        </Section>
      )}

      {/* 규격별 */}
      <Section title="규격별" icon={Box}>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(stats.bySize).sort((a,b) => b[1].total - a[1].total).map(([size, s]) => (
            <StatRow key={size} label={size} stats={s}/>
          ))}
        </div>
      </Section>

      {/* F/E */}
      <Section title="F (Full) / E (Empty)">
        <div className="grid grid-cols-2 gap-2">
          {['F', 'E'].map(fe => stats.byFE[fe] && (
            <StatRow key={fe} label={fe === 'F' ? 'Full (적컨)' : 'Empty (공컨)'} stats={stats.byFE[fe]} highlight={fe === 'F' ? 'rose' : ''}/>
          ))}
        </div>
      </Section>

      {/* 특수 화물 */}
      <Section title="특수 화물 (베이플랜 기준)" icon={AlertTriangle}>
        {Object.entries(stats.bySpecial).filter(([,s]) => s.total > 0).length === 0 ? (
          <div className="text-[11px] text-slate-500 italic px-2">특수 화물 없음</div>
        ) : (
          <div className="space-y-1">
            {Object.entries(stats.bySpecial).filter(([,s]) => s.total > 0).map(([type, s]) => (
              <SpecialRow key={type} type={type} stats={s} containers={s.list}/>
            ))}
          </div>
        )}
      </Section>

      {/* 선사별 (검수업체) */}
      <Section title="검수업체별 (Operator)">
        <div className="space-y-1">
          {Object.entries(stats.byOp).sort((a,b) => b[1].total - a[1].total).map(([op, s]) => (
            <StatRow key={op} label={op} stats={s}/>
          ))}
        </div>
      </Section>

      {/* X-RAY (양하만) */}
      {mode === 'discharge' && stats.xrayTotal > 0 && (
        <Section title={`X-RAY (${stats.xrayTotal}대)`}>
          <div className="grid grid-cols-2 gap-2">
            <StatRow label="X-RAY 전체" stats={{ total: stats.xrayTotal, done: stats.xrayDone }}/>
            <StatRow label="X-RAY 미완" stats={{ total: stats.xrayTotal - stats.xrayDone, done: 0 }} highlight="purple"/>
          </div>
          {stats.xrayList.length > 0 && (
            <div className="mt-2 text-[10px] text-slate-400">
              <div className="font-bold mb-1">X-RAY 위치:</div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mono">
                {stats.xrayList.slice(0, 10).map(c => (
                  <div key={c.cn}>• <span className="text-amber-300">{fmtPos(c)}</span> <span className="text-slate-500">{c.cn?.slice(-4)}</span></div>
                ))}
                {stats.xrayList.length > 10 && <div className="text-slate-500">... 외 {stats.xrayList.length - 10}대</div>}
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="text-[11px] font-black text-slate-400 mb-2 uppercase flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3"/>}{title}
      </div>
      {children}
    </div>
  );
}

function SmallStat({ label, value, sub, mono }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-center">
      <div className="text-[10px] text-slate-500 font-bold uppercase">{label}</div>
      <div className={`text-2xl font-black mono ${mono || ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mono">{sub}</div>}
    </div>
  );
}

function StatRow({ label, stats, highlight }) {
  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  const colors = {
    rose: 'border-rose-700/30 bg-rose-950/20',
    purple: 'border-purple-700/30 bg-purple-950/20',
  };
  return (
    <div className={`px-2.5 py-1.5 rounded border border-slate-700/50 ${colors[highlight] || ''}`}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold text-slate-200 truncate mono">{label}</span>
        <span className="text-slate-500 mono">
          <span className="text-emerald-400 font-bold">{stats.done}</span>
          <span>/{stats.total}</span>
          <span className="ml-1 text-slate-600">({pct}%)</span>
        </span>
      </div>
      <div className="bg-slate-800 rounded-full h-1 mt-1 overflow-hidden">
        <div className="bg-emerald-500 h-full" style={{ width: `${pct}%` }}/>
      </div>
    </div>
  );
}

function SpecialRow({ type, stats, containers }) {
  const map = {
    rf: { label: 'RF (리퍼)', icon: <Snowflake className="w-3 h-3"/>, color: 'cyan' },
    fr: { label: 'FR (Flat Rack)', icon: '▭', color: 'orange' },
    ot: { label: 'OT (Open Top)', icon: '◧', color: 'yellow' },
    tk: { label: 'TK (Tank)', icon: '◯', color: 'pink' },
    dg: { label: 'DG (위험물)', icon: <AlertTriangle className="w-3 h-3"/>, color: 'red' },
  };
  const m = map[type];
  const colors = {
    cyan: 'border-cyan-700/30 bg-cyan-950/20',
    orange: 'border-orange-700/30 bg-orange-950/20',
    yellow: 'border-yellow-700/30 bg-yellow-950/20',
    pink: 'border-pink-700/30 bg-pink-950/20',
    red: 'border-red-700/30 bg-red-950/20',
  };
  return (
    <div className={`px-2.5 py-2 rounded border ${colors[m.color]}`}>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="font-bold text-slate-200 flex items-center gap-1">{m.icon}{m.label}</span>
        <span className="font-bold text-slate-300 mono">{stats.total}대</span>
      </div>
      {containers.length > 0 && (
        <div className="text-[10px] mono space-y-0.5">
          {containers.slice(0, 5).map(c => (
            <div key={c.cn} className="text-slate-400">
              • <span className="text-amber-300">{fmtPos(c)}</span>
              <span className="text-slate-500 ml-1">{c.cn}</span>
              {c.tmp && <span className="text-cyan-300 ml-1">{c.tmp}°C</span>}
              {c.un && <span className="text-red-300 ml-1">UN{c.un}</span>}
            </div>
          ))}
          {containers.length > 5 && <div className="text-slate-500">... 외 {containers.length - 5}대</div>}
        </div>
      )}
    </div>
  );
}

function computeAllStats(containers, compMap, xrayMap, mode) {
  const total = containers.length;
  const done = containers.filter(c => compMap[c.cn]).length;

  // 규격별
  const bySize = {};
  containers.forEach(c => {
    const lbl = isoToLabel(c.iso) || c.tp || '미분류';
    if (!bySize[lbl]) bySize[lbl] = { total: 0, done: 0 };
    bySize[lbl].total++;
    if (compMap[c.cn]) bySize[lbl].done++;
  });

  // F/E
  const byFE = { F: { total: 0, done: 0 }, E: { total: 0, done: 0 } };
  containers.forEach(c => {
    const fe = c.fe || 'F';
    if (!byFE[fe]) byFE[fe] = { total: 0, done: 0 };
    byFE[fe].total++;
    if (compMap[c.cn]) byFE[fe].done++;
  });

  // 특수 화물
  const bySpecial = {
    rf: { total: 0, done: 0, list: [] },
    fr: { total: 0, done: 0, list: [] },
    ot: { total: 0, done: 0, list: [] },
    tk: { total: 0, done: 0, list: [] },
    dg: { total: 0, done: 0, list: [] },
  };
  containers.forEach(c => {
    const isReefer = c.rf || (c.iso && c.iso[2] === 'R');
    if (isReefer) { bySpecial.rf.total++; if (compMap[c.cn]) bySpecial.rf.done++; bySpecial.rf.list.push(c); }
    if (c.fr || c.oog) { bySpecial.fr.total++; if (compMap[c.cn]) bySpecial.fr.done++; bySpecial.fr.list.push(c); }
    if (c.ot) { bySpecial.ot.total++; if (compMap[c.cn]) bySpecial.ot.done++; bySpecial.ot.list.push(c); }
    if (c.tk) { bySpecial.tk.total++; if (compMap[c.cn]) bySpecial.tk.done++; bySpecial.tk.list.push(c); }
    if (c.dg) { bySpecial.dg.total++; if (compMap[c.cn]) bySpecial.dg.done++; bySpecial.dg.list.push(c); }
  });

  // 검수업체별
  const byOp = {};
  containers.forEach(c => {
    const op = c.op || '미지정';
    if (!byOp[op]) byOp[op] = { total: 0, done: 0 };
    byOp[op].total++;
    if (compMap[c.cn]) byOp[op].done++;
  });

  // X-RAY
  const xrayList = mode === 'discharge' ? containers.filter(c => xrayMap[c.cn]) : [];
  const xrayTotal = xrayList.length;
  const xrayDone = xrayList.filter(c => compMap[c.cn]).length;

  // ── V9.16: 시간·사람·항구·이상 축 (전면 점검 §6-1 — 데이터는 있는데 통계에 없던 것들) ──
  // 시간대별 처리량 (완료 시각 1시간 버킷) + 시간당 페이스(최근 20건)
  const byHour = {};
  const doneAts = [];
  const byInspector = {};
  const anomaly = { missing: 0, extra: 0, swapped: 0 };
  containers.forEach(c => {
    const r = compMap[c.cn];
    if (!r) return;
    if (r.at) {
      doneAts.push(r.at);
      const d = new Date(r.at);
      const k = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}시`;
      byHour[k] = (byHour[k] || 0) + 1;
    }
    if (r.by) byInspector[r.by] = (byInspector[r.by] || 0) + 1;
    if (r.flag === 'missing') anomaly.missing++;
    else if (r.flag === 'extra') anomaly.extra++;
    else if (r.flag === 'swapped') anomaly.swapped++;
  });
  doneAts.sort((a, b) => a - b);
  let paceHour = null;
  if (doneAts.length >= 3) {
    const recent = doneAts.slice(-20);
    const span = recent[recent.length - 1] - recent[0];
    if (span > 0) paceHour = Math.round((recent.length - 1) / (span / 3600000));
  }

  // POD/POL별 (양하=POD, 선적=POD(목적항)) — 양하 순서·목적항 협의용
  const byPort = {};
  containers.forEach(c => {
    const port = (mode === 'loading' ? (c.pod || '') : (c.pol || '')) || '미상';
    if (!byPort[port]) byPort[port] = { total: 0, done: 0 };
    byPort[port].total++;
    if (compMap[c.cn]) byPort[port].done++;
  });

  // 리퍼 온도 미입력 (Full만 — 마감 체크리스트와 동일 판정)
  const reeferTempMissing = containers.filter(c =>
    (c.rf || (c.iso && c.iso[2] === 'R')) && !c.rfdry && !c.mkcon &&
    (c.fe === 'F' || c.fe === '' || c.fe == null) && (!c.tmp || String(c.tmp).trim() === ''));

  return { total, done, bySize, byFE, bySpecial, byOp, xrayTotal, xrayDone, xrayList,
           byHour, byInspector, anomaly, paceHour, byPort, reeferTempMissing };
}
