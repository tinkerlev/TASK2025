// local-db.js - ניהול מסד נתונים מקומי עם IndexedDB
class LocalDB {
    constructor(dbName = 'TaskManagerDB') {
        this.dbName = dbName;
        this.storeName = 'tasks';
        this.syncStoreName = 'syncQueue';
        this.version = 2;
        this.db = null;
        this.isOnline = navigator.onLine;
        this.initDB();
        this.setupEventListeners();
    }

    // אתחול IndexedDB
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('LocalDB initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // יצירת store למשימות
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const taskStore = db.createObjectStore(this.storeName, { 
                        keyPath: 'id', 
                        autoIncrement: false 
                    });
                    
                    // יצירת אינדקסים
                    taskStore.createIndex('status', 'status', { unique: false });
                    taskStore.createIndex('createdAt', 'createdAt', { unique: false });
                    taskStore.createIndex('userId', 'userId', { unique: false });
                    taskStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                    taskStore.createIndex('globalId', 'globalId', { unique: false });
                }

                // יצירת store לתור סנכרון
                if (!db.objectStoreNames.contains(this.syncStoreName)) {
                    const syncStore = db.createObjectStore(this.syncStoreName, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                    syncStore.createIndex('action', 'action', { unique: false });
                }
            };
        });
    }

    // הגדרת מאזינים לאירועי רשת
    setupEventListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('Connection restored - syncing data...');
            this.syncWithServer();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('Working offline - data will be synced when connection is restored');
        });
    }

    // הוספת משימה
    async addTask(task) {
        await this.ensureDB();
        const transaction = this.db.transaction([this.storeName, this.syncStoreName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const syncStore = transaction.objectStore(this.syncStoreName);
        
        const taskData = {
            ...task,
            id: task.id || Date.now().toString(),
            createdAt: task.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            syncStatus: 'pending',
            localOnly: !this.isOnline
        };
        
        return new Promise((resolve, reject) => {
            const request = store.add(taskData);
            
            request.onsuccess = () => {
                // הוספה לתור סנכרון אם במצב offline
                if (!this.isOnline) {
                    syncStore.add({
                        action: 'create',
                        taskId: taskData.id,
                        data: taskData,
                        timestamp: new Date().toISOString()
                    });
                }
                resolve(taskData);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    // קבלת כל המשימות
    async getAllTasks() {
        await this.ensureDB();
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const tasks = request.result.filter(task => 
                    task.userId === this.getCurrentUserId()
                );
                resolve(tasks);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // קבלת משימה לפי ID
    async getTaskById(id) {
        await this.ensureDB();
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // עדכון משימה
    async updateTask(id, updates) {
        await this.ensureDB();
        const task = await this.getTaskById(id);
        if (!task) throw new Error('משימה לא נמצאה');
        
        const transaction = this.db.transaction([this.storeName, this.syncStoreName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const syncStore = transaction.objectStore(this.syncStoreName);
        
        const updatedTask = {
            ...task,
            ...updates,
            updatedAt: new Date().toISOString(),
            syncStatus: 'pending'
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(updatedTask);
            
            request.onsuccess = () => {
                // הוספה לתור סנכרון אם במצב offline
                if (!this.isOnline) {
                    syncStore.add({
                        action: 'update',
                        taskId: id,
                        data: updatedTask,
                        timestamp: new Date().toISOString()
                    });
                }
                resolve(updatedTask);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    // מחיקת משימה
    async deleteTask(id) {
        await this.ensureDB();
        const transaction = this.db.transaction([this.storeName, this.syncStoreName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const syncStore = transaction.objectStore(this.syncStoreName);
        
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            
            request.onsuccess = () => {
                // הוספה לתור סנכרון אם במצב offline
                if (!this.isOnline) {
                    syncStore.add({
                        action: 'delete',
                        taskId: id,
                        timestamp: new Date().toISOString()
                    });
                }
                resolve(true);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    // סנכרון עם השרת
    async syncWithServer() {
        if (!this.isOnline || !window.api) return;
        
        try {
            await this.ensureDB();
            const transaction = this.db.transaction([this.syncStoreName], 'readonly');
            const syncStore = transaction.objectStore(this.syncStoreName);
            
            const syncQueue = await new Promise((resolve, reject) => {
                const request = syncStore.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            // ביצוע פעולות סנכרון
            for (const syncItem of syncQueue) {
                try {
                    switch (syncItem.action) {
                        case 'create':
                            await window.api.createTask(syncItem.data);
                            break;
                        case 'update':
                            await window.api.updateTask(syncItem.taskId, syncItem.data);
                            break;
                        case 'delete':
                            await window.api.deleteTask(syncItem.taskId);
                            break;
                    }
                    
                    // מחיקה מתור הסנכרון
                    await this.removeSyncItem(syncItem.id);
                } catch (error) {
                    console.error('Sync error for item:', syncItem, error);
                }
            }

            // קבלת נתונים עדכניים מהשרת
            const serverTasks = await window.api.getTasks();
            await this.updateLocalTasks(serverTasks);
            
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }

    // עדכון משימות מקומיות מהשרת
    async updateLocalTasks(serverTasks) {
        await this.ensureDB();
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        
        // ניקוי משימות ישנות
        await new Promise((resolve, reject) => {
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => resolve();
            clearRequest.onerror = () => reject(clearRequest.error);
        });
        
        // הוספת משימות מהשרת
        for (const task of serverTasks) {
            await new Promise((resolve, reject) => {
                const request = store.add({
                    ...task,
                    syncStatus: 'synced'
                });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }

    // הסרת פריט מתור הסנכרון
    async removeSyncItem(id) {
        await this.ensureDB();
        const transaction = this.db.transaction([this.syncStoreName], 'readwrite');
        const store = transaction.objectStore(this.syncStoreName);
        
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // וודא שה-DB מאותחל
    async ensureDB() {
        if (!this.db) {
            await this.initDB();
        }
    }

    // קבלת ID משתמש נוכחי
    getCurrentUserId() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user).id : null;
    }

    // חיפוש משימות לפי סטטוס
    async getTasksByStatus(status) {
        await this.ensureDB();
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('status');
        
        return new Promise((resolve, reject) => {
            const request = index.getAll(status);
            request.onsuccess = () => {
                const tasks = request.result.filter(task => 
                    task.userId === this.getCurrentUserId()
                );
                resolve(tasks);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ניקוי כל הנתונים
    async clearAllData() {
        await this.ensureDB();
        const transaction = this.db.transaction([this.storeName, this.syncStoreName], 'readwrite');
        const taskStore = transaction.objectStore(this.storeName);
        const syncStore = transaction.objectStore(this.syncStoreName);
        
        return new Promise((resolve, reject) => {
            let cleared = 0;
            const checkComplete = () => {
                cleared++;
                if (cleared === 2) resolve(true);
            };
            
            const taskClear = taskStore.clear();
            taskClear.onsuccess = checkComplete;
            taskClear.onerror = () => reject(taskClear.error);
            
            const syncClear = syncStore.clear();
            syncClear.onsuccess = checkComplete;
            syncClear.onerror = () => reject(syncClear.error);
        });
    }

    // שמירת מצב האפליקציה המלא
    async saveApplicationState() {
        const state = {
            timestamp: new Date().toISOString(),
            currentView: document.querySelector('.view-selector .active')?.dataset?.view || 'list',
            currentFilter: document.querySelector('.filter-btn.active')?.dataset?.filter || 'all',
            searchQuery: document.querySelector('#searchInput')?.value || '',
            sortBy: document.querySelector('#sortSelect')?.value || 'date',
            expandedTasks: Array.from(document.querySelectorAll('.task-item.expanded')).map(el => el.dataset.taskId),
            scrollPosition: {
                x: window.scrollX,
                y: window.scrollY
            },
            sidebarOpen: document.querySelector('.sidebar')?.classList.contains('open') || false,
            lastTaskViewed: sessionStorage.getItem('lastTaskViewed'),
            unsavedChanges: this.getUnsavedChanges()
        };
        
        SimpleStorage.setItem('appFullState', state);
        return state;
    }

    // שחזור מצב האפליקציה
    async restoreApplicationState() {
        const state = SimpleStorage.getItem('appFullState');
        if (!state) return;

        // בדיקת זמן - אם עברו יותר מ-24 שעות, לא לשחזר
        const stateAge = new Date() - new Date(state.timestamp);
        if (stateAge > 24 * 60 * 60 * 1000) {
            SimpleStorage.removeItem('appFullState');
            return;
        }

        // שחזור תצוגה
        if (state.currentView) {
            const viewBtn = document.querySelector(`[data-view="${state.currentView}"]`);
            viewBtn?.click();
        }

        // שחזור פילטר
        if (state.currentFilter) {
            const filterBtn = document.querySelector(`[data-filter="${state.currentFilter}"]`);
            filterBtn?.click();
        }

        // שחזור חיפוש
        if (state.searchQuery) {
            const searchInput = document.querySelector('#searchInput');
            if (searchInput) {
                searchInput.value = state.searchQuery;
                searchInput.dispatchEvent(new Event('input'));
            }
        }

        // שחזור מיון
        if (state.sortBy) {
            const sortSelect = document.querySelector('#sortSelect');
            if (sortSelect) {
                sortSelect.value = state.sortBy;
                sortSelect.dispatchEvent(new Event('change'));
            }
        }

        // שחזור מיקום גלילה (עם delay קטן)
        setTimeout(() => {
            window.scrollTo(state.scrollPosition.x, state.scrollPosition.y);
        }, 100);

        // שחזור מצב sidebar
        if (state.sidebarOpen) {
            document.querySelector('.sidebar')?.classList.add('open');
        }

        // הצגת הודעה למשתמש
        this.showRestoredStateNotification(state);
    }

    // הצגת הודעה על שחזור מצב
    showRestoredStateNotification(state) {
        const notification = document.createElement('div');
        notification.className = 'state-restored-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-info-circle"></i>
                <span>המערכת שוחזרה למצב האחרון מ-${new Date(state.timestamp).toLocaleString('he-IL')}</span>
                <button onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    // שמירת שינויים לא שמורים
    getUnsavedChanges() {
        // אוסף את כל השדות עם שינויים לא שמורים
        const unsaved = {};
        document.querySelectorAll('[data-unsaved="true"]').forEach(element => {
            unsaved[element.id || element.name] = element.value;
        });
        return unsaved;
    }

    // שמירה אוטומטית של מצב כל דקה
    startAutoSaveState() {
        setInterval(() => {
            this.saveApplicationState();
        }, 60000); // כל דקה
    }

    // שמירת מצב לפני יציאה
    setupBeforeUnload() {
        window.addEventListener('beforeunload', (e) => {
            this.saveApplicationState();
            
            // אם יש שינויים לא שמורים
            const unsavedChanges = this.getUnsavedChanges();
            if (Object.keys(unsavedChanges).length > 0) {
                e.preventDefault();
                e.returnValue = 'יש לך שינויים לא שמורים. האם אתה בטוח שברצונך לצאת?';
            }
        });
    }
}

// פונקציות עזר ל-LocalStorage (לנתונים פשוטים)
class SimpleStorage {
    static setItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('שגיאה בשמירת נתונים:', e);
            return false;
        }
    }

    static getItem(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (e) {
            console.error('שגיאה בקריאת נתונים:', e);
            return null;
        }
    }

    static removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('שגיאה במחיקת נתונים:', e);
            return false;
        }
    }

    static clear() {
        try {
            localStorage.clear();
            return true;
        } catch (e) {
            console.error('שגיאה בניקוי נתונים:', e);
            return false;
        }
    }

    // שמירת הגדרות משתמש
    static saveUserSettings(settings) {
        return this.setItem('userSettings', settings);
    }

    // קבלת הגדרות משתמש
    static getUserSettings() {
        return this.getItem('userSettings') || {
            theme: 'light',
            language: 'he',
            notifications: true,
            autoSync: true,
            offlineMode: false
        };
    }

    // שמירת פרטי משתמש
    static saveUserInfo(userInfo) {
        return this.setItem('userInfo', userInfo);
    }

    // קבלת פרטי משתמש
    static getUserInfo() {
        return this.getItem('userInfo');
    }

    // שמירת מצב אפליקציה
    static saveAppState(state) {
        return this.setItem('appState', state);
    }

    // קבלת מצב אפליקציה
    static getAppState() {
        return this.getItem('appState') || {
            lastSync: null,
            offlineChanges: 0,
            currentFilter: 'all'
        };
    }
}

// יצוא המחלקות
window.LocalDB = LocalDB;
window.SimpleStorage = SimpleStorage;

// אתחול אוטומטי
const localDB = new LocalDB();
window.localDB = localDB;

// הפעלת שמירה אוטומטית ושחזור מצב
document.addEventListener('DOMContentLoaded', () => {
    localDB.restoreApplicationState();
    localDB.startAutoSaveState();
    localDB.setupBeforeUnload();
});
