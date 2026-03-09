const express = require('express');
const cors = require('cors');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
let geminiModel;

// Try to use gemini-1.5-flash, fallback to gemini-pro
async function initializeGemini() {
  try {
    // First try gemini-1.5-flash (newer, better)
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    console.log('✅ Using Gemini 2.5 Flash model');
  } catch (error) {
    console.log('❌ Gemini 2.5 Flash not available, trying Gemini 1.5 flash...');
    try {
      // Fallback to gemini-pro
      geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      console.log('✅ Using Gemini 1.5 model');
    } catch (fallbackError) {
      console.log('❌ Both Gemini models failed, using simulated responses');
      geminiModel = null;
    }
  }
}

initializeGemini();

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '20mb' }));
app.use(compression());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Multer config for file uploads (max 10MB)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype.split('/').pop());
    if (ext || mime || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only images (JPEG, PNG, GIF, WebP) and PDF files are allowed'));
  }
});

// Test database connection
async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL database via Prisma');
  } catch (err) {
    console.error('Error connecting to database:', err.message);
  }
}

connectDatabase();

// Medical safety prompt for Gemini
const MEDICAL_SAFETY_PROMPT = `
You are MEDICARE AI, a medical assistant chatbot. Follow these rules strictly:

1. PROVIDE GENERAL HEALTH INFORMATION ONLY - never diagnose or prescribe
2. Always recommend consulting healthcare professionals for medical concerns
3. Focus on symptoms, general advice, and when to seek help
4. For medication questions, provide general information but emphasize doctor consultation
5. Be empathetic and clear about limitations
6. If unsure, say "I recommend consulting a healthcare professional"
7. Keep responses concise but helpful (2-3 paragraphs maximum)
8. Include warning: "⚠️ This is AI assistance, not medical diagnosis. Consult a doctor." (translate this warning too)
9. DETECT the language of the user's question and RESPOND ENTIRELY in that SAME language. If the user writes in Hindi, respond in Hindi. If in Telugu, respond in Telugu. If in English, respond in English. Match the user's language exactly.

User question: {USER_QUESTION}

Respond in the SAME language as the user's question above:
`;

// Enhanced chat function with Gemini AI
async function getGeminiResponse(userMessage) {
  if (!geminiModel) {
    throw new Error('Gemini AI is not configured properly');
  }

  try {
    const prompt = MEDICAL_SAFETY_PROMPT
      .replace(/{USER_QUESTION}/g, userMessage);
    
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return text;
  } catch (error) {
    console.error('Gemini API Error:', error);
    
    // Fallback responses based on common medical queries
    if (userMessage.toLowerCase().includes('fever') || userMessage.toLowerCase().includes('temperature')) {
      return `For fever concerns: "${userMessage}"\n\nGeneral Advice:\n• Rest and stay hydrated with water, electrolytes\n• Take Paracetamol for fever over 38°C as directed\n• Use cool compresses on forehead\n• Monitor temperature every 4-6 hours\n• Seek medical help if fever exceeds 39.4°C, persists beyond 3 days, or is accompanied by rash, stiff neck, or confusion\n\n💡 Suitable medicines: Paracetamol, Ibuprofen (follow package instructions)\n\n⚠️ This is general information. Consult a healthcare professional for proper diagnosis and treatment.`;
    } else if (userMessage.toLowerCase().includes('headache')) {
      return `For headache: "${userMessage}"\n\nGeneral Suggestions:\n• Rest in a quiet, dark room\n• Stay well-hydrated throughout the day\n• Consider Paracetamol or Ibuprofen following package instructions\n• Limit screen time and take regular breaks\n• Practice relaxation techniques like deep breathing\n• Apply cool compress to forehead\n\n🚨 Seek immediate medical attention for:\n- Sudden severe headache\n- Headache with fever, stiff neck, confusion\n- Headache after head injury\n- Headache with vision changes or weakness\n\n⚠️ Consult a doctor for persistent or severe headaches.`;
    } else if (userMessage.toLowerCase().includes('cold') || userMessage.toLowerCase().includes('cough')) {
      return `For cold/cough symptoms: "${userMessage}"\n\nCare Recommendations:\n• Drink warm fluids like herbal tea, broth\n• Use steam inhalation or humidifier\n• Get plenty of rest to support immune system\n• Consider Cetirizine for allergy-related symptoms\n• Honey and lemon can soothe sore throat\n• Saline nasal sprays for congestion\n\n💡 Suitable medicines:\n- Paracetamol for fever/body aches\n- Cetirizine for allergies\n- Cough syrups based on cough type (dry/productive)\n\n🏥 See a doctor if:\n- Symptoms worsen after 7 days\n- High fever develops\n- Difficulty breathing occurs\n- Chest pain experienced\n\n⚠️ Always consult healthcare professionals for proper diagnosis.`;
    } else if (userMessage.toLowerCase().includes('stomach') || userMessage.toLowerCase().includes('diarrhea')) {
      return `For stomach issues: "${userMessage}"\n\nGeneral Guidance:\n• Stay hydrated with oral rehydration solutions\n• Follow BRAT diet (Bananas, Rice, Applesauce, Toast)\n• Avoid dairy, fatty, or spicy foods temporarily\n• Rest and allow digestive system to recover\n\n💡 Suitable medicines:\n- Oral rehydration salts for dehydration\n- Omeprazole for acidity (under medical guidance)\n\n🚨 Seek immediate care for:\n- Severe abdominal pain\n- Blood in stool or vomit\n- Signs of dehydration (dizziness, dark urine)\n- Symptoms lasting more than 48 hours\n\n⚠️ Consult a doctor for proper evaluation and treatment.`;
    } else {
      return `Thank you for your health question: "${userMessage}"\n\nI understand you're seeking medical information. Here's my general approach:\n\n• I provide educational health information and general wellness advice\n• I can explain common symptoms and when to seek help\n• I recommend consulting qualified healthcare professionals for:\n  - Diagnosis of medical conditions\n  - Prescription medications\n  - Treatment plans\n  - Emergency situations\n\n📞 For urgent concerns: Contact emergency services or visit nearest hospital\n🏥 For non-urgent issues: Schedule appointment with your doctor\n💊 For medication: Always follow prescribed treatments\n\n🔍 You can also check our Medicines database for general information and our Diseases section for symptom understanding.\n\n⚠️ Important: This is AI-powered health information, not medical diagnosis. Always consult healthcare professionals for personal medical advice.`;
    }
  }
}

