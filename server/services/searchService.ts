/**
 * Comprehensive Multi-Field Fuzzy, Phonetic & Multi-Term Search Service
 * Designed for Compliance Teacher / Candidate Search in RefCheck Portal
 */

export function normalizeStr(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

export function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";

  const codes: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3",
    L: "4",
    M: "5", N: "5",
    R: "6"
  };

  const firstChar = s[0];
  let res = firstChar;
  let prevCode = codes[firstChar] || "0";

  for (let i = 1; i < s.length; i++) {
    const char = s[i];
    const code = codes[char] || "0";
    if (code !== "0" && code !== prevCode) {
      res += code;
    }
    prevCode = code;
    if (res.length === 4) break;
  }

  return (res + "0000").slice(0, 4);
}

function arePhoneticallyCompatible(c1: string, c2: string): boolean {
  if (c1 === c2) return true;
  const eqSets = [
    new Set(["c", "k", "q"]),
    new Set(["f", "p", "v"]),
    new Set(["s", "z", "c"]),
    new Set(["g", "j"])
  ];
  return eqSets.some(set => set.has(c1) && set.has(c2));
}

export function calculateTokenMatchScore(token: string, word: string): number {
  const t = normalizeStr(token);
  const w = normalizeStr(word);
  if (!t || !w) return 0;

  // Exact match
  if (w === t) return 100;
  // Prefix match
  if (w.startsWith(t)) return 85;
  // Substring match
  if (w.includes(t)) return 70;

  // Phone digits / numeric matching
  const tDigits = t.replace(/\D/g, "");
  const wDigits = w.replace(/\D/g, "");
  if (tDigits.length >= 3 && wDigits.includes(tDigits)) {
    return 90;
  }

  // Short tokens (< 4 chars) require exact or prefix matching to prevent noise
  if (t.length < 4 || w.length < 3) return 0;

  // First character must match or be phonetically similar
  if (!arePhoneticallyCompatible(t[0], w[0])) {
    return 0;
  }

  // Soundex phonetic matching
  const s1 = soundex(t);
  const s2 = soundex(w);
  const dist = levenshteinDistance(t, w);
  const maxLen = Math.max(t.length, w.length);
  const similarity = 1 - dist / maxLen;

  if (s1 === s2 && dist <= 2 && Math.abs(t.length - w.length) <= 2) {
    return 65;
  }

  // Levenshtein fuzzy match
  let maxAllowedDist = 1;
  if (t.length >= 6 && t.length <= 8) maxAllowedDist = 2;
  else if (t.length >= 9) maxAllowedDist = 3;

  if (dist <= maxAllowedDist && similarity >= 0.72 && Math.abs(t.length - w.length) <= 2) {
    return Math.round(50 * similarity);
  }

  return 0;
}

export function matchCandidate(candidate: any, query: string): { matches: boolean; score: number } {
  const qClean = normalizeStr(query);
  if (!qClean) return { matches: true, score: 1 };

  const qTokens = qClean.split(/\s+/).filter(Boolean);
  if (qTokens.length === 0) return { matches: true, score: 1 };

  const fullName = normalizeStr(candidate.fullName || "");
  const email = normalizeStr(candidate.email || "");
  const role = normalizeStr(candidate.roleAppliedFor || "");
  const phone = normalizeStr(candidate.phone || "");
  const cleanPhone = phone.replace(/\D/g, "");
  const employerName = normalizeStr(candidate.employerName || "");
  const token = normalizeStr(candidate.candidateToken || "");
  const assignedPackage = normalizeStr(candidate.assignedPackage || "");
  const status = normalizeStr(candidate.overallStatus || candidate.status || "");

  // Referee details
  const refereeNames: string[] = [];
  const refereeEmails: string[] = [];
  const refereePhones: string[] = [];
  if (Array.isArray(candidate.referees)) {
    for (const r of candidate.referees) {
      if (r.fullName) refereeNames.push(normalizeStr(r.fullName));
      if (r.name) refereeNames.push(normalizeStr(r.name));
      if (r.email) refereeEmails.push(normalizeStr(r.email));
      if (r.phone) {
        refereePhones.push(normalizeStr(r.phone));
        refereePhones.push(normalizeStr(r.phone).replace(/\D/g, ""));
      }
      if (r.employerName) refereeNames.push(normalizeStr(r.employerName));
    }
  }

  const nameWords = fullName.split(/\s+/).filter(Boolean);
  const roleWords = role.split(/\s+/).filter(Boolean);
  const refWords = refereeNames.flatMap(rn => rn.split(/\s+/).filter(Boolean));
  const employerWords = employerName.split(/\s+/).filter(Boolean);
  const packageWords = assignedPackage.split(/\s+/).filter(Boolean);

  const candidateFields = [
    { text: fullName, weight: 3.0 },
    { text: email, weight: 2.5 },
    { text: phone, weight: 2.0 },
    { text: cleanPhone, weight: 2.0 },
    { text: token, weight: 2.0 },
    { text: role, weight: 1.5 },
    { text: employerName, weight: 1.2 },
    { text: assignedPackage, weight: 1.2 },
    { text: status, weight: 1.0 },
    ...refereeNames.map(rn => ({ text: rn, weight: 1.8 })),
    ...refereeEmails.map(re => ({ text: re, weight: 1.8 })),
    ...refereePhones.map(rp => ({ text: rp, weight: 1.5 })),
  ];

  const candidateWords = [
    ...nameWords.map(w => ({ word: w, weight: 3.0 })),
    ...roleWords.map(w => ({ word: w, weight: 1.5 })),
    ...employerWords.map(w => ({ word: w, weight: 1.2 })),
    ...refWords.map(w => ({ word: w, weight: 1.8 })),
    ...packageWords.map(w => ({ word: w, weight: 1.2 })),
    { word: email, weight: 2.5 },
    { word: token, weight: 2.0 },
  ];

  let totalScore = 0;

  // Every token in the search query must match at least one candidate field or word
  for (const qToken of qTokens) {
    let bestTokenScore = 0;

    // Check full string fields for exact, prefix, or substring match
    for (const f of candidateFields) {
      if (!f.text) continue;
      if (f.text === qToken) {
        bestTokenScore = Math.max(bestTokenScore, 100 * f.weight);
      } else if (f.text.startsWith(qToken)) {
        bestTokenScore = Math.max(bestTokenScore, 85 * f.weight);
      } else if (f.text.includes(qToken)) {
        bestTokenScore = Math.max(bestTokenScore, 70 * f.weight);
      }
    }

    // Check individual candidate words for fuzzy/phonetic match
    for (const cw of candidateWords) {
      if (!cw.word) continue;
      const score = calculateTokenMatchScore(qToken, cw.word);
      if (score > 0) {
        bestTokenScore = Math.max(bestTokenScore, score * cw.weight);
      }
    }

    if (bestTokenScore === 0) {
      // Query token did not match this candidate
      return { matches: false, score: 0 };
    }

    totalScore += bestTokenScore;
  }

  // Bonus for matching full query in fullName or email
  if (fullName.includes(qClean)) {
    totalScore += 50;
  }
  if (email.includes(qClean)) {
    totalScore += 40;
  }

  return { matches: true, score: totalScore };
}
