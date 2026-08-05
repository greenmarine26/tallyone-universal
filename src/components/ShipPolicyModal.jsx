// 새 선박 엠티 실 정책 등록 모달 (M3.5.5)
// EDI 업로드 후 매칭 안되는 새 선박이면 자동 트리거
import React, { useState } from 'react';
import { X, Ship, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { fbSaveShipPolicy } from '../shipPolicies.js';
import { db } from '../firebase.js';

// 평택항에서 자주 가는 중국 항구들 (POD 옵션)
const COMMON_PODS = [
  { code: 'CNWEH', name: '위해 (WEIHAI)' },
  { code: 'CNQDG', name: '청도 (QINGDAO)' },
  { code: 'CNTAO', name: '청도 (TIANJIN)' },
  { code: 'CNSHA', name: '상해 (SHANGHAI)' },
  { code: 'CNNGB', name: '닝보 (NINGBO)' },
  { code: 'CNYTN', name: '옌타이 (YANTAI)' },
  { code: 'CNDLC', name: '대련 (DALIAN)' },
];

export default function ShipPolicyModal({ open, vsl, code, onClose, onSaved, inspector }) {
  const [mode, setMode] = useState('none');     // 'none' | 'verify' | 'attach'
  const [target, setTarget] = useState('all_empty');  // 'all_empty' | 'empty_with_pod'
  const [selectedPods, setSelectedPods] = useState([]);
  const [customPod, setCustomPod] = useState('');
  const [lolo, setLolo] = useState(false);   // V8.09-08: LOLO 선박(베이 없는 IFCSUM 명세선). 대체선 대응.
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const togglePod = (code) => {
    setSelectedPods(prev =>
      prev.includes(code) ? prev.filter(p => p !== code) : [...prev, code]
    );
  };

  const handleAddCustomPod = () => {
    const c = customPod.trim().toUpperCase();
    if (c && !selectedPods.includes(c)) {
      setSelectedPods([...selectedPods, c]);
      setCustomPod('');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // V8.09-08: LOLO만 켜고 엠티 정책은 none인 대체선도 저장해야 함.
      //   mode가 none이고 lolo도 꺼져 있을 때만 "정책 없음".
      if (mode === 'none' && !lolo) {
        if (onSaved) onSaved(null);
        onClose();
        return;
      }

      const finalPods = (mode !== 'none' && target === 'empty_with_pod') ? selectedPods : [];
      if (mode !== 'none' && target === 'empty_with_pod' && finalPods.length === 0) {
        alert('POD를 1개 이상 선택하거나 "모든 엠티" 옵션을 선택하세요');
        setSaving(false);
        return;
      }

      const baseLabel = mode === 'none'
        ? 'LOLO 검수 (베이 없는 명세선)'
        : (mode === 'attach'
            ? (target === 'empty_with_pod' ? `POD ${finalPods.join('/')}행 엠티 실 부착` : '모든 엠티 실 부착')
            : (target === 'empty_with_pod' ? `POD ${finalPods.join('/')}행 엠티 실 확인` : '모든 엠티 실 확인'));

      const policy = {
        name: vsl,
        code: code || '',
        mode,
        target,
        pod: finalPods,
        lolo: lolo === true,   // V8.09-08: LOLO 선박 플래그 (대체선 대응)
        label: lolo ? `${baseLabel} · LOLO` : baseLabel,
        description: '',
      };

      await fbSaveShipPolicy(db, vsl, policy, inspector);
      if (onSaved) onSaved(policy);
      onClose();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-amber-400"/>
            <h2 className="text-base font-black text-amber-300">새 선박 등록</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded">
            <X className="w-5 h-5 text-slate-400"/>
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">선박</div>
            <div className="text-lg font-black text-amber-200 mono">{vsl}</div>
            {code && <div className="text-xs text-slate-400 mono">{code}</div>}
          </div>

          <div className="text-xs text-slate-300 font-bold">엠티 컨테이너 실 정책을 선택하세요:</div>

          {/* 정책 선택 */}
          <div className="space-y-2">
            <button
              onClick={() => setMode('none')}
              className={`w-full p-3 rounded-lg text-left border-2 transition ${
                mode === 'none'
                  ? 'bg-slate-700 border-slate-500 text-slate-100'
                  : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className={`w-4 h-4 ${mode === 'none' ? 'text-emerald-400' : 'text-slate-500'}`}/>
                <span className="font-bold text-sm">일반 (실 작업 없음)</span>
              </div>
              <div className="text-[10px] text-slate-400 ml-6">F만 실, E는 실 없음 (대부분의 선박)</div>
            </button>

            <button
              onClick={() => setMode('verify')}
              className={`w-full p-3 rounded-lg text-left border-2 transition ${
                mode === 'verify'
                  ? 'bg-cyan-900/40 border-cyan-500 text-cyan-100'
                  : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <Lock className={`w-4 h-4 ${mode === 'verify' ? 'text-cyan-400' : 'text-slate-500'}`}/>
                <span className="font-bold text-sm">엠티 실 확인 (이미 부착됨)</span>
              </div>
              <div className="text-[10px] text-slate-400 ml-6">예: TEN JUPITER, RIZHAO ORIENT — 리씰 가능</div>
            </button>

            <button
              onClick={() => setMode('attach')}
              className={`w-full p-3 rounded-lg text-left border-2 transition ${
                mode === 'attach'
                  ? 'bg-red-900/40 border-red-500 text-red-100'
                  : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <Lock className={`w-4 h-4 ${mode === 'attach' ? 'text-red-400' : 'text-slate-500'}`}/>
                <span className="font-bold text-sm">엠티 실 부착 (작업 필요)</span>
              </div>
              <div className="text-[10px] text-slate-400 ml-6">예: ATLANTIC PIONEER 위해행 — 검수원이 직접 부착</div>
            </button>
          </div>

          {/* 적용 대상 선택 (mode가 verify/attach일 때만) */}
          {mode !== 'none' && (
            <>
              <div className="text-xs text-slate-300 font-bold mt-3">적용 대상:</div>
              <div className="space-y-2">
                <button
                  onClick={() => setTarget('all_empty')}
                  className={`w-full p-2.5 rounded-lg text-left border ${
                    target === 'all_empty'
                      ? 'bg-amber-900/30 border-amber-500 text-amber-100'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}>
                  <div className="font-bold text-sm">모든 엠티 컨테이너</div>
                  <div className="text-[10px] text-slate-400">POD 무관</div>
                </button>
                <button
                  onClick={() => setTarget('empty_with_pod')}
                  className={`w-full p-2.5 rounded-lg text-left border ${
                    target === 'empty_with_pod'
                      ? 'bg-amber-900/30 border-amber-500 text-amber-100'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}>
                  <div className="font-bold text-sm">특정 POD행 엠티만</div>
                  <div className="text-[10px] text-slate-400">목적지 항구로 필터</div>
                </button>
              </div>

              {target === 'empty_with_pod' && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2">
                  <div className="text-[11px] text-amber-300 font-bold">POD 선택 (다중 가능):</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {COMMON_PODS.map(p => (
                      <button key={p.code}
                        onClick={() => togglePod(p.code)}
                        className={`px-2 py-1.5 rounded text-[11px] font-bold border ${
                          selectedPods.includes(p.code)
                            ? 'bg-amber-700 border-amber-500 text-white'
                            : 'bg-slate-800 border-slate-600 text-slate-300'
                        }`}>
                        {p.code}
                        <div className="text-[9px] opacity-70">{p.name.split(' ')[0]}</div>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={customPod}
                      onChange={e => setCustomPod(e.target.value.toUpperCase())}
                      placeholder="기타 POD (예: CNXMG)"
                      className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100 mono"
                      onKeyDown={e => e.key === 'Enter' && handleAddCustomPod()}
                    />
                    <button onClick={handleAddCustomPod}
                      className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-bold">
                      추가
                    </button>
                  </div>
                  {selectedPods.length > 0 && (
                    <div className="text-[10px] text-emerald-300 mono">
                      선택됨: {selectedPods.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* V8.09-08: LOLO 선박 토글 — 대체선 대응. 본선 수리·고장 시 대체선을 LOLO로 지정.
              엠티 실 정책(위 mode)과 독립. LOLO만 켜고 mode=none도 가능. */}
          <button
            onClick={() => setLolo(v => !v)}
            className={`w-full p-3 rounded-lg text-left border flex items-start gap-2 ${
              lolo
                ? 'bg-cyan-900/30 border-cyan-500 text-cyan-100'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}>
            <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
              lolo ? 'bg-cyan-500 border-cyan-400' : 'border-slate-500'
            }`}>
              {lolo && <CheckCircle2 className="w-3.5 h-3.5 text-white"/>}
            </div>
            <div>
              <div className="font-bold text-sm">LOLO 선박 (베이플랜 없음)</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                베이 그림 없이 리스트로만 검수하는 IFCSUM 명세선. 본선 수리·고장 시 대체선을 여기에 지정하면 LOLO 검수 리스트가 생성됩니다.
              </div>
            </div>
          </button>

          <div className="bg-blue-950/30 border border-blue-700/40 rounded p-2 text-[10px] text-blue-200 flex items-start gap-1.5">
            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5"/>
            <span>저장하면 다음부터 같은 선박이 EDI에 들어올 때 자동 적용됩니다. 수석 대시보드에서 변경 가능합니다.</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button onClick={onClose}
              className="py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-bold">
              나중에
            </button>
            <button onClick={handleSave} disabled={saving}
              className="py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
              {saving ? '저장 중...' : '💾 정책 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
