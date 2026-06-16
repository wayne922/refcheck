import Airtable from "airtable";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_PAT;
const baseId = process.env.AIRTABLE_BASE_ID;

let base: any = null;
let isMock = true;

if (apiKey && baseId && process.env.MOCK_MODE !== "true") {
  Airtable.configure({
    apiKey: apiKey,
  });
  base = Airtable.base(baseId);
  isMock = false;
  console.log(`[Airtable Service] Connected to live Airtable base: ${baseId}`);
} else {
  console.warn(
    `[Airtable Service Warning] Using in-memory mock database layer instead.`
  );
}

async function safeCreate(tableName: string, fields: any) {
  let writeFields = { ...fields };
  while (true) {
    try {
      return await base(tableName).create(writeFields);
    } catch (err: any) {
      const match = err.message?.match(/Unknown field name: "([^"]+)"/);
      if (match && match[1]) {
        const missingField = match[1];
        console.warn(`[Airtable Auto-Recovery] Table '${tableName}' missing field '${missingField}'. Stripping and retrying...`);
        delete writeFields[missingField];
        continue;
      }
      throw err;
    }
  }
}

async function safeUpdate(tableName: string, id: string, fields: any) {
  let writeFields = { ...fields };
  while (true) {
    try {
      return await base(tableName).update(id, writeFields);
    } catch (err: any) {
      const match = err.message?.match(/Unknown field name: "([^"]+)"/);
      if (match && match[1]) {
        const missingField = match[1];
        console.warn(`[Airtable Auto-Recovery] Table '${tableName}' missing field '${missingField}' during update. Stripping and retrying...`);
        delete writeFields[missingField];
        continue;
      }
      throw err;
    }
  }
}

// Seeded questions helper

function normalizeTemplateName(name: string): string {
  const mapping: Record<string, string> = {
    "Standard 2-Referee": "General Professional",
    "Executive 3-Referee": "Senior / Executive",
    "Healthcare Premium": "Healthcare",
    "Trades Standard": "Trades / Construction",
    "Early Childhood / ECE": "Early Childhood / ECE"
  };
  return mapping[name] || name;
}

async function ensureSystemTemplatesSeeded() {
  if (isMock) return;
  
  const systemTemplates = [
    { Name: "General Professional", Description: "Standard reference check, suitable for any professional role", Industry: "General", Is_System_Template: true, Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("General Professional")), Branching_Rules_JSON: "[]" },
    { Name: "Senior / Executive", Description: "Leadership focus, board-level and C-suite roles", Industry: "Executive", Is_System_Template: true, Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("Senior / Executive")), Branching_Rules_JSON: "[]" },
    { Name: "Early Childhood / ECE", Description: "NZ childcare sector, working with children focus", Industry: "ECE", Is_System_Template: true, Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("Early Childhood / ECE")), Branching_Rules_JSON: "[]" },
    { Name: "Healthcare", Description: "Clinical environment, patient safety focus", Industry: "Healthcare", Is_System_Template: true, Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("Healthcare")), Branching_Rules_JSON: "[]" },
    { Name: "Trades / Construction", Description: "Physical safety, site compliance, productivity", Industry: "Trades", Is_System_Template: true, Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("Trades / Construction")), Branching_Rules_JSON: "[]" }
  ];

  try {
    const existingRecords = await base("Questionnaire_Templates").select({ maxRecords: 100 }).all();
    const existingNames = new Set(existingRecords.map((r: any) => r.fields.Name));

    for (const t of systemTemplates) {
      if (!existingNames.has(t.Name)) {
        console.log(`[Airtable Auto-Seed] Seeding template "${t.Name}"...`);
        await safeCreate("Questionnaire_Templates", {
          Name: t.Name,
          Description: t.Description,
          Industry: t.Industry,
          Is_System_Template: t.Is_System_Template,
          Status: t.Status,
          Questions_JSON: t.Questions_JSON,
          Branching_Rules_JSON: t.Branching_Rules_JSON
        });
      }
    }
  } catch (err: any) {
    console.error("[Airtable Auto-Seed Error] Failed to ensure system templates are seeded:", err.message);
  }
}

