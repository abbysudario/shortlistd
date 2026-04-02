# 🎯 Shortlistd

> A company-first job search engine that sources startups from VC portfolios, fetches roles directly from their ATS platforms, and scores them against a resume baseline using AI.

---

## 🚦 Build Status

> This project is actively in progress. The table below reflects the current state of the build.

| Phase | Status | Description |
|---|---|---|
| Phase 0 — README | ✅ Complete | Architecture decisions, problem statement, project foundation |
| Phase 1 — MVP | 🔨 In Progress | Company discovery, ATS detection, job fetching, AI scoring, Supabase storage, HTML dashboard, GitHub Actions |
| Phase 2 — Enhanced Dashboard | ⏳ Planned | React/Vite dashboard, resume upload flow, multi-user support, webhook trigger |

---

## 🧭 The Problem

Job searching at the senior level is a volume problem disguised as a quality problem.

The listings exist. They're posted every day across hundreds of company career pages. The signal is there, it's just buried under roles that are close but wrong, ghost jobs that were never real or are already filled, and aggregator noise that creates the illusion of more opportunity than actually exists.

The current manual workflow looks like this: open LinkedIn, open Indeed, scan titles, click through, read the full description, realize it's a contract role, or needs 3 years of Java, or is actually a junior position rebranded as "senior." Close the tab. Repeat. An hour later, two or three tabs are open that might be worth applying to.

That's not a sustainable process at volume. The filtering work is something a language model can do in milliseconds for a fraction of a cent. Does this job match my background? Answered automatically, at scale, every day.

Shortlistd replaces the manual filter layer. It discovers companies worth working for, fetches job listings directly from their ATS platforms, scores each one against a fixed resume baseline, and surfaces only the matches above 75%. The result: a clean dashboard with a short list of roles that are actually worth reading, from companies worth knowing about.

---

## 🚫 What This Is Not

Shortlistd does not apply to jobs. It does not write cover letters. It does not send emails.

The application layer lives in **Aligned**, a separate project with a tuned 11-step framework for generating complete application packages using the Anthropic API. That system already works. Shortlistd feeds it.

The handoff is intentionally manual in Phase 1: Shortlistd surfaces the matches, I pick the ones worth pursuing, drop the posting into Aligned, and run the package from there. This separation keeps both tools focused and avoids rebuilding what already works.

---

## 🏗️ Architecture at a Glance

```
GitHub Actions (every 3 days)
        │
        ▼
   Discovery Layer
   ├── Y Combinator API (structured JSON, no auth required)
   ├── Curated VC portfolio page scrapers (Cheerio, HTML parsing)
   └── Manual additions (config/discovery.ts, gitignored)
        │
        ▼ Company names + careers URLs
        │
   Industry Exclusion Filter
   └── Drops companies matching excluded industries
        │
        ▼
   ATS Detection (runs once per new company)
   ├── Greenhouse detected → store board token
   ├── Ashby detected → store board token
   ├── Lever detected → store board token
   └── Unknown → flagged for manual review
        │
        ▼
   companies table (Supabase)
   └── name, careers_url, ats_platform, board_token, source, discovered_at

GitHub Actions (daily)
        │
        ▼
   Job Fetcher
   └── Reads companies table, fetches open roles from each company's ATS API
        │
        ▼ JobPosting[] (normalized, typed)
        │
   Deduplication Layer
   └── Filters out already-seen externalIds
        │
        ▼ JobPosting[] (new only)
        │
   matcher.ts
   └── Mistral (mistral-small-latest)
       System prompt: resume baseline (fetched from user_profiles table at runtime)
       User message: job description
       Output: { score: number, reasons: string[], gaps: string[] }
        │
        ▼ ScoredJob[] (all jobs scored)
        │
   storage.ts
   └── Supabase (Postgres)
       Three tables: companies, scored_jobs, user_profiles
       All scored jobs stored regardless of score
        │
        ▼
   dashboard/index.html
   └── Vanilla JS, reads from Supabase
       Two sections:
       ├── Matched Jobs (score >= 75%)
       └── All Jobs (everything fetched today)
        │
        ▼
   Automated Cleanup (daily)
   └── Deletes records older than 7 days
```

---

## 🔍 Key Decisions and Why

### Why company-first discovery instead of keyword search on job boards?

Job boards like LinkedIn and Indeed have two fundamental problems for this use case. First, ghost jobs: roles that are already filled, paused, or were never intended to be hired for. Aggregators have no accountability mechanism for stale listings. Second, startup visibility: high-quality early stage companies are chronically underrepresented on aggregators because they don't pay for promoted listings and their postings get buried.

The company-first approach solves both problems simultaneously. By discovering companies through curated institutional sources and fetching jobs directly from their ATS platforms, every listing is current and active. Companies close roles on their own ATS when they're filled because it directly affects their hiring workflow. And curated discovery surfaces companies most job seekers have never heard of, which is exactly the edge this system is designed to provide.