// Routes

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    console.log('Registration attempt:', req.body.email);
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
      select: { id: true, name: true, email: true }
    });
    
    console.log('User registered successfully:', email);
    res.status(201).json({ 
      message: 'User created successfully',
      user
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'P2002') { // Prisma unique constraint violation
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body.email);
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
    
    console.log('Login successful:', email);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Chat with AI - Now with REAL Gemini API
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log('Chat request:', message);
    
    // Get AI response from Gemini
    let aiResponse;
    try {
      aiResponse = await getGeminiResponse(message);
      console.log('✅ Gemini API response successful');
    } catch (geminiError) {
      console.error('Gemini API failed:', geminiError);
      aiResponse = `I apologize, but I'm currently having trouble accessing my medical knowledge base. \n\nFor "${message}", I recommend:\n\n• Consulting with a healthcare professional\n• Visiting our Medicines section for general information\n• Checking our Diseases database for symptom understanding\n\n🔧 Technical Note: AI service temporarily unavailable. Please try again shortly.\n\n⚠️ Always consult qualified medical professionals for health concerns.`;
    }
    
    // Save to user's chat history if user is logged in
    if (userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: parseInt(userId) },
          select: { chatHistory: true }
        });
        
        let chatHistory = user.chatHistory || [];
        chatHistory.push({
          date: new Date().toISOString(),
          query: message,
          response: aiResponse
        });
        
        await prisma.user.update({
          where: { id: parseInt(userId) },
          data: { chatHistory }
        });
        
        console.log('✅ Chat history saved for user:', userId);
      } catch (dbError) {
        console.error('Error saving chat history:', dbError);
        // Don't fail the request if history saving fails
      }
    }
    
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ error: 'Failed to process your message. Please try again.' });
  }
});

