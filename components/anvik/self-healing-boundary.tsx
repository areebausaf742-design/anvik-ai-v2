"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode; route?: string };

type State = { hasError: boolean; error: Error | null };

export class SelfHealingBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      const payload = {
        signature: `${this.props.route ?? "ui"}:${error.name}:${error.message}`.slice(0, 200),
        severity: "error",
        route: this.props.route ?? (typeof window !== "undefined" ? window.location.pathname : ""),
        message: error.message,
        stack: (error.stack ?? "") + "\n" + (info.componentStack ?? ""),
      };
      void fetch("/api/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // never throw from boundary
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert" style={{ padding: 16 }}>
            <p>Something went wrong. ANVIK recovered your input.</p>
            <button onClick={this.reset} type="button">
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default SelfHealingBoundary;
