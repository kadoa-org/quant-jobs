import { query as dbQuery } from "./useDatabase";
import { QUANT_ROLES } from "./constants";

export function readJobData(db) {
    const rawJobs = dbQuery(db, "SELECT * FROM jobs").map((r) => ({
      ...r,
      firmName: r.firm_name,
      firmSlug: r.firm_slug,
      firmType: r.firm_type,
      jobTitle: r.job_title,
      datePosted: r.date_posted,
      // The day our daily run first saw the posting (or its posting date, for postings found on a firm's first run).
      dateAdded: r.date_added ?? null,
      applyUrl: r.apply_url,
      locations: r.locations ? JSON.parse(r.locations) : [],
      jobType: r.job_type,
      roleCategory: r.role_category,
      seniorityLevel: r.seniority_level,
      educationRequirement: r.education_requirement,
      experienceYears: { min: r.experience_min, max: r.experience_max },
      programmingLanguages: r.programming_languages ? JSON.parse(r.programming_languages) : [],
      technologies: r.technologies ? JSON.parse(r.technologies) : [],
      skills: r.skills ? JSON.parse(r.skills) : [],
      assetClasses: r.asset_classes ? JSON.parse(r.asset_classes) : [],
      workMode: r.work_mode,
      aiTools: r.ai_tools ? JSON.parse(r.ai_tools) : [],
    }));

    const rawFirms = dbQuery(db, "SELECT * FROM firms").map((r) => ({
      firmName: r.firm_name,
      firmSlug: r.firm_slug,
      firmType: r.firm_type,
      totalJobs: r.total_jobs,
      phdDemandPct: r.phd_demand_pct,
      mlAiFocusPct: r.ml_ai_focus_pct,
      remotePct: r.remote_pct,
      salaryStats: r.salary_median ? { median: r.salary_median, avg: r.salary_avg, count: r.salary_count } : null,
      topLanguages: r.top_languages ? JSON.parse(r.top_languages) : [],
      topSkills: r.top_skills ? JSON.parse(r.top_skills) : [],
      locationDistribution: r.location_distribution ? JSON.parse(r.location_distribution) : [],
      jobsByRole: r.jobs_by_role ? JSON.parse(r.jobs_by_role) : {},
      jobsBySeniority: r.jobs_by_seniority ? JSON.parse(r.jobs_by_seniority) : {},
    }));

    return { jobs: rawJobs.filter((job) => QUANT_ROLES.has(job.roleCategory)), firms: rawFirms };
}
