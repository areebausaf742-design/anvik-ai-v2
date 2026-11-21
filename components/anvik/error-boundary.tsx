"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = {
  children: ReactNode;
  title?: string;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "Something went wrong while rendering this view.",
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center bg-[#050508] px-4 py-12 text-slate-100">
          <div className="glass-card w-full max-w-md rounded-2xl p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold text-white">
              {this.props.title ?? "This view hit an unexpected error"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">{this.state.message}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: "" })}
                className="btn-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
              >
                <RotateCcw className="h-4 w-4" /> Retry
              </button>
              <Link
                href="/chat"
                className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                Back to Chat
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
