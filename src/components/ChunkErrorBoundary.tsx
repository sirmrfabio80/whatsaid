import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/chunk-recovery";

type ChunkErrorBoundaryProps = {
  children: ReactNode;
};

type ChunkErrorBoundaryState = {
  error: unknown;
};

export class ChunkErrorBoundary extends Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  state: ChunkErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ChunkErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, _errorInfo: ErrorInfo) {
    reloadOnceForChunkError(error, { source: "boundary" });
  }

  render() {
    if (this.state.error) {
      if (!isChunkLoadError(this.state.error)) {
        throw this.state.error;
      }

      return (
        <section
          className="flex min-h-[60vh] items-center justify-center px-4 py-24"
          aria-live="assertive"
        >
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8 text-card-foreground shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle
                  className="h-7 w-7 text-destructive"
                  aria-hidden="true"
                />
              </div>

              <h1 className="text-xl font-semibold tracking-normal">
                Something went wrong loading this page
              </h1>

              <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
                The latest app files could not be loaded. This usually happens
                after an update. Try refreshing, or go back home.
              </p>

              <div className="mt-7 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </button>

                <a
                  href="/"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-input bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Home className="h-4 w-4" aria-hidden="true" />
                  Back to home
                </a>
              </div>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
