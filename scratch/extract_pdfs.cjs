const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function parsePdf(filePath, outputPath) {
  let parser;
  try {
    const dataBuffer = fs.readFileSync(filePath);
    parser = new PDFParse({ data: dataBuffer });
    const textResult = await parser.getText();
    fs.writeFileSync(outputPath, textResult.text);
    console.log(`Successfully parsed ${filePath} and wrote text to ${outputPath}`);
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}

async function run() {
  const pdf1 = '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc/media__1781910926357.pdf';
  const pdf2 = '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc/media__1781911440582.pdf';
  
  await parsePdf(pdf1, '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc/scratch/text_1781910926357.txt');
  await parsePdf(pdf2, '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc/scratch/text_1781911440582.txt');
}

run();
