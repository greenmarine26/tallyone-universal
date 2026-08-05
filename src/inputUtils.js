// V8.09-10: 모바일 키보드 입력 모드 헬퍼 (사용자 확정 2026-06-18)
//   - 이름(검수원): 한글 그대로 → 이 헬퍼 안 씀.
//   - 선박명(영문): 한글 제거 + 대문자.
//   - 그 외 전부(조회창·실번호·XRAY실·온도·개수 등): 숫자 패드.
//   세 앱(검수/콘/벌크) 공통 기준. 콘앱/벌크앱은 HTML이라 inputmode 속성 직접 사용.

// 한글(자모·완성형) 제거. 영문·숫자·기호 보존.
export function stripHangul(s) {
  return String(s || '').replace(/[\u3130-\u318F\uAC00-\uD7A3\u1100-\u11FF]/g, '');
}

// 선박명 등 영문 필드: 한글 제거 + 대문자.
export function toEnglishUpper(s) {
  return stripHangul(s).toUpperCase();
}

// 영문 필드 onChange 래퍼.  <input onChange={engChange(setVal)} {...ENG_INPUT_PROPS} />
export function engChange(setter) {
  return (e) => setter(toEnglishUpper(e.target.value));
}

// 영문 필드 키보드 유도 props.
export const ENG_INPUT_PROPS = {
  inputMode: 'text',
  autoCapitalize: 'characters',
  autoCorrect: 'off',
  autoComplete: 'off',
  spellCheck: false,
  lang: 'en',
};

// 숫자 패드 props — 조회창·실번호·개수 등.
export const NUM_INPUT_PROPS = {
  inputMode: 'numeric',
  autoComplete: 'off',
};

// 온도 등 음수·소수 가능 숫자 필드.
export const DECIMAL_INPUT_PROPS = {
  inputMode: 'decimal',
  autoComplete: 'off',
};
