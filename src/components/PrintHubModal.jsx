// M5.26: 통합 출력 허브 모달
// 양하/선적 탭 × 항목별 (검수 리스트 / 카고플랜 / 베이 상세) 출력
//   - 평택분만 (양하 mode = 평택 양하 대상, 선적 mode = 평택 선적 대상)
//   - 컨테이너는 이미 mode별로 분리되어 voyage.discharge / voyage.loading에 있음
import React, { useState, useMemo } from 'react';
import { X, FileText, Grid3x3, Ship, ArrowDown, ArrowUp, Printer } from 'lucide-react';
import { openInspectionListPrint } from '../inspectionList.js';
import { openWorkingReportPrint } from '../workingReport.js';
import PrintableCargoPlanV2 from './PrintableCargoPlanV2.jsx';
import PrintableBayDetail from './PrintableBayDetail.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { isPyeongtaekPort, computeShiftingMapCached, fullEdiMapOf, tagForecastMarks } from '../utils.js';

export default function PrintHubModal({ voyage, voyageKey, onClose }) {
  // M5.64: voucher 출력 전 입력값 (선적 항차 + BERTH)
  const [voucherLoadVoy, setVoucherLoadVoy] = useState(voyage?.loading?.info?.voy || '');
  const [voucherDischVoy, setVoucherDischVoy] = useState(voyage?.discharge?.info?.voy || '');
  const [voucherBerth, setVoucherBerth] = useState(voyage?.info?.berth || voyage?.discharge?.info?.berth || '');

  const [mode, setMode] = useState('discharge');  // 'discharge' | 'loading'
  const [printSub, setPrintSub] = useState(null);  // 'cargo' | 'detail' | null

  // M5.30-fix: 카고플랜/베이상세는 전체 컨테이너 (평택+통과), 검수리스트는 평택만
  //   원인: 카고플랜은 선박 적부도라 모든 화물 표시 필요. 평택 필터 X
  //         빈 슬롯도 베이사전 기준으로 표시 (영구 규칙 #30)
  const sec = voyage?.[mode] || {};
  const ediMap = sec.ediContainers || {};
  const recMap = sec.records || {};
  const compMap = sec.completed || {};
  const xrayMap = sec.xrayList || {};
  // V8.98-02: 카고플랜/베이상세는 선박 전체 적부도 — 수집기 등록 항차의 ediContainers엔 통과화물이 없어
  //   raw EDI 전문을 파싱해 전체 컨을 쓴다(저장본이 있는 키는 저장본 우선 — _slotKey 등 보존). raw 없으면 기존 그대로.
  // V9.07-03: 로직을 utils.fullEdiMapOf로 승격 — 편집기와 같은 소스를 쓴다
  const fullEdiMap = useMemo(() => fullEdiMapOf(sec),
    [sec?.raw?.edi?.uploadedAt, sec?.raw?.edi?.sizeBytes, ediMap]);
  // V8.98-01: 쉬프팅(재적부) — raw EDI 원문 기반 대조 (ediContainers엔 통과화물 없음).
  //   uploadedAt 기준 메모 — 스냅샷마다 300KB 재파싱 방지.
  const shiftingMap = useMemo(
    () => computeShiftingMapCached(voyageKey, voyage),
    [voyage?.discharge?.raw?.edi?.uploadedAt, voyage?.loading?.raw?.edi?.uploadedAt,
     voyage?.discharge?.raw?.edi?.sizeBytes, voyage?.loading?.raw?.edi?.sizeBytes, voyageKey]
  );

  const isPtk = (c) => {
    if (!c) return false;
    // M5.50: 리스트에 있는 컨테이너는 무조건 평택 화물로 인식
    //   (사용자가 평택에서 검수하는 모든 컨테이너 = 리스트 등록 = 검수 대상)
    //   EDI POL/POD가 KRPTK 아닌 환적 표기여도 리스트 등록되면 평택분
    if (c.cn && recMap[c.cn]) return true;
    // M6.94.25: 평택 판정 공용 함수 (KRPYOTM 등 변형 포함). POL/POD 비면 평택 간주.
    if (mode === 'discharge') {
      return !c.pod || isPyeongtaekPort(c.pod);
    } else {
      return !c.pol || isPyeongtaekPort(c.pol);
    }
  };

  // 머지 (모든 컨테이너)
  // M6.94.28: 리스트가 EDI 핵심 필드를 덮어쓰지 못하게 보호 (VoyagePage와 동일 원칙).
  //   원인: EMPTY 엑셀은 항구 컬럼이 목적지(CNDLC 등)인데 이게 pol로 파싱됨.
  //   기존엔 리스트 값이 EDI(pol=KRPTK)를 무조건 덮어 → 엠티의 pol이 CNDLC가 되어
  //   카고플랜 별첨의 평택 필터(pol includes PTK)에서 285대가 전부 빠지던 버그.
  //   EDI에 있는 컨은 위치/항구/규격 등 핵심 필드를 EDI 진실로 유지, 보강 필드만 리스트 허용.
  const PROTECTED_EDI_FIELDS = new Set([
    'pol', 'pod', 'npod', 'fpod', 'bay', 'row', 'tier', 'pos',
    'iso', 'fe', 'rf', 'fr', 'ot', 'tk', 'dg', 'oog', 'voy', 'vsl',
  ]);
  const allCnSet = new Set([...Object.keys(fullEdiMap), ...Object.keys(recMap)]);
  const allContainersBase = [...allCnSet].map(cn => {
    const e = fullEdiMap[cn] || {};
    const r = recMap[cn] || {};
    const hasEdi = !!fullEdiMap[cn];
    const merged = { ...e };
    Object.entries(r).forEach(([k, v]) => {
      if (v === '' || v == null) return;
      // EDI에 있는 컨테이너는 핵심 필드를 리스트가 덮지 못함 (EDI가 진실)
      if (hasEdi && PROTECTED_EDI_FIELDS.has(k)) return;
      merged[k] = v;
    });
    // V8.86: 컨번호 없는 EDI 자리(배열 인덱스 키) → 배열 인덱스가 컨번호로 둔갑하지 않게 __SLOT_ 키 부여
    merged.cn = (hasEdi && !e.cn && !recMap[cn]) ? `__SLOT_${e.bay || ''}_${e.row || ''}_${e.tier || ''}_${cn}` : cn;
    if (hasEdi && !e.cn && !recMap[cn]) { merged.pendingCn = true; merged._slot = true; }
    merged._comp = compMap[cn] || null;
    // M6.94.29: 리스트(records) 등록 표식 — 카고플랜 별첨이 평택 판정에 사용.
    //   검수리스트와 동일 원칙: 리스트에 등록되면 무조건 평택분.
    //   EDI가 KRPTK로 증명하거나 리스트에 있으면 평택 → pol 값에만 의존하지 않음.
    if (recMap[cn]) merged._inList = true;
    if (xrayMap[cn]) merged._xray = true;
    return merged;
  });

  // TallyOne 1.10-01: 긴급/수화물 예보 마커 주입 — VoyagePage와 같은 게이트 규칙.
  //   forecast.mode가 현재 모드와 일치할 때만 적용(선적 예보 마커가 양하 인쇄물에 새지 않게).
  const _fc = voyage?.info?.forecast;
  const _fcApply = _fc && (_fc.mode || 'loading') === mode;
  const urgentSet = new Set((_fcApply && Array.isArray(_fc.urgentCns)) ? _fc.urgentCns : []);
  const luggSet = new Set((_fcApply && Array.isArray(_fc.luggageCns)) ? _fc.luggageCns : []);
  const allContainers = tagForecastMarks(
    allContainersBase, urgentSet, luggSet, _fcApply ? _fc.luggageSeals : null);

  // M5.30-fix: 베이 단위 필터
  //   평택 화물이 1개라도 있는 베이의 전체 슬롯 표시 (그 베이의 통과 화물 + 빈 슬롯 포함)
  //   사용자 명세: "평택분 화물이 하나라도 있다면 그 베이 전체 티어/로우를 다 보여줘야 함"
  //   베이 번호 추출: bay_actual (검수원 수정) 우선, 없으면 pos[0:3]
  const getBay = (c) => {
    if (!c) return '';
    const b = c.bay_actual || c.bay || (c.pos ? String(c.pos).slice(0, 3) : '');
    return String(b).padStart(3, '0').slice(0, 3);
  };

  // 평택분 컨테이너의 베이 set (포함된 베이만 표시 대상)
  const ptkBays = new Set();
  allContainers.forEach(c => {
    if (isPtk(c)) {
      const b = getBay(c);
      if (b && b !== '000') ptkBays.add(b);
    }
  });

  // 카고플랜/베이상세용: 평택 화물 있는 베이의 전체 컨테이너
  const printContainers = allContainers.filter(c => {
    const b = getBay(c);
    return b && ptkBays.has(b);
  });

  // 검수 리스트용 — 평택분만
  const ptkContainers = allContainers.filter(isPtk);

  // M5.31: 베이상세용 row/tier 계산 (BayPlan과 동일 패턴)
  //   "빈 슬롯도 표시"를 위해 — 베이가 한 컨만 있어도 모든 tier/row 슬롯 표시
  let maxLeft = 0, maxRight = 0;
  const tierSet = new Set();
  printContainers.forEach(c => {
    if (c.row) {
      const n = parseInt(c.row);
      if (n > 0) {
        if (n % 2 === 0) maxLeft = Math.max(maxLeft, n);
        else maxRight = Math.max(maxRight, n);
      }
    }
    if (c.tier) tierSet.add(c.tier);
  });
  const globalRowRange = { maxLeft, maxRight };
  const globalTiers = Array.from(tierSet);

  const voyageInfo = voyage?.info || {};
  const shipImo = voyageInfo.imo || '';
  const shipName = voyageInfo.vsl || '';

  const count = ptkContainers.length;        // 검수 리스트 카운트 (평택만)
  const allCount = allContainers.length;     // 카고플랜/베이상세 카운트 (전체)
  const modeKo = mode === 'discharge' ? '양하' : '선적';

  // 양하/선적 카운트 (탭 라벨용 — 평택만)
  // M5.51: 리스트 등록 컨테이너는 무조건 평택분 (isPtk와 동기화)
  const countMode = (m) => {
    const s = voyage?.[m] || {};
    const ed = s.ediContainers || {};
    const rc = s.records || {};
    const cnSet = new Set([...Object.keys(ed), ...Object.keys(rc)]);
    let n = 0;
    cnSet.forEach(cn => {
      if (rc[cn]) { n++; return; }  // M5.51: 리스트에 있으면 무조건 평택
      const c = { ...(ed[cn] || {}) };
      const target = m === 'discharge' ? c.pod : c.pol;
      if (!target || isPyeongtaekPort(target)) n++;
    });
    return n;
  };
  const dischargeCount = countMode('discharge');
  const loadingCount = countMode('loading');

  const handlePrintInspection = () => {
    if (count === 0) {
      alert(`${modeKo} 컨테이너가 없습니다`);
      return;
    }
    // V8.98-05: 쉬프팅 별첨 — 컨 정보 보강해 전달
    const _shiftList = Object.keys(shiftingMap || {}).map(cn => {
      const c = fullEdiMap[cn] || {};
      return { cn, from: shiftingMap[cn].from, to: shiftingMap[cn].to, iso: c.iso || '', pod: c.pod || '' };
    }).sort((a, b) => a.from.localeCompare(b.from));
    openInspectionListPrint(ptkContainers, mode, voyageInfo, _shiftList);
  };

  // 서브 모달 (카고플랜 V2/베이 상세) 표시 중이면 그것만
  // M6.93.11: V1 카고플랜 폐기 (사용자 결정). 'cargo' subroute → V2로 redirect.
  if (printSub === 'cargo') {
    // 호환성: 옛 'cargo' 경로 진입 시 V2로 전환
    setPrintSub('cargo-v2');
    return null;
  }
  if (printSub === 'cargo-v2') {
    return (
      <ErrorBoundary name="카고 플랜 V2 (M6.81 회귀)" onClose={() => setPrintSub(null)}>
        <PrintableCargoPlanV2
          containers={printContainers}
          legendContainers={ptkContainers}
          mode={mode}
          voyageInfo={voyageInfo}
          shipImo={shipImo}
          shipName={shipName}
          xrayMap={xrayMap}
          shiftingMap={shiftingMap}
          onClose={() => setPrintSub(null)}
        />
      </ErrorBoundary>
    );
  }
  if (printSub === 'detail') {
    return (
      <ErrorBoundary name="베이 상세 인쇄" onClose={() => setPrintSub(null)}>
        <PrintableBayDetail
          containers={printContainers}
          mode={mode}
          voyageInfo={voyageInfo}
          voyageKey={voyageKey}
          shipImo={shipImo}
          shipName={shipName}
          globalRowRange={globalRowRange}
          globalTiers={globalTiers}
          onClose={() => setPrintSub(null)}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
      <div className="bg-slate-900 w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl max-h-[95vh] overflow-y-auto flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Printer className="w-5 h-5 text-amber-300" />
            검수 자료 출력
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 양하/선적 탭 */}
        <div className="flex border-b border-slate-700 sticky top-[65px] bg-slate-900 z-10">
          <button
            onClick={() => setMode('discharge')}
            className={`flex-1 py-3 font-bold flex items-center justify-center gap-2 ${
              mode === 'discharge'
                ? 'bg-blue-900/40 text-blue-200 border-b-2 border-blue-400'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <ArrowDown className="w-4 h-4" />
            양하 ({dischargeCount})
          </button>
          <button
            onClick={() => setMode('loading')}
            className={`flex-1 py-3 font-bold flex items-center justify-center gap-2 ${
              mode === 'loading'
                ? 'bg-amber-900/40 text-amber-200 border-b-2 border-amber-400'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <ArrowUp className="w-4 h-4" />
            선적 ({loadingCount})
          </button>
        </div>

        {/* 항목 리스트 */}
        <div className="p-4 space-y-3">
          {/* FINAL WORKING REPORT (VOUCHER) — 입력 폼 + 두 버튼 */}
          <div className="bg-slate-800/50 border-2 border-amber-600/30 rounded-lg p-3 space-y-2">
            <div className="text-sm font-bold text-amber-200 mb-2">📄 FINAL WORKING REPORT 출력</div>
            {/* 항차 + BERTH 입력 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">양하 항차</label>
                <input
                  type="text"
                  value={voucherDischVoy}
                  onChange={(e) => setVoucherDischVoy(e.target.value)}
                  placeholder="예: 0145N"
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">선적 항차</label>
                <input
                  type="text"
                  value={voucherLoadVoy}
                  onChange={(e) => setVoucherLoadVoy(e.target.value)}
                  placeholder="예: 0146S"
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">BERTH</label>
              <input
                type="text"
                value={voucherBerth}
                onChange={(e) => setVoucherBerth(e.target.value)}
                placeholder="예: 6"
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100"
              />
            </div>
            {/* 출력 버튼 두 개 */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => openWorkingReportPrint(voyage, voyage?.info || {}, 'settlement', {
                  dischVoy: voucherDischVoy, loadVoy: voucherLoadVoy, berth: voucherBerth
                })}
                className="bg-amber-900/40 hover:bg-amber-900/60 border border-amber-600/50 rounded p-2 text-center"
              >
                <div className="font-bold text-amber-100 text-xs">📄 결제용</div>
                <div className="text-[10px] text-amber-200/70">완료 가정</div>
              </button>
              <button
                onClick={() => openWorkingReportPrint(voyage, voyage?.info || {}, 'actual', {
                  dischVoy: voucherDischVoy, loadVoy: voucherLoadVoy, berth: voucherBerth
                })}
                className="bg-blue-900/40 hover:bg-blue-900/60 border border-blue-600/50 rounded p-2 text-center"
              >
                <div className="font-bold text-blue-100 text-xs">📄 작업용</div>
                <div className="text-[10px] text-blue-200/70">진행 현황</div>
              </button>
            </div>
          </div>

          {count === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>이 모드에 컨테이너 자료가 없습니다</p>
              <p className="text-xs mt-1">자료 탭에서 EDI/리스트 업로드 후 사용</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                {modeKo} <strong className="text-slate-200">{count}대</strong> · 평택항 {modeKo} 대상만 포함
              </p>

              {/* 1. 검수 리스트 */}
              <button
                onClick={handlePrintInspection}
                className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg p-4 text-left flex items-center gap-3"
              >
                <FileText className="w-8 h-8 text-emerald-400 shrink-0" />
                <div className="flex-1">
                  <div className="font-bold text-slate-100">📋 검수 리스트</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    A4 세로, 좌우 2단, 페이지당 140대 · 시트1(전체) + 시트2(특수화물 별첨)
                  </div>
                </div>
                <Printer className="w-4 h-4 text-slate-500" />
              </button>

              {/* 2. 카고플랜 V2 (M6.93.11: V1 폐기, V2만 사용 - 사용자 결정) */}
              <button
                onClick={() => setPrintSub('cargo-v2')}
                className="w-full bg-emerald-900 hover:bg-emerald-800 border border-emerald-700 rounded-lg p-4 text-left flex items-center gap-3"
              >
                <Grid3x3 className="w-8 h-8 text-emerald-300 shrink-0" />
                <div className="flex-1">
                  <div className="font-bold text-emerald-100">📐 카고플랜 V2</div>
                  <div className="text-xs text-emerald-200 mt-0.5">
                    매트릭스 빌더 저장 데이터 우선 · 베이별 cells hull 단면
                  </div>
                </div>
                <Printer className="w-4 h-4 text-emerald-400" />
              </button>

              {/* 3. 베이 상세 */}
              <button
                onClick={() => setPrintSub('detail')}
                className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg p-4 text-left flex items-center gap-3"
              >
                <Ship className="w-8 h-8 text-purple-400 shrink-0" />
                <div className="flex-1">
                  <div className="font-bold text-slate-100">🚢 베이 상세</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    베이별 슬롯 단위 컨테이너 위치 · 검수 현장용
                  </div>
                </div>
                <Printer className="w-4 h-4 text-slate-500" />
              </button>
            </>
          )}
        </div>

        {/* 하단 안내 */}
        <div className="p-4 border-t border-slate-700 text-xs text-slate-500 leading-relaxed">
          출력 클릭 → 새 창 미리보기 → Ctrl+P (인쇄 또는 PDF 저장)<br />
          💡 컬러 인쇄 권장 (특수화물 색상 구분)
        </div>
      </div>
    </div>
  );
}
