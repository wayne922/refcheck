const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const resourcesDir = '/Users/waynesullivan/Library/CloudStorage/GoogleDrive-wayne@candidex.co.nz/My Drive/AI Operating System/Research/Resources';
const outputDir = '/Users/waynesullivan/antigravity/Compliance/refcheck/scratch';

async function parsePdf(filePath, fileName) {
  console.log(`Parsing ${fileName}...`);
  const dataBuffer = fs.readFileSync(filePath);
  
  let parser;
  try {
    parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    const outputName = fileName.replace('.pdf', '_raw.txt');
    const outputPath = path.join(outputDir, outputName);
    fs.writeFileSync(outputPath, result.text);
    console.log(`Saved text to ${outputPath} (${result.text.length} chars)`);
  } catch (err) {
    console.error(`Error parsing ${fileName}:`, err);
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}

async function run() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!fs.existsSync(resourcesDir)) {
    console.error(`Resources directory not found: ${resourcesDir}`);
    return;
  }

  const files = fs.readdirSync(resourcesDir);
  console.log(`Found ${files.length} files in resources directory.`);

  for (const file of files) {
    if (file.toLowerCase().endsWith('.pdf')) {
      const filePath = path.join(resourcesDir, file);
      await parsePdf(filePath, file);
    }
  }
}

run();
