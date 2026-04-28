// src/components/islands/shared/IslandErrorBoundary.tsx
// Reusable error boundary for heavy interactive React islands.
// Catches render-time errors (WebGL context loss, lazy chunk-load failures,
// runtime exceptions) and shows a fallback instead of a white screen.
import { Component, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  onError?: (err: Error) => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class IslandErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
