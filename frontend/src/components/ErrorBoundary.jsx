import { Component } from "react";
import * as Sentry from "@sentry/react";

/** Top-level render-error catcher. Without this, a single component throw
 *  blanks the entire app with a white screen instead of a recoverable card. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bone px-6">
          <div className="max-w-sm w-full text-center space-y-4 shadow-card border border-line rounded-2xl bg-white p-8">
            <div className="text-card-title font-display font-semibold">Something went wrong</div>
            <p className="text-body text-ink-muted">
              This page hit an unexpected error. Reloading usually fixes it — if it keeps
              happening, contact support.
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary w-full justify-center">
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
