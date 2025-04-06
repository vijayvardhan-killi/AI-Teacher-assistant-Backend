const Tesseract = require('tesseract.js');
const pdfPoppler = require('pdf-poppler');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

async function preprocessImage(imagePath) {
  const tempPath = `${imagePath}.temp.png`; // Temporary file
  await sharp(imagePath)
    .grayscale()
    .linear(1.5) // Increase contrast
    .normalize()
    .toFile(tempPath); // Save to temp file

  // Replace original with processed image
  await fs.rename(tempPath, imagePath);
  return imagePath;
}

async function processHandwrittenPDF(pdfPath) {
  try {
    const outputDir = './output';
    await fs.mkdir(outputDir, { recursive: true });

    await pdfPoppler.convert(pdfPath, {
      format: 'png',
      out_dir: outputDir,
      out_prefix: 'page',
      page: null, // All pages
    });

    const extractedTexts = [];
    const files = await fs.readdir(outputDir);
    for (const file of files) {
      const imagePath = path.join(outputDir, file);
      await preprocessImage(imagePath);

      console.log(`Processing ${file}...`);
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
      extractedTexts.push(`${file}: ${text}`);
    }

    const fullText = extractedTexts.join('\n\n');
    console.log('Extracted Text:', fullText);

    // const aiResponse = await axios.post(
    //   'https://api.example.com/ai-endpoint',
    //   { text: fullText },
    //   {
    //     headers: {
    //       'Authorization': 'Bearer YOUR_API_KEY',
    //       'Content-Type': 'application/json',
    //     },
    //   }
    // );
    // console.log('AI Response:', aiResponse.data);

    await fs.rm(outputDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Error:', error);
  }
}

processHandwrittenPDF('./OOAD Assignment 4.pdf');