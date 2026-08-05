// 모든 항차 + 양/선적 통합 검색 + 음성 입력 + AI 자연어 (M1.9)
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search as SearchIcon, X, Volume2, VolumeX, Mic, MicOff, ArrowDown, ArrowUp, MapPin, ChevronRight, Snowflake } from 'lucide-react';
import { speakContainer, parseSpokenDigits, speak, stopSpeak, spellKo } from '../voice.js';
import { isoToLabel, fmtPos, isPyeongtaekPort } from '../utils.js';
import { parseNaturalQuery, applyNLFilter, describeQuery, hasAnyCondition, generateTimeAnswer, generateIntroAnswer } from '../nlSearch.js';   // V9.14: 통합검색에도 즉답 연결

export default function GlobalSearchPage({ voyages, onOpenContainer }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const recognitionRef = useRef(null);
  const lastSpokenRef = useRef(null);

  // M6.10: debounce — 키 입력마다 즉시 검색하지 않고 200ms 후 검색
  //   대용량 (수천 대 컨테이너) 환경에서 입력 반응성 개선
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // 모든 항차 양/선적 펼치기
  const flat = useMemo(() => {
    const arr = [];
    Object.entries(voyages || {}).forEach(([vKey, v]) => {
      if (!v || !v.info) return;
      ['discharge', 'loading'].forEach(mode => {
        const sec = v[mode];
        if (!sec) return;
        const ediMap = sec.ediContainers || {};
        const recMap = sec.records || {};
        const xrayMap = sec.xrayList || {};
        const xraySeals = sec.xraySeals || {};
        const compMap = sec.completed || {};
        const merged = {};
        Object.values(ediMap).forEach(c => { merged[c.cn] = { ...c }; });
        Object.values(recMap).forEach(r => {
          const safeR = {};
          Object.keys(r).forEach(k => {
            const v = r[k];
            if (v !== '' && v !== 0 && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) safeR[k] = v;
          });
          merged[r.cn] = { ...(merged[r.cn] || {}), ...safeR };
        });
        Object.values(merged).forEach(c => {
          if (!c.cn) return;
          arr.push({
            ...c,
            voyageKey: vKey,
            vsl: v.info.vsl,
            voy: v.info.voy,
            mode,
            _mode: mode,
            _ptk: mode === 'discharge' ? isPyeongtaekPort(c.pod) : isPyeongtaekPort(c.pol),   // V7.93-02: 평택분 (7.1)
            isXray: mode === 'discharge' && !!xrayMap[c.cn],
            _xray: mode === 'discharge' && !!xrayMap[c.cn],
            comp: compMap[c.cn] || null,
            _comp: compMap[c.cn] || null,
            xraySeal: xraySeals[c.cn] || null,
          });
        });
      });
    });
    return arr;
  }, [voyages]);

  // 자연어 파싱 (M6.10: debouncedQuery 사용)
  const parsed = useMemo(() => parseNaturalQuery(debouncedQuery), [debouncedQuery]);

  // ── V9.14: 통합검색 즉답 — 종전에는 "브리핑·몇 시야·날씨" 등이 여기서 전부 무응답이었다.
  //   시간·자기소개처럼 항차와 무관한 질문은 바로 답하고,
  //   항차 맥락이 필요한 질문(브리핑·점검·인계·ETA·날씨 등)은 어디서 물어야 하는지 안내한다.
  const localAnswer = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) return null;
    const p = parsed;
    if (p.briefingQuery || p.sealAuditQuery || p.twinCheckQuery || p.etaQuery ||
        p.customsReportQuery || p.handoverQuery || p.weatherQuery || p.schedQuery || p.foodQuery) {
      return '이 질문은 항차 화면에서 답합니다.\n홈에서 그 배의 [양하]/[선적] 막대를 누른 뒤 🎤 자연어 탭에서 물어보세요.';
    }
    if (p.timeQuery) { try { return generateTimeAnswer(); } catch { return null; } }
    if (p.introQuery) { try { return generateIntroAnswer(''); } catch { return null; } }
    return null;
  }, [parsed, debouncedQuery]);

  // 검색 결과 (AI 자연어 적용)
  const matches = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) return [];
    if (!hasAnyCondition(parsed)) return [];
    // 알파벳 포함 → 선박명 검색도 포함
    const Q = debouncedQuery.toUpperCase();
    const isOnlyDigits = /^\d+$/.test(Q.replace(/\s/g, ''));
    let r = applyNLFilter(flat, parsed);
    // V7.93-02: 조건·집계 검색은 평택분만 (7.1) — 컨번호(digits) 단건 조회는 전체 유지 (V7.92-02 동일 규칙)
    if (!parsed.digits) r = r.filter(c => c._ptk);
    // 자연어 조건이 없는 알파벳 → 선박명 매칭도 시도
    if (!parsed.size && !parsed.fe && !parsed.type && !parsed.isAll && !isOnlyDigits) {
      const vslMatches = flat.filter(c => c.vsl?.toUpperCase().includes(Q));
      r = [...new Set([...r, ...vslMatches])];
    }
    return r.slice(0, 100);
  }, [flat, debouncedQuery, parsed]);

  // Web Speech API
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceSupported(false); return; }
    const r = new SR();
    r.lang = 'ko-KR';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const text = last[0].transcript;
      setTranscript(text);
      if (last.isFinal) {
        // 자연어 그대로 저장
        const t = text.trim();
        if (t.length >= 2) setQuery(t);
        else {
          const digits = parseSpokenDigits(text);
          if (digits && digits.length >= 2) setQuery(digits);
          else speak('인식 실패');
        }
      }
    };
    r.onend = () => setIsListening(false);
    r.onerror = (e) => {
      setIsListening(false);
      if (e.error === 'not-allowed') speak('마이크 권한이 필요합니다.');
    };
    recognitionRef.current = r;
    return () => { try { r.abort(); } catch(_) {} };
  }, []);

  // 자동 음성 안내
  useEffect(() => {
    if (!autoSpeak) return;
    if (!debouncedQuery || debouncedQuery.length < 2) return;
    const sig = `${debouncedQuery}-${matches.length}-${parsed.isStat}-${matches[0]?.cn || 'none'}`;
    if (lastSpokenRef.current === sig) return;
    lastSpokenRef.current = sig;

    if (localAnswer) {
      const first = localAnswer.split('\n').find(l => l.trim());
      if (first) speak(first);
      return;
    }
    if (parsed.isStat) {
      speak(`${describeQuery(parsed)} ${matches.length}대`);
      return;
    }

    if (matches.length === 0) {
      speak(`${describeQuery(parsed)} 없음`);
    } else if (matches.length === 1) {
      const c = matches[0];
      const last4 = c.l4 || c.cn?.slice(-4) || '';
      const parts = [spellKo(last4)];
      if (c.sl) parts.push(`실번호 ${spellKo(c.sl)}`);
      else parts.push('실번호 미입력');
      if (c.isXray) parts.push('엑스레이');
      speak(parts.join(', '));
    } else if (matches.length <= 5) {
      speak(`${matches.length}개 일치. 첫번째. ${spellKo(matches[0].cn?.slice(-4) || '')}`);
    } else {
      speak(`${matches.length}개 일치. 더 자세히`);
    }
  }, [matches, debouncedQuery, parsed, autoSpeak, localAnswer]);

  const startListening = () => {
    if (!recognitionRef.current) return;
    setTranscript('');
    setIsListening(true);
    stopSpeak();
    try { recognitionRef.current.start(); } catch (e) { setIsListening(false); }
  };
  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch (e) {}
    setIsListening(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-3 py-3">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 mb-3">
        <div className="text-[10px] text-slate-500 font-bold uppercase mb-2 flex items-center justify-between">
          <span>🤖 AI 통합 검색 — 모든 항차·양/선적</span>
          <span className="text-slate-400 mono">전체 {flat.length.toLocaleString()}대</span>
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/>
          <input type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="🎤 / 4777 / 40피트 4777 / 리퍼 몇개"
            autoComplete="off"
            autoFocus
            className="w-full pl-9 pr-32 py-3 bg-slate-800 border border-slate-700 rounded text-xl font-black mono text-amber-200 text-center tracking-wider focus:outline-none focus:border-amber-500"/>
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {voiceSupported && (
              <button onClick={isListening ? stopListening : startListening}
                className={`w-10 h-10 rounded flex items-center justify-center transition ${
                  isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-500 hover:bg-amber-400 text-slate-900'
                }`}>
                {isListening ? <MicOff className="w-5 h-5"/> : <Mic className="w-5 h-5"/>}
              </button>
            )}
            <button onClick={() => setAutoSpeak(!autoSpeak)}
              className={`w-7 h-10 rounded flex items-center justify-center ${autoSpeak ? 'text-amber-300' : 'text-slate-500'}`}>
              {autoSpeak ? <Volume2 className="w-4 h-4"/> : <VolumeX className="w-4 h-4"/>}
            </button>
            {query && (
              <button onClick={() => { setQuery(''); stopSpeak(); }} className="w-7 h-10 rounded hover:bg-slate-700 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-500"/>
              </button>
            )}
          </div>
        </div>
        {isListening && transcript && (
          <div className="mt-2 text-xs text-red-300 mono bg-red-900/20 px-2 py-1.5 rounded border border-red-800/40">
            🎙 {transcript}
          </div>
        )}
        {/* AI 인식 결과 표시 */}
        {hasAnyCondition(parsed) && (
          <div className="mt-2 text-[11px] text-cyan-300 bg-cyan-950/30 px-2 py-1 rounded border border-cyan-800/40">
            🤖 인식: <span className="font-bold">{describeQuery(parsed)}</span>
            {parsed.isStat && <span className="ml-1 text-amber-300">(개수 질의)</span>}
          </div>
        )}
        <div className="text-[11px] text-center mt-2">
          {!isListening && query.length === 0 && <span className="text-slate-500">🎤 마이크 또는 키보드</span>}
          {!isListening && query.length >= 2 && matches.length === 0 && hasAnyCondition(parsed) && <span className="text-red-400 font-bold">⚠ 일치 없음</span>}
          {!isListening && query.length >= 2 && matches.length === 1 && !parsed.isStat && <span className="text-emerald-400 font-bold">✓ 1개 일치</span>}
          {!isListening && query.length >= 2 && matches.length > 1 && !parsed.isStat && <span className="text-amber-400 font-bold">⚠ {matches.length}개 일치{matches.length === 100 ? '+' : ''}</span>}
          {isListening && <span className="text-red-300 font-bold">🎙 듣는 중...</span>}
        </div>
      </div>

      {/* V9.14: 즉답/안내 카드 */}
      {localAnswer && (
        <div className="bg-emerald-950/40 border-2 border-emerald-700 rounded-xl p-4 mb-3">
          <div className="text-[11px] text-emerald-400 font-bold uppercase mb-1">🤖 즉답</div>
          <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{localAnswer}</div>
        </div>
      )}

      {/* 통계 답변 카드 */}
      {!localAnswer && parsed.isStat && hasAnyCondition(parsed) && query.length >= 2 && (
        <div className="bg-gradient-to-br from-cyan-950 to-slate-900 border-2 border-cyan-600 rounded-xl p-4 text-center mb-3">
          <div className="text-[11px] text-cyan-400 font-bold uppercase mb-1">🤖 AI 답변</div>
          <div className="text-base text-slate-300 mb-2">{describeQuery(parsed)}</div>
          <div className="text-6xl sm:text-7xl font-black mono text-cyan-300 my-2"
            style={{ textShadow: '0 0 30px rgba(34, 211, 238, 0.6)' }}>
            {matches.length}
          </div>
          <div className="text-lg text-cyan-400 font-bold">대</div>
        </div>
      )}

      {/* 일반 결과 */}
      {!localAnswer && !parsed.isStat && (
        <div className="space-y-1.5">
          {matches.map(c => (
            <GlobalResultCard key={`${c.voyageKey}/${c.mode}/${c.cn}`} c={c} onOpen={() => onOpenContainer(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function GlobalResultCard({ c, onOpen }) {
  const isDone = !!c.comp;
  const isReefer = c.rf || (c.iso && c.iso[2] === 'R');
  const hasTmp = c.tmp && String(c.tmp).trim() !== '' && String(c.tmp).trim() !== '0';
  return (
    <button onClick={onOpen}
      className={`w-full text-left bg-slate-900 border rounded-lg p-2.5 flex items-center gap-2 ${
        isDone ? 'border-emerald-700/30 bg-emerald-950/10' :
        c.isXray ? 'border-purple-700/30 bg-purple-950/10' :
        'border-slate-700 hover:bg-slate-800/50'
      }`}>
      <div className={`flex-shrink-0 px-2 py-1.5 rounded text-[10px] font-black flex flex-col items-center gap-0.5 ${
        c.mode === 'discharge' ? 'bg-blue-900/60 text-blue-200' : 'bg-amber-900/60 text-amber-200'
      }`}>
        {c.mode === 'discharge' ? <ArrowDown className="w-3.5 h-3.5"/> : <ArrowUp className="w-3.5 h-3.5"/>}
        <span>{c.mode === 'discharge' ? '양하' : '선적'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-sm text-amber-300 mono">{c.l4 || c.cn?.slice(-4)}</span>
          <span className="text-[11px] text-slate-400 mono truncate">{c.cn}</span>
          <span className={`text-[9px] mono px-1 rounded font-bold ${
            c.fe === 'F' ? 'bg-emerald-900/60 text-emerald-300' :
            c.fe === 'E' ? 'bg-slate-700 text-slate-300' :
            'bg-amber-900/60 text-amber-300'
          }`}>{c.fe || '?'}</span>
          {isReefer && hasTmp && <span className="bg-cyan-700/60 text-cyan-100 text-[9px] px-1 rounded font-bold flex items-center gap-0.5"><Snowflake className="w-2.5 h-2.5"/>{c.tmp}°</span>}
          {c.isXray && <span className="bg-purple-700/60 text-purple-100 text-[9px] px-1 rounded font-bold">🔍</span>}
          {c.dg && <span className="text-red-400 text-xs">🔥</span>}
          {isDone && <span className="bg-emerald-700/60 text-emerald-100 text-[9px] px-1 rounded font-bold">✓</span>}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 mono mt-0.5">
          <span className="text-slate-300 font-bold">{c.vsl}</span>
          <span>·</span>
          <span>{c.voy}</span>
          {c.bay && <><span>·</span><MapPin className="w-2.5 h-2.5"/><span className="text-amber-300">{fmtPos(c)}</span></>}
          {c.op && <><span>·</span><span className="text-slate-400">{c.op}</span></>}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0"/>
    </button>
  );
}