const createQuestionsSeed = (templateName: string): any[] => {
  switch (templateName) {
    case "General Professional":
      return [
        { id: "q_gp1", type: "short_text", label: "Where did you work together?", required: true, order: 1 },
        { id: "q_gp2", type: "short_text", label: "What was your relationship?", required: true, order: 2 },
        { id: "q_gp3", type: "short_text", label: "How long did you work together?", required: true, order: 3 },
        { id: "q_gp4", type: "short_text", label: "What was the candidate's role?", required: true, order: 4 },
        { id: "q_gp5", type: "long_text", label: "Why did they finish their employment?", required: true, order: 5 },
        { id: "q_gp6", type: "long_text", label: "How would you describe their overall job performance when you worked with them?", required: true, order: 6 },
        { id: "q_gp7", type: "rating", label: "How would you rate their communication skills?", description: "1 is A major concern, 5 is Exemplary", required: true, order: 7 },
        { id: "q_gp8", type: "rating", label: "How would you rate their personal presentation?", description: "1 is A major concern, 5 is Exemplary", required: true, order: 8 },
        { id: "q_gp9", type: "yes_no", label: "Were they friendly and approachable in their work?", required: true, order: 9 },
        { id: "q_gp10", type: "long_text", label: "How would you describe the candidate's overall reliability and dependability in their role?", required: true, order: 10 },
        { id: "q_gp11", type: "long_text", label: "Is there any area you believe the candidate may require further development or training?", required: true, order: 11 },
        { id: "q_gp12", type: "yes_no", label: "Are you aware of any physical or medical limitations that would prevent them from performing their job properly?", required: true, order: 12 },
        { id: "q_gp13", type: "yes_no", label: "While they were employed, are you aware of any disciplinary action against them or formal warnings given?", required: true, order: 13, risk_rule: { condition: "equals", value: "yes", severity: "high" } },
        { id: "q_gp14", type: "yes_no", label: "Are you aware of any accidents, incidents, or conflicts being caused as a result of their carelessness or negligence?", required: true, order: 14, risk_rule: { condition: "equals", value: "yes", severity: "high" } },
        { id: "q_gp15", type: "yes_no", label: "Would you recommend the candidate to future employers?", required: true, order: 15, risk_rule: { condition: "equals", value: "no", severity: "high" } },
        { id: "q_gp16", type: "yes_no", label: "If given the opportunity, would you rehire the candidate?", required: true, order: 16, risk_rule: { condition: "equals", value: "no", severity: "high" } },
        { id: "q_gp17", type: "long_text", label: "Is there anything further you wish to add to the candidate's reference?", required: false, order: 17 }
      ];
    case "Senior / Executive":
      return [
        { id: "q_se1", type: "short_text", label: "What scope of leadership/budget responsibility did the candidate hold?", description: "Describe C-suite or managerial bounds", required: true, order: 1 },
        { id: "q_se2", type: "rating", label: "Rate their strategic decision-making capability.", description: "Score their C-level competence", required: true, order: 2 },
        { id: "q_se3", type: "yes_no", label: "Did they consistently demonstrate transparent governance?", description: "Ethical compliance check", required: true, order: 3, risk_rule: { condition: "equals", value: "no", severity: "high" } }
      ];
    case "Early Childhood / ECE":
      return [
        { id: "q_ece_1", type: "short_text", label: "Where did you work together?", required: true, order: 1 },
        { id: "q_ece_2", type: "short_text", label: "What was your relationship?", required: true, order: 2 },
        { id: "q_ece_3", type: "short_text", label: "How long did you work together?", required: true, order: 3 },
        { id: "q_ece_4", type: "short_text", label: "What was the candidate's role?", required: true, order: 4 },
        { id: "q_ece_5", type: "long_text", label: "Why did they finish their employment?", required: true, order: 5 },
        { id: "q_ece_6", type: "short_text", label: "Please state the candidate's name and how you know them.", required: true, order: 6 },
        { id: "q_ece_7", type: "yes_no", label: "Did the candidate report directly to you in their role?", required: true, order: 7 },
        { id: "q_ece_8", type: "rating", label: "How would you describe their overall job performance when you worked with them?", description: "1 is Poor, 5 is Fantastic", required: true, order: 8 },
        { id: "q_ece_9", type: "long_text", label: "How would you describe their engagement and interaction with the children they worked with?", required: true, order: 9 },
        { id: "q_ece_10", type: "long_text", label: "How would you describe their philosophy towards teaching/educating children?", required: true, order: 10 },
        { id: "q_ece_11", type: "long_text", label: "Please describe their personality and approachability.", required: true, order: 11 },
        { id: "q_ece_12", type: "long_text", label: "How would their team members describe them?", required: true, order: 12 },
        { id: "q_ece_13", type: "long_text", label: "What skills do you believe the candidate could bring to an organisation?", required: true, order: 13 },
        { id: "q_ece_14", type: "long_text", label: "Did they show empathy, were they caring? Can you provide an example?", required: true, order: 14 },
        { id: "q_ece_15", type: "long_text", label: "Was the candidate attentive to the needs of those whom they cared for? Were there any examples that stood out?", required: true, order: 15 },
        { id: "q_ece_16", type: "yes_no", label: "Are you aware of any information that suggests the candidate should not work in the education sector?", description: "If yes, please provide details.", required: true, order: 16, risk_rule: { condition: "equals", value: "yes", severity: "high" } },
        { id: "q_ece_17", type: "rating", label: "How would you rate their communication skills with parents and whānau?", description: "1 is Poor, 5 is Excellent", required: true, order: 17 },
        { id: "q_ece_18", type: "rating", label: "How would you rate their reliability, punctuality, and attendance?", description: "1 is Poor, 5 is Excellent", required: true, order: 18 },
        { id: "q_ece_19", type: "yes_no", label: "While they were employed, are you aware of any disciplinary action against them or formal warnings given?", required: true, order: 19, risk_rule: { condition: "equals", value: "yes", severity: "high" } },
        { id: "q_ece_20", type: "yes_no", label: "Are you aware of any accidents, incidents, or conflicts being caused as a result of their carelessness or negligence?", required: true, order: 20, risk_rule: { condition: "equals", value: "yes", severity: "high" } },
        { id: "q_ece_21", type: "yes_no", label: "Would you recommend the candidate to future employers?", required: true, order: 21, risk_rule: { condition: "equals", value: "no", severity: "high" } },
        { id: "q_ece_22", type: "yes_no", label: "If given the opportunity, would you rehire the candidate?", required: true, order: 22, risk_rule: { condition: "equals", value: "no", severity: "high" } },
        { id: "q_ece_23", type: "long_text", label: "Is there anything further you wish to add to the candidate's reference?", description: "Note: this reference will be shared with prospective employers.", required: false, order: 23 },
        { id: "q_ece_24", type: "yes_no", label: "Do you give permission for us to share this reference with the candidate if requested?", required: true, order: 24 }
      ];
    case "Healthcare":
      return [
        { id: "q_hc1", type: "yes_no", label: "Was clinical compliance maintained during their shift assignments?", description: "Patient safety audit", required: true, order: 1, risk_rule: { condition: "equals", value: "no", severity: "high" } },
        { id: "q_hc2", type: "rating", label: "Rate their performance under emergency clinical pressure.", description: "Evaluate clinical readiness", required: true, order: 2 },
        { id: "q_hc3", type: "long_text", label: "Describe their patient-care quality and team communication skills.", description: "Bedside manner review", required: false, order: 3 }
      ];
    case "Trades / Construction":
      return [
        { id: "q_tc1", type: "yes_no", label: "Did they strictly follow health and safety regulations on site?", description: "NZ H&S Compliance check", required: true, order: 1, risk_rule: { condition: "equals", value: "no", severity: "high" } },
        { id: "q_tc2", type: "rating", label: "Rate their quality of craftsmanship and productivity.", description: "Speed vs Quality", required: true, order: 2 },
        { id: "q_tc3", type: "long_text", label: "Describe their reliability, punctuality, and attitude to site leadership.", description: "Attendance check", required: false, order: 3 }
      ];
    default:
      return [];
  }
};

