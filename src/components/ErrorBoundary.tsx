import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCache = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('e2ee_'))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.error('Clear cache failed:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-lg font-medium text-gray-800 mb-2">应用出错了</h1>
            <p className="text-sm text-gray-500 mb-4">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleReload}
                className="w-full py-3 bg-[#2C5E4E] text-white rounded-lg text-sm font-medium hover:bg-[#1F4338]"
              >
                重新加载
              </button>
              <button
                onClick={this.handleClearCache}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                清除缓存并重试
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
