"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; title?: string };

type State = { hasError: boolean; message: string | null };

export class CrmErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message ?? "Σφάλμα" };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[CrmErrorBoundary]", err, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm text-[var(--text-primary)]">
          <p className="font-semibold">{this.props.title ?? "Κάτι πήγε στραβά."}</p>
          <p className="mt-2 text-[var(--text-secondary)]">Ανανεώστε τη σελίδα. Αν το πρόβλημα συνεχίζεται, επικοινωνήστε με τη διαχείριση.</p>
          {this.state.message ? <p className="mt-3 font-mono text-xs text-red-500/80">{this.state.message}</p> : null}
          <button
            type="button"
            className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium"
            onClick={() => this.setState({ hasError: false, message: null })}
          >
            Ξανά
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
