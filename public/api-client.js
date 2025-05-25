// api-client.js - הוסף את זה לקובץ ה-HTML שלך

class TaskAPI {
    constructor() {
        this.baseURL = 'http://localhost:3000/api'; // שנה לכתובת השרת שלך
        this.token = localStorage.getItem('authToken');
    }

    // Set authentication token
    setToken(token) {
        this.token = token;
        localStorage.setItem('authToken', token);
    }

    // Clear authentication
    clearAuth() {
        this.token = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
    }

    // Make authenticated request
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            }
        };

        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(url, config);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'שגיאה בתקשורת עם השרת');
        }

        return response.json();
    }

    // User registration
    async register(username, email, password) {
        const data = await this.request('/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
        
        this.setToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        return data;
    }

    // User login
    async login(username, password) {
        const data = await this.request('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        this.setToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        return data;
    }

    // Logout
    logout() {
        this.clearAuth();
        window.location.href = '/login.html'; // או לדף ההתחברות שלך
    }

    // Get all tasks
    async getTasks() {
        return this.request('/tasks');
    }

    // Create task
    async createTask(task) {
        return this.request('/tasks', {
            method: 'POST',
            body: JSON.stringify(task)
        });
    }

    // Create multiple tasks
    async createTasks(tasks) {
        return this.request('/tasks/bulk', {
            method: 'POST',
            body: JSON.stringify({ tasks })
        });
    }

    // Update task
    async updateTask(id, updates) {
        return this.request(`/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    // Delete task
    async deleteTask(id) {
        return this.request(`/tasks/${id}`, {
            method: 'DELETE'
        });
    }

    // Get statistics
    async getStats() {
        return this.request('/stats');
    }

    // Search tasks
    async searchTasks(query) {
        return this.request(`/tasks/search?q=${encodeURIComponent(query)}`);
    }

    // Upload file
    async uploadFile(file) {
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
            const error = await response.json();
            throw new Error(error.error || 'שגיאה בהעלאת הקובץ');
        }

        return response.json();
    }
}

// Initialize API client
const api = new TaskAPI();

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