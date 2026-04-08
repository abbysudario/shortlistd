import { createClient } from "@supabase/supabase-js";
import type { ScoredJob } from "./types.js";

// The service role key is used here because storage.ts is only ever executed
// server-side by the pipeline. It never runs in the browser.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

// Returns the set of external IDs already stored in Supabase.
// Used to filter out already-seen jobs before scoring runs.
// A Set is used over an array for O(1) membership checks regardless of table size.
export async function getExistingIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("scored_jobs")
    .select("external_id");

  if (error) {
    throw new Error(`Failed to fetch existing job IDs: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.external_id));
}

// Writes new scored jobs to Supabase.
// Uses upsert with ignoreDuplicates as a database-level safety net behind
// the deduplication check in the pipeline orchestrator.
export async function saveScoredJobs(jobs: ScoredJob[]): Promise<void> {
  if (jobs.length === 0) return;

  const rows = jobs.map((job) => ({
    external_id: job.externalId,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    apply_url: job.applyUrl,
    source: job.source,
    fetched_at: job.fetchedAt.toISOString(),
    score: job.score,
    reasons: job.reasons,
    gaps: job.gaps,
    scored_at: job.scoredAt.toISOString(),
  }));

  const { error } = await supabase
    .from("scored_jobs")
    .upsert(rows, { onConflict: "external_id,source", ignoreDuplicates: true });

  if (error) {
    throw new Error(`Failed to save scored jobs: ${error.message}`);
  }
}
// TODO(phase-2): add name validation when user onboarding flow is built.
// Baseline is injected as the Mistral system prompt on every scoring call.
export async function getResumeBaseline(email: string): Promise<string> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("resume_baseline")
    .eq("email", email)
    .single();

  if (error) {
    throw new Error(`Failed to fetch resume baseline: ${error.message}`);
  }

  return data.resume_baseline;
}