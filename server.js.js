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
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
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