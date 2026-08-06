// 매트릭스 수정 권한 훅 — TallyUni 0.9
//
// canWriteBayDict()(bayDictGuard.js)는 동기 함수라 명단이 늦게 도착하면 화면이 갱신되지 않는다.
//   화면(진입 버튼·가져오기 버튼)은 명단 구독을 붙여야 명단이 바뀐 순간 잠기고 풀린다.
//   판정 규칙 자체는 bayDictGuard 와 같은 하나다 — 명단(matrix_editors)에 현재 검수원이 있는가.
//
// ⚠ 이 파일은 firebase.js 를 import 한다. Firebase 를 부르지 않는 단독본(planedit)은
//   이 훅이 아니라 bayDictGuard.canWriteBayDict() 를 직접 쓴다.
import { useEffect, useMemo, useState } from 'react';
import { fbSubscribeMatrixEditors } from './firebase.js';
import { getActiveInspector } from './bayDictGuard.js';

export function useCanWriteBayDict() {
  const [editors, setEditors] = useState(null);   // null = 명단 로딩 전
  useEffect(() => {
    let unsub = null;
    try {
      unsub = fbSubscribeMatrixEditors(list => setEditors(Array.isArray(list) ? list : []));
    } catch (e) {
      // 조용히 실패 금지 — 명단을 못 받으면 잠긴 채로 두고 이유를 남긴다.
      console.warn('[useCanWriteBayDict] 권한자 명단 구독 실패 — 잠금 상태 유지', e);
      setEditors([]);
    }
    return () => { try { unsub && unsub(); } catch { /* noop */ } };
  }, []);
  const inspector = getActiveInspector();
  const canEdit = useMemo(() => {
    if (!Array.isArray(editors)) return false;   // 로딩 전엔 잠금(안전)
    return !!inspector && editors.includes(inspector);
  }, [editors, inspector]);
  return { canEdit, editors, inspector, loading: editors === null };
}
