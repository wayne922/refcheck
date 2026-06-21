import express, { Response, NextFunction, Request } from "express";
import { createServer } from "node:http";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";
import { airtableService } from "./services/airtable.ts";
import { serveStatic } from "./static.ts";
import { emailService } from "./services/email.ts";
import { smsService } from "./services/sms.ts";
import { detectFraud } from "./services/fraudDetection.ts";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || "default_refcheck_secret_key_123456";

// Gemini configuration
const geminiApiKey = process.env.GEMINI_API_KEY;
if (geminiApiKey) {
  console.log("[Gemini Service] API Key configured successfully.");
} else {
  console.warn("[Gemini Service Warning] GEMINI_API_KEY is missing. Using local mock AI generation.");
}

// Security & Parsing Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline styles/scripts for Vite development
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Custom Request Interface to hold user auth claims
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    employerId: string;
    email: string;
    role: string;
  };
}

// Authentication Middleware
const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Access Denied: No Token Provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const verified = jwt.verify(token, JWT_SECRET) as any;
    req.user = verified;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: "Invalid or Expired Token" });
  }
};

// Role Authorization Middleware
const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Access Denied: Unauthorized" });
    }
    if (roles.includes(req.user.role)) {
      next();
    } else {
      return res.status(403).json({ success: false, error: `Access Denied: Forbidden for role '${req.user.role}'` });
    }
  };
};


// Helper to resolve Candidate creator's email address
const getRecruiterEmail = async (candidate: any): Promise<string> => {
  if (candidate && candidate.createdBy) {
    const creatorId = Array.isArray(candidate.createdBy) ? candidate.createdBy[0] : candidate.createdBy;
    if (creatorId) {
      const creator = await airtableService.getUserById(creatorId);
      if (creator && creator.email) {
        return creator.email;
      }
    }
  }
  return "wayne@refcheck.tech"; // Default fallback
};


// Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      console.log(`${new Date().toLocaleTimeString()} [RefCheck Express] ${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "healthy", mode: airtableService.isMockMode() ? "mock" : "live" });
});

// App configuration (returns Google Client ID if configured)
app.get("/api/config", (_req, res) => {
  res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null
  });
});

