import React, { useState , useMemo} from 'react';
import { X, Check, Edit3, Snowflake, AlertTriangle, AlertOctagon, MapPin, Volume2, RotateCcw, History, Lock, Camera } from 'lucide-react';
import { isoToLabel, formatWt, getEquipNumber, isUnknownIso, isReeferContainer, isISO403, isISO403PhotoTaken, isBookingSlot, bayParityError, slotAdjacencyError, podZoneMismatch } from '../utils.js';
import { speakContainer, speakDone } from '../voice.js';
import { fbCompleteContainer, fbCancelComplete, fbToggleXray, fbUpdateRecordSeal, fbSetXraySeal, fbUpdateRecordField, fbSetEmptySeal, fbReassignContainerPosition, fbSetActualPosition, fbClearActualPosition } from '../firebase.js';
import PhotoReportModal from './PhotoReportModal.jsx';
import ISO403PhotoModal from './ISO403PhotoModal.jsx';
import ConfirmModal, { useConfirm } from './ConfirmModal.jsx';
import PositionEditModal from './PositionEditModal.jsx';
import { getBayPairs } from '../twin.js';
import { NUM_INPUT_PROPS } from '../inputUtils.js';
import { formatDgLabel, lookupUN } from '../dgUnDict.js';

// ISO 코드 옵션 — M5.79 확장
//   끝자리 0 = Full(적재), 1 = Empty(공컨) 통상. EDI 양식에 따라 둘 다 입력 가능.
//   드롭다운에서 G0/G1 분리 → "잘못된 ISO 일괄 검토 리스트"가 G0↔G1 변경도 잡아낼 수 있게 함.
const ISO_OPTIONS = [
  // 20피트 GP (DC) — Full / Empty
  { iso: '22G0', label: '20DC (20피트 일반) · Full',  flags: {} },
  { iso: '22G1', label: '20DC (20피트 일반) · Empty', flags: {} },
  // 20피트 HC (드물지만 존재)
  { iso: '25H0', label: '20HC (20피트 하이큐브) · Full',  flags: {} },
  { iso: '25H1', label: '20HC (20피트 하이큐브) · Empty', flags: {} },
  // 40피트 GP — Full / Empty
  { iso: '42G0', label: '40DC (40피트 일반) · Full',  flags: {} },
  { iso: '42G1', label: '40DC (40피트 일반) · Empty', flags: {} },
  // 40피트 HC (45XX = 40HC in 평택항 표준) — Full / Empty
  { iso: '45G0', label: '40HC (40피트 하이큐브) · Full',  flags: {} },
  { iso: '45G1', label: '40HC (40피트 하이큐브) · Empty', flags: {} },
  // 45피트 (진짜 45피트)
  { iso: 'L5G1', label: '45HC (45피트 하이큐브)',     flags: {} },
  // 리퍼 — Full / Empty
  { iso: '22R0', label: '20RF (20피트 리퍼) · Full',  flags: { rf: true } },
  { iso: '22R1', label: '20RF (20피트 리퍼) · Empty', flags: { rf: true } },
  { iso: '42R0', label: '40RF (40피트 리퍼) · Full',  flags: { rf: true } },
  { iso: '42R1', label: '40RF (40피트 리퍼) · Empty', flags: { rf: true } },
  { iso: '45R0', label: '40HC 리퍼 · Full',           flags: { rf: true } },
  { iso: '45R1', label: '40HC 리퍼 · Empty',          flags: { rf: true } },
  // 플랫랙
  { iso: '22P1', label: '20FR (20피트 플랫랙)',       flags: { fr: true } },
  { iso: '42P1', label: '40FR (40피트 플랫랙)',       flags: { fr: true } },
  { iso: '42P3', label: '40FR (40피트 플랫랙·고정식)', flags: { fr: true } },
  { iso: '45P1', label: '45FR (45피트 플랫랙)',       flags: { fr: true } },
  // 오픈탑
  { iso: '22U1', label: '20OT (20피트 오픈탑)',       flags: { ot: true } },
  { iso: '42U1', label: '40OT (40피트 오픈탑)',       flags: { ot: true } },
  { iso: '45U1', label: '40HC 오픈탑',                flags: { ot: true } },
  // 탱크
  { iso: '22T1', label: '20TK (20피트 탱크)',         flags: { tk: true } },
  { iso: '22T6', label: '20TK 위험물 탱크',            flags: { tk: true } },
  { iso: '42T1', label: '40TK (40피트 탱크)',         flags: { tk: true } },
  { iso: '45T1', label: '40HC 탱크',                  flags: { tk: true } },
];

