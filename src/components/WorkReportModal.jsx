// 작업 보고 모달 (M3.5.6)
// 흐름: 작업 시작 → 장비+작업종류 선택 → 카톡 발송
//       이후 중단/완료/해치/콘박스는 활성 장비 자동 사용
import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, X, Play, Pause, CheckCircle2, Lock, Unlock, Box, Send, Truck, RefreshCw } from 'lucide-react';
import {
  shareText,
  buildWorkStatusMessage,
  buildHatchMessage,
  buildConBoxMessage,
} from '../kakaoShare.js';
import { fbAddWorkReport, fbUpdateVoyageInfo } from '../firebase.js';
// TallyOne 1.8-09: 수동 해치 보고도 자동 유도와 **같은** 그룹 계산·같은 표시를 쓰게 한다.
import { bayGroupCenter } from '../swapGrade.js';
import { getBayPairs } from '../twin.js';
import { getPierFromBerth, equipNumbersForPier, reportShiftToShow, buildShiftReport, isPyeongtaekPort } from '../utils.js';
import { ref, set, get, onValue } from 'firebase/database';  // V9.57(I9): off 미사용 — 광역 해제 제거
import { db } from '../firebase.js';
import ConfirmModal, { useConfirm } from './ConfirmModal.jsx';

// 활성 작업 Firebase 경로: /activeWork/{voyageKey}/{equipNo} = { mode, startedAt, ... }

