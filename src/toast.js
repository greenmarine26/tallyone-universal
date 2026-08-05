// window.alert를 가로채 작업 흐름을 끊지 않는 토스트 알림으로 표시하는 전역 모듈
// 성공·안내는 초록·짧게, 실패·오류는 빨강·길게(탭으로 즉시 닫기). confirm/prompt는 건드리지 않음.

const DURATION_OK = 2600;    // 성공·안내: 잠깐 떴다 사라짐
const DURATION_ERR = 6000;   // 실패·오류: 더 오래 머물러 놓치지 않게

// 메시지에 실패 신호가 있으면 오류로 판정
function isError(msg) {
  const s = String(msg);
  return /실패|오류|에러|error|❌|⚠|없습니다|불가|권한이 없/i.test(s);
}

let containerEl = null;
function getContainer() {
  if (containerEl && document.body.contains(containerEl)) return containerEl;
  containerEl = document.createElement('div');
  containerEl.setAttribute('data-toast-root', '1');
  containerEl.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
    'z-index:2147483647', 'display:flex', 'flex-direction:column',
    'gap:8px', 'align-items:center', 'pointer-events:none',
    'max-width:92vw', 'width:max-content'
  ].join(';');
  document.body.appendChild(containerEl);
  return containerEl;
}

export function showToast(message, opts = {}) {
  const err = opts.error != null ? opts.error : isError(message);
  const root = getContainer();

  const el = document.createElement('div');
  el.textContent = String(message);
  el.style.cssText = [
    'pointer-events:auto',
    'white-space:pre-line',          // 기존 alert의 \n 줄바꿈 유지
    'box-sizing:border-box',
    'max-width:92vw',
    'padding:13px 18px',
    'border-radius:12px',
    'font-size:15px', 'line-height:1.45', 'font-weight:600',
    'color:#fff',
    'box-shadow:0 6px 20px rgba(0,0,0,0.28)',
    'background:' + (err ? '#dc2626' : '#16a34a'),
    'opacity:0', 'transform:translateY(8px)',
    'transition:opacity .18s ease, transform .18s ease',
    'cursor:pointer',
  ].join(';');

  // 탭하면 즉시 닫힘
  const remove = () => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
  };
  el.addEventListener('click', remove);

  root.appendChild(el);
  // 등장 애니메이션
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });

  setTimeout(remove, err ? DURATION_ERR : DURATION_OK);
}

// 기존 코드의 alert(...) 119곳을 한 줄도 안 고치고 토스트로 전환.
// confirm/prompt는 사용자 선택을 받아야 하므로 그대로 둔다.
export function installToastAlert() {
  if (typeof window === 'undefined') return;
  if (window.__toastInstalled) return;
  window.__toastInstalled = true;
  window.alert = function (msg) { showToast(msg); };
}
