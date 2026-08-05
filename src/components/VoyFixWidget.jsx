// M6.46: voy 데이터 검증 + 정정 위젯
//   - voyage.info.voy_d / voy_l 현재값 표시
//   - 비어있거나 잘못된 경우(예: 양하/선적 voy 결합 "618N620S") 정정 가능
//   - 양하/선적 EDI 있는지에 따라 입력 필드 활성화
//   - 자동 추측 금지 — 사용자가 입력한 값만 신뢰
import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import { fbUpdateVoyageInfo } from '../firebase.js';

export default function VoyFixWidget({ voyage, voyageKey }) {
  const info = voyage?.info || {};
  const hasDischarge = Object.keys(voyage?.discharge?.ediContainers || {}).length > 0;
  const hasLoading = Object.keys(voyage?.loading?.ediContainers || {}).length > 0;

  const [voyD, setVoyD] = useState(info.voy_d || '');
  const [voyL, setVoyL] = useState(info.voy_l || '');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // info 변경 시 입력값 동기화
  useEffect(() => {
    setVoyD(info.voy_d || '');
    setVoyL(info.voy_l || '');
  }, [info.voy_d, info.voy_l]);

  // 문제 진단
  const needsD = hasDischarge && !info.voy_d;
  const needsL = hasLoading && !info.voy_l;
  const suspicious = info.voy_d && info.voy_l && info.voy_d === info.voy_l;
  // 결합 형태 의심 (예: "618N620S") — 길이가 비정상으로 김
  const dCombined = info.voy_d && info.voy_d.length >= 8;
  const lCombined = info.voy_l && info.voy_l.length >= 8;
  const hasIssue = needsD || needsL || suspicious || dCombined || lCombined;

  // 자동 펼침 (문제 있을 때)
  useEffect(() => {
    if (hasIssue) setExpanded(true);
  }, [hasIssue]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = {};
      if (voyD.trim() && voyD.trim().toUpperCase() !== info.voy_d) {
        patch.voy_d = voyD.trim().toUpperCase();
      }
      if (voyL.trim() && voyL.trim().toUpperCase() !== info.voy_l) {
        patch.voy_l = voyL.trim().toUpperCase();
      }
      if (Object.keys(patch).length > 0) {
        await fbUpdateVoyageInfo(voyageKey, patch);
        setSavedMsg('✅ 저장 완료');
        setTimeout(() => setSavedMsg(''), 3000);
      } else {
        setSavedMsg('변경 사항 없음');
        setTimeout(() => setSavedMsg(''), 2000);
      }
    } catch (e) {
      setSavedMsg('❌ 저장 실패: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-lg overflow-hidden ${
      hasIssue ? 'bg-amber-950/30 border border-amber-700/60' : 'bg-slate-900/50 border border-slate-700/50'
    }`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-amber-900/20"
      >
        {hasIssue ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0"/> : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0"/>}
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-black ${hasIssue ? 'text-amber-200' : 'text-emerald-200'}`}>
            📋 항차 번호 확인
            {hasIssue && <span className="ml-2 text-[10px] bg-amber-700/60 px-1.5 py-0.5 rounded">정정 필요</span>}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            양하 <span className={info.voy_d ? 'text-cyan-300' : 'text-amber-400'}>{info.voy_d || '(미입력)'}</span>
            {' · '}
            선적 <span className={info.voy_l ? 'text-cyan-300' : 'text-amber-400'}>{info.voy_l || '(미입력)'}</span>
          </div>
        </div>
        <span className="text-slate-400 px-1 shrink-0">
          {expanded ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/40 p-2.5 space-y-2">
          <div className="text-[10px] text-slate-400 leading-relaxed">
            💡 EDI는 송신측 항차(예: 인천 선적)를 포함할 수 있어 신뢰하지 않습니다.<br/>
            여기에 입력한 양하/선적 항차가 카고플랜·베이상세·작업 보고에 정확히 표시됩니다.
          </div>

          {/* 양하 voy */}
          {(hasDischarge || info.voy_d) && (
            <div>
              <label className="text-[10px] font-bold text-blue-300 block mb-1">
                양하 항차 (voy_d) {hasDischarge && <span className="text-amber-400">*</span>}
                {dCombined && <span className="ml-1 text-red-300 text-[9px]">⚠️ 결합 의심 ({info.voy_d.length}자)</span>}
              </label>
              <input
                type="text"
                value={voyD}
                onChange={e => setVoyD(e.target.value.toUpperCase())}
                placeholder="예: 0523E"
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono uppercase focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {/* 선적 voy */}
          {(hasLoading || info.voy_l) && (
            <div>
              <label className="text-[10px] font-bold text-amber-300 block mb-1">
                선적 항차 (voy_l) {hasLoading && <span className="text-amber-400">*</span>}
                {lCombined && <span className="ml-1 text-red-300 text-[9px]">⚠️ 결합 의심 ({info.voy_l.length}자)</span>}
              </label>
              <input
                type="text"
                value={voyL}
                onChange={e => setVoyL(e.target.value.toUpperCase())}
                placeholder="예: 0523W"
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono uppercase focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {suspicious && (
            <div className="text-[10px] text-amber-300 bg-amber-950/40 rounded p-1.5">
              ⚠️ 양하 voy와 선적 voy가 동일 — 별개라면 정정하세요
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 text-white rounded text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5"/>
              {saving ? '저장 중...' : '저장'}
            </button>
            {savedMsg && (
              <span className="text-[10px] text-emerald-300">{savedMsg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
