const fs = require("fs");
const pdf = require("pdf-parse");

const pdfPath = "/Users/waynesullivan/Desktop/RefCheck_Candidex_Sprint_Plan_v2.pdf";
const dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer).then(function (data) {
  const text = data.text;
  
  // Write the entire parsed text to handoff-parsed.md
  fs.writeFileSync("/Users/waynesullivan/.gemini/antigravity/scratch/refcheck/scratch/handoff-parsed.md", text);
  console.log("PDF parsed and written to scratch/handoff-parsed.md");

  // Search for Sprint 5 details
  const searchStr = "Sprint 5";
  let idx = -1;
  while ((idx = text.indexOf(searchStr, idx + 1)) !== -1) {
    console.log(`\n--- Match at index ${idx} ---`);
    console.log(text.substring(Math.max(0, idx - 100), idx + 2000));
  }
}).catch(err => {
  console.error("Failed to parse PDF:", err);
});
