import { getDemoScenarios } from "@/lib/run-service";
import { RunComposer } from "./run-composer";

export default function NewRunPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 lg:px-10">
      <section className="panel-strong rounded-[2rem] px-8 py-10">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">Launch a swarm</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em]">Configure the first chaos run.</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--muted)]">
          Pick one of the seeded public targets, choose swarm size, and launch a live local Playwright swarm. This
          build streams progress in-memory now and can be promoted to Browserbase / Trigger.dev once cloud orchestration
          is wired in.
        </p>
      </section>

      <RunComposer scenarios={getDemoScenarios()} />
    </main>
  );
}
