// src/components/ShipMatrixBuilderModal.jsx — M6.94.0
// 베이사전 빌더 (사용자 원칙):
//   - 좌측: 베이 편집 (선박 메타 + 베이별 tier/cells/padding)
//   - 우측: 선택한 베이 시뮬레이션 (= 베이플랜, 빈 카고플랜 박스)
//   - 사용자 저장 후 AI 절대 수정 금지 (M6.94.0)
//   - 베이 복사 기능 (같은 사이즈 베이 일괄 적용)

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { engChange, toEnglishUpper as toEngU, ENG_INPUT_PROPS, NUM_INPUT_PROPS } from '../inputUtils.js';
import {
  buildMatrixFromEdi,
  augmentMatrixFromBayDict,
  augmentMatrixFromPdf,
  matrixToBayDictEntry,
  bayDictEntryToMatrix,
  extractShipMetaFromVoyage,
  summarizeMatrix,
  createEmptyBayEntry,
  detectMissingBays,
  fillEmptyBaysSequential,
  augmentMatrixFromDef,
} from '../shipMatrixBuilder.js';
import { findSimilarShips, verifyMatrixFit, detectBlockedCells } from '../shipMatchFinder.js';
import { parsePdfStowage } from '../pdfBayParser.js';
import { parseDefSections } from '../defSectionParser.js';
import { addToUserBayDict, lookupUserBayDict, loadUserBayDict, removeFromUserBayDict } from '../data/userBayDict.js';
import {
  fbSubscribeMatrixEditors, fbSetMatrixEditors, fbSaveShipBayDict,
  fbBatchSaveShipBayDict, fbDeleteShipBayDict,
} from '../firebase.js';
import { _storage, SK } from '../utils.js';
// M6.94.0: 빈 카고플랜 박스 시각 미리보기 (베이플랜)
import { BayBoxV2, CARGO_V2_CSS } from './PrintableCargoPlanV2.jsx';
import { buildEmptyBayRenderData } from '../cargoPlanCore.js';

