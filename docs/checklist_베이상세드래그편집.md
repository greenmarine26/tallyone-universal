# 베이상세 드래그 편집 — 체크리스트 (수석 검수사용)

목표: 베이 클릭 → 2D 베이상세(카고플랜 BayBoxV2 1개 크게, 페어 trio) → 컨테이너를 마우스로
끌어 선적/취소. 새 로직 아님 — 기존 fbReassignContainerPosition(swap 포함)에 드래그 입력만.
3D 진입 제외(사용자 확정). 본질 = "끝자리 조회 후 키보드 선적/취소"를 마우스 드래그로.

- [ ] 1. cell↔cn 매핑 — computeBayRenderData 셀에 컨번호(cn) 부착 (현재 cn:null=드래그 식별 불가)
      검증: MCSN형 posMap으로 셀 cn 채워짐 + 끝자리 4자리 조회 일치 (합성/실데이터)
- [ ] 2. 베이상세 편집 모달 — BayBoxV2 크게 + 페어 trio + 임시창고(미배정 컨) 패널
      검증: puppeteer 렌더 PASS (큰 BayBoxV2·trio·임시창고 표시)
- [ ] 3. 단일 드래그 — 칸→임시창고 = reassign(cn,'','',''), 임시창고→칸 = reassign(cn,bay,row,tier)
      검증: 드롭 핸들러가 올바른 인자로 fbReassignContainerPosition 호출 (단위테스트)
- [ ] 4. rubber-band 영역 선택 — 사각 드래그로 범위 내 컨 일괄→임시창고 (selectionMode 확장)
      검증: 영역 좌표→셀 집합 정확
- [ ] 5. 진입점 — 베이 탭에서 베이 클릭/버튼 → 이 모달
      검증: 통합 렌더
- [ ] 6. 빌드(bash build.sh) + ZIP(지침서 구조) + 인계서/지침서 반영