### Why VC portfolio pages as the primary discovery source?

VC firms have already done the vetting work. A company backed by a top-tier VC has been evaluated for team quality, market opportunity, and execution ability. That signal is valuable independent of any job posting. A portfolio page is a curated list of companies worth knowing about, updated as the firm makes new investments.

The discovery sources were chosen to maximize coverage across target industries and geographies while including firms that back underrepresented founders, a signal for companies that tend to invest in culture and team quality. The specific sources are maintained in a gitignored config file and are not publicly documented.

### Why fetch from ATS platforms directly instead of using an aggregator?

Once a company is discovered and their ATS platform is identified, fetching jobs directly from that platform eliminates the ghost job problem entirely. Greenhouse, Ashby, and Lever all expose public job board APIs that are free, stable, and return structured JSON. No scraping. No rate limit games. Clean data from the source.

The ATS detection step runs once per company and stores the result permanently. The daily fetch uses that stored result. No re-detection, no guessing.

### Why Cheerio over Playwright or Puppeteer for VC portfolio page scraping?

Playwright is already in the stack from existing QA projects and would be a natural choice. But Playwright is a full browser automation tool. It launches a real browser instance, renders JavaScript, and handles complex interactions. That power is necessary for end-to-end testing but is significant overhead for reading a static portfolio page.

Cheerio parses HTML directly without launching a browser. It's faster, lighter, and uses far less memory. For VC portfolio pages, which are predominantly server-rendered marketing pages with stable HTML structures, Cheerio is the right tool. If a portfolio page turns out to be JavaScript-heavy and requires browser rendering, that specific scraper can use Playwright as a targeted fallback. The default stays lean.

### Why is the resume baseline stored in Supabase instead of a config file?

The resume baseline was initially written as a TypeScript config file. Two problems emerged. First, it contained detailed personal career information that should never live in a public repository. Second, hardcoding it in a file makes multi-user support impossible without a rewrite.

Moving it to a `user_profiles` table in Supabase solves both problems. The baseline is fetched at runtime using the service role key, never committed to the repo, and already structured for per-user records in Phase 2. Sensitive data stays out of version control. The foundation for monetization is built in from the start rather than retrofitted later.

### Why are sensitive config files gitignored and never committed?

`config/resume-baseline.ts` and `config/discovery.ts` contain information that should never be public: personal career details used for AI scoring and the curated discovery sources that represent the core IP of the system. Both files are gitignored and exist only locally and in GitHub Actions secrets at runtime.

The discovery source list is the primary moat of Shortlistd. Keeping it out of the public repo protects that work while still allowing the architecture, types, and documented decisions to serve as a portfolio signal.

### Why Mistral for scoring, not Claude?

Two reasons: cost and fit.

At daily fetches across hundreds of company career pages, using Claude for scoring would burn through Anthropic credits fast. Mistral's free tier on la Plateforme covers this volume at effectively $0. At realistic volumes of 20 to 50 new jobs per day after deduplication, the monthly cost on Mistral's paid tier is approximately $0.14. Effectively still $0.

More importantly, scoring is a structured pattern-matching task. Does this job description match this resume? It doesn't require Claude's depth. It requires a consistent, typed JSON output and reliable reasoning against a fixed baseline. Mistral `mistral-small-latest` does this well and is already in the stack from QA Signal Hub.

Claude is reserved for Phase 2 package generation, a genuinely different task (creative writing, tone-matching, structured argumentation) where its behavior is already tuned and producing quality output in Aligned.

### Why score every job instead of filtering before scoring?

Every fetched job gets scored regardless of title or apparent relevance. This decision was made for two reasons. First, it provides full job visibility in the dashboard: both a "Matched Jobs" section (score >= 75%) and an "All Jobs" section showing everything fetched. Seeing what the AI filtered out and why is useful signal. Second, it simplifies the architecture: one table in Supabase, one data shape, one scoring pass. The dashboard filters the view, not the data.

### Why day-over-day deduplication using externalId?

Every ATS platform assigns a unique ID to each job posting. Before scoring, the pipeline checks whether that ID already exists in Supabase. If it does, the job is skipped entirely. No Mistral call, no storage write. This prevents the same posting from being scored and stored repeatedly across daily runs, keeps token usage lean, and ensures the dashboard reflects genuinely new listings each day.

Cross-platform deduplication (the same job appearing on two different ATS platforms) was considered and intentionally excluded. Companies commit to a single ATS platform deeply integrated into their hiring workflow. The scenario where the same company posts the same role on both Greenhouse and Lever simultaneously is effectively zero in practice.

### Why NULL for missing location instead of a default string?

