// M4.9: ISO403 사진 촬영 모달
//   사진 촬영 의무 대상 컨테이너에 대해 1장 촬영 → Firebase RTDB 저장
//   기존 사진 있으면 미리보기 + 다시찍기/삭제
//   카톡 공유는 필요 없음 (저장 전용)
import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Save, Trash2, Loader, Check } from 'lucide-react';
import { fbSaveISO403Photo, fbDeleteISO403Photo } from '../firebase.js';
import { ref as dbRef, get } from 'firebase/database';
import { db } from '../firebase.js';

// 사진 압축 (1024px JPEG quality 0.7) — RTDB 10MB 제한 안전 마진
async function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const MAX = 1024;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        resolve(dataUrl);
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

export default function ISO403PhotoModal({ open, c, voyageKey, mode, inspector, onClose, onSaved }) {
  const [photoBlob, setPhotoBlob] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');  // base64 압축 후 미리보기
  const [existingPhoto, setExistingPhoto] = useState(null);  // 기존 저장된 사진 데이터
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const albumRef = useRef(null);   // TallyOne 1.2: 앨범 선택

  // 기존 사진 불러오기
  useEffect(() => {
    if (!open || !c?.iso403_photo_ts) {
      setExistingPhoto(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const snap = await get(dbRef(db, `voyages/${voyageKey}/photos/${c.iso403_photo_ts}`));
        if (!cancelled && snap.exists()) {
          setExistingPhoto(snap.val());
        }
      } catch (e) {
        console.error('[ISO403Photo] 기존 사진 로드 실패', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, c?.iso403_photo_ts, voyageKey]);

  if (!open || !c) return null;

  const handlePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const compressed = await compressPhoto(file);
      setPhotoBlob(file);
      setPhotoPreview(compressed);
    } catch (err) {
      setError('사진 처리 실패: ' + (err?.message || err));
    }
  };

  const handleSave = async () => {
    if (!photoPreview) {
      setError('사진을 먼저 촬영하세요');
      return;
    }
    if (!inspector) {
      setError('검수원을 먼저 선택하세요');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const ts = await fbSaveISO403Photo(voyageKey, mode, c.cn, photoPreview, inspector);
      console.log('[ISO403Photo] 저장 완료', ts);
      if (onSaved) onSaved(ts);
      onClose();
    } catch (e) {
      console.error('[ISO403Photo] 저장 실패', e);
      setError('저장 실패: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!c.iso403_photo_ts) return;
    if (!confirm('저장된 ISO403 사진을 삭제하시겠습니까?')) return;
    setSaving(true);
    try {
      await fbDeleteISO403Photo(voyageKey, mode, c.cn, c.iso403_photo_ts);
      if (onSaved) onSaved(null);
      onClose();
    } catch (e) {
      setError('삭제 실패: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const hasExisting = !!existingPhoto;
  const isReplacing = hasExisting && !!photoPreview;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/85 p-0 md:p-4" onClick={onClose}>
      <div className="bg-slate-900 border-2 border-blue-700 rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-blue-950 border-b border-blue-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-300"/>
            <span className="font-black text-blue-100">📷 풀 리퍼 사진 촬영</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-blue-900 rounded">
            <X className="w-5 h-5 text-blue-200"/>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 컨테이너 정보 */}
          <div className="bg-slate-800 rounded-lg p-3 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase">컨번호</span>
              <span className="text-base font-black mono text-white">{c.cn}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase">규격</span>
              <span className="text-sm font-bold mono text-amber-300">{c.iso || '-'}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase">위치</span>
              <span className="text-sm font-bold mono text-slate-200">
                {c.bay || '-'} / {c.row || '-'} / {c.tier || '-'}
              </span>
            </div>
          </div>

          {/* 기존 사진 (있으면 표시) */}
          {hasExisting && !isReplacing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/40 border border-emerald-700/50 rounded">
                <Check className="w-4 h-4 text-emerald-400"/>
                <span className="text-sm font-bold text-emerald-200">촬영 완료</span>
                {existingPhoto.by && (
                  <span className="text-xs text-emerald-300/80">({existingPhoto.by})</span>
                )}
              </div>
              {loading ? (
                <div className="aspect-square bg-slate-800 rounded-lg flex items-center justify-center">
                  <Loader className="w-8 h-8 animate-spin text-slate-500"/>
                </div>
              ) : (
                <img src={existingPhoto.data} alt="기존 ISO403 사진"
                  className="w-full rounded-lg border-2 border-emerald-700"/>
              )}
            </div>
          )}

          {/* 새 사진 미리보기 */}
          {photoPreview && (
            <div className="space-y-2">
              <div className="text-[11px] text-blue-300 font-bold">
                {hasExisting ? '🔁 새 사진으로 교체' : '✅ 새 사진 촬영됨'}
              </div>
              <img src={photoPreview} alt="새 사진"
                className="w-full rounded-lg border-2 border-blue-600"/>
            </div>
          )}

          {/* 사진 촬영 input */}
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={handlePick} className="hidden"/>
          {/* TallyOne 1.2: 앨범 선택용(capture 없음) — 찍어둔 사진 등록 지원 */}
          <input ref={albumRef} type="file" accept="image/*" onChange={handlePick} className="hidden"/>
          <button onClick={() => fileRef.current?.click()} disabled={saving}
            className="w-full py-4 bg-blue-700 hover:bg-blue-600 active:bg-blue-800 text-white rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            <Camera className="w-5 h-5"/>
            {photoPreview ? '📷 다시 촬영' : (hasExisting ? '📷 새로 촬영' : '📷 사진 촬영')}
          </button>
          <button onClick={() => albumRef.current?.click()} disabled={saving}
            className="w-full py-2 mt-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-bold text-xs">
            🖼 앨범에서 선택 (찍어둔 사진)
          </button>

          {/* 에러 */}
          {error && (
            <div className="px-3 py-2 bg-red-950/50 border border-red-700/50 rounded text-xs text-red-200 font-bold">
              ⚠️ {error}
            </div>
          )}

          {/* 안내 */}
          <div className="text-[11px] text-slate-400 leading-relaxed">
            풀 리퍼는 온도 확인 사진 1장이 필수입니다. 촬영 후 저장 버튼을 누르면 항차에 기록됩니다.
            {!inspector && <span className="block text-amber-400 mt-1">⚠️ 검수원을 먼저 선택하세요.</span>}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-3 flex gap-2">
          {hasExisting && !isReplacing && (
            <button onClick={handleDelete} disabled={saving}
              className="px-3 py-3 bg-red-900 hover:bg-red-800 text-red-100 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50">
              <Trash2 className="w-4 h-4"/>삭제
            </button>
          )}
          <button onClick={handleSave} disabled={saving || !photoPreview || !inspector}
            className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-slate-700">
            {saving ? <Loader className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
