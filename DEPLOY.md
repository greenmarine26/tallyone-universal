# 배포 — 이 저장소를 건드리는 모든 클로드 필독

> **정본 전문**: 구글 드라이브 `CLAUDE_SHARED\★배포_표준절차_모든클로드_필독.md`
> 이 파일은 저장소만 보고 있는 클로드를 위한 **자립 요약**이다. 절차·판단은 이것만으로 충분하다.
> 개정 2026-07-26 (V9.07-01 배포 실측 반영)

## 0. 절대 원칙

- **배포는 클로드가 끝까지 직접 한다.** 아래 문장은 전부 금지다.
  "이제 git push 하시면 됩니다" · "ZIP 압축 푸신 뒤 덮어써 주세요" ·
  "명령어 드릴 테니 붙여넣으세요" · "권한만 열리면 제가 할 수 있습니다"
  사용자가 여러 번 교정한 사항이다. 사용자 개입은 1장의 모든 경로가 실제로 막혔을 때뿐이다.
- 작업 파일 정리도 클로드가 한다.
- 버전 문자열을 안 올리면 폰 서비스워커 캐시가 안 비워져 배포해도 화면이 그대로다.
- 루트 `index.html`은 반드시 빌드본이어야 한다. 소스형으로 두면 production 404.

## 0-A. 수정 전 3금지 / 수정 후 2필수 (사용자 확정 2026-08-01 — 최근 사고가 전부 여기서 났다)

**고치기 전 — 3금지**

1. ⛔ **호출부 안 보고 고치지 않는다.** 고칠 함수·상수를 저장소 전체 grep해 부르는 곳·복제본을 전부 나열한다.
   (`merge_all`만 고치고 같은 결함의 `merge_priority`를 놓쳐 반나절 막힘 — 2026-07-31)
2. ⛔ **특정 케이스 전용 로직을 공용 경로 앞단에 두지 않는다.** 게이트를 먼저 건다.
   (RZOR 전용 덱플랜 감지가 전 선박 업로드를 수 분씩 느리게 함 — V9.22→V9.31)
3. ⛔ **조용히 실패하는 코드를 만들지 않는다.** 새 `await`·동적 import·외부 요청·저장 호출은 실패가 화면/로그에 드러나야 하고, 외부 요청엔 타임아웃+대체 경로.
   (예외를 삼켜 "처리 중"에 멈춘 채 세 판을 헛되이 배포 — 2026-07-31)

**고친 뒤 — 2필수**

4. ✅ **파급 검증** — 배포 전/후 같은 기준표(항차별 EDI·records·완료 수 · 수집기 하트비트·autoreg 건수·사이클 시간)를 찍어 대조. 내가 **안 건드린 곳**이 변했는지 보는 그물.
5. ✅ **효과 확인** — 함수 반환값·로그 "완료"는 검증이 아니다. 결과 상태를 다시 읽어 확인(원본 사라짐+대상 존재 / 서버 되읽기 / 라이브 문자열).
   (정리 스크립트가 "32개 이동 완료"를 찍었지만 실제로는 30개가 그대로 — 2026-08-01)

**재현 우선** — 재현 가능한 증상은 코드 추리보다 재현이 먼저다. 재현 1판 > 추리 3판(실측).

## 0-B. 미완 이월 금지 · 답을 아는 질문 금지 (사용자 확정 2026-08-01 — 절대)

- 🔴 **그날 할 일은 그날 끝낸다.** 원인을 알고 수정 지점까지 특정했으면 그 세션에서 수정·검증·배포까지 간다. 한 번 미루면 사용자가 다시 설명하고, 클로드가 다시 찾고, 같은 검증을 다시 한다 — **한 번 미루면 세 번 일한다.** 이월 가능한 것은 사용자가 미루라고 한 것과 사용자 결정 대기뿐.
- 🔴 **답을 아는 질문은 하지 않는다.** 데이터로 알 수 있는 것·이미 답을 받은 것·"진행할까요?" 류 승인 요청은 질문이 아니라 지연이다. 되돌릴 수 없는 행위(삭제·발송·과금·외부 게시)만 확인받고 나머지는 보수적으로 정해 진행 후 보고한다.
- 🔴 **한 판에 하나** — 급한 수리와 신규 기능을 같은 판에 섞지 않는다. 섞으면 파급 검증이 무의미해진다.