When an ATS platform does not provide a location for a job posting, the value is stored as `NULL` in the database rather than a default string like `'unspecified'`. In relational databases, `NULL` has a precise meaning: the value is unknown or not applicable. An empty string means something different, the value is known and it is empty. Storing `NULL` for unknown values is semantically correct and follows standard database convention.

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

### Why GitHub Actions for scheduling?

Because the infrastructure already exists. There's no server to maintain, no scheduler to run, no uptime to monitor. Two workflows handle the full system: a discovery workflow runs every 3 days to update the company registry, and a fetch workflow runs daily to pull new jobs, score them, and store results. If either fails, the run log shows exactly why.

For a personal project at this cadence, this is the right level of infrastructure. Not more, not less.

---

## 🗂️ Phases

### ✅ Phase 0 — README
Written before any code. Covers the problem statement, architecture decisions, AI cost strategy, phase breakdown, and intentionality standard. Every decision in the codebase should be traceable back to something stated here.

### 🔨 Phase 1 — MVP (In Progress)
- Company discovery via Y Combinator API, curated VC portfolio page scrapers, and manual additions config
- Industry exclusion filter (configurable, maintained in gitignored config)
- ATS detection: identifies Greenhouse, Ashby, or Lever for each discovered company
- Unknown ATS platforms flagged for manual review
- Job fetching direct from company ATS APIs using stored board tokens
- Day-over-day deduplication using externalId before scoring
- Mistral scoring layer: all fetched jobs scored, structured JSON output
- Resume baseline stored in Supabase `user_profiles` table, fetched at runtime, never committed to the repo
- Supabase storage: three tables (companies, scored_jobs, user_profiles), all scored jobs stored regardless of score
- Vanilla JS dashboard: two sections, Matched Jobs (score >= 75%) and All Jobs
- GitHub Actions: discovery workflow every 3 days, fetch workflow daily
- Automated cleanup: records older than 7 days deleted daily

Deliverable: a fully automated pipeline that discovers companies worth working for, surfaces matched QA roles above 75% in a clean dashboard, and keeps all fetched jobs visible. Zero manual intervention required after setup.

### ⏳ Phase 2 — Enhanced Dashboard (Planned)
- React/Vite dashboard with status tracking and application pipeline view
- Per-job status tracking: New, Applied, Passed, Archived
- Status-based data retention: applied jobs kept for 90 days, passed jobs deleted after 7 days, archived jobs kept indefinitely
- Resume upload flow: user uploads resume, scoring happens on demand in the browser
- Multi-user support: user_profiles table already in place, authentication and per-user routing added on top
- Webhook trigger: marking a job "apply" fires the Anthropic API using a read-only mirror of the Aligned system prompt
- Monetization: freemium SaaS model with free tier limits and paid tier for full discovery coverage and extended history
- Only built if the manual Aligned handoff becomes a real bottleneck in practice

---

## 🏢 Company Discovery Sources

Company discovery runs every 3 days via GitHub Actions. New companies found in discovery sources are added to the registry automatically. Companies already in the registry are skipped during discovery. Their jobs are fetched daily by the separate fetch pipeline.

The specific discovery sources, VC firms, manual additions, and exclusion filters are maintained in gitignored config files and are not publicly documented. This is intentional. The curation behind the discovery layer is the core IP of the system.

---

## 🧰 Stack

| Layer | Tool | Reason |
|---|---|---|
| Language | TypeScript (strict) | Type safety, self-documenting contracts, already in stack |
| Runtime | Node.js | Standard, no surprises |
| Scheduler | GitHub Actions | Zero infrastructure, already used in existing projects |
| Database | Supabase (Postgres) | Hosted, free tier, decoupled read/write paths |
| HTML scraping | Cheerio | Lightweight HTML parsing for VC portfolio pages, no browser overhead |
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

**Intentional Git history.** Commits follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) standard — `type(scope): description`. The commit log reads like a coherent build narrative, not a list of save points.

**IP protection by design.** Sensitive configuration files are gitignored from the start. The discovery sources, resume baseline, and curation logic never enter the public repo. The architecture and documented decisions are visible. The data that makes the system valuable is not.

---

## 💡 What This Demonstrates

Shortlistd is a standalone portfolio project, separate from Lighthouse QA and QA Signal Hub.

Those projects demonstrate QA depth. This one demonstrates something different: a company-first job search architecture built on VC portfolio intelligence, direct ATS integration to eliminate ghost jobs, AI-powered resume scoring, and a multi-cadence automation pipeline. It solves a real problem by discovering high-quality startups and surfacing the roles worth applying to, without relying on the aggregators everyone else uses.

The README-first approach, the architecture decision record, and the intentionality standard are all visible in the commit history. The goal is not just a working project. It's a project that reads like it was built by someone who thinks carefully about why before how.
