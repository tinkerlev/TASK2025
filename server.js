require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// אבטחה: הגדרת Helmet להגנה מפני תקיפות נפוצות
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// אבטחה: הגדרת CORS מוגבלת לדומיינים ספציפיים
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // שנה לדומיין שלך בפרודקשן
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// אבטחה: הגבלת גודל הבקשות למניעת DOS attacks
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static('public'));

// אבטחה: Rate limiting למניעת brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 דקות
  max: 5, // מקסימום 5 ניסיונות התחברות ב-15 דקות
  message: {
    error: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד 15 דקות'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 דקות
  max: 100, // 100 בקשות ב-15 דקות
  message: {
    error: 'יותר מדי בקשות. נסה שוב מאוחר יותר'
  }
});

app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api', generalLimiter);

// אבטחה: ולידציה של משתני סביבה
// const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
// const missingEnvVars = requiredEnvVars.filter(env => !process.env[env]);

// if (missingEnvVars.length > 0) {
//   console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
//   process.exit(1);
// }

// אבטחה: שימוש במחרוזת חזקה ל-JWT מתוך משתנה סביבה
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

// הגדר נתיבים לקבצים
const USERS_FILE = path.join(__dirname, 'users.json');
const TASKS_FILE = path.join(__dirname, 'tasks.json');

// פונקציות עזר לקריאה וכתיבה
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// אבטחה: Authentication middleware משופר
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'אנא התחבר למערכת' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'אנא התחבר למערכת' });
    }
    
    // אבטחה: ולידציה של טוקן JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = readJson(USERS_FILE);
    const user = users.find(u => u.id === decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'משתמש לא קיים או לא פעיל' });
    }
    
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    // אבטחה: לא חושפים פרטי שגיאה פנימיים
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'טוקן לא תקין' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'טוקן פג תוקף, אנא התחבר שוב' });
    }
    
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'שגיאה באימות' });
  }
};

// אבטחה: מחיקת קוד HTML מיותר מהשרת - עכשיו נשתמש רק ב-static files
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// User registration עם אבטחה מחוזקת
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // אבטחה: ולידציה קפדנית של קלט
    const validationRules = {
      username: { 
        required: true, 
        type: 'string', 
        minLength: 3, 
        maxLength: 30,
        pattern: /^[a-zA-Z0-9_]+$/
      },
      email: { 
        required: true, 
        type: 'string', 
        maxLength: 100,
        isEmail: true
      },
      password: { 
        required: true, 
        type: 'string', 
        minLength: 6, 
        maxLength: 128
      }
    };
    
    const validationErrors = validateInput(req.body, validationRules);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }
    
    // אבטחה: בדיקת חוזק סיסמה
    const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{6,}$/;
    if (!passwordStrengthRegex.test(password)) {
      return res.status(400).json({ 
        error: 'הסיסמה חייבת להכיל לפחות אות גדולה, אות קטנה ומספר' 
      });
    }
    
    // אבטחה: ניקוי ואימות קלט
    const cleanEmail = validator.normalizeEmail(email);
    const cleanUsername = validator.escape(username.trim());
    
    const users = readJson(USERS_FILE);
    if (users.find(u => u.username === cleanUsername || u.email === cleanEmail)) {
      return res.status(400).json({ error: 'שם משתמש או אימייל כבר קיימים' });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = {
      id: Date.now().toString(),
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      isActive: true,
      createdAt: new Date()
    };
    users.push(user);
    writeJson(USERS_FILE, users);
    
    // אבטחה: יצירת טוקן עם תוקף מוגבל
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    
    // אבטחה: לא החזרת פרטים רגישים
    res.status(201).json({
      message: 'משתמש נרשם בהצלחה',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // אבטחה: טיפול בשגיאות ללא חשיפת מידע פנימי
    if (error.code === 11000) {
      return res.status(400).json({ error: 'שם משתמש או אימייל כבר קיימים' });
    }
    
    res.status(500).json({ error: 'שגיאה בתהליך ההרשמה' });
  }
});

// User login עם אבטחה מחוזקת
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // אבטחה: ולידציה בסיסית
    if (!username || !password) {
      return res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });
    }
    
    // אבטחה: ניקוי קלט
    const cleanUsername = validator.escape(username.trim());
    
    const users = readJson(USERS_FILE);
    const user = users.find(u => u.username === cleanUsername || u.email === cleanUsername);
    if (!user) {
      return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }
    
    // אבטחה: יצירת טוקן עם תוקף מוגבל
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    
    res.json({
      message: 'התחברת בהצלחה',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'שגיאה בתהליך ההתחברות' });
  }
});

