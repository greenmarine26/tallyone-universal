// TallyOne 1.0 (판2 K1): 로그인 전용 전체 화면
//   구 InspectorModal(V9.45)의 자산 — 이름 선택·직책 표기·상태 배지·직접 입력·
//   비밀번호 게이트 3모드(setup/verify/owner)·잠금 판정 — 을 전부 흡수해 승격했다.
//   InspectorModal.jsx는 삭제됨 (중복 두 벌 금지 — 이 파일이 유일한 로그인 진입점).
//   앱 시작은 항상 이 화면(자동 로그인 없음). 로그인 성공 시 App이 역할별 해시로 보낸다.
import React, { useState, useEffect, useCallback } from 'react';
import { Anchor, UserPlus, LogIn, ArrowLeft } from 'lucide-react';
import { getStaffRole, isChief, STAFF_NAMES } from '../staffList.js';
import { inspectorStatus } from '../inspectorStatus.js';
import {
  MAX_TRUSTED_DEVICES,
  getAdminDeviceId, hashPassword, makeSalt, deviceLabel,
  getAdminNames, isTrustedDeviceFor, isOwnerName, OWNER_NAME,
  verifyPasswordFor, needsPasswordSetup, hasSessionPassFor, setSessionPassFor,
  isLockedName, lockEntry, lockPath, ownerCanUnlock,
} from '../adminGuard.js';
import { fbGetAdminGuard, fbUpdateAdminGuard } from '../firebase.js';
import { useBackHandler } from '../backHandler.js';
import { tenant } from '../tenant.js';   // TallyUni 0.1: 회사명 단일 소스

