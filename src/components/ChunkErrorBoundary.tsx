import { Component, type ErrorInfo, type ReactNode } from "react";
import { reloadOnceForChunkError } from "@/lib/chunk-recovery";

type ChunkErrorBoundaryProps = {
  children: ReactNode;
};

type ChunkErrorBoundaryState = {
  failed: boolean;
};

export class ChunkErrorBoundary extends Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  state: ChunkErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(error: unknown): ChunkErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, _errorInfo: ErrorInfo) {
    reloadOnceForChunkError(error);
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="min-h-[50vh] px-4 py-24">
          <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h1 className="text-2xl font-semibold tracking-normal">Refresh needed</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This page could not load the latest app files. Refresh to continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Refresh page
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}