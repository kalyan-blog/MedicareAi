// Main JavaScript file - Enhanced with better error handling
class MedicareAI {
    constructor() {
        this.apiBase = 'http://localhost:5000/api';
        this.currentUser = null;
        this.init();
    }

    init() {
        console.log('🚀 MEDICARE AI Frontend Initialized');
        this.checkAuth();
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            z-index: 10000;
            font-weight: bold;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;
        
        if (type === 'error') {
            notification.style.background = '#f44336';
        } else if (type === 'success') {
            notification.style.background = '#4CAF50';
        } else {
            notification.style.background = '#2196F3';
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    async checkAuth() {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        
        if (token && userData) {
            try {
                this.currentUser = JSON.parse(userData);
                this.updateNavigation();
                console.log('✅ User authenticated:', this.currentUser.email);
            } catch (error) {
                console.error('❌ Auth check failed:', error);
                this.logout();
            }
        }
    }

    updateNavigation() {
        const navMenu = document.querySelector('.nav-menu');
        if (!navMenu){
            console.log('Navigation menu not found on this page'); 
            return;
        }

        // Remove existing auth-related links
        const authLinks = navMenu.querySelectorAll('a[href*="login"], a[href*="signup"], a[href*="profile"], a[onclick*="logout"]');
    authLinks.forEach(link => {
        if (link.parentElement) {
            link.parentElement.remove();
        }
    });

    if (this.currentUser) {
        // User is logged in - show profile and logout
        const profileItem = document.createElement('li');
        profileItem.className = 'nav-item';
        profileItem.innerHTML = `<a href="pages/profile.html" class="nav-link"><i class="fas fa-user"></i> Profile</a>`;
        
        const logoutItem = document.createElement('li');
        logoutItem.className = 'nav-item';
        logoutItem.innerHTML = `<a href="#" class="nav-link" onclick="medicareAI.logout()"><i class="fas fa-sign-out-alt"></i> Logout</a>`;
        
        navMenu.appendChild(profileItem);
        navMenu.appendChild(logoutItem);
        
        console.log('✅ Navigation updated: User is logged in');
    } else {
        // User is not logged in - show login and signup
        const loginItem = document.createElement('li');
        loginItem.className = 'nav-item';
        loginItem.innerHTML = `<a href="pages/login.html" class="nav-link"><i class="fas fa-sign-in-alt"></i> Login</a>`;
        
        const signupItem = document.createElement('li');
        signupItem.className = 'nav-item';
        signupItem.innerHTML = `<a href="pages/signup.html" class="nav-link"><i class="fas fa-user-plus"></i> Sign Up</a>`;
        
        navMenu.appendChild(loginItem);
        navMenu.appendChild(signupItem);
        
        console.log('✅ Navigation updated: User is not logged in');
    }
}
    async login(email, password) {
        try {
            console.log('Attempting login for:', email);
            
            const response = await fetch(`${this.apiBase}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();
            
            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                this.currentUser = data.user;
                this.updateNavigation();
                this.showNotification(`Welcome back, ${data.user.name}!`, 'success');
                
                // Redirect to home page after short delay
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 1000);
                
            } else {
                this.showNotification(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Login failed: Could not connect to server', 'error');
        }
    }

    async register(name, email, password) {
        try {
            console.log('Attempting registration for:', email);
            
            const response = await fetch(`${this.apiBase}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await response.json();
            
            if (response.ok) {
                this.showNotification('Registration successful! Please login.', 'success');
                
                // Redirect to login page after short delay
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                
            } else {
                this.showNotification(data.error || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showNotification('Registration failed: Could not connect to server', 'error');
        }
    }

    // In the MedicareAI class, update the logout function:
logout() {
    // Clear all stored data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    const userName = this.currentUser?.name || 'User';
    this.currentUser = null;
    
    // Show logout notification
    this.showNotification(`Goodbye, ${userName}! You have been logged out.`, 'info');
    
    // Update navigation immediately
    this.updateNavigation();
    
    // Redirect to home page after a short delay
    setTimeout(() => {
        const currentPage = window.location.pathname;
        
        // Check if we're already on the home page
        if (currentPage.includes('index.html') || currentPage.endsWith('/') || currentPage.includes('/frontend/')) {
            // If already on home page, just reload to reflect logged out state
            window.location.reload();
        } else {
            // Navigate to home page
            window.location.href = '../index.html';
        }
    }, 1500);
}

    async sendChatMessage(message) {
        try {
            const response = await fetch(`${this.apiBase}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message,
                    userId: this.currentUser?.id
                }),
            });

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('Chat error:', error);
            return '❌ Sorry, I am unable to connect to the server. Please check if the backend is running on port 5000.';
        }
    }

    async loadMedicines(sort = '', category = '') {
        try {
            const params = new URLSearchParams();
            if (sort) params.append('sort', sort);
            if (category) params.append('category', category);

            const response = await fetch(`${this.apiBase}/medicines?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error loading medicines:', error);
            this.showNotification('Failed to load medicines. Check backend connection.', 'error');
            return [];
        }
    }

    async loadDiseases() {
        try {
            const response = await fetch(`${this.apiBase}/diseases`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error loading diseases:', error);
            this.showNotification('Failed to load diseases. Check backend connection.', 'error');
            return [];
        }
    }

    async getUserProfile(userId) {
        try {
            const response = await fetch(`${this.apiBase}/user/${userId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error loading user profile:', error);
            this.showNotification('Failed to load profile.', 'error');
            return null;
        }
    }
}

// Initialize the application
const medicareAI = new MedicareAI();

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);