---

## 1. 방법 판단 (여기서 갈라진다 — 고르지 말고 따른다)

| 내 세션에 있는 것 | 방법 |
|---|---|
| bash + 마운트된 `C:\TALLYTEST` + computer-use | **A. 커밋 배치 (정본)** — 3장 |
| Chrome 확장만 (로컬 파일 접근 없음) | B. 브라우저 업로드 (`/upload/main/<경로>`, 커밋 버튼은 좌표 클릭) |
| Chrome 확장인데 file_upload 거부됨 | C. 바이트 패치 주입 (raw fetch → sha 검증 → DataTransfer 주입) |

A가 되면 무조건 A다. **코워크 샌드박스의 git에는 push 자격증명이 없다**(실측). 클론만 된다.
A는 사용자 PC의 GitHub Desktop git을 배치파일로 돌리는 방식이다.

## 2. 완료의 정의 (비협상 — 전부 통과해야 "완료")

1. 실데이터 시뮬 PASS (추론 금지)  2. `bash build.sh` 성공  3. 번들 grep으로 새 문자열·APP_VERSION 확인
4. push 로그에 `xxxxxxx..yyyyyyy  main -> main`  5. 라이브 `sw.js?v=캐시버스터`의 VERSION 확인
   ⚠ **라이브 번들 해시는 저장소와 다르다** — Pages는 Actions(`.github/workflows/deploy.yml`)가 `npm run build`한 `./dist`를 배포한다.
   라이브 검증은 해시 대조가 아니라 **sw.js VERSION · 캐시명(`tallyman-Vx.xx`) · 번들 내 새 문자열**로 한다 (V9.10 실측: 저장소 `CJrBNLX3` ≠ 라이브 `Bm2YSPZD`).
+ blob 해시 전수 대조 권장 (`git rev-parse origin/main:<파일>` vs `git hash-object <검증본>`)

## 3. 방법 A 절차

1. **VM 내부**(`/tmp/repo`)에 클론해 수정·빌드한다. ⚠ 마운트 폴더에서 git 실행 금지 (4장 1번).
2. `src/utils.js`의 `APP_VERSION`을 올린다 (단일 소스). 기능=마이너 두 자리 / 픽스=빌드번호. 언더스코어 금지.
3. `bash build.sh` (npm run build 직접 호출 금지).
4. 변경 목록에서 **삭제분(`^ D`)은 제외**한다 — 옛 해시 assets는 지우지 않는다(누적 무해).
5. payload tgz는 `./` 접두사·디렉터리 엔트리 없이 파일만 (`tar -czf out.tgz --no-recursion -T list`).
6. **한글 파일명은 tar에 안 태운다.** 워킹카피에 직접 복사 → `reset --hard`가 안 지우므로 `add -A`가 잡는다.
7. bat 작성 후 **CRLF 변환 필수** (`sed -i 's/$/\r/'`). 커밋 메시지는 영문 (코드페이지).
8. 실행은 computer-use `open_application("실행")` → 입력칸 클릭 ×2 → `ctrl+a` → `Delete` → 경로 타이핑 → zoom 확인 → Enter.
   ⚠ `triple_click`으로는 기존 텍스트가 안 지워진다(실측, 경로 깨짐).

```bat
@echo off
set LOG=C:\TALLYTEST\_vXXXXX_commit_log.txt
set GIT=git
for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%D\resources\app\git\cmd\git.exe" set GIT=%%D\resources\app\git\cmd\git.exe
echo GIT=%GIT% > %LOG%
set REPO=C:\TALLYTEST\_v90604_repo
if not exist %REPO% "%GIT%" clone --depth 1 https://github.com/greenmarine26/greenmarinetally.git %REPO% >> %LOG% 2>&1
cd /d %REPO%
if exist "%REPO%\.git\index.lock" del /f /q "%REPO%\.git\index.lock" >> %LOG% 2>&1
"%GIT%" fetch origin >> %LOG% 2>&1
"%GIT%" reset --hard origin/main >> %LOG% 2>&1
tar -xzf C:\TALLYTEST\_vXXXXX_payload.tgz >> %LOG% 2>&1
"%GIT%" add -A >> %LOG% 2>&1
"%GIT%" -c user.name=greenmarine26 -c user.email=yjkim1313@gmail.com commit -m "Vx.xx <english summary>" >> %LOG% 2>&1
"%GIT%" push origin main >> %LOG% 2>&1
echo ---LOG---- >> %LOG%
"%GIT%" log --oneline -3 >> %LOG% 2>&1
echo ---STATUS---- >> %LOG%
"%GIT%" status --short >> %LOG% 2>&1
echo DONE %DATE% %TIME% >> %LOG%
```