// Get all tasks for user
app.get('/api/tasks', authMiddleware, async (req, res) => {
  const tasks = readJson(TASKS_FILE).filter(t => t.userId === req.user.id);
  res.json(tasks);
});

// Create new task
app.post('/api/tasks', authMiddleware, async (req, res) => {
  try {
    // אבטחה: ולידציה של נתוני המשימה
    const validationRules = {
      taskDescription: { required: true, type: 'string', maxLength: 1000 },
      section: { type: 'string', maxLength: 200 },
      responsible: { type: 'string', maxLength: 100 },
      timeline: { type: 'string', maxLength: 100 }
    };
    
    const validationErrors = validateInput(req.body, validationRules);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }
    
    const tasks = readJson(TASKS_FILE);
    const task = {
      id: Date.now().toString(),
      userId: req.user.id,
      ...req.body,
      createdDate: new Date()
    };
    tasks.push(task);
    writeJson(TASKS_FILE, tasks);
    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת המשימה' });
  }
});

// Create multiple tasks
app.post('/api/tasks/bulk', authMiddleware, async (req, res) => {
  try {
    const { tasks } = req.body;
    
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'נדרש מערך משימות' });
    }
    
    // אבטחה: הגבלת מספר משימות בבת אחת
    if (tasks.length > 100) {
      return res.status(400).json({ error: 'לא ניתן ליצור יותר מ-100 משימות בבת אחת' });
    }
    
    const validatedTasks = tasks.map(task => ({
      ...task,
      userId: req.user.id
    }));
    
    const existingTasks = readJson(TASKS_FILE);
    const newTasks = validatedTasks.filter(nt => !existingTasks.find(et => et.id === nt.id));
    
    if (newTasks.length !== validatedTasks.length) {
      return res.status(400).json({ error: 'ישנם מזהי משימה כפולים' });
    }
    
    const allTasks = [...existingTasks, ...newTasks];
    writeJson(TASKS_FILE, allTasks);
    res.status(201).json(newTasks);
  } catch (error) {
    console.error('Bulk create tasks error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת המשימות' });
  }
});

// Update task
app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    // אבטחה: ולידציה של ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'מזהה משימה לא תקין' });
    }
    
    const tasks = readJson(TASKS_FILE);
    const idx = tasks.findIndex(t => t.id === req.params.id && t.userId === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'משימה לא נמצאה' });
    tasks[idx] = { ...tasks[idx], ...req.body };
    writeJson(TASKS_FILE, tasks);
    res.json(tasks[idx]);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון המשימה' });
  }
});

// Delete task
app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    // אבטחה: ולידציה של ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'מזהה משימה לא תקין' });
    }
    
    let tasks = readJson(TASKS_FILE);
    const initialLength = tasks.length;
    tasks = tasks.filter(t => !(t.id === req.params.id && t.userId === req.user.id));
    if (tasks.length === initialLength) return res.status(404).json({ error: 'משימה לא נמצאה' });
    writeJson(TASKS_FILE, tasks);
    res.json({ message: 'משימה נמחקה בהצלחה' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת המשימה' });
  }
});

// Upload and process file עם אבטחה מחוזקת
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // הגבלה ל-10MB
    files: 1 // קובץ אחד בלבד
  },
  fileFilter: (req, file, cb) => {
    // אבטחה: בדיקת סוג קובץ
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('רק קבצי .docx מותרים'), false);
    }
  }
});

app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'לא נשלח קובץ' });
    }

    // אבטחה: בדיקת גודל קובץ נוספת
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' });
    }

    const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
    
    res.json({
      html: result.value,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('Upload error:', error);
    if (error.message === 'רק קבצי .docx מותרים') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'שגיאה בעיבוד הקובץ' });
  }
});

// Get task statistics
app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const tasks = readJson(TASKS_FILE).filter(t => t.userId === req.user.id);
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.isCompleted).length;
    const prioritizedTasks = tasks.filter(t => t.priority > 0).length;
    const duplicateTasks = tasks.filter(t => t.isDuplicate).length;
    
    res.json({
      totalTasks,
      completedTasks,
      prioritizedTasks,
      duplicateTasks
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הסטטיסטיקות' });
  }
});

// אבטחה: Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the application`);
});
