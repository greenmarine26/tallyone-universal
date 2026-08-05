@echo off
chcp 65001 >nul
cd /d "%~dp0"
(
echo === Tallyman V8.24 build (cmd, no bash) ===
echo --- node / npx 확인 ---
where node
where npx
node -v
echo --- [1] clean ---
rmdir /s /q dist 2>nul
rmdir /s /q assets 2>nul
echo --- [2] entry swap (소스형 index.html) ---
copy /y _index.entry.html index.html
echo --- [3] vite build ---
call npx --yes vite build
echo --- [4] dist 를 root 로 복사 ---
xcopy /e /i /y dist\assets assets
copy /y dist\index.html index.html
if exist dist\cone.html copy /y dist\cone.html cone.html
if exist dist\sw.js copy /y dist\sw.js sw.js
if exist dist\manifest.webmanifest copy /y dist\manifest.webmanifest manifest.webmanifest
echo --- [5] 결과 확인 ---
dir assets\index-*.js
findstr /C:"assets/index-" index.html
echo === DONE ===
) > build_log.txt 2>&1
echo 빌드 끝. build_log.txt 를 확인하세요.
type build_log.txt
echo.
echo (이 창은 닫으셔도 됩니다)
pause
