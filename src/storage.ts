import { createClient } from "@supabase/supabase-js";
import type { ScoredJob, Company, CompanySource, JobSource } from "./types.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);


// Used to filter out already-seen jobs before scoring runs.
// A Set is used over an array for O(1) membership checks regardless of table size.
export async function getExistingJobIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("scored_jobs")
    .select("external_id");

  if (error) {
    throw new Error(`Failed to fetch existing job IDs: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.external_id));
}

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

// Baseline is injected as the Mistral system prompt on every scoring call.
// TODO(phase-2): add name validation when user onboarding flow is built.
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


export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .not("ats_platform", "is", null);

  if (error) {
    throw new Error(`Failed to fetch companies: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    websiteUrl: row.website_url,
    atsPlatform: row.ats_platform as JobSource,
    boardToken: row.board_token,
    source: row.source as CompanySource,
    discoveredAt: new Date(row.discovered_at),
    createdAt: new Date(row.created_at),
  }));
}

// Skips companies that already exist via the unique constraint on name.
export async function saveCompanies(
  companies: Omit<Company, "id" | "discoveredAt" | "createdAt">[]
): Promise<void> {
  if (companies.length === 0) return;

  const rows = companies.map((company) => ({
    name: company.name,
    website_url: company.websiteUrl,
    ats_platform: company.atsPlatform,
    board_token: company.boardToken,
    source: company.source,
  }));

  const { error } = await supabase
    .from("companies")
    .upsert(rows, { onConflict: "name", ignoreDuplicates: true });

  if (error) {
    throw new Error(`Failed to save companies: ${error.message}`);
  }
}