const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const resourcesDir = '/Users/waynesullivan/Library/CloudStorage/GoogleDrive-wayne@candidex.co.nz/My Drive/AI Operating System/Context/Resources';
const outputDir = '/Users/waynesullivan/antigravity/Compliance/refcheck/scratch';

const pdfs = [
  'MSD & Candidex Pūkenga Mahi” Skills For Industry Pilot Proposal - Education Sector (Final).pdf',
  'MSD Tuakana Teina Programme (1).pdf',
  'MSD Placement Service _ Presentation_2026.pdf',
  'flocc-ara-mahi-supplier-proposal-designed-DRAFT 2.57.37 PM.pdf'
];

async function parsePdf(fileName) {
  const filePath = path.join(resourcesDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  console.log(`Parsing ${fileName}...`);
  const dataBuffer = fs.readFileSync(filePath);
  try {
    const data = await pdf(dataBuffer);
    const outputName = fileName.replace('.pdf', '_raw.txt');
    const outputPath = path.join(outputDir, outputName);
    fs.writeFileSync(outputPath, data.text);
    console.log(`Saved text to ${outputPath} (${data.text.length} chars)`);
  } catch (err) {
    console.error(`Error parsing ${fileName}:`, err);
  }
}

async function run() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  for (const file of pdfs) {
    await parsePdf(file);
  }
}

run();
