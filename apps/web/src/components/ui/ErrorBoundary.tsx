
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center text-[var(--color-text-primary)] rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] m-6">
          <div className="p-3 bg-red-100 rounded-full mb-3 text-red-600">
             <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-semibold mb-1">Something went wrong</h2>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mb-4">
             An error occurred in the board or network connection. Your changes may not be saved.
          </p>
          <pre className="text-xs bg-black/5 p-2 rounded mb-4 overflow-x-auto max-w-full text-left font-mono">
            {this.state.error?.message}
          </pre>
          <button
             onClick={() => this.setState({ hasError: false, error: null })}
             className="px-4 py-2 bg-[var(--color-brand-600)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-brand-700)] transition-colors"
          >
            Reload Board
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