## 4. 함정 (전부 실측)

1. **마운트 폴더에서 샌드박스 git 실행 금지** — 삭제 권한이 없어 `.git/index.lock`이 남고 안 지워진다.
   이후 모든 git이 "Another git process seems to be running"으로 죽는다(V9.07 첫 커밋 통째 실패).
2. `build.sh`의 `rm`이 마운트에서 실패한다 → VM 내부 사본에서 빌드하고 산출물만 되가져온다.
3. bat는 CRLF 아니면 실행조차 안 된다.
4. 한글 파일명 tar 추출 시 "Invalid empty pathname". 지워야 할 땐 ASCII 와일드카드로.
   `powershell -NoProfile -Command "Get-ChildItem -Filter '*_V9.07.md' | Remove-Item -Force"`
5. **큰 base64를 클로드가 직접 옮기지 말 것** — V8.85에서 두 번 다 글자 유실로 훼손됐다.
   4.2MB ZIP은 base64로 약 139만 토큰이라 애초에 컨텍스트를 통과할 수 없다.
6. `.gitignore`가 없으면 `add -A`가 node_modules 19,027개를 쓸어담는다 (V9.07에서 신설).
7. 컨테이너에서 github.io로 curl 불가(HTTP 000). **⚠ Chrome MCP로 라이브 확인 금지 (2026-07-31 사용자 지시)** —
   수집기가 CDP(9222)로 전용 크롬(tallyman-chrome 프로필)을 조종하는데, 클로드의 크롬 탭 조작이 수집기를
   멈추게 한다(사용자 실측). 크롬 없는 검증 체계: ① blob 전수 대조(저장소 진실) ② `web_fetch`로
   `raw.githubusercontent.com/.../main/sw.js?v=캐시버스터` VERSION 확인(text/plain이라 읽힘 — github.io는 [binary]로 안 읽힘)
   ③ 최종 라이브는 사용자 폰 버전 라벨. 크롬이 꼭 필요한 검증은 사용자 승인 후 최소한으로.
8. 샌드박스에 Chromium 설치 불가(dl.google.com 차단). CSS·렌더 검증은 사용자 Chrome에서 `getComputedStyle`.
9. `raw.githubusercontent`는 CDN이 낡다 — **커밋 목록이 진실**. raw 검증 시 `?v=` 필수.
10. `Edit` 도구는 대형 파일을 조용히 자를 수 있다 — 대형 jsx는 python 치환 + 치환 횟수 assert.

## 5. 배포 후 인계 (여기까지가 완료)

1. 누적 ZIP — 전체 소스+dist+build.sh+통합지침서+README. 부분 ZIP 금지.
   최상위 폴더 하나(`Tallyman_Master_Vx.xx/`), `node_modules`·`.git` 제외.
   위치 `Downloads\Tallyman_Master_Vx.xx.zip` (+`C:\TALLYTEST` 사본).
2. 통합지침서 갱신 — 파일명 버전과 최상단 "최종 버전" 줄을 함께 바꾸고 이번 판 이력 append. 옛 버전 파일은 삭제.
3. 드라이브 정본 문서의 배포 이력에 한 줄 추가.

## 6. 이 저장소 밖

| 대상 | 배포 |
|---|---|
| 콘앱 `cone.html` · 벌크탤리 | **같은 저장소** — 위 절차 그대로 |
| TWA APK | PC에서 `C:\TALLYTEST\_twa_build.bat`. `greenmarine26.github.io` 리포에 커밋 → `/tally.apk` `/cone.apk`. 웹 배포만으로 내용은 자동 반영되므로 재배포는 아이콘·버전 변경 시만 |
| 수집기 TallymanMailCollector | PC 로컬 프로그램. GitHub 배포 아님 |