// Get Medicines
app.get('/api/medicines', async (req, res) => {
  try {
    const { sort, category } = req.query;
    
    const where = category && category !== 'all' ? { category } : {};
    
    let orderBy = { name: 'asc' };
    if (sort === 'price-low') orderBy = { price: 'asc' };
    else if (sort === 'price-high') orderBy = { price: 'desc' };
    
    const medicines = await prisma.medicine.findMany({ where, orderBy });
    console.log(`Returning ${medicines.length} medicines`);
    res.json(medicines);
  } catch (error) {
    console.error('Medicines error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Diseases
app.get('/api/diseases', async (req, res) => {
  try {
    const diseases = await prisma.disease.findMany({ orderBy: { name: 'asc' } });
    console.log(`Returning ${diseases.length} diseases`);
    res.json(diseases);
  } catch (error) {
    console.error('Diseases error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get User Profile
app.get('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        email: true,
        medicalHistory: true,
        chatHistory: true,
        createdAt: true
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Map to snake_case for frontend compatibility
    const response = {
      ...user,
      medical_history: user.medicalHistory || [],
      chat_history: user.chatHistory || [],
      created_at: user.createdAt
    };
    delete response.medicalHistory;
    delete response.chatHistory;
    delete response.createdAt;
    
    res.json(response);
  } catch (error) {
    console.error('User profile error:', error);
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/user/:id/medical-record', async (req, res) => {
  try {
    const { id } = req.params;
    const { condition, date, notes } = req.body;
    
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: { medicalHistory: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    let medicalHistory = user.medicalHistory || [];
    
    // Add new medical record
    medicalHistory.push({
      condition,
      date: date || new Date().toISOString(),
      notes: notes || ''
    });
    
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { medicalHistory }
    });
    
    res.json({ message: 'Medical record added successfully', medicalHistory });
  } catch (error) {
    console.error('Medical record error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyze uploaded medical report with Gemini Vision
app.post('/api/analyze-report', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { message, userId } = req.body;
    const file = req.file;

    console.log(`📄 File uploaded: ${file.originalname} (${file.mimetype}, ${(file.size / 1024).toFixed(1)}KB)`);

    let aiResponse;

    if (geminiModel) {
      try {
        const userPrompt = message || 'Please analyze this medical report and provide key findings, observations, and any recommendations.';

        const analysisPrompt = `${MEDICAL_SAFETY_PROMPT.replace(/{USER_QUESTION}/g, userPrompt)}\n\nThe patient has uploaded a medical report/image. Analyze it thoroughly and provide:\n1. Key findings from the report\n2. Any abnormal values or concerns\n3. General recommendations\n4. Whether they should consult a specialist\n\nRemember to include the medical safety disclaimer.`;

        if (file.mimetype === 'application/pdf') {
          // For PDF: send as inline data with pdf mime type
          const base64Data = file.buffer.toString('base64');
          const filePart = {
            inlineData: {
              data: base64Data,
              mimeType: 'application/pdf'
            }
          };
          const result = await geminiModel.generateContent([analysisPrompt, filePart]);
          const response = await result.response;
          aiResponse = response.text();
        } else {
          // For images: send as inline data
          const base64Data = file.buffer.toString('base64');
          const imagePart = {
            inlineData: {
              data: base64Data,
              mimeType: file.mimetype
            }
          };
          const result = await geminiModel.generateContent([analysisPrompt, imagePart]);
          const response = await result.response;
          aiResponse = response.text();
        }

        console.log('✅ Gemini Vision analysis complete');
      } catch (geminiError) {
        console.error('Gemini Vision error:', geminiError);
        aiResponse = `I received your file (${file.originalname}) but encountered an issue analyzing it.\n\nPlease ensure:\n• The image is clear and readable\n• The file is a medical report, lab result, or prescription\n• The file is not corrupted\n\nYou can also try describing your report details in text, and I'll help interpret them.\n\n⚠️ This is AI assistance, not medical diagnosis. Consult a doctor.`;
      }
    } else {
      aiResponse = `I received your file (${file.originalname}) but the AI analysis service is currently unavailable. Please try again later or describe your report in text.\n\n⚠️ Always consult healthcare professionals for medical report interpretation.`;
    }

    // Save to chat history if logged in
    if (userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: parseInt(userId) },
          select: { chatHistory: true }
        });
        let chatHistory = user.chatHistory || [];
        chatHistory.push({
          date: new Date().toISOString(),
          query: `[File: ${file.originalname}] ${message || 'Analyze this report'}`,
          response: aiResponse
        });
        await prisma.user.update({
          where: { id: parseInt(userId) },
          data: { chatHistory }
        });
      } catch (dbError) {
        console.error('Error saving chat history:', dbError);
      }
    }

    res.json({ response: aiResponse, fileName: file.originalname });
  } catch (error) {
    console.error('Report analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze report. Please try again.' });
  }
});

// Test Gemini API endpoint
app.get('/api/test-gemini', async (req, res) => {
  try {
    if (!geminiModel) {
      return res.json({ 
        status: 'error', 
        message: 'Gemini AI not configured. Check your API key.',
        geminiConfigured: false
      });
    }

    const testMessage = "What are general tips for staying healthy?";
    const response = await getGeminiResponse(testMessage);
    
    res.json({ 
      status: 'success', 
      message: 'Gemini API is working!',
      geminiConfigured: true,
      testResponse: response.substring(0, 200) + '...'
    });
  } catch (error) {
    res.json({ 
      status: 'error', 
      message: 'Gemini API test failed: ' + error.message,
      geminiConfigured: false
    });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const geminiStatus = geminiModel ? 'Connected' : 'Not configured';
    
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      gemini_ai: geminiStatus,
      timestamp: new Date().toISOString(),
      message: 'MEDICARE AI Backend with Gemini is running successfully!'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Error', 
      database: 'Disconnected', 
      error: error.message 
    });
  }
});

// Catch-all: serve frontend index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📍 Gemini test: http://localhost:${PORT}/api/test-gemini`);
  console.log(`📍 Frontend should connect to: http://localhost:${PORT}`);
  console.log(`🔑 Gemini API: ${process.env.GEMINI_API_KEY ? 'Configured' : 'Not configured'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});