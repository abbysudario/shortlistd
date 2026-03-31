# 🎯 Shortlistd

> Cuts job search noise by fetching listings daily, scoring them with AI, and showing only the matches that meet the bar.

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
   Deduplication Layer (storage.ts)
   └── Filter out already-seen externalIds
       Only new jobs proceed to scoring
        │
        ▼ JobPosting[] (new only)
        │
   matcher.ts
   └── Mistral (mistral-small-latest)
       System prompt: resume baseline
       User message: job description
       Output: { score: number, reasons: string[], gaps: string[] }
        │
        ▼ ScoredJob[] (all jobs scored)
        │
   storage.ts
   └── Supabase (Postgres)
       Single table: all scored jobs stored regardless of score
        │
        ▼
   dashboard/index.html
   └── Vanilla JS, reads from Supabase
       Two sections:
       ├── Matched Jobs (score >= 75)
       └── All Jobs (everything fetched today)
        │
        ▼
   Automated Cleanup (GitHub Actions daily)
   └── Deletes records older than 7 days
```

---

## 🔍 Key Decisions and Why

### Why fetch from ATS platforms directly instead of using an aggregator?

Aggregators like LinkedIn and Indeed are designed for job seekers, which means they're also optimized for engagement, not data quality. They deduplicate inconsistently, surface promoted listings out of relevance order, and gate their APIs behind enterprise pricing or terms of service violations.

Greenhouse, Ashby, Lever, and SmartRecruiters all expose public job board APIs that are free, stable, and return structured JSON. No scraping. No rate limit games. Clean data from the source.

The tradeoff: coverage is limited to companies using these four ATS platforms. That's an acceptable constraint for a focused search targeting companies that tend to use modern hiring infrastructure.

### Why query broadly at the ATS level and let Mistral filter?

Filtering strictly by job title at the fetch level would miss real matches. "Quality Assurance Engineer", "Software Engineer in Test", "SDET", and "Test Engineer" can all describe the same role. The fetchers query on broad keywords like "quality", "QA", and "test" to cast a wide net. Mistral scores everything against the full resume baseline and the 75% threshold does the real filtering work. Title matching is a blunt instrument. Semantic matching against a full job description is the sharp one.

### Why Mistral for scoring, not Claude?

Two reasons: cost and fit.

At daily fetches of 100 to 200 job listings, using Claude for scoring would burn through Anthropic credits fast. Mistral's free tier on la Plateforme covers this volume at effectively $0. At realistic volumes of 20 to 50 new jobs per day after deduplication, the monthly cost on Mistral's paid tier is approximately $0.14. Effectively still $0.

More importantly, scoring is a structured pattern-matching task. Does this job description match this resume? It doesn't require Claude's depth. It requires a consistent, typed JSON output and reliable reasoning against a fixed baseline. Mistral `mistral-small-latest` does this well and is already in the stack from QA Signal Hub.

Claude is reserved for Phase 2 package generation, a genuinely different task (creative writing, tone-matching, structured argumentation) where its behavior is already tuned and producing quality output in Aligned.

### Why score every job instead of filtering before scoring?

Every fetched job gets scored regardless of title or apparent relevance. This decision was made for two reasons. First, it provides full job visibility in the dashboard: both a "Matched Jobs" section (score >= 75%) and an "All Jobs" section showing everything fetched. Seeing what the AI filtered out and why is useful signal. Second, it simplifies the architecture: one table in Supabase, one data shape, one scoring pass. The dashboard filters the view, not the data.

### Why day-over-day deduplication using externalId?

Every ATS platform assigns a unique ID to each job posting. Before scoring, the pipeline checks whether that ID already exists in Supabase. If it does, the job is skipped entirely. No Mistral call, no storage write. This prevents the same posting from being scored and stored repeatedly across daily runs, keeps token usage lean, and ensures the dashboard reflects genuinely new listings each day.

Cross-platform deduplication (the same job appearing on two different ATS platforms) was considered and intentionally excluded. Companies commit to a single ATS platform deeply integrated into their hiring workflow. The scenario where the same company posts the same role on both Greenhouse and Lever simultaneously is effectively zero in practice.

### Why NULL for missing location instead of a default string?

When an ATS platform does not provide a location for a job posting, the value is stored as `NULL` in the database rather than a default string like `'unspecified'`. In relational databases, `NULL` has a precise meaning: the value is unknown or not applicable. An empty string means something different — the value is known and it is empty. Storing `NULL` for unknown values is semantically correct and follows standard database convention.

The tradeoff is a small amount of null handling in the dashboard. A `null` location displays as "Unspecified" to the user. That handling is intentional and lives in one place. The database stays accurate, the display stays clean, and the distinction between "no location provided" and "remote" remains meaningful.

### Why a 7-day automated data retention policy?

Job postings have a natural expiry. Most roles are filled or closed within weeks. Keeping stale listings beyond 7 days adds noise to the dashboard and accumulates storage costs over time. A daily cleanup step in the GitHub Actions workflow deletes records older than 7 days automatically, requiring zero manual intervention.

The 7-day window is intentional. It creates a natural forcing function to review matches regularly during an active search. If a listing has not been acted on within a week, it is no longer relevant. The retention window is a single configuration value and can be adjusted without touching any other part of the system.

### Why Supabase over a flat file or local SQLite?

GitHub Actions is a machine in the cloud. It runs the fetch pipeline, scores the jobs, and shuts down. The dashboard is separate. It lives in a browser and needs to read that data whenever it's opened. They need a shared place to meet. Supabase is that shared place: GitHub Actions writes to it, the dashboard reads from it, and neither needs to be on the same machine at the same time.

A flat file would only work if everything ran on the same computer, all the time. Supabase removes that constraint entirely.

### Why vanilla JS for the Phase 1 dashboard?

The Phase 1 dashboard does one thing: read a list of scored jobs from Supabase and display them in two sections. There is no state management problem here. There is no component reuse problem. There is no routing problem.

Adding React to solve a problem that doesn't exist yet is premature abstraction. Vanilla JS with a single `fetch()` call is the right tool for a read-only display with no interactivity beyond filtering.

React/Vite is the Phase 2 upgrade, when the dashboard gets status tracking, pipeline views, and a trigger for package generation. At that point the complexity earns the framework.

### Why GitHub Actions for the cron job?

Because the infrastructure already exists. There's no server to maintain, no scheduler to run, no uptime to monitor. A cron workflow in `.github/workflows/` runs at a scheduled time, executes the fetch-score-store pipeline, and exits. If it fails, the run log shows exactly why.

For a personal project running once a day, this is the right level of infrastructure. Not more, not less.

---

## 🗂️ Phases

### ✅ Phase 0 - README
Written before any code. Covers the problem statement, architecture decisions, AI cost strategy, phase breakdown, and intentionality standard. Every decision in the codebase should be traceable back to something stated here.

### 🔨 Phase 1 - MVP (In Progress)
- Fetcher modules for Greenhouse, Ashby, Lever, SmartRecruiters with broad keyword queries
- Day-over-day deduplication using externalId before scoring
- Mistral scoring layer: all fetched jobs scored, structured JSON output
- Supabase storage: single table, all scored jobs stored regardless of score
- Vanilla JS dashboard: two sections, Matched Jobs (score >= 75%) and All Jobs
- GitHub Actions cron: runs daily, fetches → deduplicates → scores → stores → cleans up records older than 7 days

Deliverable: a fully automated daily pipeline that surfaces matched jobs above 75% in a clean dashboard while keeping all fetched jobs visible. Zero manual intervention required after setup.

### ⏳ Phase 2 — Enhanced Dashboard (Planned)
- React/Vite dashboard with status tracking and application pipeline view
- Per-job status tracking: New, Applied, Passed, Archived
- Status-based data retention: applied jobs kept for 90 days for reference, passed jobs deleted after 7 days, archived jobs kept indefinitely
- Resume upload flow: user uploads resume, scoring happens on demand in the browser
- Multi-user support: resume baseline moves from static config into Supabase, tied to user records
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

**Cost discipline.** Mistral free tier for scoring. Anthropic credits reserved for Phase 2. Token-tight prompts. Target monthly cost for Phase 1: effectively $0.

**Boring is a compliment.** Proven tools over clever tools. The goal is a system that works reliably, not one that's interesting to explain.

**Intentional Git history.** Commits follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) standard - `type(scope): description`. The commit log reads like a coherent build narrative, not a list of save points.

---

## 💡 What This Demonstrates

Shortlistd is a standalone portfolio project, separate from Lighthouse QA and QA Signal Hub.

Those projects demonstrate QA depth. This one demonstrates something different: full-stack thinking, API integration design, AI scoring architecture, cost-aware system design, and product-level problem solving. Building something that solves a real problem cleanly, without over-engineering it.

The README-first approach, the architecture decision record, and the intentionality standard are all visible in the commit history. The goal is not just a working project. It's a project that reads like it was built by someone who thinks carefully about why before how.
