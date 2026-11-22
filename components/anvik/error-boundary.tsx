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
        <div className="flex min-h-[60vh] items-center justify-center bg-white px-4 py-12 text-[#1A1A1A]">
          <div className="w-full max-w-md rounded-2xl border border-[#EDEDED] bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold text-[#1A1A1A]">
              {this.props.title ?? "This view hit an unexpected error"}
            </h2>
            <p className="mt-2 text-sm text-[#666666]">{this.state.message}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: "" })}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#333333]"
              >
                <RotateCcw className="h-4 w-4" /> Retry
              </button>
              <Link
                href="/chat"
                className="rounded-xl border border-[#EDEDED] bg-white px-5 py-2.5 text-sm font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
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