// Google SSO Sign-In (Sprint 1 & Live Production OAuth Verification)
app.post("/api/auth/google", async (req, res) => {
  const { email, companyName, fullName, googleToken } = req.body;

  let emailToUse = email;
  let nameToUse = fullName || "";
  let ssoIdToUse = googleToken || (email ? `google-sso-sub-${email.replace(/[@.]/g, "-")}` : "");
  let isRealGoogleAuth = false;

  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  // 1. Verify token with Google API if googleToken is passed and Google Client ID is configured
  if (googleToken && googleClientId) {
    try {
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${googleToken}`);
      if (!verifyRes.ok) {
        return res.status(401).json({ success: false, error: "Invalid Google sign-in credential" });
      }
      const payload: any = await verifyRes.json();
      
      // Verify audience matches our Client ID
      if (payload.aud !== googleClientId) {
        return res.status(401).json({ success: false, error: "Google token audience mismatch" });
      }

      emailToUse = payload.email;
      nameToUse = payload.name;
      ssoIdToUse = payload.sub; // Real Google User ID
      isRealGoogleAuth = true;
      console.log(`[Google Auth] Verified identity for: ${emailToUse}`);
    } catch (err: any) {
      console.error("Failed to verify Google ID token:", err);
      return res.status(401).json({ success: false, error: "Failed to verify Google sign-in credential" });
    }
  }

  // 2. Fallback check for developer simulation login
  if (!isRealGoogleAuth && (!emailToUse || (!companyName && !emailToUse))) {
    return res.status(400).json({ success: false, error: "Email is required for sign-in" });
  }

  try {
    let employer = null;
    let user = await airtableService.getUserByEmail(emailToUse);

    if (user) {
      // User already exists, fetch their linked employer
      const employerId = user.employerId || (user.employer && Array.isArray(user.employer) ? user.employer[0] : user.employer);
      employer = await airtableService.getEmployer(employerId);
      if (!employer) {
        return res.status(404).json({ success: false, error: "Employer associated with this user was not found." });
      }
    } else {
      // User doesn't exist, try to lookup employer by email domain to auto-onboard team members
      const parsedDomain = emailToUse.split("@")[1];
      employer = await airtableService.getEmployerByDomain(parsedDomain);

      if (!employer) {
        // If domain is not registered, and they are not signing up with a companyName
        if (!companyName) {
          return res.status(403).json({
            success: false,
            error: "Your company domain is not registered on RefCheck. Please sign up or contact your administrator."
          });
        }
        
        // Register new employer profile
        employer = await airtableService.createEmployer({
          companyName: companyName,
          companyDomain: parsedDomain,
          googleSsoId: ssoIdToUse,
        });
      }

      // Create new user profile linked to the employer
      user = await airtableService.createUser({
        fullName: nameToUse || (employer.companyName + " Recruiter"),
        email: emailToUse,
        googleSsoId: ssoIdToUse,
        employerId: employer.id,
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        employerId: employer.id,
        email: user.email,
        role: user.role || "Admin",
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        email: user.email,
        companyName: employer.companyName,
        role: user.role || "Admin",
      }
    });
  } catch (err: any) {
    console.error("Google auth handler failed:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});

// Get Current Employer Profile details
app.get("/api/employers/me", authMiddleware as any, async (req: AuthenticatedRequest, res) => {
  try {
    const employer = await airtableService.getEmployer(req.user!.employerId);
    if (!employer) {
      return res.status(404).json({ success: false, error: "Employer record not found" });
    }
    return res.status(200).json({ success: true, employer });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Fetch all Candidates with pagination, filtering, sorting, and role scoping
app.get("/api/candidates", authMiddleware as any, async (req: AuthenticatedRequest, res) => {
  const { page, limit, status, createdBy, dateFrom, dateTo, sortBy, sortOrder } = req.query;
  
  try {
    let candidates;
    if (req.user!.role === "Admin") {
      // Platform Admin can see all candidates across all employers
      candidates = await airtableService.getCandidates();
    } else {
      // Recruiter and Viewer see candidates for their employer
      candidates = await airtableService.getCandidates(req.user!.employerId);
      
      // Recruiter sees only their own candidates
      if (req.user!.role === "Recruiter") {
        candidates = candidates.filter((c: any) => {
          const creatorId = Array.isArray(c.createdBy) ? c.createdBy[0] : c.createdBy;
          return creatorId === req.user!.userId;
        });
      }
    }

    // Populate referee counts and default status fields
    let candidatesWithCounts = await Promise.all(
      candidates.map(async (c: any) => {
        const referees = await airtableService.getRefereesForCandidate(c.id);
        const refereeCount = referees.length;
        const completedRefereeCount = referees.filter((r: any) => r.formStatus === "Complete").length;
        const candStatus = c.overallStatus || "Not Started";
        
        return {
          ...c,
          refereeCount,
          completedRefereeCount,
          status: candStatus
        };
      })
    );

    // Apply Filters
    if (status && status !== "All") {
      candidatesWithCounts = candidatesWithCounts.filter((c: any) => c.status === status);
    }
    if (createdBy && createdBy !== "All") {
      candidatesWithCounts = candidatesWithCounts.filter((c: any) => {
        const creatorId = Array.isArray(c.createdBy) ? c.createdBy[0] : c.createdBy;
        return creatorId === createdBy;
      });
    }
    if (dateFrom) {
      const fromTime = new Date(dateFrom as string).getTime();
      candidatesWithCounts = candidatesWithCounts.filter((c: any) => new Date(c.createdAt).getTime() >= fromTime);
    }
    if (dateTo) {
      const toTime = new Date(dateTo as string).getTime();
      candidatesWithCounts = candidatesWithCounts.filter((c: any) => new Date(c.createdAt).getTime() <= toTime);
    }

    // Apply Sorting
    const sortByField = (sortBy || "createdAt") as string;
    const order = (sortOrder || "desc") === "desc" ? -1 : 1;

    candidatesWithCounts.sort((a: any, b: any) => {
      let valA = a[sortByField] || "";
      let valB = b[sortByField] || "";

      if (sortByField === "createdAt") {
        return (new Date(valA).getTime() - new Date(valB).getTime()) * order;
      }

      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return -1 * order;
      if (valA > valB) return 1 * order;
      return 0;
    });

    // Apply Pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const total = candidatesWithCounts.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedCandidates = candidatesWithCounts.slice(startIndex, startIndex + limitNum);

    return res.status(200).json({
      success: true,
      candidates: paginatedCandidates,
      total,
      page: pageNum,
      limit: limitNum
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// GET /api/dashboard - employer summary
app.get("/api/dashboard", authMiddleware as any, async (req: AuthenticatedRequest, res) => {
  try {
    let candidates;
    if (req.user!.role === "Admin") {
      candidates = await airtableService.getCandidates();
    } else {
      candidates = await airtableService.getCandidates(req.user!.employerId);
      if (req.user!.role === "Recruiter") {
        candidates = candidates.filter((c: any) => {
          const creatorId = Array.isArray(c.createdBy) ? c.createdBy[0] : c.createdBy;
          return creatorId === req.user!.userId;
        });
      }
    }

    const totalCandidates = candidates.length;
    let flaggedCount = 0;
    let completedCount = 0;
    let turnaroundTotalHours = 0;
    let turnaroundCount = 0;

    for (const c of candidates) {
      const status = c.overallStatus || "Not Started";
      if (status === "Flagged") {
        flaggedCount++;
      } else if (status === "Complete") {
        completedCount++;
      }

      if (status === "Complete" || status === "Flagged") {
        const referees = await airtableService.getRefereesForCandidate(c.id);
        const completedReferees = referees.filter((r: any) => r.formStatus === "Complete" && r.formCompletedAt);
        if (completedReferees.length > 0) {
          const completionTimes = completedReferees.map((r: any) => new Date(r.formCompletedAt).getTime());
          const latestCompletionTime = Math.max(...completionTimes);
          const createdTime = new Date(c.createdAt).getTime();
          const diffMs = latestCompletionTime - createdTime;
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours >= 0) {
            turnaroundTotalHours += diffHours;
            turnaroundCount++;
          }
        }
      }
    }

    const completionRate = totalCandidates > 0 
      ? Math.round(((completedCount + flaggedCount) / totalCandidates) * 100)
      : 0;

    const avgTurnaroundHours = turnaroundCount > 0
      ? Math.round(turnaroundTotalHours / turnaroundCount)
      : 0;

    return res.status(200).json({
      success: true,
      summary: {
        totalCandidates,
        completionRate,
        avgTurnaroundHours,
        flaggedCount
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// GET /api/dashboard/metrics - KPI cards
app.get("/api/dashboard/metrics", authMiddleware as any, async (req: AuthenticatedRequest, res) => {
  try {
    let candidates;
    if (req.user!.role === "Admin") {
      candidates = await airtableService.getCandidates();
    } else {
      candidates = await airtableService.getCandidates(req.user!.employerId);
      if (req.user!.role === "Recruiter") {
        candidates = candidates.filter((c: any) => {
          const creatorId = Array.isArray(c.createdBy) ? c.createdBy[0] : c.createdBy;
          return creatorId === req.user!.userId;
        });
      }
    }

    const totalCandidates = candidates.length;
    let flaggedCount = 0;
    let completedCount = 0;
    let activeChecksCount = 0;
    let turnaroundTotalHours = 0;
    let turnaroundCount = 0;

    for (const c of candidates) {
      const status = c.overallStatus || "Not Started";
      if (status === "Flagged") {
        flaggedCount++;
      } else if (status === "Complete") {
        completedCount++;
      } else {
        activeChecksCount++;
      }

      if (status === "Complete" || status === "Flagged") {
        const referees = await airtableService.getRefereesForCandidate(c.id);
        const completedReferees = referees.filter((r: any) => r.formStatus === "Complete" && r.formCompletedAt);
        if (completedReferees.length > 0) {
          const completionTimes = completedReferees.map((r: any) => new Date(r.formCompletedAt).getTime());
          const latestCompletionTime = Math.max(...completionTimes);
          const createdTime = new Date(c.createdAt).getTime();
          const diffMs = latestCompletionTime - createdTime;
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours >= 0) {
            turnaroundTotalHours += diffHours;
            turnaroundCount++;
          }
        }
      }
    }

    const completionRate = totalCandidates > 0 
      ? Math.round(((completedCount + flaggedCount) / totalCandidates) * 100)
      : 0;

    const flaggedRate = totalCandidates > 0
      ? Math.round((flaggedCount / totalCandidates) * 100)
      : 0;

    const avgTurnaroundHours = turnaroundCount > 0
      ? Math.round(turnaroundTotalHours / turnaroundCount)
      : 0;

    return res.status(200).json({
      success: true,
      metrics: {
        avgTurnaroundHours,
        completionRate,
        flaggedRate,
        activeChecksCount
      },
      isMock: airtableService.isMockMode()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});


// Create a new Candidate Check (Generates token, dispatches)
app.post("/api/candidates", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  const { fullName, email, phone, roleAppliedFor, assignedPackage } = req.body;

  if (!fullName || !email || !roleAppliedFor) {
    return res.status(400).json({ success: false, error: "Missing required candidate fields" });
  }

  try {
    const employer = await airtableService.getEmployer(req.user!.employerId);
    
    const candidateToken = crypto.randomBytes(8).toString("hex");

    const candidate = await airtableService.createCandidate({
      fullName,
      email,
      phone,
      roleAppliedFor,
      employerName: employer.companyName,
      employerId: req.user!.employerId,
      assignedPackage: assignedPackage || "Standard 2-Referee",
      candidateToken,
      createdBy: req.user!.userId
    });

    // Dispatch dynamic SendGrid invitation email (logs in mock mode)
    await emailService.sendCandidateInvite(fullName, email, candidateToken, employer.companyName);

    return res.status(200).json({ success: true, candidate });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Fetch candidate details by public token
app.get("/api/candidates/by-token/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const candidate = await airtableService.getCandidateByToken(token);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate token not found in database" });
    }
    
    // Verify expiration manually
    if (candidate.tokenExpiresAt && new Date() > new Date(candidate.tokenExpiresAt)) {
      return res.status(403).json({ success: false, error: "Link expired or invalid" });
    }
    
    // Record candidate submission IP
    const ipAddress = (req.headers["x-forwarded-for"] as string || req.ip || "127.0.0.1").split(",")[0].trim();
    const isLoopback = ipAddress === "127.0.0.1" || ipAddress === "::1" || ipAddress === "::ffff:127.0.0.1";
    if (!candidate.candidateSubmissionIp || (!isLoopback && candidate.candidateSubmissionIp !== ipAddress)) {
      await airtableService.updateCandidateFields(candidate.id, {
        candidateSubmissionIp: ipAddress
      });
      candidate.candidateSubmissionIp = ipAddress; // Keep in-memory sync
    }

    return res.status(200).json({
      success: true,
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        roleAppliedFor: candidate.roleAppliedFor,
        employerName: candidate.employerName
      }
    });
  } catch (err: any) {
    return res.status(403).json({ success: false, error: "Link expired or invalid" });
  }
});

// Fetch single candidate with linked referees (Recruiter Dashboard)
app.get("/api/candidates/:id", authMiddleware as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const candidate = await airtableService.getCandidate(id);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }
    const referees = await airtableService.getRefereesForCandidate(id);
    
    // Merge responses (if formStatus is Complete)
    const refereesWithResponses = await Promise.all(
      referees.map(async (ref: any) => {
        if (ref.formStatus === "Complete") {
          const responses = await airtableService.getResponsesForReferee(ref.id);
          if (responses && responses.length > 0) {
            const latestResponse = responses[responses.length - 1];
            return {
              ...ref,
              fraudFlags: latestResponse.fraudFlags || "",
              fraudFlagDetails: latestResponse.fraudFlagDetails || "{}",
              overallRating: latestResponse.overallRating,
              wordCountTotal: latestResponse.wordCountTotal,
              answersJson: latestResponse.answersJson
            };
          }
        }
        return ref;
      })
    );

    return res.status(200).json({ success: true, candidate, referees: refereesWithResponses });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Delete candidate check (Recruiter Dashboard)
app.delete("/api/candidates/:id", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const candidate = await airtableService.getCandidate(id);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    // Scoping check for Recruiter role
    if (req.user!.role === "Recruiter") {
      const creatorId = Array.isArray(candidate.createdBy) ? candidate.createdBy[0] : candidate.createdBy;
      if (creatorId !== req.user!.userId) {
        return res.status(403).json({ success: false, error: "Access Denied: Recruiter not authorized to delete this candidate" });
      }
    }

    await airtableService.deleteCandidate(id);

    return res.status(200).json({ success: true, message: "Candidate deleted successfully." });
  } catch (err: any) {
    console.error("Candidate delete route error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Fetch consolidated candidate vetting report (Sprint 7)
app.get("/api/candidates/:id/report", authMiddleware as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const candidate = await airtableService.getCandidate(id);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    // Scoping check for Recruiter role
    if (req.user!.role === "Recruiter") {
      const creatorId = Array.isArray(candidate.createdBy) ? candidate.createdBy[0] : candidate.createdBy;
      if (creatorId !== req.user!.userId) {
        return res.status(403).json({ success: false, error: "Access Denied: Recruiter not authorized to view this candidate report" });
      }
    }

    const referees = await airtableService.getRefereesForCandidate(id);
    
    let ratingSum = 0;
    let ratingCount = 0;

    const refereesWithResponses = await Promise.all(
      referees.map(async (ref: any) => {
        if (ref.formStatus === "Complete") {
          const responses = await airtableService.getResponsesForReferee(ref.id);
          if (responses && responses.length > 0) {
            const latestResponse = responses[responses.length - 1];
            
            if (typeof latestResponse.overallRating === "number") {
              ratingSum += latestResponse.overallRating;
              ratingCount++;
            }

            return {
              ...ref,
              response: {
                answersJson: latestResponse.answersJson,
                overallRating: latestResponse.overallRating,
                wordCountTotal: latestResponse.wordCountTotal,
                fraudFlags: latestResponse.fraudFlags || "",
                fraudFlagDetails: latestResponse.fraudFlagDetails || "{}",
                submittedAt: latestResponse.submittedAt
              }
            };
          }
        }
        return ref;
      })
    );

    const overallAverageRating = ratingCount > 0 
      ? Number((ratingSum / ratingCount).toFixed(1))
      : null;

    const template = await airtableService.getQuestionnaireTemplateByName(candidate.assignedPackage);
    const questions = template ? JSON.parse(template.Questions_JSON) : [];

    return res.status(200).json({
      success: true,
      report: {
        candidate,
        referees: refereesWithResponses,
        questions,
        overallAverageRating
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Export candidate vetting report to PDF (Sprint 7)
app.post("/api/reports/:id/export", authMiddleware as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { refereeId } = req.body;
  try {
    const candidate = await airtableService.getCandidate(id);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    // Scoping check for Recruiter role
    if (req.user!.role === "Recruiter") {
      const creatorId = Array.isArray(candidate.createdBy) ? candidate.createdBy[0] : candidate.createdBy;
      if (creatorId !== req.user!.userId) {
        return res.status(403).json({ success: false, error: "Access Denied: Recruiter not authorized to export this candidate report" });
      }
    }

    const employer = await airtableService.getEmployer(req.user!.employerId);
    const brandedSenderName = employer ? employer.brandedSenderName || employer.companyName : "RefCheck";

    const referees = await airtableService.getRefereesForCandidate(id);
    const completedReferees = [];
    let ratingSum = 0;
    let ratingCount = 0;

    for (const ref of referees) {
      if (refereeId && ref.id !== refereeId) continue;
      if (ref.formStatus === "Complete") {
        const responses = await airtableService.getResponsesForReferee(ref.id);
        if (responses && responses.length > 0) {
          const latestResponse = responses[responses.length - 1];
          completedReferees.push({
            ...ref,
            response: latestResponse
          });
          if (typeof latestResponse.overallRating === "number") {
            ratingSum += latestResponse.overallRating;
            ratingCount++;
          }
        }
      }
    }

    const overallAverageRating = ratingCount > 0 
      ? Number((ratingSum / ratingCount).toFixed(1))
      : null;

    const template = await airtableService.getQuestionnaireTemplateByName(candidate.assignedPackage);
    const questions = template ? JSON.parse(template.Questions_JSON) : [];

    // Create PDF Kit Document (clean, white pages, normal borders - no giant blue side-blocks)
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });

    // Set headers
    const filename = refereeId 
      ? `Reference-Report-${referees.find((r: any) => r.id === refereeId)?.fullName.replace(/\s+/g, "-") || "Referee"}.pdf`
      : `Vetting-Report-${candidate.fullName.replace(/\s+/g, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    doc.pipe(res);

    // Helper: draw footer
    const drawFooter = (d: any, pageNum: number, totalPages: number) => {
      const oldBottom = d.page.margins.bottom;
      d.page.margins.bottom = 0;
      d.fontSize(8).fillColor("#5F6368");
      d.text(
        `Reference check conducted via ${brandedSenderName} | Page ${pageNum} of ${totalPages}`,
        40,
        810
      );
      d.page.margins.bottom = oldBottom;
    };

    // Helper to draw ISO seal and QR code in header
    const drawISOBadge = (d: any, x: number, y: number) => {
      d.save();
      // Draw border
      d.fillColor("#FFFFFF").roundedRect(x, y, 42, 45, 8).fill();
      d.strokeColor("#E2E8F0").lineWidth(0.75).roundedRect(x, y, 42, 45, 8).stroke();
      
      // Draw globe icon
      d.strokeColor("#7E22CE").lineWidth(0.75);
      d.circle(x + 21, y + 16.5, 8.5).stroke();
      d.ellipse(x + 21, y + 16.5, 8.5, 3.2).stroke();
      d.ellipse(x + 21, y + 16.5, 3.2, 8.5).stroke();
      
      // Write "ISO"
      d.fillColor("#7E22CE").fontSize(7.5).font("Helvetica-Bold");
      const tw = d.widthOfString("ISO");
      d.text("ISO", x + 21 - tw / 2, y + 31.5);
      d.restore();
    };

    const drawQRCode = (d: any, x: number, y: number) => {
      d.save();
      // Draw border
      d.fillColor("#FFFFFF").roundedRect(x, y, 42, 45, 8).fill();
      d.strokeColor("#E2E8F0").lineWidth(0.75).roundedRect(x, y, 42, 45, 8).stroke();
      
      // Draw simulated QR code dot grid
      d.fillColor("#1A1F2C");
      
      const x_start = x + 9;
      const y_start = y + 10.5;
      
      const drawFinder = (fx: number, fy: number) => {
        d.rect(fx, fy, 8, 8).fill();
        d.fillColor("#FFFFFF").rect(fx + 1.5, fy + 1.5, 5, 5).fill();
        d.fillColor("#1A1F2C").rect(fx + 2.5, fy + 2.5, 3, 3).fill();
      };
      
      // Top-Left
      drawFinder(x_start, y_start);
      // Top-Right
      drawFinder(x_start + 16, y_start);
      // Bottom-Left
      drawFinder(x_start, y_start + 16);
      
      // Reset fill color for small dots
      d.fillColor("#1A1F2C");
      
      const drawDot = (dx: number, dy: number) => {
        d.rect(dx, dy, 2, 2).fill();
      };
      
      // Additional QR code modules/dots matching standard layout
      drawDot(x_start + 10, y_start + 2);
      drawDot(x_start + 10, y_start + 6);
      drawDot(x_start + 10, y_start + 10);
      drawDot(x_start + 14, y_start + 6);
      drawDot(x_start + 14, y_start + 10);
      drawDot(x_start + 18, y_start + 10);
      drawDot(x_start + 18, y_start + 14);
      drawDot(x_start + 10, y_start + 18);
      drawDot(x_start + 14, y_start + 18);
      drawDot(x_start + 18, y_start + 18);
      drawDot(x_start + 22, y_start + 18);
      drawDot(x_start + 18, y_start + 22);
      drawDot(x_start + 22, y_start + 22);
      
      d.restore();
    };

    // Dynamic Header Logo & Powered Box (rendered on every page)
    const drawPageHeader = (d: any) => {
      // Left header: Logo / Brand
      const logoPath = path.resolve(process.cwd(), "client/src/assets/logo.png");
      if (fs.existsSync(logoPath)) {
        d.image(logoPath, 40, 20, { width: 22 });
        d.fillColor("#1A1F2C").fontSize(14).font("Helvetica-Bold").text("RefCheck", 68, 25);
      } else {
        d.fillColor("#1A1F2C").fontSize(14).font("Helvetica-Bold").text("RefCheck", 40, 30);
      }
      
      // Right header boxes
      // 1. Powered by RefCheck card
      d.fillColor("#F8F9FA").roundedRect(310, 20, 145, 45, 4).fill();
      d.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(310, 20, 145, 45, 4).stroke();
      
      d.fillColor("#5F6368").fontSize(6.5).font("Helvetica").text("POWERED BY", 320, 26);
      
      // Draw a small custom checkmark icon vectorially (removes the stray "'" character)
      d.save();
      d.strokeColor("#7E22CE").lineWidth(1.2).lineCap("round").lineJoin("round");
      d.moveTo(320, 37).lineTo(323, 40).lineTo(328, 34).stroke();
      d.restore();
      
      d.fillColor("#7E22CE").fontSize(9).font("Helvetica-Bold").text("RefCheck", 332, 33);
      d.fillColor("#70757A").fontSize(6).font("Helvetica").text("team@refcheck.tech  |  refcheck.tech", 320, 48);

      // 2. ISO seal badge
      drawISOBadge(d, 465, 20);

      // 3. QR code badge
      drawQRCode(d, 513, 20);

      d.strokeColor("#DADCE0").lineWidth(1).moveTo(40, 75).lineTo(555, 75).stroke();
    };

    // Draw page header on the first page
    drawPageHeader(doc);

    // --- PILL / BADGE DRAWING HELPERS ---
    const drawPill = (d: any, x: number, y: number, text: string, bgColor: string, textColor: string) => {
      d.save();
      d.fontSize(6).font("Helvetica-Bold");
      const labelWidth = d.widthOfString(text) + 8;
      d.fillColor(bgColor).roundedRect(x, y, labelWidth, 12, 3).fill();
      d.fillColor(textColor).text(text, x + 4, y + 3);
      d.restore();
    };

    const drawStatusPill = (d: any, x: number, y: number, text: string, status: "success" | "warning" | "neutral") => {
      d.save();
      let bgColor = "#F3F4F6";
      let textColor = "#4B5563";
      if (status === "success") {
        bgColor = "#F0FDF4";
        textColor = "#16A34A";
      } else if (status === "warning") {
        bgColor = "#FFF7ED";
        textColor = "#EA580C";
      }
      d.fontSize(6).font("Helvetica-Bold");
      const width = d.widthOfString(text) + 8;
      d.fillColor(bgColor).roundedRect(x, y, width, 12, 3).fill();
      d.fillColor(textColor).text(text, x + 4, y + 3);
      d.restore();
    };

    // --- CANDIDATE SUMMARY ---
    // Draw outer container border
    doc.fillColor("#FFFFFF").roundedRect(40, 85, 515, 120, 6).fill();
    doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(40, 85, 515, 120, 6).stroke();

    doc.fillColor("#1A1F2C").fontSize(10).font("Helvetica-Bold").text("CANDIDATE SUMMARY", 50, 95);

    // Summary Grid Layout (8 boxes of details)
    const candidateGrid = [
      { label: "Candidate Name", value: candidate.fullName, theme: "purple", x: 50, w: 122, y: 110 },
      { label: "Role & Department", value: candidate.roleAppliedFor || "Teacher", theme: "purple", x: 182, w: 122, y: 110 },
      { label: "Email", value: candidate.email, theme: "blue", x: 314, w: 122, y: 110 },
      { label: "Mobile", value: candidate.phone || "None", theme: "blue", x: 446, w: 99, y: 110 },

      { label: "Report Type", value: refereeId ? "Individual Reference" : "Reference Check", theme: "gray", x: 50, w: 254, y: 155 },
      { label: "Created", value: candidate.createdAt ? new Date(candidate.createdAt).toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: '2-digit' }) : "N/A", theme: "gray", x: 314, w: 72, y: 155 },
      { label: "Completed", value: candidate.candidateFormSubmittedAt ? new Date(candidate.candidateFormSubmittedAt).toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: '2-digit' }) : "N/A", theme: "gray", x: 396, w: 72, y: 155 },
      { label: "To Complete", value: "3 days", theme: "gray", x: 478, w: 67, y: 155 }
    ];

    candidateGrid.forEach((item) => {
      doc.fillColor("#F8F9FA").roundedRect(item.x, item.y, item.w, 38, 4).fill();
      doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(item.x, item.y, item.w, 38, 4).stroke();

      let pillBg = "#F3F4F6";
      let pillText = "#4B5563";
      if (item.theme === "purple") {
        pillBg = "#F3E8FF";
        pillText = "#9333EA";
      } else if (item.theme === "blue") {
        pillBg = "#E0F2FE";
        pillText = "#0284C7";
      }

      drawPill(doc, item.x + 8, item.y + 6, item.label.toUpperCase(), pillBg, pillText);
      doc.fillColor("#1A1F2C").fontSize(8).font("Helvetica").text(item.value, item.x + 8, item.y + 22, { width: item.w - 16, ellipsis: true });
    });

    // --- REPORT SUMMARY (REFEREE CARDS) ---
    let summaryY = 215;
    const reportSummaryHeight = 25 + 55 * completedReferees.length;

    // Draw outer container border
    doc.fillColor("#FFFFFF").roundedRect(40, summaryY, 515, reportSummaryHeight, 6).fill();
    doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(40, summaryY, 515, reportSummaryHeight, 6).stroke();

    doc.fillColor("#1A1F2C").fontSize(10).font("Helvetica-Bold").text("REPORT SUMMARY", 50, summaryY + 10);
    summaryY += 25;

    for (const ref of completedReferees) {
      // Draw single row for the referee (width 495, starts at X=50)
      doc.fillColor("#F8F9FA").roundedRect(50, summaryY, 495, 45, 4).fill();
      doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(50, summaryY, 495, 45, 4).stroke();

      // Column 1: Referee Name & Relationship
      drawPill(doc, 60, summaryY + 6, "REFEREE", "#F3F4F6", "#4B5563");
      doc.fillColor("#1A1F2C").fontSize(8).font("Helvetica-Bold").text(ref.fullName, 60, summaryY + 20, { width: 105, ellipsis: true });
      doc.fillColor("#5F6368").fontSize(7).font("Helvetica").text(ref.relationship, 60, summaryY + 30, { width: 105, ellipsis: true });

      // Column 2: Email & Domain Badge
      drawPill(doc, 175, summaryY + 6, "EMAIL", "#F3F4F6", "#4B5563");
      doc.fillColor("#1A1F2C").fontSize(8).font("Helvetica").text(ref.email, 175, summaryY + 20, { width: 120, ellipsis: true });
      const isPersonal = ref.email.includes("gmail") || ref.email.includes("yahoo") || ref.email.includes("outlook") || ref.email.includes("hotmail");
      if (isPersonal) {
        drawStatusPill(doc, 175, summaryY + 30, "NON-COMPANY EMAIL", "warning");
      } else {
        drawStatusPill(doc, 175, summaryY + 30, "WORK EMAIL", "success");
      }

      // Column 3: Phone
      drawPill(doc, 305, summaryY + 6, "PHONE", "#F3F4F6", "#4B5563");
      doc.fillColor("#1A1F2C").fontSize(8).font("Helvetica").text(ref.phone || "None", 305, summaryY + 20, { width: 65, ellipsis: true });

      // Column 4: LinkedIn
      drawPill(doc, 380, summaryY + 6, "LINKEDIN", "#F3F4F6", "#4B5563");
      doc.fillColor("#1A1F2C").fontSize(8).font("Helvetica").text("-", 380, summaryY + 20, { width: 80 });
      drawStatusPill(doc, 380, summaryY + 30, "NO INFO PROVIDED", "warning");

      // Column 5: IP Address & Shared Status
      drawPill(doc, 470, summaryY + 6, "IP ADDRESS", "#F3F4F6", "#4B5563");
      const ip = ref.response?.ipAddress || "127.0.0.1";
      doc.fillColor("#1A1F2C").fontSize(8).font("Helvetica").text(ip, 470, summaryY + 20, { width: 65, ellipsis: true });
      const isSharedIp = candidate.candidateSubmissionIp && candidate.candidateSubmissionIp === ip;
      if (isSharedIp) {
        drawStatusPill(doc, 470, summaryY + 30, "SHARED IP ADDRESS", "warning");
      } else {
        drawStatusPill(doc, 470, summaryY + 30, "UNIQUE IP ADDRESS", "success");
      }

      summaryY += 55;
    }

    // --- VERIFICATION QUESTIONS (Side-by-Side Cards) ---
    const verStartY = summaryY + 10;
    const verStartPage = doc.bufferedPageRange().count - 1;

    doc.fillColor("#1A1F2C").fontSize(10).font("Helvetica-Bold").text("VERIFICATION QUESTIONS", 50, verStartY + 10);
    let qaY = verStartY + 25;

    // Define verification QIDs mapping (to match Candidate's stated info)
    const verificationMap: Record<string, { candidateLabel: string, refLabel: string, field: string }> = {
      "q_gp1": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "employerName" },
      "q_gp2": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "relationship" },
      "q_gp3": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "datesFrom" }, // datesFrom / datesTo combo
      "q_gp4": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "jobTitle" },
      "q_gp5": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "reasonForLeaving" },
      
      "q_ece_1": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "employerName" },
      "q_ece_2": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "relationship" },
      "q_ece_3": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "datesFrom" },
      "q_ece_4": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "jobTitle" },
      "q_ece_5": { candidateLabel: "Candidate Stated", refLabel: "Referee Confirmed", field: "reasonForLeaving" }
    };

    // Filter verification questions
    const verificationQIds = ["q_gp1", "q_gp2", "q_gp3", "q_gp4", "q_gp5", "q_ece_1", "q_ece_2", "q_ece_3", "q_ece_4", "q_ece_5"];
    const verificationQuestions = questions.filter((q: any) => verificationQIds.includes(q.id));
    const normalQuestions = questions.filter((q: any) => !verificationQIds.includes(q.id));

    let verIndex = 1;
    for (const ref of completedReferees) {
      let refAnswers = [];
      try {
        refAnswers = JSON.parse(ref.response.answersJson || "[]");
      } catch (e) {}

      for (const q of verificationQuestions) {
        const mapping = verificationMap[q.id];
        const ans = refAnswers.find((a: any) => a.id === q.id);
        const ansVal = ans ? String(ans.value) : "No response provided.";

        // Resolve candidate's stated value
        let candidateVal = "Not provided";
        if (mapping) {
          if (mapping.field === "datesFrom") {
            candidateVal = `${ref.datesFrom || ""} to ${ref.datesTo || "Present"}`;
          } else if (mapping.field === "reasonForLeaving") {
            const isStillWorking = !ref.datesTo || ref.datesTo.toLowerCase().includes("present") || ref.datesTo.toLowerCase() === "still working";
            candidateVal = isStillWorking 
              ? `Still working at ${ref.employerName || "employer"}` 
              : "Finished employment / Not provided";
          } else {
            candidateVal = (ref as any)[mapping.field] || "Not provided";
          }
        }

        // Calculate dynamic height based on candidate stating value vs referee answered value
        doc.font("Helvetica").fontSize(8);
        const candidateHeight = doc.heightOfString(candidateVal, { width: 224 }) + 30;
        const refereeHeight = doc.heightOfString(ansVal, { width: 224 }) + 30;
        const boxHeight = Math.max(candidateHeight, refereeHeight, 38);

        // Check overflow for the next double-box card
        doc.font("Helvetica-Bold").fontSize(9);
        const labelHeight = doc.heightOfString(q.label, { width: 495 }) + 10;
        const totalHeight = labelHeight + boxHeight + 20;

        if (qaY + totalHeight > 770) {
          doc.addPage();
          drawPageHeader(doc);
          qaY = 90;
        }

        // Draw question index & text
        doc.fillColor("#70757A").fontSize(8).font("Helvetica-Bold").text(`${verIndex}/${questions.length}`, 50, qaY);
        doc.fillColor("#1A1F2C").fontSize(9).font("Helvetica-Bold").text(q.label, 50, qaY + 10, { width: 495 });
        
        qaY += labelHeight;

        // Candidate box (Left) - dynamically titled with candidate's name in purple
        doc.fillColor("#F8F9FA").roundedRect(50, qaY, 240, boxHeight, 4).fill();
        doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(50, qaY, 240, boxHeight, 4).stroke();
        drawPill(doc, 58, qaY + 6, candidate.fullName.toUpperCase(), "#F3E8FF", "#9333EA");
        doc.fillColor("#5F6368").fontSize(8).font("Helvetica").text(candidateVal, 58, qaY + 22, { width: 224 });

        // Referee box (Right) - dynamically titled with referee's name in grey
        doc.fillColor("#FFFFFF").roundedRect(305, qaY, 240, boxHeight, 4).fill();
        doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(305, qaY, 240, boxHeight, 4).stroke();
        drawPill(doc, 313, qaY + 6, ref.fullName.toUpperCase(), "#F3F4F6", "#4B5563");
        doc.fillColor("#1A1F2C").fontSize(8).font("Helvetica").text(ansVal, 313, qaY + 22, { width: 224 });

        qaY += boxHeight + 10;
        verIndex++;
      }
    }

    // Draw container border on Page 1 (index 0) for Verification Questions
    if (verStartPage === 0) {
      const verEndPage = doc.bufferedPageRange().count - 1;
      doc.save();
      doc.switchToPage(0);
      if (verEndPage === 0) {
        doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(40, verStartY, 515, qaY - verStartY - 5, 6).stroke();
      } else {
        doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(40, verStartY, 515, 760 - verStartY, 6).stroke();
      }
      doc.restore();
      doc.switchToPage(verEndPage); // Restore page context
    }

    // --- CUSTOM & REMAINING QUESTIONS ---
    const customStartY = qaY;
    const customStartPage = doc.bufferedPageRange().count - 1;

    doc.fillColor("#1A1F2C").fontSize(10).font("Helvetica-Bold").text("CUSTOM QUESTIONS", 50, qaY + 10);
    qaY += 25;

    for (const ref of completedReferees) {
      let refAnswers = [];
      try {
        refAnswers = JSON.parse(ref.response.answersJson || "[]");
      } catch (e) {}

      for (const q of normalQuestions) {
        const ans = refAnswers.find((a: any) => a.id === q.id);
        const ansValue = ans ? ans.value : null;

        // Prepare answer text
        let ansText = "No response provided.";
        if (ansValue !== null && ansValue !== undefined) {
          ansText = String(ansValue);
        }

        // Calculate card height dynamically
        let cardHeight = 20;
        if (q.type === "rating") {
          cardHeight = 20;
        } else if (q.type === "yes_no" || q.type === "boolean") {
          cardHeight = 20;
        } else {
          doc.font("Helvetica").fontSize(8.5);
          cardHeight = doc.heightOfString(ansText, { width: 465, lineGap: 1.2 }) + 10;
          if (cardHeight < 20) cardHeight = 20;
        }

        // Check page overflow (approx question label + card height)
        doc.font("Helvetica-Bold").fontSize(9);
        const labelHeight = doc.heightOfString(q.label, { width: 495 }) + 10;
        const totalHeight = labelHeight + cardHeight + 8;

        if (qaY + totalHeight > 770) {
          doc.addPage();
          drawPageHeader(doc);
          qaY = 100;
        }

        // Draw Question Label (Full width inside container)
        doc.fillColor("#70757A").fontSize(8).font("Helvetica-Bold").text(`${verIndex}/${questions.length}`, 50, qaY);
        doc.fillColor("#1A1F2C").fontSize(9).font("Helvetica-Bold").text(q.label, 50, qaY + 10, { width: 495 });
        qaY += labelHeight;

        // Draw Container Card (Full width inside container: 495)
        doc.fillColor("#FFFFFF").roundedRect(50, qaY, 495, cardHeight, 4).fill();
        doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(50, qaY, 495, cardHeight, 4).stroke();

        if (q.type === "rating") {
          const rating = Number(ansValue) || 0;
          const startX = 60;
          for (let i = 1; i <= 5; i++) {
            const numX = startX + (i - 1) * 20;
            const cx = numX + 4;
            const cy = qaY + 10;
            
            if (i === rating) {
              // Highlight active rating in purple circle
              doc.save();
              doc.fillColor("#7E22CE").circle(cx, cy, 7).fill();
              doc.fillColor("#FFFFFF").fontSize(7.5).font("Helvetica-Bold");
              const tw = doc.widthOfString(String(i));
              doc.text(String(i), cx - tw / 2, cy - 3.5);
              doc.restore();
            } else {
              // Dim inactive ratings
              doc.fillColor("#BDC1C6").fontSize(7.5).font("Helvetica");
              const tw = doc.widthOfString(String(i));
              doc.text(String(i), cx - tw / 2, cy - 3.5);
            }
          }
        } else if (q.type === "yes_no" || q.type === "boolean") {
          const isYes = ansText.toLowerCase().startsWith("yes");
          const isNo = ansText.toLowerCase().startsWith("no");
          if (isYes) {
            doc.fillColor("#16A34A").fontSize(8.5).font("Helvetica-Bold").text(ansText, 60, qaY + 5);
          } else if (isNo) {
            doc.fillColor("#D93025").fontSize(8.5).font("Helvetica-Bold").text(ansText, 60, qaY + 5);
          } else {
            doc.fillColor("#1A1F2C").fontSize(8.5).font("Helvetica").text(ansText, 60, qaY + 5);
          }
        } else {
          // Open-text question: left indicator vertical line and offset text
          doc.strokeColor("#DADCE0").lineWidth(1.5).moveTo(60, qaY + 5).lineTo(60, qaY + cardHeight - 5).stroke();
          doc.fillColor("#1A1F2C").fontSize(8.5).font("Helvetica").text(ansText, 68, qaY + 5, { width: 465, lineGap: 1.2 });
        }

        qaY += cardHeight + 8;
        verIndex++;
      }
    }

    // Draw container border on Page 1 (index 0) for Custom Questions
    if (customStartPage === 0) {
      const customEndPage = doc.bufferedPageRange().count - 1;
      doc.save();
      doc.switchToPage(0);
      if (customEndPage === 0) {
        doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(40, customStartY, 515, qaY - customStartY - 5, 6).stroke();
      } else {
        doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(40, customStartY, 515, 760 - customStartY, 6).stroke();
      }
      doc.restore();
      doc.switchToPage(customEndPage); // Restore page context
    }

    // --- REFCHECK DISCLAIMER BOX ---
    const disclaimerText = "RefCheck is committed to providing accurate and up-to-date information to the best of its abilities. However, please note that the information presented by RefCheck may not always be entirely accurate, complete, or current. Due to the dynamic nature of information and the vast amount of data available, it is possible that some information may be inaccurate, outdated, or subject to change. RefCheck does not assume any responsibility or liability for any errors, inaccuracies, omissions, or inconsistencies in the information provided. Users rely on the information provided by RefCheck at their own risk.";
    doc.font("Helvetica").fontSize(7);
    const discHeight = doc.heightOfString(disclaimerText, { width: 475, lineGap: 1.5 });
    
    if (qaY + discHeight + 35 > 770) {
      doc.addPage();
      drawPageHeader(doc);
      qaY = 100;
    }

    qaY += 10;
    doc.fillColor("#FFFFFF").roundedRect(50, qaY, 495, discHeight + 18, 4).fill();
    doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(50, qaY, 495, discHeight + 18, 4).stroke();

    doc.fillColor("#70757A").fontSize(6.5).font("Helvetica-Bold").text("REFCHECK DISCLAIMER", 60, qaY + 6);
    doc.fillColor("#70757A").fontSize(7).font("Helvetica").text(disclaimerText, 60, qaY + 14, { width: 475, lineGap: 1.5 });

    const disclaimerEndY = qaY + discHeight + 18;
    const disclaimerPageIndex = doc.bufferedPageRange().count - 1;

    // --- FINALIZE FOOTERS & CONTAINERS ---
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      
      if (i > 0) {
        if (i === disclaimerPageIndex) {
          // Last page containing the disclaimer box
          const borderHeight = disclaimerEndY - 85 + 5;
          doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(40, 85, 515, borderHeight, 6).stroke();
        } else {
          // Intermediate full page
          doc.strokeColor("#DADCE0").lineWidth(0.5).roundedRect(40, 85, 515, 700, 6).stroke();
        }
      }

      drawFooter(doc, i + 1, pages.count);
    }

    doc.end();
  } catch (err: any) {
    console.error("PDF generation endpoint failed:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to generate report" });
  }
});

