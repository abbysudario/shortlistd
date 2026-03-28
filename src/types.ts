// Enum prevents raw string values from drifting across fetcher modules.
export enum JobSource {
  Greenhouse = "greenhouse",
  Ashby = "ashby",
  Lever = "lever",
  SmartRecruiters = "smartrecruiters",
}

export interface JobPosting {
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl: string;
  source: JobSource;
  fetchedAt: Date;
}

export interface MatchResult {
  score: number;
  reasons: string[];
  gaps: string[];
}

// Extends JobPosting with Mistral scoring fields.
// This is the final shape written to Supabase and read by the dashboard.
export interface ScoredJob extends JobPosting {
  score: number;
  reasons: string[];
  gaps: string[];
  scoredAt: Date;
}