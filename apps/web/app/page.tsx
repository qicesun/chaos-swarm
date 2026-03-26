import Link from "next/link";
import { getDemoScenarios } from "@/lib/run-service";

const featureCards = [
  {
    title: "Hybrid browser reasoning",
    body: "Visual understanding drives decisions while DOM-grade execution stays available for stable automation later.",
  },
  {
    title: "Persona-driven stress",
    body: "Speedrunners, novices, and chaos agents produce differentiated hesitation, retries, and rage-click behavior.",
  },
  {
    title: "Report-first output",
    body: "Each swarm ends in EFI, funnel loss, failure clusters, and a replay-ready timeline instead of raw machine logs.",
  },
];

export default function Home() {
  const scenarios = getDemoScenarios();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
      <header className="panel-strong relative overflow-hidden rounded-[2rem] px-8 py-10 lg:px-12 lg:py-14">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top,_rgba(200,76,38,0.18),transparent_55%)] lg:block" />
        <div className="relative max-w-3xl">
          <p className="text-sm uppercase tracking-[0.35em] text-[var(--muted)]">Chaos Swarm</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em] text-[var(--foreground)] lg:text-7xl">
            Synthetic users. Real friction. Faster product truth.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Release a swarm of persona-shaped agents against public websites and inspect where confusion, delay,
            brittle forms, and misleading affordances turn into abandonment.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/runs/new"
              className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
            >
              Launch demo swarm
            </Link>
            <a
              href="https://github.com/qicesun/chaos-swarm"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--line)] px-6 py-3 text-sm font-semibold text-[var(--foreground)]"
            >
              View public repo
            </a>
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        {featureCards.map((card) => (
          <article key={card.title} className="panel rounded-[1.75rem] p-6">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Capability</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{card.title}</h2>
            <p className="mt-3 text-base leading-7 text-[var(--muted)]">{card.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="panel-strong rounded-[2rem] p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">First-wave targets</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Launch with stable public demos</h2>
            </div>
            <Link href="/runs/new" className="text-sm font-semibold text-[var(--accent)]">
              Configure run
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                className="rounded-[1.5rem] border border-[var(--line)] bg-white/55 p-5 transition hover:border-[var(--accent-soft)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">{scenario.siteLabel}</p>
                    <h3 className="mt-1 text-xl font-semibold">{scenario.name}</h3>
                  </div>
                  <span className="rounded-full bg-[rgba(200,76,38,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                    {scenario.frames.length} stages
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{scenario.description}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{scenario.targetUrl}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">MVP posture</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Cloud-first demo loop</h2>
          <ul className="mt-5 space-y-4 text-sm leading-7 text-[var(--muted)]">
            <li>No login gate in v1. Every page is optimized for investor-visible speed.</li>
            <li>Local Playwright execution is live now; Browserbase and Trigger.dev are the next scale upgrades.</li>
            <li>Supabase schema is already checked in, so persistence can switch from memory to Postgres cleanly.</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
