#!/usr/bin/env bash
# 선적 플랜 편집기(단독) 빌드 — V9.07
#
# 산출물: planedit.html (단일 HTML, 약 1.7MB)
#   - 외부 참조 0 · Firebase 미포함 · 인터넷 없이 동작
#   - parseBAPLIE / getShipBayDictData / cargoPlanCore 를 검수앱 소스에서 그대로 번들
#     → 콘앱처럼 별도 약식 파서를 두지 않는다 (파서 불일치 재발 방지)
#
# 주의: 인라인은 반드시 함수형 치환(_inline.cjs)을 쓴다.
#   문자열 치환을 쓰면 번들 안의 "$&"가 확장돼 <script> 태그가 조기 종료된다 (V9.07 실사고).
set -e
cd "$(dirname "$0")"

echo "[1/3] 의존성 확인..."
[ ! -d node_modules ] && npm install --silent

echo "[2/3] vite 빌드..."
npx vite build --config vite.planedit.config.js

echo "[3/3] 단일 HTML 인라인..."
node _inline.cjs

echo "✓ 완료 — planedit.html"
