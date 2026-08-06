// TallyUni 0.9 시뮬 — 플랜편집기(단독본)의 사전 불러오기 게이트.
//   planedit.entry.jsx 는 스스로 #root 에 마운트하므로 별도 번들로 돌린다.
import { importUserDict } from '../src/planedit.entry.jsx';
const S = (window.__SIM = window.__SIM || {});
S.importUserDict = importUserDict;
