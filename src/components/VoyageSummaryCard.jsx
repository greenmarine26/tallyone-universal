// M5.0: 항차 요약 카드
//   진입 시 즉시 상황 파악 가능 — 통계 탭 가지 않아도 보임
//   표시: 모드별 진행률 / 리퍼·X-RAY·ISO403·자리뺏긴 등 주의 항목
//   각 항목은 클릭 시 해당 탭/필터로 점프 (옵션 — 일단 V1은 표시만)
import React, { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Snowflake, Shield, Camera, MoveRight } from 'lucide-react';
import { isReeferContainer, isISO403, isISO403PhotoTaken, isPyeongtaekPort } from '../utils.js';

export default function VoyageSummaryCard({ voyage, mode }) {
  const summary = useMemo(() => {
    const sec = voyage?.[mode] || {};
    const ediMap = sec.ediContainers || {};
    const recMap = sec.records || {};
    const compMap = sec.completed || {};
    const xrayMap = sec.xrayList || {};

    // 머지 로직 (VoyagePage와 동일)
    const allCnSet = new Set([...Object.keys(ediMap), ...Object.keys(recMap)]);
    // V7.93-02: 평택분만 (7.1 — 양하=POD평택, 선적=POL평택). 현황 요약이 EDI 전체(통과화물 포함)를
    //   세어 목록(403)과 헤더(909)가 다르던 버그 (사용자 스크린샷 제보).
    const containers = [...allCnSet].map(cn => {
      const e = ediMap[cn] || {};
      const r = recMap[cn] || {};
      // V8.20-01 fix: 리스트(records)는 실번호/무게 등 보강만. POL/POD(항구)는 EDI가 단일 진실(7.1).
      //   리스트 POL이 EDI 평택 POL을 덮어 isPyeongtaekPort에서 탈락 → 현황요약 분모가 354 대신 265로 적게 나오던 버그.
      const rEnrich = Object.fromEntries(
        Object.entries(r).filter(([k, vv]) => vv !== '' && vv != null && k !== 'pol' && k !== 'pod')
      );
      const merged = { ...e, ...rEnrich, cn };
      if (!merged.pol && r.pol) merged.pol = r.pol;   // EDI에 POL 없을 때만 리스트 보강
      if (!merged.pod && r.pod) merged.pod = r.pod;
      return merged;
    }).filter(c => {
      if (mode === 'discharge') return isPyeongtaekPort(c.pod);
      // V8.86: 선적 — 리스트 등록 = 평택(별첨·베이와 동일 원칙, M6.94.34). NOLIST류 pol 공란 누락 방지.
      if (recMap[c.cn]) return true;
      return isPyeongtaekPort(c.pol);
    });

    // V8.86: 컨번호 없는 EDI '실제 자리'(터미널 PRE)는 항차수(분모)의 기준 — 자리수와 실컨수 중 큰 쪽.
    //   (자리는 배열 인덱스 키라 위 컨번호 병합에서 각각 세어지지만, 실컨과 이중계산되지 않게 분모를 재정의)
    const _slotN = Object.values(ediMap).filter(c => c && !c.cn &&
      (mode === 'discharge' ? isPyeongtaekPort(c.pod) : isPyeongtaekPort(c.pol))).length;
    const _realN = Math.max(containers.length - _slotN, 0);   // 자리 제외한 실컨(리스트) 수
    const total = _slotN > 0 ? Math.max(_slotN, _realN) : containers.length;
    const done = Object.keys(compMap).length;
    const reefers = containers.filter(isReeferContainer);
    const reeferTempMissing = reefers.filter(c =>
      !c.rfdry && !c.mkcon && (c.fe === 'F' || c.fe === '' || c.fe == null) && (!c.tmp || String(c.tmp).trim() === '')
    );
    // V7.94-03: X-RAY 카운트 기준 통일 (사용자 제보 — 상단 0/3 vs 리스트 2 불일치)
    //   원인: 여기는 xrayList 원본 키 전부, 리스트(ListTab stats.xray)는 현재 컨테이너와 매칭분만.
    //   매칭 안 되는 키(오타/다른 항차 잔존)는 숨기지 않고 ⚠미매칭으로 드러냄 — 검사 누락 방지.
    const cnSet = new Set(containers.map(c => c.cn));
    const xrayKeys = mode === 'discharge' ? Object.keys(xrayMap) : [];
    const xrayCount = xrayKeys.filter(cn => cnSet.has(cn)).length;
    const xrayUnmatched = xrayKeys.filter(cn => !cnSet.has(cn));
    const xraySealed = mode === 'discharge'
      ? Object.entries(sec.xraySeals || {}).filter(([cn, v]) => v?.seal && cnSet.has(cn)).length
      : 0;
    const iso403Targets = containers.filter(isISO403);
    const iso403Pending = iso403Targets.filter(c => !isISO403PhotoTaken(c));

    // V9.24: 자리 중복 검출 (STSE 2658W 사고 — 두 컨이 같은 자리) — 실체 우선 유효 위치 기준
    const _p2d = (x) => String(x ?? '').replace(/\D/g, '').padStart(2, '0').slice(-2);
    const _posCnt = new Map();
    containers.forEach(c => {
      if (String(c.bay_actual || '').startsWith('__')) return;   // 임시창고 제외
      const hasA = c.bay_actual !== undefined && c.bay_actual !== '' && c.bay_actual !== null;
      const b = hasA ? c.bay_actual : c.bay, r = hasA ? c.row_actual : c.row, t = hasA ? c.tier_actual : c.tier;
      if (!b || !t) return;
      const k = `${_p2d(b)}-${_p2d(r)}-${_p2d(t)}`;
      if (k.startsWith('00-')) return;
      if (!_posCnt.has(k)) _posCnt.set(k, []);
      _posCnt.get(k).push(c.cn);
    });
    const dupPos = [..._posCnt.entries()].filter(([, v]) => v.length > 1);

    // M4.9e: 자리 뺏긴 검출 (선적 모드만, VoyagePage와 동일 로직)
    let displaced = 0;
    if (mode === 'loading') {
      const occupiedBy = new Map();
      containers.forEach(c => {
        if ((c.bay_actual || c.row_actual || c.tier_actual) && c.bay_actual) {
          occupiedBy.set(`${c.bay_actual}-${c.row_actual}-${c.tier_actual}`, c.cn);
        }
      });
      containers.forEach(c => {
        if (c.bay_actual) return;
        const k = `${c.bay || ''}-${c.row || ''}-${c.tier || ''}`;
        const occ = occupiedBy.get(k);
        if (occ && occ !== c.cn) displaced++;
      });
    }

    return {
      total, done,
      pct: total ? Math.round(done / total * 100) : 0,
      reeferTotal: reefers.length,
      reeferTempMissing: reeferTempMissing.length,
      reeferDry: reefers.filter(c => c.rfdry).length,   // V9.20-03: 리퍼드라이(넌플러그)
      // V9.28-08: EDI에 위치가 없는 리퍼 (TMPZ 2023E 실측 — 선사 EDI가 리퍼 6대 누락, 냉동리스트에만 존재.
      //   카고플랜에 못 그리는 건 어쩔 수 없지만 숨기면 안 된다 — 검수원이 위치 미상임을 알아야 현장에서 찾는다)
      reeferNoPos: reefers.filter(c => !c.bay && !c.bay_actual).length,
      madeCon: containers.filter(c => c.mkcon).length,  // V9.23: 제작컨테이너(컨 자체가 상품)
      xrayCount, xraySealed, xrayUnmatched,
      iso403Total: iso403Targets.length,
      iso403Pending: iso403Pending.length,
      displaced,
      dupPos,   // V9.24: [[자리키, [cn,...]], ...]
    };
  }, [voyage, mode]);

  if (summary.total === 0) return null;

  const modeLabel = mode === 'discharge' ? '양하' : '선적';
  const modeColor = mode === 'discharge' ? 'blue' : 'amber';

  return (
    <div className={`mb-3 rounded-xl border-2 overflow-hidden ${
      mode === 'discharge' ? 'border-blue-700/50 bg-blue-950/30' : 'border-amber-700/50 bg-amber-950/30'
    }`}>
      {/* 진행률 바 */}
      <div className={`px-4 py-3 ${mode === 'discharge' ? 'bg-blue-900/30' : 'bg-amber-900/30'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-5 h-5 ${mode === 'discharge' ? 'text-blue-300' : 'text-amber-300'}`}/>
            <span className={`font-black text-lg ${mode === 'discharge' ? 'text-blue-100' : 'text-amber-100'}`}>
              {modeLabel} {summary.done}/{summary.total}
            </span>
            <span className={`text-sm font-bold ${mode === 'discharge' ? 'text-blue-300' : 'text-amber-300'}`}>
              ({summary.pct}%)
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold uppercase">현황 요약</span>
        </div>
        <div className="h-2 bg-slate-900/60 rounded-full overflow-hidden">
          <div className={`h-full transition-all ${
            summary.pct === 100 ? 'bg-emerald-500' : (mode === 'discharge' ? 'bg-blue-500' : 'bg-amber-500')
          }`}
            style={{ width: `${summary.pct}%` }}/>
        </div>
      </div>

      {/* 주의 항목 칩 — 0이면 숨김 */}
      <div className="px-3 py-2 flex flex-wrap gap-1.5">
        {summary.reeferTotal > 0 && (
          <Chip
            icon={Snowflake}
            color={summary.reeferTempMissing > 0 || summary.reeferNoPos > 0 ? 'red' : 'cyan'}
            label="리퍼"
            value={`${summary.reeferTotal}대${summary.reeferDry > 0 ? ` · 🔌드라이${summary.reeferDry}` : ''}${summary.madeCon > 0 ? ` · 🏭제작컨${summary.madeCon}` : ''}${summary.reeferNoPos > 0 ? ` · 📍위치미상${summary.reeferNoPos}` : ''}${summary.reeferTempMissing > 0 ? ` · ⚠${summary.reeferTempMissing} 온도X` : ''}`}
          />
        )}
        {(summary.xrayCount > 0 || summary.xrayUnmatched?.length > 0) && (
          <Chip
            icon={Shield}
            color={summary.xrayUnmatched?.length > 0 ? 'red' : 'purple'}
            label="X-RAY"
            value={`${summary.xraySealed}/${summary.xrayCount}${summary.xrayUnmatched?.length > 0 ? ` · ⚠${summary.xrayUnmatched.length} 미매칭` : ''}`}
          />
        )}
        {summary.iso403Total > 0 && (
          <Chip
            icon={Camera}
            color={summary.iso403Pending > 0 ? 'blue' : 'emerald'}
            label="풀 리퍼 사진"
            value={`${summary.iso403Total - summary.iso403Pending}/${summary.iso403Total}${summary.iso403Pending > 0 ? ` · ⚠${summary.iso403Pending}` : ''}`}
          />
        )}
        {summary.dupPos?.length > 0 && (
          <Chip
            icon={AlertTriangle}
            color="red"
            label="🔴 자리 중복"
            value={`${summary.dupPos.length}곳 — ${summary.dupPos.slice(0, 2).map(([k, v]) => `${k.replace(/-/g, '/')} ${v.join('·')}`).join(', ')}${summary.dupPos.length > 2 ? ' 외' : ''}`}
          />
        )}
        {mode === 'loading' && summary.displaced > 0 && (
          <Chip
            icon={MoveRight}
            color="orange"
            label="자리 뺏김"
            value={`${summary.displaced}대`}
          />
        )}
        {summary.reeferTotal === 0 && summary.xrayCount === 0 && summary.iso403Total === 0 && summary.displaced === 0 && (
          <span className="text-[11px] text-slate-500 px-2 py-1">특이 항목 없음</span>
        )}
      </div>
    </div>
  );
}

function Chip({ icon: Icon, color, label, value }) {
  const colorMap = {
    cyan:    'bg-cyan-900/40 border-cyan-700/40 text-cyan-200',
    red:     'bg-red-900/40 border-red-700/50 text-red-200 animate-pulse',
    purple:  'bg-purple-900/40 border-purple-700/40 text-purple-200',
    blue:    'bg-blue-900/40 border-blue-700/40 text-blue-200',
    emerald: 'bg-emerald-900/40 border-emerald-700/40 text-emerald-200',
    orange:  'bg-orange-900/40 border-orange-700/50 text-orange-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-bold ${colorMap[color] || colorMap.cyan}`}>
      <Icon className="w-3 h-3"/>
      <span className="text-slate-300/80">{label}</span>
      <span className="mono">{value}</span>
    </span>
  );
}
