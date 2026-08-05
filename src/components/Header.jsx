import React, { useState } from 'react';
// TallyOne 1.0 (K4): 미사용 아이콘 임포트 제거(Cloud·RefreshCw·Power) + 보조기능 아이콘 추가
// TallyOne 1.1: 클로드에게 메모 아이콘(NotebookPen) 추가
import { CloudOff, Home, Anchor, HelpCircle, Truck, LogOut, Key, MoreVertical, Users, Wrench, DoorOpen, NotebookPen } from 'lucide-react';
import { exitApp } from '../backHandler.js';
import { isChief } from '../staffList.js';       // TallyOne 1.0: 상단 역할 표시(검수사/수석/소유자)
import { isOwnerName } from '../adminGuard.js';
import HelpModal from './HelpModal.jsx';
import GeminiKeyModal from './GeminiKeyModal.jsx';
import ClaudeMemoModal from './ClaudeMemoModal.jsx';   // TallyOne 1.1: 클로드에게 메모 모달
import ConfirmModal, { useConfirm } from './ConfirmModal.jsx';
import { getEquipNumber, setEquipNumber, _storage, SK, getPierFromBerth, equipNumbersForPier } from '../utils.js';

export default function Header({ version, inspector, online, route, voyages, onChangeInspector, onGoHome, onLogout, onOpenStaffManager, onOpenAux }) {
  const cur = route.name === 'voyage' ? voyages[route.voyageKey] : null;
  const info = cur?.info;
  // V8.10: 현재 항차 부두 기준 장비 목록. 항차 없으면 1~5 전체.
  const equipNumbers = equipNumbersForPier(getPierFromBerth(info?.berth || ''));
  const [helpOpen, setHelpOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);   // M6.14d: Gemini 키 설정 모달
  const [memoOpen, setMemoOpen] = useState(false); // TallyOne 1.1: 클로드에게 메모 모달 (HelpModal과 같은 Header 내부 state 패턴)
  // M5.0: 영어회화집은 HelpModal 안의 [영어회화] 탭으로 이동 (헤더에서 별도 버튼 제거)
  const [equipOpen, setEquipOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);   // V9.15: 부가 버튼 4개(도움말·키·인원·종료)를 ⋯ 메뉴로 — 선박명 자리 확보
  const [equipNo, setEquipNoState] = useState(getEquipNumber());
  // M3.74: confirm() → ConfirmModal
  const [confirmState, askConfirm] = useConfirm();
  // M6.14d: 사용자 키 미설정 시 경고 (헤더 키 버튼 점멸)
  const hasUserKey = !!_storage.get(SK.geminiKey);

  // TallyOne 1.0 (K3·B-7): 로그아웃/앱 종료 2메뉴 분리 — 둘 다 확인 단계를 먼저 밟는다.
  //   종전에는 onLogout이 확인 없이 곧장 서버에 로그아웃을 마킹했다(B-7).
  const handleLogoutClick = () => {
    askConfirm({
      title: '로그아웃',
      message: `${inspector || '검수원'} 님, 로그아웃할까요?\n\n작업 기록은 그대로 남습니다.`,
      confirmLabel: '로그아웃',
      cancelLabel: '취소',
      onConfirm: () => onLogout && onLogout(),
    });
  };
  const handleExitClick = () => {
    askConfirm({
      title: '앱 종료',
      message: 'TallyOne 검수앱을 종료하시겠습니까?\n\n(완전 종료는 폰 홈 버튼이나 앱 스위처에서 닫아주세요)',
      confirmLabel: '종료',
      cancelLabel: '취소',
      onConfirm: () => exitApp(),
    });
  };
  // TallyOne 1.0 (K4): 현재 역할 표시 — 소유자 > 수석 > 검수사
  const roleLabel = !inspector ? '' : isOwnerName(inspector) ? '소유자' : isChief(inspector) ? '수석' : '검수사';

  const handleSelectEquip = (num) => {
    setEquipNumber(num);
    setEquipNoState(num);
    setEquipOpen(false);
    window.dispatchEvent(new CustomEvent('equipChanged', { detail: num }));
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {route.name !== 'home' ? (
            <button onClick={onGoHome}
              title="홈으로 (항차 선택 화면)"
              className="p-1.5 rounded bg-blue-900/40 hover:bg-blue-900/70 active:bg-blue-900/90 border border-blue-700/50 flex-shrink-0">
              <Home className="w-5 h-5 text-blue-300"/>
            </button>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-blue-900/60 border border-blue-700/40 flex items-center justify-center flex-shrink-0">
              <Anchor className="w-5 h-5 text-blue-300"/>
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-sm text-blue-100 truncate leading-tight">
              {/* TallyOne 1.0 (K4): 앱 이름 리브랜딩 — 버전 문자열은 건드리지 않음(통합 시 처리) */}
              {info ? info.vsl : 'TallyOne'}
            </div>
            <div className="text-[10px] text-slate-500 truncate leading-tight">
              {/* V8.82: 모드 따라 항차 표시 — 양하=voy_d, 선적=voy_l (구: 항상 voy_d 우선이라 선적 중에도 양하 항차가 보임) */}
              {info ? `${(route?.mode === 'loading' ? (info.voy_l || info.voy_d) : (info.voy_d || info.voy_l)) || info.voy || ''} · ${info.carrier || ''}` : '🌊 그린마린 검수팀 전용'}
            </div>
          </div>
        </div>

        {/* V9.15: 헤더 정리 — 종전 우측 6버튼(262px)이 선박명을 42px까지 밀어냈다(전면 점검 3-1).
            상시 노출은 장비·검수원 2개만, 도움말·Gemini 키·인원 관리·로그아웃은 ⋯ 메뉴로.
            버튼도 40px대로 키움(터치 타깃). 오프라인은 아이콘 대신 헤더 아래 빨간 띠(하단 렌더). */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* M3.5.6: 장비 번호 빠른 변경 */}
          <button
            onClick={() => setEquipOpen(true)}
            title="장비 번호 변경"
            className={`px-2 py-2 rounded-lg text-sm font-bold flex items-center gap-1 ${
              equipNo
                ? 'bg-orange-700 text-white border border-orange-500'
                : 'bg-slate-800 text-slate-400 border border-slate-600 animate-pulse'
            }`}
          >
            <Truck className="w-4 h-4"/>
            {equipNo || '장비?'}
          </button>
          <button
            onClick={onChangeInspector}
            className="bg-amber-900/40 border border-amber-700/40 px-2 py-1.5 rounded-lg text-xs flex items-center gap-1.5 active:bg-amber-900/60"
          >
            <span className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-slate-900 text-[11px] font-black">
              {(inspector && inspector[0]) || '?'}
            </span>
            {/* TallyOne 1.0 (K4): 이름 아래 현재 역할 표시 */}
            <span className="flex flex-col items-start leading-tight min-w-0">
              <span className="font-bold text-amber-200 max-w-[56px] truncate">{inspector || '검수원'}</span>
              {roleLabel && <span className="text-[9px] text-amber-400/90">{roleLabel}</span>}
            </span>
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(v => !v)}
              title="메뉴 (도움말·설정)"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-600 relative"
            >
              <MoreVertical className="w-5 h-5 text-slate-300"/>
              {!hasUserKey && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"/>}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)}/>
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-slate-900 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
                  <button onClick={() => { setMenuOpen(false); setHelpOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 text-left hover:bg-slate-800 active:bg-slate-700" style={{ minHeight: 48 }}>
                    <HelpCircle className="w-5 h-5 text-amber-300 shrink-0"/>
                    <span className="text-sm text-slate-200 font-bold">사용 매뉴얼</span>
                    <span className="ml-auto text-[10px] text-slate-500">{version}</span>
                  </button>
                  <button onClick={() => { setMenuOpen(false); setKeyOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 text-left hover:bg-slate-800 active:bg-slate-700" style={{ minHeight: 48 }}>
                    <Key className={`w-5 h-5 shrink-0 ${hasUserKey ? 'text-emerald-300' : 'text-red-300'}`}/>
                    <span className="text-sm text-slate-200 font-bold">AI 검색 키</span>
                    {!hasUserKey && <span className="ml-auto text-[10px] text-red-300 font-bold">설정 필요</span>}
                  </button>
                  {/* TallyOne 1.1: 클로드에게 메모 — 발견한 문제·요청을 claude_inbox로 보낸다 (전 화면 접근) */}
                  <button onClick={() => { setMenuOpen(false); setMemoOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 text-left hover:bg-slate-800 active:bg-slate-700" style={{ minHeight: 48 }}>
                    <NotebookPen className="w-5 h-5 text-violet-300 shrink-0"/>
                    <span className="text-sm text-slate-200 font-bold">📝 클로드에게 메모</span>
                  </button>
                  {/* TallyOne 1.0 (K4): 보조기능(#/aux) 진입 — 건강 점검·맛집 수첩 등 */}
                  {onOpenAux && (
                    <button onClick={() => { setMenuOpen(false); onOpenAux(); }}
                      className="w-full flex items-center gap-3 px-4 text-left hover:bg-slate-800 active:bg-slate-700" style={{ minHeight: 48 }}>
                      <Wrench className="w-5 h-5 text-sky-300 shrink-0"/>
                      <span className="text-sm text-slate-200 font-bold">보조기능</span>
                    </button>
                  )}
                  {onOpenStaffManager && (
                    <button onClick={() => { setMenuOpen(false); onOpenStaffManager(); }}
                      className="w-full flex items-center gap-3 px-4 text-left hover:bg-slate-800 active:bg-slate-700" style={{ minHeight: 48 }}>
                      <Users className="w-5 h-5 text-amber-300 shrink-0"/>
                      <span className="text-sm text-slate-200 font-bold">인원 관리</span>
                    </button>
                  )}
                  <div className="border-t border-slate-700"/>
                  {/* TallyOne 1.0 (K3): 로그아웃/앱 종료 2메뉴 분리 — 각각 확인 후 실행 */}
                  {onLogout && (
                    <button onClick={() => { setMenuOpen(false); handleLogoutClick(); }}
                      className="w-full flex items-center gap-3 px-4 text-left hover:bg-red-950/40 active:bg-red-950/60" style={{ minHeight: 48 }}>
                      <LogOut className="w-5 h-5 text-red-300 shrink-0"/>
                      <span className="text-sm text-red-200 font-bold">로그아웃</span>
                    </button>
                  )}
                  <button onClick={() => { setMenuOpen(false); handleExitClick(); }}
                    className="w-full flex items-center gap-3 px-4 text-left hover:bg-red-950/40 active:bg-red-950/60" style={{ minHeight: 48 }}>
                    <DoorOpen className="w-5 h-5 text-red-300 shrink-0"/>
                    <span className="text-sm text-red-200 font-bold">앱 종료</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {/* V9.15: 오프라인은 14px 아이콘 대신 놓칠 수 없는 띠로 */}
      {!online && (
        <div className="bg-red-900/80 text-red-100 text-[12px] font-bold text-center py-1">
          <CloudOff className="w-3.5 h-3.5 inline mr-1 -mt-0.5"/>오프라인 — 저장은 연결 복구 후 서버에 반영됩니다
        </div>
      )}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)}/>
      {/* M6.14d: Gemini API 키 설정 모달 */}
      {keyOpen && <GeminiKeyModal onClose={() => setKeyOpen(false)} />}
      {/* TallyOne 1.1: 클로드에게 메모 — Header가 이미 받는 props로 자동 첨부 정보 구성 (route 없으면 모달이 해시 파싱 폴백) */}
      {memoOpen && (
        <ClaudeMemoModal
          inspector={inspector}
          route={route}
          appVersion={version}
          onClose={() => setMemoOpen(false)}
        />
      )}
      {/* M5.0: ContainerPhrasebook은 HelpModal 안에서 호출됨 */}

      {/* M3.5.6: 장비 번호 선택 모달 */}
      {equipOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setEquipOpen(false)}>
          <div className="bg-slate-900 border-2 border-orange-700 rounded-2xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-5 h-5 text-orange-400"/>
              <span className="font-bold text-orange-300">장비 번호 선택</span>
            </div>
            <div className="text-[11px] text-slate-400 mb-3">현재 작업 중인 장비를 선택하세요. 작업 보고에 자동 포함됩니다.</div>
            <div className="grid grid-cols-2 gap-2">
              {equipNumbers.map(num => (
                <button key={num} onClick={() => handleSelectEquip(num)}
                  className={`py-4 rounded-lg font-black text-lg ${
                    equipNo === num ? 'bg-orange-600 text-white border-2 border-orange-300' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}>
                  {num}
                </button>
              ))}
            </div>
            {equipNo && (
              <button onClick={() => handleSelectEquip('')}
                className="w-full mt-2 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs">
                장비 번호 해제
              </button>
            )}
          </div>
        </div>
      )}

      {/* M3.74: confirm() → ConfirmModal */}
      <ConfirmModal {...confirmState} />
    </header>
  );
}