export default function ContainerDetailModal({ c, comp, isXray, xraySeal, mode, voyageKey, voyageInfo, inspector, onClose, sealMode, allContainers = [], workBay = null, workTier = null }) {
  const [editingSeal, setEditingSeal] = useState(false);
  const [editingXSeal, setEditingXSeal] = useState(false);
  const [editingIso, setEditingIso] = useState(false);
  const [editingTmp, setEditingTmp] = useState(false);
  const [tmpVal, setTmpVal] = useState(c.tmp || '');
  const [editingEseal, setEditingEseal] = useState(false);
  // M4.9b-fix: 실오류 / 리씰 별도 입력 모드
  const [editingEsealWrong, setEditingEsealWrong] = useState(false);
  const [editingReseal, setEditingReseal] = useState(false);
  const [esealWrongVal, setEsealWrongVal] = useState('');
  const [esealVal, setEsealVal] = useState(c.eseal || '');
  const [resealVal, setResealVal] = useState(c.reseal || '');
  // V9.57(I10): 미사용 esealType state 제거 (참조 0, 전수 grep 확인)
  const [photoMode, setPhotoMode] = useState(null);  // M3.5.6: 'seal_error' | 'damage'
  const [iso403PhotoOpen, setIso403PhotoOpen] = useState(false);  // M4.9: ISO403 사진 모달
  const [showHistory, setShowHistory] = useState(false);
  const [showDesc, setShowDesc] = useState(false);  // M8.07: 품명(내용물) 펼침 — 평소 숨김, 이상 보고 시 참조
  const [sealVal, setSealVal] = useState(c.sl || '');
  const [xSealVal, setXSealVal] = useState(xraySeal?.seal || '');
  const [xEsealVal, setXEsealVal] = useState(xraySeal?.eseal || '');
  // V7.94-09: 남은 자리 선택창용 — 트윈 짝꿍 후보·짝꿍 베이 매핑
  // V8.70: 출발지 기준 트윈 짝꿍 자동 계산 제거 — PositionEditModal이 도착지 기준 "트윈 지정"으로 처리.
  const posEditBayPairs = useMemo(() => {
    try { return getBayPairs(allContainers.filter(x => (x._mode || mode) === (c?._mode || mode))); } catch { return null; }
  }, [allContainers, c, mode]);

  // V9.57(I10): 클릭 경로에 따라 병합 컨(c)에 iso_orig·tmp_orig가 안 붙어 "원본→수정됨" 표기가
  //   영구 거짓 분기였다. 호출부(VoyagePage/App)가 records 전체 병합으로 만든 allContainers에서
  //   같은 컨을 찾아 _orig를 폴백 조회해 표시를 복원한다. (records에 ''로 저장된 _orig는
  //   호출부 병합 필터가 빈 값을 걸러 못 받는다 — 그 경우만 미표시, 무해)
  const recOrig = useMemo(() => (allContainers || []).find(x => x && x.cn === c.cn) || {}, [allContainers, c.cn]);
  const isoOrigShow = c.iso_orig !== undefined ? c.iso_orig : recOrig.iso_orig;
  const tmpOrigShow = c.tmp_orig !== undefined ? c.tmp_orig : recOrig.tmp_orig;

  // M3.87: 위치 수정 모달 (선적 모드 전용)
  const [showPosEdit, setShowPosEdit] = useState(false);

  // M4.9d-fix: 선적 실체 위치 입력 state
  const [editingActualPos, setEditingActualPos] = useState(false);
  const [actualBay, setActualBay] = useState('');
  const [actualRow, setActualRow] = useState('');
  const [actualTier, setActualTier] = useState('');

  // M4.9d-fix: 실체 위치 저장
  const handleSaveActualPosition = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    const b = String(actualBay || '').trim().toUpperCase();
    const r = String(actualRow || '').trim().toUpperCase();
    const t = String(actualTier || '').trim().toUpperCase();
    if (!b || !r || !t) { alert('베이/열/단 모두 입력하세요'); return; }
    // V9.27: 물리 불가 좌표 원천 차단 — 40/45ft를 홀수 베이에 (어제 강제 입력 사고의 근원, 경고 아닌 차단)
    const _pe = bayParityError(c, b);
    if (_pe) { alert('⛔ ' + _pe); return; }
    // V9.28-04: 인접 슬롯 검사 (40ft ↔ 양옆 홀수 슬롯)
    const _ae = slotAdjacencyError(c, b, r, t, allContainers);
    if (_ae) { alert('⛔ ' + _ae); return; }
    // V9.28-05: POD 구역 경고 (경고 후 허용)
    const _pz = podZoneMismatch(c, b, t, allContainers);
    if (_pz) { alert(`⛔ 이 구역은 ${_pz.zone} 화물 자리입니다 (주변 ${_pz.count}대). ${c.cn}의 포트는 ${_pz.pod}.\n계획에 없는 포트 섞임은 실을 수 없습니다 — 현장에서 막고 제 구역 빈자리로 보내세요.\n불가피한 변경은 수석검수사가 베이상세편집 또는 EDI 수정으로 처리합니다.`); return; }
    // V9.24: 점유 확인 — 두 컨이 같은 자리가 되는 걸 저장 전에 알린다 (STSE 2658W 중복 사고).
    //   차단하지 않는다(사용자 원칙: 블럭하면 수정 자체가 안 된다) — 경고 후 확인되면 저장.
    const _p2 = (x) => String(x ?? '').replace(/\D/g, '').padStart(2, '0').slice(-2);
    const _tk = `${_p2(b)}-${_p2(r)}-${_p2(t)}`;
    const _occ = (allContainers || []).find((o) => {
      if (!o || !o.cn || o.cn === c.cn) return false;
      if (String(o.bay_actual || '').startsWith('__')) return false;   // 임시창고 제외
      const hasA = o.bay_actual !== undefined && o.bay_actual !== '' && o.bay_actual !== null;
      const ob = hasA ? o.bay_actual : o.bay, orr = hasA ? o.row_actual : o.row, ot = hasA ? o.tier_actual : o.tier;
      if (!ob || !ot) return false;
      return `${_p2(ob)}-${_p2(orr)}-${_p2(ot)}` === _tk;
    });
    const _doSave = async () => {
      await fbSetActualPosition(voyageKey, mode, c.cn, b, r, t, inspector);
      setEditingActualPos(false);
      setActualBay(''); setActualRow(''); setActualTier('');
    };
    if (_occ) {
      const kind = (_occ.bay_actual !== undefined && _occ.bay_actual !== '' && _occ.bay_actual !== null) ? '수정 위치' : '계획 위치';
      askConfirm({
        title: '⚠ 자리 중복',
        message: `그 자리(BAY ${_p2(b)} / ${_p2(r)}열 / ${_p2(t)}단)에는 이미 ${_occ.cn}이(가) 있습니다 (${kind}).\n두 컨테이너가 같은 자리에 있을 수는 없습니다.\n상대 컨을 먼저 옮겼다면 계속 저장하세요.`,
        confirmLabel: '그래도 저장', danger: true,
        onConfirm: _doSave,
      });
      return;
    }
    await _doSave();
  };

  // M4.9d-fix: 실체 위치 삭제 (수정 취소 - 계획대로 돌아감)
  const handleClearActualPosition = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    if (!confirm('수정 위치 기록을 삭제하시겠습니까?\n계획 위치대로 처리됩니다.')) return;
    await fbClearActualPosition(voyageKey, mode, c.cn);
  };

  // M3.74: confirm() → ConfirmModal
  const [confirmState, askConfirm] = useConfirm();

  const isDone = !!comp;
  const isReefer = isReeferContainer(c);
  const isDG = c.dg;
  // M4.9: ISO403 (사진 촬영 의무 대상)
  const needsISO403Photo = isISO403(c);
  const iso403PhotoTaken = isISO403PhotoTaken(c);

  const slOrig = c.sl_orig != null ? c.sl_orig : c.sl;
  const sealError = c.sl && slOrig && c.sl !== slOrig;
  const xSealOrig = xraySeal?.seal_orig != null ? xraySeal.seal_orig : xraySeal?.seal || '';
  const xSeal = xraySeal?.seal || '';
  const xSealError = xSeal && xSealOrig && xSeal !== xSealOrig;
  const slHistory = c.sl_history || [];
  const xHistory = xraySeal?.history || [];

  const handleComplete = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    if (isDone) {
      askConfirm({
        title: '완료 취소',
        message: `${c.cn}\n${mode === 'discharge' ? '양하확인을' : '선적확인을'} 취소하시겠습니까?`,
        confirmLabel: '취소',
        cancelLabel: '닫기',
        onConfirm: async () => {
          await fbCancelComplete(voyageKey, mode, c.cn);
        },
      });
    } else {
      // V8.09-06: XRAY 대상은 XRAY 실번호(seal) 입력 전까지 양하확인 차단.
      if (mode === 'discharge' && isXray && !String(xSeal || '').trim()) {
        alert(`XRAY 실번호를 먼저 입력하세요.\n${c.cn?.slice(-4)}은 XRAY 대상으로 실번호 입력 전까지 양하확인할 수 없습니다.`);
        return;
      }
      await fbCompleteContainer(voyageKey, mode, c.cn, inspector);
      speakDone(c);
    }
  };

  // V7.90-06: 실번호 스왑(서로 바뀜) 감지 — 입력한 실번호가 다른 컨테이너의
  //   리스트 실번호와 같으면 즉시 경고. 한쪽만 수정하면 중복이 되는 패턴 (사용자 요청).
  //   저장 자체는 막지 않음(실물이 진실) — 상대 컨테이너 확인을 유도.
  const checkSealSwap = (val) => {
    const n = String(val || '').toUpperCase().replace(/[\s\-]/g, '');
    if (!n) return true;
    const owner = (allContainers || []).find(x => x.cn !== c.cn &&
      [x.sl, x.eseal, x.reseal].some(s => s && String(s).toUpperCase().replace(/[\s\-]/g, '') === n));
    if (!owner) return true;
    return confirm(
      `⚠ 이 실번호는 ${owner.cn?.slice(-4)} (${owner.cn})의 리스트 실번호와 같습니다.\n\n` +
      `두 컨테이너의 실번호가 서로 바뀌어 있을 가능성이 큽니다 — ` +
      `${owner.cn?.slice(-4)}번도 실물 실번호를 확인하세요.\n\n그대로 기록하시겠습니까?`);
  };

  const handleSaveSeal = async () => {
    if (!checkSealSwap(sealVal)) return;
    await fbUpdateRecordSeal(voyageKey, mode, c.cn, sealVal.trim(), inspector);
    setEditingSeal(false);
  };

  const handleSaveXSeal = async () => {
    await fbSetXraySeal(voyageKey, c.cn, xSealVal.trim(), xEsealVal.trim(), inspector);
    setEditingXSeal(false);
  };

  // M3.5.4-fix3: 리퍼 온도 직접 수정
  const handleSaveTmp = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    const newTmp = String(tmpVal).trim();
    // 유효성: 빈값(미입력) 또는 숫자(소수점 포함, 부호 가능)
    if (newTmp !== '' && !/^[+-]?\d+(\.\d+)?$/.test(newTmp)) {
      alert('온도는 숫자만 입력하세요 (예: -18, 4.5, 0)\n빈칸은 미입력 처리됩니다');
      return;
    }
    // 정규화: "-018" → "-18"
    let norm = newTmp;
    if (norm) {
      const m = norm.match(/^([+-]?)0*(\d+(?:\.\d+)?)$/);
      if (m) norm = (m[1] || '') + m[2];
    }
    await fbUpdateRecordField(voyageKey, mode, c.cn, 'tmp', norm, inspector);
    // 미입력 플래그도 갱신
    await fbUpdateRecordField(voyageKey, mode, c.cn, 'tmp_missing', norm === '', inspector);
    // 리퍼로 인식되도록 rf=true 명시 (실 있는 리퍼 케이스)
    if (norm !== '' || c.rf) {
      await fbUpdateRecordField(voyageKey, mode, c.cn, 'rf', true, inspector);
    }
    setEditingTmp(false);
  };

  // M3.5.5/M4.9b: 엠티 실 저장 (단순화)
  //   verify 모드(TNJP/RZOR): 단순 덮어쓰기. 수정 이력은 fbSetEmptySeal에서 자동 저장.
  //                           수정 발생 시 별도 "엠티 수정 리포트"로 출력.
  //   attach 모드(ATRP): 단순 덮어쓰기.
  //   M4.9b 변경: 리씰/틀린실 라디오 강제 선택 제거 (사용자 요청 — 경고 메시지 불필요)
  const handleSaveEseal = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    const newVal = String(esealVal || '').trim().toUpperCase();
    if (!newVal && sealMode === 'attach') {
      alert('엠티실번호를 입력하세요');
      return;
    }
    // 단순 덮어쓰기 (verify/attach 동일). 이력은 firebase에서 자동 저장.
    await fbSetEmptySeal(voyageKey, mode, c.cn, { eseal: newVal }, inspector, sealMode);
    setEditingEseal(false);
  };

  // M4.9b-fix: 실오류 보고 — 발견된 잘못된 번호를 c.eseal_wrong에 별도 기록
  //   기존 c.eseal은 유지 (계획상 번호), eseal_wrong에 현장 발견 번호
  const handleSaveEsealWrong = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    const newVal = String(esealWrongVal || '').trim().toUpperCase();
    if (!newVal) { alert('실제 발견된 실번호를 입력하세요'); return; }
    if (!checkSealSwap(newVal)) return;  // V7.90-06: 스왑 의심 경고
    await fbSetEmptySeal(voyageKey, mode, c.cn, {
      eseal: c.eseal || '',
      eseal_wrong: newVal,
      reseal: c.reseal || '',
    }, inspector, sealMode);
    setEditingEsealWrong(false);
    setEsealWrongVal('');
  };

  // M4.9b-fix: 리씰 등록 — 실이 없거나 손상되어 새로 부착한 번호를 c.reseal에 기록
  //   기존 c.eseal은 유지, reseal에 새로 부착한 번호
  const handleSaveReseal = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    const newVal = String(resealVal || '').trim().toUpperCase();
    if (!newVal) { alert('새로 부착한 실번호를 입력하세요'); return; }
    if (!checkSealSwap(newVal)) return;  // V7.90-06: 다른 컨과 중복 경고
    await fbSetEmptySeal(voyageKey, mode, c.cn, {
      eseal: c.eseal || '',
      eseal_wrong: c.eseal_wrong || '',
      reseal: newVal,
    }, inspector, sealMode);
    setEditingReseal(false);
    setResealVal('');
  };

  // M4.9b-fix: 실오류/리씰 삭제 (잘못 등록한 경우)
  const handleClearEsealWrong = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    if (!confirm('실오류 기록을 삭제하시겠습니까?')) return;
    await fbSetEmptySeal(voyageKey, mode, c.cn, {
      eseal: c.eseal || '',
      eseal_wrong: '',
      reseal: c.reseal || '',
    }, inspector, sealMode);
  };
  const handleClearReseal = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    if (!confirm('리씰 기록을 삭제하시겠습니까?')) return;
    await fbSetEmptySeal(voyageKey, mode, c.cn, {
      eseal: c.eseal || '',
      eseal_wrong: c.eseal_wrong || '',
      reseal: '',
    }, inspector, sealMode);
  };

  // V8.09-06 (사용자 보고 2026-06-18): 엠티실 테스트 입력 후 완전 삭제 경로.
  //   기존엔 eseal에 삭제 버튼이 없고 저장 핸들러가 빈값을 막아(특히 attach/ATRP),
  //   테스트로 1자라도 넣으면 지울 수 없었다. 빈값 저장을 허용해 기록을 완전히 비운다.
  //   eseal_wrong/reseal은 보존(별도 삭제 버튼 사용). 이력(eseal_history)은 fbSetEmptySeal이 자동 누적.
  const handleClearEseal = async () => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    if (!confirm('엠티 실번호 기록을 완전히 삭제하시겠습니까?\n(테스트 입력 등 잘못 기록한 경우)')) return;
    await fbSetEmptySeal(voyageKey, mode, c.cn, {
      eseal: '',
      eseal_wrong: c.eseal_wrong || '',
      reseal: c.reseal || '',
    }, inspector, sealMode);
    setEditingEseal(false);
    setEsealVal('');
  };

  // M3.5.4-fix2: 규격(ISO) 수정 — rf/fr/ot/tk 플래그 자동 갱신
  const handleChangeIso = async (newIso) => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    const opt = ISO_OPTIONS.find(o => o.iso === newIso);
    if (!opt) return;
    askConfirm({
      title: '규격 변경',
      message:
        `현재: ${c.iso || '?'} (${isoToLabel(c.iso) || '?'})\n` +
        `변경: ${opt.iso} (${opt.label})\n\n` +
        `변경 이력에 기록됩니다.`,
      confirmLabel: '변경',
      cancelLabel: '취소',
      onConfirm: async () => {
        // ISO 자체 변경
        await fbUpdateRecordField(voyageKey, mode, c.cn, 'iso', opt.iso, inspector);
        // 플래그 갱신 (rf/fr/ot/tk 모두 명시 - 이전 잘못된 플래그 정리)
        await fbUpdateRecordField(voyageKey, mode, c.cn, 'rf', !!opt.flags.rf, inspector);
        await fbUpdateRecordField(voyageKey, mode, c.cn, 'fr', !!opt.flags.fr, inspector);
        await fbUpdateRecordField(voyageKey, mode, c.cn, 'ot', !!opt.flags.ot, inspector);
        await fbUpdateRecordField(voyageKey, mode, c.cn, 'tk', !!opt.flags.tk, inspector);
        setEditingIso(false);
        alert(`✅ 규격 변경 완료: ${opt.label}`);
      },
    });
  };

  const handleToggleXray = async () => {
    if (mode !== 'discharge') return;
    await fbToggleXray(voyageKey, c.cn);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        {/* 헤더 */}
        <div className={`sticky top-0 px-4 py-3 border-b border-slate-700 flex items-center justify-between ${
          sealError || xSealError ? 'bg-red-950' :
          isDone ? 'bg-emerald-950' :
          isXray ? 'bg-purple-950' :
          mode === 'discharge' ? 'bg-blue-950' : 'bg-amber-950'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black mono text-amber-300 tracking-wider">{c.l4 || c.cn?.slice(-4)}</span>
            <button onClick={() => speakContainer(c, { xray: isXray })} className="p-2 bg-slate-800/50 rounded-lg hover:bg-slate-700">
              <Volume2 className="w-4 h-4 text-amber-300"/>
            </button>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg">
            <X className="w-5 h-5 text-slate-400"/>
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-base mono text-slate-200 font-bold mb-2">
            {isBookingSlot(c) ? (
              <span className="text-amber-300">📝 컨번호 입력대기 <span className="text-[11px] text-slate-400 ml-1">({c.cn})</span></span>
            ) : c.cn}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(sealError || xSealError) && (
              <span className="bg-red-700 text-red-50 text-[11px] px-2 py-0.5 rounded font-black flex items-center gap-1">
                <AlertOctagon className="w-3 h-3"/>실오류 (세관 신고 대상)
              </span>
            )}
            {/* M5.79: 부킹 슬롯 (평택 적재 컨번호 미입력) */}
            {isBookingSlot(c) && <Badge color="amber">📝 컨번호 대기</Badge>}
            {isDone && <Badge color="emerald">✓ 완료 [{comp.by}]</Badge>}
            {isXray && <Badge color="purple">🔍 X-RAY</Badge>}
            {/* M5.79: DG 뱃지에 UN 화물명 짧게 — 길어서 다른 뱃지와 별도 줄 처리는 아래 박스에서 */}
            {isDG && (() => {
              const info = lookupUN(c.un);
              return (
                <Badge color="red">
                  <AlertTriangle className="w-3 h-3"/>
                  DG Cl.{info?.cls || c.dgc || '?'} UN{c.un}
                  {info && <span className="ml-1 opacity-90">· {info.name.split(/[\/(]/)[0].trim()}</span>}
                </Badge>
              );
            })()}
            {isReefer && <Badge color="cyan"><Snowflake className="w-3 h-3"/>RF{c.tmp ? ` ${c.tmp}°C` : ''}</Badge>}
            {c.fr && <Badge color="orange">Flat Rack</Badge>}
            {c.ot && <Badge color="yellow">Open Top</Badge>}
            {c.tk && <Badge color="pink">Tank</Badge>}
            {/* M4.9: ISO403 배지 */}
            {needsISO403Photo && (
              iso403PhotoTaken
                ? <Badge color="emerald"><Camera className="w-3 h-3"/>풀 리퍼 ✓</Badge>
                : <Badge color="blue"><Camera className="w-3 h-3"/>풀 리퍼 사진 필요</Badge>
            )}
          </div>

          {/* M5.79: DG 상세 정보 박스 (UN 화물명 + 위험 등급 + PG) */}
          {isDG && (
            <div className="mt-2 px-3 py-2 bg-red-950/40 border border-red-700/40 rounded-lg">
              <div className="text-[11px] text-red-200 leading-relaxed">
                <span className="font-black">⚠ 위험물: </span>
                {formatDgLabel(c.dgc, c.un)}
                {c.pg && (
                  <span className="ml-2 text-red-300/90">
                    · PG {c.pg === '1' ? 'I (높음)' : c.pg === '2' ? 'II (중간)' : c.pg === '3' ? 'III (낮음)' : c.pg}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* M4.9: ISO403 사진 의무 강조 박스 (미촬영 시) */}
          {needsISO403Photo && !iso403PhotoTaken && (
            <div className="mt-3 px-3 py-2 bg-blue-950/50 border-2 border-blue-600 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-xl">📷</span>
                <div className="flex-1">
                  <div className="text-xs font-black text-blue-200">풀 리퍼 사진 촬영 필요</div>
                  <div className="text-[11px] text-blue-300 mt-0.5">
                    이 컨테이너는 풀 리퍼입니다 (코드 {c.iso}). 온도 확인 사진 1장 촬영이 필요합니다.
                  </div>
                  <button onClick={() => setIso403PhotoOpen(true)}
                    className="mt-2 w-full py-2.5 bg-blue-700 hover:bg-blue-600 active:bg-blue-800 text-white rounded font-bold text-sm flex items-center justify-center gap-1.5">
                    <Camera className="w-4 h-4"/>📷 풀 리퍼 사진 촬영
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* M4.9: ISO403 사진 촬영 완료 시 - 다시 촬영/보기 */}
          {needsISO403Photo && iso403PhotoTaken && (
            <div className="mt-2 px-3 py-2 bg-emerald-950/30 border border-emerald-700/50 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400"/>
                <span className="text-xs font-bold text-emerald-200">풀 리퍼 사진 촬영 완료</span>
                {c.iso403_photo_by && (
                  <span className="text-[10px] text-emerald-400/80">({c.iso403_photo_by})</span>
                )}
              </div>
              <button onClick={() => setIso403PhotoOpen(true)}
                className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-emerald-50 rounded text-[10px] font-bold flex items-center gap-1">
                <Camera className="w-3 h-3"/>보기/재촬영
              </button>
            </div>
          )}

          {/* M3.5.6: 사진 보고 버튼 (실오류 / 데미지) */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button onClick={() => setPhotoMode('seal_error')}
              className="py-2 bg-red-900/40 hover:bg-red-900/60 active:bg-red-900/80 border border-red-700/50 text-red-200 rounded text-xs font-bold flex items-center justify-center gap-1">
              📷 실오류 보고
            </button>
            <button onClick={() => setPhotoMode('damage')}
              className="py-2 bg-amber-900/40 hover:bg-amber-900/60 active:bg-amber-900/80 border border-amber-700/50 text-amber-200 rounded text-xs font-bold flex items-center justify-center gap-1">
              📷 데미지 보고
            </button>
          </div>
        </div>

        {/* 위치 */}
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center justify-between">
            <span>{mode === 'loading' ? '선내 위치 (계획)' : '선내 위치'}</span>
            {/* M4.9e-fix: M3.87 "위치 변경" 버튼 제거.
                사용자 도메인 흐름: 계획은 EDI 단일 진실, 검수원은 실체만 결정.
                수정은 아래 "수정 위치 입력" (실체 위치) 한 곳에서만 처리. */}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-amber-400"/>
            {/* M4.9e-fix 2단계: 선적 모드에서 c.bay는 effective 위치(actual로 치환됨).
                계획 위치 표시는 _bay_planned 우선, 없으면 c.bay (양하 모드는 그대로) */}
            <span className="text-2xl font-black mono text-amber-300">{c._bay_planned || c.bay || '-'}</span>
            <span className="text-slate-500">/</span>
            <span className="text-xl font-bold mono text-slate-300">{c._row_planned || c.row || '--'}</span>
            <span className="text-slate-500">/</span>
            <span className="text-xl font-bold mono text-slate-300">{c._tier_planned || c.tier || '--'}</span>
            {!c.bay && mode === 'loading' && (
              <span className="ml-2 bg-orange-700 text-orange-50 text-[10px] px-1.5 py-0.5 rounded font-black">선적대상</span>
            )}
            {c.bay_orig !== undefined && ((c.bay || '') !== (c.bay_orig || '') || (c.row || '') !== (c.row_orig || '') || (c.tier || '') !== (c.tier_orig || '')) && (
              <span className="ml-2 bg-indigo-900 text-indigo-200 text-[10px] px-1.5 py-0.5 rounded font-bold">
                📍수정됨 · 원래 {c.bay_orig ? `${String(parseInt(c.bay_orig, 10)).padStart(2, '0')}-${c.row_orig}-${c.tier_orig}` : '미배정'}
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">베이 / 열 / 단</div>

          {/* M4.9d-fix: 선적 실체 위치 — 사용자 도메인:
              선적 EDI 위치는 계획(예정), 선적확인 시 실체 발생.
              현장에서 다른 위치에 적치된 경우 여기에 입력. */}
          {mode === 'loading' && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <div className="text-[10px] text-slate-500 font-bold uppercase mb-2 flex items-center justify-between">
                <span>실체 위치 (선적확인 시)</span>
                {!editingActualPos && (c.bay_actual || c.row_actual || c.tier_actual) ? (
                  <button onClick={handleClearActualPosition}
                    className="text-[10px] text-rose-400 hover:text-rose-300">삭제</button>
                ) : !editingActualPos ? (
                  <button onClick={() => {
                    setActualBay(c.bay_actual || c.bay || '');
                    setActualRow(c.row_actual || c.row || '');
                    setActualTier(c.tier_actual || c.tier || '');
                    setEditingActualPos(true);
                  }}
                  className="bg-cyan-700 hover:bg-cyan-600 text-cyan-50 px-2 py-1 rounded text-[10px] font-black flex items-center gap-1">
                    <Edit3 className="w-3 h-3"/>수정 위치 입력
                  </button>
                ) : null}
              </div>

              {!editingActualPos ? (
                (c.bay_actual || c.row_actual || c.tier_actual) ? (
                  // 수정된 실체 위치 표시 — 본위치 → 수정위치
                  <div className="flex items-center gap-2">
                    <span className="text-sm mono text-slate-400">{c._bay_planned || c.bay || '--'}/{c._row_planned || c.row || '--'}/{c._tier_planned || c.tier || '--'}</span>
                    <span className="text-cyan-400 font-bold">→</span>
                    <MapPin className="w-4 h-4 text-cyan-400"/>
                    <span className="text-lg font-black mono text-cyan-200">{c.bay_actual || '--'}</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-base font-bold mono text-cyan-200">{c.row_actual || '--'}</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-base font-bold mono text-cyan-200">{c.tier_actual || '--'}</span>
                    {c.actual_by && (
                      <span className="text-[10px] text-slate-400 ml-1">({c.actual_by})</span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    미입력 (계획 위치대로 선적 예정)
                  </div>
                )
              ) : (
                // 입력 모드
                <div className="space-y-2">
                  <div className="text-[10px] text-cyan-300">
                    계획: {c._bay_planned || c.bay || '--'}/{c._row_planned || c.row || '--'}/{c._tier_planned || c.tier || '--'} → 실제 적치 위치 입력
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[9px] text-slate-500 mb-0.5">베이</div>
                      <input type="text" value={actualBay}
                        onChange={e => setActualBay(e.target.value.toUpperCase())} {...NUM_INPUT_PROPS}
                        placeholder="01"
                        className="w-full bg-slate-800 border-2 border-cyan-700 rounded px-2 py-2 text-base font-bold mono text-cyan-100 focus:outline-none focus:border-cyan-400"
                        autoFocus/>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 mb-0.5">열(row)</div>
                      <input type="text" value={actualRow}
                        onChange={e => setActualRow(e.target.value.toUpperCase())} {...NUM_INPUT_PROPS}
                        placeholder="00"
                        className="w-full bg-slate-800 border-2 border-cyan-700 rounded px-2 py-2 text-base font-bold mono text-cyan-100 focus:outline-none focus:border-cyan-400"/>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 mb-0.5">단(tier)</div>
                      <input type="text" value={actualTier}
                        onChange={e => setActualTier(e.target.value.toUpperCase())} {...NUM_INPUT_PROPS}
                        placeholder="02"
                        className="w-full bg-slate-800 border-2 border-cyan-700 rounded px-2 py-2 text-base font-bold mono text-cyan-100 focus:outline-none focus:border-cyan-400"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setEditingActualPos(false); setActualBay(''); setActualRow(''); setActualTier(''); }}
                      className="py-2 bg-slate-700 text-slate-300 rounded text-xs font-bold">취소</button>
                    <button onClick={handleSaveActualPosition}
                      className="py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-bold">저장</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 화물 */}
        <div className="px-4 py-3 border-b border-slate-800">
          {/* M3.5.4-fix2: 규격 수정 영역 */}
          <div className={`mb-3 rounded p-2 ${editingIso ? 'bg-amber-900/20 border border-amber-700/40' : ''}`}>
            <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center justify-between">
              <span>규격 (ISO)</span>
              {!editingIso && (
                <button onClick={() => setEditingIso(true)}
                  className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[10px]">
                  <Edit3 className="w-3 h-3"/>실물과 다름?
                </button>
              )}
            </div>
            {!editingIso ? (
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold mono text-slate-100">{isoToLabel(c.iso) || c.tp || '-'}</span>
                  <span className="text-xs text-slate-500 mono">({c.iso || '-'})</span>
                  {/* V9.57(I10): c.iso_orig → 폴백 조회값(isoOrigShow) — 병합 누락으로 안 뜨던 표기 복원 */}
                  {isoOrigShow && isoOrigShow !== c.iso && (
                    <span className="text-[10px] text-amber-400 mono">원본: {isoOrigShow} → 수정됨</span>
                  )}
                </div>
                {/* M3.6: 알 수 없는 ISO 표기 → 사진 보고 강력 유도 */}
                {isUnknownIso(c.iso) && (
                  <div className="mt-2 px-3 py-2 bg-red-950/50 border-2 border-red-600 rounded-lg animate-pulse">
                    <div className="flex items-start gap-2">
                      <span className="text-xl">⚠️</span>
                      <div className="flex-1">
                        <div className="text-xs font-black text-red-200">알 수 없는 규격 표기</div>
                        <div className="text-[11px] text-red-300 mt-0.5">
                          "{c.iso}"는 처음 보는 표기입니다. 실물 사진 촬영 + 1항사 확인 부탁드립니다.
                        </div>
                        <button onClick={() => setPhotoMode('damage')}
                          className="mt-2 w-full py-2 bg-red-700 hover:bg-red-600 text-white rounded text-xs font-bold flex items-center justify-center gap-1">
                          📷 사진 촬영하기
                        </button>
                        {/* V9.21-01: 터미널 정보서비스 교차 확인 — 컨번호 자동 복사 후 조회창 (사용자 워크플로 실측) */}
                        <button onClick={async () => {
                          try { await navigator.clipboard.writeText(c.cn); } catch { /* 클립보드 실패 무해 */ }
                          window.open('https://pnct.co.kr/infoservice/index.html', '_blank');
                          alert(`컨번호 ${c.cn} 복사됨 — 터미널 조회창의 Container No에 붙여넣으세요`);
                        }}
                          className="mt-1.5 w-full py-2 bg-sky-800 hover:bg-sky-700 text-sky-50 rounded text-xs font-bold flex items-center justify-center gap-1">
                          🔎 터미널 조회 (컨번호 복사됨)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-[10px] text-amber-300 mb-2">
                  실물에 맞는 규격을 선택하세요. 검수원이 본 실물이 정답입니다.
                </div>
                <div className="grid grid-cols-1 gap-1 max-h-72 overflow-y-auto">
                  {ISO_OPTIONS.map(opt => (
                    <button key={opt.iso}
                      onClick={() => handleChangeIso(opt.iso)}
                      className={`px-3 py-2 rounded text-left text-xs font-bold border ${
                        c.iso === opt.iso
                          ? 'bg-amber-900/40 border-amber-500 text-amber-200'
                          : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                      }`}>
                      <div className="flex items-center justify-between">
                        <span className="mono">{opt.iso}</span>
                        <span className="text-[10px] text-slate-400">{opt.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setEditingIso(false)}
                  className="w-full mt-2 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs font-bold">
                  취소
                </button>
              </div>
            )}
          </div>

          {/* M3.5.4-fix3: 리퍼 온도 수정 (리퍼인 경우만 표시) */}
          {isReefer && (
            <div className={`mb-3 rounded p-2 ${editingTmp ? 'bg-cyan-900/20 border border-cyan-700/40' : ''}`}>
              <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Snowflake className="w-3 h-3 text-cyan-400"/>리퍼 온도
                </span>
                {!editingTmp && (
                  <button onClick={() => { setTmpVal(c.tmp || ''); setEditingTmp(true); }}
                    className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[10px]">
                    <Edit3 className="w-3 h-3"/>{c.tmp_missing || !c.tmp ? '온도 입력' : '수정'}
                  </button>
                )}
              </div>
              {!editingTmp ? (
                <div className="flex items-center gap-2">
                  {c.mkcon ? (
                    /* V9.23: 제작컨테이너 — 컨 자체가 상품(빈 컨). 온도 없음 정상 */
                    <span className="text-sm font-bold text-purple-300">🏭 제작컨테이너 (컨 자체가 상품 — 온도 없음 정상)</span>
                  ) : c.rfdry ? (
                    /* V9.20-03: 리퍼드라이(넌플러그) — 선사 요청으로 전원 안 꽂는 리퍼. 온도 없음 정상 */
                    <span className="text-sm font-bold text-teal-300">🔌 리퍼드라이 (넌플러그 — 온도 없음 정상)</span>
                  ) : c.tmp && !c.tmp_missing ? (
                    <span className="text-base font-bold mono text-cyan-200">{c.tmp}°C</span>
                  ) : c.fe === 'E' ? (
                    /* M3.75: 엠티 리퍼는 온도 없는 게 정상 */
                    <span className="text-sm font-bold text-cyan-400/80">엠티 리퍼 (온도 표시 정상)</span>
                  ) : (
                    <span className="text-sm font-bold text-red-300 animate-pulse">⚠️ 온도 미입력 (현장 확인 필요)</span>
                  )}
                  {/* V9.57(I10): c.tmp_orig → 폴백 조회값(tmpOrigShow) — 병합 누락으로 안 뜨던 표기 복원 */}
                  {tmpOrigShow !== undefined && tmpOrigShow !== c.tmp && (
                    <span className="text-[10px] text-amber-400 mono">원본: {tmpOrigShow || '(없음)'} → 수정됨</span>
                  )}
                  {/* V9.20-03: 리퍼드라이 토글 — 선사 요청(넌플러그) 반영. 경고·사진 대상에서 빠진다 */}
                  <button
                    onClick={async () => {
                      if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
                      const nv = !c.rfdry;
                      if (!window.confirm(nv ? '이 리퍼를 리퍼드라이(넌플러그)로 지정할까요?\n온도 경고·풀리퍼 사진 대상에서 제외됩니다.' : '리퍼드라이 지정을 해제할까요?')) return;
                      await fbUpdateRecordField(voyageKey, mode, c.cn, 'rfdry', nv, inspector);
                      c.rfdry = nv;   // 즉시 반영 (RTDB 구독이 곧 덮어씀)
                    }}
                    className={`ml-auto text-[10px] px-2 py-1 rounded font-bold border ${c.rfdry ? 'bg-teal-900 border-teal-500 text-teal-200' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                    {c.rfdry ? '드라이 해제' : '리퍼드라이 지정'}
                  </button>
                  {/* V9.23: 제작컨테이너 토글 — 컨 자체가 상품(빈 컨). 리퍼드라이와 별도 분류 (사용자 확정 2026-07-29) */}
                  <button
                    onClick={async () => {
                      if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
                      const nv = !c.mkcon;
                      if (!window.confirm(nv ? '이 컨테이너를 제작컨테이너(컨 자체가 상품·빈 컨)로 지정할까요?\n온도 경고·풀리퍼 사진 대상에서 제외됩니다.' : '제작컨테이너 지정을 해제할까요?')) return;
                      await fbUpdateRecordField(voyageKey, mode, c.cn, 'mkcon', nv, inspector);
                      c.mkcon = nv;   // 즉시 반영 (RTDB 구독이 곧 덮어씀)
                    }}
                    className={`text-[10px] px-2 py-1 rounded font-bold border ${c.mkcon ? 'bg-purple-900 border-purple-500 text-purple-200' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                    {c.mkcon ? '제작컨 해제' : '제작컨 지정'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] text-cyan-300">
                    실물 온도계를 보고 입력하세요. 빈칸 = 미입력 처리.
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={tmpVal}
                      onChange={e => setTmpVal(e.target.value)}
                      placeholder="예: -18, 4.5, 0"
                      className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-base font-bold text-cyan-100 focus:outline-none focus:border-cyan-400 mono"
                      autoFocus
                    />
                    <span className="text-slate-400 text-sm font-bold">°C</span>
                  </div>
                  {/* 빠른 선택 버튼 */}
                  <div className="grid grid-cols-5 gap-1">
                    {['-25', '-18', '-15', '0', '4'].map(t => (
                      <button key={t} onClick={() => setTmpVal(t)}
                        className="py-1.5 bg-slate-800 hover:bg-cyan-900/40 border border-slate-700 rounded text-xs font-bold text-slate-200 mono">
                        {t}°
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setEditingTmp(false)}
                      className="py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs font-bold">
                      취소
                    </button>
                    <button onClick={handleSaveTmp}
                      className="py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-bold">
                      💾 저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* M3.5.5: 엠티 실 부착/확인 (sealMode 있을 때만) */}
          {/* M4.9b: verify 모드 단순화 — TNJP/RZOR 등 verify 선박에서는
              경고 깜빡임 / 리씰·틀린실 라디오 강제 선택 제거.
              실 입력만 받고, 수정 이력은 자동 저장 (eseal_history),
              수정된 것만 별도 "엠티 수정 리포트"로 출력 가능 */}
          {sealMode && (
            <div className={`mb-3 rounded p-2 ${
              editingEseal
                ? (sealMode === 'attach' ? 'bg-red-900/20 border border-red-700/40' : 'bg-cyan-900/20 border border-cyan-700/40')
                : (sealMode === 'attach' && !c.eseal ? 'bg-red-950/30 border-2 border-red-600 animate-pulse' : '')
            }`}>
              <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Lock className={`w-3 h-3 ${sealMode === 'attach' ? 'text-red-400' : 'text-cyan-400'}`}/>
                  엠티 실 {sealMode === 'attach' ? '부착 (작업 필요)' : '표기'}
                </span>
                {!editingEseal && (
                  <span className="flex items-center gap-2">
                    {c.eseal && (
                      <button onClick={handleClearEseal}
                        className="hover:opacity-80 text-[10px] text-rose-400 hover:text-rose-300">
                        삭제
                      </button>
                    )}
                    <button onClick={() => { setEsealVal(c.eseal || ''); setEditingEseal(true); }}
                      className={`hover:opacity-80 flex items-center gap-1 text-[10px] ${
                        sealMode === 'attach' ? 'text-red-300' : 'text-cyan-400'
                      }`}>
                      <Edit3 className="w-3 h-3"/>{c.eseal ? '수정' : '실번호 입력'}
                    </button>
                  </span>
                )}
              </div>
              {!editingEseal ? (
                <div className="space-y-1">
                  {/* 기본 엠티실번호 */}
                  {c.eseal ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-base font-bold mono ${sealMode === 'attach' ? 'text-red-200' : 'text-cyan-200'}`}>
                        🔒 {c.eseal}
                      </span>
                      {c.eseal_by && (
                        <span className="text-[10px] text-slate-400">
                          ({c.eseal_by}, {c.eseal_at ? new Date(c.eseal_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''})
                        </span>
                      )}
                      {/* M4.9b: 수정 이력 있으면 작은 표시 (경고 아님, 단순 정보) */}
                      {Array.isArray(c.eseal_history) && c.eseal_history.length > 0 && (
                        <span className="text-[10px] text-slate-500 font-bold">
                          (수정 {c.eseal_history.length}회)
                        </span>
                      )}
                    </div>
                  ) : (
                    /* M4.9b: verify 모드는 깜빡 경고 제거. attach만 깜빡임 (실제 부착 작업 필요) */
                    sealMode === 'attach' ? (
                      <span className="text-sm font-bold animate-pulse text-red-300">
                        ⚠️ 실 부착 필요
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">
                        실번호 미입력
                      </span>
                    )
                  )}
                  {/* M4.9b: verify 모드의 옛 틀린실/리씰 표시는 호환 위해 유지 (이미 저장된 데이터 있을 수 있음) */}
                  {c.eseal_wrong && (
                    <div className="flex items-center gap-2 mt-1 px-2 py-1 bg-amber-950/40 border border-amber-700/40 rounded">
                      <span className="text-[10px] text-amber-400 font-bold">⚠️ 실오류</span>
                      <span className="text-sm font-bold mono text-amber-200">{c.eseal_wrong}</span>
                      <button onClick={handleClearEsealWrong}
                        className="ml-auto text-[10px] text-amber-400 hover:text-amber-200">삭제</button>
                    </div>
                  )}
                  {c.reseal && (
                    <div className="flex items-center gap-2 mt-1 px-2 py-1 bg-purple-950/40 border border-purple-700/40 rounded">
                      <span className="text-[10px] text-purple-400 font-bold">🔄 리씰</span>
                      <span className="text-sm font-bold mono text-purple-200">{c.reseal}</span>
                      <button onClick={handleClearReseal}
                        className="ml-auto text-[10px] text-purple-400 hover:text-purple-200">삭제</button>
                    </div>
                  )}

                  {/* M4.9b-fix: 실오류 / 리씰 액션 버튼 — 사용자 요청
                      - 실오류: 발견된 잘못된 번호를 별도 기록 (eseal_wrong)
                      - 리씰:   실 없거나 손상되어 새로 부착한 번호 (reseal) */}
                  {!editingEsealWrong && !editingReseal && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button onClick={() => { setEsealWrongVal(''); setEditingEsealWrong(true); }}
                        className="py-1.5 bg-amber-900/40 hover:bg-amber-900/60 border border-amber-700/50 text-amber-200 rounded text-xs font-bold flex items-center justify-center gap-1">
                        ⚠️ 실오류 등록
                      </button>
                      <button onClick={() => { setResealVal(''); setEditingReseal(true); }}
                        className="py-1.5 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-700/50 text-purple-200 rounded text-xs font-bold flex items-center justify-center gap-1">
                        🔄 리씰 등록
                      </button>
                    </div>
                  )}

                  {/* 실오류 입력 폼 */}
                  {editingEsealWrong && (
                    <div className="mt-2 p-2 bg-amber-950/30 border border-amber-700/50 rounded space-y-2">
                      <div className="text-[10px] text-amber-300 font-bold">
                        ⚠️ 실오류 — 현장에서 발견한 실제 번호 입력 (계획 번호와 다름)
                      </div>
                      <input
                        type="text"
                        value={esealWrongVal}
                        onChange={e => setEsealWrongVal(e.target.value.toUpperCase())} {...NUM_INPUT_PROPS}
                        placeholder="실제 발견 실번호"
                        className="w-full bg-slate-800 border-2 border-amber-700 rounded px-3 py-2 text-base font-bold mono text-amber-100 focus:outline-none focus:border-amber-400"
                        autoFocus
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => { setEditingEsealWrong(false); setEsealWrongVal(''); }}
                          className="py-2 bg-slate-700 text-slate-300 rounded text-xs font-bold">취소</button>
                        <button onClick={handleSaveEsealWrong}
                          className="py-2 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-bold">저장</button>
                      </div>
                    </div>
                  )}

                  {/* 리씰 입력 폼 */}
                  {editingReseal && (
                    <div className="mt-2 p-2 bg-purple-950/30 border border-purple-700/50 rounded space-y-2">
                      <div className="text-[10px] text-purple-300 font-bold">
                        🔄 리씰 — 실이 없거나 손상되어 새로 부착한 실번호 입력
                      </div>
                      <input
                        type="text"
                        value={resealVal}
                        onChange={e => setResealVal(e.target.value.toUpperCase())} {...NUM_INPUT_PROPS}
                        placeholder="새로 부착한 실번호"
                        className="w-full bg-slate-800 border-2 border-purple-700 rounded px-3 py-2 text-base font-bold mono text-purple-100 focus:outline-none focus:border-purple-400"
                        autoFocus
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => { setEditingReseal(false); setResealVal(''); }}
                          className="py-2 bg-slate-700 text-slate-300 rounded text-xs font-bold">취소</button>
                        <button onClick={handleSaveReseal}
                          className="py-2 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs font-bold">저장</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className={`text-[10px] ${sealMode === 'attach' ? 'text-red-300' : 'text-cyan-300'}`}>
                    {sealMode === 'attach'
                      ? '실 부착 후 실번호를 입력하세요. POD: ' + (c.pod || '?')
                      : (c.eseal
                          ? '기존: ' + c.eseal + ' → 새 번호 입력 (이력 자동 기록)'
                          : '엠티에 부착된 실번호를 입력하세요')}
                  </div>
                  <input
                    type="text"
                    value={esealVal}
                    onChange={e => setEsealVal(e.target.value.toUpperCase())} {...NUM_INPUT_PROPS}
                    placeholder="실번호 (예: ABC1234)"
                    className={`w-full bg-slate-800 border-2 rounded px-3 py-2 text-base font-bold mono focus:outline-none ${
                      sealMode === 'attach'
                        ? 'border-red-700 text-red-100 focus:border-red-400'
                        : 'border-cyan-700 text-cyan-100 focus:border-cyan-400'
                    }`}
                    autoFocus
                  />
                  {/* M4.9b: 라디오 강제 선택 제거 — 단순 덮어쓰기, 이력 자동 저장 */}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setEditingEseal(false)}
                      className="py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs font-bold">
                      취소
                    </button>
                    <button onClick={handleSaveEseal}
                      className={`py-2 rounded text-xs font-bold text-white ${
                        sealMode === 'attach' ? 'bg-red-700 hover:bg-red-600' : 'bg-cyan-700 hover:bg-cyan-600'
                      }`}>
                      저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 나머지 필드 */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="F/E" value={c.fe || '-'} highlight={c.fe === 'F' ? 'rose' : ''}/>
            <Field label="무게" value={c.wt > 0 ? formatWt(c.wt) : '-'}/>
            <Field label="검수업체" value={c.op || '-'} mono/>
            <Field label="POL" value={c.pol || '-'} mono/>
            <Field label="POD" value={c.pod || '-'} mono/>
            {c.npod && <Field label="환적(76)" value={c.npod} mono/>}
            {/* M5.79: LOC+83 환적항 + LOC+97/98 최종 목적지 */}
            {c.tspot && c.tspot !== c.pod && (
              <Field label="환적항(83)" value={c.tspot} mono highlight="amber"/>
            )}
            {c.fpod && c.fpod !== c.pod && c.fpod !== c.tspot && (
              <Field label="최종지(97)" value={c.fpod} mono highlight="purple"/>
            )}
          </div>
          {/* M8.07: 품명(내용물) — 평소 숨김. 이상 발생 시 탭하여 확인. desc 있을 때만. */}
          {c.desc && (
            <div className="mt-2">
              <button
                onClick={() => setShowDesc(v => !v)}
                className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-800/40 border border-slate-700/50 rounded text-[11px] text-slate-400 font-bold"
              >
                <span>📦 내용물 {showDesc ? '숨기기' : '보기'}</span>
                <span>{showDesc ? '▲' : '▼'}</span>
              </button>
              {showDesc && (
                <div className="mt-1 px-2 py-2 bg-slate-900/60 border border-slate-700/40 rounded text-[12px] text-slate-200 break-words whitespace-pre-wrap">
                  {c.desc}
                </div>
              )}
            </div>
          )}
          {/* M5.79: 2단 환적 경고 — POD를 거쳐 다시 환적되는 화물 */}
          {c.tspot && c.tspot !== c.pod && c.pod && (
            <div className="mt-2 px-2 py-1.5 bg-amber-950/40 border border-amber-700/40 rounded text-[11px] text-amber-200 font-bold">
              🔁 2단 환적: <span className="mono">{c.pol}</span> → <span className="mono">{c.pod}</span> → <span className="mono">{c.tspot}</span>
              {c.fpod && c.fpod !== c.tspot && <> → <span className="mono">{c.fpod}</span></>}
            </div>
          )}
        </div>

        {/* 실번호 */}
        <div className={`px-4 py-3 border-b border-slate-800 ${sealError ? 'bg-red-950/30' : ''}`}>
          <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center justify-between">
            <span>실번호 (Seal No)</span>
            {sealError && <span className="text-red-400 font-black">⚠ 실오류</span>}
          </div>
          {sealError && (
            <div className="bg-red-950/50 border border-red-700/50 rounded p-2 mb-2 text-[11px]">
              <div className="text-red-300 font-bold mb-0.5">세관 신고 양식:</div>
              <div className="mono text-red-100">원실번호 <span className="font-black">{slOrig}</span> → 실제 <span className="font-black">{c.sl}</span></div>
            </div>
          )}
          {editingSeal ? (
            <div className="flex gap-2">
              <input type="text" value={sealVal}
                onChange={e => setSealVal(e.target.value.toUpperCase())} {...NUM_INPUT_PROPS}
                className="flex-1 bg-slate-800 border border-amber-500 rounded px-3 py-2 mono text-amber-200 focus:outline-none"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSaveSeal()}/>
              <button onClick={handleSaveSeal} className="px-3 py-2 bg-emerald-700 text-emerald-100 rounded font-bold">저장</button>
              <button onClick={() => { setEditingSeal(false); setSealVal(c.sl || ''); }} className="px-3 py-2 bg-slate-700 text-slate-300 rounded">취소</button>
            </div>
          ) : (
            <button onClick={() => setEditingSeal(true)} className="flex items-center gap-2 w-full text-left">
              {c.sl ? (
                <span className={`text-lg mono font-bold ${sealError ? 'text-red-300' : 'text-amber-200'}`}>{c.sl}</span>
              ) : c.fe === 'E' ? (
                // M3.88: 엠티는 실번호 없는 게 정상
                <span className="text-lg mono font-bold text-slate-300">📦 엠티 (실번호 없음)</span>
              ) : (
                <span className="text-lg mono font-bold text-slate-600 italic">미입력</span>
              )}
              <Edit3 className="w-4 h-4 text-slate-500"/>
            </button>
          )}
          {slHistory.length > 0 && (
            <button onClick={() => setShowHistory(!showHistory)}
              className="mt-2 text-[10px] text-slate-400 hover:text-slate-300 flex items-center gap-1">
              <History className="w-3 h-3"/>수정 이력 ({slHistory.length}회) {showHistory ? '▾' : '▸'}
            </button>
          )}
          {showHistory && slHistory.length > 0 && (
            <div className="mt-1.5 bg-slate-950 rounded p-2 space-y-1 text-[10px] mono">
              {slHistory.map((h, i) => (
                <div key={i} className="text-slate-400">
                  <span className="text-slate-500">{new Date(h.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-emerald-400 ml-1">[{h.by}]</span>
                  <span className="text-slate-600 ml-1">{h.from || '∅'}</span>
                  <span className="text-slate-500 mx-1">→</span>
                  <span className="text-slate-200">{h.to || '∅'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* X-RAY 봉인 (양하 X-RAY 대상) */}
        {mode === 'discharge' && isXray && (
          <div className={`px-4 py-3 border-b border-slate-800 ${xSealError ? 'bg-red-950/30' : 'bg-purple-950/20'}`}>
            <div className="text-[10px] text-purple-400 font-bold uppercase mb-1 flex items-center justify-between">
              <span>X-RAY 봉인 (세관 + 전자)</span>
              {xSealError && <span className="text-red-400 font-black">⚠ 실오류</span>}
            </div>
            {xSealError && (
              <div className="bg-red-950/50 border border-red-700/50 rounded p-2 mb-2 text-[11px]">
                <div className="text-red-300 font-bold mb-0.5">세관 신고 양식:</div>
                <div className="mono text-red-100">원봉인 <span className="font-black">{xSealOrig}</span> → 실제 <span className="font-black">{xSeal}</span></div>
              </div>
            )}
            {editingXSeal ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-purple-400">세관봉인</label>
                  <input type="text" value={xSealVal}
                    onChange={e => setXSealVal(e.target.value.toUpperCase())}
                    className="w-full bg-slate-800 border border-purple-500 rounded px-3 py-2 mono text-purple-200 focus:outline-none"
                    autoFocus/>
                </div>
                <div>
                  <label className="text-[10px] text-cyan-400">전자봉인 (E-Seal)</label>
                  <input type="text" value={xEsealVal}
                    onChange={e => setXEsealVal(e.target.value.toUpperCase())}
                    className="w-full bg-slate-800 border border-cyan-600 rounded px-3 py-2 mono text-cyan-200 focus:outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleSaveXSeal()}/>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveXSeal} className="flex-1 px-3 py-2 bg-emerald-700 text-emerald-100 rounded font-bold">저장</button>
                  <button onClick={() => { setEditingXSeal(false); setXSealVal(xraySeal?.seal || ''); setXEsealVal(xraySeal?.eseal || ''); }} className="px-3 py-2 bg-slate-700 text-slate-300 rounded">취소</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditingXSeal(true)} className="w-full text-left space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">세관:</span>
                  <span className={`text-base mono font-bold ${xSeal ? (xSealError ? 'text-red-300' : 'text-purple-200') : 'text-slate-600 italic'}`}>{xSeal || '미입력'}</span>
                  <Edit3 className="w-3.5 h-3.5 text-slate-500"/>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">전자:</span>
                  <span className={`text-base mono font-bold ${xraySeal?.eseal ? 'text-cyan-200' : 'text-slate-600 italic'}`}>{xraySeal?.eseal || '미입력'}</span>
                </div>
              </button>
            )}
            {xHistory.length > 0 && (
              <details className="mt-2">
                <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-300">
                  <History className="w-3 h-3 inline mr-1"/>수정 이력 ({xHistory.length}회)
                </summary>
                <div className="mt-1.5 bg-slate-950 rounded p-2 space-y-1 text-[10px] mono">
                  {xHistory.map((h, i) => (
                    <div key={i} className="text-slate-400">
                      <span className="text-slate-500">{new Date(h.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-emerald-400 ml-1">[{h.by}]</span>
                      <div className="ml-3 text-[9px]">
                        <span className="text-slate-600">세관: {h.from?.seal || '∅'}</span>
                        <span className="text-slate-500 mx-1">→</span>
                        <span className="text-purple-200">{h.to?.seal || '∅'}</span>
                      </div>
                      <div className="ml-3 text-[9px]">
                        <span className="text-slate-600">전자: {h.from?.eseal || '∅'}</span>
                        <span className="text-slate-500 mx-1">→</span>
                        <span className="text-cyan-200">{h.to?.eseal || '∅'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {c.bl && (
          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">B/L</div>
            <div className="mono text-sm text-slate-300">{c.bl}</div>
          </div>
        )}

        {/* 액션 */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-3 flex gap-2">
          {mode === 'discharge' && (
            <button onClick={handleToggleXray}
              className={`px-4 py-3 rounded-lg font-bold text-sm ${
                isXray ? 'bg-purple-700 text-purple-100' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}>
              🔍 {isXray ? '해제' : '추가'}
            </button>
          )}
          <button onClick={handleComplete}
            className={`flex-1 py-3 rounded-lg font-black text-base ${
              isDone
                ? 'bg-rose-800 hover:bg-rose-700 text-rose-100'
                : 'bg-emerald-700 hover:bg-emerald-600 text-emerald-100'
            }`}>
            {isDone
              ? <><RotateCcw className="w-5 h-5 inline mr-1"/>{mode === 'discharge' ? '양하확인 취소' : '선적확인 취소'}</>
              : <><Check className="w-5 h-5 inline mr-1"/>{mode === 'discharge' ? '양하확인' : '선적확인'}</>
            }
          </button>
        </div>
      </div>

      {/* M3.5.6: 사진 보고 모달 */}
      {photoMode && (
        <PhotoReportModal
          open={!!photoMode}
          type={photoMode}
          c={c}
          voyageKey={voyageKey}
          voyage={{ info: voyageInfo }}
          equipNo={getEquipNumber()}
          onClose={() => setPhotoMode(null)}
        />
      )}

      {/* M4.9: ISO403 사진 촬영 모달 */}
      <ISO403PhotoModal
        open={iso403PhotoOpen}
        c={c}
        voyageKey={voyageKey}
        mode={mode}
        inspector={inspector}
        onClose={() => setIso403PhotoOpen(false)}
      />

      {/* M3.74: confirm() → ConfirmModal */}
      <ConfirmModal {...confirmState} />

      {/* M3.87: 위치 수정 모달 (선적 모드) */}
      <PositionEditModal
        open={showPosEdit}
        container={{ ...c, _comp: comp, _mode: c._mode || mode }}
        allContainers={allContainers}
        onClose={() => setShowPosEdit(false)}
        onSave={async (newBay, newRow, newTier) => {
          if (!inspector) { alert('검수원을 먼저 선택하세요'); return { ok: false }; }
          // V8.71: 수동 위치 지정 — 밀려나는 컨은 미배정 (자동 재배정 금지)
          // V9.52: 자리 교환 — 밀려난 컨은 이 컨의 옛 자리로 (미배정 떠돌이 방지, 지침 현장 규칙)
          const result = await fbReassignContainerPosition(voyageKey, mode, c.cn, newBay, newRow, newTier, inspector);
          return result;
        }}
        bayPairs={posEditBayPairs}
        onSavePartner={async (cn, b2, r2, t2) => fbReassignContainerPosition(voyageKey, mode, cn, b2, r2, t2, inspector)}   /* V9.52: 자리 교환 */
        onCompleteBoth={async (cns) => {
          for (const cn of cns) await fbCompleteContainer(voyageKey, mode, cn, inspector);
          // V8.70: 자동 선적확인 완료 음성 — 무음 오해 방지.
          cns.forEach((cn2, i) => setTimeout(() => speakDone({ cn: cn2 }), i * 900));
        }}
        workBay={workBay}
        workTier={workTier}
      />
    </div>
  );
}

function Badge({ color, children }) {
  const map = {
    emerald: 'bg-emerald-700/60 text-emerald-100',
    purple: 'bg-purple-700/60 text-purple-100',
    red: 'bg-red-700/60 text-red-100',
    cyan: 'bg-cyan-700/60 text-cyan-100',
    orange: 'bg-orange-700/60 text-orange-100',
    yellow: 'bg-yellow-700/60 text-yellow-100',
    pink: 'bg-pink-700/60 text-pink-100',
    blue: 'bg-blue-700/60 text-blue-100',
  };
  return <span className={`${map[color]} text-[11px] px-2 py-0.5 rounded font-black flex items-center gap-1`}>{children}</span>;
}

function Field({ label, value, mono, highlight }) {
  const colors = { rose: 'text-rose-400' };
  return (
    <div>
      <div className="text-[10px] text-slate-500 font-bold uppercase">{label}</div>
      <div className={`text-base ${mono ? 'mono' : ''} ${colors[highlight] || 'text-slate-200'} font-bold`}>{value}</div>
    </div>
  );
}
