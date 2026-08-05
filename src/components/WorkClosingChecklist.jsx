// M5.1 G: 작업 마감 체크리스트
//   배 내리기 전 마지막 점검 — 미완 항목을 한 화면에 모아서 보여줌
//   각 항목 클릭 시 모달 닫고 해당 탭/필터로 점프 (onJump 콜백)
//   모두 0이면 큰 ✅ 화면 (마감 가능)
import React, { useMemo } from 'react';
import { X, AlertTriangle, CheckCircle2, ChevronRight, Snowflake, Camera, Shield, MoveRight, Hash } from 'lucide-react';
import { isReeferContainer, isISO403, isISO403PhotoTaken, isPyeongtaekPort } from '../utils.js';

export default function WorkClosingChecklist({ open, voyage, mode, onClose, onJump }) {
  const items = useMemo(() => {
    if (!voyage) return [];
    const sec = voyage[mode] || {};
    const ediMap = sec.ediContainers || {};
    const recMap = sec.records || {};
    const compMap = sec.completed || {};
    const xrayMap = sec.xrayList || {};
    const xraySeals = sec.xraySeals || {};

    const allCnSet = new Set([...Object.keys(ediMap), ...Object.keys(recMap)]);
    const containers = [...allCnSet].map(cn => {
      const e = ediMap[cn] || {};
      const r = recMap[cn] || {};
      // V8.20-01 fix: POL/POD는 EDI가 단일 진실(7.1). 리스트 POL이 EDI 평택 POL을 덮어
      //   isPyeongtaekPort 탈락 → 마감점검 total이 354 대신 265로 적게 나오던 버그(현황요약과 동일).
      const rEnrich = Object.fromEntries(
        Object.entries(r).filter(([k, vv]) => vv !== '' && vv != null && k !== 'pol' && k !== 'pod')
      );
      const merged = { ...e, ...rEnrich, cn };
      if (!merged.pol && r.pol) merged.pol = r.pol;
      if (!merged.pod && r.pod) merged.pod = r.pod;
      return merged;
    }).filter(c => mode === 'discharge' ? isPyeongtaekPort(c.pod) : isPyeongtaekPort(c.pol));   // V7.93-02: 평택분만 (7.1)

    const total = containers.length;
    const undone = containers.filter(c => !compMap[c.cn]);

    // 리퍼 온도 미입력 (Full만 — 엠티는 정상 가능)
    const reefers = containers.filter(isReeferContainer);
    const reeferTempMissing = reefers.filter(c =>
      !c.rfdry && !c.mkcon && (c.fe === 'F' || c.fe === '' || c.fe == null) && (!c.tmp || String(c.tmp).trim() === '')
    );

    // ISO403 사진 미촬영
    const iso403Pending = containers.filter(c => isISO403(c) && !isISO403PhotoTaken(c));

    // X-RAY 미처리 (양하 모드만)
    const xrayPending = mode === 'discharge'
      ? Object.keys(xrayMap).filter(cn => !xraySeals[cn]?.seal)
      : [];

    // V9.24: 자리 중복 (STSE 2658W 사고 — 두 컨이 같은 자리, 절대 있어선 안 됨)
    const _p2d = (x) => String(x ?? '').replace(/\D/g, '').padStart(2, '0').slice(-2);
    const _posCnt = new Map();
    containers.forEach(c => {
      if (String(c.bay_actual || '').startsWith('__')) return;
      const hasA = c.bay_actual !== undefined && c.bay_actual !== '' && c.bay_actual !== null;
      const b = hasA ? c.bay_actual : c.bay, r = hasA ? c.row_actual : c.row, t = hasA ? c.tier_actual : c.tier;
      if (!b || !t) return;
      const k = `${_p2d(b)}-${_p2d(r)}-${_p2d(t)}`;
      if (k.startsWith('00-')) return;
      if (!_posCnt.has(k)) _posCnt.set(k, []);
      _posCnt.get(k).push(c.cn);
    });
    const dupPos = [..._posCnt.entries()].filter(([, v]) => v.length > 1);

    // 자리 뺏긴 컨 (선적 모드만)
    let displaced = [];
    if (mode === 'loading') {
      const occupiedBy = new Map();
      containers.forEach(c => {
        if (c.bay_actual) {
          occupiedBy.set(`${c.bay_actual}-${c.row_actual}-${c.tier_actual}`, c.cn);
        }
      });
      displaced = containers.filter(c => {
        if (c.bay_actual) return false;
        const k = `${c.bay || ''}-${c.row || ''}-${c.tier || ''}`;
        const occ = occupiedBy.get(k);
        return occ && occ !== c.cn;
      });
    }

    // 실 미입력 (선적 — 풀씰)
    const sealMissingFull = mode === 'loading'
      ? containers.filter(c => c.fe === 'F' && !c.sl)
      : [];

    return [
      {
        id: 'undone',
        icon: Hash,
        label: '미완료 컨',
        count: undone.length,
        desc: `${total}대 중 ${undone.length}대 양/선적확인 안 됨`,
        color: undone.length > 0 ? 'amber' : 'emerald',
        jumpTo: { tab: 'list', filter: 'undone' },
      },
      {
        id: 'reefer',
        icon: Snowflake,
        label: '리퍼 온도 미입력 (Full)',
        count: reeferTempMissing.length,
        desc: reefers.length > 0
          ? `리퍼 ${reefers.length}대 중 ${reeferTempMissing.length}대 온도 X`
          : '리퍼 없음',
        color: reeferTempMissing.length > 0 ? 'red' : 'emerald',
        jumpTo: { tab: 'list', filter: 'reeferTemp' },   // V9.14: search는 컨번호 검색이라 '리퍼'가 안 걸렸다 — 전용 필터로
      },
      {
        id: 'iso403',
        icon: Camera,
        label: '풀 리퍼 사진 미촬영',
        count: iso403Pending.length,
        desc: iso403Pending.length > 0
          ? `의무 대상 중 ${iso403Pending.length}대 사진 X`
          : '모두 촬영 완료',
        color: iso403Pending.length > 0 ? 'blue' : 'emerald',
        jumpTo: { tab: 'bay' },  // 베이 탭의 ISO403 패널로
      },
      ...(mode === 'discharge' ? [{
        id: 'xray',
        icon: Shield,
        label: 'X-RAY 미처리',
        count: xrayPending.length,
        desc: Object.keys(xrayMap).length > 0
          ? `${Object.keys(xrayMap).length}대 중 ${xrayPending.length}대 처리 X`
          : 'X-RAY 없음',
        color: xrayPending.length > 0 ? 'purple' : 'emerald',
        jumpTo: { tab: 'list', filter: 'xray' },
      }] : []),
      ...(dupPos.length > 0 ? [{
        id: 'dupPos',
        icon: AlertTriangle,
        label: '🔴 자리 중복 — 즉시 정리',
        count: dupPos.length,
        desc: dupPos.slice(0, 3).map(([k, v]) => `${k.replace(/-/g, '/')}: ${v.join(' · ')}`).join('  |  ') + (dupPos.length > 3 ? ` 외 ${dupPos.length - 3}곳` : ''),
        color: 'red',
        jumpTo: { tab: 'bay' },
      }] : []),
      ...(mode === 'loading' ? [
        {
          id: 'displaced',
          icon: MoveRight,
          label: '자리 뺏긴 컨 미해결',
          count: displaced.length,
          desc: displaced.length > 0
            ? `${displaced.length}대 — 새 위치 결정 필요`
            : '없음',
          color: displaced.length > 0 ? 'orange' : 'emerald',
          jumpTo: { tab: 'bay' },
        },
        {
          id: 'sealMissing',
          icon: Shield,
          label: '풀씰 미입력',
          count: sealMissingFull.length,
          desc: sealMissingFull.length > 0
            ? `Full ${sealMissingFull.length}대 실번호 X`
            : '모두 입력됨',
          color: sealMissingFull.length > 0 ? 'amber' : 'emerald',
          jumpTo: { tab: 'list', filter: 'undone' },
        },
      ] : []),
    ];
  }, [voyage, mode]);

  if (!open) return null;

  const pending = items.filter(it => it.count > 0);
  const allClear = pending.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-950">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏁</span>
            <div>
              <div className="text-lg font-black text-amber-300">작업 마감 점검</div>
              <div className="text-[11px] text-slate-400">
                {mode === 'discharge' ? '양하' : '선적'} · 배 내리기 전 마지막 점검
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg">
            <X className="w-5 h-5 text-slate-300"/>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {allClear ? (
            <div className="bg-emerald-900/30 border-2 border-emerald-600 rounded-xl p-8 text-center">
              <div className="text-7xl mb-3">✅</div>
              <div className="text-2xl font-black text-emerald-200 mb-2">마감 가능</div>
              <div className="text-sm text-emerald-300/80 leading-relaxed">
                모든 점검 항목이 완료되었습니다.<br/>
                안전하게 작업을 마무리하세요.
              </div>
            </div>
          ) : (
            <>
              <div className="bg-amber-950/40 border border-amber-700/40 rounded-lg p-3 flex items-start gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5"/>
                <div className="text-sm text-amber-100 font-bold">
                  {pending.length}개 항목 미해결 — 항목을 누르면 해당 화면으로 이동합니다.
                </div>
              </div>
              {items.map(it => (
                <ChecklistItem key={it.id} item={it} onJump={onJump} onClose={onClose}/>
              ))}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-4 py-2 border-t border-slate-700 bg-slate-950 text-[10px] text-slate-500 text-center">
          M5.1 · 검수 종료 전 최종 점검용 — 항목별 카운트는 실시간 갱신됩니다
        </div>
      </div>
    </div>
  );
}

function ChecklistItem({ item, onJump, onClose }) {
  const Icon = item.icon;
  const colorMap = {
    emerald: { bg: 'bg-emerald-950/30', border: 'border-emerald-700/40', text: 'text-emerald-200', count: 'text-emerald-300' },
    amber:   { bg: 'bg-amber-950/40',   border: 'border-amber-700/50',   text: 'text-amber-200',   count: 'text-amber-300' },
    red:     { bg: 'bg-red-950/40',     border: 'border-red-700/50',     text: 'text-red-200',     count: 'text-red-300' },
    blue:    { bg: 'bg-blue-950/40',    border: 'border-blue-700/50',    text: 'text-blue-200',    count: 'text-blue-300' },
    purple:  { bg: 'bg-purple-950/40',  border: 'border-purple-700/50',  text: 'text-purple-200',  count: 'text-purple-300' },
    orange:  { bg: 'bg-orange-950/40',  border: 'border-orange-700/50',  text: 'text-orange-200',  count: 'text-orange-300' },
  };
  const c = colorMap[item.color] || colorMap.amber;
  const clickable = item.count > 0;

  const handleClick = () => {
    if (!clickable) return;
    onJump?.(item.jumpTo);
    onClose?.();
  };

  return (
    <button
      onClick={handleClick}
      disabled={!clickable}
      className={`w-full text-left ${c.bg} border-2 ${c.border} rounded-xl p-3 flex items-center gap-3 transition ${
        clickable ? 'hover:brightness-125 active:scale-[0.98] cursor-pointer' : 'opacity-60 cursor-default'
      }`}
    >
      <div className={`w-10 h-10 rounded-full bg-slate-900/60 flex items-center justify-center flex-shrink-0 ${c.text}`}>
        {item.count === 0 ? <CheckCircle2 className="w-6 h-6"/> : <Icon className="w-5 h-5"/>}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-black text-sm ${c.text}`}>{item.label}</div>
        <div className="text-[11px] text-slate-400 leading-tight mt-0.5">{item.desc}</div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className={`text-2xl font-black mono ${c.count}`}>{item.count}</span>
        {clickable && <ChevronRight className={`w-5 h-5 ${c.text} opacity-60`}/>}
      </div>
    </button>
  );
}
