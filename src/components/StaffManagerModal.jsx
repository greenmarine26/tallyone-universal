// M5.73: 인원 관리 전용 모달 (김성일만 진입)
//   InspectorModal과 분리 — 선택과 관리를 명확히 구분
import React, { useState } from 'react';
import { inspectorStatus } from '../inspectorStatus.js';
import { X, UserPlus, Trash2, Shield, RefreshCw, Download } from 'lucide-react';
import { isStaff, getStaffRole, STAFF_LIST, STAFF_NAMES } from '../staffList.js';
import { fbAddStaff, fbDeleteStaff, fbDeleteInspector, fbMarkDeletedStaff, fbUnmarkDeletedStaff, fbBackupAll, fbGetAdminGuard, fbUpdateAdminGuard, fbRemoveAdminDevice } from '../firebase.js';
import { getAdminDeviceId, hashPassword, makeSalt, MAX_TRUSTED_DEVICES,
         getAdminNames, isAdminName, adminEntry, ADMIN_NAME,
         OWNER_NAME, isOwnerName, canRevokeAdmin } from '../adminGuard.js';   // V9.05 · V9.09 다중 관리자 · V9.10 소유자 고정

export default function StaffManagerModal({ current, inspectors, extraStaff = {}, deletedStaff = {}, onClose }) {
  // ── V9.05: 관리자 이름 보호 — 신뢰 기기 관리 ────────────────────────────
  const [guardInfo, setGuardInfo] = useState(null);
  React.useEffect(() => {
    let alive = true;
    fbGetAdminGuard().then(g => { if (alive) setGuardInfo(g); });
    return () => { alive = false; };
  }, []);
  const handleRemoveDevice = async (devId, label) => {
    if (!window.confirm(`신뢰 기기 해제: ${label || devId}\n이 기기에서는 앞으로 관리자 선택 시 비밀번호가 필요합니다.`)) return;
    const ok = await fbUpdateAdminGuard({ [`admins/${current}/devices/${devId}`]: null });
    if (ok) { const g = await fbGetAdminGuard(); setGuardInfo(g); }
    else alert('해제 실패 — 네트워크를 확인하세요.');
  };
  // V9.09: 내 비밀번호만 바꾼다(admins/{나}). 다른 관리자 비밀번호는 건드리지 않는다.
  const handleChangePw = async () => {
    const pw = window.prompt(`${current} 새 비밀번호 (4자 이상):`);
    if (!pw) return;
    if (pw.length < 4) { alert('4자 이상으로 하세요.'); return; }
    const salt = makeSalt();
    const pwHash = await hashPassword(pw, salt);
    const ok = await fbUpdateAdminGuard({
      [`admins/${current}/pwHash`]: pwHash,
      [`admins/${current}/salt`]: salt,
    });
    if (ok) { alert('✅ 비밀번호 변경 완료'); const g = await fbGetAdminGuard(); setGuardInfo(g); }
    else alert('변경 실패 — 네트워크를 확인하세요.');
  };
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('검수');
  const [filter, setFilter] = useState('all'); // all | inspectors | staff
  const [backupBusy, setBackupBusy] = useState(false);

  // M6.10: 전체 데이터 백업 → JSON 다운로드
  const downloadBackup = async () => {
    if (backupBusy) return;
    if (!confirm('Firebase 전체 데이터를 JSON 파일로 다운로드합니다.\n(데이터 크기에 따라 수초 ~ 수십초 소요)\n계속하시겠습니까?')) return;
    setBackupBusy(true);
    try {
      const data = await fbBackupAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `tallyman_backup_${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const sizeMb = (blob.size / 1024 / 1024).toFixed(2);
      alert(`✅ 백업 완료\n파일 크기: ${sizeMb} MB`);
    } catch (e) {
      alert(`❌ 백업 실패: ${e.message || e}`);
    } finally {
      setBackupBusy(false);
    }
  };

  // ── V9.09(2026-07-26): 관리자 권한 부여·회수 — 인수인계용 ─────────────────
  //   왜: 관리자 이름이 소스에 박혀 있어 담당자가 바뀌면 재배포해야만 넘길 수 있었다.
  //   원칙 — 비밀번호는 관리자마다 따로. 권한을 줘도 내 비밀번호를 알려줄 필요가 없고,
  //   받은 사람이 첫 선택 때 자기 것을 정한다. 마지막 1명은 회수 불가(잠김 방지).
  const adminNames = getAdminNames(guardInfo);
  const handleGrantAdmin = async (name) => {
    if (isAdminName(guardInfo, name)) return;
    if (!window.confirm(
      `"${name}" 님에게 관리자 권한을 주시겠습니까?\n\n` +
      `· 인원 관리 · 항차 삭제 · 기기 관리를 할 수 있게 됩니다.\n` +
      `· 비밀번호는 본인이 첫 선택 때 직접 정합니다(내 비밀번호는 알려주지 않아도 됩니다).\n` +
      `· 언제든 회수할 수 있고, 퇴사 처리하면 권한도 함께 사라집니다.`)) return;
    const ok = await fbUpdateAdminGuard({
      [`admins/${name}/grantedBy`]: current,
      [`admins/${name}/grantedAt`]: Date.now(),
      [`admins/${name}/revoked`]: null,
    });
    if (!ok) { alert('저장 실패 — 네트워크를 확인하세요.'); return; }
    // 구버전(단일 관리자) 상태였다면 현재 관리자도 admins 목록으로 옮겨 적는다(마이그레이션)
    if (!guardInfo?.admins && guardInfo?.pwHash) {
      await fbUpdateAdminGuard({
        [`admins/${ADMIN_NAME}/pwHash`]: guardInfo.pwHash,
        [`admins/${ADMIN_NAME}/salt`]: guardInfo.salt,
        [`admins/${ADMIN_NAME}/devices`]: guardInfo.devices || {},
        [`admins/${ADMIN_NAME}/grantedBy`]: '(초기)',
      });
    }
    const g = await fbGetAdminGuard(); setGuardInfo(g);
    alert(`✅ "${name}" 관리자 권한 부여 완료.\n그 분이 검수원 선택에서 자기 이름을 고르면 비밀번호를 정하게 됩니다.`);
  };
  const handleRevokeAdmin = async (name) => {
    // V9.10: 소유자(개발·운영자) 권한은 회수 불가 — 앱이 쓰이는 한 유지돼야 버그를 고칠 수 있다.
    if (isOwnerName(name)) { alert(`${OWNER_NAME} 님은 앱 소유자입니다.\n관리자 권한을 회수할 수 없습니다.`); return; }
    if (!canRevokeAdmin(guardInfo, name)) { alert('마지막 관리자는 회수할 수 없습니다.\n먼저 다른 사람에게 권한을 준 뒤 회수하세요.'); return; }
    if (name === current && !window.confirm(
      `본인 권한을 내려놓습니다.\n이후 관리 기능을 쓸 수 없게 됩니다. 계속할까요?`)) return;
    if (name !== current && !window.confirm(`"${name}" 님의 관리자 권한을 회수하시겠습니까?`)) return;
    const ok = await fbUpdateAdminGuard({ [`admins/${name}`]: null });
    if (!ok) { alert('저장 실패 — 네트워크를 확인하세요.'); return; }
    const g = await fbGetAdminGuard(); setGuardInfo(g);
    alert(`"${name}" 관리자 권한을 회수했습니다.`);
  };

  // 관리자 아니면 차단
  if (!isAdminName(guardInfo, current)) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3">
        <div className="bg-slate-900 border border-red-700 rounded-xl p-6 max-w-sm text-center">
          <div className="text-red-300 font-bold mb-2">⛔ 권한 없음</div>
          <div className="text-slate-300 text-sm mb-4">인원 관리는 관리자(<b>{getAdminNames(guardInfo).join(', ')}</b>)만 가능합니다.</div>
          <button onClick={onClose} className="bg-slate-700 px-4 py-2 rounded text-white">확인</button>
        </div>
      </div>
    );
  }

  // 전체 명단: STAFF_LIST (기본) + extraStaff (Firebase 동적) 합침
  const extraList = Object.values(extraStaff || {}).filter(s => s && s.name);
  const allStaff = [
    ...STAFF_LIST,
    ...extraList.filter(s => !STAFF_NAMES.includes(s.name)),
  ];

  // 현재 접속 중인 검수원 (Firebase inspectors)
  const inspectorList = Object.values(inspectors || {}).filter(i => i && i.name);
  const inspectorMap = Object.fromEntries(inspectorList.map(i => [i.name, i]));

  // 필터링 (퇴사자 제외 기본 / 별도 보기 가능)
  const isDeleted = (name) => !!deletedStaff[name];
  let filtered;
  if (filter === 'inspectors') filtered = allStaff.filter(s => inspectorMap[s.name] && !isDeleted(s.name));
  else if (filter === 'deleted') filtered = allStaff.filter(s => isDeleted(s.name));
  else filtered = allStaff.filter(s => !isDeleted(s.name));

  const handleAdd = async () => {
    const raw = newName.trim();
    if (!raw) return;
    if (!/^[가-힣a-zA-Z0-9]{2,10}$/.test(raw)) {
      alert('이름은 한글/영문 2~10자만 가능합니다.');
      return;
    }
    if (STAFF_NAMES.includes(raw) || extraList.some(s => s.name === raw)) {
      alert(`"${raw}" — 이미 명단에 있습니다.`);
      return;
    }
    if (!confirm(`"${raw}" (${newRole}) — 신규 직원 추가하시겠습니까?\n(Firebase 영구 저장 — 전 직원 접속 가능)`)) return;
    try {
      await fbAddStaff(raw, newRole);
      setNewName('');
      setNewRole('검수');
    } catch (e) {
      alert('추가 실패: ' + e.message);
    }
  };

  // V9.10(2026-07-26): 퇴사 처리 규칙 정리
  //   · 소유자 — 퇴사 처리해도 관리자 권한·접속은 그대로. 앱이 쓰이는 한 유지돼야 한다.
  //   · 그 외 관리자 — 퇴사 처리하면 관리자 권한이 함께 삭제된다(먼저 회수할 필요 없음).
  const handleDeleteStaff = async (name) => {
    const owner = isOwnerName(name);
    const wasAdmin = !owner && isAdminName(guardInfo, name);
    const msg = owner
      ? `"${name}" — 퇴사 처리하시겠습니까?\n\n소유자이므로 관리자 권한과 앱 접속은 그대로 유지됩니다.\n(명단에만 퇴사로 표시)`
      : wasAdmin
        ? `"${name}" — 퇴사 처리하시겠습니까?\n\n⚠ 관리자 권한도 함께 삭제됩니다.\n(접속 차단 + 명단 숨김. 복구해도 권한은 다시 부여해야 합니다)`
        : `"${name}" — 퇴사 처리하시겠습니까?\n(접속 차단 + 명단 숨김. 복구 가능)`;
    if (!confirm(msg)) return;
    try {
      // 관리자였다면 권한 먼저 삭제 (소유자는 제외)
      if (wasAdmin) {
        const ok = await fbUpdateAdminGuard({ [`admins/${name}`]: null });
        if (!ok) { alert('관리자 권한 삭제 실패 — 네트워크를 확인하세요. 퇴사 처리를 중단합니다.'); return; }
      }
      // Firebase 동적 명단에 있으면 삭제
      if (extraStaff[name]) await fbDeleteStaff(name);
      // 검수원 활동 기록 삭제
      if (inspectorMap[name]) await fbDeleteInspector(name);
      // M5.74: 코드 명단도 deletedStaff 마커로 제외 (퇴사자 처리)
      await fbMarkDeletedStaff(name);
      if (wasAdmin) { const g = await fbGetAdminGuard(); setGuardInfo(g); }
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  };

  // M5.74: 퇴사 처리 복구
  const handleRestore = async (name) => {
    if (!confirm(`"${name}" — 복구하시겠습니까?\n(다시 접속 가능)`)) return;
    try {
      await fbUnmarkDeletedStaff(name);
    } catch (e) {
      alert('복구 실패: ' + e.message);
    }
  };

  const handleKickInspector = async (name) => {
    if (isOwnerName(name)) { alert(`${OWNER_NAME} 님은 앱 소유자입니다.\n접속 기록을 제거할 수 없습니다.`); return; }
    if (!confirm(`"${name}" 접속 기록을 제거하시겠습니까?\n(명단에는 남음, 다시 접속 가능)`)) return;
    try {
      await fbDeleteInspector(name);
    } catch (e) {
      alert('제거 실패: ' + e.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3">
      <div className="bg-slate-900 border border-amber-700 rounded-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <div>
              <div className="font-bold text-amber-200">인원 관리</div>
              <div className="text-[10px] text-slate-400">관리자: {adminNames.join(', ')}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadBackup} disabled={backupBusy}
              className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded text-xs font-bold flex items-center gap-1"
              title="Firebase 전체 데이터 JSON 백업">
              <Download className="w-3.5 h-3.5"/>
              {backupBusy ? '백업 중...' : '백업'}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* V9.05: 관리자 이름 보호 — 신뢰 기기 관리 */}
        <div className="px-4 py-2 border-b border-slate-700 bg-slate-800/40">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-amber-300">🔐 {current} 보호 — 신뢰 기기 {Object.keys(adminEntry(guardInfo, current)?.devices || {}).length}/{MAX_TRUSTED_DEVICES}</div>
            <button onClick={handleChangePw} className="text-[10px] px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200">
              {adminEntry(guardInfo, current)?.pwHash ? '비밀번호 변경' : '비밀번호 미설정'}
            </button>
          </div>
          {Object.entries(adminEntry(guardInfo, current)?.devices || {}).map(([devId, d]) => (
            <div key={devId} className="flex items-center justify-between mt-1 text-[11px] text-slate-300">
              <span>
                {d?.label || devId}{devId === getAdminDeviceId() && <span className="text-emerald-400"> (현재 기기)</span>}
                {d?.addedAt ? <span className="text-slate-500"> · {new Date(d.addedAt).toISOString().slice(0, 10)}</span> : null}
              </span>
              <button onClick={() => handleRemoveDevice(devId, d?.label)} className="text-red-400 hover:text-red-300 px-1.5">해제</button>
            </div>
          ))}
          {Object.keys(adminEntry(guardInfo, current)?.devices || {}).length === 0 && (
            <div className="text-[10px] text-slate-500 mt-1">등록된 신뢰 기기 없음 — 검수원 선택에서 {current} 클릭 시 설정됩니다.</div>
          )}
        </div>

        {/* 필터 탭 */}
        <div className="flex gap-1 p-2 border-b border-slate-700">
          <button onClick={() => setFilter('all')}
            className={`flex-1 py-2 text-xs rounded ${filter === 'all' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
            재직 ({allStaff.filter(s => !deletedStaff[s.name]).length})
          </button>
          <button onClick={() => setFilter('inspectors')}
            className={`flex-1 py-2 text-xs rounded ${filter === 'inspectors' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
            접속 ({inspectorList.filter(i => !deletedStaff[i.name]).length})
          </button>
          <button onClick={() => setFilter('deleted')}
            className={`flex-1 py-2 text-xs rounded ${filter === 'deleted' ? 'bg-red-800 text-white' : 'bg-slate-800 text-slate-300'}`}>
            퇴사 ({Object.keys(deletedStaff).length})
          </button>
        </div>

        {/* 신규 추가 폼 */}
        <div className="p-3 border-b border-slate-700 bg-slate-800/30">
          <div className="text-xs text-slate-400 mb-2 flex items-center gap-1"><UserPlus className="w-3 h-3"/> 신규 직원 추가</div>
          <div className="flex gap-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="이름" className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100"/>
            <select value={newRole} onChange={e => setNewRole(e.target.value)}
              className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
              <option>검수</option>
              <option>대리</option>
              <option>과장</option>
              <option>차장</option>
              <option>부장</option>
            </select>
            <button onClick={handleAdd}
              className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded text-sm font-bold">추가</button>
          </div>
        </div>

        {/* 명단 리스트 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.map(s => {
            const _st = inspectorStatus(inspectorMap[s.name]);   // V7.94-14: 공용 판정
            const isActive = _st === 'working';
            const isLoggedIn = _st === 'online';
            const isOnline = !!inspectorMap[s.name];
            const isDynamic = !STAFF_NAMES.includes(s.name);  // Firebase에 동적 추가된 직원
            return (
              <div key={s.name} className="flex items-center gap-2 px-2 py-1.5 bg-slate-800/50 border border-slate-700 rounded">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isAdminName(guardInfo, s.name) ? 'bg-amber-500 text-slate-900' : 'bg-slate-600 text-slate-200'
                }`}>{s.name[0]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-sm font-bold text-slate-100">
                    {s.name}
                    {isOwnerName(s.name)
                      ? <span className="text-[9px] bg-amber-600 text-slate-900 px-1 rounded font-black">소유자</span>
                      : isAdminName(guardInfo, s.name) && <span className="text-[9px] bg-amber-900 text-amber-300 px-1 rounded">관리자</span>}
                    {isDynamic && <span className="text-[9px] bg-purple-900 text-purple-300 px-1 rounded">추가됨</span>}
                    {isDeleted(s.name) && <span className="text-[9px] bg-red-900 text-red-300 px-1 rounded">퇴사</span>}
                  </div>
                  <div className="text-[10px] text-slate-400">{s.role}</div>
                </div>
                {isActive && <span className="text-[9px] bg-emerald-700/40 text-emerald-300 px-1.5 py-0.5 rounded font-bold">●작업중</span>}
                {isLoggedIn && <span className="text-[9px] bg-sky-900/50 text-sky-300 px-1.5 py-0.5 rounded font-bold">○로그인</span>}
                {isOnline && !isActive && !isLoggedIn && <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">접속이력</span>}
                {/* 액션 버튼 */}
                {/* V9.09: 관리자 권한 부여·회수 — 인수인계 */}
                {!isDeleted(s.name) && (
                  isOwnerName(s.name) ? (
                    <span className="px-2 py-1 bg-slate-800 rounded text-amber-400/70 text-[10px] font-bold" title="소유자 권한은 회수할 수 없습니다">
                      권한고정
                    </span>
                  ) : isAdminName(guardInfo, s.name) ? (
                    <button onClick={() => handleRevokeAdmin(s.name)}
                      className="px-2 py-1 bg-amber-800 hover:bg-amber-700 rounded text-amber-100 text-xs font-bold"
                      title={s.name === current ? '내 관리자 권한 내려놓기' : '관리자 권한 회수'}>
                      권한회수
                    </button>
                  ) : (
                    <button onClick={() => handleGrantAdmin(s.name)}
                      className="px-2 py-1 bg-slate-700 hover:bg-amber-800 rounded text-slate-200 hover:text-amber-100 text-xs font-bold"
                      title="관리자 권한 부여 — 비밀번호는 본인이 정합니다">
                      권한부여
                    </button>
                  )
                )}
                {(
                  <div className="flex gap-1">
                    {isDeleted(s.name) ? (
                      <button onClick={() => handleRestore(s.name)}
                        className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-white text-xs font-bold" title="복구 (재입사)">
                        복구
                      </button>
                    ) : (
                      <>
                        {isOnline && !isOwnerName(s.name) && (
                          <button onClick={() => handleKickInspector(s.name)}
                            className="p-1.5 hover:bg-orange-900/40 rounded text-orange-400" title="접속 기록 제거">
                            <RefreshCw className="w-3.5 h-3.5"/>
                          </button>
                        )}
                        <button onClick={() => handleDeleteStaff(s.name)}
                          className="p-1.5 hover:bg-red-900/40 rounded text-red-400" title="퇴사 처리">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-700 text-[10px] text-slate-500">
          🗑 퇴사 처리 (접속 차단, 복구 가능 · 관리자면 권한도 함께 삭제) · 🔄 접속 기록만 제거 · 소유자({OWNER_NAME}) 권한은 고정
        </div>
      </div>
    </div>
  );
}
