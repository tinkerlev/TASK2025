// api-client.js - הוסף את זה לקובץ ה-HTML שלך
// אבטחה: API Client מאובטח עם טיפול בשגיאות מתקדם
class TaskAPI {
    constructor() {
        // אבטחה: בדיקת סביבה לקביעת URL בסיס
        this.baseURL = window.location.origin + '/api';
        this.token = localStorage.getItem('authToken');
        this.refreshTokenPromise = null;
    }

    // אבטחה: הגדרת טוקן עם ולידציה
    setToken(token) {
        if (!token || typeof token !== 'string') {
            throw new Error('טוקן לא תקין');
        }
        this.token = token;
        localStorage.setItem('authToken', token);
    }

    // אבטחה: ניקוי מאובטח של נתוני אימות
    clearAuth() {
        this.token = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        // אבטחה: ניקוי נתונים רגישים נוספים
        sessionStorage.clear();
    }

    // אבטחה: בקשה מאובטחת עם טיפול בשגיאות מתקדם
    async request(endpoint, options = {}) {
        // אבטחה: ולידציה של endpoint
        if (!endpoint || typeof endpoint !== 'string') {
            throw new Error('endpoint לא תקין');
        }

        const url = `${this.baseURL}${endpoint}`;
        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            }
        };

        // אבטחה: הוספת טוקן רק אם קיים
        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, config);
            
            // אבטחה: טיפול במצבי שגיאה שונים
            if (response.status === 401) {
                this.clearAuth();
                window.location.href = '/login.html';
                throw new Error('אנא התחבר שוב למערכת');
            }

            if (response.status === 423) {
                throw new Error('החשבון נעול זמנית');
            }

            if (response.status === 429) {
                throw new Error('יותר מדי בקשות. אנא המתן מעט');
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `שגיאת שרת: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    // אבטחה: ולידציה של נתוני הרשמה
    async register(username, email, password) {
        // אבטחה: ולידציה בצד הלקוח
        const validationErrors = this.validateRegistrationData(username, email, password);
        if (validationErrors.length > 0) {
            throw new Error(validationErrors.join(', '));
        }

        const data = await this.request('/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
        
        this.setToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        return data;
    }

    // אבטחה: ולידציה של נתוני התחברות
    async login(username, password) {
        if (!username || !password) {
            throw new Error('שם משתמש וסיסמה נדרשים');
        }

        // אבטחה: ניקוי קלט
        const cleanUsername = username.trim();
        const data = await this.request('/login', {
            method: 'POST',
            body: JSON.stringify({ username: cleanUsername, password })
        });
        
        this.setToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        return data;
    }

    // אבטחה: התנתקות מאובטחת
    logout() {
        this.clearAuth();
        window.location.href = '/login.html';
    }

    // אבטחה: פונקציית ולידציה פנימית
    validateRegistrationData(username, email, password) {
        const errors = [];
        
        if (!username || username.length < 3 || username.length > 30) {
            errors.push('שם משתמש חייב להיות בין 3-30 תווים');
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            errors.push('שם משתמש יכול להכיל רק אותיות, מספרים וקו תחתון');
        }
        
        if (!email || !this.isValidEmail(email)) {
            errors.push('כתובת אימייל לא תקינה');
        }
        
        if (!password || password.length < 6) {
            errors.push('סיסמה חייבת להכיל לפחות 6 תווים');
        }
        
        return errors;
    }

    // אבטחה: ולידציה של אימייל
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Existing API methods with security improvements...
    async getTasks() {
        return this.request('/tasks');
    }

    async createTask(task) {
        // אבטחה: ולידציה של נתוני משימה
        if (!task.taskDescription || task.taskDescription.trim() === '') {
            throw new Error('תיאור משימה נדרש');
        }
        
        return this.request('/tasks', {
            method: 'POST',
            body: JSON.stringify(task)
        });
    }

    async createTasks(tasks) {
        if (!Array.isArray(tasks) || tasks.length === 0) {
            throw new Error('נדרש מערך משימות');
        }
        
        if (tasks.length > 100) {
            throw new Error('לא ניתן ליצור יותר מ-100 משימות בבת אחת');
        }
        
        return this.request('/tasks/bulk', {
            method: 'POST',
            body: JSON.stringify({ tasks })
        });
    }

    async updateTask(id, updates) {
        if (!id) {
            throw new Error('מזהה משימה נדרש');
        }
        
        return this.request(`/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    async deleteTask(id) {
        if (!id) {
            throw new Error('מזהה משימה נדרש');
        }
        
        return this.request(`/tasks/${id}`, {
            method: 'DELETE'
        });
    }

    async getStats() {
        return this.request('/stats');
    }

    // אבטחה: העלאת קובץ מאובטחת
    async uploadFile(file) {
        // אבטחה: ולידציה של קובץ
        if (!file) {
            throw new Error('קובץ נדרש');
        }
        
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            throw new Error('גודל הקובץ גדול מדי (מקסימום 10MB)');
        }
        
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        
        if (!allowedTypes.includes(file.type)) {
            throw new Error('רק קבצי .docx מותרים');
        }
        
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${this.baseURL}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'שגיאה בהעלאת הקובץ');
        }

        return response.json();
    }
}

