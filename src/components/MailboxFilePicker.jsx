// V9.46: 업로드 탭 — 이 항차의 메일함 폴더를 바로 펼쳐 보여준다.
//   자료는 이미 수집기가 `MAILBOX/{선박}/{항차}/` 에 모아 뒀다. 파일 대화상자로 매번
//   드라이브부터 타고 들어가던 것을 없앤다(사용자 요청 2026-08-02).
//   미지원 브라우저(폰 등)에서는 아무것도 그리지 않는다 — 기존 파일 입력이 그대로 쓰인다.
import React, { useState, useEffect, useCallback } from 'react';
import { FolderOpen, RefreshCw, Link2 } from 'lucide-react';
import {
  isFsSupported, getSavedRoot, pickMailboxRoot, checkPermission, requestPermission,
  listVoyageFiles, toFile, getDoneSet, markDone, isDone,
} from '../mailboxFs.js';

const KB = (n) => (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const HM = (t) => {
  if (!t) return '';
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const TARGETS = [
  ['edi', 'EDI', 'bg-blue-700 hover:bg-blue-600 text-blue-50', 'text-blue-300 border-blue-700/60'],
  ['list', '리스트', 'bg-emerald-700 hover:bg-emerald-600 text-emerald-50', 'text-emerald-300 border-emerald-700/60'],
  ['xray', 'X-RAY', 'bg-purple-700 hover:bg-purple-600 text-purple-50', 'text-purple-300 border-purple-700/60'],
];

export default function MailboxFilePicker({ vessel, voy, voyageKey, mode, onEdi, onList, onXray }) {
  const [root, setRoot] = useState(null);
  const [perm, setPerm] = useState('');       // '' | granted | prompt | denied
  const [res, setRes] = useState(null);       // listVoyageFiles 결과
  const [busy, setBusy] = useState('');       // 처리 중인 파일 이름
  const [err, setErr] = useState('');
  const [done, setDone] = useState(() => getDoneSet(voyageKey, mode));
  const [open, setOpen] = useState(true);

  const supported = isFsSupported();

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    (async () => {
      const h = await getSavedRoot();
      if (!alive) return;
      setRoot(h);
      if (h) setPerm(await checkPermission(h));
    })();
    return () => { alive = false; };
  }, [supported]);

  const load = useCallback(async (h) => {
    const use = h || root;
    if (!use) return;
    setErr('');
    try {
      const r = await listVoyageFiles(use, vessel, voy);
      setRes(r);
    } catch (e) {
      // 조용히 실패하지 않는다 — 왜 안 보이는지 화면에 남긴다
      setErr(`폴더를 읽지 못했습니다: ${e && e.message ? e.message : e}`);
      setRes(null);
    }
  }, [root, vessel, voy]);

  useEffect(() => {
    if (perm === 'granted' && root) load(root);
  }, [perm, root, vessel, voy, load]);

  useEffect(() => { setDone(getDoneSet(voyageKey, mode)); }, [voyageKey, mode]);

  if (!supported) return null;

  const connect = async () => {
    setErr('');
    try {
      const h = await pickMailboxRoot();
      setRoot(h);
      setPerm(await checkPermission(h));
      load(h);
    } catch (e) {
      if (e && e.name === 'AbortError') return;      // 사용자가 취소 — 정상
      setErr(`폴더 연결 실패: ${e && e.message ? e.message : e}`);
    }
  };

  const revive = async () => {
    setErr('');
    const p = await requestPermission(root);
    setPerm(p);
    if (p === 'granted') load(root);
    else setErr('폴더 접근이 허용되지 않았습니다.');
  };

  const send = async (entry, target) => {
    setBusy(entry.name); setErr('');
    try {
      const f = await toFile(entry);
      if (target === 'edi') await onEdi([f]);
      else if (target === 'list') await onList([f]);
      else await onXray([f]);
      markDone(voyageKey, mode, entry, target);
      setDone(getDoneSet(voyageKey, mode));
    } catch (e) {
      setErr(`${entry.name} 처리 실패: ${e && e.message ? e.message : e}`);
    } finally {
      setBusy('');
    }
  };

  // ── 연결 전 ────────────────────────────────────────────────────────────
  if (!root) {
    return (
      <div className="bg-slate-900 border border-amber-800/50 rounded-lg p-3">
        <div className="text-sm font-bold mb-1 flex items-center gap-2 text-amber-200">
          <FolderOpen className="w-4 h-4" /> 메일함 폴더 연결
        </div>
        <div className="text-[11px] text-slate-400 mb-2 leading-relaxed">
          한 번만 연결해 두면, 이 항차의 자료가 아래에 바로 뜹니다 — 파일 창에서 찾아 들어갈 필요가 없습니다.
          <br />권장: <b className="text-slate-200">MAILBOX</b> 폴더 (선박 폴더들이 들어 있는 그 폴더) —
          <b className="text-amber-300"> 한 번만 연결하면 모든 선박·항차가 자동으로 풀립니다.</b>
          <br />선박 폴더({vessel})나 항차 폴더({voy})를 골라도 동작하지만, 그러면 그 폴더 안에서만 찾습니다.
        </div>
        <button onClick={connect}
          className="bg-amber-700 hover:bg-amber-600 text-amber-50 px-3 py-2 rounded text-xs font-bold flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> 메일함 폴더 연결
        </button>
        {err && <div className="text-[11px] text-red-400 mt-2">{err}</div>}
      </div>
    );
  }

  // ── 권한이 잠깐 풀린 상태 ─────────────────────────────────────────────
  if (perm !== 'granted') {
    return (
      <div className="bg-slate-900 border border-amber-800/50 rounded-lg p-3">
        <div className="text-sm font-bold mb-1 flex items-center gap-2 text-amber-200">
          <FolderOpen className="w-4 h-4" /> 메일함 폴더 — 접근 확인 필요
        </div>
        <div className="text-[11px] text-slate-400 mb-2">브라우저를 다시 연 뒤에는 한 번 눌러 되살립니다.</div>
        <div className="flex gap-2">
          <button onClick={revive}
            className="bg-amber-700 hover:bg-amber-600 text-amber-50 px-3 py-2 rounded text-xs font-bold">
            폴더 접근 허용
          </button>
          <button onClick={connect}
            className="bg-slate-800 border border-slate-700 text-slate-300 px-3 py-2 rounded text-xs">
            다른 폴더로 바꾸기
          </button>
        </div>
        {err && <div className="text-[11px] text-red-400 mt-2">{err}</div>}
      </div>
    );
  }

  // ── 연결됨 ────────────────────────────────────────────────────────────
  const files = (res && res.files) || [];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={() => setOpen(!open)} className="text-sm font-bold flex items-center gap-2 text-amber-200">
          <FolderOpen className="w-4 h-4" />
          메일함 자료
          {res && res.ok && <span className="text-[11px] text-slate-400 font-normal mono">{res.dirPath} · {files.length}개</span>}
          {res && res.ok && res.rootName && <span className="text-[10px] text-slate-600 font-normal">📁{res.rootName}</span>}
        </button>
        <div className="flex-1" />
        <button onClick={() => load()} title="다시 읽기"
          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button onClick={connect} className="text-[10px] text-slate-500 hover:text-slate-300 underline underline-offset-2">
          폴더 바꾸기
        </button>
      </div>

      {err && <div className="text-[11px] text-red-400 mb-2">{err}</div>}

      {open && res && !res.ok && (
        <div className="text-[11px] text-slate-400 leading-relaxed">
          <div>연결된 폴더: <b className="text-slate-200">{res.rootName || '?'}</b></div>
          {res.reason === 'no-vessel' && <>그 안에 <b className="text-amber-300">{vessel}</b> 선박 폴더도, <b className="text-amber-300">{voy}</b> 항차 폴더도 없습니다.</>}
          {res.reason === 'no-voy' && <>{res.vesselDir} 폴더에 <b className="text-amber-300">{voy}</b> 항차가 없습니다.</>}
          {res.dirs && res.dirs.length > 0 && (
            <div className="mt-1 text-slate-500">있는 폴더: {res.dirs.slice(0, 24).join(' · ')}{res.dirs.length > 24 ? ' …' : ''}</div>
          )}
          <div className="mt-1 text-slate-500">
            [폴더 바꾸기]로 <b className="text-slate-300">MAILBOX</b>를 고르면 선박·항차를 알아서 찾아갑니다.
          </div>
        </div>
      )}

      {open && res && res.ok && files.length === 0 && (
        <div className="text-[11px] text-slate-500">이 항차 폴더에 아직 자료가 없습니다.</div>
      )}

      {open && res && res.ok && files.length > 0 && (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {files.map((f) => {
            const anyDone = TARGETS.some(([t]) => isDone(done, f, t));
            return (
              <div key={f.name}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border ${anyDone ? 'bg-slate-800/30 border-slate-800' : 'bg-slate-800/60 border-slate-700'}`}>
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] truncate ${anyDone ? 'text-slate-400' : 'text-slate-100'}`}>
                    {anyDone && <span className="text-emerald-500 mr-1">✓</span>}{f.name}
                  </div>
                  <div className="text-[10px] text-slate-500 mono">{HM(f.at)} · {KB(f.size)}</div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {TARGETS.map(([t, label, strong, weak]) => {
                    if (t === 'xray' && mode !== 'discharge') return null;
                    const rec = f.target === t;
                    const did = isDone(done, f, t);
                    return (
                      <button key={t} onClick={() => send(f, t)} disabled={!!busy}
                        title={rec ? '추천' : ''}
                        className={`px-2 py-1 rounded text-[10px] font-bold border transition disabled:opacity-40 ${
                          rec ? strong + ' border-transparent' : `bg-transparent ${weak}`
                        } ${did ? 'opacity-50' : ''}`}>
                        {busy === f.name ? '…' : label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="text-[10px] text-slate-600 mt-2 leading-tight">
          진한 버튼이 파일 이름으로 본 추천 칸입니다. 다른 칸으로 넣고 싶으면 그 버튼을 누르세요.
          ✓는 이 기기에서 이미 넣은 파일입니다.
        </div>
      )}
    </div>
  );
}
