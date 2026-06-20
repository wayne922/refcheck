import fs from 'fs';
import pdf from 'pdf-parse';

async function parsePdf(filePath, outputPath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    fs.writeFileSync(outputPath, data.text);
    console.log(`Successfully parsed ${filePath} and wrote text to ${outputPath}`);
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
  }
}

async function run() {
  const pdf1 = '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc/media__1781910926357.pdf';
  const pdf2 = '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc/media__1781911440582.pdf';
  
  await parsePdf(pdf1, '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc/scratch/text_1781910926357.txt');
  await parsePdf(pdf2, '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc/scratch/text_1781911440582.txt');
}

run();