// אבטחה: יצירת instance מאובטח
const api = new TaskAPI();

// אבטחה: בדיקת אימות בטעינת הדף
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('user');
    
    // אבטחה: בדיקה אם המשתמש מחובר
    if (!token || !user) {
        // נמצאים בדף שדורש אימות אבל אין טוקן
        if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
            window.location.href = '/login.html';
        }
    }
});

// Update existing functions to use the API

// Modified function to handle files - שנה את הפונקציה הקיימת
async function handleFiles(files) {
    showProcessing();
    hideMessages();
    
    try {
        // First, get existing tasks from server
        const existingTasks = await api.getTasks();
        allExtractedTasks = existingTasks;
        
        // Continue with file processing...
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            processingMessageElement.textContent = `מעבד קובץ ${i + 1} מתוך ${files.length}: ${file.name}`;
            
            // Upload file to server
            const result = await api.uploadFile(file);
            
            // Process the HTML content
            const tasks = extractTasksFromFileContent(result.html, result.filename, extractDateFromFileName(result.filename));
            
            // Save tasks to server
            if (tasks.length > 0) {
                const savedTasks = await api.createTasks(tasks);
                allExtractedTasks.push(...savedTasks);
            }
        }
        
        // Update display
        identifyAndMarkDuplicates();
        updateStatistics();
        populateFilterOptions();
        applyFilters();
        
        hideProcessing();
        showSuccess('הקבצים עובדו והמשימות נשמרו בהצלחה!');
        
    } catch (error) {
        hideProcessing();
        showError(`שגיאה: ${error.message}`);
    }
}

// Modified delete function - שנה את הפונקציה הקיימת
async function deleteTask(globalId) {
    try {
        const task = allExtractedTasks.find(t => t.globalId === globalId);
        if (!task || !task._id) {
            showError("משימה לא נמצאה");
            return;
        }
        
        await api.deleteTask(task._id);
        
        const taskIndex = allExtractedTasks.findIndex(t => t.globalId === globalId);
        if (taskIndex > -1) {
            allExtractedTasks.splice(taskIndex, 1);
        }
        
        showSuccess("המשימה נמחקה בהצלחה");
        identifyAndMarkDuplicates();
        updateStatistics();
        populateFilterOptions();
        applyFilters();
        
    } catch (error) {
        showError(`שגיאה במחיקת המשימה: ${error.message}`);
    }
}

// Modified priority toggle - שנה את הפונקציה הקיימת
async function togglePriority(globalId) {
    try {
        const task = allExtractedTasks.find(t => t.globalId === globalId);
        if (!task || !task._id) return;
        
        const newPriority = (task.priority + 1) % 4;
        await api.updateTask(task._id, { priority: newPriority });
        
        task.priority = newPriority;
        updateStatistics();
        applyFilters();
        
    } catch (error) {
        showError(`שגיאה בעדכון תעדוף: ${error.message}`);
    }
}

// Load tasks on page load
async function loadTasks() {
    try {
        const tasks = await api.getTasks();
        allExtractedTasks = tasks;
        
        if (tasks.length > 0) {
            identifyAndMarkDuplicates();
            updateStatistics();
            populateFilterOptions();
            displayResults(allExtractedTasks);
            
            document.getElementById('resultsSection').style.display = 'block';
            document.getElementById('uploadSection').style.display = 'none';
        }
    } catch (error) {
        if (error.message.includes('התחבר')) {
            window.location.href = '/login.html';
        } else {
            showError(`שגיאה בטעינת המשימות: ${error.message}`);
        }
    }
}

// Check authentication on page load
document.addEventListener('DOMContentLoaded', async () => {
    const user = localStorage.getItem('user');
    if (user) {
        await loadTasks();
    } else {
        window.location.href = '/login.html';
    }
});