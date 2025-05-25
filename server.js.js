require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect('mongodb+srv://taskuser:123456taskuser@tasks.ztx0pen.mongodb.net/?retryWrites=true&w=majority&appName=tasks')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Task Schema
const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  globalId: Number,
  numberFromFile: String,
  section: String,
  taskDescription: String,
  responsible: String,
  timeline: String,
  documentType: String,
  protocolDate: String,
  priority: { type: Number, default: 0 },
  isDuplicate: { type: Boolean, default: false },
  createdDate: { type: Date, default: Date.now },
  isCompleted: { type: Boolean, default: false },
  completedDate: Date,
  notes: String
});

const Task = mongoose.model('Task', taskSchema);

// Authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      throw new Error();
    }
    
    const decoded = jwt.verify(token, 'my-super-secret-key-123456');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      throw new Error();
    }
    
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ error: 'אנא התחבר למערכת' });
  }
};

// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>כלי ניהול משימות</title>
        <style>
            body { 
                font-family: 'Segoe UI', Arial, sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center; 
                padding: 50px; 
                margin: 0;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
            }
            .container {
                background: rgba(255,255,255,0.1);
                padding: 40px;
                border-radius: 15px;
                backdrop-filter: blur(10px);
                max-width: 500px;
            }
            h1 { font-size: 2.5em; margin-bottom: 20px; }
            p { font-size: 1.2em; margin: 15px 0; }
            a { 
                color: #fff; 
                text-decoration: none; 
                background: rgba(255,255,255,0.2);
                padding: 10px 20px;
                border-radius: 25px;
                display: inline-block;
                margin: 10px;
                transition: all 0.3s;
            }
            a:hover { 
                background: rgba(255,255,255,0.3);
                transform: translateY(-2px);
            }
            .demo-info {
                background: rgba(255,255,255,0.15);
                padding: 20px;
                border-radius: 10px;
                margin-top: 30px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔍 כלי ניהול משימות</h1>
            <p>המערכת פועלת בהצלחה!</p>
            
            <div class="demo-info">
                <h3>פרטי התחברות להדגמה:</h3>
                <p><strong>שם משתמש:</strong> demo</p>
                <p><strong>סיסמה:</strong> 123456</p>
            </div>
            
            <p>
                <a href="/login.html">היכנס לכלי</a>
                <a href="/index.html">דף המשימות</a>
            </p>
            <p>
                <a href="/api/tasks">בדיקת API</a>
            </p>
        </div>
    </body>
    </html>
  `);
});

// Login page route
app.get('/login.html', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>כלי ניהול משימות - התחברות</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .login-container {
                background: white;
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
                width: 100%;
                max-width: 400px;
            }
            .logo { text-align: center; margin-bottom: 30px; }
            .logo h1 { color: #333; font-size: 28px; margin-bottom: 10px; }
            .logo p { color: #666; font-size: 14px; }
            .form-tabs {
                display: flex;
                margin-bottom: 30px;
                border-radius: 10px;
                overflow: hidden;
                border: 2px solid #f0f0f0;
            }
            .tab-button {
                flex: 1;
                padding: 12px;
                background: #f8f9fa;
                border: none;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.3s ease;
            }
            .tab-button.active { background: #667eea; color: white; }
            .form-group { margin-bottom: 20px; }
            .form-group label {
                display: block;
                margin-bottom: 8px;
                color: #333;
                font-weight: 500;
            }
            .form-group input {
                width: 100%;
                padding: 12px 15px;
                border: 2px solid #e1e5e9;
                border-radius: 8px;
                font-size: 16px;
                transition: border-color 0.3s ease;
            }
            .form-group input:focus { outline: none; border-color: #667eea; }
            .submit-btn {
                width: 100%;
                padding: 12px;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.3s ease;
            }
            .submit-btn:hover { background: #5a6fd8; }
            .error-message, .success-message {
                padding: 10px;
                border-radius: 5px;
                margin-bottom: 15px;
                font-size: 14px;
                display: none;
            }
            .error-message { background: #fee; color: #c33; }
            .success-message { background: #efe; color: #363; }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">
                <h1>כלי ניהול משימות</h1>
                <p>מערכת לניהול משימות מתקדמת</p>
            </div>
            <div class="form-tabs">
                <button class="tab-button active" onclick="switchTab('login')">התחברות</button>
                <button class="tab-button" onclick="switchTab('register')">הרשמה</button>
            </div>
            <div class="error-message" id="errorMessage"></div>
            <div class="success-message" id="successMessage"></div>
            <form id="loginForm" style="display: block;">
                <div class="form-group">
                    <label for="loginUsername">שם משתמש:</label>
                    <input type="text" id="loginUsername" name="username" value="demo" required>
                </div>
                <div class="form-group">
                    <label for="loginPassword">סיסמה:</label>
                    <input type="password" id="loginPassword" name="password" value="123456" required>
                </div>
                <button type="submit" class="submit-btn">התחבר</button>
            </form>
            <form id="registerForm" style="display: none;">
                <div class="form-group">
                    <label for="registerUsername">שם משתמש:</label>
                    <input type="text" id="registerUsername" name="username" required>
                </div>
                <div class="form-group">
                    <label for="registerEmail">אימייל:</label>
                    <input type="email" id="registerEmail" name="email" required>
                </div>
                <div class="form-group">
                    <label for="registerPassword">סיסמה:</label>
                    <input type="password" id="registerPassword" name="password" required>
                </div>
                <div class="form-group">
                    <label for="confirmPassword">אישור סיסמה:</label>
                    <input type="password" id="confirmPassword" name="confirmPassword" required>
                </div>
                <button type="submit" class="submit-btn">הירשם</button>
            </form>
        </div>
        <script>
            function switchTab(tab) {
                const loginForm = document.getElementById('loginForm');
                const registerForm = document.getElementById('registerForm');
                const tabButtons = document.querySelectorAll('.tab-button');
                
                if (tab === 'login') {
                    loginForm.style.display = 'block';
                    registerForm.style.display = 'none';
                    tabButtons[0].classList.add('active');
                    tabButtons[1].classList.remove('active');
                } else {
                    loginForm.style.display = 'none';
                    registerForm.style.display = 'block';
                    tabButtons[0].classList.remove('active');
                    tabButtons[1].classList.add('active');
                }
            }
            
            function showMessage(message, type) {
                const errorDiv = document.getElementById('errorMessage');
                const successDiv = document.getElementById('successMessage');
                
                if (type === 'error') {
                    errorDiv.textContent = message;
                    errorDiv.style.display = 'block';
                    successDiv.style.display = 'none';
                } else {
                    successDiv.textContent = message;
                    successDiv.style.display = 'block';
                    errorDiv.style.display = 'none';
                }
            }
            
            document.getElementById('loginForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('loginUsername').value;
                const password = document.getElementById('loginPassword').value;
                
                try {
                    const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        localStorage.setItem('authToken', data.token);
                        localStorage.setItem('user', JSON.stringify(data.user));
                        showMessage('התחברות הצליחה! מפנה...', 'success');
                        setTimeout(() => {
                            window.location.href = '/index.html';
                        }, 1000);
                    } else {
                        showMessage(data.error || 'שגיאה בהתחברות', 'error');
                    }
                } catch (error) {
                    showMessage('שגיאה בחיבור לשרת', 'error');
                }
            });
            
            document.getElementById('registerForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('registerUsername').value;
                const email = document.getElementById('registerEmail').value;
                const password = document.getElementById('registerPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;
                
                if (password !== confirmPassword) {
                    showMessage('הסיסמאות לא זהות', 'error');
                    return;
                }
                
                try {
                    const response = await fetch('/api/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, email, password })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        localStorage.setItem('authToken', data.token);
                        localStorage.setItem('user', JSON.stringify(data.user));
                        showMessage('הרשמה הצליחה! מפנה...', 'success');
                        setTimeout(() => {
                            window.location.href = '/index.html';
                        }, 1000);
                    } else {
                        showMessage(data.error || 'שגיאה בהרשמה', 'error');
                    }
                } catch (error) {
                    showMessage('שגיאה בחיבור לשרת', 'error');
                }
            });
        </script>
    </body>
    </html>
  `);
});

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'שם משתמש או אימייל כבר קיימים' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      username,
      email,
      password: hashedPassword
    });
    
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, 'my-super-secret-key-123456');
    
    res.status(201).json({
      message: 'משתמש נרשם בהצלחה',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ 
      $or: [{ email: username }, { username: username }] 
    });
    
    if (!user) {
      return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }
    
    const token = jwt.sign({ userId: user._id }, 'my-super-secret-key-123456');
    
    res.json({
      message: 'התחברת בהצלחה',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all tasks for user
app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user._id });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new task
app.post('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const task = new Task({
      ...req.body,
      userId: req.user._id
    });
    await task.save();
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create multiple tasks
app.post('/api/tasks/bulk', authMiddleware, async (req, res) => {
  try {
    const tasks = req.body.tasks.map(task => ({
      ...task,
      userId: req.user._id
    }));
    const createdTasks = await Task.insertMany(tasks);
    res.status(201).json(createdTasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task
app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true }
    );
    if (!task) {
      return res.status(404).json({ error: 'משימה לא נמצאה' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete task
app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!task) {
      return res.status(404).json({ error: 'משימה לא נמצאה' });
    }
    res.json({ message: 'משימה נמחקה בהצלחה' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload and process file
app.post('/api/upload', authMiddleware, multer({ storage: multer.memoryStorage() }).single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'לא נשלח קובץ' });
    }

    const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
    
    res.json({
      html: result.value,
      filename: req.file.originalname
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task statistics
app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const totalTasks = await Task.countDocuments({ userId: req.user._id });
    const completedTasks = await Task.countDocuments({ 
      userId: req.user._id, 
      isCompleted: true 
    });
    const prioritizedTasks = await Task.countDocuments({ 
      userId: req.user._id, 
      priority: { $gt: 0 } 
    });
    const duplicateTasks = await Task.countDocuments({ 
      userId: req.user._id, 
      isDuplicate: true 
    });
    
    res.json({
      totalTasks,
      completedTasks,
      prioritizedTasks,
      duplicateTasks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the application`);
});
