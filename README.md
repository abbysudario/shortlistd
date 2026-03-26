# 🎯 Shortlistd

> A personal job search automation engine that fetches listings daily, scores them against a resume using AI, and surfaces only the matches worth looking at.

---

## 🚦 Build Status

> This project is actively in progress. The table below reflects the current state of the build.

| Phase | Status | Description |
|---|---|---|
| Phase 0 — README | ✅ Complete | Architecture decisions, problem statement, project foundation |
| Phase 1 — MVP | 🔨 In Progress | Fetchers, AI scoring, Supabase storage, HTML dashboard, GitHub Actions cron |
| Phase 2 — Enhanced Dashboard | ⏳ Planned | React/Vite dashboard, application pipeline, webhook trigger |

---

## 🧭 The Problem

Job searching at the senior level is a volume problem disguised as a quality problem.

The listings exist. They're posted on Greenhouse, Ashby, Lever, and SmartRecruiters every day. The signal is there, it's just buried under roles that are close but wrong, postings that reuse the same keywords but want something entirely different, and duplicates across aggregator sites that create the illusion of more opportunity than actually exists.

The current manual workflow looks like this: open LinkedIn, open Indeed, scan titles, click through, read the full description, realize it's a contract role, or needs 3 years of Java, or is actually a junior position rebranded as "senior." Close the tab. Repeat. An hour later, two or three tabs are open that might be worth applying to.

That's not a sustainable process at volume. The filtering work is something a language model can do in milliseconds for a fraction of a cent. Does this job match my background? Answered automatically, at scale, every day.

Shortlistd replaces the manual filter layer. It runs daily, fetches listings directly from the four ATS platforms (not aggregators), scores each one against a fixed resume baseline, and shows only the matches above 75%. The result: a clean dashboard with a short list of roles that are actually worth reading.

---

## 🚫 What This Is Not

Shortlistd does not apply to jobs. It does not write cover letters. It does not send emails.

The application layer lives in **Aligned**, a separate project with a tuned 11-step framework for generating complete application packages using the Anthropic API. That system already works. Shortlistd feeds it.

The handoff is intentionally manual in Phase 1: Shortlistd surfaces the matches, I pick the ones worth pursuing, drop the posting into Aligned, and run the package from there. This separation keeps both tools focused and avoids rebuilding what already works.

---

## 🏗️ Architecture at a Glance

```
GitHub Actions (cron: daily)
        │
        ▼
   Fetcher Modules
   ├── greenhouse.ts    → normalizes Greenhouse API response
   ├── ashby.ts         → normalizes Ashby API response
   ├── lever.ts         → normalizes Lever API response
   └── smartrecruiters.ts → normalizes SmartRecruiters API response
        │
        ▼ JobPosting[] (normalized, typed)
        │
   matcher.ts
   └── Mistral (mistral-small-latest)
       System prompt: resume baseline
       User message: job description
       Output: { score: number, reasons: string[], gaps: string[] }
        │
        ▼ ScoredJob[] (score >= 75 only)
        │
   storage.ts
   └── Supabase (Postgres)
        │
        ▼
   dashboard/index.html
   └── Vanilla JS, reads from Supabase
       Displays: title, company, source, score, reasons, apply link
```

---

## 🔍 Key Decisions and Why

### Why fetch from ATS platforms directly instead of using an aggregator?

Aggregators like LinkedIn and Indeed are designed for job seekers, which means they're also optimized for engagement, not data quality. They deduplicate inconsistently, surface promoted listings out of relevance order, and gate their APIs behind enterprise pricing or scraping terms of service violations.

Greenhouse, Ashby, Lever, and SmartRecruiters all expose public job board APIs that are free, stable, and return structured JSON. No scraping. No rate limit games. Clean data from the source.

The tradeoff: coverage is limited to companies using these four ATS platforms. That's an acceptable constraint for a focused search targeting companies that tend to use modern hiring infrastructure.

### Why Mistral for scoring, not Claude?

Two reasons: cost and fit.

At daily fetches of 100 to 200 job listings, using Claude for scoring would burn through Anthropic credits fast. Mistral's free tier on la Plateforme covers this volume at effectively $0.

More importantly, scoring is a structured pattern-matching task. Does this job description match this resume? It doesn't require Claude's depth. It requires a consistent, typed JSON output and reliable reasoning against a fixed baseline. Mistral `mistral-small-latest` does this well and is already in the stack from QA Signal Hub.

Claude is reserved for Phase 2 package generation, a genuinely different task (creative writing, tone-matching, structured argumentation) where its behavior is already tuned and producing quality output in Aligned.