export default function LoginPage({ current = '', inspectors, extraStaff = {}, deletedStaff = {}, notice = '', onSelect, onCancel = null }) {
  const [newName, setNewName] = useState('');
  // TallyOne 1.0: 목록에서 이름을 고르면 선택만 되고, 하단 [로그인] 버튼으로 확정한다.
  const [selected, setSelected] = useState('');
  // ── V9.05→V9.45 계승: 잠금 대상(관리자 + 수석검수·부수석) 비밀번호 게이트 ──
  const [guard, setGuard] = useState(null);          // admin_guard 노드 (null = 미설정/로딩전)
  const [guardLoaded, setGuardLoaded] = useState(false);
  const [gateMode, setGateMode] = useState(null);    // null | 'verify' | 'setup' | 'owner'
  const [gateName, setGateName] = useState('');      // 지금 인증 중인 이름
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [regDevice, setRegDevice] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // V9.45 계승: 조회가 어떤 이유로 실패해도 guardLoaded는 반드시 세운다.
    //   안 세우면 로딩 검사(handlePick 첫 줄)에 걸려 아무도 로그인하지 못한다.
    fbGetAdminGuard()
      .then(g => { if (alive) setGuard(g); })
      .catch(e => { console.error('[guard] 조회 실패', e); })
      .finally(() => { if (alive) setGuardLoaded(true); });
    return () => { alive = false; };
  }, []);

  // V9.45 계승: 저장 직후 guard를 다시 읽는다. 안 읽으면 같은 화면에서 옛 값으로 판정한다.
  const refreshGuard = async () => {
    try { const g = await fbGetAdminGuard(); setGuard(g); } catch (e) { console.error('[guard] 재조회 실패', e); }
  };

  // TallyOne 1.0 (K3): 안드로이드 뒤로가기 = 비밀번호 게이트 닫기
  const closeGate = useCallback(() => {
    setGateMode(null); setPw1(''); setPw2(''); setRegDevice(false);
  }, []);
  useBackHandler(closeGate, !!gateMode);

  // 이름 확정 진입점 — 잠금 대상(관리자 + 수석검수·부수석)만 비밀번호 게이트를 거친다.
  const handlePick = (name) => {
    // V9.45 계승: 로딩 검사를 맨 앞으로 — guard가 null인 사이에 잠금 대상을 고르면
    //   "미설정"으로 읽혀 남의 비밀번호 설정 화면이 뜨는 사고를 막는다.
    if (!guardLoaded) { alert('이름 보호 정보를 불러오는 중 — 잠시 후 다시 시도하세요.'); return; }
    if (!isLockedName(guard, name)) { onSelect(name); return; }  // 일반 검수원은 그대로
    if (hasSessionPassFor(name)) { onSelect(name); return; }     // 이 탭에서 이미 비번 통과
    setGateName(name);
    // 비번 미설정 = 아직 한 번도 안 정한 사람 → 본인이 직접 정한다
    if (needsPasswordSetup(guard, name)) { setGateMode('setup'); return; }
    if (isTrustedDeviceFor(guard, name)) { onSelect(name); return; }   // 신뢰 기기
    setGateMode('verify');                                             // 그 외 기기 → 비밀번호
  };

  // 최초 설정: 비밀번호 등록 + 이 기기를 신뢰 기기 1호로
  const handleSetup = async () => {
    if (gateBusy) return;
    if (!pw1 || pw1.length < 4) { alert('비밀번호는 4자 이상으로 하세요.'); return; }
    if (pw1 !== pw2) { alert('비밀번호가 서로 다릅니다.'); return; }
    setGateBusy(true);
    try {
      const salt = makeSalt();
      const pwHash = await hashPassword(pw1, salt);
      const devId = getAdminDeviceId();
      // V9.45 계승: 관리자는 admins/, 수석검수·부수석은 locks/ — 노드를 나누지 않으면
      //   수석 비번을 저장하는 순간 admins에 키가 생겨 관리자 권한이 딸려 붙는다.
      const base = lockPath(guard, gateName);
      const ok = await fbUpdateAdminGuard({
        [`${base}/pwHash`]: pwHash,
        [`${base}/salt`]: salt,
        [`${base}/devices/${devId}`]: { label: `${deviceLabel()} (1호)`, addedAt: Date.now() },
      });
      if (!ok) { alert('저장 실패 — 네트워크를 확인하세요.'); return; }
      setSessionPassFor(gateName);
      setGateMode(null); setPw1(''); setPw2('');
      alert(`✅ ${gateName} 비밀번호 설정 완료 — 이 기기가 신뢰 기기 1호로 등록됐습니다.\n다른 기기에서는 비밀번호를 넣고 "기기 등록"을 체크하면 신뢰 기기(최대 ${MAX_TRUSTED_DEVICES}대)가 됩니다.\n\n잊었을 때는 ${OWNER_NAME}에게 초기화를 요청하세요.`);
      await refreshGuard();
      onSelect(gateName);
    } finally {
      setGateBusy(false);
    }
  };

  // 비신뢰 기기: 비밀번호 검증 (+선택 시 신뢰 기기 등록)
  const handleVerify = async () => {
    if (gateBusy) return;
    setGateBusy(true);
    try {
      const pass = await verifyPasswordFor(guard, gateName, pw1);
      if (!pass) { alert('비밀번호가 틀립니다.'); setPw1(''); return; }
      setSessionPassFor(gateName);
      const devCount = Object.keys(lockEntry(guard, gateName)?.devices || {}).length;
      if (regDevice && devCount < MAX_TRUSTED_DEVICES) {
        const devId = getAdminDeviceId();
        await fbUpdateAdminGuard({ [`${lockPath(guard, gateName)}/devices/${devId}`]: { label: `${deviceLabel()} (${devCount + 1}호)`, addedAt: Date.now() } });
        await refreshGuard();
      }
      setGateMode(null); setPw1(''); setRegDevice(false);
      onSelect(gateName);
    } finally {
      setGateBusy(false);
    }
  };

  // V9.45 계승: 소유자 마스터 해제 — 본인이 비번을 잊었을 때 소유자가 열어준다.
  const handleOwnerUnlock = async () => {
    if (gateBusy) return;
    setGateBusy(true);
    try {
      const pass = await verifyPasswordFor(guard, OWNER_NAME, pw1);
      if (!pass) { alert(`${OWNER_NAME} 비밀번호가 틀립니다.`); setPw1(''); return; }
      const hadPw = !!lockEntry(guard, gateName)?.pwHash;
      if (hadPw && confirm(`${gateName} 의 비밀번호와 신뢰 기기를 초기화할까요?\n\n초기화하면 다음에 ${gateName} 님이 이름을 고를 때 본인이 새 비밀번호를 정합니다.\n[취소] 를 누르면 이번만 열고 기존 비밀번호는 그대로 둡니다.`)) {
        const base = lockPath(guard, gateName);
        const ok = await fbUpdateAdminGuard({ [`${base}/pwHash`]: null, [`${base}/salt`]: null, [`${base}/devices`]: null });
        if (!ok) { alert('초기화 저장 실패 — 네트워크를 확인하세요. 이번 접속만 열립니다.'); }
        else { await refreshGuard(); alert(`✅ ${gateName} 비밀번호 초기화 완료`); }
      }
      setSessionPassFor(gateName);
      setGateMode(null); setPw1(''); setPw2('');
      onSelect(gateName);
    } finally {
      setGateBusy(false);
    }
  };

  const list = Object.values(inspectors || {})
    .filter(i => i && i.name)
    .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));

  // M5.61 계승: 이름 정규화 — 공백/콤마/특수문자 제거 후 비교
  const normalizeName = (s) => String(s || '')
    .trim()
    .replace(/[,\s\.\-_\/\\]/g, '')
    .toLowerCase();

  // 화이트리스트 (코드 명단 + Firebase 동적 명단 - 퇴사자 제외, 소유자는 항상 허용)
  const extraNames = Object.values(extraStaff || {}).map(s => s.name).filter(Boolean);
  const allWhitelist = [...new Set([...STAFF_NAMES, ...extraNames].filter(n => !deletedStaff[n] || isOwnerName(n)).concat(OWNER_NAME))];
  const isAllowed = (name) => allWhitelist.some(n => normalizeName(n) === normalizeName(name));

  // 직접 입력 — 검증 통과 시 선택 상태로 (로그인 버튼으로 확정)
  const handleDirect = () => {
    const raw = newName.trim();
    if (!raw) return;
    if (!/^[가-힣a-zA-Z0-9]{2,10}$/.test(raw)) {
      alert('이름은 한글/영문 2~10자만 가능합니다.');
      return;
    }
    if (!isAllowed(raw)) {
      const hint = allWhitelist.filter(n => n.includes(raw.slice(0, 2)) || raw.includes(n.slice(0, 2)));
      const hintTxt = hint.length > 0 ? `\n\n비슷한 이름: ${hint.slice(0, 5).join(', ')}` : '';
      alert(`"${raw}" — ${tenant().company} 직원 명단에 없습니다.\n정확한 이름으로 입력하세요.${hintTxt}\n\n새 직원 등록은 관리자(${getAdminNames(guard).join(', ')})에게 요청하세요.`);
      return;
    }
    const norm = normalizeName(raw);
    const exactName = allWhitelist.find(n => normalizeName(n) === norm);
    setSelected(exactName);
    setNewName('');
  };

  const handleLogin = () => { if (selected) handlePick(selected); };

  const working = list.filter(i => inspectorStatus(i) === 'working');
  const online = list.filter(i => inspectorStatus(i) === 'online');
  // 직접 입력으로 고른 이름이 목록에 없는 경우 표시용
  const selectedInList = list.some(i => i.name === selected);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-sm flex-1 flex flex-col">
        {/* ── 앱 로고/이름 — TallyOne 리브랜딩 (버전 문자열은 App 푸터가 담당) ── */}
        <div className="flex flex-col items-center mb-6 mt-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-800 to-blue-950 border border-blue-600/50 flex items-center justify-center shadow-lg shadow-blue-950/60 mb-3">
            <Anchor className="w-9 h-9 text-blue-300"/>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-blue-100">TallyOne</h1>
          <div className="text-[12px] text-slate-400 mt-1">평택항 컨테이너 검수</div>
        </div>

        {/* V9.13 계승: 자동 로그아웃 안내 */}
        {notice && (
          <div className="mb-3 text-[12px] text-amber-100 bg-amber-900/40 border border-amber-700/60 rounded-lg px-3 py-2 leading-relaxed">
            ⏱ {notice}
          </div>
        )}

        {/* 현재 작업중/로그인 인원 요약 */}
        {(working.length > 0 || online.length > 0) && (
          <div className="text-[11px] mb-2 px-1">
            {working.length > 0 && <span className="text-emerald-300">● {working.length}명 작업중: {working.map(a => a.name).join(', ')}</span>}
            {working.length > 0 && online.length > 0 && <span className="text-slate-500"> · </span>}
            {online.length > 0 && <span className="text-sky-300">○ {online.length}명 로그인: {online.map(a => a.name).join(', ')}</span>}
          </div>
        )}

        {/* ── 검수원 목록 (역할 뱃지 — 수석/부수석 강조) ── */}
        {list.length > 0 && (
          <div className="space-y-1.5 mb-3 max-h-[42vh] overflow-y-auto">
            {list.map(i => {
              const role = getStaffRole(i.name);
              const chief = isChief(i.name);
              const isSel = i.name === selected;
              return (
                <button
                  key={i.name}
                  onClick={() => setSelected(i.name)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border transition ${
                    isSel
                      ? 'bg-amber-900/40 border-amber-500 text-amber-100 ring-1 ring-amber-500/60'
                      : chief
                        ? 'bg-purple-950/40 border-purple-700/50 hover:bg-purple-950/60 text-slate-200'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-slate-900 text-xs font-black flex-shrink-0 ${chief ? 'bg-purple-400' : 'bg-amber-500'}`}>
                    {i.name[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate text-left">{i.name}</div>
                    {role && (
                      <div className={`text-[10px] truncate text-left ${chief ? 'text-purple-300 font-bold' : 'text-slate-400'}`}>
                        {chief && '👑 '}{role}
                      </div>
                    )}
                  </div>
                  {inspectorStatus(i) === 'working' && (
                    <span className="bg-emerald-700/40 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-bold">●작업중</span>
                  )}
                  {inspectorStatus(i) === 'online' && (
                    <span className="bg-sky-900/50 text-sky-300 text-[10px] px-1.5 py-0.5 rounded font-bold">○로그인</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── 직접 입력 (목록에 없는 검수원) ── */}
        <div className="border-t border-slate-800 pt-3 mb-3">
          <div className="text-[11px] text-slate-400 mb-1.5 font-bold">목록에 없으면 이름 직접 입력</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDirect()}
              placeholder="이름 입력"
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              autoFocus={list.length === 0}
            />
            <button
              onClick={handleDirect}
              disabled={!newName.trim()}
              className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 px-4 py-2 rounded text-sm font-bold text-slate-100 flex items-center gap-1"
            >
              <UserPlus className="w-4 h-4"/>선택
            </button>
          </div>
          {selected && !selectedInList && (
            <div className="mt-2 text-[12px] text-amber-200">선택됨: <b>{selected}</b>{getStaffRole(selected) ? ` · ${getStaffRole(selected)}` : ''}</div>
          )}
        </div>

        {/* ── 로그인 버튼 ── */}
        <button
          onClick={handleLogin}
          disabled={!selected}
          className="w-full py-3.5 rounded-xl font-black text-base flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 active:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 transition"
        >
          <LogIn className="w-5 h-5"/>{selected ? `${selected} 로그인` : '이름을 선택하세요'}
        </button>

        {/* 검수원 변경으로 들어온 경우(이미 로그인됨) — 돌아가기 */}
        {current && onCancel && (
          <button onClick={onCancel} className="mt-3 w-full py-2 text-sm text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5">
            <ArrowLeft className="w-4 h-4"/>{current} 그대로 돌아가기
          </button>
        )}
      </div>

      {/* ── 비밀번호 게이트 (setup/verify/owner) — 전체 화면 오버레이 ── */}
      {gateMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-slate-900 border border-amber-600/60 rounded-lg p-4">
            <div className="font-bold text-amber-200 text-sm mb-2">
              {gateMode === 'setup' ? `🔐 ${gateName} 비밀번호 설정`
                : gateMode === 'owner' ? `🔑 ${OWNER_NAME} 비밀번호로 ${gateName} 열기`
                : `🔐 ${gateName} 선택 — 비밀번호`}
            </div>
            {gateMode === 'setup' && (
              <div className="text-[11px] text-slate-400 mb-2">
                <b className="text-amber-300">{getStaffRole(gateName) || '보호 대상'}</b> 이름은 본인만 쓸 수 있습니다. 처음 한 번 비밀번호를 정하세요.
                이 기기가 신뢰 기기 1호가 되고, 신뢰 기기(최대 {MAX_TRUSTED_DEVICES}대)에서는 다음부터 비밀번호 없이 선택됩니다.
              </div>
            )}
            {gateMode === 'verify' && (
              <div className="text-[11px] text-slate-400 mb-2">
                이 기기는 <b className="text-amber-300">{gateName}</b> 님의 신뢰 기기가 아닙니다. 본인 비밀번호를 입력하세요.
              </div>
            )}
            {gateMode === 'owner' && (
              <div className="text-[11px] text-slate-400 mb-2">
                {gateName} 님이 비밀번호를 잊었을 때 씁니다. {OWNER_NAME} 비밀번호를 입력하면 이번 접속만 열립니다
                (이 기기는 신뢰 기기로 등록되지 않습니다).
              </div>
            )}
            <input
              type="password" value={pw1} onChange={e => setPw1(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (gateMode === 'setup' ? handleSetup() : gateMode === 'owner' ? handleOwnerUnlock() : handleVerify())}
              placeholder={gateMode === 'owner' ? `${OWNER_NAME} 비밀번호` : '비밀번호'}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 mb-2 focus:outline-none focus:border-amber-500"
              autoFocus
            />
            {gateMode === 'setup' && (
              <input
                type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSetup()}
                placeholder="비밀번호 확인"
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 mb-2 focus:outline-none focus:border-amber-500"
              />
            )}
            {/* V9.45 계승: 그 사람 기기 수 기준으로 신뢰 기기 등록 여부 노출 */}
            {gateMode === 'verify' && Object.keys(lockEntry(guard, gateName)?.devices || {}).length < MAX_TRUSTED_DEVICES && (
              <label className="flex items-center gap-2 text-[11px] text-slate-300 mb-2 select-none">
                <input type="checkbox" checked={regDevice} onChange={e => setRegDevice(e.target.checked)}/>
                이 기기를 신뢰 기기로 등록 ({Object.keys(lockEntry(guard, gateName)?.devices || {}).length}/{MAX_TRUSTED_DEVICES})
              </label>
            )}
            <div className="flex gap-2">
              <button
                onClick={gateMode === 'setup' ? handleSetup : gateMode === 'owner' ? handleOwnerUnlock : handleVerify}
                disabled={gateBusy || !pw1}
                className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 px-3 py-2 rounded text-sm font-bold text-amber-100"
              >
                {gateBusy ? '확인 중…' : '확인'}
              </button>
              <button
                onClick={closeGate}
                className="px-3 py-2 rounded text-sm bg-slate-800 border border-slate-700 text-slate-300"
              >
                취소
              </button>
            </div>
            {/* 비밀번호를 잊었을 때의 유일한 출구 — 소유자가 열어준다 */}
            {gateMode !== 'owner' && ownerCanUnlock(guard, gateName) && (
              <button
                onClick={() => { setGateMode('owner'); setPw1(''); setPw2(''); }}
                className="mt-2 w-full text-[11px] text-slate-400 hover:text-amber-300 underline underline-offset-2"
              >
                비밀번호를 잊으셨나요? — {OWNER_NAME} 비밀번호로 열기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