// Robust in-memory fallback database
const mockDb: any = {
  employers: [
    {
      id: "rec_emp_1",
      employerId: "rec_emp_1",
      companyName: "Candidex Recruitment",
      companyDomain: "candidex.co.nz",
      planType: "Pro",
      subscriptionStatus: "Active",
      logoUrl: "",
      brandColour: "#2E7EBF",
      brandedSenderName: "Candidex Recruitment",
      apiKey: "dev-candidex-api-key",
      googleSsoId: "google-sso-wayne",
      createdAt: new Date().toISOString(),
    }
  ],
  users: [
    {
      id: "rec_usr_1",
      userId: "rec_usr_1",
      fullName: "Wayne Sullivan",
      email: "wayne@candidex.co.nz",
      googleSsoId: "google-sso-wayne",
      role: "Admin",
      employer: ["rec_emp_1"],
      isActive: true,
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
  ],
  candidates: [
    {
      id: "rec_cand_1",
      candidateId: "rec_cand_1",
      fullName: "Jane Doe",
      email: "jane.doe@gmail.com",
      phone: "+64 21 555 0192",
      roleAppliedFor: "ECE Qualified Teacher",
      employerName: "Candidex Recruitment",
      employer: ["rec_emp_1"],
      assignedPackage: "Standard 2-Referee",
      candidateToken: "mock-jwt-candidate-jane",
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      overallStatus: "In Progress",
      createdAt: new Date().toISOString(),
    },
    {
      id: "rec_cand_sarah",
      candidateId: "rec_cand_sarah",
      fullName: "Sarah Jenkins",
      email: "sarah.jenkins@gmail.com",
      phone: "+64 21 123 4567",
      roleAppliedFor: "ECE Qualified Teacher",
      employerName: "Candidex Recruitment",
      employer: ["rec_emp_1"],
      assignedPackage: "Early Childhood / ECE",
      candidateToken: "mock-token-sarah",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      overallStatus: "Complete",
      candidateSubmissionIp: "122.56.44.89",
      candidateFormSubmittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: ["rec_usr_1"],
      createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "rec_cand_thomas",
      candidateId: "rec_cand_thomas",
      fullName: "Thomas Clark",
      email: "thomas.clark@gmail.com",
      phone: "+64 21 888 2222",
      roleAppliedFor: "Operations Manager",
      employerName: "Candidex Recruitment",
      employer: ["rec_emp_1"],
      assignedPackage: "General Professional",
      candidateToken: "mock-token-thomas",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      overallStatus: "Complete",
      candidateSubmissionIp: "125.236.211.5",
      candidateFormSubmittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: ["rec_usr_1"],
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "rec_cand_michael",
      candidateId: "rec_cand_michael",
      fullName: "Michael Smith",
      email: "michael.smith@gmail.com",
      phone: "+64 21 777 3333",
      roleAppliedFor: "Senior Account Manager",
      employerName: "Candidex Recruitment",
      employer: ["rec_emp_1"],
      assignedPackage: "General Professional",
      candidateToken: "mock-token-michael",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      overallStatus: "Flagged",
      candidateSubmissionIp: "203.109.162.45",
      candidateFormSubmittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: ["rec_usr_1"],
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "rec_cand_emily",
      candidateId: "rec_cand_emily",
      fullName: "Emily Watson",
      email: "emily.watson@gmail.com",
      phone: "+64 21 444 8888",
      roleAppliedFor: "Registered Nurse",
      employerName: "Candidex Recruitment",
      employer: ["rec_emp_1"],
      assignedPackage: "Healthcare",
      candidateToken: "mock-token-emily",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      overallStatus: "In Progress",
      candidateSubmissionIp: "219.89.55.12",
      candidateFormSubmittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: ["rec_usr_1"],
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "rec_cand_david",
      candidateId: "rec_cand_david",
      fullName: "David Miller",
      email: "david.miller@gmail.com",
      phone: "+64 21 999 0000",
      roleAppliedFor: "Qualified Carpenter",
      employerName: "Candidex Recruitment",
      employer: ["rec_emp_1"],
      assignedPackage: "Trades / Construction",
      candidateToken: "mock-token-david",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      overallStatus: "Candidate Sent",
      createdBy: ["rec_usr_1"],
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    }
  ],
  questionnaireTemplates: [
    { id: "temp_gp", Name: "General Professional", Description: "Standard reference check, suitable for any professional role", Industry: "General", Is_System_Template: true, Created_At: new Date().toISOString(), Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("General Professional")), Branching_Rules_JSON: "[]" },
    { id: "temp_se", Name: "Senior / Executive", Description: "Leadership focus, board-level and C-suite roles", Industry: "Executive", Is_System_Template: true, Created_At: new Date().toISOString(), Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("Senior / Executive")), Branching_Rules_JSON: "[]" },
    { id: "temp_ece", Name: "Early Childhood / ECE", Description: "NZ childcare sector, working with children focus", Industry: "ECE", Is_System_Template: true, Created_At: new Date().toISOString(), Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("Early Childhood / ECE")), Branching_Rules_JSON: "[]" },
    { id: "temp_hc", Name: "Healthcare", Description: "Clinical environment, patient safety focus", Industry: "Healthcare", Is_System_Template: true, Created_At: new Date().toISOString(), Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("Healthcare")), Branching_Rules_JSON: "[]" },
    { id: "temp_tc", Name: "Trades / Construction", Description: "Physical safety, site compliance, productivity", Industry: "Trades", Is_System_Template: true, Created_At: new Date().toISOString(), Status: "Active", Questions_JSON: JSON.stringify(createQuestionsSeed("Trades / Construction")), Branching_Rules_JSON: "[]" }
  ],
  referees: [
    // Sarah Jenkins Referees
    {
      id: "rec_ref_sarah_1",
      refereeId: "rec_ref_sarah_1",
      fullName: "Aroha Cooper",
      email: "aroha.cooper@brightstars.co.nz",
      phone: "+64 22 987 6543",
      relationship: "Center Manager",
      employerName: "Bright Stars ECE",
      employerDomain: "brightstars.co.nz",
      jobTitle: "Center Manager",
      datesFrom: "2022-02-01",
      datesTo: "2025-11-30",
      candidate: ["rec_cand_sarah"],
      refereeToken: "mock-ref-sarah-1",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      formStatus: "Complete",
      emailSentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      formCompletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      submissionDurationSeconds: 450,
      submissionIpAddress: "202.89.120.14",
      isSubstitute: false
    },
    {
      id: "rec_ref_sarah_2",
      refereeId: "rec_ref_sarah_2",
      fullName: "David Vance",
      email: "david.vance@brightstars.co.nz",
      phone: "+64 27 123 9876",
      relationship: "Head Teacher",
      employerName: "Bright Stars ECE",
      employerDomain: "brightstars.co.nz",
      jobTitle: "Senior Teacher",
      datesFrom: "2022-02-01",
      datesTo: "2025-11-30",
      candidate: ["rec_cand_sarah"],
      refereeToken: "mock-ref-sarah-2",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      formStatus: "Complete",
      emailSentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      formCompletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000).toISOString(),
      submissionDurationSeconds: 360,
      submissionIpAddress: "202.89.120.15",
      isSubstitute: false
    },
    // Thomas Clark Referees
    {
      id: "rec_ref_thomas_1",
      refereeId: "rec_ref_thomas_1",
      fullName: "Susan Miller",
      email: "susan.miller@logisticsplus.co.nz",
      phone: "+64 22 111 2222",
      relationship: "VP of Operations",
      employerName: "Logistics Plus Ltd",
      employerDomain: "logisticsplus.co.nz",
      jobTitle: "VP of Operations",
      datesFrom: "2019-05-01",
      datesTo: "2024-10-31",
      candidate: ["rec_cand_thomas"],
      refereeToken: "mock-ref-thomas-1",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      formStatus: "Complete",
      emailSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      formCompletedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000).toISOString(),
      submissionDurationSeconds: 290,
      submissionIpAddress: "210.55.230.12",
      isSubstitute: false
    },
    {
      id: "rec_ref_thomas_2",
      refereeId: "rec_ref_thomas_2",
      fullName: "John Davis",
      email: "john.davis@logisticsplus.co.nz",
      phone: "+64 27 333 4444",
      relationship: "Operations Supervisor",
      employerName: "Logistics Plus Ltd",
      employerDomain: "logisticsplus.co.nz",
      jobTitle: "Operations Director",
      datesFrom: "2019-05-01",
      datesTo: "2024-10-31",
      candidate: ["rec_cand_thomas"],
      refereeToken: "mock-ref-thomas-2",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      formStatus: "Complete",
      emailSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      formCompletedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000).toISOString(),
      submissionDurationSeconds: 340,
      submissionIpAddress: "210.55.230.13",
      isSubstitute: false
    },
    // Michael Smith Referees
    {
      id: "rec_ref_michael_1",
      refereeId: "rec_ref_michael_1",
      fullName: "Robert Jones",
      email: "robert.jones@gmail.com",
      phone: "+64 22 444 5555",
      relationship: "Sales Director",
      employerName: "Global Sales Corp",
      employerDomain: "gmail.com",
      jobTitle: "Sales Director",
      datesFrom: "2021-01-01",
      datesTo: "2024-03-31",
      candidate: ["rec_cand_michael"],
      refereeToken: "mock-ref-michael-1",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      formStatus: "Complete",
      emailSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      formCompletedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      submissionDurationSeconds: 45,
      submissionIpAddress: "203.109.162.45",
      isSubstitute: false
    },
    {
      id: "rec_ref_michael_2",
      refereeId: "rec_ref_michael_2",
      fullName: "Alice Williams",
      email: "alice.williams@globalsales.co.nz",
      phone: "+64 27 555 6666",
      relationship: "Peer / Account Manager",
      employerName: "Global Sales Corp",
      employerDomain: "globalsales.co.nz",
      jobTitle: "Senior Account Manager",
      datesFrom: "2021-01-01",
      datesTo: "2024-03-31",
      candidate: ["rec_cand_michael"],
      refereeToken: "mock-ref-michael-2",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      formStatus: "Complete",
      emailSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      formCompletedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      submissionDurationSeconds: 280,
      submissionIpAddress: "121.34.56.78",
      isSubstitute: false
    },
    // Emily Watson Referees
    {
      id: "rec_ref_emily_1",
      refereeId: "rec_ref_emily_1",
      fullName: "Dr. Keith Morris",
      email: "keith.morris@cityhospital.co.nz",
      phone: "+64 22 888 9999",
      relationship: "Clinical Director",
      employerName: "City Hospital",
      employerDomain: "cityhospital.co.nz",
      jobTitle: "Clinical Director",
      datesFrom: "2020-03-01",
      datesTo: "2024-09-30",
      candidate: ["rec_cand_emily"],
      refereeToken: "mock-ref-emily-1",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      formStatus: "Complete",
      emailSentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      formCompletedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000).toISOString(),
      submissionDurationSeconds: 310,
      submissionIpAddress: "103.4.120.3",
      isSubstitute: false
    },
    {
      id: "rec_ref_emily_2",
      refereeId: "rec_ref_emily_2",
      fullName: "Sarah Connor",
      email: "sarah.connor@cityhospital.co.nz",
      phone: "+64 27 999 1111",
      relationship: "Shift Charge Nurse",
      employerName: "City Hospital",
      employerDomain: "cityhospital.co.nz",
      jobTitle: "Charge Nurse",
      datesFrom: "2020-03-01",
      datesTo: "2024-09-30",
      candidate: ["rec_cand_emily"],
      refereeToken: "mock-ref-emily-2",
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      formStatus: "Sent",
      emailSentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      isSubstitute: false
    }
  ],
  referenceRequests: [],
  refereeResponses: [
    // Sarah Jenkins Response 1 (Aroha Cooper)
    {
      id: "rec_res_sarah_1",
      responseId: "rec_res_sarah_1",
      referee: ["rec_ref_sarah_1"],
      overallRating: 5.0,
      wordCountTotal: 220,
      ipAddress: "202.89.120.14",
      fraudFlags: "",
      fraudFlagDetails: "{}",
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      answersJson: JSON.stringify([
        { id: "q_ece_1", type: "short_text", value: "Bright Stars ECE Centre" },
        { id: "q_ece_2", type: "short_text", value: "Center Manager" },
        { id: "q_ece_3", type: "short_text", value: "3 years" },
        { id: "q_ece_4", type: "short_text", value: "ECE Qualified Teacher" },
        { id: "q_ece_5", type: "long_text", value: "Relocation to another city." },
        { id: "q_ece_6", type: "short_text", value: "Sarah Jenkins, senior educator" },
        { id: "q_ece_7", type: "yes_no", value: "yes" },
        { id: "q_ece_8", type: "rating", value: 5 },
        { id: "q_ece_9", type: "long_text", value: "Absolutely outstanding. The children loved her, and she created highly engaging learning activities." },
        { id: "q_ece_10", type: "long_text", value: "Play-based and child-led, very aligned with Te Whāriki." },
        { id: "q_ece_11", type: "long_text", value: "Warm, empathetic, patient, and highly professional." },
        { id: "q_ece_12", type: "long_text", value: "A collaborative team player who was always supportive and positive." },
        { id: "q_ece_13", type: "long_text", value: "Strong curriculum development, parent relations, and room management." },
        { id: "q_ece_14", type: "long_text", value: "Yes, she was incredibly supportive during child transitions, helping children settle with great care." },
        { id: "q_ece_15", type: "long_text", value: "Always. She noticed subtle changes in children's moods or development and adapted her teaching." },
        { id: "q_ece_16", type: "yes_no", value: "no" },
        { id: "q_ece_17", type: "rating", value: 5 },
        { id: "q_ece_18", type: "rating", value: 5 },
        { id: "q_ece_19", type: "yes_no", value: "no" },
        { id: "q_ece_20", type: "yes_no", value: "no" },
        { id: "q_ece_21", type: "yes_no", value: "yes" },
        { id: "q_ece_22", type: "yes_no", value: "yes" },
        { id: "q_ece_23", type: "long_text", value: "She will be a wonderful asset to any ECE centre." },
        { id: "q_ece_24", type: "yes_no", value: "yes" }
      ])
    },
    // Sarah Jenkins Response 2 (David Vance)
    {
      id: "rec_res_sarah_2",
      responseId: "rec_res_sarah_2",
      referee: ["rec_ref_sarah_2"],
      overallRating: 4.7,
      wordCountTotal: 180,
      ipAddress: "202.89.120.15",
      fraudFlags: "",
      fraudFlagDetails: "{}",
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000).toISOString(),
      answersJson: JSON.stringify([
        { id: "q_ece_1", type: "short_text", value: "Bright Stars ECE Centre" },
        { id: "q_ece_2", type: "short_text", value: "Head Teacher" },
        { id: "q_ece_3", type: "short_text", value: "3 years" },
        { id: "q_ece_4", type: "short_text", value: "ECE Qualified Teacher" },
        { id: "q_ece_5", type: "long_text", value: "Relocation to another city." },
        { id: "q_ece_6", type: "short_text", value: "Sarah Jenkins, colleague" },
        { id: "q_ece_7", type: "yes_no", value: "no" },
        { id: "q_ece_8", type: "rating", value: 5 },
        { id: "q_ece_9", type: "long_text", value: "Highly professional and nurturing environment, great interactions." },
        { id: "q_ece_10", type: "long_text", value: "Focused on child interest and natural environments." },
        { id: "q_ece_11", type: "long_text", value: "Incredibly patient, gentle with the children and very calm." },
        { id: "q_ece_12", type: "long_text", value: "Hardworking, dedicated, reliable and supportive of others." },
        { id: "q_ece_13", type: "long_text", value: "Superb documentation of learning stories and planning." },
        { id: "q_ece_14", type: "long_text", value: "Always comforted children when upset or distressed." },
        { id: "q_ece_15", type: "long_text", value: "Very attentive, managed safety hazards carefully." },
        { id: "q_ece_16", type: "yes_no", value: "no" },
        { id: "q_ece_17", type: "rating", value: 4 },
        { id: "q_ece_18", type: "rating", value: 5 },
        { id: "q_ece_19", type: "yes_no", value: "no" },
        { id: "q_ece_20", type: "yes_no", value: "no" },
        { id: "q_ece_21", type: "yes_no", value: "yes" },
        { id: "q_ece_22", type: "yes_no", value: "yes" },
        { id: "q_ece_23", type: "long_text", value: "Highly recommended." },
        { id: "q_ece_24", type: "yes_no", value: "yes" }
      ])
    },
    // Thomas Clark Response 1 (Susan Miller)
    {
      id: "rec_res_thomas_1",
      responseId: "rec_res_thomas_1",
      referee: ["rec_ref_thomas_1"],
      overallRating: 4.5,
      wordCountTotal: 160,
      ipAddress: "210.55.230.12",
      fraudFlags: "",
      fraudFlagDetails: "{}",
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000).toISOString(),
      answersJson: JSON.stringify([
        { id: "q_gp1", type: "short_text", value: "Logistics Plus LTD" },
        { id: "q_gp2", type: "short_text", value: "VP of Operations" },
        { id: "q_gp3", type: "short_text", value: "5 years" },
        { id: "q_gp4", type: "short_text", value: "Operations Manager" },
        { id: "q_gp5", type: "long_text", value: "Career progression and new challenges." },
        { id: "q_gp6", type: "long_text", value: "Thomas did a great job streamlining operations and lowering shipping delays." },
        { id: "q_gp7", type: "rating", value: 4 },
        { id: "q_gp8", type: "rating", value: 5 },
        { id: "q_gp9", type: "yes_no", value: "yes" },
        { id: "q_gp10", type: "long_text", value: "Very reliable, always hit delivery metrics and kept the facility fully staffed." },
        { id: "q_gp11", type: "long_text", value: "Could benefit from learning advanced analytics platforms, but picks up tech fast." },
        { id: "q_gp12", type: "yes_no", value: "no" },
        { id: "q_gp13", type: "yes_no", value: "no" },
        { id: "q_gp14", type: "yes_no", value: "no" },
        { id: "q_gp15", type: "yes_no", value: "yes" },
        { id: "q_gp16", type: "yes_no", value: "yes" },
        { id: "q_gp17", type: "long_text", value: "Highly recommend Thomas for operations roles." }
      ])
    },
    // Thomas Clark Response 2 (John Davis)
    {
      id: "rec_res_thomas_2",
      responseId: "rec_res_thomas_2",
      referee: ["rec_ref_thomas_2"],
      overallRating: 3.9,
      wordCountTotal: 140,
      ipAddress: "210.55.230.13",
      fraudFlags: "",
      fraudFlagDetails: "{}",
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000).toISOString(),
      answersJson: JSON.stringify([
        { id: "q_gp1", type: "short_text", value: "Logistics Plus LTD" },
        { id: "q_gp2", type: "short_text", value: "Operations Director" },
        { id: "q_gp3", type: "short_text", value: "5 years" },
        { id: "q_gp4", type: "short_text", value: "Operations Manager" },
        { id: "q_gp5", type: "long_text", value: "To take up another job opportunity." },
        { id: "q_gp6", type: "long_text", value: "Solid manager, kept the team motivated and handled escalations efficiently." },
        { id: "q_gp7", type: "rating", value: 4 },
        { id: "q_gp8", type: "rating", value: 4 },
        { id: "q_gp9", type: "yes_no", value: "yes" },
        { id: "q_gp10", type: "long_text", value: "Extremely reliable. Always present, handled night shift issues calmly." },
        { id: "q_gp11", type: "long_text", value: "Delegation could be improved but he is very capable." },
        { id: "q_gp12", type: "yes_no", value: "no" },
        { id: "q_gp13", type: "yes_no", value: "no" },
        { id: "q_gp14", type: "yes_no", value: "no" },
        { id: "q_gp15", type: "yes_no", value: "yes" },
        { id: "q_gp16", type: "yes_no", value: "yes" },
        { id: "q_gp17", type: "long_text", value: "Pleasure to work with." }
      ])
    },
    // Michael Smith Response 1 (Robert Jones) - FLAGGED
    {
      id: "rec_res_michael_1",
      responseId: "rec_res_michael_1",
      referee: ["rec_ref_michael_1"],
      overallRating: 3.0,
      wordCountTotal: 18,
      ipAddress: "203.109.162.45",
      fraudFlags: "shared_ip,personal_email,short_response,fast_completion",
      fraudFlagDetails: JSON.stringify({
        shared_ip: "The referee submitted their response from the same IP address as the candidate.",
        personal_email: "The referee claims a Manager/Director relationship but used a personal email address (e.g., Gmail, Outlook).",
        short_response: "One or more required text answers provided by the referee was extremely brief (under 20 words).",
        fast_completion: "The referee completed the entire reference check in less than 90 seconds (45s), indicating a potentially automated or rushed submission."
      }),
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      answersJson: JSON.stringify([
        { id: "q_gp1", type: "short_text", value: "At Sales Inc" },
        { id: "q_gp2", type: "short_text", value: "He reported to me" },
        { id: "q_gp3", type: "short_text", value: "2 years" },
        { id: "q_gp4", type: "short_text", value: "Senior Manager" },
        { id: "q_gp5", type: "long_text", value: "Resigned." },
        { id: "q_gp6", type: "long_text", value: "It was okay." },
        { id: "q_gp7", type: "rating", value: 3 },
        { id: "q_gp8", type: "rating", value: 3 },
        { id: "q_gp9", type: "yes_no", value: "yes" },
        { id: "q_gp10", type: "long_text", value: "Fine." },
        { id: "q_gp11", type: "long_text", value: "None." },
        { id: "q_gp12", type: "yes_no", value: "no" },
        { id: "q_gp13", type: "yes_no", value: "no" },
        { id: "q_gp14", type: "yes_no", value: "no" },
        { id: "q_gp15", type: "yes_no", value: "yes" },
        { id: "q_gp16", type: "yes_no", value: "yes" },
        { id: "q_gp17", type: "long_text", value: "" }
      ])
    },
    // Michael Smith Response 2 (Alice Williams)
    {
      id: "rec_res_michael_2",
      responseId: "rec_res_michael_2",
      referee: ["rec_ref_michael_2"],
      overallRating: 4.0,
      wordCountTotal: 150,
      ipAddress: "121.34.56.78",
      fraudFlags: "",
      fraudFlagDetails: "{}",
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      answersJson: JSON.stringify([
        { id: "q_gp1", type: "short_text", value: "Global Sales Corp" },
        { id: "q_gp2", type: "short_text", value: "Co-worker" },
        { id: "q_gp3", type: "short_text", value: "3 years" },
        { id: "q_gp4", type: "short_text", value: "Account Manager" },
        { id: "q_gp5", type: "long_text", value: "For career progression." },
        { id: "q_gp6", type: "long_text", value: "Michael was very driven and focused on meeting targets, worked well in sales teams." },
        { id: "q_gp7", type: "rating", value: 4 },
        { id: "q_gp8", type: "rating", value: 4 },
        { id: "q_gp9", type: "yes_no", value: "yes" },
        { id: "q_gp10", type: "long_text", value: "Highly reliable, never missed client meetings, very professional attitude." },
        { id: "q_gp11", type: "long_text", value: "Could delegate tasks more to team members, but did high quality work." },
        { id: "q_gp12", type: "yes_no", value: "no" },
        { id: "q_gp13", type: "yes_no", value: "no" },
        { id: "q_gp14", type: "yes_no", value: "no" },
        { id: "q_gp15", type: "yes_no", value: "yes" },
        { id: "q_gp16", type: "yes_no", value: "yes" },
        { id: "q_gp17", type: "long_text", value: "" }
      ])
    },
    // Emily Watson Response 1 (Dr. Keith Morris)
    {
      id: "rec_res_emily_1",
      responseId: "rec_res_emily_1",
      referee: ["rec_ref_emily_1"],
      overallRating: 4.5,
      wordCountTotal: 120,
      ipAddress: "103.4.120.3",
      fraudFlags: "",
      fraudFlagDetails: "{}",
      submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000).toISOString(),
      answersJson: JSON.stringify([
        { id: "q_hc1", type: "yes_no", value: "yes" },
        { id: "q_hc2", type: "rating", value: 5 },
        { id: "q_hc3", type: "long_text", value: "Excellent nurse, very caring, handled clinical emergencies with great skill." }
      ])
    }
  ]
};

