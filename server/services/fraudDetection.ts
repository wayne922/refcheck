export interface FraudDetectionResult {
  flags: string[];
  details: Record<string, string>;
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "yahoo.com",
  "outlook.com",
  "xtra.co.nz",
  "icloud.com",
  "me.com",
  "aol.com",
  "live.com",
  "msn.com",
  "mail.com",
  "yandex.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "gmx.com"
]);

export function cleanEmployerName(name: string): string {
  if (!name) return "";
  let cleaned = name.toLowerCase();
  
  // Remove common corporate designators/suffixes (word boundaries)
  const suffixes = [
    /\binc\b/g,
    /\bltd\b/g,
    /\blimited\b/g,
    /\bpty\b/g,
    /\bpvt\b/g,
    /\bcorp\b/g,
    /\bcorporation\b/g,
    /\bllc\b/g,
    /\bco\b/g,
    /\bincorporated\b/g,
    /\bgmbh\b/g,
    /\bsa\b/g
  ];
  
  suffixes.forEach(suffix => {
    cleaned = cleaned.replace(suffix, "");
  });
  
  // Strip non-alphanumeric characters and whitespace
  return cleaned.replace(/[^a-z0-9]/g, "");
}

export function cleanDomain(domain: string): string {
  if (!domain) return "";
  let cleaned = domain.toLowerCase().trim();
  
  const parts = cleaned.split(".");
  const commonTlds = new Set([
    "com", "co", "nz", "net", "org", "gov", "edu", "mil", 
    "au", "uk", "ca", "de", "fr", "jp", "us", "info", "biz"
  ]);
  
  // Filter out parts that are common TLDs
  const domainParts = parts.filter(p => !commonTlds.has(p));
  if (domainParts.length > 0) {
    // Return the last remaining part which is usually the brand name (e.g. "google" in "mail.google.com")
    cleaned = domainParts[domainParts.length - 1];
  } else {
    cleaned = parts[0];
  }
  
  return cleaned.replace(/[^a-z0-9]/g, "");
}

export function detectFraud(params: {
  refereeEmail: string;
  refereeRelationship: string;
  refereeEmployerName: string;
  refereeSubmissionIp: string;
  candidateSubmissionIp?: string;
  submissionDurationSeconds: number;
  answers: any[];
  questions: any[];
}): FraudDetectionResult {
  const flags: string[] = [];
  const details: Record<string, string> = {};

  const email = (params.refereeEmail || "").toLowerCase().trim();
  const domain = email.split("@")[1] || "";
  const relationship = (params.refereeRelationship || "").toLowerCase().trim();
  const isManagerOrDirector = relationship.includes("manager") || relationship.includes("director");

  // Heuristic 1: Shared IP
  if (
    params.candidateSubmissionIp && 
    params.refereeSubmissionIp && 
    params.candidateSubmissionIp.trim() !== "" && 
    params.refereeSubmissionIp.trim() !== "" && 
    params.candidateSubmissionIp.trim() === params.refereeSubmissionIp.trim()
  ) {
    flags.push("shared_ip");
    details["shared_ip"] = "The referee submitted their response from the same IP address as the candidate.";
  }

  // Heuristic 2: Personal Email Domain
  const isPersonal = PERSONAL_DOMAINS.has(domain);
  if (isPersonal && isManagerOrDirector) {
    flags.push("personal_email");
    details["personal_email"] = "The referee claims a Manager/Director relationship but used a personal email address (e.g., Gmail, Outlook).";
  }

  // Heuristic 3: Domain Mismatch
  if (!isPersonal && domain && isManagerOrDirector && params.refereeEmployerName) {
    const cleanedEmp = cleanEmployerName(params.refereeEmployerName);
    const cleanedDom = cleanDomain(domain);
    
    const isMatch = cleanedEmp.includes(cleanedDom) || cleanedDom.includes(cleanedEmp);
    if (!isMatch && cleanedEmp.length > 0 && cleanedDom.length > 0) {
      flags.push("domain_mismatch");
      details["domain_mismatch"] = `The referee's email domain (@${domain}) does not match the candidate's stated employer name (${params.refereeEmployerName}), despite claiming a Manager/Director relationship.`;
    }
  }

  // Heuristic 4: Short Response
  let hasShortResponse = false;
  params.answers.forEach((ans: any) => {
    // Find the corresponding question template to see if it is required
    const qDef = params.questions.find((q: any) => q.id === ans.id);
    const isRequired = qDef ? !!qDef.required : false;

    if (isRequired && (ans.type === "short_text" || ans.type === "long_text")) {
      const val = typeof ans.value === "string" ? ans.value.trim() : "";
      const wordCount = val.split(/\s+/).filter(Boolean).length;
      if (wordCount < 20) {
        hasShortResponse = true;
      }
    }
  });
  if (hasShortResponse) {
    flags.push("short_response");
    details["short_response"] = "One or more required text answers provided by the referee was extremely brief (under 20 words).";
  }

  // Heuristic 5: Fast Completion
  if (params.submissionDurationSeconds > 0 && params.submissionDurationSeconds < 90) {
    flags.push("fast_completion");
    details["fast_completion"] = `The referee completed the entire reference check in less than 90 seconds (${params.submissionDurationSeconds}s), indicating a potentially automated or rushed submission.`;
  }

  return { flags, details };
}
