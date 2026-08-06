#!/usr/bin/env bash
# M6.86.7.2 빌드 자동화 스크립트
#
# 운영 실측 (사용자 확인):
#   - GitHub Pages는 main 브랜치 루트의 index.html을 직접 서빙하는 흐름으로 운영됨
#   - workflow의 빌드 색깔은 사이트 작동과 무관
#   - 사용자는 누적 ZIP을 repo 루트에 통째로 덮어쓴 후 commit & push 만 함
#
# 결론: 루트 index.html은 반드시 "빌드본"이어야 사이트 작동
#   - 루트 index.html = dist/index.html 복사본 (./assets/index-XXX.js 참조, base:'./')
#   - 절대 소스형(/src/main.jsx 진입점)으로 두지 말 것 — 그러면 production에서 모듈 404
#
# M6.86.7.1의 핫픽스(소스형 루트 index.html)는 잘못된 진단이었음 → 본 스크립트로 회귀

set -e
cd "$(dirname "$0")"

# 캐시 자동 무효화: sw.js의 VERSION을 utils.js의 APP_VERSION과 동기화.
# sw.js VERSION이 바뀌면 서비스워커가 새 버전으로 인식 → 옛 캐시 삭제 + 자동 새로고침.
# (이전: sw.js가 V7.13에 멈춰 새 배포해도 캐시 안 비워지던 문제 해결)
APPVER=$(grep -E "^export const APP_VERSION" src/utils.js | sed -E "s/.*=\s*['\"]([^'\"]+)['\"].*/\1/")
if [ -n "$APPVER" ]; then
  sed -i "s/^const VERSION = '.*';/const VERSION = '$APPVER';/" public/sw.js
  echo "✓ sw.js VERSION → $APPVER 동기화"
  # 콘앱 화면 버전 라벨도 동기화 — 라벨로 신/구버전 구분 가능하게.
  #   (이전: 코드는 고쳐도 라벨이 V7.01로 박혀 업데이트 여부를 화면에서 알 수 없었음)
  # V7.91: V[0-9.]* → V[0-9.-]* — 빌드번호 하이픈을 패턴이 못 잡아 라벨이 누적 오염되던 버그 수정.
  # ConeOne 1.0: 콘앱 라벨은 검수앱 버전이 아니라 콘앱 자체 버전(__CONEV, cone.html 단일 소스)에서 동기화.
  CONEVER=$(grep -oE "window.__CONEV='[^']*'" public/cone.html | head -1 | sed -E "s/.*'([^']*)'.*/\\1/")
  sed -i "s/(주)그린마린 · \(V[0-9.-]*\|ConeOne [0-9.-]*\)/(주)그린마린 · $CONEVER/" public/cone.html
  echo "✓ cone.html 화면 버전 → $CONEVER 동기화(콘앱 자체 버전)"
  # V8.98-05: 콘앱 카고플랜 모듈 캐시키(__APPV)도 버전과 동기화 — 고정값(C7.67)이라
  #   cone-cargoplan.js를 새로 배포해도 폰이 옛 번들을 캐시로 계속 쓰던 사고 방지.
  sed -i "s/window.__APPV='[^']*'/window.__APPV='$APPVER'/" public/cone.html
  echo "✓ cone.html 모듈 캐시키(__APPV) → $APPVER 동기화"
  # __CONEV(콘앱 화면 자동갱신 감지 키)도 동기화 — V8.46에 멈춰 폰이 새 cone.html을 감지 못 하던 문제.
  # ConeOne 1.0: __CONEV는 콘앱 자체 버전 단일 소스 — 검수앱 버전으로 덮지 않는다(콘앱 수정 시 수동으로 올림).
  echo "✓ cone.html 화면 갱신키(__CONEV) = $CONEVER (콘앱 단일 소스, 동기화 안 함)"
  # V9.05-03: README 버전도 동기화 — V8.09-03에 멈춰 있던 불일치 재발 방지.
  # TallyUni 0.5: 동기화 대상이 제목 → 버전 줄로 바뀌었다. README가 제품 소개문이 되면서
  #   제목은 제품명(TallyOne Universal)으로 고정하고, 판 번호는 바로 아래 인용 줄 하나가 단일 표시점이다.
  #   (옛 sed는 '# TallyOne...'을 통째로 갈아엎어 새 제목을 매 빌드마다 깨뜨렸다.)
  sed -i "s|^> \*\*현재 버전\*\* · .*|> **현재 버전** · $APPVER|" README.md
  if ! grep -q "^> \*\*현재 버전\*\* · $APPVER$" README.md; then
    echo "✗ README.md 버전 줄 동기화 실패 — '> **현재 버전** · …' 줄이 있는지 확인"
    exit 1
  fi
  echo "✓ README.md 버전 줄 → $APPVER 동기화"
  # V9.07-05 정리: 벌크탤리 버전 라벨도 동기화 — 이전엔 버전 문자열 자체가 없어
  #   벌크탤리만 "언제 판인지" 알 수 없었다(지침서에 '2026-06-12판'으로 방치).
  sed -i "s/<meta name=\"app-version\" content=\"(주)그린마린 · [^\"]*\">/<meta name=\"app-version\" content=\"(주)그린마린 · $APPVER\">/" bulk_tally.html
  echo "✓ bulk_tally.html 버전 라벨 → $APPVER 동기화"
  # V9.07-05 정리: 통합지침서는 최신 1개만 남긴다 — 누적 재발(저장소 48개·드라이브 28개) 원천 차단.
  KEEPGUIDE="평택항_검수_통합지침서_3앱통합본_$APPVER.md"
  if [ -f "$KEEPGUIDE" ]; then
    find . -maxdepth 1 -name '평택항_검수_통합지침서_3앱통합본_V*.md' ! -name "$KEEPGUIDE" -delete
    echo "✓ 구버전 통합지침서 정리 — $KEEPGUIDE 만 유지"
  else
    echo "⚠ $KEEPGUIDE 없음 — 지침서 파일명 버전을 APP_VERSION에 맞춰 갱신할 것"
  fi
  # V9.07-05 정리: 한글 파일명이 '#Uxxxx'로 깨진 채 커밋된 사본 제거(정상 파일과 중복된 낡은 사본).
  find . -maxdepth 2 -name '*#U*' -not -path './.git/*' -delete 2>/dev/null && echo "✓ 깨진 파일명(#Uxxxx) 정리"
