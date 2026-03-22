const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const yaml = require('js-yaml');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'super-secret-key-1234'; // In a real app, use env vars

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Directories
const dataDir = path.join(__dirname, 'data');
const practiceDir = path.join(__dirname, 'parctice');
const settingsPath = path.join(dataDir, 'settings.json');
const scoresPath = path.join(dataDir, 'scores.json');

// Ensure directories and files exist
if (!fs.existsSync(practiceDir)) fs.mkdirSync(practiceDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(settingsPath)) {
  fs.writeFileSync(settingsPath, JSON.stringify({ 
    activeQuizzes: [], 
    adminPassword: 'admin', 
    allowedStudents: [],
    quizConfigs: {} // New in V4: { "filename.yaml": { maxQuestions: 10 } }
  }), 'utf-8');
}
if (!fs.existsSync(scoresPath)) fs.writeFileSync(scoresPath, JSON.stringify([]), 'utf-8');

// Storage for Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, practiceDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
    cb(null, safeName || Date.now() + '.yaml');
  }
});
const upload = multer({ storage });

// Helpers
const getSettings = () => JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const saveSettings = (s) => fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf8');

// ----------------- Auth Middlewares -----------------
const verifyAdmin = (req, res, next) => {
  const token = req.cookies.adminToken;
  if (!token) return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired admin token.' });
  }
};

const verifyStudent = (req, res, next) => {
  const studentToken = req.cookies.studentToken;
  if (!studentToken) {
    console.warn(`[Student Auth] No token found in cookies`);
    return res.status(401).json({ error: 'Unauthorized. Student login required.' });
  }
  try {
    const decoded = jwt.verify(studentToken, JWT_SECRET);
    const settings = getSettings();
    const students = settings.allowedStudents || [];
    if (!students.includes(decoded.name)) {
      console.warn(`[Student Auth] Student ${decoded.name} not in allowed list`);
      throw new Error('Student no longer allowed');
    }
    req.studentName = decoded.name;
    next();
  } catch (err) {
    console.error(`[Student Auth] Error: ${err.message}`);
    res.status(401).json({ error: 'Invalid or expired student token.' });
  }
};

// ----------------- Auth APIs -----------------
app.post('/api/admin-login', (req, res) => {
  const { password } = req.body;
  const settings = getSettings();
  if (password === settings.adminPassword) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('adminToken', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ message: 'Admin logged in' });
  } else {
    res.status(401).json({ error: 'Incorrect password' });
  }
});

app.post('/api/admin-change-password', verifyAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Password too short' });
  const settings = getSettings();
  settings.adminPassword = newPassword;
  saveSettings(settings);
  res.json({ message: 'Password changed successfully' });
});

app.post('/api/student-login', (req, res) => {
  const { name } = req.body;
  const settings = getSettings();
  const students = settings.allowedStudents || [];
  if (name && students.includes(name)) {
    const token = jwt.sign({ role: 'student', name }, JWT_SECRET, { expiresIn: '60d' });
    res.cookie('studentToken', token, { httpOnly: true, maxAge: 60 * 24 * 60 * 60 * 1000 });
    res.json({ message: 'Student logged in', name });
  } else {
    res.status(401).json({ error: 'Access denied: student name not listed' });
  }
});

app.post('/api/admin-logout', (req, res) => {
  res.clearCookie('adminToken');
  res.json({ message: 'Admin logged out' });
});

app.post('/api/student-logout', (req, res) => {
  res.clearCookie('studentToken');
  res.json({ message: 'Student logged out' });
});

// ----------------- Admin: Allowed Students APIs -----------------
app.get('/api/allowed-students', verifyAdmin, (req, res) => {
  res.json(getSettings().allowedStudents || []);
});

app.post('/api/allowed-students', verifyAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ error: 'Invalid name' });
  const settings = getSettings();
  if (!settings.allowedStudents) settings.allowedStudents = [];
  if (!settings.allowedStudents.includes(name.trim())) {
    settings.allowedStudents.push(name.trim());
    saveSettings(settings);
  }
  res.json(settings.allowedStudents);
});

app.delete('/api/allowed-students/:name', verifyAdmin, (req, res) => {
  const { name } = req.params;
  const settings = getSettings();
  if (settings.allowedStudents) {
    settings.allowedStudents = settings.allowedStudents.filter(n => n !== name);
    saveSettings(settings);
  }
  res.json(settings.allowedStudents || []);
});

// ----------------- Quiz Management APIs -----------------
app.get('/api/quizzes', verifyAdmin, (req, res) => {
  fs.readdir(practiceDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to read directory' });
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    res.json(yamlFiles);
  });
});

app.post('/api/quizzes', verifyAdmin, upload.single('quizFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ message: 'File uploaded successfully', filename: req.file.filename });
});

