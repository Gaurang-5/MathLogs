import { Component, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    isChunkError: boolean;
}

/**
 * Catches dynamic import failures caused by stale chunk hashes after a deploy.
 *
 * When Vite builds a new version, JS chunk filenames change (content-hash).
 * Users with an old tab open try to lazy-load the OLD hash → 404 → TypeError.
 * Solution: detect chunk-load errors and force a full page reload so the user
 * gets the new bundle. We set a sessionStorage flag to prevent reload loops.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, isChunkError: false };

    static getDerivedStateFromError(error: Error): State {
        const isChunkError =
            error.message.includes('Failed to fetch dynamically imported module') ||
            error.message.includes('Importing a module script failed') ||
            error.message.includes('error loading dynamically imported module');

        return { hasError: true, isChunkError };
    }

    componentDidCatch(error: Error) {
        if (!this.isChunkLoadError(error)) return;

        const RELOAD_KEY = 'chunk_error_reloaded';

        // Guard against infinite reload loops (e.g. server totally broken)
        if (sessionStorage.getItem(RELOAD_KEY)) return;

        sessionStorage.setItem(RELOAD_KEY, 'true');
        window.location.reload();
    }

    private isChunkLoadError(error: Error): boolean {
        return (
            error.message.includes('Failed to fetch dynamically imported module') ||
            error.message.includes('Importing a module script failed') ||
            error.message.includes('error loading dynamically imported module')
        );
    }

    render() {
        if (this.state.hasError && !this.state.isChunkError) {
            // For non-chunk errors, show a generic fallback UI
            return (
                <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-8">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Something went wrong
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm">
                        An unexpected error occurred. Please refresh the page.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800 transition-colors"
                    >
                        Refresh Page
                    </button>
                </div>
            );
        }

        // Chunk errors: show a brief "updating…" message while reload fires
        if (this.state.hasError && this.state.isChunkError) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                        Updating to the latest version…
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}