else
  echo "⚠ APP_VERSION 추출 실패 — sw.js 수동 확인 필요"
fi

echo "[1/6] 옛 빌드 산출물 / vite 캐시 제거..."
rm -rf dist assets node_modules/.vite

echo "[2/6] 의존성 확인..."
[ ! -d node_modules ] && npm install --silent

# M6.94.5: vite build는 root index.html을 진입점으로 사용.
# 운영용 root index.html은 빌드본 (./assets/index-XXX.js 참조)이라
# vite가 이미 삭제된 옛 해시 파일을 import하려다 빌드 실패함.
# 해결: 빌드 직전에 진입 소스형 _index.entry.html을 root로 임시 복사.
# 빌드 후 dist/index.html (vite 생성 빌드본)을 root로 복원.
echo "[3/6] 빌드 직전: 진입 소스형으로 임시 교체..."
[ -f index.html ] && cp index.html index.html.production.bak
if [ ! -f _index.entry.html ]; then
  echo "✗ _index.entry.html 없음 — 진입 소스형 파일 누락"
  exit 1
fi
cp _index.entry.html index.html

echo "[4/6] vite build..."
npx vite build

echo "[5/6] dist → root 복사 (assets + index.html 모두)..."
cp -r dist/assets ./
cp dist/index.html ./
# V9.19-02: 마감 텔리 템플릿도 루트로 — Pages는 두 워크플로(Actions dist / 브랜치 루트)가
#   경합해 마지막에 끝난 쪽이 서빙된다(2026-07-28 실측). 루트·dist 양쪽 다 완전해야 한다.
[ -d dist/tally_templates ] && rm -rf ./tally_templates && cp -r dist/tally_templates ./
# TallyUni 0.9-01: 기본 선박 사전 씨앗은 이 빌드가 다루지 않는다(0.9 의 seed/ 복사·검증 삭제 확정).
#   회사가 배를 재서 만든 자산이라 공개 저장소·공개 사이트(Pages)에 실을 수 없다는 검수사 확정에 따라
#   ① 저장소·dist·public 어디에도 두지 않고 ② 앱은 사람이 고른 파일을 읽는다(src/bayDictSeed.js).
#   씨앗 보관: C:\TALLYTEST\_baydict_seed\ 와 드라이브 CLAUDE_SHARED\사전시드_비공개\ (저장소 밖).
#   재생성: node tools/make_baydict_seed.cjs --out <저장소 밖 경로>
if [ -e seed ] || [ -e public/seed ] || [ -e dist/seed ]; then
  echo "✗ seed/ 가 저장소 안에 있다 — 사전 씨앗은 저장소 밖에 둔다(0.9-01 보안 확정). 지우고 다시 빌드할 것"
  exit 1
