require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const mammoth = require('mammoth');
const validator = require('validator');
const pdf = require('pdf-parse');
const app = express();
const PORT = process.env.PORT || 10000;
const USERS_FILE = path.join(__dirname, 'users.json');
const TASKS_FILE = path.join(__dirname, 'tasks.json');

function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}
function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
// Security: Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'יותר מדי בקשות מכתובת IP זו, אנא נסה שוב מאוחר יותר.',
    standardHeaders: true,
    legacyHeaders: false,
});
// הגדרות בסיסיות
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(limiter);
app.disable('x-powered-by');
// Security: File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${sanitizedName}`;
        cb(null, uniqueName);
    }
});
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/pdf'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('רק קבצי .docx או .pdf מותרים'), false);
        }
    }
});
// User model helpers
function getUsers() {
    return readJson(USERS_FILE, []);
}
function saveUsers(users) {
    writeJson(USERS_FILE, users);
}
function getTasks() {
    return readJson(TASKS_FILE, []);
}
function saveTasks(tasks) {
    writeJson(TASKS_FILE, tasks);
}
function generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}
// Authentication middleware
const authenticateToken = (req, res, next) => {
    req.user = { id: 'default-user', username: 'user', role: 'user' };
    next();
};
// Registration endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'כל השדות נדרשים' });
        }

        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ error: 'שם משתמש חייב להיות בין 3-30 תווים' });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({ error: 'שם משתמש יכול להכיל רק אותיות, מספרים וקו תחתון' });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({ error: 'כתובת אימייל לא תקינה' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'סיסמה חייבת להכיל לפחות 6 תווים' });
        }

        let users = getUsers();
        if (users.find(u => u.username === username || u.email === email)) {
            return res.status(400).json({ error: 'שם משתמש או אימייל כבר קיימים' });
        }
        const hashed = await bcrypt.hash(password, 12);
        const user = {
            id: generateId(),
            username,
            email,
            password: hashed,
            role: 'user',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginAttempts: 0,
            lockUntil: null
        };
        users.push(user);
        saveUsers(users);

        res.status(201).json({
            message: 'משתמש נוצר בהצלחה',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'שגיאה פנימית בשרת' });
    }
});
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });
        }
        let users = getUsers();
        let user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
        }
        if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
            return res.status(423).json({ error: 'החשבון נעול זמנית. נסה שוב מאוחר יותר.' });
        }
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
            }
            saveUsers(users);
            return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
        }
        user.loginAttempts = 0;
        user.lockUntil = null;
        user.lastLogin = new Date().toISOString();
        saveUsers(users);
        res.json({
            message: 'התחברות הצליחה',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'שגיאה פנימית בשרת' });
    }
});
// Get all tasks
app.get('/api/tasks', authenticateToken, (req, res) => {
    try {
        const tasks = getTasks().filter(t => t.userId === req.user.id);
        res.json(tasks);
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'שגיאה בקבלת המשימות' });
    }
});
// Get single task
app.get('/api/tasks/:id', authenticateToken, (req, res) => {
    try {
        const task = getTasks().find(t => t.id === req.params.id && t.userId === req.user.id);
        if (!task) return res.status(404).json({ error: 'משימה לא נמצאה' });
        res.json(task);
    } catch (error) {
        console.error('Get task error:', error);
        res.status(500).json({ error: 'שגיאה בקבלת המשימה' });
    }
});
// Create single task
app.post('/api/tasks', authenticateToken, (req, res) => {
    try {
        const { section, taskDescription, responsible, timeline, documentType, protocolDate, priority, isDuplicate, status } = req.body;
        if (!taskDescription || !section || !responsible) {
            return res.status(400).json({ error: 'שדות חובה חסרים' });
        }
        let tasks = getTasks();
        const task = {
            id: generateId(),
            numberFromFile: req.body.numberFromFile || '',
            section,
            taskDescription,
            responsible,
            timeline: timeline || '',
            documentType: documentType || '',
            protocolDate: protocolDate || '',
            priority: typeof priority === 'number' ? priority : 0,
            isDuplicate: !!isDuplicate,
            userId: req.user.id,
            status: status || 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        tasks.push(task);
        saveTasks(tasks);
        res.status(201).json(task);
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: 'שגיאה ביצירת המשימה' });
    }
});
// Create multiple tasks
app.post('/api/tasks/bulk', authenticateToken, (req, res) => {
    try {
        const { tasks } = req.body;
        if (!Array.isArray(tasks) || tasks.length === 0) {
            return res.status(400).json({ error: 'נדרש מערך משימות' });
        }
        if (tasks.length > 100) {
            return res.status(400).json({ error: 'לא ניתן ליצור יותר מ-100 משימות בבת אחת' });
        }

        let allTasks = getTasks();
        const now = new Date().toISOString();
        const tasksWithUser = tasks.map(task => ({
            ...task,
            id: generateId(),
            userId: req.user.id,
            createdAt: now,
            updatedAt: now
        }));
        allTasks.push(...tasksWithUser);
        saveTasks(allTasks);
        res.status(201).json(tasksWithUser);
    } catch (error) {
        console.error('Bulk create tasks error:', error);
        res.status(500).json({ error: 'שגיאה ביצירת המשימות' });
    }
});
// Update task
app.put('/api/tasks/:id', authenticateToken, (req, res) => {
    try {
        let tasks = getTasks();
        let task = tasks.find(t => t.id === req.params.id && t.userId === req.user.id);
        if (!task) {
            return res.status(404).json({ error: 'משימה לא נמצאה' });
        }

        Object.assign(task, req.body, { updatedAt: new Date().toISOString() });
        saveTasks(tasks);
        res.json(task);
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ error: 'שגיאה בעדכון המשימה' });
    }
});
// Delete task
app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
    try {
        let tasks = getTasks();
        const idx = tasks.findIndex(t => t.id === req.params.id && t.userId === req.user.id);
        if (idx === -1) {
            return res.status(404).json({ error: 'משימה לא נמצאה' });
        }
        tasks.splice(idx, 1);
        saveTasks(tasks);
        res.json({ message: 'משימה נמחקה בהצלחה' });
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ error: 'שגיאה במחיקת המשימה' });
    }
});
// File upload endpoint
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'לא נבחר קובץ' });
        }     
        const filePath = req.file.path;
        let result = { value: '', messages: [] };
        if (req.file.mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            result.value = `<pre>${data.text.replace(/</g, "&lt;")}</pre>`;
        } else {
            result = await mammoth.convertToHtml({ path: filePath });
        }
        fs.unlinkSync(filePath);
        res.json({
            html: result.value,
            filename: req.file.originalname,
            warnings: result.messages || []
        });
    } catch (error) {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file on error:', err);
            });
        }
        console.error('File upload error:', error);
        res.status(500).json({ error: 'שגיאה בעיבוד הקובץ' });
    }
});
// Get user statistics
app.get('/api/stats', authenticateToken, (req, res) => {
    try {
        const tasks = getTasks().filter(t => t.userId === req.user.id);
        const statusBreakdown = tasks.reduce((acc, t) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, {});
        
        res.json({
            totalTasks: tasks.length,
            statusBreakdown,
            user: {
                username: req.user.username,
                memberSince: req.user.createdAt
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'שגיאה בקבלת הסטטיסטיקות' });
    }
});
const staticDirs = [path.join(__dirname, 'public'), __dirname];
staticDirs.forEach(dir => {
  if (fs.existsSync(dir)) app.use(express.static(dir));
});
app.get('/', (req, res) => {
  const candidate = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'index.html'),
  ].find(p => fs.existsSync(p));
  if (candidate) return res.sendFile(candidate);
  res.status(200).json({ message: 'Task Manager API Server', version: '2025.1' });
});
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
app.use((req, res) => {
    res.status(404).json({ error: 'נתיב לא נמצא' });
});
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'שגיאה פנימית בשרת' });
});
app.listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}`;
    console.log(`Task Manager server running on ${url}`);

    let command;
    if (process.platform === 'win32') {
        command = `start ${url}`;
    } else if (process.platform === 'darwin') {
        command = `open ${url}`;
    } else {
        command = `xdg-open ${url}`;
    }
    exec(command, (error) => {
        if (error) {
            console.error(`Failed to open browser automatically: ${error.message}`);
            console.log(`Please open your browser and navigate to: ${url}`);
        }
    });
});