app.delete('/api/quizzes/:filename', verifyAdmin, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(practiceDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Quiz not found' });
  try {
    fs.unlinkSync(filePath);
    const settings = getSettings();
    if (settings.activeQuizzes) {
      settings.activeQuizzes = settings.activeQuizzes.filter(q => q !== filename);
      saveSettings(settings);
    }
    res.json({ message: 'Quiz deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete quiz' });
  }
});

app.get('/api/active-quizzes', verifyAdmin, (req, res) => {
  const settings = getSettings();
  res.json({
    activeQuizzes: settings.activeQuizzes || [],
    quizConfigs: settings.quizConfigs || {}
  });
});

app.put('/api/active-quizzes', verifyAdmin, (req, res) => {
  const { activeQuizzes, quizConfigs } = req.body;
  if (!Array.isArray(activeQuizzes)) return res.status(400).json({ error: 'Must be an array' });
  const settings = getSettings();
  settings.activeQuizzes = activeQuizzes;
  if (quizConfigs) settings.quizConfigs = quizConfigs;
  saveSettings(settings);
  res.json({ message: 'Active quizzes updated', activeQuizzes, quizConfigs: settings.quizConfigs });
});

// ----------------- Student Delivery APIs -----------------
app.get('/api/active-quizzes-data', verifyStudent, (req, res) => {
  try {
    const settings = getSettings();
    const activeQuizzes = settings.activeQuizzes || [];
    const activeList = [];
    for (const filename of activeQuizzes) {
      const filePath = path.join(practiceDir, filename);
      if (fs.existsSync(filePath)) {
        const data = yaml.load(fs.readFileSync(filePath, 'utf8'));
        activeList.push({ filename, title: data.quiz_title || filename });
      }
    }
    res.json(activeList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve active quizzes data' });
  }
});

// Modified Auth: allow either admin OR student
const verifyEither = (req, res, next) => {
  const adminToken = req.cookies.adminToken;
  const studentToken = req.cookies.studentToken;
  
  if (adminToken) {
    try {
      jwt.verify(adminToken, JWT_SECRET);
      next();
      return;
    } catch(e) {}
  }
  
  if (studentToken) {
    try {
      const decoded = jwt.verify(studentToken, JWT_SECRET);
      const settings = getSettings();
      const students = settings.allowedStudents || [];
      if (students.includes(decoded.name)) {
        req.studentName = decoded.name;
        next();
        return;
      }
    } catch (err) {}
  }
  
  res.status(401).json({ error: 'Unauthorized. Login required' });
};

// Replace middlewares on relevant APIs
app.get('/api/quiz-data/:filename', verifyEither, (req, res) => {
  const filePath = path.join(practiceDir, req.params.filename);
  console.log(`[Quiz Data API] Request for: ${req.params.filename}, exists: ${fs.existsSync(filePath)}`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Quiz not found' });
  try {
    const data = yaml.load(fs.readFileSync(filePath, 'utf8'));
    const settings = getSettings();
    const config = (settings.quizConfigs && settings.quizConfigs[req.params.filename]) || {};
    res.json({ filename: req.params.filename, data, maxQuestions: config.maxQuestions });
  } catch (err) {
    console.error(`[Quiz Data API] Error parsing quiz ${req.params.filename}:`, err);
    res.status(500).json({ error: 'Failed to parse YAML' });
  }
});

app.post('/api/scores', verifyEither, (req, res) => {
  const { qT, qF, s, acc, tot, ts, ans, seed } = req.body;
  const name = req.studentName || 'admin';
  if (s === undefined || tot === undefined || !name) {
    return res.status(400).json({ error: 'Invalid score data' });
  }
  
  try {
    const scores = JSON.parse(fs.readFileSync(scoresPath, 'utf8'));
    const recordId = 'R' + Date.now().toString(36) + Math.random().toString(36).substr(2, 3);
    scores.push({
      rid: recordId, qT: qT || 'Unknown', qF, u: name, s, acc, tot, ans: ans || {}, seed, ts: ts || Date.now()
    });
    fs.writeFileSync(scoresPath, JSON.stringify(scores), 'utf8');
    res.json({ message: 'Score saved successfully', rid: recordId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save score' });
  }
});

// ----------------- Data Query APIs -----------------
app.get('/api/scores', verifyAdmin, (req, res) => {
  try {
    const scores = JSON.parse(fs.readFileSync(scoresPath, 'utf8'));
    scores.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    res.json(scores); // Now including answers for admin
  } catch (err) {
    res.status(500).json({ error: 'Failed to read scores' });
  }
});

app.get('/api/scores/:username', verifyStudent, (req, res) => {
  const name = req.studentName;
  console.log(`[Scores API] Request for user: ${req.params.username}, Token name: ${name}`);
  if (req.params.username !== name) {
    console.warn(`[Scores API] Forbidden mismatch!`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const scores = JSON.parse(fs.readFileSync(scoresPath, 'utf8'));
    const userScores = scores.filter(s => s.u === name);
    userScores.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    res.json(userScores);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read user scores' });
  }
});

// Front-end fallback handling 
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running closely on http://localhost:${PORT}`);
});
