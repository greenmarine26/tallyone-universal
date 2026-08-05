# Tallyman repo 정리 — 옛 빌드 산출물·핸드오프 문서 등 잔재 삭제 (V7.90-07 기준 차집합)
# 사용: 이 파일과 repo_cleanup_list.txt 를 로컬 repo 폴더(README.md 있는 곳)에 넣고 repo정리.bat 더블클릭
$ErrorActionPreference = 'SilentlyContinue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
if (-not (Test-Path 'src\utils.js')) {
  Write-Host '!! 이 폴더는 repo 루트가 아닙니다 (src\utils.js 없음). repo 폴더에 넣고 실행하세요.' -ForegroundColor Red
  Read-Host '엔터를 누르면 종료'; exit 1
}
$list = Get-Content -Path (Join-Path $here 'repo_cleanup_list.txt')
$exist = $list | Where-Object { Test-Path (Join-Path $here $_) }
Write-Host ("삭제 대상: {0}개 (목록 {1}개 중 현재 존재)" -f $exist.Count, $list.Count) -ForegroundColor Yellow
$ans = Read-Host '삭제를 진행할까요? (Y 입력)'
if ($ans -ne 'Y' -and $ans -ne 'y') { Write-Host '취소되었습니다.'; Read-Host '엔터'; exit 0 }
$n = 0
foreach ($f in $exist) { Remove-Item -LiteralPath (Join-Path $here $f) -Force; $n++ }
# 빈 폴더 정리 (individual 등)
Get-ChildItem -Path $here -Recurse -Directory | Where-Object { $_.FullName -notmatch '\\\.git(\\|$)' } |
  Sort-Object FullName -Descending |
  Where-Object { -not (Get-ChildItem $_.FullName -Force | Select-Object -First 1) } |
  Remove-Item -Force
Write-Host ("완료 — {0}개 삭제. 이제 GitHub Desktop에서 변경(삭제)을 커밋·푸시하세요." -f $n) -ForegroundColor Green
Read-Host '엔터를 누르면 종료'
