# Chaos Swarm Whitepaper

## Executive Summary

Chaos Swarm is a cloud-native synthetic user swarm engine for browser-based experience stress testing. It simulates many independent agents, each with a persona, attention profile, and frustration state, and runs them against real web applications using visual understanding plus stable browser controls. The goal is not to replace QA automation or load testing. The goal is to expose friction that real users experience but scripts usually miss: ambiguous labels, hidden controls, blocked flows, slow transitions, error recovery failures, and UI states that collapse under non-linear behavior.

The core output is an experience diagnosis package rather than a raw log stream. A run produces a friction heatmap, a persona-sliced drop-off funnel, annotated failure clips, and a synthetic Experience Friction Index. These artifacts are designed for product teams, design teams, and founders who need a fast read on where a flow breaks and why.

## Problem Statement

Traditional automation is optimized for deterministic paths. It can tell you whether a button works when clicked exactly as expected, but it does not tell you what happens when a user hesitates, misreads the page, clicks the wrong thing, scrolls erratically, retries after an error, or gives up after a delay. Human usability research can capture those signals, but it is slow, expensive, and hard to scale.

Chaos Swarm addresses the gap between those two extremes. It creates a controllable population of synthetic users that can behave differently under the same page state. Some agents are goal-driven and fast. Some are patient but distracted. Some are brittle and react badly to friction. By observing how these agents diverge, the system surfaces design issues that are usually invisible in standard test automation.

## Product Scope

### In Scope

- Desktop web applications
- Real browser rendering and interaction
- Visual page understanding
- Persona-driven agent behavior
- Interaction telemetry and replayable artifacts
- Demo and pre-production environments

### Out of Scope

- Native mobile apps
- Physical device control
- Backend throughput or DDoS-style testing
- Automatic code repair
- Full enterprise governance in the MVP

## Core Concepts

### Synthetic User

A synthetic user is an agent with:

- A persona archetype
- A task goal
- A frustration state
- A confidence state
- A short-term memory of recent observations and failures

### Persona Matrix

The MVP uses three default archetypes:

- `Speedrunner`: high skill, low patience, task-first behavior
- `Novice`: lower skill, higher patience, visually distracted behavior
- `ChaosAgent`: medium skill, very low patience, high error amplification

The point of the persona matrix is not realism in the abstract. The point is to create structured behavioral variance so that the same UI can be exercised under different pressure patterns.

### Experience Friction Index

The Experience Friction Index (EFI) is a synthetic score derived from repeated hesitation, retries, rage clicks, dead ends, and abandonment. It is not intended to be a universal UX metric. It is a comparative signal that helps teams rank the parts of a flow most likely to frustrate users.

## System Principles

1. Visual understanding comes first. The agent should reason about what is on the screen, not only what the DOM exposes.
2. Stable execution comes from browser-native locators, keyboard input, and controlled mouse actions. Pure pixel clicking is a fallback.
3. Every meaningful action must be observable. If the system cannot explain why a step was taken, it should not claim success.
4. The platform must stay modular. Models, browser providers, storage, and report renderers must be replaceable.
5. The MVP should optimize for speed of validation, not for perfect generality.

## Experience Model

Each agent runs a loop:

1. Perceive the page through screenshots, viewport metadata, and candidate UI targets.
2. Evaluate whether the current page state supports the task goal.
3. Update emotional state based on delays, errors, uncertainty, and progress.
4. Act using the most stable interaction method available.

The loop is intentionally hybrid. Visual inputs capture layout, hierarchy, occlusion, and perceived affordance. DOM and accessibility data improve grounding and make execution reliable. This is the right tradeoff for a system that must explain user friction and still complete browser flows at scale.

## Output Artifacts

### Friction Heatmap

A page-level aggregate of hesitation, error, and rage-click coordinates. The heatmap shows where friction concentrates visually.

### Drop-off Funnel

A stage-by-stage view of where synthetic users abandon the flow, with persona segmentation.

### Failure Highlight Reel

Short annotated clips of the most important breakdowns, paired with first-person agent commentary.

### Narrative Summary

A concise explanation of the dominant failure modes observed in the run.

## Safety And Boundaries

Chaos Swarm is a browser experience testing tool, not a load generator and not a bypass tool. The intended use is authorized testing of sites you own, operate, or are explicitly allowed to evaluate. The system should respect domain allowlists, store credentials carefully when needed, and avoid scraping or interacting with targets outside the declared scope.

## MVP Roadmap

## Current State Snapshot

As of March 25, 2026, the project has moved beyond a fake scripted shell:

- Public runs are created from a real deployed web app.
- The active runtime uses real browser sessions and real page state.
- Custom `URL + goal` intake can be AI-compiled into a temporary scenario profile.
- Per-step action choice is model-driven.
- Per-step completion and stage interpretation are model-driven.
- Run and report surfaces now render bilingual founder-facing summaries.

What is still not fully AI-native yet:

- Candidate extraction still uses deterministic browser heuristics before the model sees the page.
- Aggregate funneling, EFI scoring, and failure clustering are still largely rule-based.
- Built-in demo scenarios still start from hand-authored scenario definitions.
- Persona calibration is still partly parameterized rather than fully learned or synthesized.

### Phase 1

- Public demo web app
- Cloud browser execution
- Persona-driven agent loop
- Basic telemetry and artifact generation
- Demo runs on public test sites

### Phase 1.5

- Better persona calibration
- Multi-step replay and richer annotations
- Login-aware flows for authorized environments
- More stable failure clustering

### Phase 2

- Larger swarm sizes
- CI and staging integration
- More advanced attribution and diagnostics
- Organization-level reporting and collaboration

## Design Tradeoffs

The MVP deliberately trades absolute realism for operational usefulness. It does not attempt to perfectly model human cognition. It attempts to produce enough behavioral diversity to expose friction quickly, at a cost and latency profile that makes repeated runs practical.

That tradeoff favors cloud browsers, structured telemetry, and strong observability. It also favors a hybrid browser control model over pure vision or pure DOM automation. The system should look like a high-signal product diagnosis engine, not a generic bot runner.

## Near-Term AI-Native Priorities

The next layer of work should remove the remaining deterministic islands in this order:

1. AI-first scenario intake from arbitrary `URL + goal`, with less hand-authored stage scaffolding.
2. AI-driven stage segmentation and funnel boundary detection across runs.
3. AI-driven failure attribution that distinguishes product friction from runtime noise.
4. Richer persona synthesis so different synthetic users diverge more naturally.
5. More visual-first candidate understanding, while keeping transparent reporting on when DOM recovery was needed.
