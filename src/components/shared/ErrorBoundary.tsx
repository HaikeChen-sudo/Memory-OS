"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: { componentStack: string }) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches unhandled render errors in the subtree.
 *
 * Without this, a single component crash can destroy the entire React tree
 * and leave the user staring at a blank page.
 *
 * Usage:
 *   <ErrorBoundary fallback={<p>Something broke</p>}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full flex-col items-center justify-center bg-[#E7E1D3] p-8 text-center text-[#12233A]">
          <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-[4px] bg-[#E85327] text-sm font-semibold text-[#12233A]">
            !
          </span>
          <p className="mb-1 text-sm font-medium">此组件遇到了问题</p>
          <p className="max-w-xs text-xs text-[#12233A]/58">
            {this.state.error?.message || "未知错误"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 rounded-[4px] bg-[#12233A] px-4 py-2 text-xs text-[#E7E1D3] transition-transform hover:-translate-y-0.5"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