export default function ShipMatrixBuilderModal({ voyage, containers, onClose, onSaved }) {
  const [matrix, setMatrix] = useState(null);
  // 선박 메타 자동 채움 (voyage.info의 EDI 자동 추출 데이터)
  const autoMeta = useMemo(() => extractShipMetaFromVoyage(voyage), [voyage]);
  const [shipMeta, setShipMeta] = useState(autoMeta);
  const [editMeta, setEditMeta] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('idle');
  const [defStatus, setDefStatus] = useState('idle');   // V7.36 .def 업로드
  const [defError, setDefError] = useState('');
  const defInputRef = useRef(null);
  // V7.99: 기존 선박 복제 — 등록된 베이사전에서 같은 구조 선박 골라 매트릭스 복제
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneList, setCloneList] = useState([]);   // [{code, name, callsign, bayCount}]
  const [cloneFit, setCloneFit] = useState(null);   // V7.99-3: 복제본에 현재 EDI 얹은 수용률 검증
  const [pdfError, setPdfError] = useState('');
  const fileInputRef = useRef(null);
  const [savingMsg, setSavingMsg] = useState('');
  const [done, setDone] = useState(false);
  // 베이 추가 폼 상태
  const [addBayInput, setAddBayInput] = useState('');
  const [addPairInput, setAddPairInput] = useState('');

  // ── M6.94.20: 매트릭스 권한자 ──────────────────────────────────────────
  //   현재 검수자(activeInspector)가 Firebase 권한자 명단에 있어야 저장/명단수정 가능.
  const currentInspector = useMemo(
    () => String(_storage.get(SK.activeInspector) || '').trim(),
    []
  );
  const [editors, setEditors] = useState(null);     // null = 로딩중
  const [showEditorMgr, setShowEditorMgr] = useState(false);
  const [editorInput, setEditorInput] = useState('');
  const [editorMsg, setEditorMsg] = useState('');
  const [bulkSyncMsg, setBulkSyncMsg] = useState('');
  const [bulkSyncing, setBulkSyncing] = useState(false);

  useEffect(() => {
    const unsub = fbSubscribeMatrixEditors(list => setEditors(list || []));
    return () => { try { unsub && unsub(); } catch { /* noop */ } };
  }, []);

  // 권한 판정: 명단 로딩 전(null)에는 false로 취급 (안전).
  const canEdit = useMemo(() => {
    if (!Array.isArray(editors)) return false;
    return !!currentInspector && editors.includes(currentInspector);
  }, [editors, currentInspector]);

  const addBay = (bayNumRaw, pairEvenRaw) => {
    const n = parseInt(bayNumRaw);
    if (!Number.isFinite(n) || n < 1 || n > 999) {
      alert('베이 번호는 1~999 사이여야 합니다');
      return;
    }
    const bay = String(n).padStart(3, '0');
    if (matrix.byBay[bay]) {
      alert(`BAY ${bay}는 이미 존재합니다`);
      return;
    }
    const pairEven = pairEvenRaw && parseInt(pairEvenRaw) > 0
      ? String(parseInt(pairEvenRaw)).padStart(2, '0')
      : null;
    setMatrix(m => ({
      ...m,
      byBay: { ...m.byBay, [bay]: createEmptyBayEntry(bay, pairEven) },
    }));
    setAddBayInput('');
    setAddPairInput('');
  };

  const deleteBay = (bay) => {
    if (!confirm(`BAY ${bay} 삭제하시겠습니까?`)) return;
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      delete cp.byBay[bay];
      return cp;
    });
  };

  // V9.04: 사용불가 셀(선박 구조상 없는 자리) 토글 — XTPG BAY25 80티어처럼 한 티어에
  //   로우가 부분 부분만 있는 구조를 표현. 저장은 기존 blockedCells 필드(V7.99-4) 재사용이라
  //   베이플랜·카고플랜·3D가 같은 데이터를 읽는다.
  const toggleBlockedCell = (bay, kind, tier, row) => {
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      const entry = { ...cp.byBay[bay] };
      const key = kind === 'deck' ? 'deckBlocked' : 'holdBlocked';
      const bc = {
        deckBlocked: [...(entry.blockedCells?.deckBlocked || [])],
        holdBlocked: [...(entry.blockedCells?.holdBlocked || [])],
      };
      const rowP = String(row).padStart(2, '0');
      const idx = bc[key].findIndex(x => Number(x.tier) === Number(tier) && String(x.row).padStart(2, '0') === rowP);
      if (idx >= 0) bc[key].splice(idx, 1);
      else bc[key].push({ tier: Number(tier), row: rowP });
      if (!bc.deckBlocked.length && !bc.holdBlocked.length) delete entry.blockedCells;
      else entry.blockedCells = bc;
      cp.byBay[bay] = entry;
      return cp;
    });
  };

  const addTier = (bay, kind, tierValueRaw) => {
    const v = parseInt(tierValueRaw);
    if (!Number.isFinite(v) || v < 1 || v > 99) {
      alert('Tier 번호는 1~99 사이여야 합니다');
      return;
    }
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      const entry = { ...cp.byBay[bay] };
      const tKey = kind === 'deck' ? 'deckTiers' : 'holdTiers';
      const cKey = kind === 'deck' ? 'deckCells' : 'holdCells';
      const tiers = [...(entry[tKey] || [])];
      if (tiers.includes(v)) {
        alert(`Tier ${v}은 이미 존재합니다`);
        return cp;
      }
      tiers.push(v);
      // 정렬: deck = 큰 수부터, hold = 큰 수부터 (배열 순서가 top→bottom)
      tiers.sort((a, b) => b - a);
      // cells 동기화: 동일 인덱스에 rowCount 값 채워넣기
      const cells = [...(entry[cKey] || [])];
      const newIdx = tiers.indexOf(v);
      cells.splice(newIdx, 0, entry.rowCount || 9);
      entry[tKey] = tiers;
      entry[cKey] = cells;
      cp.byBay[bay] = entry;
      return cp;
    });
  };

  const deleteTier = (bay, kind, idx) => {
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      const entry = { ...cp.byBay[bay] };
      const tKey = kind === 'deck' ? 'deckTiers' : 'holdTiers';
      const cKey = kind === 'deck' ? 'deckCells' : 'holdCells';
      entry[tKey] = (entry[tKey] || []).filter((_, i) => i !== idx);
      entry[cKey] = (entry[cKey] || []).filter((_, i) => i !== idx);
      cp.byBay[bay] = entry;
      return cp;
    });
  };

  const updateTier = (bay, kind, idx, newVal) => {
    const v = parseInt(newVal);
    if (!Number.isFinite(v)) return;
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      const entry = { ...cp.byBay[bay] };
      const tKey = kind === 'deck' ? 'deckTiers' : 'holdTiers';
      const tiers = [...(entry[tKey] || [])];
      tiers[idx] = v;
      entry[tKey] = tiers;
      cp.byBay[bay] = entry;
      return cp;
    });
  };

  // 초기 분석 (저장된 entry 우선 → 없으면 EDI + 베이사전) — 마운트 시 1회만
  const initAnalyzedRef = useRef(false);
  useEffect(() => {
    if (initAnalyzedRef.current) return;
    // 1) 사용자가 이전에 저장한 매트릭스 있으면 그것 우선 복원 (사용자 작업 보호)
    const saved = lookupUserBayDict(autoMeta.imo, autoMeta.code);
    if (saved?.bayDef?.baysSummary?.length > 0) {
      const restored = bayDictEntryToMatrix(saved);
      if (restored) {
        if (saved.provisional || saved.bayDef?.provisional) restored.provisional = true;   // V7.99-5: 보정중 복원
        setMatrix(restored);
        initAnalyzedRef.current = true;
        return;
      }
    }
    // 2) 저장 없으면 EDI 분석 + 1~max 자동 채움
    if (!containers || containers.length === 0) {
      setMatrix({ byBay: {}, _empty: true });
      initAnalyzedRef.current = true;
      return;
    }
    const m1 = buildMatrixFromEdi(containers);
    const m2 = augmentMatrixFromBayDict(m1, autoMeta.imo, autoMeta.code);
    const m3 = fillEmptyBaysSequential(m2);  // 1~max 추정 베이 자동 추가
    setMatrix(m3);
    initAnalyzedRef.current = true;
  }, [containers, autoMeta.imo, autoMeta.code]);

  const handlePdfUpload = async (file) => {
    if (!file) return;
    setPdfStatus('parsing'); setPdfError('');
    try {
      const result = await parsePdfStowage(file);
      if (result.shipName && !shipMeta.name) {
        setShipMeta(m => ({ ...m, name: result.shipName }));
      }
      let merged = augmentMatrixFromPdf({ ...matrix }, result);
      merged = fillEmptyBaysSequential(merged); // PDF 보강 후 1~max 다시 채움
      setMatrix(merged);
      setPdfStatus('done');
    } catch (err) {
      console.error('[ShipMatrixBuilder] PDF parse error:', err);
      setPdfError(err.message || 'PDF 파싱 실패');
      setPdfStatus('error');
    }
  };

  // V7.36: .def(CASP) 업로드 → 단면 디코드 → 베이매트릭스 자동 생성
  const handleDefUpload = async (file) => {
    if (!file) return;
    setDefStatus('parsing'); setDefError('');
    try {
      const buf = await file.arrayBuffer();
      const result = parseDefSections(new Uint8Array(buf));
      if (result.error) throw new Error(`${result.error} (포맷 ${result.format || '?'})`);
      if (result.vesselName && !shipMeta.name) {
        setShipMeta(m => ({ ...m, name: result.vesselName }));
      }
      if (result.callsign && !shipMeta.callsign) {
        setShipMeta(m => ({ ...m, callsign: result.callsign }));
      }
      let merged = augmentMatrixFromDef({ ...matrix }, result);
      merged = fillEmptyBaysSequential(merged);
      setMatrix(merged);
      setDefStatus('done');
    } catch (err) {
      console.error('[ShipMatrixBuilder] DEF parse error:', err);
      setDefError(err.message || '.def 파싱 실패');
      setDefStatus('error');
    }
  };

  // V7.99: 기존 선박 복제 패널 열기 — 등록된 베이사전 목록 로드
  //   같은 베이 구조의 선박(예: 자매선)을 골라 매트릭스만 복제, 선박 메타는 현재 입력값 유지.
  const openClone = () => {
    const dict = loadUserBayDict();
    // V7.99: 현재 매트릭스 구조와 가장 비슷한 선박 자동 추천 (점수 내림차순).
    //   매트릭스가 있으면 findSimilarShips로 일치도 계산, 없으면 이름순 폴백.
    let list;
    const hasMatrix = matrix && matrix.byBay && Object.keys(matrix.byBay).length > 0;
    if (hasMatrix) {
      const ranked = findSimilarShips(matrix, dict, { minBays: 1 });
      // V7.99-3: 각 후보에 현재 EDI를 얹은 실제 수용률도 미리 계산(있으면 정렬·표시에 활용).
      const hasEdi = containers && containers.length > 0;
      list = ranked.map(r => {
        let fitPct = null;
        if (hasEdi) {
          try {
            const fm = bayDictEntryToMatrix(dict[r.code]);
            const v = verifyMatrixFit(fm, containers);
            fitPct = v.total ? v.fit / v.total : null;
          } catch { fitPct = null; }
        }
        return {
          code: r.code, name: r.name, callsign: r.callsign,
          bayCount: r.bayCount, score: r.score, fitPct,
        };
      });
      // 정렬 원칙(중요): 수용률만으로 정렬 금지.
      //   더 큰 배는 작은 배 컨테이너를 다 받아 수용률↑이지만 빈 베이가 많아 카고플랜이 어긋남.
      //   "다 보임"은 필요조건일 뿐 — 구조(크기·프레임)가 맞는 후보 중에서 수용률 최고를 고름.
      //   → 종합 키 = 구조점수와 수용률을 함께 본다(구조 0.55 + 수용률 0.45).
      if (hasEdi) {
        list.sort((a, b) => {
          const ka = a.score * 0.55 + (a.fitPct ?? 0) * 0.45;
          const kb = b.score * 0.55 + (b.fitPct ?? 0) * 0.45;
          return kb - ka;
        });
      }
    } else {
      list = Object.entries(dict)
        .map(([code, e]) => {
          const bays = (e?.bayDef?.baysSummary || [])
            .filter(b => { const n = parseInt(b?.bay, 10); return Number.isFinite(n) && n > 0; });
          return { code, name: e?.name || '', callsign: e?.callsign || '', bayCount: bays.length, score: null };
        })
        .filter(x => x.bayCount > 0)
        .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
    }
    setCloneList(list);
    setCloneOpen(true);
  };

  // V7.99: 선택한 선박의 베이 구조를 현재 매트릭스로 복제 (메타는 유지 → 신규 선박 정보 그대로).
  const handleCloneFrom = (code) => {
    if (!code) return;
    const dict = loadUserBayDict();
    const src = dict[code];
    if (!src) { alert('선택한 선박을 찾을 수 없습니다.'); return; }
    const restored = bayDictEntryToMatrix(src);
    if (!restored?.byBay || Object.keys(restored.byBay).length === 0) {
      alert('해당 선박에 복제할 베이 구조가 없습니다.');
      return;
    }
    // 복제 출처 표시 + 저장된 매트릭스 복원 플래그 해제(신규 저장 흐름으로).
    restored.fromSaved = false;
    restored.savedAt = '';
    restored.clonedFrom = src.name || src.callsign || code;
    restored.provisional = true;   // V7.99-5: 복제본은 "보정중" — 확정본과 구분 표시
    // V7.99-4: 4단계 파이프라인 ③ 중력 위반 자동 보정.
    //   현재 EDI를 얹어 "위는 찼는데 아래 빈" 사용불가 셀을 베이별로 탐지해 매트릭스에 주입.
    //   확실한 것(중력 제약)만 처리 — 위가 비면 손대지 않음.
    let blockedTotal = 0;
    if (containers && containers.length > 0) {
      try {
        const blk = detectBlockedCells(containers);
        blockedTotal = blk.totalBlocked;
        for (const [bayKey, b] of Object.entries(blk.byBay)) {
          if (restored.byBay[bayKey]) {
            restored.byBay[bayKey].blockedCells = b;
          }
        }
      } catch { /* noop */ }
    }
    setMatrix(restored);
    // ④ 100% 확인 — 보정 후 EDI 수용률 재검증, 사용자에게 제시(그대로/수정).
    if (containers && containers.length > 0) {
      try {
        const fit = verifyMatrixFit(restored, containers);
        setCloneFit({ ...fit, blockedTotal });
      } catch { setCloneFit(null); }
    } else {
      setCloneFit(null);
    }
    setCloneOpen(false);
  };

  const updateBay = (bay, field, value) => {
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      cp.byBay[bay] = { ...cp.byBay[bay], [field]: value };
      return cp;
    });
  };

  // V7.94-19: 기존 베이 페어(짝수) 인라인 변경 — 베이 삭제 없이 지정/해제 가능.
  //   빈값 = 단독, 짝수 = 페어 짝꿍. (홀수 베이 입력 → 짝수 짝꿍 지정이 일반 케이스)
  const updatePairEven = (bay, raw) => {
    const v = String(raw || '').trim();
    if (v === '') {   // 페어 해제 → 단독
      updateBay(bay, 'pairEven', null);
      return;
    }
    const num = parseInt(v, 10);
    if (!Number.isFinite(num) || num < 1 || num > 99) {
      alert('페어 짝수는 1~99 사이여야 합니다 (비우면 단독)');
      return;
    }
    if (num % 2 !== 0) {
      alert('페어 짝꿍은 짝수여야 합니다 (예: 02, 04). 홀수 베이에 짝수 짝꿍을 지정하세요.');
      return;
    }
    updateBay(bay, 'pairEven', String(num).padStart(2, '0'));
  };

  const updateCells = (bay, kind, idx, value) => {
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      const entry = { ...cp.byBay[bay] };
      const key = kind === 'deck' ? 'deckCells' : 'holdCells';
      entry[key] = [...(entry[key] || [])];
      entry[key][idx] = parseInt(value) || 0;
      cp.byBay[bay] = entry;
      return cp;
    });
  };

  // M6.94.0: padding/alignment 업데이트
  const updateAlignPad = (bay, field, value) => {
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      const entry = { ...cp.byBay[bay] };
      entry[field] = value;
      cp.byBay[bay] = entry;
      return cp;
    });
  };

  // M6.94.0: 베이 구조 복사 (한 베이 → 선택한 여러 베이)
  //   소스 베이의 deckTiers/holdTiers/deckCells/holdCells/rowCount/hasZero/padding/align 복사.
  //   pairEven은 복사 안 함 (각 베이 고유). bay/bayNum도 안 바뀜.
  const copyBayStructure = (sourceBay, targetBays) => {
    if (!matrix?.byBay[sourceBay]) return;
    const src = matrix.byBay[sourceBay];
    const copyFields = [
      'rowCount', 'hasZero', 'deckHasZero', 'holdHasZero',
      'deckTiers', 'holdTiers', 'deckCells', 'holdCells',
      'deckAlign', 'deckPadLeft', 'deckPadRight',
      'holdAlign', 'holdPadLeft', 'holdPadRight',
    ];
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      for (const tgt of targetBays) {
        if (tgt === sourceBay) continue;
        if (!cp.byBay[tgt]) continue;
        const entry = { ...cp.byBay[tgt] };
        for (const f of copyFields) {
          if (Array.isArray(src[f])) entry[f] = [...src[f]];
          else entry[f] = src[f];
        }
        cp.byBay[tgt] = entry;
      }
      return cp;
    });
  };

  // V7.94-25: 해치커버 수 일괄 적용 — 베이마다 select를 일일이 만지던 것을 한 번에.
  //   mode 'auto'   → hatchCount 미명시(null). 저장 시 홀드 유무로 자동(홀드 1 / 데크 0). 해치 자동 선박용.
  //   mode 'hold2'  → 홀드 있는 베이 = 2(기본값), 홀드 없는 데크전용 = 0. (일반 케이스: 1번 베이만 이후 예외 지정)
  //   firstBay      → 가장 앞 베이만 그 값(2 또는 3)으로. 보통 1번 베이만 다름.
  const hasHold = (en) => Array.isArray(en?.holdTiers) && en.holdTiers.length > 0;
  const applyHatchBulk = (mode) => {
    setMatrix(m => {
      const cp = { ...m, byBay: { ...m.byBay } };
      for (const bay of Object.keys(cp.byBay)) {
        const entry = { ...cp.byBay[bay] };
        if (mode === 'auto') entry.hatchCount = null;        // 자동(저장 시 홀드 유무로 결정)
        else if (mode === 'hold2') entry.hatchCount = hasHold(entry) ? 2 : 0;
        cp.byBay[bay] = entry;
      }
      return cp;
    });
  };
  const applyHatchFirstBay = (value) => {
    const first = Object.keys(matrix.byBay).sort()[0];
    if (!first) return;
    updateBay(first, 'hatchCount', value);
  };

  // M6.94.0: 선택한 베이 (우측 시뮬에 표시)
  const [selectedBay, setSelectedBay] = useState(null);
  // M6.94.0: 베이 복사 모달 상태
  const [copyMode, setCopyMode] = useState(null); // null | { sourceBay, selectedTargets: Set }

  const handleSave = () => {
    if (!canEdit) {
      alert('매트릭스 저장 권한이 없습니다. 권한자에게 문의하세요.');
      return;
    }
    if (!shipMeta.code) {
      alert('CASP 코드를 입력하세요 (자동 추론된 값 사용 권장)');
      return;
    }
    // M6.94.5: callsign을 인자로 직접 전달 (이전엔 사후 보강 → 단일 책임 어김)
    const entry = matrixToBayDictEntry(
      matrix,
      shipMeta.code,
      shipMeta.name,
      shipMeta.imo,
      shipMeta.callsign || ''
    );
    // M6.94.20: user 소스 + 편집자 + 시각 마킹 (Firebase 보호/충돌 판정 기준)
    const stamp = Date.now();
    entry.source = 'user';
    entry._userOwned = true;
    entry.editorName = currentInspector;
    entry.updatedAt = stamp;
    // V7.99-5: 복제로 만든 보정중 선박이면 표시 보존 (확정본과 구분).
    if (matrix.provisional) {
      entry.provisional = true;
      if (entry.bayDef) entry.bayDef.provisional = true;
    }
    if (entry.bayDef) {
      entry.bayDef.source = 'user';
      entry.bayDef._userOwned = true;
    }
    const ok = addToUserBayDict(entry);
    if (ok) {
      setSavingMsg(`✅ ${shipMeta.code} (${shipMeta.name}) 베이사전 저장 완료 — ${entry.bayDef.recordCount}개 베이${matrix.provisional ? ' · 🛠 보정중(복제 기반, 계속 수정 가능)' : ''}`);
      setDone(true);
      // M6.94.20: Firebase 업로드 (다른 기기 수신용) — fire-and-forget
      fbSaveShipBayDict(entry.code, {
        code: entry.code,
        name: entry.name,
        callsign: entry.callsign || '',
        imo: entry.imo || '',
        source: 'user',
        _userOwned: true,
        ...(matrix.provisional ? { provisional: true } : {}),
        bayDef: entry.bayDef,
        editorName: currentInspector,
        updatedAt: stamp,
        _inspector: currentInspector,
      }).then(r => {
        if (r) setSavingMsg(s => s + ' · ☁ 동기화됨 (다른 기기에서도 보임)');
        else setSavingMsg(s => s + ' · ⚠ 동기화 실패 (이 기기에는 저장됨)');
      }).catch(() => {
        setSavingMsg(s => s + ' · ⚠ 동기화 실패 (이 기기에는 저장됨)');
      });
      if (onSaved) onSaved(entry);
    } else {
      alert('저장 실패 — localStorage 용량 확인 필요');
    }
  };

  // V7.31: 이 선박 사전 삭제 (localStorage + Firebase 양쪽). 잘못 등록된 사전을 지우고 다시 등록할 때 사용.
  const handleDelete = async () => {
    if (!canEdit) {
      alert('삭제 권한이 없습니다. 권한자에게 문의하세요.');
      return;
    }
    const code = shipMeta.code;
    if (!code) {
      alert('삭제할 선박 코드가 없습니다.');
      return;
    }
    if (!confirm(`"${code}" (${shipMeta.name || '이름없음'}) 베이사전을 완전히 삭제할까요?\n\n이 기기와 Firebase(모든 기기)에서 지워집니다. 되돌릴 수 없습니다.`)) return;
    // localStorage에서 이 선박의 모든 키 삭제 (code 일치 또는 키 자체가 code)
    const dict = loadUserBayDict() || {};
    const codeU = String(code).toUpperCase();
    let localCount = 0;
    for (const k of Object.keys(dict)) {
      const e = dict[k];
      const ec = String(e?.code || '').toUpperCase();
      if (k.toUpperCase() === codeU || ec === codeU) {
        if (removeFromUserBayDict(k)) localCount++;
      }
    }
    let fbOk = false;
    try { fbOk = await fbDeleteShipBayDict(code); } catch (e) { console.error(e); }
    setSavingMsg(`🗑 ${code} 삭제 완료 — 이 기기 ${localCount}건${fbOk ? ' · ☁ Firebase에서도 삭제' : ' · ⚠ Firebase 삭제 실패'}. 새로 등록하려면 EDI/PDF를 다시 올리세요.`);
    setDone(true);
    if (onSaved) onSaved(null);
  };

  // M6.94.22: 일괄 동기화 — 이 기기 localStorage의 user 매트릭스 전부를 Firebase로 업로드.
  //   동기화 기능(M6.94.20) 이전에 만든 기존 매트릭스를 폰에서도 보이게 하기 위함.
  //   권한자만 실행 가능. bayDef 있는 것만 대상(빈 껍데기 제외).
  const handleBulkSync = async () => {
    if (!canEdit) {
      setBulkSyncMsg('권한이 없습니다.');
      return;
    }
    const dict = loadUserBayDict() || {};
    const stamp = Date.now();
    const payload = {};
    let skipped = 0;
    for (const code of Object.keys(dict)) {
      const e = dict[code];
      if (!e || !e.bayDef) { skipped++; continue; }  // 빈 껍데기 제외
      payload[code] = {
        code: e.code || code,
        name: e.name || '',
        callsign: e.callsign || '',
        imo: e.imo || '',
        source: 'user',
        _userOwned: true,
        bayDef: { ...e.bayDef, source: 'user', _userOwned: true },
        editorName: currentInspector,
        // 기존 updatedAt 보존(있으면) → 다기기 충돌 시 최신 판정 정확.
        updatedAt: Number(e.updatedAt) || stamp,
        _inspector: currentInspector,
      };
    }
    const total = Object.keys(payload).length;
    if (total === 0) {
      setBulkSyncMsg(`동기화할 매트릭스가 없습니다${skipped ? ` (빈 항목 ${skipped}개 제외)` : ''}.`);
      return;
    }
    if (!confirm(`이 기기의 매트릭스 ${total}개를 전체 동기화할까요?\n(다른 기기에서도 보이게 됩니다)`)) return;
    setBulkSyncing(true);
    setBulkSyncMsg(`동기화 중... (0/${total})`);
    try {
      const res = await fbBatchSaveShipBayDict(payload);
      setBulkSyncMsg(
        `✅ 동기화 완료 — 성공 ${res.saved}개${res.failed ? `, 실패 ${res.failed}개` : ''}` +
        `${skipped ? ` (빈 항목 ${skipped}개 제외)` : ''}. 폰에서 새로고침하면 보입니다.`
      );
    } catch (err) {
      console.error('[handleBulkSync] 실패', err);
      setBulkSyncMsg('⚠ 동기화 실패 — 네트워크를 확인하세요.');
    } finally {
      setBulkSyncing(false);
    }
  };

  // M6.94.20: 권한자 추가
  const handleAddEditor = async () => {
    const name = String(editorInput || '').trim();
    if (!name) return;
    if (!Array.isArray(editors)) return;
    if (editors.includes(name)) {
      setEditorMsg(`이미 명단에 있습니다: ${name}`);
      return;
    }
    setEditorMsg('저장 중...');
    const res = await fbSetMatrixEditors(currentInspector, [...editors, name]);
    if (res.ok) {
      setEditorInput('');
      setEditorMsg(`✅ 추가됨: ${name}`);
    } else if (res.reason === 'not_authorized') {
      setEditorMsg('권한이 없어 명단을 수정할 수 없습니다.');
    } else {
      setEditorMsg('저장 실패 — 네트워크를 확인하세요.');
    }
  };

  // M6.94.20: 권한자 삭제
  const handleRemoveEditor = async (name) => {
    if (!Array.isArray(editors)) return;
    if (editors.length <= 1) {
      setEditorMsg('마지막 권한자는 삭제할 수 없습니다.');
      return;
    }
    if (!confirm(`권한자에서 "${name}"을(를) 삭제할까요?`)) return;
    setEditorMsg('저장 중...');
    const res = await fbSetMatrixEditors(
      currentInspector,
      editors.filter(e => e !== name)
    );
    if (res.ok) {
      setEditorMsg(`삭제됨: ${name}`);
    } else if (res.reason === 'not_authorized') {
      setEditorMsg('권한이 없어 명단을 수정할 수 없습니다.');
    } else {
      setEditorMsg('저장 실패 — 네트워크를 확인하세요.');
    }
  };

  if (!matrix) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center">
        <div className="bg-zinc-900 p-6 rounded-lg text-white">
          <div>매트릭스 분석 중...</div>
        </div>
      </div>
    );
  }

  const summary = summarizeMatrix(matrix);
  const bayList = Object.keys(matrix.byBay).sort();

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-auto py-8">
      <div className="bg-zinc-900 rounded-lg text-white w-full max-w-7xl mx-2 flex flex-col" style={{ maxHeight: '95vh' }}>
        {/* 헤더 */}
        <div className="p-4 border-b border-zinc-700 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold">🚢 신규 선박 베이 매트릭스 빌더{matrix?.provisional && <span className="ml-2 text-xs px-2 py-0.5 bg-sky-600 rounded align-middle">🛠 보정중</span>}</h2>
            <div className="text-xs text-zinc-400 mt-1">
              현재 항차의 EDI에서 선박 정보 자동 추출 + 베이 구조 분석
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl px-2">×</button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-auto p-4">
          {/* === 자동 추출 선박 정보 (전체 폭) === */}
          <div className="bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border border-blue-700/50 p-4 rounded mb-4">
            <div className="flex justify-between items-start mb-2">
              <div className="text-xs text-blue-300 font-bold">📡 EDI 자동 추출 선박 정보 (수정 가능)</div>
              <button
                onClick={() => setEditMeta(!editMeta)}
                className="text-xs px-2 py-0.5 bg-blue-700/50 hover:bg-blue-600 rounded"
              >
                {editMeta ? '✓ 적용' : '✏ 수정'}
              </button>
            </div>
            {!editMeta ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[10px] text-blue-300/70">선박명</div>
                  <div className="font-bold text-base">{shipMeta.name || <span className="text-zinc-500">미상</span>}</div>
                </div>
                <div>
                  <div className="text-[10px] text-blue-300/70">콜사인 (호출부호)</div>
                  <div className="font-mono font-bold">{shipMeta.callsign || <span className="text-zinc-500">미상</span>}</div>
                </div>
                <div>
                  <div className="text-[10px] text-blue-300/70">IMO</div>
                  <div className="font-mono">{shipMeta.imo || <span className="text-zinc-500">미상</span>}</div>
                </div>
                <div>
                  <div className="text-[10px] text-blue-300/70">CASP 코드 (자동 추론)</div>
                  <div className="font-mono font-bold text-emerald-300">{shipMeta.code || <span className="text-red-400">없음 — 입력 필요</span>}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] text-blue-300/70">항차</div>
                  <div className="font-mono text-xs">{shipMeta.voy || <span className="text-zinc-500">—</span>}</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <label>
                  <div className="text-[10px] text-blue-300/70">선박명</div>
                  <input value={shipMeta.name || ''} onChange={e => setShipMeta(m => ({ ...m, name: toEngU(e.target.value) }))} {...ENG_INPUT_PROPS}
                         className="w-full mt-1 px-2 py-1 bg-zinc-700 rounded" />
                </label>
                <label>
                  <div className="text-[10px] text-blue-300/70">콜사인</div>
                  <input value={shipMeta.callsign || ''} onChange={e => setShipMeta(m => ({ ...m, callsign: toEngU(e.target.value) }))} {...ENG_INPUT_PROPS}
                         className="w-full mt-1 px-2 py-1 bg-zinc-700 rounded font-mono" />
                </label>
                <label>
                  <div className="text-[10px] text-blue-300/70">IMO</div>
                  <input value={shipMeta.imo || ''} onChange={e => setShipMeta(m => ({ ...m, imo: e.target.value }))} {...NUM_INPUT_PROPS}
                         className="w-full mt-1 px-2 py-1 bg-zinc-700 rounded font-mono" />
                </label>
                <label>
                  <div className="text-[10px] text-blue-300/70">CASP 코드 *</div>
                  <input value={shipMeta.code || ''} onChange={e => setShipMeta(m => ({ ...m, code: toEngU(e.target.value) }))} {...ENG_INPUT_PROPS}
                         className="w-full mt-1 px-2 py-1 bg-zinc-700 rounded font-mono font-bold" />
                </label>
              </div>
            )}
          </div>

          {/* === 베이 분석 상태 카드 === */}
          <div className="bg-zinc-800 p-3 rounded mb-4">
            <div className="text-xs text-zinc-400 font-bold mb-2">📊 베이 구조 분석 결과</div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center text-sm">
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-2xl font-bold text-emerald-400">{summary.totalBays}</div>
                <div className="text-[10px] text-zinc-400">총 베이</div>
              </div>
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-2xl font-bold text-blue-400">{summary.pairCount}</div>
                <div className="text-[10px] text-zinc-400">페어</div>
              </div>
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-2xl font-bold text-purple-400">{summary.singleCount}</div>
                <div className="text-[10px] text-zinc-400">단독</div>
              </div>
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-2xl font-bold text-cyan-400">{summary.hasHoldCount}</div>
                <div className="text-[10px] text-zinc-400">Hold 있음</div>
              </div>
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-2xl font-bold text-yellow-400">{summary.deckOnlyCount}</div>
                <div className="text-[10px] text-zinc-400">Deck only</div>
              </div>
              <div className="bg-zinc-900 rounded p-2">
                <div className={`text-2xl font-bold ${summary.needReviewCount > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {summary.needReviewCount}
                </div>
                <div className="text-[10px] text-zinc-400">검토 필요</div>
              </div>
            </div>
            {summary.estimatedCount > 0 && (
              <div className="text-[11px] text-zinc-400 mt-2">
                ⚠ 추정 베이 {summary.estimatedCount}개 (EDI/PDF 발견 안 됨, 1~max 자동 채움). [×]로 삭제하거나 수정.
              </div>
            )}
            <div className="text-[11px] text-zinc-500 mt-2">
              출처: EDI ({matrix._empty ? '없음' : '✓'}) · 베이사전 ({matrix.bayDictUsed ? '✓ 매칭' : '없음'}) · .def ({matrix.defUsed ? '✓ 자동' : '미사용'}) · PDF ({matrix.pdfUsed ? '✓ 보강' : '미사용'})
              {matrix.bayDictMeta?.name && <span className="ml-2 text-cyan-400">(사전: {matrix.bayDictMeta.name})</span>}
              {matrix.bayDictRejected && (
                <span className="ml-2 text-amber-400 font-bold">
                  ⚠ 사전 미적용: {matrix.bayDictRejected.name?.split('\n').pop()} — {matrix.bayDictRejected.reason}
                </span>
              )}
            </div>
          </div>

          {/* === PDF 업로드 (옵션 보강) === */}
          <div className="bg-zinc-800 p-3 rounded mb-4 flex justify-between items-center">
            <div className="text-xs text-zinc-400">
              {matrix.fromSaved && (
                <span className="text-emerald-400">✓ 저장된 매트릭스 복원됨{matrix.savedAt && ` (${new Date(matrix.savedAt).toLocaleString('ko-KR')})`}</span>
              )}
              {!matrix.fromSaved && summary.needReviewCount > 0 && (
                <span className="text-amber-400">⚠ {summary.needReviewCount}개 베이 검토 필요. PDF 있으면 업로드해서 보강.</span>
              )}
              {!matrix.fromSaved && summary.needReviewCount === 0 && (
                <span>모든 베이 분석 완료. 필요 시 PDF로 추가 보강 가능.</span>
              )}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              {/* V7.99: 기존 선박 복제 — 같은 베이 구조(자매선) 골라 매트릭스 복제 */}
              <button onClick={openClone}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded text-sm">
                🔁 기존 선박 복제
              </button>
              <input ref={defInputRef} type="file" accept=".def,.DEF" hidden
                     onChange={e => { handleDefUpload(e.target.files?.[0]); e.target.value = ''; }} />
              <button onClick={() => defInputRef.current?.click()}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-sm">
                🚢 .def 업로드 (자동 생성)
              </button>
              {defStatus === 'parsing' && <span className="text-xs text-zinc-400">.def 디코딩 중...</span>}
              {defStatus === 'done' && matrix.defStats && (
                <span className="text-xs text-emerald-400">
                  ✓ .def {matrix.defStats.format} — 신규 {matrix.defStats.added} / 보강 {matrix.defStats.augmented}
                  {matrix.defStats.unparsed > 0 && <span className="text-amber-400"> · 미확정 {matrix.defStats.unparsed}베이(검토 필요)</span>}
                </span>
              )}
              {defStatus === 'error' && <span className="text-xs text-red-400">{defError}</span>}
              <input ref={fileInputRef} type="file" accept=".pdf" hidden
                     onChange={e => handlePdfUpload(e.target.files?.[0])} />
              <button onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm">
                📄 PDF 업로드 (선택)
              </button>
              {pdfStatus === 'parsing' && <span className="text-xs text-zinc-400">파싱 중...</span>}
              {pdfStatus === 'done' && matrix.pdfStats && (
                <span className="text-xs text-emerald-400">
                  ✓ 신규 {matrix.pdfStats.added} / 보강 {matrix.pdfStats.augmented} (PDF {matrix.pdfStats.totalPdfBays}베이)
                </span>
              )}
              {pdfStatus === 'error' && <span className="text-xs text-red-400">{pdfError}</span>}
            </div>
          </div>

          {/* V7.99: 기존 선박 복제 선택 패널 (구조 자동 추천) */}
          {cloneOpen && (
            <div className="bg-zinc-800 p-3 rounded mb-4 border border-violet-500/40">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-violet-300 font-bold">🔁 복제할 선박 선택 — 현재 베이 구조와 가까운 순으로 추천</div>
                <button onClick={() => setCloneOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-200">닫기 ✕</button>
              </div>
              {cloneList.length === 0 ? (
                <div className="text-xs text-zinc-500">등록된 베이사전 선박이 없습니다.</div>
              ) : (
                <>
                  {/* 상위 추천 3척 — 수용률%(있으면) 우선, 없으면 구조 일치도% 버튼 */}
                  {(cloneList[0]?.fitPct != null || cloneList[0]?.score != null) && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                      {cloneList.slice(0, 3).map((s, i) => {
                        const hasFit = s.fitPct != null;
                        const fitPct = hasFit ? Math.round(s.fitPct * 100) : null;
                        const strPct = s.score != null ? Math.round(s.score * 100) : null;
                        const mainPct = hasFit ? fitPct : strPct;
                        const top = i === 0;
                        return (
                          <button key={s.code} onClick={() => handleCloneFrom(s.code)}
                                  className={`text-left px-3 py-2 rounded border ${top ? 'bg-violet-700/40 border-violet-400' : 'bg-zinc-700/60 border-zinc-600 hover:border-violet-400'}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold">{top ? '⭐ ' : ''}{s.name || s.code}</span>
                              <span className={`text-xs font-mono ${mainPct >= 95 ? 'text-emerald-400' : mainPct >= 80 ? 'text-yellow-400' : 'text-zinc-400'}`}>{mainPct}%</span>
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-0.5">
                              {hasFit ? `EDI 수용 ${fitPct}% · 구조 ${strPct}%` : `구조 일치 ${strPct}%`} · {s.code} · {s.bayCount}베이
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-[10px] text-zinc-500 mb-1">전체 목록에서 선택{cloneList[0]?.fitPct != null ? ' (% = 이번 EDI 수용률)' : ''}:</div>
                  <select defaultValue="" onChange={e => handleCloneFrom(e.target.value)}
                          className="w-full px-2 py-1.5 bg-zinc-700 rounded text-sm font-mono">
                    <option value="" disabled>— 선박 선택 ({cloneList.length}척) —</option>
                    {cloneList.map(s => {
                      const p = s.fitPct != null ? s.fitPct : s.score;
                      return (
                        <option key={s.code} value={s.code}>
                          {p != null ? `[${Math.round(p * 100)}%] ` : ''}{(s.name || '(이름없음)')}{s.callsign ? ` · ${s.callsign}` : ''} · {s.code} · {s.bayCount}베이
                        </option>
                      );
                    })}
                  </select>
                </>
              )}
            </div>
          )}
          {matrix.clonedFrom && (
            <div className="bg-violet-900/30 border border-violet-500/30 px-3 py-2 rounded mb-4 text-xs text-violet-200">
              🔁 <span className="font-bold">{matrix.clonedFrom}</span> 의 베이 구조를 복제했습니다. 위에서 선박 정보(선박명·콜사인·CASP 코드)를 신규 선박으로 입력 후 저장하세요.
            </div>
          )}
          {/* V7.99-3/4: 복제본 적합성 검증 — 4단계 결과 제시(수용률 + 중력 보정 + 적용/수정) */}
          {cloneFit && (
            <div className={`px-3 py-2 rounded mb-4 text-xs border ${cloneFit.pass ? 'bg-emerald-900/30 border-emerald-500/40 text-emerald-200' : 'bg-amber-900/25 border-amber-500/40 text-amber-100'}`}>
              {cloneFit.blockedTotal > 0 && (
                <div className="text-[11px] text-sky-300 mb-1">
                  🛠 중력 보정: 사용불가 셀 {cloneFit.blockedTotal}곳을 비활성 처리했습니다(위는 찼는데 아래 빈 자리).
                </div>
              )}
              {cloneFit.pass ? (
                <span>✅ <span className="font-bold">완전 적합</span> — 이번 항차 컨테이너 {cloneFit.total}대가 모두 이 매트릭스에 들어갑니다. 이대로 저장하거나, 베이를 수정한 뒤 저장하세요.</span>
              ) : (
                <>
                  <div className="font-bold mb-1">
                    ⚠ 수용 {cloneFit.fit}/{cloneFit.total}대 — {cloneFit.miss}대가 자리 없음(아래 베이의 단을 보정하세요)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cloneFit.missByBay.map((m, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-amber-800/40 rounded font-mono text-[11px]">
                        B{m.bay} {m.tier}단({m.kind === 'deck' ? '데크' : '홀드'}) ×{m.count}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] text-amber-200/70 mt-1">해당 베이의 데크/홀드 Tier에 빠진 단을 추가하면 100% 수용됩니다. 진본 .def 구하기 전까지 이 방식으로 보정 반복.</div>
                </>
              )}
            </div>
          )}

          {/* === 베이별 검증 폼 — 좌우 분할: 좌측 편집 + 우측 베이플랜 시뮬 === */}
          {/* M6.94.4: 모바일 반응형 — 좁은 폭(폰)에서는 세로 분할 (좌측 편집 위, 우측 시뮬 아래).
              이전: flex gap-3 (무조건 가로) → 모바일에서 우측(420px 고정)이 화면 다 차지 → 좌측 안 보임. */}
          {!done && (
            <div className="flex flex-col lg:flex-row gap-3" style={{ minHeight: '60vh' }}>
              {/* === 좌측: 베이 편집 영역 === */}
              <div className="flex-1 space-y-2 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              {/* 베이 추가 폼 */}
              <div className="bg-zinc-900/60 border border-zinc-700 rounded p-3 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-emerald-300">➕ 베이 추가</span>
                <input
                  type="number" placeholder="BAY 번호 (예: 1)"
                  value={addBayInput}
                  onChange={e => setAddBayInput(e.target.value)}
                  className="w-32 px-2 py-1 bg-zinc-700 rounded text-sm"
                  min="1" max="999"
                />
                <input
                  type="number" placeholder="페어 짝수 (옵션, 예: 2)"
                  value={addPairInput}
                  onChange={e => setAddPairInput(e.target.value)}
                  className="w-40 px-2 py-1 bg-zinc-700 rounded text-sm"
                  min="2" max="998" step="2"
                />
                <button
                  onClick={() => addBay(addBayInput, addPairInput)}
                  disabled={!addBayInput}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-sm disabled:opacity-50"
                >
                  추가
                </button>
                <span className="text-[10px] text-zinc-500">
                  ※ 페어 비우면 단독, 채우면 페어 (홀수 → 짝수 짝꿍)
                </span>
              </div>

              {/* 누락 베이 자동 제안 */}
              {(() => {
                const missing = detectMissingBays(matrix);
                if (missing.length === 0) return null;
                return (
                  <div className="bg-amber-900/30 border border-amber-700/50 rounded p-3">
                    <div className="text-xs text-amber-300 font-bold mb-1">⚠ 누락 의심 베이 (베이 번호 패턴 기반)</div>
                    <div className="flex flex-wrap gap-1">
                      {missing.map(s => (
                        <button
                          key={s.bayNum}
                          onClick={() => addBay(s.bayNum, null)}
                          className="px-2 py-0.5 bg-amber-800/40 hover:bg-amber-700 rounded text-xs"
                          title={s.reason}
                        >
                          BAY {s.bayNum} +
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-amber-400/70 mt-1">클릭하면 단독 베이로 추가됩니다. 페어가 필요하면 위 폼 사용.</div>
                  </div>
                );
              })()}

              {bayList.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-2 px-2 py-1.5 bg-zinc-900/60 border border-zinc-700 rounded text-xs">
                  <span className="text-zinc-400">⚓ 해치 일괄:</span>
                  <button onClick={() => applyHatchBulk('hold2')}
                    className="px-2 py-0.5 bg-zinc-700 hover:bg-cyan-700 rounded"
                    title="홀드 있는 베이 전부 해치 2, 홀드 없는 데크전용 베이 0. 가장 흔한 패턴.">
                    홀드=2 · 데크=0
                  </button>
                  <button onClick={() => applyHatchBulk('auto')}
                    className="px-2 py-0.5 bg-zinc-700 hover:bg-cyan-700 rounded"
                    title="해치 수를 자동으로(미명시). 저장 시 홀드 있으면 1·없으면 0. 해치가 자동인 선박용.">
                    전부 자동
                  </button>
                  <span className="text-zinc-500 ml-1">1번 베이만:</span>
                  <button onClick={() => applyHatchFirstBay(2)}
                    className="px-2 py-0.5 bg-zinc-700 hover:bg-amber-700 rounded" title="가장 앞 베이 해치 2">2</button>
                  <button onClick={() => applyHatchFirstBay(3)}
                    className="px-2 py-0.5 bg-zinc-700 hover:bg-amber-700 rounded" title="가장 앞 베이 해치 3">3</button>
                  <span className="text-[10px] text-zinc-500">예외 베이는 아래 각 베이 ‘해치’에서 조정</span>
                </div>
              )}
              {bayList.length === 0 && (
                <div className="text-center py-8 text-zinc-400">
                  EDI 데이터가 없습니다. 위에서 베이를 직접 추가하거나 PDF 업로드 후 진행하세요.
                </div>
              )}
              {bayList.map(bay => {
                const e = matrix.byBay[bay];
                const needsReview = !e.rowCount || e.rowCount < 5 || (!e.deckTiers?.length && !e.holdTiers?.length);
                const isEst = e.isEstimated;
                const isSelected = selectedBay === bay;
                return (
                  <div key={bay}
                    className={`border ${isSelected ? 'border-cyan-400 bg-cyan-950/30 ring-2 ring-cyan-500' : isEst ? 'border-zinc-700 bg-zinc-900/40 opacity-70' : needsReview ? 'border-amber-600 bg-zinc-800' : 'border-zinc-700 bg-zinc-800'} rounded p-3 transition-colors`}>
                    <div className="flex items-center gap-3 mb-2 text-sm">
                      <button
                        onClick={() => setSelectedBay(isSelected ? null : bay)}
                        className={`px-2 py-1 rounded font-bold ${isSelected ? 'bg-cyan-500 text-white' : 'bg-zinc-700 hover:bg-cyan-700'}`}
                        title="우측 미리보기 표시">
                        👁 BAY {bay}
                      </button>
                      {isSelected && <span className="text-[10px] px-1.5 py-0.5 bg-cyan-600 rounded font-bold">미리보기 →</span>}
                      <label className="flex items-center gap-1 text-[11px] text-zinc-400" title="페어 짝수 짝꿍 (비우면 단독). 베이 삭제 없이 변경 가능.">
                        페어:
                        <input type="number" defaultValue={e.pairEven || ''} placeholder="단독"
                          key={`pair-${bay}-${e.pairEven || ''}`}
                          onBlur={ev => { if ((ev.target.value || '') !== (e.pairEven || '')) updatePairEven(bay, ev.target.value); }}
                          className="w-16 px-2 py-0.5 bg-zinc-700 rounded text-center" min="0" max="99" step="2" />
                      </label>
                      {isEst && <span className="text-[10px] px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded">⚠ 추정 (EDI/PDF 없음)</span>}
                      {!isEst && <span className="text-[10px] px-2 py-0.5 bg-zinc-700 rounded">{e.source || '?'}</span>}
                      <label className="ml-auto flex items-center gap-1">
                        rowCount:
                        <input type="number" value={e.rowCount || ''} onChange={ev => updateBay(bay, 'rowCount', parseInt(ev.target.value) || 0)}
                               className="w-14 px-2 py-0.5 bg-zinc-700 rounded text-center" min="0" max="20" />
                      </label>
                      <label className="flex items-center gap-1" title="해치커버 수 (deck/hold 경계 굵은선 등분). 0=해치 없음(상시 개방). 홀드 없는 베이는 0.">
                        해치:
                        <select value={(e.hatchCount ?? (e.holdTiers && e.holdTiers.length > 0 ? 1 : 0))} onChange={ev => updateBay(bay, 'hatchCount', parseInt(ev.target.value))}
                                className="px-1 py-0.5 bg-zinc-700 rounded text-center">
                          <option value={0}>0</option>
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1" title="데크에 00(가운데 row) 포함">
                        <input type="checkbox" checked={e.deckHasZero != null ? !!e.deckHasZero : !!e.hasZero}
                          onChange={ev => updateBay(bay, 'deckHasZero', ev.target.checked)} />
                        데크00
                      </label>
                      <label className="flex items-center gap-1" title="홀드에 00(가운데 row) 포함">
                        <input type="checkbox" checked={e.holdHasZero != null ? !!e.holdHasZero : !!e.hasZero}
                          onChange={ev => updateBay(bay, 'holdHasZero', ev.target.checked)} />
                        홀드00
                      </label>
                      <button
                        onClick={() => deleteBay(bay)}
                        className="px-2 py-0.5 bg-red-900/50 hover:bg-red-700 rounded text-xs"
                        title="이 베이 삭제"
                      >
                        ×
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {/* Deck */}
                      <div className="bg-blue-950/20 rounded p-2">
                        <div className="text-blue-400 font-bold mb-1 flex items-center gap-2">
                          <span>Deck Tier ({e.deckTiers?.length || 0})</span>
                          <TierAddInline onAdd={(v) => addTier(bay, 'deck', v)} placeholder="예: 90" />
                        </div>
                        {(e.deckTiers || []).map((t, idx) => (
                          <div key={`d-${bay}-${idx}`} className="flex items-center gap-1 mb-0.5">
                            <span className="text-zinc-400">D</span>
                            <input type="number" value={t}
                                   onChange={ev => updateTier(bay, 'deck', idx, ev.target.value)}
                                   className="w-12 px-1 py-0.5 bg-zinc-700 rounded text-center font-mono" min="1" max="99" />
                            <span className="text-zinc-500">cells</span>
                            <input type="number" value={e.deckCells?.[idx] || 0}
                                   onChange={ev => updateCells(bay, 'deck', idx, ev.target.value)}
                                   className="w-12 px-1 py-0.5 bg-zinc-700 rounded text-center" min="0" max="20" />
                            <button onClick={() => deleteTier(bay, 'deck', idx)}
                                    className="ml-auto w-5 h-5 bg-red-900/50 hover:bg-red-700 rounded text-[10px]"
                                    title="이 tier 삭제">×</button>
                          </div>
                        ))}
                        {(!e.deckTiers || e.deckTiers.length === 0) && (
                          <div className="text-zinc-500 italic text-[11px]">없음 — 위 [+ 추가] 사용</div>
                        )}
                      </div>
                      {/* Hold */}
                      <div className="bg-green-950/20 rounded p-2">
                        <div className="text-green-400 font-bold mb-1 flex items-center gap-2">
                          <span>Hold Tier ({e.holdTiers?.length || 0})</span>
                          <TierAddInline onAdd={(v) => addTier(bay, 'hold', v)} placeholder="예: 6" />
                        </div>
                        {(e.holdTiers || []).map((t, idx) => (
                          <div key={`h-${bay}-${idx}`} className="flex items-center gap-1 mb-0.5">
                            <span className="text-zinc-400">H</span>
                            <input type="number" value={t}
                                   onChange={ev => updateTier(bay, 'hold', idx, ev.target.value)}
                                   className="w-12 px-1 py-0.5 bg-zinc-700 rounded text-center font-mono" min="1" max="99" />
                            <span className="text-zinc-500">cells</span>
                            <input type="number" value={e.holdCells?.[idx] || 0}
                                   onChange={ev => updateCells(bay, 'hold', idx, ev.target.value)}
                                   className="w-12 px-1 py-0.5 bg-zinc-700 rounded text-center" min="0" max="20" />
                            <button onClick={() => deleteTier(bay, 'hold', idx)}
                                    className="ml-auto w-5 h-5 bg-red-900/50 hover:bg-red-700 rounded text-[10px]"
                                    title="이 tier 삭제">×</button>
                          </div>
                        ))}
                        {(!e.holdTiers || e.holdTiers.length === 0) && (
                          <div className="text-zinc-500 italic text-[11px]">없음 — 위 [+ 추가] 사용</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>{/* /좌측 편집 영역 */}

              {/* === 우측: 베이플랜 시뮬레이션 (선택한 베이의 빈 카고플랜 박스) === */}
              {/* M6.94.4: 모바일은 풀폭(w-full), 데스크탑(lg)만 420px 고정. */}
              <div className="w-full lg:w-[420px] lg:flex-shrink-0">
                <style>{CARGO_V2_CSS}</style>
                <div className="sticky top-0 bg-zinc-800 border border-zinc-600 rounded p-3" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                  <div className="text-sm font-bold text-cyan-300 mb-2 flex items-center justify-between">
                    <span>🎯 베이플랜 시뮬레이션</span>
                    {selectedBay && (
                      <span className="text-xs bg-cyan-900 px-2 py-0.5 rounded">BAY {selectedBay}</span>
                    )}
                  </div>
                  {!selectedBay ? (
                    <div className="text-center text-zinc-500 text-sm py-12 italic">
                      ⬅ 좌측 베이를 클릭하면<br/>여기에 미리보기가 나옵니다
                    </div>
                  ) : (() => {
                    const e = matrix.byBay[selectedBay];
                    if (!e) return <div className="text-red-400">베이 없음</div>;
                    const bayKey = e.pairEven
                      ? `(${e.pairEven})${String(parseInt(selectedBay)).padStart(2, '0')}`
                      : String(parseInt(selectedBay)).padStart(2, '0');
                    const data = buildEmptyBayRenderData(e, bayKey, !!e.pairEven);
                    return (
                      <>
                        {/* 카고플랜 V2 스타일 박스 (BayBoxV2 재사용) */}
                        {/* M6.94.2 fix: cpv2-bay-box는 flex:1 1 0 기반이라 부모가 flex container이어야 그려짐.
                            매트릭스 빌더 시뮬은 일반 div 안이라 height가 0이 되어 빈 박스만 보이던 버그.
                            해결: 부모를 flex container로 + cpv2-bay-box에 명시적 height. */}
                        <div className="bg-white rounded p-2 mb-3" style={{ minHeight: '320px', display: 'flex', flexDirection: 'column' }}>
                          <div className="cpv2-bay-box" style={{ minWidth: '380px', height: '300px', flex: 'none' }}>
                            <BayBoxV2 data={data} count={null} colorMap={{}} />
                          </div>
                        </div>

                        {/* === V9.04: 사용불가 셀(구조상 없는 자리) 편집 — XTPG BAY25 80티어 부분 로우 === */}
                        {(() => {
                          const eNoBlk = { ...e };
                          delete eNoBlk.blockedCells;
                          const grid = buildEmptyBayRenderData(eNoBlk, 'blk', false);
                          if (!grid) return null;
                          const blkArr = (kind) => kind === 'deck' ? (e.blockedCells?.deckBlocked || []) : (e.blockedCells?.holdBlocked || []);
                          const isBlk = (kind, tier, rowLbl) =>
                            blkArr(kind).some(x => Number(x.tier) === tier && String(x.row).padStart(2, '0') === rowLbl);
                          const nBlk = blkArr('deck').length + blkArr('hold').length;
                          const renderRows = (rows, kind) => rows.filter(r => !r.invisible).map(r => (
                            <div key={`${kind}-${r.tier}`} className="flex items-center gap-0.5 mb-0.5">
                              <span className="w-6 text-[9px] text-zinc-500 text-right mr-1 font-mono">{String(r.tier).padStart(2, '0')}</span>
                              {r.cells.map((cell, i) => cell.rowLbl != null && (cell.active || cell.blocked) ? (
                                <button key={i}
                                  onClick={() => toggleBlockedCell(selectedBay, kind, r.tier, cell.rowLbl)}
                                  title={isBlk(kind, r.tier, cell.rowLbl) ? '사용불가 해제' : '이 자리를 사용불가(구조상 없음)로'}
                                  className={`w-7 h-6 rounded text-[9px] font-mono font-bold ${
                                    isBlk(kind, r.tier, cell.rowLbl)
                                      ? 'bg-red-900/70 text-red-300 border border-red-600'
                                      : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                                  }`}>
                                  {isBlk(kind, r.tier, cell.rowLbl) ? '✕' : cell.rowLbl}
                                </button>
                              ) : <span key={i} className="w-7 h-6" />)}
                            </div>
                          ));
                          return (
                            <div className="bg-zinc-900/50 rounded p-2 mb-2">
                              <div className="text-xs text-zinc-300 font-bold mb-1">
                                🧱 사용불가 셀 <span className="font-normal text-zinc-500">(선박 구조상 없는 자리 — 셀을 눌러 ✕ 지정)</span>
                                {nBlk > 0 && <span className="ml-2 px-1.5 py-0.5 bg-red-900/60 text-red-300 rounded text-[10px]">{nBlk}곳</span>}
                              </div>
                              <div className="text-[10px] text-zinc-500 mb-2">
                                예: 80티어에 로우가 부분만 있는 베이 — 없는 자리를 ✕ 지정하면 베이플랜·카고플랜·콘앱 그림에서 빈 자리로 빠집니다.
                              </div>
                              {grid.deckRows.some(r => !r.invisible) && (
                                <div className="mb-1">
                                  <div className="text-[10px] text-blue-400 font-bold mb-0.5">Deck</div>
                                  {renderRows(grid.deckRows, 'deck')}
                                </div>
                              )}
                              {grid.holdRows.some(r => !r.invisible) && (
                                <div>
                                  <div className="text-[10px] text-green-400 font-bold mb-0.5">Hold</div>
                                  {renderRows(grid.holdRows, 'hold')}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* === Padding/Alignment 컨트롤 === */}
                        <div className="bg-zinc-900/50 rounded p-2 mb-2">
                          <div className="text-xs text-zinc-300 font-bold mb-2">📐 데크-홀드 정렬</div>
                          {/* Hold align */}
                          <div className="mb-2">
                            <div className="text-[10px] text-zinc-400 mb-1">Hold 정렬</div>
                            <div className="flex gap-1">
                              {['left', 'center', 'right'].map(a => (
                                <button key={a}
                                  onClick={() => updateAlignPad(selectedBay, 'holdAlign', a)}
                                  className={`flex-1 px-2 py-1 text-xs rounded ${e.holdAlign === a || (!e.holdAlign && a === 'center') ? 'bg-cyan-600 font-bold' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                                  {a === 'left' ? '← 좌' : a === 'center' ? '∙ 가운데' : '우 →'}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Hold padding micro — M6.94.3: 0.5 단위 미세 조정 (사용자 요청) */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <label className="flex items-center gap-1">
                              <span className="text-zinc-400">왼쪽 +</span>
                              <input type="number" min="0" max="20" step="0.5" value={e.holdPadLeft || 0}
                                onChange={ev => updateAlignPad(selectedBay, 'holdPadLeft', parseFloat(ev.target.value) || 0)}
                                className="w-14 px-1 py-0.5 bg-zinc-700 rounded text-center" />
                            </label>
                            <label className="flex items-center gap-1">
                              <span className="text-zinc-400">오른쪽 +</span>
                              <input type="number" min="0" max="20" step="0.5" value={e.holdPadRight || 0}
                                onChange={ev => updateAlignPad(selectedBay, 'holdPadRight', parseFloat(ev.target.value) || 0)}
                                className="w-14 px-1 py-0.5 bg-zinc-700 rounded text-center" />
                            </label>
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1">cells 단위 미세 조정 (0.5 가능). 0이면 위 정렬 자동.</div>
                        </div>

                        {/* === 베이 복사 === */}
                        <div className="bg-amber-900/20 border border-amber-700/50 rounded p-2">
                          <div className="text-xs text-amber-300 font-bold mb-1">📋 베이 구조 복사</div>
                          <div className="text-[10px] text-zinc-400 mb-2">
                            이 베이 (BAY {selectedBay})의 tier/cells/정렬을 다른 베이에 복사
                          </div>
                          <button
                            onClick={() => setCopyMode({ sourceBay: selectedBay, selectedTargets: new Set() })}
                            className="w-full py-1.5 bg-amber-700 hover:bg-amber-600 rounded text-xs font-bold">
                            📋 다른 베이에 복사하기
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>{/* /우측 시뮬 */}
            </div>
          )}

          {/* === 베이 복사 모달 (대상 베이 선택) === */}
          {copyMode && (
            <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
                 onClick={() => setCopyMode(null)}>
              <div className="bg-zinc-900 rounded-lg p-4 max-w-2xl w-full max-h-[80vh] overflow-auto"
                   onClick={e => e.stopPropagation()}>
                <div className="text-base font-bold mb-1">📋 BAY {copyMode.sourceBay} 구조를 복사할 대상 베이 선택</div>
                <div className="text-xs text-zinc-400 mb-3">tier/cells/정렬/padding 모두 복사. 페어 짝수는 안 바뀜.</div>
                <div className="grid grid-cols-6 gap-2 mb-4">
                  {Object.keys(matrix.byBay).sort().map(bay => {
                    if (bay === copyMode.sourceBay) return null;
                    const checked = copyMode.selectedTargets.has(bay);
                    return (
                      <button key={bay}
                        onClick={() => {
                          const next = new Set(copyMode.selectedTargets);
                          if (checked) next.delete(bay); else next.add(bay);
                          setCopyMode({ ...copyMode, selectedTargets: next });
                        }}
                        className={`p-2 rounded text-sm font-bold ${checked ? 'bg-emerald-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                        BAY {bay}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center">
                  <button onClick={() => setCopyMode({ ...copyMode, selectedTargets: new Set(Object.keys(matrix.byBay).filter(b => b !== copyMode.sourceBay)) })}
                    className="text-xs px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded">전체 선택</button>
                  <div className="flex gap-2">
                    <button onClick={() => setCopyMode(null)}
                      className="px-4 py-2 bg-zinc-700 rounded">취소</button>
                    <button
                      disabled={copyMode.selectedTargets.size === 0}
                      onClick={() => {
                        copyBayStructure(copyMode.sourceBay, [...copyMode.selectedTargets]);
                        setCopyMode(null);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded font-bold disabled:opacity-30">
                      {copyMode.selectedTargets.size}개 베이에 복사
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {done && (
            <div className="text-center py-12">
              <div className="text-2xl mb-3">{savingMsg}</div>
              <div className="text-sm text-zinc-400">이제 카고플랜에서 이 선박이 정상 표시됩니다.</div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-zinc-700 flex justify-between items-center gap-2 flex-wrap">
          {/* 좌측: 권한자만 명단 관리 버튼 */}
          <div className="flex items-center gap-2">
            {canEdit && !done && (
              <button onClick={() => { setShowEditorMgr(v => !v); setEditorMsg(''); }}
                      className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
                👤 권한자 관리{Array.isArray(editors) ? ` (${editors.length})` : ''}
              </button>
            )}
            {canEdit && !done && (
              <button onClick={handleBulkSync} disabled={bulkSyncing}
                      className="px-3 py-2 bg-indigo-700 hover:bg-indigo-600 rounded text-xs disabled:opacity-50">
                {bulkSyncing ? '동기화 중…' : '☁ 전체 동기화'}
              </button>
            )}
            {!canEdit && editors !== null && (
              <span className="text-xs text-amber-400">
                🔒 저장 권한 없음{currentInspector ? ` — 현재: ${currentInspector}` : ' — 검수자 미선택'}
              </span>
            )}
            {canEdit && bulkSyncMsg && (
              <span className="text-[11px] text-indigo-300">{bulkSyncMsg}</span>
            )}
          </div>
          {/* 우측: 취소/저장 */}
          <div className="flex justify-end gap-2">
            {!done ? (
              <>
                <button onClick={onClose} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">취소</button>
                {canEdit && shipMeta.code && (
                  <button onClick={handleDelete}
                          className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-sm font-bold">
                    🗑 사전 삭제
                  </button>
                )}
                {canEdit && (
                  <button onClick={handleSave} disabled={!shipMeta.code || bayList.length === 0}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-bold disabled:opacity-50">
                    💾 베이사전 저장 ({shipMeta.code || '?'})
                  </button>
                )}
              </>
            ) : (
              <button onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm">완료</button>
            )}
          </div>
        </div>

        {/* M6.94.20: 권한자 관리 패널 (권한자만) */}
        {canEdit && showEditorMgr && (
          <div className="px-4 pb-4 border-t border-zinc-700 pt-3">
            <div className="text-sm font-bold text-white mb-2">👤 매트릭스 권한자 명단</div>
            <div className="text-[11px] text-zinc-400 mb-2">
              명단에 있는 검수자만 매트릭스를 저장하고 이 명단을 수정할 수 있습니다. 일반 사용자는 자동으로 받아보기만 합니다.
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {Array.isArray(editors) && editors.map(name => (
                <span key={name} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded text-xs text-white">
                  {name}
                  {editors.length > 1 && (
                    <button onClick={() => handleRemoveEditor(name)}
                            className="text-red-400 hover:text-red-300 ml-1">×</button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={editorInput} onChange={e => setEditorInput(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter') handleAddEditor(); }}
                     placeholder="검수자 이름 (예: 김성일)"
                     className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-sm text-white" />
              <button onClick={handleAddEditor}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-bold">추가</button>
            </div>
            {editorMsg && <div className="text-xs text-zinc-300 mt-2">{editorMsg}</div>}
            <div className="text-[10px] text-amber-400 mt-2">
              ⚠ 이름은 검수자 로그인 이름과 정확히 일치해야 합니다 (공백·철자 주의).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Tier 추가용 inline mini-입력
function TierAddInline({ onAdd, placeholder }) {
  const [v, setV] = useState('');
  const submit = () => {
    if (!v) return;
    onAdd(v);
    setV('');
  };
  return (
    <span className="inline-flex items-center gap-1 ml-2">
      <input
        type="number"
        value={v}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder={placeholder || 'tier'}
        className="w-14 px-1 py-0.5 bg-zinc-700 rounded text-center text-[11px]"
        min="1" max="99"
      />
      <button
        onClick={submit}
        disabled={!v}
        className="px-1.5 py-0.5 bg-emerald-700/60 hover:bg-emerald-600 rounded text-[10px] disabled:opacity-30"
        title="tier 추가"
      >+ 추가</button>
    </span>
  );
}
