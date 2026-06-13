import express, { Response, NextFunction, Request } from "express";
import { createServer } from "node:http";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { airtableService } from "./services/airtable.ts";
import { serveStatic } from "./static.ts";
import { emailService } from "./services/email.ts";
import { smsService } from "./services/sms.ts";
import { detectFraud } from "./services/fraudDetection.ts";
import PDFDocument from "pdfkit";

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
  return "wayne@candidex.co.nz"; // Default fallback
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

// Google SSO Sign-In (Sprint 1)
app.post("/api/auth/google", async (req, res) => {
  const { email, companyName, fullName, googleToken } = req.body;

  if (!email || !companyName) {
    return res.status(400).json({ success: false, error: "Email and Company Name are required" });
  }

  try {
    const simulatedSsoId = googleToken || `google-sso-sub-${email.replace(/[@.]/g, "-")}`;

    let employer = await airtableService.getEmployerBySsoId(simulatedSsoId);
    if (!employer) {
      const parsedDomain = email.split("@")[1];
      employer = await airtableService.createEmployer({
        companyName: companyName,
        companyDomain: parsedDomain,
        googleSsoId: simulatedSsoId,
      });
    }

    let user = await airtableService.getUserByEmail(email);
    if (!user) {
      user = await airtableService.createUser({
        fullName: fullName || companyName + " Recruiter",
        email: email,
        googleSsoId: simulatedSsoId,
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
        role: user.role,
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
      }
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
    
    const candidateToken = jwt.sign(
      { email, employerId: req.user!.employerId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

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
    const verified = jwt.verify(token, JWT_SECRET) as any;
    const candidate = await airtableService.getCandidateByToken(token);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate token not found in database" });
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
    const brandedSenderName = employer ? employer.brandedSenderName || employer.companyName : "Candidex Recruitment";

    const referees = await airtableService.getRefereesForCandidate(id);
    const completedReferees = [];
    let ratingSum = 0;
    let ratingCount = 0;

    for (const ref of referees) {
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

    // Create PDF Kit Document
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });

    // Set headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Vetting-Report-${candidate.fullName.replace(/\s+/g, "-")}.pdf`);
    doc.pipe(res);

    // Helper: draw footer
    const drawFooter = (d: any, pageNum: number, totalPages: number) => {
      d.fontSize(8).fillColor("#5F6368");
      d.text(
        `Reference check conducted via ${brandedSenderName} | Page ${pageNum} of ${totalPages}`,
        50,
        780,
        { align: "center", width: 495 }
      );
    };

    // --- PAGE 1: COVER PAGE ---
    // Background branding line
    doc.rect(0, 0, 15, 842).fill("#1A73E8");

    // Title Block
    doc.fillColor("#1A73E8").fontSize(28).font("Helvetica-Bold").text("VETTING & REFERENCE REPORT", 60, 150);
    doc.fillColor("#5F6368").fontSize(12).font("Helvetica").text("CONFIDENTIAL VERIFICATION DOSSIER", 60, 185);
    
    doc.strokeColor("#DADCE0").lineWidth(1).moveTo(60, 210).lineTo(545, 210).stroke();

    // Candidate details
    doc.fillColor("#1F1F1F").fontSize(18).font("Helvetica-Bold").text(candidate.fullName, 60, 240);
    doc.fontSize(12).font("Helvetica").fillColor("#5F6368").text(`Role Applied: ${candidate.roleAppliedFor}`, 60, 265);
    
    // Meta box
    doc.rect(60, 310, 485, 140).fill("#F8F9FA");
    doc.strokeColor("#DADCE0").lineWidth(1).rect(60, 310, 485, 140).stroke();

    doc.fillColor("#1F1F1F").fontSize(10).font("Helvetica-Bold");
    doc.text("Report Details", 80, 330);
    doc.font("Helvetica").fillColor("#5F6368");
    doc.text(`Employer Name:      ${employer ? employer.companyName : "Candidex Recruitment"}`, 80, 355);
    doc.text(`Vetting Package:    ${candidate.assignedPackage}`, 80, 375);
    doc.text(`Overall Status:     ${candidate.overallStatus}`, 80, 395);
    doc.text(`Generated Date:     ${new Date().toLocaleDateString()}`, 80, 415);

    // Employer Logo placeholder/indicator
    if (employer && employer.logoUrl) {
      doc.fillColor("#1A73E8").fontSize(10).font("Helvetica-Bold").text("[ Branded Logo Connected ]", 60, 500);
    } else {
      doc.rect(60, 500, 120, 40).fill("#F1F3F4");
      doc.fillColor("#5F6368").fontSize(9).font("Helvetica-Oblique").text("No Logo Uploaded", 80, 515);
    }

    // --- PAGE 2: EXECUTIVE SUMMARY & FRAUD ALERTS ---
    doc.addPage();
    doc.rect(0, 0, 15, 842).fill("#1A73E8");

    doc.fillColor("#1A73E8").fontSize(20).font("Helvetica-Bold").text("Executive Summary", 60, 50);
    doc.strokeColor("#DADCE0").lineWidth(1).moveTo(60, 80).lineTo(545, 80).stroke();

    // Overall metrics
    doc.rect(60, 100, 230, 80).fill("#F8F9FA");
    doc.strokeColor("#DADCE0").rect(60, 100, 230, 80).stroke();
    doc.fillColor("#1F1F1F").fontSize(10).font("Helvetica-Bold").text("OVERALL RATING", 75, 115);
    doc.fillColor("#1A73E8").fontSize(22).font("Helvetica-Bold").text(overallAverageRating !== null ? `${overallAverageRating} / 5.0` : "N/A", 75, 135);

    doc.rect(315, 100, 230, 80).fill("#F8F9FA");
    doc.strokeColor("#DADCE0").rect(315, 100, 230, 80).stroke();
    doc.fillColor("#1F1F1F").fontSize(10).font("Helvetica-Bold").text("COMPLETED CHECKS", 330, 115);
    doc.fillColor("#1A73E8").fontSize(22).font("Helvetica-Bold").text(`${completedReferees.length} / ${referees.length} Referees`, 330, 135);

    // Fraud alerts
    let startY = 210;
    const flaggedReferees = completedReferees.filter(r => r.response.fraudFlags && r.response.fraudFlags.trim() !== "");
    if (flaggedReferees.length > 0) {
      doc.rect(60, startY, 485, 150).fill("#D93025").opacity(0.05).fill();
      doc.opacity(1.0); // Reset opacity
      
      doc.strokeColor("#D93025").lineWidth(1.5).rect(60, startY, 485, 150).stroke();
      
      doc.fillColor("#D93025").fontSize(12).font("Helvetica-Bold").text("⚠️ SECURITY ALERT: FRAUD HEURISTICS TRIGGERED", 75, startY + 15);
      
      let alertY = startY + 40;
      doc.fillColor("#1F1F1F").fontSize(9).font("Helvetica");
      for (const r of flaggedReferees) {
        const flags = r.response.fraudFlags.split(",").filter(Boolean);
        const details = JSON.parse(r.response.fraudFlagDetails || "{}");
        for (const flag of flags) {
          doc.text(`• [${flag.replace("_", " ").toUpperCase()}] ${r.fullName}: ${details[flag]}`, 75, alertY, { width: 450 });
          alertY += 22;
        }
      }
      startY += 170;
    } else {
      doc.fillColor("#1E8E3E").fontSize(11).font("Helvetica-Bold").text("✓ No fraud indicators detected on any submissions.", 60, startY);
      startY += 30;
    }

    // --- REFEREE DETAIL PAGES ---
    for (const ref of completedReferees) {
      doc.addPage();
      doc.rect(0, 0, 15, 842).fill("#1A73E8");

      doc.fillColor("#1A73E8").fontSize(16).font("Helvetica-Bold").text(`Referee Vetting: ${ref.fullName}`, 60, 50);
      doc.strokeColor("#DADCE0").lineWidth(1).moveTo(60, 75).lineTo(545, 75).stroke();

      // Bio details box
      doc.rect(60, 90, 485, 80).fill("#F8F9FA");
      doc.strokeColor("#DADCE0").rect(60, 90, 485, 80).stroke();

      doc.fillColor("#1F1F1F").fontSize(9).font("Helvetica-Bold");
      doc.text("Relationship:", 75, 105);
      doc.text("Stated Company:", 75, 120);
      doc.text("Stated Job Title:", 75, 135);
      doc.text("Email & Phone:", 75, 150);

      doc.font("Helvetica").fillColor("#5F6368");
      doc.text(ref.relationship, 170, 105);
      doc.text(ref.employerName, 170, 120);
      doc.text(ref.jobTitle, 170, 135);
      doc.text(`${ref.email} | ${ref.phone}`, 170, 150);

      // Render Q&A
      let qaY = 190;
      let refAnswers = [];
      try {
        refAnswers = JSON.parse(ref.response.answersJson || "[]");
      } catch (e) {
        console.error("Failed to parse answersJson for PDF:", e);
      }

      doc.fillColor("#1A73E8").fontSize(11).font("Helvetica-Bold").text("Questionnaire Responses", 60, qaY);
      qaY += 20;

      for (const q of questions) {
        const ans = refAnswers.find((a: any) => a.id === q.id);
        const ansValue = ans ? ans.value : null;

        // Check page limits to prevent overflow
        if (qaY > 700) {
          doc.addPage();
          doc.rect(0, 0, 15, 842).fill("#1A73E8");
          qaY = 50;
        }

        doc.fillColor("#1F1F1F").fontSize(10).font("Helvetica-Bold").text(q.label, 60, qaY, { width: 485 });
        qaY += doc.heightOfString(q.label, { width: 485 }) + 4;

        let ansText = "No response provided.";
        if (ansValue !== null && ansValue !== undefined) {
          if (q.type === "rating") {
            ansText = `★ `.repeat(Number(ansValue)) + `☆ `.repeat(5 - Number(ansValue)) + ` (${ansValue}/5)`;
          } else {
            ansText = String(ansValue);
          }
        }

        doc.fillColor("#5F6368").fontSize(9).font("Helvetica").text(ansText, 70, qaY, { width: 475 });
        qaY += doc.heightOfString(ansText, { width: 475 }) + 15;
      }
    }

    // --- FINALIZE FOOTERS ---
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
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
    const verified = jwt.verify(token, JWT_SECRET) as any;
    const candidate = await airtableService.getCandidateByToken(token);
    if (!candidate) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
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
    
    // Create each referee in Airtable and dispatch invites
    const createdReferees = [];
    for (const ref of referees) {
      const refereeToken = jwt.sign(
        { email: ref.email, candidateId: id },
        JWT_SECRET,
        { expiresIn: "14d" }
      );

      const refereeRecord = await airtableService.createReferee({
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
    const refereeToken = jwt.sign(
      { email: referee.email, candidateId: id },
      JWT_SECRET,
      { expiresIn: "14d" }
    );

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
    const verified = jwt.verify(token, JWT_SECRET) as any;
    const referee = await airtableService.getRefereeByToken(token);
    if (!referee) {
      return res.status(404).json({ success: false, error: "Referee token not found" });
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

    // Generate token for new referee
    const refereeToken = jwt.sign(
      { email, candidateId },
      JWT_SECRET,
      { expiresIn: "14d" }
    );

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

// Trigger comment for reload verification v4
