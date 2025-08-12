// api-client.js - הוסף את זה לקובץ ה-HTML שלך
// אבטחה: API Client מאובטח עם טיפול בשגיאות מתקדם
class TaskAPI {
    constructor() {
        // אבטחה: בדיקת סביבה לקביעת URL בסיס
        this.baseURL = window.location.origin + '/api';
        this.token = localStorage.getItem('authToken');
        this.refreshTokenPromise = null;
        this.localDB = null;
        this.offlineMode = !navigator.onLine;
        this.initLocalDB();
        this.setupOfflineHandlers();
    }

    // אתחול LocalDB
    async initLocalDB() {
        if (window.localDB) {
            this.localDB = window.localDB;
        }
    }

    // הגדרת טיפול במצב offline
    setupOfflineHandlers() {
        window.addEventListener('online', () => {
            this.offlineMode = false;
            this.showNotification('חזרת למצב מקוון - מסנכרן נתונים...', 'success');
        });

        window.addEventListener('offline', () => {
            this.offlineMode = true;
            this.showNotification('אתה במצב לא מקוון - השינויים יישמרו מקומית', 'warning');
        });
    }

    // הצגת התראה
    showNotification(message, type = 'info') {
        if (window.showSuccess && type === 'success') {
            window.showSuccess(message);
        } else if (window.showError && type === 'error') {
            window.showError(message);
        } else {
            console.log(`[${type}] ${message}`);
        }
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
        // בדיקה אם במצב offline
        if (this.offlineMode) {
            return this.handleOfflineRequest(endpoint, options);
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
            // אם הבקשה נכשלה בגלל חיבור, עבור למצב offline
            if (error.message.includes('Failed to fetch') || !navigator.onLine) {
                this.offlineMode = true;
                return this.handleOfflineRequest(endpoint, options);
            }
            throw error;
        }
    }

    // טיפול בבקשות במצב offline
    async handleOfflineRequest(endpoint, options) {
        if (!this.localDB) {
            throw new Error('מצב לא מקוון לא זמין');
        }

        const method = options.method || 'GET';
        const body = options.body ? JSON.parse(options.body) : {};

        switch (endpoint) {
            case '/tasks':
                if (method === 'GET') {
                    return await this.localDB.getAllTasks();
                } else if (method === 'POST') {
                    const task = await this.localDB.addTask(body);
                    return task;
                }
                break;
                
            case endpoint.match(/^\/tasks\/(.+)$/)?.input:
                const taskId = endpoint.split('/')[2];
                if (method === 'PUT') {
                    return await this.localDB.updateTask(taskId, body);
                } else if (method === 'DELETE') {
                    await this.localDB.deleteTask(taskId);
                    return { message: 'משימה נמחקה מקומית' };
                }
                break;
                
            case '/tasks/bulk':
                if (method === 'POST') {
                    const tasks = [];
                    for (const task of body.tasks) {
                        const newTask = await this.localDB.addTask(task);
                        tasks.push(newTask);
                    }
                    return tasks;
                }
                break;
        }

        throw new Error('פעולה לא נתמכת במצב לא מקוון');
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
        try {
            const tasks = await this.request('/tasks');
            
            // שמירה מקומית של המשימות
            if (this.localDB && !this.offlineMode) {
                await this.localDB.updateLocalTasks(tasks);
            }
            
            return tasks;
        } catch (error) {
            // אם יש שגיאה, נסה לקבל מהמסד המקומי
            if (this.localDB) {
                const localTasks = await this.localDB.getAllTasks();
                if (localTasks.length > 0) {
                    this.showNotification('הנתונים נטענו ממטמון מקומי', 'info');
                    return localTasks;
                }
            }
            throw error;
        }
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

// הסר את בדיקת האימות האוטומטית
document.addEventListener('DOMContentLoaded', () => {
    // הערה: בדיקת אימות מבוטלת לעת עתה
    console.log('API Client loaded');
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
        // בדיקת הגדרות משתמש
        const settings = SimpleStorage.getUserSettings();
        
        // טעינת משימות
        const tasks = await api.getTasks();
        allExtractedTasks = tasks;
        
        if (tasks.length > 0) {
            identifyAndMarkDuplicates();
            updateStatistics();
            populateFilterOptions();
            displayResults(allExtractedTasks);
            
            document.getElementById('resultsSection').style.display = 'block';
            document.getElementById('uploadSection').style.display = 'none';
            
            // עדכון מצב אפליקציה
            SimpleStorage.saveAppState({
                lastSync: new Date().toISOString(),
                offlineChanges: 0,
                currentFilter: 'all'
            });
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
    // הסר את בדיקת המשתמש
    try {
        await loadTasks();
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
});