### Why Supabase over a flat file or local SQLite?

GitHub Actions is a machine in the cloud. It runs the fetch pipeline, scores the jobs, and shuts down. The dashboard is separate. It lives in a browser and needs to read that data whenever it's opened. They need a shared place to meet. Supabase is that shared place: GitHub Actions writes to it, the dashboard reads from it, and neither needs to be on the same machine at the same time.

A flat file would only work if everything ran on the same computer, all the time. Supabase removes that constraint entirely.

### Why vanilla JS for the Phase 1 dashboard?

The Phase 1 dashboard does one thing: read a list of scored jobs from Supabase and display them. There is no state management problem here. There is no component reuse problem. There is no routing problem.

Adding React to solve a problem that doesn't exist yet is premature abstraction. Vanilla JS with a single `fetch()` call is the right tool for a read-only display with no interactivity beyond filtering.

React/Vite is the Phase 2 upgrade, when the dashboard gets status tracking, pipeline views, and a trigger for package generation. At that point the complexity earns the framework.

### Why GitHub Actions for the cron job?

Because the infrastructure already exists. There's no server to maintain, no scheduler to run, no uptime to monitor. A cron workflow in `.github/workflows/` runs at a scheduled time, executes the fetch-score-store pipeline, and exits. If it fails, the run log shows exactly why.

For a personal project running once a day, this is the right level of infrastructure. Not more, not less.

---

## 🗂️ Phases

### ✅ Phase 0 -  README
Written before any code. Covers the problem statement, architecture decisions, AI cost strategy, phase breakdown, and intentionality standard. Every decision in the codebase should be traceable back to something stated here.

### 🔨 Phase 1 — MVP (In Progress)
- Fetcher modules for Greenhouse, Ashby, Lever, SmartRecruiters
- Mistral scoring layer with structured JSON output
- Supabase storage with a normalized `job_postings` table
- Vanilla JS dashboard: title, company, source, score, reasons, apply link
- GitHub Actions cron: runs daily, fetches → scores → stores

Deliverable: a fully automated daily pipeline that surfaces matched jobs above 75% in a clean dashboard. Zero manual intervention required after setup.

### ⏳ Phase 2 — Enhanced Dashboard (Planned)
- React/Vite dashboard with status tracking and application pipeline view
- Webhook trigger: marking a job "apply" fires the Anthropic API using a read-only mirror of the Aligned system prompt
- Only built if the manual Aligned handoff becomes a real bottleneck in practice

---

## 🧰 Stack

| Layer | Tool | Reason |
|---|---|---|
| Language | TypeScript (strict) | Type safety, self-documenting contracts, already in stack |
| Runtime | Node.js | Standard, no surprises |
| Scheduler | GitHub Actions | Zero infrastructure, already used in existing projects |
| Database | Supabase (Postgres) | Hosted, free tier, decoupled read/write paths |
| AI — Scoring | Mistral `mistral-small-latest` | Free tier, already in stack, right tool for structured matching |
| AI — Packages | Anthropic Claude (Phase 2) | Behavior already tuned in Aligned, reserved for writing tasks |
| Dashboard (P1) | Vanilla JS + HTML | No framework overhead for a read-only display |
| Dashboard (P2) | React + Vite | Earns its place when complexity requires it |

---

## 📐 Project Principles

**Intentionality over convenience.** Every file, every dependency, every line of code earns its place. If it can't be explained in plain language, it gets reconsidered.

**Industry standards, non-negotiable.** Strict TypeScript. Explicit error handling. Secrets in environment variables only. Separation of concerns. No silent failures.

**Cost discipline.** Mistral free tier for scoring. Anthropic credits reserved for Phase 2. Token-tight prompts. Target monthly cost for Phase 1: $0.

**Boring is a compliment.** Proven tools over clever tools. The goal is a system that works reliably, not one that's interesting to explain.

**Intentional Git history.** Commits follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) standard — `type(scope): description`. The commit log reads like a coherent build narrative, not a list of save points.

---

## 💡 What This Demonstrates

Shortlistd is a standalone portfolio project, separate from Lighthouse QA and QA Signal Hub.

Those projects demonstrate QA depth. This one demonstrates something different: full-stack thinking, API integration design, AI scoring architecture, cost-aware system design, and product-level problem solving. Building something that solves a real problem cleanly, without over-engineering it.

The README-first approach, the architecture decision record, and the intentionality standard are all visible in the commit history. The goal is not just a working project. It's a project that reads like it was built by someone who thinks carefully about why before how.
