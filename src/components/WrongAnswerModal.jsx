// 답변 오답 신고 모달 (M3.4)
// 검수원이 잘못된 답변을 보고 → 메모 작성 → Firebase 저장
// 수석 대시보드에서 모아서 다음 버전 개선에 활용
import React, { useState } from 'react';
import { X, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { fbReportWrongAnswer } from '../firebase.js';
import { APP_VERSION } from '../utils.js';

export default function WrongAnswerModal({ open, onClose, query, answerType, answerText, parsed, voyageKey, voyageVsl, inspector }) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    setSending(true);
    try {
      // parsed 결과에서 핵심 플래그만 추출 (저장 효율)
      const parsedSummary = {};
      if (parsed) {
        const keys = ['digits','size','fe','type','temp','bay','pol','pod','portAny','zone',
                      'dgClass','un','mode','weightMin','weightMax','weightSum',
                      'capacityQuery','bayBreakdown','progressQuery','tierStackQuery',
                      'bottomQuery','topQuery','vacantQuery','posQuery','listQuery',
                      'isAll','isStat',
                      // V9.14: V7.9x 이후 추가된 의도 15종 — 빠져 있어 이 계열 오답은 파싱 정보 없이 접수됐다
                      'bayDistQuery','briefingQuery','sealAuditQuery','twinCheckQuery',
                      'tierPlaceCountQuery','tierInContextQuery','etaQuery','customsReportQuery',
                      'handoverQuery','foodQuery','schedQuery','weatherQuery','timeQuery',
                      'introQuery','bayTrio'];
        keys.forEach(k => {
          if (parsed[k] !== null && parsed[k] !== false && parsed[k] !== '' && parsed[k] !== undefined) {
            parsedSummary[k] = parsed[k];
          }
        });
      }
      await fbReportWrongAnswer({
        inspector: inspector || '익명',
        voyageKey: voyageKey || '',
        voyageVsl: voyageVsl || '',
        query: query || '',
        answerType: answerType || 'unknown',
        answerText: (answerText || '').slice(0, 1000),  // 너무 길면 자름
        parsedSummary,
        userNote: (note || '').slice(0, 500),
        appVersion: APP_VERSION,
      });
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setNote('');
        onClose();
      }, 1500);
    } catch (e) {
      alert('전송 실패: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border-2 border-red-700/50 rounded-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-red-950/40">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400"/>
            <div>
              <div className="text-base font-black text-red-200">오답 신고</div>
              <div className="text-[11px] text-slate-400">다음 버전 개선에 반영됩니다</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg" disabled={sending}>
            <X className="w-5 h-5 text-slate-300"/>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {done ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-2">✅</div>
              <div className="text-emerald-300 font-bold text-lg">접수 완료</div>
              <div className="text-slate-400 text-sm mt-1">감사합니다. 다음 버전에서 개선됩니다.</div>
            </div>
          ) : (
            <>
              <div>
                <div className="text-[11px] text-slate-500 font-bold uppercase mb-1">내가 한 질문</div>
                <div className="bg-slate-800 border border-slate-700 rounded p-2 text-sm text-amber-200 mono break-all">
                  {query || '(없음)'}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 font-bold uppercase mb-1">
                  앱 답변 ({answerType === 'ai' ? 'AI' : answerType === 'local' ? '로컬 즉답' : '검색 결과'})
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                  {answerText || '(없음)'}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 font-bold uppercase mb-1">
                  뭐가 잘못됐는지 알려주세요 (선택)
                </div>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="예: 28번 베이만 답하고 짝꿍 베이 27/29까지 합산 안 해줌&#10;예: 답변이 너무 길어서 못 읽음&#10;예: 베이는 잘 잡았는데 무게 계산이 틀림"
                  rows={4}
                  maxLength={500}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
                />
                <div className="text-[10px] text-slate-500 text-right mt-0.5">{note.length}/500</div>
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-800/50 rounded p-2 border border-slate-700/50">
                💡 검수자({inspector || '익명'}) · 항차({voyageVsl || '-'}) · 앱 v{APP_VERSION} 자동 기록됩니다.
                <br/>수석 대시보드 "오답 리포트" 섹션에서 확인 가능합니다.
              </div>
            </>
          )}
        </div>

        {/* 버튼 */}
        {!done && (
          <div className="flex gap-2 px-4 py-3 border-t border-slate-700 bg-slate-950">
            <button
              onClick={onClose}
              disabled={sending}
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold text-sm">
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={sending}
              className="flex-1 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded font-bold text-sm flex items-center justify-center gap-1.5">
              {sending ? <><Loader2 className="w-4 h-4 animate-spin"/>전송 중</> : <><Send className="w-4 h-4"/>오답 신고</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
