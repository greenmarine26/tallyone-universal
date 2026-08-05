// 뒤로가기 가로채기 + 해시 라우트 파서
//  - 안드로이드 폰의 뒤로가기 버튼이 앱을 종료시키는 것 방지
//  - 앱 안에서 모달 닫기, 페이지 뒤로 등으로 처리
//  - 명시적 종료 버튼 (헤더 우측)으로만 종료 가능
import { useEffect } from 'react';

// TallyOne 1.0: 해시 → 라우트 단일 파서 (B-8 초기 라우트 깜빡임 제거 · B-12 prefix 일관 규칙)
//   App.jsx의 sync()/초기 state/로그인 후 이동이 전부 이 함수 하나를 쓴다.
//   React 의존이 없어 node 시뮬레이션으로 그대로 검증할 수 있다.
export function parseHash(h) {
  const s = String(h || '');
  // B-1: 양하/선적 모드를 해시에 싣는다 — #/voyage/{KEY}/{discharge|loading}
  const v = s.match(/^#\/voyage\/([^/]+)(?:\/(discharge|loading))?/);
  if (v) return { name: 'voyage', voyageKey: decodeURIComponent(v[1]), mode: v[2] || null };
  if (s.startsWith('#/login')) return { name: 'login' };
  if (s.startsWith('#/search')) return { name: 'search' };
  if (s.startsWith('#/chief')) return { name: 'chief' };
  if (s.startsWith('#/health')) return { name: 'health' };
  if (s.startsWith('#/food')) return { name: 'food' };
  if (s.startsWith('#/aux')) return { name: 'aux' };
  return { name: 'home' };
}

// 페이지 진입/모달 열림마다 history 푸시 → 뒤로가기 시 history 뒤로 이동
export function useBackHandler(onBack, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    // 가짜 history 항목 추가
    window.history.pushState({ inApp: true }, '');

    const handler = (e) => {
      // 뒤로가기 시 onBack 호출 (모달 닫기 등)
      onBack();
      // 다시 가짜 항목 추가 (다음 뒤로가기도 가로채기)
      window.history.pushState({ inApp: true }, '');
    };

    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
    };
  }, [enabled, onBack]);
}

// 앱 종료 (PWA에서는 window.close가 작동하지 않음 — 사용자에게 안내)
// M3.74: confirm() 제거 - 호출자에서 ConfirmModal로 미리 확인 후 호출
export function exitApp() {
  try {
    window.close();
  } catch (e) {}
  // window.close가 안 되면 빈 페이지로 이동
  setTimeout(() => {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#94a3b8;font-family:sans-serif;text-align:center;padding:20px;">
        <div>
          <div style="font-size:48px;margin-bottom:16px;">👋</div>
          <div style="font-size:18px;font-weight:bold;margin-bottom:8px;">검수앱 종료됨</div>
          <div style="font-size:14px;opacity:0.7;">탭을 닫거나 다시 들어오려면 새로고침</div>
        </div>
      </div>
    `;
  }, 200);
}
