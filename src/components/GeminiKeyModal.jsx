// M6.14d: Gemini API 키 입력/변경 모달
//
// 배경:
//   - 검수앱은 Gemini API를 PDF/이미지/PORT-MIS OCR + AI 질문에 사용
//   - 기존엔 코드에 키 하드코딩 (gemini.js:27) → GitHub public repo 노출 → Google 자동 차단
//   - M5.70에 사용자 키 우선 사용 패턴 주석은 있었으나 SK.geminiKey 정의 누락 + UI 없음
//   - M6.14d: SK.geminiKey 추가 + 이 모달로 검수원이 폰에서 직접 입력
//
// 우선순위 (M6.14d):
//   1. localStorage SK.geminiKey (검수원 본인 입력)
//   2. 내장 GEMINI_API_KEY (하드코딩 폴백, 노출 시 차단됨)

import React, { useState, useEffect } from 'react';
import { X, Key, AlertTriangle, CheckCircle2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { _storage, SK } from '../utils.js';
import { GEMINI_API_KEY } from '../gemini.js';

export default function GeminiKeyModal({ onClose }) {
  const [keyInput, setKeyInput] = useState('');
  const [showFull, setShowFull] = useState(false);
  const [last6, setLast6] = useState('');
  const [usingDefault, setUsingDefault] = useState(true);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // 마운트 시 현재 상태 로드
  useEffect(() => {
    const userKey = _storage.get(SK.geminiKey);
    const lastSaved = _storage.get(SK.geminiKeyLast6) || '';
    setLast6(lastSaved);
    setUsingDefault(!userKey);
  }, []);

  const handleSave = () => {
    const k = keyInput.trim();
    if (!k) {
      alert('API 키를 입력하세요');
      return;
    }
    if (!/^AIza[A-Za-z0-9_-]{35}$/.test(k)) {
      if (!confirm('Gemini API 키 형식이 표준(AIza... 39자)과 다릅니다.\n계속 저장하시겠습니까?')) {
        return;
      }
    }
    const tail = k.slice(-6);
    _storage.set(SK.geminiKey, k);
    _storage.set(SK.geminiKeyLast6, tail);
    setLast6(tail);
    setUsingDefault(false);
    setSaved(true);
    setKeyInput('');
    setTimeout(() => setSaved(false), 3000);
  };

  const handleClear = () => {
    if (!confirm('저장된 API 키를 삭제하시겠습니까?\n삭제 후엔 내장 키(이미 차단됨)로 폴백됩니다.')) return;
    _storage.set(SK.geminiKey, '');
    _storage.set(SK.geminiKeyLast6, '');
    setLast6('');
    setUsingDefault(true);
  };

  // 테스트 호출 — 실제 작동 검증
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const k = _storage.get(SK.geminiKey) || GEMINI_API_KEY;
      if (!k) {
        setTestResult({ ok: false, msg: '키가 없습니다' });
        setTesting(false);
        return;
      }
      // 가벼운 호출 — "ping" 한 단어 응답
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${k}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with just the word "ok".' }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 },
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '(빈 응답)';
        setTestResult({ ok: true, msg: `Gemini 응답: "${txt.trim().slice(0, 20)}"` });
      } else {
        const errText = await r.text();
        if (r.status === 403) {
          setTestResult({ ok: false, msg: '키가 차단된 상태 (Reported as leaked). 새 키 발급 필요.' });
        } else if (r.status === 429) {
          setTestResult({ ok: false, msg: '할당량 초과 — 키는 정상이지만 잠시 대기 필요' });
        } else {
          setTestResult({ ok: false, msg: `오류 ${r.status}: ${errText.slice(0, 100)}` });
        }
      }
    } catch (e) {
      setTestResult({ ok: false, msg: `네트워크 오류: ${e.message}` });
    }
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-amber-700/40 rounded-xl w-full max-w-lg max-h-[95vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-amber-400" />
            <div className="font-black text-base text-amber-300">Gemini API 키 설정</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 현재 상태 */}
          <div className={`rounded p-3 ${usingDefault ? 'bg-red-950/40 border border-red-700/40' : 'bg-emerald-950/40 border border-emerald-700/40'}`}>
            <div className="flex items-center gap-2 mb-1">
              {usingDefault ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-300" />
                  <span className="font-bold text-red-300">내장 키 사용 중 (차단됨)</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span className="font-bold text-emerald-300">본인 키 사용 중</span>
                </>
              )}
            </div>
            <div className="text-xs text-slate-300">
              {usingDefault ? (
                <>코드 하드코딩 키가 GitHub public repo 노출 → Google 차단. 새 키 입력 필요.</>
              ) : (
                <>저장된 키 끝 6자리: <span className="mono font-bold text-emerald-200">...{last6}</span></>
              )}
            </div>
          </div>

          {/* 키 발급 안내 */}
          <div className="bg-slate-800/40 rounded p-3 text-xs leading-relaxed">
            <div className="font-bold text-slate-300 mb-1">📌 새 키 발급 방법</div>
            <ol className="text-slate-400 space-y-1 ml-3 list-decimal">
              <li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-cyan-400 underline inline-flex items-center gap-1">aistudio.google.com/apikey <ExternalLink className="w-3 h-3" /></a> 접속</li>
              <li>차단된 옛 키 옆 [삭제]</li>
              <li>[Create API key] → 새 키 복사</li>
              <li>아래 입력란에 붙여넣기 → [저장]</li>
            </ol>
          </div>

          {/* 키 입력 */}
          <div>
            <label className="text-xs font-bold text-slate-400 block mb-1">새 API 키 (AIza...)</label>
            <div className="flex gap-2">
              <input
                type={showFull ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 mono focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => setShowFull(!showFull)}
                className="px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded"
                title={showFull ? '숨기기' : '보이기'}
              >
                {showFull ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
              </button>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              localStorage에만 저장됩니다. GitHub/Firebase에 전송되지 않습니다.
            </div>
          </div>

          {/* 액션 */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!keyInput.trim()}
              className="flex-1 py-2.5 bg-amber-700 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 rounded font-bold text-white text-sm"
            >
              💾 저장
            </button>
            <button
              onClick={handleTest}
              disabled={testing || (usingDefault && !keyInput)}
              className="flex-1 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-600 rounded font-bold text-white text-sm"
            >
              {testing ? '⏳ 테스트 중...' : '🧪 키 테스트'}
            </button>
          </div>

          {/* 저장 성공 알림 */}
          {saved && (
            <div className="bg-emerald-950/40 border border-emerald-700/40 rounded p-2 text-xs text-emerald-200 font-bold">
              ✅ 저장 완료 — 다음 Gemini 호출부터 즉시 적용
            </div>
          )}

          {/* 테스트 결과 */}
          {testResult && (
            <div className={`rounded p-2 text-xs ${testResult.ok ? 'bg-emerald-950/40 border border-emerald-700/40 text-emerald-200' : 'bg-red-950/40 border border-red-700/40 text-red-200'}`}>
              <div className="font-bold mb-1">{testResult.ok ? '✅ 키 정상 작동' : '❌ 키 오류'}</div>
              <div className="opacity-80">{testResult.msg}</div>
            </div>
          )}

          {/* 키 삭제 (옵션) */}
          {!usingDefault && (
            <button
              onClick={handleClear}
              className="w-full py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded"
            >
              저장된 키 삭제 (내장 키로 폴백)
            </button>
          )}

          {/* 설명 */}
          <div className="bg-slate-800/30 rounded p-2 text-[10px] text-slate-500 leading-relaxed">
            <b className="text-slate-400">🔒 보안:</b> 키는 본인 폰의 localStorage에만 저장됩니다. 다른 검수원과 공유되지 않습니다.<br/>
            각 검수원이 본인 키 발급해서 입력하세요. 무료 한도(1500회/일) 검수원당 충분합니다.
          </div>
        </div>
      </div>
    </div>
  );
}