// Fetch candidate's referees using candidate token (Public Candidate Portal)
app.get("/api/candidates/by-token/:token/referees", async (req, res) => {
  const { token } = req.params;
  try {
    const candidate = await airtableService.getCandidateByToken(token);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    // Verify expiration manually
    if (candidate.tokenExpiresAt && new Date() > new Date(candidate.tokenExpiresAt)) {
      return res.status(403).json({ success: false, error: "Link expired or invalid" });
    }
    const referees = await airtableService.getRefereesForCandidate(candidate.id);
    return res.status(200).json({ success: true, candidate, referees });
  } catch (err: any) {
    return res.status(403).json({ success: false, error: "Link expired or invalid" });
  }
});

// Submit nominated referees for a candidate
app.post("/api/candidates/:id/referees", async (req, res) => {
  const { id } = req.params;
  const { referees } = req.body;

  if (!referees || !Array.isArray(referees) || referees.length === 0) {
    return res.status(400).json({ success: false, error: "At least one referee nomination is required" });
  }

  try {
    const candidate = await airtableService.getCandidate(id);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    // Record candidate submission IP
    const ipAddress = (req.headers["x-forwarded-for"] as string || req.ip || "127.0.0.1").split(",")[0].trim();
    const isLoopback = ipAddress === "127.0.0.1" || ipAddress === "::1" || ipAddress === "::ffff:127.0.0.1";
    if (!candidate.candidateSubmissionIp || (!isLoopback && candidate.candidateSubmissionIp !== ipAddress)) {
      await airtableService.updateCandidateFields(id, {
        candidateSubmissionIp: ipAddress
      });
      candidate.candidateSubmissionIp = ipAddress;
    }

    const employerId = Array.isArray(candidate.employer) ? candidate.employer[0] : candidate.employer;
    
    // Fetch any already existing referees for this candidate to prevent duplicates on retries
    const existingReferees = await airtableService.getRefereesForCandidate(id);

    // Create each referee in Airtable and dispatch invites
    const createdReferees = [];
    for (const ref of referees) {
      // Look for an existing referee with the same email (case-insensitive)
      const existingRef = existingReferees.find((r: any) => r.email && r.email.toLowerCase() === ref.email.toLowerCase());

      let refereeRecord;
      if (existingRef) {
        refereeRecord = existingRef;
        console.log(`[Referee Submit] Referee with email ${ref.email} already exists for candidate ${id}. Reusing record.`);
        
        // Re-send invitation details only if it hasn't been sent or completed
        if (existingRef.formStatus === "Not Sent" || !existingRef.formStatus) {
          const token = existingRef.refereeToken || existingRef.token;
          await emailService.sendRefereeInvite(ref.fullName, ref.email, candidate.fullName, candidate.employerName, token);
          await smsService.sendRefereeInvite(ref.fullName, ref.phone || "", candidate.fullName, candidate.employerName, token);
          await airtableService.updateRefereeFields(existingRef.id, {
            formStatus: "Sent",
            emailSentAt: new Date().toISOString(),
            smsSentAt: new Date().toISOString()
          });
          refereeRecord.formStatus = "Sent";
        }
      } else {
        const refereeToken = crypto.randomBytes(8).toString("hex");

        refereeRecord = await airtableService.createReferee({
          fullName: ref.fullName,
          email: ref.email,
          phone: ref.phone || "",
          relationship: ref.relationship,
          employerName: ref.employerName || "",
          jobTitle: ref.jobTitle || "",
          datesFrom: ref.datesFrom || "",
          datesTo: ref.datesTo || "",
          candidateId: id,
          refereeToken
        });

        // Dispatch dynamic SendGrid invitation email & Twilio SMS (simulated in mock/dev mode)
        await emailService.sendRefereeInvite(ref.fullName, ref.email, candidate.fullName, candidate.employerName, refereeToken);
        await smsService.sendRefereeInvite(ref.fullName, ref.phone || "", candidate.fullName, candidate.employerName, refereeToken);

        // Update status to 'Sent' and record timestamps
        await airtableService.updateRefereeFields(refereeRecord.id, {
          formStatus: "Sent",
          emailSentAt: new Date().toISOString(),
          smsSentAt: new Date().toISOString()
        });

        refereeRecord.formStatus = "Sent";
      }

      createdReferees.push({ ...refereeRecord, formStatus: "Sent" });
    }

    // Register Reference Request tracking record
    await airtableService.createReferenceRequest({
      candidateId: id,
      employerId: employerId,
      status: "In Progress"
    });

    // Update candidate checklist status
    await airtableService.updateCandidateStatus(id, "Referees Submitted");

    // Send SendGrid notification email to employer recruiter
    const recruiterEmail = await getRecruiterEmail(candidate);
    await emailService.sendEmployerNotification(recruiterEmail, candidate.fullName);

    return res.status(200).json({ success: true, referees: createdReferees });
  } catch (err: any) {
    console.error("Referee submit route error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Candidate submits a substitute referee profile
app.post("/api/candidates/:id/substitute", async (req, res) => {
  const { id } = req.params;
  const { referee, originalRefereeId } = req.body;

  if (!referee || !referee.fullName || !referee.email || !referee.phone) {
    return res.status(400).json({ success: false, error: "Missing required substitute referee fields" });
  }

  try {
    const candidate = await airtableService.getCandidate(id);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    // Generate refereeToken
    const refereeToken = crypto.randomBytes(8).toString("hex");

    // Create substitute referee record
    const substituteRecord = await airtableService.createReferee({
      fullName: referee.fullName,
      email: referee.email,
      phone: referee.phone,
      relationship: referee.relationship || "Manager",
      employerName: referee.employerName || "",
      jobTitle: referee.jobTitle || "",
      datesFrom: referee.datesFrom || "",
      datesTo: referee.datesTo || "",
      candidateId: id,
      refereeToken
    });

    // Mark original referee as 'Substituted' if originalRefereeId was provided
    if (originalRefereeId) {
      await airtableService.updateRefereeFields(originalRefereeId, {
        formStatus: "Substituted"
      });
    }

    // Set fields for substitute referee
    await airtableService.updateRefereeFields(substituteRecord.id, {
      formStatus: "Sent",
      isSubstitute: true,
      substituteFor: originalRefereeId || "",
      emailSentAt: new Date().toISOString(),
      smsSentAt: new Date().toISOString()
    });

    // Dispatch dispatches
    await emailService.sendRefereeInvite(referee.fullName, referee.email, candidate.fullName, candidate.employerName, refereeToken);
    await smsService.sendRefereeInvite(referee.fullName, referee.phone, candidate.fullName, candidate.employerName, refereeToken);

    // Notify recruiter
    const recruiterEmail = await getRecruiterEmail(candidate);
    await emailService.sendEmployerSubstituteAlert(recruiterEmail, candidate.fullName, referee.fullName);

    return res.status(200).json({ success: true, referee: { ...substituteRecord, formStatus: "Sent" } });
  } catch (err: any) {
    console.error("Substitute referee route error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Fetch referee details by public token (Sprint 4)
app.get("/api/referees/by-token/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const referee = await airtableService.getRefereeByToken(token);
    if (!referee) {
      return res.status(404).json({ success: false, error: "Referee token not found" });
    }

    // Verify expiration manually
    if (referee.tokenExpiresAt && new Date() > new Date(referee.tokenExpiresAt)) {
      return res.status(403).json({ success: false, error: "Link expired or invalid" });
    }

    // Update status to 'Opened' and record formOpenedAt timestamp if not already set
    if (referee.formStatus === "Sent" || referee.formStatus === "Not Sent") {
      await airtableService.updateRefereeFields(referee.id, {
        formStatus: "Opened",
        formOpenedAt: new Date().toISOString()
      });
      referee.formStatus = "Opened";
      referee.formOpenedAt = new Date().toISOString();
    }

    const candidateId = Array.isArray(referee.candidate) ? referee.candidate[0] : referee.candidate;
    const candidate = await airtableService.getCandidate(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate associated with this referee not found" });
    }

    // Resolve assigned template from candidate assignedPackage
    const template = await airtableService.getQuestionnaireTemplateByName(candidate.assignedPackage);
    if (!template) {
      return res.status(404).json({ success: false, error: "Assigned questionnaire template not found" });
    }

    return res.status(200).json({
      success: true,
      referee: {
        id: referee.id,
        fullName: referee.fullName,
        relationship: referee.relationship,
        employerName: referee.employerName,
        formStatus: referee.formStatus,
        answersJson: referee.answersJson || "[]"
      },
      candidate: {
        fullName: candidate.fullName,
        roleAppliedFor: candidate.roleAppliedFor,
        employerName: candidate.employerName
      },
      questions: JSON.parse(template.Questions_JSON),
      branchingRules: JSON.parse(template.Branching_Rules_JSON || "[]")
    });
  } catch (err: any) {
    return res.status(403).json({ success: false, error: "Link expired or invalid" });
  }
});

// Submit referee responses or partial auto-saves (Sprint 4)
app.post("/api/referees/:id/response", async (req, res) => {
  const { id } = req.params;
  const { answersJson, ipAddress, submissionDurationSeconds, isSubmit = false } = req.body;

  try {
    const referee = await airtableService.getReferee(id);
    if (!referee) {
      return res.status(404).json({ success: false, error: "Referee not found" });
    }

    if (!isSubmit) {
      // Auto-save partial progress
      await airtableService.updateRefereeFields(id, {
        formStatus: "In Progress",
        answersJson: answersJson
      });
      return res.status(200).json({ success: true, message: "Progress saved" });
    }

    // Final submission processing
    const answers = JSON.parse(answersJson || "[]");
    
    // Calculate overallRating (average of all rating type answers) and wordCount
    let ratingSum = 0;
    let ratingCount = 0;
    let textWords = 0;

    answers.forEach((ans: any) => {
      if (ans.type === "rating" && typeof ans.value === "number") {
        ratingSum += ans.value;
        ratingCount++;
      }
      if ((ans.type === "short_text" || ans.type === "long_text") && typeof ans.value === "string") {
        textWords += ans.value.split(/\s+/).filter(Boolean).length;
      }
    });

    const overallRating = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : 5.0;

    // Fetch candidate details
    const candidateId = Array.isArray(referee.candidate) ? referee.candidate[0] : referee.candidate;
    const candidate = await airtableService.getCandidate(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    // Resolve assigned template from candidate assignedPackage
    const template = await airtableService.getQuestionnaireTemplateByName(candidate.assignedPackage);
    const questions = template ? JSON.parse(template.Questions_JSON) : [];

    const duration = Number(submissionDurationSeconds) || 120;
    const refereeSubmissionIp = ipAddress || req.ip || "127.0.0.1";

    // Run Fraud Detection
    const fraudResult = detectFraud({
      refereeEmail: referee.email,
      refereeRelationship: referee.relationship,
      refereeEmployerName: referee.employerName,
      refereeSubmissionIp,
      candidateSubmissionIp: candidate.candidateSubmissionIp,
      submissionDurationSeconds: duration,
      answers,
      questions
    });

    const hasFlags = fraudResult.flags.length > 0;
    const fraudFlagsStr = fraudResult.flags.join(",");
    const fraudFlagDetailsStr = JSON.stringify(fraudResult.details);

    // Create Referee Response record with fraud detection flags
    await airtableService.createRefereeResponse({
      refereeId: id,
      answersJson,
      overallRating,
      wordCountTotal: textWords,
      ipAddress: refereeSubmissionIp,
      fraudFlags: fraudFlagsStr,
      fraudFlagDetails: fraudFlagDetailsStr
    });

    // Update Referee record status
    await airtableService.updateRefereeFields(id, {
      formStatus: "Complete",
      formCompletedAt: new Date().toISOString(),
      submissionDurationSeconds: duration,
      submissionIpAddress: refereeSubmissionIp
    });

    // Resolve Candidate overall check status
    const refereesList = await airtableService.getRefereesForCandidate(candidateId);
    const allCompleted = refereesList.every((r: any) => r.id === id || r.formStatus === "Complete");
    
    // Check if ANY completed response has fraud flags
    let anyFraudFlagged = hasFlags;
    if (!anyFraudFlagged) {
      for (const r of refereesList) {
        if (r.id !== id && r.formStatus === "Complete") {
          const resp = await airtableService.getResponsesForReferee(r.id);
          if (resp && resp.some((res: any) => res.fraudFlags && res.fraudFlags.trim() !== "")) {
            anyFraudFlagged = true;
            break;
          }
        }
      }
    }

    let newStatus = "In Progress";
    if (anyFraudFlagged) {
      newStatus = "Flagged";
    } else if (allCompleted) {
      newStatus = "Complete";
    }
    
    await airtableService.updateCandidateStatus(candidateId, newStatus);

    
    // Recruiter notification email
    const recruiterEmail = await getRecruiterEmail(candidate);
    await emailService.sendEmail({
      to: recruiterEmail,
      subject: `Reference Completed: ${referee.fullName} for ${candidate.fullName}`,
      text: `Hi Recruiter,\n\nReferee ${referee.fullName} has completed the questionnaire for candidate ${candidate.fullName}.\n\nOverall Rating: ${overallRating}/5\nWord Count: ${textWords} words\n\n${
        allCompleted 
          ? `Status Alert: All reference checks for candidate ${candidate.fullName} are now COMPLETE. You can generate the final PDF report.` 
          : `Candidate status is currently In Progress. We are still awaiting the remaining referees.`
      }\n\nBest regards,\nRefCheck Team`
    });

    return res.status(200).json({ success: true, allCompleted });
  } catch (err: any) {
    console.error("Referee response submission error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Resend referee invite and reset nudges (Recruiter Dashboard)
app.patch("/api/referees/:id/resend", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const referee = await airtableService.getReferee(id);
    if (!referee) {
      return res.status(404).json({ success: false, error: "Referee not found" });
    }

    const candidateId = Array.isArray(referee.candidate) ? referee.candidate[0] : referee.candidate;
    const candidate = await airtableService.getCandidate(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    // Reset nudge timestamps and set status to Sent
    await airtableService.updateRefereeFields(id, {
      formStatus: "Sent",
      nudge1SentAt: null,
      nudge2SentAt: null,
      employerAlertedAt: null,
      emailSentAt: new Date().toISOString(),
      smsSentAt: new Date().toISOString()
    });

    // Re-dispatch dispatches
    await emailService.sendRefereeInvite(referee.fullName, referee.email, candidate.fullName, candidate.employerName, referee.refereeToken);
    await smsService.sendRefereeInvite(referee.fullName, referee.phone, candidate.fullName, candidate.employerName, referee.refereeToken);

    return res.status(200).json({ success: true, message: "Referee invitation resent successfully." });
  } catch (err: any) {
    console.error("Referee resend route error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Delete referee invitation (Recruiter Dashboard)
app.delete("/api/referees/:id", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const referee = await airtableService.getReferee(id);
    if (!referee) {
      return res.status(404).json({ success: false, error: "Referee not found" });
    }

    await airtableService.deleteReferee(id);

    return res.status(200).json({ success: true, message: "Referee deleted successfully." });
  } catch (err: any) {
    console.error("Referee delete route error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Reassign referee to a different contact (Recruiter Dashboard)
app.patch("/api/referees/:id/reassign", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { fullName, email, phone, relationship, employerName, jobTitle } = req.body;

  if (!fullName || !email || !phone) {
    return res.status(400).json({ success: false, error: "Name, email, and phone are required for reassignment." });
  }

  try {
    const originalReferee = await airtableService.getReferee(id);
    if (!originalReferee) {
      return res.status(404).json({ success: false, error: "Original referee not found" });
    }

    const candidateId = Array.isArray(originalReferee.candidate) ? originalReferee.candidate[0] : originalReferee.candidate;
    const candidate = await airtableService.getCandidate(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    // Mark original referee as 'Substituted'
    await airtableService.updateRefereeFields(id, {
      formStatus: "Substituted"
    });

    const refereeToken = crypto.randomBytes(8).toString("hex");

    // Create new referee
    const newReferee = await airtableService.createReferee({
      fullName,
      email,
      phone,
      relationship: relationship || originalReferee.relationship,
      employerName: employerName || originalReferee.employerName,
      jobTitle: jobTitle || originalReferee.jobTitle,
      datesFrom: originalReferee.datesFrom || "",
      datesTo: originalReferee.datesTo || "",
      candidateId,
      refereeToken
    });

    // Dispatch invites immediately and set state
    await airtableService.updateRefereeFields(newReferee.id, {
      formStatus: "Sent",
      isSubstitute: true,
      substituteFor: id,
      emailSentAt: new Date().toISOString(),
      smsSentAt: new Date().toISOString()
    });

    await emailService.sendRefereeInvite(fullName, email, candidate.fullName, candidate.employerName, refereeToken);
    await smsService.sendRefereeInvite(fullName, phone, candidate.fullName, candidate.employerName, refereeToken);

    return res.status(200).json({ success: true, newReferee: { ...newReferee, formStatus: "Sent" } });
  } catch (err: any) {
    console.error("Referee reassignment route error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// --- Questionnaire Templates REST APIs (Sprint 2) ---

// Get all templates (System templates + Recruiter Custom Templates)
app.get("/api/questionnaire-templates", authMiddleware as any, async (req: AuthenticatedRequest, res) => {
  try {
    const templates = await airtableService.getQuestionnaireTemplates(req.user!.employerId);
    return res.status(200).json({ success: true, templates });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Get single template details
app.get("/api/questionnaire-templates/:id", authMiddleware as any, async (req: AuthenticatedRequest, res) => {
  try {
    const template = await airtableService.getQuestionnaireTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    return res.status(200).json({ success: true, template });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Create new template
app.post("/api/questionnaire-templates", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  const { Name, Description, Industry, Questions_JSON, Branching_Rules_JSON } = req.body;
  if (!Name || !Industry) {
    return res.status(400).json({ success: false, error: "Name and Industry fields are required" });
  }

  try {
    const template = await airtableService.createQuestionnaireTemplate({
      Name,
      Description,
      Industry,
      Questions_JSON: Questions_JSON || "[]",
      Branching_Rules_JSON: Branching_Rules_JSON || "[]",
      Created_By: req.user!.userId,
    });
    return res.status(200).json({ success: true, template });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Update template
app.patch("/api/questionnaire-templates/:id", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  const { Name, Description, Questions_JSON, Branching_Rules_JSON, Status } = req.body;
  try {
    const template = await airtableService.updateQuestionnaireTemplate(req.params.id, {
      Name,
      Description,
      Questions_JSON,
      Branching_Rules_JSON,
      Status
    });
    return res.status(200).json({ success: true, template });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Soft Delete template
app.delete("/api/questionnaire-templates/:id", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  try {
    const success = await airtableService.deleteQuestionnaireTemplate(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: "Template not found or could not be archived" });
    }
    return res.status(200).json({ success: true, message: "Template archived successfully" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Duplicate template
app.post("/api/questionnaire-templates/:id/duplicate", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  try {
    const template = await airtableService.duplicateQuestionnaireTemplate(req.params.id, req.user!.userId);
    return res.status(200).json({ success: true, template });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Gemini Question Generator endpoint (Sprint 2)
app.post("/api/ai/generate-questions", authMiddleware as any, requireRole(["Admin", "Recruiter"]) as any, async (req: AuthenticatedRequest, res) => {
  const { jobDescription, industry, questionCount = 10 } = req.body;

  if (!jobDescription) {
    return res.status(400).json({ success: false, error: "Job description text is required" });
  }

  // Fallback: If Gemini API key is missing or calls fail, return structured mock questions
  if (!geminiApiKey) {
    console.log("[Gemini Mock Mode] Simulating question generation...");
    const mockQuestions = [
      { id: "ai_q1", type: "rating", label: `Rate the candidate's core alignment with the ${industry || "General"} industry requirements described.`, description: "Technical capability rating", required: true, order: 1 },
      { id: "ai_q2", type: "long_text", label: "Describe a specific challenge from the job description that you saw this candidate solve.", description: "Problem-solving assessment", required: true, order: 2 },
      { id: "ai_q3", type: "yes_no", label: "Would you hire them for the responsibilities detailed in this JD again?", description: "Safeguard check", required: true, order: 3, risk_rule: { condition: "equals", value: "no", severity: "high" } },
      { id: "ai_q4", type: "rating", label: "Rate their team collaboration and peer communication skillsets.", description: "1 to 5 stars", required: false, order: 4 }
    ];
    return res.status(200).json({ success: true, questions: mockQuestions });
  }

  try {
    const systemPrompt = `You are an expert HR consultant specialized in New Zealand and Australian employment standards. 
Analyze the following Job Description (JD) and generate a structured list of reference questionnaire check questions (approximately ${questionCount} questions).
Return ONLY a valid JSON array of question objects matching this exact TypeScript structure:
interface Question {
  id: string; // unique short key, e.g. "q_001", "q_002"
  type: "short_text" | "long_text" | "rating" | "yes_no" | "dropdown";
  label: string; // the question displayed to the referee
  description: string; // helper explanation
  required: boolean;
  order: number;
  options?: string[]; // array of strings, ONLY for dropdown types
}
Ensure the questions cover child safety/regulatory compliance if it is an ECE/Healthcare role.
Return ONLY the raw JSON array string.`;

    const promptText = `${systemPrompt}\n\nJob Description:\n${jobDescription}\nIndustry Context: ${industry || "General"}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: promptText
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    let rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "[]";
    
    // Sanitize output (remove markdown blocks if model ignored prompt instructions)
    if (rawOutput.startsWith("```")) {
      rawOutput = rawOutput.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    }

    const questions = JSON.parse(rawOutput);
    return res.status(200).json({ success: true, questions });
  } catch (err: any) {
    console.error("Gemini generator error:", err);
    // Graceful fallback for API limits/timeouts
    return res.status(200).json({ 
      success: true, 
      warning: "AI temporarily unavailable. Loaded default template questions.",
      questions: [
        { id: "err_q1", type: "rating", label: "Rate their technical delivery alignment.", description: "", required: true, order: 1 },
        { id: "err_q2", type: "long_text", label: "Briefly comment on their primary strengths.", description: "", required: true, order: 2 }
      ]
    });
  }
});

// Cron automation nudge engine (Sprint 5)
app.post("/cron/nudge-check", async (req, res) => {
  const cronSecret = req.headers["x-cron-secret"] || req.query.secret;
  const expectedSecret = process.env.CRON_SECRET || "default_cron_secret_123";
  if (cronSecret !== expectedSecret) {
    return res.status(401).json({ success: false, error: "Unauthorized cron access" });
  }

  try {
    const incompleteReferees = await airtableService.getIncompleteReferees();
    
    let nudged1Count = 0;
    let nudged2Count = 0;
    let employerAlertsCount = 0;
    const now = new Date();

    for (const ref of incompleteReferees) {
      // Skip if referee is substituted or completed
      if (ref.formStatus === "Substituted" || ref.formStatus === "Complete") {
        continue;
      }

      // Calculate elapsed time since emailSentAt
      const sentTimeStr = ref.emailSentAt || ref.createdAt;
      if (!sentTimeStr) continue;

      const sentTime = new Date(sentTimeStr);
      const diffMs = now.getTime() - sentTime.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      const candidateId = Array.isArray(ref.candidate) ? ref.candidate[0] : ref.candidate;
      const candidate = await airtableService.getCandidate(candidateId);
      if (!candidate) continue;

      // Day 6+ Delay Employer Alert
      if (diffDays >= 6) {
        if (!ref.employerAlertedAt) {
          // Send employer alert email
          const recruiterEmail = await getRecruiterEmail(candidate);
          await emailService.sendEmployerDelayAlert(recruiterEmail, candidate.fullName, ref.fullName);
          
          await airtableService.updateRefereeFields(ref.id, {
            employerAlertedAt: now.toISOString()
          });
          employerAlertsCount++;
          console.log(`[Cron Nudge] Day 6 Employer Alert sent for Candidate: ${candidate.fullName}, Referee: ${ref.fullName}`);
        }
        continue; // Do not nudge referee further
      }

      // Day 4 Nudge: Opened but not complete -> Nudge 2 (Email only)
      if (diffDays >= 4 && ref.formStatus === "Opened") {
        if (!ref.nudge2SentAt) {
          await emailService.sendRefereeNudge2(ref.fullName, ref.email, candidate.fullName, candidate.employerName, ref.refereeToken);
          
          await airtableService.updateRefereeFields(ref.id, {
            nudge2SentAt: now.toISOString()
          });
          nudged2Count++;
          console.log(`[Cron Nudge] Day 4 Nudge 2 email sent to ${ref.fullName} for Candidate ${candidate.fullName}`);
        }
        continue;
      }

      // Day 2 Nudge: Sent but not opened -> Nudge 1 (Email + SMS)
      if (diffDays >= 2 && ref.formStatus === "Sent" && !ref.formOpenedAt) {
        if (!ref.nudge1SentAt) {
          await emailService.sendRefereeNudge1(ref.fullName, ref.email, candidate.fullName, candidate.employerName, ref.refereeToken);
          if (ref.phone) {
            await smsService.sendRefereeNudge1(ref.fullName, ref.phone, candidate.fullName, candidate.employerName, ref.refereeToken);
          }

          await airtableService.updateRefereeFields(ref.id, {
            nudge1SentAt: now.toISOString()
          });
          nudged1Count++;
          console.log(`[Cron Nudge] Day 2 Nudge 1 email + SMS sent to ${ref.fullName} for Candidate ${candidate.fullName}`);
        }
        continue;
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        checkedCount: incompleteReferees.length,
        nudge1Sent: nudged1Count,
        nudge2Sent: nudged2Count,
        employerAlertsSent: employerAlertsCount
      }
    });
  } catch (err: any) {
    console.error("Cron nudge job error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server Error" });
  }
});

// Test-only endpoint to shift referee timestamps for cron verification (Sprint 5)
if (process.env.NODE_ENV !== "production") {
  app.post("/api/test/shift-referee-time", async (req, res) => {
    const { refereeId, daysToSubtract } = req.body;
    try {
      const referee = await airtableService.getReferee(refereeId);
      if (!referee) {
        return res.status(404).json({ success: false, error: "Referee not found" });
      }
      
      const currentSentDate = new Date();
      currentSentDate.setDate(currentSentDate.getDate() - Number(daysToSubtract));
      
      await airtableService.updateRefereeFields(refereeId, {
        emailSentAt: currentSentDate.toISOString(),
        createdAt: currentSentDate.toISOString() // fallbacks
      });

      return res.status(200).json({ success: true, newEmailSentAt: currentSentDate.toISOString() });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
}

// Express Server Bootstrap
(async () => {
  try {
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite.ts");
      await setupVite(httpServer, app);
    }

    const port = parseInt(process.env.PORT || "5006", 10);
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
      },
      () => {
        console.log(`[RefCheck Server] Running on http://localhost:${port}`);
      }
    );
  } catch (err) {
    console.error("[RefCheck Server] Bootstrap failed:", err);
    process.exit(1);
  }
})();

// Trigger comment for reload verification v7
