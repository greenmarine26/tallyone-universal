// TallyUni 0.9 시뮬 전용 — pdfjs-dist 대역. 이 판의 경로는 PDF 를 열지 않는다.
export const GlobalWorkerOptions = { workerSrc: '' };
export function getDocument() { throw new Error('시뮬: PDF 미사용'); }
export const version = 'sim';
