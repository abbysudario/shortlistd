import * as cheerio from "cheerio";
import { CompanySource, JobSource } from "./types.js";
import { saveCompanies } from "./storage.js";
import {
  EXCLUDED_INDUSTRIES,
  MANUAL_COMPANIES,
  VC_SOURCES,
  BLOCKED_COMPANIES,
} from "../config/discovery-sources.js";

type DiscoveredCompany = {
  name: string;
  websiteUrl: string;
  atsPlatform: JobSource | null;
  boardToken: string | null;
  source: CompanySource;
};

async function fetchYCCompanies(): Promise<DiscoveredCompany[]> {
  const response = await fetch(
    "https://yc-oss.github.io/api/batches/all.json"
  );

  if (!response.ok) {
    throw new Error(`YC API request failed: ${response.status}`);
  }

  const companies = await response.json() as Array<{
    name: string;
    website: string;
    industries: string[];
    status: string;
  }>;

  return companies
    .filter((company) => company.status === "Active")
    .filter((company) =>
      !company.industries.some((industry) =>
        EXCLUDED_INDUSTRIES.some((excluded) =>
          industry.toLowerCase().includes(excluded.toLowerCase())
        )
      )
    )
    .map((company) => ({
      name: company.name,
      websiteUrl: company.website,
      atsPlatform: null,
      boardToken: null,
      source: CompanySource.YCombinator,
    }));
}

async function scrapeVCPortfolio(
  url: string,
  selector: string
): Promise<{ name: string; websiteUrl: string }[]> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch portfolio page: ${url} (${response.status})`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const results: { name: string; websiteUrl: string }[] = [];

  $(selector).each((_index, element) => {
    const name = $(element).text().trim();
    const websiteUrl =
      $(element).attr("href") ??
      $(element).find("a").attr("href") ??
      "";

    if (name && websiteUrl) {
      results.push({ name, websiteUrl });
    }
  });

  return results;
}

function applyBlocklist(companies: DiscoveredCompany[]): DiscoveredCompany[] {
  const blockedNames = new Set(
    BLOCKED_COMPANIES.map((name) => name.toLowerCase().trim())
  );
  return companies.filter(
    (company) => !blockedNames.has(company.name.toLowerCase().trim())
  );
}

function deduplicateByName(
  companies: DiscoveredCompany[]
): DiscoveredCompany[] {
  const seenNames = new Set<string>();
  return companies.filter((company) => {
    const normalizedName = company.name.toLowerCase().trim();
    if (seenNames.has(normalizedName)) return false;
    seenNames.add(normalizedName);
    return true;
  });
}

export async function discoverCompanies(): Promise<void> {
  const discovered: DiscoveredCompany[] = [];

  // YC API is the primary discovery source — free, structured, no auth required.
  try {
    const ycCompanies = await fetchYCCompanies();
    discovered.push(...ycCompanies);
    console.log(`YC: discovered ${ycCompanies.length} companies`);
  } catch (error) {
    console.error("YC discovery failed:", error);
  }

  // Each VC source is independent — one failure does not stop the others.
  for (const vcSource of VC_SOURCES) {
    if (!vcSource.selector) continue;

    try {
      const scrapedCompanies = await scrapeVCPortfolio(vcSource.url, vcSource.selector);
      const normalizedCompanies = scrapedCompanies.map((scrapedCompany) => ({
        ...scrapedCompany,
        atsPlatform: null,
        boardToken: null,
        source: vcSource.source,
      }));
      discovered.push(...normalizedCompanies);
      console.log(`${vcSource.name}: discovered ${normalizedCompanies.length} companies`);
    } catch (error) {
      console.error(`${vcSource.name} scraping failed:`, error);
    }
  }

  // Manual additions are always included regardless of scraping results.
  discovered.push(
    ...MANUAL_COMPANIES.map((manualCompany) => ({
      ...manualCompany,
      atsPlatform: null,
      boardToken: null,
    }))
  );

  const filteredCompanies = applyBlocklist(discovered);
  const deduplicatedCompanies = deduplicateByName(filteredCompanies);

  await saveCompanies(deduplicatedCompanies);
  console.log(`Discovery complete: ${deduplicatedCompanies.length} companies saved`);
}