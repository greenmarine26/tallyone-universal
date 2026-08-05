// 초과 컨테이너 입력 모달 — 신고 리스트에 없는데 내려진 컨을 신고용 기본정보와 함께 기록 (V8.04)
//   규격·F/E·타입·실번호·데미지를 버튼 탭으로 받아 fbAddExtraContainer로 저장.
//   V8.04-01: Chip/Field를 모듈 스코프로 분리 (컴포넌트 본문 내 정의가 React error #310 유발).
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { engChange, ENG_INPUT_PROPS, NUM_INPUT_PROPS, DECIMAL_INPUT_PROPS } from '../inputUtils.js';

const SIZES = ['20', '40ST', '40HC', '45'];
const FES = [['F', '적 (Full)'], ['E', '공 (Empty)']];
const TYPES = ['일반', 'RF', 'FR', 'OT', 'TK'];
const DAMAGES = ['없음', '있음'];

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-bold border-2 transition ${
        active ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
      }`}>{children}</button>
  );
}
function Field({ label, color, children }) {
  return (
    <div className="mb-3">
      <div className={`text-xs font-bold mb-1.5 ${color || 'text-amber-200'}`}>{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export default function ExtraContainerModal({ open, mode = 'discharge', onClose, onSave }) {
  const [cn, setCn] = useState('');
  const [size, setSize] = useState('');
  const [fe, setFe] = useState('');
  const [ctype, setCtype] = useState('');
  const [temp, setTemp] = useState('');
  const [seal, setSeal] = useState('');
  const [damage, setDamage] = useState('');
  const [damageNote, setDamageNote] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  if (!open) return null;

  const cnClean = cn.trim().toUpperCase().replace(/\s/g, '');
  const canSave = cnClean.length >= 4 && size && fe && ctype && damage && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        cn: cnClean,
        info: {
          size, fe, ctype,
          temp: ctype === 'RF' ? temp.trim() : '',
          seal: seal.trim().toUpperCase().replace(/\s/g, ''),
          damage: damage === '있음' ? (damageNote.trim() || '있음') : '없음',
          note: note.trim(),
        },
      });
      setCn(''); setSize(''); setFe(''); setCtype(''); setTemp(''); setSeal(''); setDamage(''); setDamageNote(''); setNote('');
      onClose();
    } catch (e) {
      alert('기록 실패: 신호를 확인하세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-slate-950 border border-amber-700/50 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900/90 sticky top-0">
          <span className="text-base font-black text-amber-300">➕ 초과 컨테이너 ({mode === 'discharge' ? '양하' : '선적'})</span>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-4 overflow-y-auto">
          <div className="text-[11px] text-slate-500 mb-3">신고 리스트에 없는데 내려진 컨테이너. 신고서 작성을 위해 기본 정보를 입력합니다.</div>

          <div className="mb-3">
            <div className="text-xs font-bold text-amber-200 mb-1.5">컨테이너 번호 *</div>
            <input value={cn} onChange={engChange(setCn)} {...ENG_INPUT_PROPS} placeholder="예: ABCD1234567"
              className="w-full bg-slate-900 border-2 border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-sm mono text-slate-100 outline-none" />
          </div>

          <Field label="규격 *">
            {SIZES.map(s => <Chip key={s} active={size === s} onClick={() => setSize(s)}>{s}</Chip>)}
          </Field>

          <Field label="적/공 *">
            {FES.map(([v, l]) => <Chip key={v} active={fe === v} onClick={() => setFe(v)}>{l}</Chip>)}
          </Field>

          <Field label="타입 *">
            {TYPES.map(t => <Chip key={t} active={ctype === t} onClick={() => setCtype(t)}>{t}</Chip>)}
          </Field>

          {ctype === 'RF' && (
            <div className="mb-3">
              <div className="text-xs font-bold text-cyan-200 mb-1.5">리퍼 온도</div>
              <input value={temp} onChange={(e) => setTemp(e.target.value)} {...DECIMAL_INPUT_PROPS} placeholder="예: -18"
                className="w-full bg-slate-900 border-2 border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm mono text-slate-100 outline-none" />
            </div>
          )}

          <div className="mb-3">
            <div className="text-xs font-bold text-amber-200 mb-1.5">실번호</div>
            <input value={seal} onChange={(e) => setSeal(e.target.value)} {...NUM_INPUT_PROPS} placeholder="실 번호 (선택)"
              className="w-full bg-slate-900 border-2 border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-sm mono text-slate-100 outline-none" />
          </div>

          <Field label="데미지 유무 *">
            {DAMAGES.map(d => <Chip key={d} active={damage === d} onClick={() => setDamage(d)}>{d}</Chip>)}
          </Field>

          {damage === '있음' && (
            <div className="mb-3">
              <input value={damageNote} onChange={(e) => setDamageNote(e.target.value)} placeholder="데미지 내용 (예: 좌측 찌그러짐)"
                className="w-full bg-slate-900 border-2 border-orange-700/50 focus:border-orange-500 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none" />
            </div>
          )}

          <div className="mb-2">
            <div className="text-xs font-bold text-slate-400 mb-1.5">메모 (선택)</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="위치·비고"
              className="w-full bg-slate-900 border-2 border-slate-700 focus:border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none" />
          </div>
        </div>

        <div className="p-3 border-t border-slate-800 bg-slate-950 sticky bottom-0">
          <button onClick={handleSave} disabled={!canSave}
            className={`w-full py-3 rounded-xl font-black text-sm ${
              canSave ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            }`}>
            {saving ? '저장 중…' : '초과 컨 기록'}
          </button>
          {!canSave && !saving && <div className="text-[10px] text-slate-500 text-center mt-1.5">번호·규격·적공·타입·데미지는 필수입니다.</div>}
        </div>
      </div>
    </div>
  );
}
