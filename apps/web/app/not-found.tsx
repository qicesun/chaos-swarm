import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center px-6 py-20">
      <div className="panel-strong w-full max-w-2xl rounded-[2rem] p-10 text-center">
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-[var(--muted)]">
          Chaos Swarm
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">This run drifted out of range.</h1>
        <p className="mt-4 text-lg leading-8 text-[var(--muted)]">
          The requested run or report is not in the active demo store. Start a new swarm to generate fresh telemetry.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/runs/new"
            className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
          >
            Launch a swarm
          </Link>
          <Link
            href="/"
            className="rounded-full border border-[var(--line)] px-6 py-3 text-sm font-semibold text-[var(--foreground)]"
          >
            Back to overview
          </Link>
        </div>
      </div>
    </main>
  );
}