export default function WorkReportModal({ open, voyageKey, voyage, onClose, lastEquip }) {
  // M5.79: view에 'manual' 추가 — 시작 안 눌러도 중단/재개/완료 직접 보고
  //  사유: (1) 전 작업을 이어받을 때 (다른 검수원이 시작한 작업) (2) 한 갱 먼저 작업 완료
  const [view, setView] = useState('main');  // main | start | pause | hatch | conbox | external | manual | daynight
  // V8.10: 현재 항차 부두 기준 장비 목록(PCTC 1~4 / PNCT 1~5). 항차 없으면 1~5 전체.
  const equipNumbers = equipNumbersForPier(getPierFromBerth(voyage?.info?.berth || ''));
  // V8.10: 해치 제외 4척(TMPZ·TNJP·RZOR·OBWH)은 해치커버 대신 주야간 작업갯수를 작업보고로 기록한다.
  const isHatchSkipShip = /TMPZ|TNJP|RZOR|OBWH/i.test(`${voyage?.info?.vsl || ''} ${voyage?.info?.vslFull || ''}`);
  // V8.10: 주야간 보고 — 진입 시 시각 자동 판정(reportShiftToShow), 토글로 수동 전환.
  const [dnShift, setDnShift] = useState(null);   // null이면 자동, '주간'|'야간'이면 수동 고정

  // V8.10: 해치 제외 4척 주야간 집계용 — 양하·선적 양쪽 평택분 컨을 모달 안에서 직접 조립.
  //   집계는 작업 모드(가이드/수동)와 무관하게 Firebase 완료 레코드(completed/{cn}={by,at})가 근거.
  //   호출부(VoyagePage)는 건드리지 않는다 — voyage prop만으로 조립(외과적 변경 유지).
  const dnContainers = useMemo(() => {
    if (!isHatchSkipShip) return { discharge: [], loading: [] };
    const buildMode = (m) => {
      const sec = voyage?.[m] || {};
      const edi = sec.ediContainers || {};
      const recs = sec.records || {};
      const comp = sec.completed || {};
      const cns = new Set([...Object.keys(edi), ...Object.keys(recs)]);
      const out = [];
      for (const cn of cns) {
        const e = edi[cn] || {};
        const r = recs[cn] || {};
        const c = { ...e, ...r, cn, _comp: comp[cn] || null };
        // 평택분만: 양하=POD 평택, 선적=POL 평택.
        const ptk = m === 'discharge' ? isPyeongtaekPort(c.pod) : isPyeongtaekPort(c.pol);
        if (ptk) out.push(c);
      }
      return out;
    };
    return { discharge: buildMode('discharge'), loading: buildMode('loading') };
  }, [voyage, isHatchSkipShip]);

  // 현재 보여줄 시프트(자동 또는 수동 고정) + 양하/선적 보고서.
  const dnActiveShift = dnShift || reportShiftToShow(Date.now());
  const dnReportD = useMemo(() => buildShiftReport(dnContainers.discharge, dnActiveShift, Date.now()), [dnContainers, dnActiveShift]);
  const dnReportL = useMemo(() => buildShiftReport(dnContainers.loading, dnActiveShift, Date.now()), [dnContainers, dnActiveShift]);
  const [activeWork, setActiveWork] = useState({});  // {1호기: {mode, started, paused, reason}, ...}
  // 시작 화면
  const [selectedEquip, setSelectedEquip] = useState(lastEquip || '1호기');
  const [selectedMode, setSelectedMode] = useState('discharge');  // 'discharge' | 'loading'
  // 중단 사유
  const [pauseReason, setPauseReason] = useState('');
  const [externalReason, setExternalReason] = useState('');
  const [externalDetail, setExternalDetail] = useState('');
  const [pauseTarget, setPauseTarget] = useState({ equip: '', mode: '' });
  // M5.79 수동 보고용
  const [manualEquip, setManualEquip] = useState(lastEquip || '1호기');
  const [manualMode, setManualMode] = useState('discharge');
  const [manualAction, setManualAction] = useState('');   // 'pause' | 'resume' | 'done'
  const [manualReason, setManualReason] = useState('');
  // 해치
  const [hatchAction, setHatchAction] = useState('open');
  const [bayInput, setBayInput] = useState('');
  const [hatchEquip, setHatchEquip] = useState('');
  const [hatchPanels, setHatchPanels] = useState(1);  // V8.31: 해치커버 장수 수동 선택(1~3장) — 자동계산 제거
  // 콘박스
  const [conBoxType, setConBoxType] = useState('20');
  const [conBoxCount, setConBoxCount] = useState(1);
  const [conBoxEquip, setConBoxEquip] = useState('');

  // M3.74: confirm() → ConfirmModal
  const [confirmState, askConfirm] = useConfirm();

  // Firebase에서 활성 작업 구독
  useEffect(() => {
    if (!voyageKey) return;
    const r = ref(db, `activeWork/${voyageKey}`);
    const unsub = onValue(r, (snap) => {
      setActiveWork(snap.val() || {});
    });
    // V9.57(I9): off(r)는 해당 ref의 리스너를 전부 떼어내 다른 구독자까지 끊는다 — 반환된 unsub만 해제
    return () => unsub();
  }, [voyageKey]);

  if (!open) return null;

  // TallyOne 1.8-09: 해치 그룹 계산용 베이 짝 사전 — GuidedWorkPanel(150행)과 같은 소스.
  //   양하·선적 컨을 모두 넣어야 짝이 온전하다(한쪽만 보면 홀수 베이 짝을 못 찾는다).
  const bayPairsForHatch = useMemo(() => {
    const all = [];
    for (const m of ['discharge', 'loading']) {
      const sec = voyage?.[m] || {};
      for (const c of Object.values(sec.ediContainers || {})) if (c) all.push(c);
    }
    return getBayPairs(all, voyage?.info?.imo || '', voyage?.info?.vsl || '');
  }, [voyage]);

  const vsl = voyage?.info?.vsl || '';
  // V9.57(I9): 미사용 shipImo 제거
  // M6.37: mode 기반 voy 선택 — 양하 보고는 voy_d (양하 항차), 선적 보고는 voy_l (선적 항차)
  //   예: XTPG 양하 0523E, 선적 0523W → 양하 보고에 0523E, 선적 보고에 0523W
  //   각 핸들러 진입 시 자신의 mode로 voy를 shadowing해서 정확한 항차 전달
  const getVoy = (m) => {
    if (m === 'discharge') return voyage?.info?.voy_d || voyage?.info?.voy || '';
    if (m === 'loading')   return voyage?.info?.voy_l || voyage?.info?.voy || '';
    return voyage?.info?.voy_d || voyage?.info?.voy_l || voyage?.info?.voy || '';
  };
  const voy = getVoy(selectedMode);  // 기본 fallback (UI 표시용) — 현재 선택 모드 항차

  // 활성 작업: [equipNo, mode, awData] 배열로 평탄화
  const activeWorkList = [];
  Object.entries(activeWork || {}).forEach(([equip, modes]) => {
    if (!modes || typeof modes !== 'object') return;
    Object.entries(modes).forEach(([mode, data]) => {
      if (data && (data.status === 'running' || data.status === 'paused')) {
        activeWorkList.push({ equip, mode, ...data });
      }
    });
  });
  // 장비별로 그룹화
  const activeByEquip = {};
  activeWorkList.forEach(w => {
    if (!activeByEquip[w.equip]) activeByEquip[w.equip] = [];
    activeByEquip[w.equip].push(w);
  });

  const handleStartWork = async () => {
    if (!selectedEquip) { alert('장비를 선택하세요'); return; }
    const voy = getVoy(selectedMode);  // M6.37: mode 기반 voy
    const time = Date.now();
    const action = `${selectedMode}_start`;
    const message = buildWorkStatusMessage({
      vsl, voy, action, time, equip: selectedEquip,
    });

    // M3.5.6-fix: mode별로 별도 저장 (장비 1대가 양하+선적 동시 가능)
    await set(ref(db, `activeWork/${voyageKey}/${selectedEquip}/${selectedMode}`), {
      mode: selectedMode,
      status: 'running',
      startedAt: time,
      vsl, voy,
    });

    // 보고 이력 저장
    await fbAddWorkReport(voyageKey, {
      type: 'work_status',
      action,
      mode: selectedMode,
      equip: selectedEquip,
      message,
    });

    await shareText(message, '검수 보고');
    setView('main');
    onClose();
  };

  const handlePause = async (equipNo, modeArg) => {
    if (!pauseReason.trim()) { alert('중단 사유를 입력하세요'); return; }
    const voy = getVoy(modeArg);  // M6.37
    const time = Date.now();
    // M5.79: aw 없으면(시작 기록 없음) 폴백 객체로 진행 — 이어받기/수동 보고 케이스
    const aw = activeWork[equipNo]?.[modeArg] || { mode: modeArg, vsl, voy };
    const action = `${modeArg}_pause`;
    const message = buildWorkStatusMessage({
      vsl, voy, action, time, reason: pauseReason, equip: equipNo,
    });

    await set(ref(db, `activeWork/${voyageKey}/${equipNo}/${modeArg}`), {
      ...aw,
      status: 'paused',
      pausedAt: time,
      pauseReason,
    });

    await fbAddWorkReport(voyageKey, {
      type: 'work_status',
      action,
      mode: modeArg,
      equip: equipNo,
      reason: pauseReason,
      message,
    });

    await shareText(message, '검수 보고');
    setPauseReason('');
    setView('main');
    onClose();
  };

  // M5.76: 외부 요인 작업 중단 (작업 시작 안 한 상태에서도 보고 가능)
  const handleExternalPause = async () => {
    const reason = externalReason === '기타' ? externalDetail.trim() : externalReason;
    if (!reason) return;
    const time = Date.now();
    const timeStr = new Date(time).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const message = `[작업 중단 보고]\n선박: ${vsl}\n항차: ${voy}\n시간: ${timeStr}\n사유: ${reason}`;
    await fbAddWorkReport(voyageKey, {
      type: 'external_pause',
      reason,
      message,
    });
    await shareText(message, '검수 보고');
    setExternalReason('');
    setExternalDetail('');
    setView('main');
    onClose();
  };

  const handleResume = async (equipNo, modeArg) => {
    const voy = getVoy(modeArg);  // M6.37
    const time = Date.now();
    // M5.79: aw 없으면 폴백 (이어받기 시 시작 기록 부재 가능)
    const aw = activeWork[equipNo]?.[modeArg] || { mode: modeArg, vsl, voy };
    const action = `${modeArg}_start`;
    const message = buildWorkStatusMessage({
      vsl, voy, action, time, equip: equipNo,
    }) + '\n(재개)';

    await set(ref(db, `activeWork/${voyageKey}/${equipNo}/${modeArg}`), {
      ...aw,
      status: 'running',
      resumedAt: time,
      pauseReason: null,
    });

    await fbAddWorkReport(voyageKey, {
      type: 'work_status',
      action: `${modeArg}_resume`,
      mode: modeArg,
      equip: equipNo,
      message,
    });

    await shareText(message, '검수 보고');
    onClose();
  };

  const handleDone = async (equipNo, modeArg) => {
    const modeLabel = modeArg === 'discharge' ? '양하' : '선적';
    // M5.79: aw 없어도 완료 보고 가능 — 한 갱 먼저 작업 끝났을 때 시작 기록 없는 케이스
    const aw = activeWork[equipNo]?.[modeArg] || null;
    askConfirm({
      title: '작업 완료 보고',
      message: `${equipNo} ${modeLabel}\n완료 보고하시겠습니까?${aw ? '' : '\n(시작 기록 없이 수동 완료)'}`,
      confirmLabel: '완료 보고',
      cancelLabel: '취소',
      onConfirm: async () => {
        const voy = getVoy(modeArg);  // M6.37
        const time = Date.now();
        const action = `${modeArg}_done`;
        const message = buildWorkStatusMessage({
          vsl, voy, action, time, equip: equipNo,
        });

        // mode별로 활성 작업 종료 (이미 없는 경우도 null 세팅으로 안전)
        await set(ref(db, `activeWork/${voyageKey}/${equipNo}/${modeArg}`), null);

        await fbAddWorkReport(voyageKey, {
          type: 'work_status',
          action,
          mode: modeArg,
          equip: equipNo,
          message,
          ...(aw ? {} : { manual: true }),   // M5.79: 수동 완료 마커
        });

        await shareText(message, '검수 보고');
        onClose();
      },
    });
  };

  // V7.94-16: 항차 오표시 수정 — (구) activeByEquip[equip][0].mode 고정: 활성 작업이 없거나
  //   한 장비에 양하+선적 동시 활성이면 엉뚱한 항차(특히 voy_d 폴백 → 선적인데 양하 항차)로 발송.
  //   (신) 장비의 활성 모드가 정확히 1개면 그것, 아니면 화면에서 선택된 모드(selectedMode)를 사용.
  const equipModeOf = (eq) => {
    const ms = activeByEquip[eq];
    if (ms && ms.length === 1) return ms[0].mode;
    return selectedMode;
  };

  const handleHatch = async () => {
    const equip = hatchEquip || Object.keys(activeByEquip)[0] || '';
    if (!equip) { alert('장비를 선택하세요 (작업 중인 장비 없음)'); return; }
    const bays = bayInput.split(/[,\s]+/).filter(b => b.trim()).map(b => b.trim());
    if (bays.length === 0) { alert('베이 번호를 입력하세요'); return; }
    const voy = getVoy(equipModeOf(equip));

    const time = Date.now();
    const panelCount = hatchPanels;  // V8.31: 자동계산 제거 — 검수사가 선택한 장수(1~3)
    const message = buildHatchMessage({ vsl, voy, bays, action: hatchAction, time, equip, panelCount });

    await fbAddWorkReport(voyageKey, {
      type: 'hatch',
      action: hatchAction,
      // TallyOne 1.8-10: mode 를 함께 남긴다 — 자동 유도가 reports 로 소급 인식할 때
      //   양하 close 와 선적 close 를 구분하려면 이 값이 있어야 한다(옛 기록엔 없다).
      mode: equipModeOf(equip) === 'loading' ? 'loading' : 'discharge',
      bays,
      equip,
      panelCount,
      message,
    });

    // TallyOne 1.8-09: **수동으로 닫은 것을 자동 유도가 알게 한다.**
    //   자동 유도(GuidedWorkPanel)가 "해치커버 닫을까요?"를 묻지 않는 근거는 오직
    //   `info.hatchDone["{mode}_{center}"]` 하나다. 종전엔 수동 보고가 카톡과 reports 에만
    //   남기고 이 표시를 안 찍어, 수동으로 닫아도 자동모드가 되물었다
    //   (검수사 신고 2026-08-05 — STMJ 2644W 베이 18을 수동으로 CLOSE 했는데 또 물음).
    //   ⚠ 실패해도 보고 자체는 이미 나갔으므로 막지 않는다. 다만 조용히 넘기지는 않는다.
    try {
      const mode = equipModeOf(equip) === 'loading' ? 'loading' : 'discharge';
      const prev = voyage?.info?.hatchDone || {};
      const next = { ...prev };
      for (const b of bays) {
        const center = bayGroupCenter(b, bayPairsForHatch);
        if (center != null) next[`${mode}_${center}`] = hatchAction;
      }
      if (Object.keys(next).length !== Object.keys(prev).length ||
          JSON.stringify(next) !== JSON.stringify(prev)) {
        await fbUpdateVoyageInfo(voyageKey, { hatchDone: next });
      }
    } catch (e) {
      console.warn('[해치 수동보고] hatchDone 표시 저장 실패 — 자동 유도가 다시 물을 수 있습니다', e);
    }

    await shareText(message, '해치커버');
    setBayInput('');
    setView('main');
    onClose();
  };

  const handleConBox = async () => {
    const equip = conBoxEquip || Object.keys(activeByEquip)[0] || '';
    if (!equip) { alert('장비를 선택하세요 (작업 중인 장비 없음)'); return; }
    const voy = getVoy(equipModeOf(equip));  // V7.94-16: 항차 오표시 수정
    const time = Date.now();
    const message = buildConBoxMessage({ vsl, voy, type: conBoxType, count: conBoxCount, time, equip });

    await fbAddWorkReport(voyageKey, {
      type: 'conbox',
      conBoxType, conBoxCount, equip,
      message,
    });

    await shareText(message, '콘박스');
    setView('main');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 p-0 md:p-4" onClick={onClose}>
      <div className="bg-slate-900 border-2 border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-400"/>
            <span className="font-bold text-emerald-300">작업 보고</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* 메인 화면: 활성 작업 + 새 작업 시작 */}
        {view === 'main' && (
          <div className="p-3 space-y-3">
            {/* 활성 작업 카드 - 장비별 양하/선적 분리 */}
            {Object.keys(activeByEquip).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300">진행 중인 작업</div>
                {Object.entries(activeByEquip).map(([equip, works]) => (
                  <div key={equip} className="bg-slate-800/40 border border-slate-700 rounded-lg p-2 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Truck className="w-4 h-4 text-orange-400"/>
                      <span className="font-bold text-base text-orange-200">{equip}</span>
                    </div>
                    {works.map(w => {
                      const isPaused = w.status === 'paused';
                      const modeLabel = w.mode === 'discharge' ? '양하' : '선적';
                      const modeIcon = w.mode === 'discharge' ? '⬇' : '⬆';
                      return (
                        <div key={w.mode} className={`border-2 rounded p-2 ${isPaused ? 'border-amber-700 bg-amber-950/30' : 'border-emerald-700 bg-emerald-950/30'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm">{modeIcon} {modeLabel}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isPaused ? 'bg-amber-700 text-white' : 'bg-emerald-700 text-white'}`}>
                                {isPaused ? '⏸ 중단' : '🟢 진행'}
                              </span>
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            시작: {w.startedAt ? new Date(w.startedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                            {w.pauseReason && <div className="text-amber-300 mt-0.5">사유: {w.pauseReason}</div>}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 mt-2">
                            {!isPaused ? (
                              <button onClick={() => { setPauseTarget({ equip, mode: w.mode }); setView('pause'); }}
                                className="py-2 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-bold flex items-center justify-center gap-1">
                                <Pause className="w-3.5 h-3.5"/> {modeLabel} 중단
                              </button>
                            ) : (
                              <button onClick={() => handleResume(equip, w.mode)}
                                className="py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-bold flex items-center justify-center gap-1">
                                <Play className="w-3.5 h-3.5"/> {modeLabel} 재개
                              </button>
                            )}
                            <button onClick={() => handleDone(equip, w.mode)}
                              className="py-2 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs font-bold flex items-center justify-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5"/> {modeLabel} 완료
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* 새 작업 시작 */}
            <button onClick={() => setView('start')}
              className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-base flex items-center justify-center gap-2">
              <Play className="w-5 h-5"/> 새 작업 시작
            </button>

            {/* 추가 보고 (해치/콘박스) */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setView('hatch')}
                className="py-3 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1">
                <Unlock className="w-4 h-4"/> 해치커버
              </button>
              <button onClick={() => setView('conbox')}
                className="py-3 bg-purple-700 hover:bg-purple-600 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1">
                <Box className="w-4 h-4"/> 콘박스
              </button>
            </div>
            {/* V8.10: 해치 제외 4척(TMPZ·TNJP·RZOR·OBWH)은 해치커버 대신 주야간 작업보고를 쓴다. */}
            {isHatchSkipShip && (
              <button onClick={() => { setDnShift(null); setView('daynight'); }}
                className="w-full py-3 bg-teal-700 hover:bg-teal-600 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 border border-teal-500">
                📋 주야간 작업보고
              </button>
            )}
            {/* M5.79: 수동 보고 (시작 안 누른 작업) — 이어받기 / 한 갱 먼저 완료 케이스 */}
            <button onClick={() => { setManualAction(''); setManualReason(''); setView('manual'); }}
              className="w-full py-3 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 border border-indigo-500">
              <RefreshCw className="w-4 h-4"/> 🔧 수동 보고 (시작 안 누른 작업)
            </button>
            {/* M5.76: 외부 요인 작업 중단 (장비고장/강풍/안개/기타) */}
            <button onClick={() => setView('external')}
              className="w-full py-3 bg-red-800 hover:bg-red-700 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 border border-red-600">
              <AlertTriangle className="w-4 h-4"/> 작업 중단 (장비고장 / 강풍 / 안개 / 기타)
            </button>

            <div className="text-[10px] text-slate-500 text-center">
              💡 카톡 공유창이 열리면 단톡방을 선택하세요
            </div>
          </div>
        )}

        {/* 작업 시작 화면 */}
        {view === 'start' && (
          <div className="p-3 space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-slate-400">← 돌아가기</button>

            <div>
              <div className="text-xs font-bold text-slate-300 mb-2">1) 장비 선택</div>
              <div className="grid grid-cols-2 gap-2">
                {equipNumbers.map(n => (
                  <button key={n} onClick={() => setSelectedEquip(n)}
                    className={`py-3 rounded-lg font-bold ${selectedEquip === n ? 'bg-orange-600 text-white border-2 border-orange-300' : 'bg-slate-800 text-slate-300'}`}>
                    🏗 {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-300 mb-2">2) 작업 종류</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setSelectedMode('discharge')}
                  className={`py-3 rounded-lg font-bold ${selectedMode === 'discharge' ? 'bg-emerald-600 text-white border-2 border-emerald-300' : 'bg-slate-800 text-slate-300'}`}>
                  ⬇ 양하
                </button>
                <button onClick={() => setSelectedMode('loading')}
                  className={`py-3 rounded-lg font-bold ${selectedMode === 'loading' ? 'bg-emerald-600 text-white border-2 border-emerald-300' : 'bg-slate-800 text-slate-300'}`}>
                  ⬆ 선적
                </button>
              </div>
            </div>

            <div className="bg-slate-800 rounded p-2 text-xs text-slate-300">
              <div>📍 {vsl} {voy}</div>
              <div>🏗 {selectedEquip} - {selectedMode === 'discharge' ? '양하' : '선적'} 시작</div>
            </div>

            <button onClick={handleStartWork}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold flex items-center justify-center gap-2">
              <Send className="w-4 h-4"/> ▶ 시작 + 카톡 보고
            </button>
          </div>
        )}

        {/* 중단 화면 */}
        {view === 'pause' && (
          <div className="p-3 space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-slate-400">← 돌아가기</button>
            <div className="bg-amber-950/30 border border-amber-700 rounded p-2 text-sm">
              <div className="font-bold text-amber-200">
                {pauseTarget.equip} {pauseTarget.mode === 'discharge' ? '양하' : '선적'} 중단
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">중단 사유 — 빠른 선택</div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {['장비 고장', '강풍 대기', '안개 대기', '우천 대기', '화물 이상', '점심 식사'].map(r => (
                  <button key={r} type="button" onClick={() => setPauseReason(r)}
                    className={`py-2 rounded text-xs font-bold border ${pauseReason === r ? 'bg-amber-700 text-white border-amber-500' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>{r}</button>
                ))}
              </div>
              <input type="text" value={pauseReason} onChange={e => setPauseReason(e.target.value)}
                placeholder="또는 기타 사유 직접 입력"
                className="w-full bg-slate-800 border border-amber-600 rounded px-3 py-2 text-sm text-slate-100"/>
            </div>
            <button onClick={() => handlePause(pauseTarget.equip, pauseTarget.mode)}
              className="w-full py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-lg font-bold flex items-center justify-center gap-2">
              <Pause className="w-4 h-4"/> 중단 보고
            </button>
          </div>
        )}

        {/* M5.76: 외부 요인 작업 중단 화면 */}
        {view === 'external' && (
          <div className="p-3 space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-slate-400">← 돌아가기</button>
            <div className="bg-red-950/40 border border-red-700 rounded p-2">
              <div className="font-bold text-red-200 text-sm flex items-center gap-1">
                <AlertTriangle className="w-4 h-4"/> 작업 중단 보고 (외부 요인)
              </div>
              <div className="text-[11px] text-red-300/80 mt-1">전체 작업 중단 — 작업 시작 안 한 상태에서도 보고 가능</div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">중단 사유</div>
              <div className="grid grid-cols-2 gap-1.5">
                {['장비 고장', '강풍 대기', '안개 대기', '우천 대기', '항만 사정', '기타'].map(r => (
                  <button key={r} type="button" onClick={() => setExternalReason(r)}
                    className={`py-2.5 rounded text-xs font-bold border ${externalReason === r ? 'bg-red-700 text-white border-red-500' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>{r}</button>
                ))}
              </div>
              {externalReason === '기타' && (
                <input type="text" value={externalDetail} onChange={e => setExternalDetail(e.target.value)}
                  placeholder="세부 사유 입력"
                  className="w-full mt-2 bg-slate-800 border border-red-600 rounded px-3 py-2 text-sm text-slate-100" autoFocus/>
              )}
            </div>
            <button onClick={handleExternalPause}
              disabled={!externalReason || (externalReason === '기타' && !externalDetail.trim())}
              className="w-full py-3 bg-red-700 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-bold flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4"/> 작업 중단 보고
            </button>
          </div>
        )}

        {/* M5.79: 수동 보고 화면 — 시작 안 누른 작업의 중단/재개/완료 */}
        {view === 'manual' && (
          <div className="p-3 space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-slate-400">← 돌아가기</button>
            <div className="bg-indigo-950/40 border border-indigo-700/50 rounded-lg p-3">
              <div className="text-base font-black text-indigo-200 flex items-center gap-2 mb-1">
                <RefreshCw className="w-4 h-4"/> 수동 보고
              </div>
              <div className="text-[11px] text-indigo-300/90 leading-relaxed">
                • 다른 검수원이 시작한 작업을 <b>이어받아</b> 중단/완료할 때<br/>
                • 한 갱이 먼저 완료하여 <b>시작 기록 없이 완료 보고</b>가 필요할 때<br/>
                • 시작 버튼을 못 누른 상태에서 <b>장비/모드 직접 선택</b>해 보고
              </div>
            </div>

            {/* 장비 선택 */}
            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">장비</div>
              <div className="grid grid-cols-4 gap-1">
                {equipNumbers.map(n => (
                  <button key={n} onClick={() => setManualEquip(n)}
                    className={`py-2 rounded font-bold text-xs ${manualEquip === n ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* 모드 선택 */}
            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">작업 종류</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setManualMode('discharge')}
                  className={`py-3 rounded-lg font-bold text-sm ${manualMode === 'discharge' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  ⬇ 양하
                </button>
                <button onClick={() => setManualMode('loading')}
                  className={`py-3 rounded-lg font-bold text-sm ${manualMode === 'loading' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  ⬆ 선적
                </button>
              </div>
            </div>

            {/* 현재 Firebase 상태 표시 */}
            {(() => {
              const aw = activeWork[manualEquip]?.[manualMode];
              if (aw) {
                const isPaused = aw.status === 'paused';
                return (
                  <div className={`px-3 py-2 rounded border ${isPaused ? 'bg-amber-950/40 border-amber-700/50' : 'bg-emerald-950/40 border-emerald-700/50'}`}>
                    <div className="text-xs font-bold mb-0.5">
                      {isPaused ? '⏸ 중단 상태' : '🟢 진행 중'} — Firebase에 기록 있음
                    </div>
                    {aw.startedAt && <div className="text-[10px] text-slate-400">시작: {new Date(aw.startedAt).toLocaleString('ko-KR')}</div>}
                    {aw.pauseReason && <div className="text-[10px] text-amber-300">사유: {aw.pauseReason}</div>}
                  </div>
                );
              }
              return (
                <div className="px-3 py-2 rounded border bg-slate-800/40 border-slate-700">
                  <div className="text-xs font-bold text-slate-300">📭 Firebase에 시작 기록 없음</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">수동 완료/중단 보고 가능 (이어받기·한 갱 먼저 완료 케이스)</div>
                </div>
              );
            })()}

            {/* 액션 선택 */}
            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">보고 종류</div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setManualAction('pause')}
                  className={`py-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1 ${manualAction === 'pause' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  <Pause className="w-3.5 h-3.5"/> 중단
                </button>
                <button onClick={() => setManualAction('resume')}
                  className={`py-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1 ${manualAction === 'resume' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  <Play className="w-3.5 h-3.5"/> 재개
                </button>
                <button onClick={() => setManualAction('done')}
                  className={`py-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1 ${manualAction === 'done' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5"/> 완료
                </button>
              </div>
            </div>

            {/* 중단 사유 (pause만) */}
            {manualAction === 'pause' && (
              <div>
                <div className="text-xs font-bold text-slate-300 mb-1">중단 사유 — 빠른 선택</div>
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  {['장비 고장', '강풍 대기', '안개 대기', '우천 대기', '화물 이상', '점심 식사'].map(r => (
                    <button key={r} onClick={() => setManualReason(r)}
                      className={`py-2 rounded text-xs font-bold ${manualReason === r ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {r}
                    </button>
                  ))}
                </div>
                <input type="text" value={manualReason} onChange={(e) => setManualReason(e.target.value)}
                  placeholder="또는 직접 입력"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"/>
              </div>
            )}

            {/* 실행 버튼 */}
            <button
              disabled={!manualAction || (manualAction === 'pause' && !manualReason.trim())}
              onClick={async () => {
                const voy = getVoy(manualMode);  // M6.37
                if (manualAction === 'pause') {
                  setPauseReason(manualReason);
                  // 직접 handlePause 호출 (pauseReason state 비동기 반영 회피)
                  if (!manualReason.trim()) return;
                  const time = Date.now();
                  const aw = activeWork[manualEquip]?.[manualMode] || { mode: manualMode, vsl, voy };
                  const action = `${manualMode}_pause`;
                  const message = buildWorkStatusMessage({ vsl, voy, action, time, reason: manualReason, equip: manualEquip });
                  await set(ref(db, `activeWork/${voyageKey}/${manualEquip}/${manualMode}`), {
                    ...aw, status: 'paused', pausedAt: time, pauseReason: manualReason,
                  });
                  await fbAddWorkReport(voyageKey, {
                    type: 'work_status', action, mode: manualMode, equip: manualEquip,
                    reason: manualReason, message, manual: true,
                  });
                  await shareText(message, '검수 보고');
                  setManualReason(''); setManualAction(''); setView('main'); onClose();
                } else if (manualAction === 'resume') {
                  await handleResume(manualEquip, manualMode);
                  setManualAction(''); setView('main');
                } else if (manualAction === 'done') {
                  await handleDone(manualEquip, manualMode);
                  setManualAction(''); setView('main');
                }
              }}
              className="w-full py-3 bg-indigo-700 hover:bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-bold flex items-center justify-center gap-2">
              <Send className="w-4 h-4"/>
              {manualAction === 'pause' ? '중단 보고' :
               manualAction === 'resume' ? '재개 보고' :
               manualAction === 'done' ? '완료 보고' : '보고 종류 선택'}
            </button>
          </div>
        )}

        {/* 해치 화면 */}
        {view === 'hatch' && (
          <div className="p-3 space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-slate-400">← 돌아가기</button>

            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">장비</div>
              <div className="grid grid-cols-4 gap-1">
                {equipNumbers.map(n => (
                  <button key={n} onClick={() => setHatchEquip(n)}
                    className={`py-2 rounded text-xs font-bold ${(hatchEquip || Object.keys(activeByEquip)[0]) === n ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setHatchAction('open')}
                className={`py-3 rounded-lg font-bold flex items-center justify-center gap-2 ${hatchAction === 'open' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <Unlock className="w-4 h-4"/> OPEN
              </button>
              <button onClick={() => setHatchAction('close')}
                className={`py-3 rounded-lg font-bold flex items-center justify-center gap-2 ${hatchAction === 'close' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <Lock className="w-4 h-4"/> CLOSE
              </button>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">베이 번호</div>
              <input
                type="text"
                value={bayInput}
                onChange={e => setBayInput(e.target.value)}
                placeholder="예: 1, 3, 5"
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-3 text-base mono text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* V8.31: 해치커버 장수 수동 선택(1~3장) — 자동계산 제거 */}
            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">장수 선택</div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(n => (
                  <button key={n} onClick={() => setHatchPanels(n)}
                    className={`py-3 rounded-lg font-bold ${hatchPanels === n ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {n}장
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleHatch}
              className={`w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 ${hatchAction === 'open' ? 'bg-emerald-700' : 'bg-blue-700'}`}>
              <Send className="w-4 h-4"/> 해치 {hatchAction === 'open' ? 'OPEN' : 'CLOSE'} 보고
            </button>
          </div>
        )}

        {/* 콘박스 화면 */}
        {view === 'conbox' && (
          <div className="p-3 space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-slate-400">← 돌아가기</button>

            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">장비</div>
              <div className="grid grid-cols-4 gap-1">
                {equipNumbers.map(n => (
                  <button key={n} onClick={() => setConBoxEquip(n)}
                    className={`py-2 rounded text-xs font-bold ${(conBoxEquip || Object.keys(activeByEquip)[0]) === n ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">규격</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setConBoxType('20')}
                  className={`py-3 rounded-lg font-bold ${conBoxType === '20' ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'}`}>20자</button>
                <button onClick={() => setConBoxType('40')}
                  className={`py-3 rounded-lg font-bold ${conBoxType === '40' ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'}`}>40자</button>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">개수</div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(n => (
                  <button key={n} onClick={() => setConBoxCount(n)}
                    className={`py-3 rounded-lg font-bold text-lg ${conBoxCount === n ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {n}개
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-800 rounded p-2 text-center text-sm font-bold">
              📦 콘박스 {conBoxType}자 {conBoxCount}개
            </div>

            <button onClick={handleConBox}
              className="w-full py-3 bg-purple-700 hover:bg-purple-600 text-white rounded-lg font-bold flex items-center justify-center gap-2">
              <Send className="w-4 h-4"/> 콘박스 보고
            </button>
          </div>
        )}

        {/* V8.10: 주야간 작업보고 (해치 제외 4척 전용) */}
        {view === 'daynight' && (
          <div className="space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-slate-400">← 돌아가기</button>
            <div className="text-sm font-bold text-teal-300 text-center">📋 주야간 작업보고</div>
            {/* 주/야 토글 (자동 선택이 기본, 수동 전환 가능) */}
            <div className="grid grid-cols-2 gap-2">
              {['주간', '야간'].map(s => (
                <button key={s} onClick={() => setDnShift(s)}
                  className={`py-2.5 rounded-lg font-bold text-sm border ${
                    dnActiveShift === s
                      ? (s === '주간' ? 'bg-amber-700 border-amber-400 text-white' : 'bg-sky-800 border-sky-400 text-white')
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}>
                  {s === '주간' ? '☀ 주간보고 08–17' : '🌙 야간보고 19–05:30'}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 text-center">
              {dnShift ? '수동 선택됨' : '현재 시각 기준 자동 선택'} · 보고 마감 +30분 여유
            </div>
            {/* 양하/선적 각 표 */}
            {[['discharge', '양하', dnReportD], ['loading', '선적', dnReportL]].map(([m, label, rep]) => (
              <div key={m} className="bg-slate-900 border border-slate-700 rounded-lg p-2">
                <div className="text-xs font-bold text-slate-200 mb-1 flex items-center justify-between">
                  <span>{label}</span>
                  {!rep.excluded && (
                    <span className="text-[10px] text-teal-300">
                      {rep.basis} 기준 (완료 {rep.doneTotal} · 잔여 {rep.remainTotal})
                    </span>
                  )}
                </div>
                {rep.excluded ? (
                  <div className="text-[11px] text-slate-500 text-center py-2">{rep.reason}</div>
                ) : (
                  <table className="w-full text-[11px] tabular-nums">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-1">규격</th><th>F</th><th>E</th><th>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-100">
                      {[['20ft', rep.tbl.s20], ['40ft', rep.tbl.s40], ['45ft', rep.tbl.s45]].map(([nm, o]) => (
                        <tr key={nm} className="border-b border-slate-800">
                          <td className="text-left py-1 text-slate-300">{nm}</td>
                          <td className="text-center">{o.F}</td><td className="text-center">{o.E}</td>
                          <td className="text-center font-bold">{o.F + o.E}</td>
                        </tr>
                      ))}
                      <tr className="text-teal-300 font-bold">
                        <td className="text-left py-1">풀엠티토탈</td>
                        <td className="text-center">{rep.total.F}</td>
                        <td className="text-center">{rep.total.E}</td>
                        <td className="text-center">{rep.total.total}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            ))}
            <div className="text-[10px] text-slate-500 text-center">
              💡 적은 쪽(작업량/잔여)을 세는 게 빠릅니다. 어느 기준인지 표에 표기됩니다.
            </div>
          </div>
        )}
      </div>
      {/* M5.92 fix: ConfirmModal 렌더 누락 — handleDone의 askConfirm 다이얼로그가 안 떠서
          완료 보고가 카톡으로 전송 안 되던 버그 수정 */}
      <ConfirmModal {...confirmState} />
    </div>
  );
}
