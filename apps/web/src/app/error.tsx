"use client";

export default function StorefrontError({ reset }: { readonly reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-text-muted">
        Website unavailable
      </p>
      <h1 className="font-heading text-3xl font-semibold text-text">
        This website cannot be served right now.
      </h1>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-action px-4 py-2 text-sm font-medium text-on-action hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Try again
      </button>
    </main>
  );
}