fi
# 콘앱(독립 파일): dist의 cone.html을 루트로 복사 (Pages가 루트 서빙). 검수앱과 무관.
[ -f dist/cone.html ] && cp dist/cone.html ./
# V7.46: 콘앱용 본체 카고플랜 V2 번들 — 같은 소스(PrintableCargoPlanV2+cargoPlanCore+사전)를 React째 번들
echo "[+] 콘앱 카고플랜 V2 번들 생성 (cone-cargoplan.js)..."
node_modules/.bin/esbuild src/coneCargoPlan.entry.jsx --bundle --outfile=public/cone-cargoplan.js \
  --format=iife --loader:.js=jsx --jsx=automatic --define:process.env.NODE_ENV='"production"' --minify --target=es2017 --log-level=error
cp public/cone-cargoplan.js dist/ 2>/dev/null || true
cp public/cone-cargoplan.js ./
echo "✓ cone-cargoplan.js 생성·복사 ($(du -h public/cone-cargoplan.js | cut -f1))" 
# M7.18b: sw.js·manifest도 루트로 복사. 이게 빠져서 루트 sw.js가 V7.13에 멈춰
#   새 배포해도 캐시 무효화가 안 되던 문제 해결. 서비스워커 버전 갱신은 루트 sw.js 기준.
[ -f dist/sw.js ] && cp dist/sw.js ./ && echo "  ✓ 루트 sw.js 갱신 (캐시 무효화 반영)"
[ -f dist/manifest.webmanifest ] && cp dist/manifest.webmanifest ./

echo "[6/6] 검증..."
JSFILE=$(ls assets/index-*.js 2>/dev/null | head -1)
if [ -z "$JSFILE" ]; then
  echo "✗ assets/index-*.js 없음 - 빌드 실패"
  exit 1
fi
echo "✓ 빌드 산출물: $JSFILE"

# 루트 index.html이 빌드본인지 확인
if ! grep -q '\./assets/index-' index.html; then
  echo "✗ 루트 index.html이 빌드본 아님 — production에서 작동 안 함"
  exit 1
fi
if grep -q '/src/main.jsx' index.html; then
  echo "✗ 루트 index.html에 소스형 진입점이 남아있음"
  exit 1
fi
echo "✓ 루트 index.html: 빌드본 (./assets/index-XXX.js 참조, production 작동)"

