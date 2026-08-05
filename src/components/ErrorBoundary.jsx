// M4.9: ErrorBoundary - 컴포넌트 크래시를 격리해 전체 화면 사라짐 방지
//   사용 예: <ErrorBoundary name="베이상세"><PrintableBayDetail .../></ErrorBoundary>
//   에러 발생 시 fallback UI 표시 + 콘솔 에러 로그
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary:${this.props.name || 'unknown'}]`, error, errorInfo);
    this.setState({ errorInfo });
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      const name = this.props.name || '컴포넌트';
      const errMsg = this.state.error?.message || String(this.state.error || '알 수 없는 에러');
      return (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-red-700 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🚨</span>
              <h2 className="text-lg font-black text-red-300">{name} 크래시</h2>
            </div>
            <div className="bg-slate-950 border border-slate-700 rounded p-3 mb-3 max-h-48 overflow-y-auto">
              <div className="text-[11px] text-red-400 font-bold uppercase mb-1">에러 메시지</div>
              <div className="text-xs mono text-red-200 break-all">{errMsg}</div>
              {this.state.error?.stack && (
                <details className="mt-2">
                  <summary className="text-[10px] text-slate-400 cursor-pointer">스택 트레이스</summary>
                  <pre className="text-[9px] mono text-slate-500 mt-1 whitespace-pre-wrap break-all">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
            <div className="text-xs text-slate-300 mb-3">
              화면이 사라지지 않게 격리 처리했습니다. 닫고 다시 시도하거나, 에러 메시지를 개발자에게 전달해 주세요.
            </div>
            <div className="flex gap-2">
              {this.props.onClose && (
                <button onClick={() => { this.reset(); this.props.onClose(); }}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded">
                  닫기
                </button>
              )}
              <button onClick={this.reset}
                className="flex-1 py-2.5 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded">
                다시 시도
              </button>
              {/* V7.35: 루트 크래시용 — 다시 시도로 안 풀리면 앱 전체 새로고침 */}
              {this.props.reloadButton && (
                <button onClick={() => window.location.reload()}
                  className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded">
                  앱 새로고침
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
