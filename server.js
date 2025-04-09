require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Tesseract = require('tesseract.js');
const { fromPath } = require('pdf2pic'); // Replaced pdf-poppler with pdf2pic
const axios = require('axios');
const sharp = require('sharp');

const app = express();
app.use(cors());
app.use(express.json());

const SUBMISSIONS_FILE = './submissions.json';

// Configure Multer for PDF uploads
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Initialize Gemini AI API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Function to get AI feedback
async function getFeedback(text) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(
      "Assume you are a teacher. Review this text and provide feedback and a grade (1-5):\n\n" + text
    );
    return result.response.text();
  } catch (error) {
    console.error('AI Error:', error);
    throw new Error('Error generating feedback');
  }
}

async function preprocessImage(imagePath) {
  const tempPath = `${imagePath}.temp.png`;
  await sharp(imagePath)
    .grayscale()
    .linear(1.5)
    .normalize()
    .toFile(tempPath);

  await fs.rename(tempPath, imagePath);
  return imagePath;
}

async function extractTextFromPDF(pdfPath) {
  const outputDir = './output';
  try {
    await fs.mkdir(outputDir, { recursive: true });
    
    const PDFExtract = require('pdf.js-extract').PDFExtract;
    const pdfExtract = new PDFExtract();
    const data = await pdfExtract.extract(pdfPath, { 
      firstPage: 1,
      lastPage: null,
      renderPageAsImage: true // Render page as image
    });
    
    const extractedTexts = [];
    for (let i = 0; i < data.pages.length; i++) {
      const page = data.pages[i];
      
      // Save the page image
      const imagePath = path.join(outputDir, `page-${i+1}.png`);
      await fs.writeFile(imagePath, page.image, 'base64');
      
      // Process with your existing code
      await preprocessImage(imagePath);
      
      console.log(`Processing page ${i+1}...`);
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
      extractedTexts.push(`Page ${i+1}: ${text}`);
    }

    const fullText = extractedTexts.join('\n\n');
    return fullText;
  } catch (error) {
    console.error('PDF Extraction Error:', error);
    throw error;
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true }).catch((err) =>
      console.error('Cleanup Error:', err)
    );
  }
}

async function saveSubmission(submission) {
  let submissions = [];
  try {
    const fileExists = await fs.stat(SUBMISSIONS_FILE).catch(() => false);
    if (fileExists) {
      const fileContent = await fs.readFile(SUBMISSIONS_FILE, 'utf8');
      if (fileContent.trim()) { // Check if content is non-empty
        submissions = JSON.parse(fileContent);
      }
    }
    submissions.push(submission);
    await fs.writeFile(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2));
  } catch (error) {
    console.error('Save Submission Error:', error);
    throw error;
  }
}

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const extractedText = await extractTextFromPDF(req.file.path);
    if (!extractedText) {
      return res.status(500).json({ message: 'Failed to extract text from PDF' });
    }

    const feedback = await getFeedback(extractedText);

    const submission = {
      id: Date.now(),
      filename: req.file.filename,
      feedback,
      teacherComments: '',
    };
    await saveSubmission(submission);

    res.json({ message: 'File Uploaded Successfully', feedback });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  } finally {
    await fs.unlink(req.file.path).catch((err) => console.error('File Cleanup Error:', err));
  }
});

app.get('/submissions', async (req, res) => {
  try {
    const fileExists = await fs.stat(SUBMISSIONS_FILE).catch(() => false);
    if (fileExists) {
      const submissions = JSON.parse(await fs.readFile(SUBMISSIONS_FILE, 'utf8'));
      res.json(submissions);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Submissions Fetch Error:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

app.post('/update-comment', async (req, res) => {
  const { id, teacherComments } = req.body;
  try {
    let submissions = JSON.parse(await fs.readFile(SUBMISSIONS_FILE, 'utf8'));
    submissions = submissions.map((submission) =>
      submission.id === id ? { ...submission, teacherComments } : submission
    );
    await fs.writeFile(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2));
    res.json({ message: 'Comment Updated Successfully' });
  } catch (error) {
    console.error('Update Comment Error:', error);
    res.status(500).json({ message: 'Error updating comment' });
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));