# 루트 index.html이 참조하는 해시 파일이 실제 assets/에 존재하는지
# M6.94.5: grep을 script/link 태그 안으로 한정. 주석 안 placeholder 매칭 방지.
REFJS=$(grep -oE '<script[^>]*src="\./assets/index-[a-zA-Z0-9_-]+\.js"' index.html | grep -oE 'assets/index-[a-zA-Z0-9_-]+\.js' | head -1)
REFCSS=$(grep -oE '<link[^>]*href="\./assets/index-[a-zA-Z0-9_-]+\.css"' index.html | grep -oE 'assets/index-[a-zA-Z0-9_-]+\.css' | head -1)
if [ ! -f "$REFJS" ]; then
  echo "✗ 참조 $REFJS 가 실제 파일 없음"
  exit 1
fi
if [ ! -f "$REFCSS" ]; then
  echo "✗ 참조 $REFCSS 가 실제 파일 없음"
  exit 1
fi
echo "✓ 루트 참조 파일 존재 확인: $REFJS, $REFCSS"

# (보안 보류 2026-08-06) 씨앗 검증 중단 — 사전 씨앗은 공개 저장소·공개 사이트에 싣지 않는다.
# 비공개 전달 방식(로컬 파일 가져오기 등) 확정 후 그 경로에 맞는 검증으로 되살린다.
echo "✓ 사전 씨앗 검증 생략(공개 배포 금지 보류 중)"

# V9.23-06: 렌더 연막검사 — 실제로 한 번 그려 본다.
#   빌드 성공·번들 grep 통과에도 앱이 죽은 사고(hidden→issues TDZ)를 겪었다.
echo "[+] 렌더 연막검사 (BayGridEditor)..."
SMOKE_OUT=$(mktemp /tmp/_smoke_XXXXXX.js)   # V9.24: 고정 경로가 타 세션 잔재(권한 다른 uid)와 충돌해 검사가 통째로 건너뛰어졌다
if npx esbuild tools/smoke_entry.jsx --bundle --loader:.jsx=jsx --jsx=automatic \
     --outfile="$SMOKE_OUT" --define:process.env.NODE_ENV='"development"' --log-level=error; then
  node tools/smoke_render.cjs "$SMOKE_OUT" || { echo "✗ 렌더 연막검사 실패 — 배포 금지"; exit 1; }
  SMOKE_BP=$(mktemp /tmp/_smokebp_XXXXXX.js)
  if npx esbuild tools/smoke_bayplan.jsx --bundle --loader:.jsx=jsx --jsx=automatic \
       --outfile="$SMOKE_BP" --define:process.env.NODE_ENV='"development"' --log-level=error; then
    node tools/smoke_bayplan.cjs "$SMOKE_BP" || { echo "✗ BayPlan 연막검사 실패 — 배포 금지"; exit 1; }
  else
    echo "⚠ BayPlan 연막 번들 실패 — 건너뜀"
  fi
else
  echo "⚠ 연막검사 번들 실패 — 건너뜀"
fi

# M6.94.5: 빌드된 JS 안에 APP_VERSION 문자열이 박혀있는지 검증.
# 이전 실패 (M6.94.5 0건): vite 캐시 문제로 옛 코드가 번들에 들어감.
# 매 빌드마다 src/utils.js의 APP_VERSION을 자동 추출해 빌드 산출물에서 grep.
VERSION=$(grep -E "^export const APP_VERSION" src/utils.js | sed -E "s/.*=\s*['\"]([^'\"]+)['\"].*/\1/")
if [ -n "$VERSION" ]; then
  VCOUNT=$(grep -c "$VERSION" "$JSFILE" 2>/dev/null || echo 0)
  if [ "$VCOUNT" -eq 0 ]; then
    echo "✗ 빌드된 JS에 APP_VERSION ($VERSION) 0건 — 캐시 문제 또는 빌드 누락"
    exit 1
  fi
  echo "✓ 빌드된 JS에 APP_VERSION ($VERSION) $VCOUNT건 박힘"
fi

echo ""
echo "ZIP 패키징 가능 상태 (옛 M6.71 흐름과 동일 구조)."