export const airtableService = {
  isMockMode: () => isMock,

  // Employers Table
  getEmployer: async (id: string) => {
    if (isMock) {
      return mockDb.employers.find((e: any) => e.id === id) || null;
    }
    try {
      const record = await base("Employers").find(id);
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error(`Airtable error fetching employer ${id}:`, err);
      throw err;
    }
  },

  getEmployerBySsoId: async (ssoId: string) => {
    if (isMock) {
      return mockDb.employers.find((e: any) => e.googleSsoId === ssoId) || null;
    }
    try {
      const records = await base("Employers")
        .select({
          filterByFormula: `{googleSsoId} = '${ssoId}'`,
          maxRecords: 1,
        })
        .firstPage();
      if (records.length === 0) return null;
      return { id: records[0].id, createdAt: records[0]._rawJson.createdTime, ...records[0].fields };
    } catch (err) {
      console.error(`Airtable error searching employer by SSO:`, err);
      throw err;
    }
  },

  createEmployer: async (data: { companyName: string; companyDomain: string; googleSsoId: string }) => {
    if (isMock) {
      const newId = `rec_emp_${Date.now()}`;
      const newEmployer = {
        id: newId,
        employerId: newId,
        companyName: data.companyName,
        companyDomain: data.companyDomain,
        planType: "Starter",
        subscriptionStatus: "Active",
        logoUrl: "",
        brandColour: "#2563EB",
        brandedSenderName: data.companyName,
        apiKey: `key_${Math.random().toString(36).substring(2, 12)}`,
        googleSsoId: data.googleSsoId,
        createdAt: new Date().toISOString(),
      };
      mockDb.employers.push(newEmployer);
      return newEmployer;
    }
    try {
      const record = await safeCreate("Employers", {
        companyName: data.companyName,
        companyDomain: data.companyDomain,
        googleSsoId: data.googleSsoId,
        planType: "Starter",
        subscriptionStatus: "Active",
      });
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error(`Airtable error creating employer:`, err);
      throw err;
    }
  },

  // Users Table
  getUserByEmail: async (email: string) => {
    if (isMock) {
      return mockDb.users.find((u: any) => u.email === email) || null;
    }
    try {
      const records = await base("Users")
        .select({
          filterByFormula: `{email} = '${email}'`,
          maxRecords: 1,
        })
        .firstPage();
      if (records.length === 0) return null;
      return { id: records[0].id, createdAt: records[0]._rawJson.createdTime, ...records[0].fields };
    } catch (err) {
      console.error(`Airtable error checking user by email:`, err);
      throw err;
    }
  },

  getUserById: async (id: string) => {
    if (isMock) {
      return mockDb.users.find((u: any) => u.id === id) || null;
    }
    try {
      const record = await base("Users").find(id);
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error(`Airtable error checking user by ID:`, err);
      return null;
    }
  },

  createUser: async (data: { fullName: string; email: string; googleSsoId: string; employerId: string; role?: string }) => {
    if (isMock) {
      const newId = `rec_usr_${Date.now()}`;
      const newUser = {
        id: newId,
        userId: newId,
        fullName: data.fullName,
        email: data.email,
        googleSsoId: data.googleSsoId,
        role: data.role || "Admin",
        employer: [data.employerId],
        isActive: true,
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      mockDb.users.push(newUser);
      return newUser;
    }
    try {
      const record = await safeCreate("Users", {
        fullName: data.fullName,
        email: data.email,
        googleSsoId: data.googleSsoId,
        role: data.role || "Admin",
        employer: [data.employerId],
        isActive: true,
        lastLoginAt: new Date().toISOString(),
      });
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error(`Airtable error creating user:`, err);
      throw err;
    }
  },

  updateUserFields: async (id: string, data: any) => {
    if (isMock) {
      const idx = mockDb.users.findIndex((u: any) => u.id === id);
      if (idx !== -1) {
        mockDb.users[idx] = { ...mockDb.users[idx], ...data };
      }
      return;
    }
    try {
      await safeUpdate("Users", id, data);
    } catch (err) {
      console.error(`Airtable error updating user fields for ${id}:`, err);
      throw err;
    }
  },


  // Candidates Table
  getCandidates: async (employerId?: string) => {
    if (isMock) {
      if (!employerId) return mockDb.candidates;
      return mockDb.candidates.filter((c: any) => c.employer && c.employer.includes(employerId));
    }
    try {
      const selectOptions: any = {};
      if (employerId) {
        selectOptions.filterByFormula = `SEARCH('${employerId}', ARRAYJOIN({employer})) > 0`;
      }
      const records = await base("Candidates").select(selectOptions).all();
      return records.map((r: any) => ({ id: r.id, createdAt: r._rawJson.createdTime || new Date().toISOString(), ...r.fields }));
    } catch (err) {
      console.error(`Airtable error fetching candidates:`, err);
      throw err;
    }
  },

  getCandidate: async (id: string) => {
    if (isMock) {
      return mockDb.candidates.find((c: any) => c.id === id) || null;
    }
    try {
      const record = await base("Candidates").find(id);
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error(`Airtable error fetching candidate by ID ${id}:`, err);
      throw err;
    }
  },

  createCandidate: async (data: {
    fullName: string;
    email: string;
    phone?: string;
    roleAppliedFor: string;
    employerName: string;
    employerId: string;
    assignedPackage: string;
    candidateToken: string;
    createdBy?: string;
  }) => {
    const newCandFields: any = {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone || "",
      roleAppliedFor: data.roleAppliedFor,
      employerName: data.employerName,
      employer: [data.employerId],
      assignedPackage: data.assignedPackage,
      candidateToken: data.candidateToken,
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      overallStatus: "Candidate Sent",
    };

    if (data.createdBy) {
      newCandFields.createdBy = [data.createdBy];
    }

    if (isMock) {
      const newId = `rec_cand_${Date.now()}`;
      const newCand = { id: newId, candidateId: newId, createdAt: new Date().toISOString(), ...newCandFields };
      mockDb.candidates.push(newCand);
      return newCand;
    }
    try {
      const record = await safeCreate("Candidates", newCandFields);
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error(`Airtable error creating candidate:`, err);
      throw err;
    }
  },

  getCandidateByToken: async (token: string) => {
    if (isMock) {
      return mockDb.candidates.find((c: any) => c.candidateToken === token) || null;
    }
    try {
      const records = await base("Candidates")
        .select({
          filterByFormula: `{candidateToken} = '${token}'`,
          maxRecords: 1,
        })
        .firstPage();
      if (records.length === 0) return null;
      return { id: records[0].id, createdAt: records[0]._rawJson.createdTime, ...records[0].fields };
    } catch (err) {
      console.error(`Airtable error fetching candidate by token:`, err);
      throw err;
    }
  },

  deleteCandidate: async (id: string) => {
    if (isMock) {
      const idx = mockDb.candidates.findIndex((c: any) => c.id === id);
      if (idx !== -1) {
        mockDb.candidates.splice(idx, 1);
        // Also delete associated referees
        mockDb.referees = mockDb.referees.filter((r: any) => !r.candidate.includes(id));
      }
      return;
    }
    try {
      // Fetch associated referees first to delete them
      const referees = await airtableService.getRefereesForCandidate(id);
      for (const r of referees) {
        await base("Referees").destroy(r.id);
      }
      await base("Candidates").destroy(id);
    } catch (err) {
      console.error(`Airtable error deleting candidate ${id}:`, err);
      throw err;
    }
  },

  updateCandidateStatus: async (id: string, status: string) => {
    if (isMock) {
      const idx = mockDb.candidates.findIndex((c: any) => c.id === id);
      if (idx !== -1) {
        mockDb.candidates[idx].overallStatus = status;
        if (status === "Referees Submitted") {
          mockDb.candidates[idx].candidateFormSubmittedAt = new Date().toISOString();
        }
      }
      return;
    }
    try {
      const updateFields: any = { overallStatus: status };
      if (status === "Referees Submitted") {
        updateFields.candidateFormSubmittedAt = new Date().toISOString();
      }
      await safeUpdate("Candidates", id, updateFields);
    } catch (err) {
      console.error(`Airtable error updating candidate status:`, err);
    }
  },

  updateCandidateFields: async (id: string, data: any) => {
    if (isMock) {
      const idx = mockDb.candidates.findIndex((c: any) => c.id === id);
      if (idx !== -1) {
        mockDb.candidates[idx] = { ...mockDb.candidates[idx], ...data };
      }
      return;
    }
    try {
      await safeUpdate("Candidates", id, data);
    } catch (err) {
      console.error(`Airtable error updating candidate fields for ${id}:`, err);
      throw err;
    }
  },

  // Questionnaire Templates Table (Sprint 2)
  getQuestionnaireTemplates: async (employerId: string) => {
    if (isMock) {
      return mockDb.questionnaireTemplates.filter(
        (t: any) => t.Is_System_Template || (t.Created_By && mockDb.users.find((u: any) => u.id === t.Created_By && u.employer.includes(employerId)))
      );
    }
    try {
      await ensureSystemTemplatesSeeded();
      const records = await base("Questionnaire_Templates")
        .select({
          filterByFormula: `OR({Is_System_Template} = 1, SEARCH('${employerId}', ARRAYJOIN({Created_By_Employer})))`
        })
        .all();
      return records.map((r: any) => ({ id: r.id, ...r.fields }));
    } catch (err) {
      console.error("Airtable error fetching questionnaire templates:", err);
      throw err;
    }
  },

  getQuestionnaireTemplate: async (id: string) => {
    if (isMock) {
      return mockDb.questionnaireTemplates.find((t: any) => t.id === id) || null;
    }
    try {
      const record = await base("Questionnaire_Templates").find(id);
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error(`Airtable error fetching template ${id}:`, err);
      throw err;
    }
  },

  getQuestionnaireTemplateByName: async (name: string) => {
    const normalized = normalizeTemplateName(name);
    if (isMock) {
      return mockDb.questionnaireTemplates.find((t: any) => t.Name === normalized) || mockDb.questionnaireTemplates[0];
    }
    try {
      await ensureSystemTemplatesSeeded();
      const records = await base("Questionnaire_Templates")
        .select({
          filterByFormula: `{Name} = '${normalized}'`,
          maxRecords: 1
        })
        .firstPage();
      if (records.length === 0) return null;
      return { id: records[0].id, createdAt: records[0]._rawJson.createdTime, ...records[0].fields };
    } catch (err) {
      console.error(`Airtable error fetching template by name ${normalized}:`, err);
      throw err;
    }
  },

  createQuestionnaireTemplate: async (data: {
    Name: string;
    Description?: string;
    Industry: string;
    Questions_JSON: string;
    Branching_Rules_JSON?: string;
    Created_By: string;
  }) => {
    const newFields: any = {
      Name: data.Name,
      Description: data.Description || "",
      Industry: data.Industry,
      Is_System_Template: false,
      Created_By: [data.Created_By],
      Status: "Active",
      Questions_JSON: data.Questions_JSON,
      Branching_Rules_JSON: data.Branching_Rules_JSON || "[]"
    };

    if (isMock) {
      const newId = `temp_cust_${Date.now()}`;
      const newTemplate = { id: newId, templateId: newId, Created_At: new Date().toISOString(), ...newFields };
      mockDb.questionnaireTemplates.push(newTemplate);
      return newTemplate;
    }
    try {
      const record = await safeCreate("Questionnaire_Templates", newFields);
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error("Airtable error creating template:", err);
      throw err;
    }
  },

  updateQuestionnaireTemplate: async (
    id: string,
    data: {
      Name?: string;
      Description?: string;
      Questions_JSON?: string;
      Branching_Rules_JSON?: string;
      Status?: string;
    }
  ) => {
    if (isMock) {
      const idx = mockDb.questionnaireTemplates.findIndex((t: any) => t.id === id);
      if (idx === -1) throw new Error("Template not found");
      const updated = { ...mockDb.questionnaireTemplates[idx], ...data };
      mockDb.questionnaireTemplates[idx] = updated;
      return updated;
    }
    try {
      const record = await safeUpdate("Questionnaire_Templates", id, data);
      return { id: record.id, ...record.fields };
    } catch (err) {
      console.error(`Airtable error updating template ${id}:`, err);
      throw err;
    }
  },

  deleteQuestionnaireTemplate: async (id: string) => {
    if (isMock) {
      const idx = mockDb.questionnaireTemplates.findIndex((t: any) => t.id === id);
      if (idx === -1) return false;
      mockDb.questionnaireTemplates[idx].Status = "Archived";
      return true;
    }
    try {
      await safeUpdate("Questionnaire_Templates", id, { Status: "Archived" });
      return true;
    } catch (err) {
      console.error(`Airtable error deleting template ${id}:`, err);
      throw err;
    }
  },

  duplicateQuestionnaireTemplate: async (id: string, createdByUserId: string) => {
    const source = await airtableService.getQuestionnaireTemplate(id);
    if (!source) throw new Error("Source template not found");

    return airtableService.createQuestionnaireTemplate({
      Name: `${source.Name} (Copy)`,
      Description: source.Description,
      Industry: source.Industry,
      Questions_JSON: source.Questions_JSON,
      Branching_Rules_JSON: source.Branching_Rules_JSON,
      Created_By: createdByUserId
    });
  },

  // Referees Table & Reference Requests Table (Sprint 3)
  createReferee: async (data: {
    fullName: string;
    email: string;
    phone: string;
    relationship: string;
    employerName: string;
    jobTitle: string;
    datesFrom: string;
    datesTo: string;
    candidateId: string;
    refereeToken: string;
  }) => {
    const fields: any = {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      relationship: data.relationship,
      employerName: data.employerName,
      jobTitle: data.jobTitle,
      datesFrom: data.datesFrom,
      datesTo: data.datesTo || "",
      candidate: [data.candidateId],
      refereeToken: data.refereeToken,
      tokenExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      formStatus: "Not Sent",
      isSubstitute: false,
    };

    if (isMock) {
      fields.employerDomain = data.email.split("@")[1] || "";
      const id = `rec_ref_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const record = { id, refereeId: id, ...fields };
      mockDb.referees.push(record);
      return record;
    }
    try {
      const record = await safeCreate("Referees", fields);
      return { id: record.id, ...record.fields };
    } catch (err) {
      console.error("Airtable error creating referee:", err);
      throw err;
    }
  },

  getReferee: async (id: string) => {
    if (isMock) {
      return mockDb.referees.find((r: any) => r.id === id) || null;
    }
    try {
      const record = await base("Referees").find(id);
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error(`Airtable error fetching referee ${id}:`, err);
      throw err;
    }
  },

  getRefereeByToken: async (token: string) => {
    if (isMock) {
      return mockDb.referees.find((r: any) => r.refereeToken === token) || null;
    }
    try {
      const records = await base("Referees")
        .select({
          filterByFormula: `{refereeToken} = '${token}'`,
          maxRecords: 1
        })
        .firstPage();
      if (records.length === 0) return null;
      return { id: records[0].id, ...records[0].fields };
    } catch (err) {
      console.error("Airtable error fetching referee by token:", err);
      throw err;
    }
  },

  updateRefereeFields: async (id: string, data: any) => {
    if (isMock) {
      const idx = mockDb.referees.findIndex((r: any) => r.id === id);
      if (idx !== -1) {
        mockDb.referees[idx] = { ...mockDb.referees[idx], ...data };
      }
      return;
    }
    try {
      await safeUpdate("Referees", id, data);
    } catch (err) {
      console.error(`Airtable error updating referee fields for ${id}:`, err);
      throw err;
    }
  },

  deleteReferee: async (id: string) => {
    if (isMock) {
      const idx = mockDb.referees.findIndex((r: any) => r.id === id);
      if (idx !== -1) {
        mockDb.referees.splice(idx, 1);
      }
      return;
    }
    try {
      await base("Referees").destroy(id);
    } catch (err) {
      console.error(`Airtable error deleting referee ${id}:`, err);
      throw err;
    }
  },

  getRefereesForCandidate: async (candidateId: string) => {
    if (isMock) {
      return mockDb.referees.filter((r: any) => r.candidate.includes(candidateId));
    }
    try {
      const records = await base("Referees")
        .select({
          filterByFormula: `SEARCH('${candidateId}', ARRAYJOIN({candidate})) > 0`
        })
        .all();
      return records.map((r: any) => ({ id: r.id, ...r.fields }));
    } catch (err) {
      console.error(`Airtable error fetching candidate referees for ${candidateId}:`, err);
      throw err;
    }
  },

  getIncompleteReferees: async () => {
    if (isMock) {
      return mockDb.referees.filter((r: any) => r.formStatus === "Sent" || r.formStatus === "Opened" || r.formStatus === "In Progress");
    }
    try {
      const records = await base("Referees")
        .select({
          filterByFormula: "OR({formStatus} = 'Sent', {formStatus} = 'Opened', {formStatus} = 'In Progress')"
        })
        .all();
      return records.map((r: any) => ({ id: r.id, ...r.fields }));
    } catch (err) {
      console.error("Airtable error fetching incomplete referees:", err);
      throw err;
    }
  },

  createReferenceRequest: async (data: {
    candidateId: string;
    employerId: string;
    status: string;
  }) => {
    const fields: any = {
      candidate: [data.candidateId],
      employer: [data.employerId],
      status: data.status,
    };

    if (isMock) {
      const id = `rec_req_${Date.now()}`;
      const record = { id, requestId: id, createdAt: new Date().toISOString(), ...fields };
      mockDb.referenceRequests.push(record);
      return record;
    }
    try {
      const record = await safeCreate("Reference_Requests", fields);
      return { id: record.id, createdAt: record._rawJson.createdTime, ...record.fields };
    } catch (err) {
      console.error("Airtable error creating reference request:", err);
      throw err;
    }
  },

  // Referee Responses Table (Sprint 4)
  createRefereeResponse: async (data: {
    refereeId: string;
    answersJson: string;
    overallRating: number;
    wordCountTotal: number;
    ipAddress?: string;
    fraudFlags?: string;
    fraudFlagDetails?: string;
  }) => {
    const fields: any = {
      referee: [data.refereeId],
      answersJson: data.answersJson,
      overallRating: data.overallRating,
      wordCountTotal: data.wordCountTotal,
      ipAddress: data.ipAddress || "127.0.0.1",
      submittedAt: new Date().toISOString(),
    };
    if (data.fraudFlags !== undefined) fields.fraudFlags = data.fraudFlags;
    if (data.fraudFlagDetails !== undefined) fields.fraudFlagDetails = data.fraudFlagDetails;

    if (isMock) {
      const id = `rec_res_${Date.now()}`;
      const record = { id, responseId: id, ...fields };
      mockDb.refereeResponses.push(record);
      return record;
    }
    try {
      const record = await safeCreate("Referee_Responses", fields);
      return { id: record.id, ...record.fields };
    } catch (err) {
      console.error("Airtable error creating referee response:", err);
      throw err;
    }
  },

  getResponsesForReferee: async (refereeId: string) => {
    if (isMock) {
      return mockDb.refereeResponses.filter((r: any) => r.referee.includes(refereeId));
    }
    try {
      const records = await base("Referee_Responses")
        .select({
          filterByFormula: `SEARCH('${refereeId}', ARRAYJOIN({referee})) > 0`
        })
        .all();
      return records.map((r: any) => ({ id: r.id, ...r.fields }));
    } catch (err) {
      console.error(`Airtable error fetching responses for referee ${refereeId}:`, err);
      throw err;
    }
  }
};
