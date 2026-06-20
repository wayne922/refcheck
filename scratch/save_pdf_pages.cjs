const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function run() {
  const pdfPath = '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc/test_generated_report.pdf';
  const outDir = '/Users/waynesullivan/.gemini/antigravity/brain/8fe55eb0-d3d4-4cb3-b2b1-fd8ad128a2bc';

  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  
  console.log("Generating screenshots of PDF pages...");
  const result = await parser.getScreenshot({ scale: 2 });
  
  result.pages.forEach((page) => {
    const outPath = `${outDir}/page_${page.pageNumber}.png`;
    fs.writeFileSync(outPath, page.data);
    console.log(`Saved screenshot page ${page.pageNumber} to ${outPath}`);
  });

  await parser.destroy();
}

run().catch(console.error);
