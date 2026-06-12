import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_PAT;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!API_KEY || !BASE_ID) {
  console.error("❌ Error: AIRTABLE_API_KEY (or AIRTABLE_PAT) and AIRTABLE_BASE_ID must be set in your .env file.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

async function run() {
  console.log(`🔍 Checking schema for Airtable Base: ${BASE_ID}...`);

  // 1. Fetch current tables
  const getBasesUrl = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
  const res = await fetch(getBasesUrl, { headers });
  
  if (!res.ok) {
    const errText = await res.text();
    console.error("❌ Failed to fetch base metadata. Ensure your token has 'schema.bases:read' and 'schema.bases:write' scopes.");
    console.error(`Status: ${res.status} - ${errText}`);
    process.exit(1);
  }

  const data = (await res.json()) as { tables: any[] };
  const existingTables = data.tables || [];
  console.log(`✅ Connected successfully. Found ${existingTables.length} existing tables.`);

  const tableMap: Record<string, string> = {}; // Name -> ID
  existingTables.forEach((t) => {
    tableMap[t.name] = t.id;
  });

  const dateTimeOptions = {
    dateFormat: { name: "iso" },
    timeFormat: { name: "12hour" },
    timeZone: "utc"
  };

  // Table Definitions

  // 1. Employers
  if (!tableMap["Employers"]) {
    console.log("🛠️ Creating table: Employers...");
    const resCreate = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Employers",
        description: "Company records",
        fields: [
          { name: "companyName", type: "singleLineText" },
          { name: "companyDomain", type: "singleLineText" },
          { name: "planType", type: "singleLineText" },
          { name: "subscriptionStatus", type: "singleLineText" },
          { name: "logoUrl", type: "singleLineText" },
          { name: "brandColour", type: "singleLineText" },
          { name: "brandedSenderName", type: "singleLineText" },
          { name: "googleSsoId", type: "singleLineText" },
        ],
      }),
    });
    if (!resCreate.ok) throw new Error(`Failed to create Employers: ${await resCreate.text()}`);
    const created = await resCreate.json() as any;
    tableMap["Employers"] = created.id;
    console.log(`✅ Created Employers table: ${created.id}`);
  } else {
    console.log(`ℹ️ Table Employers already exists: ${tableMap["Employers"]}`);
  }

  // 2. Users
  if (!tableMap["Users"]) {
    console.log("🛠️ Creating table: Users...");
    const resCreate = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Users",
        description: "Recruitment consultants and hiring managers",
        fields: [
          { name: "fullName", type: "singleLineText" },
          { name: "email", type: "singleLineText" },
          { name: "googleSsoId", type: "singleLineText" },
          { name: "role", type: "singleLineText" },
          {
            name: "employer",
            type: "multipleRecordLinks",
            options: { linkedTableId: tableMap["Employers"] },
          },
          { name: "isActive", type: "checkbox", options: { icon: "check", color: "greenBright" } },
          { name: "lastLoginAt", type: "dateTime", options: dateTimeOptions },
        ],
      }),
    });
    if (!resCreate.ok) throw new Error(`Failed to create Users: ${await resCreate.text()}`);
    const created = await resCreate.json() as any;
    tableMap["Users"] = created.id;
    console.log(`✅ Created Users table: ${created.id}`);
  } else {
    console.log(`ℹ️ Table Users already exists: ${tableMap["Users"]}`);
  }

  // 3. Candidates
  if (!tableMap["Candidates"]) {
    console.log("🛠️ Creating table: Candidates...");
    const resCreate = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Candidates",
        description: "Job candidates undergoing reference vetting",
        fields: [
          { name: "fullName", type: "singleLineText" },
          { name: "email", type: "singleLineText" },
          { name: "phone", type: "singleLineText" },
          { name: "roleAppliedFor", type: "singleLineText" },
          { name: "employerName", type: "singleLineText" },
          {
            name: "employer",
            type: "multipleRecordLinks",
            options: { linkedTableId: tableMap["Employers"] },
          },
          { name: "assignedPackage", type: "singleLineText" },
          { name: "candidateToken", type: "singleLineText" },
          { name: "tokenExpiresAt", type: "dateTime", options: dateTimeOptions },
          { name: "overallStatus", type: "singleLineText" },
          {
            name: "createdBy",
            type: "multipleRecordLinks",
            options: { linkedTableId: tableMap["Users"] },
          },
          { name: "candidateSubmissionIp", type: "singleLineText" },
          { name: "candidateFormSubmittedAt", type: "dateTime", options: dateTimeOptions },
        ],
      }),
    });
    if (!resCreate.ok) throw new Error(`Failed to create Candidates: ${await resCreate.text()}`);
    const created = await resCreate.json() as any;
    tableMap["Candidates"] = created.id;
    console.log(`✅ Created Candidates table: ${created.id}`);
  } else {
    console.log(`ℹ️ Table Candidates already exists: ${tableMap["Candidates"]}`);
  }

  // 4. Questionnaire_Templates
  if (!tableMap["Questionnaire_Templates"]) {
    console.log("🛠️ Creating table: Questionnaire_Templates...");
    const resCreate = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Questionnaire_Templates",
        description: "System and custom questionnaire forms configuration",
        fields: [
          { name: "Name", type: "singleLineText" },
          { name: "Description", type: "multilineText" },
          { name: "Industry", type: "singleLineText" },
          { name: "Is_System_Template", type: "checkbox", options: { icon: "check", color: "greenBright" } },
          { name: "Questions_JSON", type: "multilineText" },
          { name: "Branching_Rules_JSON", type: "multilineText" },
          { name: "Status", type: "singleLineText" },
        ],
      }),
    });
    if (!resCreate.ok) throw new Error(`Failed to create Questionnaire_Templates: ${await resCreate.text()}`);
    const created = await resCreate.json() as any;
    tableMap["Questionnaire_Templates"] = created.id;
    console.log(`✅ Created Questionnaire_Templates table: ${created.id}`);
  } else {
    console.log(`ℹ️ Table Questionnaire_Templates already exists: ${tableMap["Questionnaire_Templates"]}`);
  }

  // 5. Referees
  if (!tableMap["Referees"]) {
    console.log("🛠️ Creating table: Referees...");
    const resCreate = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Referees",
        description: "Nominated referees for references",
        fields: [
          { name: "fullName", type: "singleLineText" },
          { name: "email", type: "singleLineText" },
          { name: "phone", type: "singleLineText" },
          { name: "relationship", type: "singleLineText" },
          { name: "employerName", type: "singleLineText" },
          { name: "datesFrom", type: "singleLineText" },
          { name: "datesTo", type: "singleLineText" },
          {
            name: "candidate",
            type: "multipleRecordLinks",
            options: { linkedTableId: tableMap["Candidates"] },
          },
          { name: "refereeToken", type: "singleLineText" },
          { name: "tokenExpiresAt", type: "dateTime", options: dateTimeOptions },
          { name: "formStatus", type: "singleLineText" },
          { name: "emailSentAt", type: "dateTime", options: dateTimeOptions },
          { name: "smsSentAt", type: "dateTime", options: dateTimeOptions },
          { name: "nudge1SentAt", type: "dateTime", options: dateTimeOptions },
          { name: "nudge2SentAt", type: "dateTime", options: dateTimeOptions },
          { name: "employerAlertedAt", type: "dateTime", options: dateTimeOptions },
          { name: "isSubstitute", type: "checkbox", options: { icon: "check", color: "greenBright" } },
          { name: "substituteFor", type: "singleLineText" },
        ],
      }),
    });
    if (!resCreate.ok) throw new Error(`Failed to create Referees: ${await resCreate.text()}`);
    const created = await resCreate.json() as any;
    tableMap["Referees"] = created.id;
    console.log(`✅ Created Referees table: ${created.id}`);
  } else {
    console.log(`ℹ️ Table Referees already exists: ${tableMap["Referees"]}`);
  }

  // 6. Referee_Responses
  if (!tableMap["Referee_Responses"]) {
    console.log("🛠️ Creating table: Referee_Responses...");
    const resCreate = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Referee_Responses",
        description: "Completed referee questionnaire answers and scores",
        fields: [
          { name: "responseId", type: "singleLineText" }, // Primary key must be non-link type
          {
            name: "referee",
            type: "multipleRecordLinks",
            options: { linkedTableId: tableMap["Referees"] },
          },
          { name: "answersJson", type: "multilineText" },
          { name: "overallRating", type: "number", options: { precision: 1 } },
          { name: "wordCountTotal", type: "number", options: { precision: 0 } },
          { name: "fraudFlags", type: "singleLineText" },
          { name: "fraudFlagDetails", type: "multilineText" },
          { name: "submittedAt", type: "dateTime", options: dateTimeOptions },
          { name: "ipAddress", type: "singleLineText" },
          { name: "submissionDurationSeconds", type: "number", options: { precision: 0 } },
        ],
      }),
    });
    if (!resCreate.ok) throw new Error(`Failed to create Referee_Responses: ${await resCreate.text()}`);
    const created = await resCreate.json() as any;
    tableMap["Referee_Responses"] = created.id;
    console.log(`✅ Created Referee_Responses table: ${created.id}`);
  } else {
    console.log(`ℹ️ Table Referee_Responses already exists: ${tableMap["Referee_Responses"]}`);
  }

  console.log("\n🎉 Airtable base schema configuration check complete! All tables verified.");
}

run().catch((err) => {
  console.error("❌ Schema creation failed:");
  console.error(err);
  process.exit(1);
});
