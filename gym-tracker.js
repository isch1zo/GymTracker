// gym-tracker.js
'use strict';

// Firebase configuration (obfuscated)
const getFirebaseConfig = () => ({
    apiKey: atob("QUl6YVN5RE1oOW02R3lqOTlURHJoVHREdlZKZVZWRWlQQUtqN3Fz"),
    authDomain: "gymtracker-a2348.firebaseapp.com",
    projectId: "gymtracker-a2348",
    storageBucket: "gymtracker-a2348.firebasestorage.app",
    messagingSenderId: "295882576759",
    appId: "1:295882576759:web:98fbcc61a72ded93334772"
});

// Initialize Firebase
let firebaseApp = null;
let auth = null;
let db = null;

try {
    firebaseApp = firebase.initializeApp(getFirebaseConfig());
    auth = firebase.auth();
    db = firebase.firestore();
    
    // Enable offline persistence
    db.enablePersistence().catch(err => {
        console.warn('Persistence disabled:', err.code);
    });
} catch (error) {
    console.warn('Firebase initialization failed, using guest mode:', error);
}

// Utility functions
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

function sanitizeForAttribute(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[&"'<>]/g, match => ({
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#x27;',
        '<': '&lt;',
        '>': '&gt;'
    })[match]);
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Global state
let currentUser = null;
let userData = {
    stats: {
        weight: '',
        height: '',
        goalWeight: '',
        bmi: ''
    },
    exercises: {
        push: [],
        pull: [],
        legs: []
    },
    dailyProgress: {}
};
let currentCategory = '';
let unsubscribe = null;
let isGuestMode = false;
let currentView = 'list';
let selectedDate = new Date().toISOString().split('T')[0];
let selectedMuscleGroup = '';
let isUserTyping = false;
let isWorkoutActive = false;
let hasCelebrated = false;

// Rate limiting
const rateLimiter = new Map();
function checkRateLimit(action, maxAttempts = 5, windowMs = 60000) {
    const now = Date.now();
    const key = `${action}_${currentUser?.uid || 'guest'}`;
    const attempts = rateLimiter.get(key) || [];
    const recent = attempts.filter(t => now - t < windowMs);
    
    if (recent.length >= maxAttempts) {
        return false;
    }
    
    recent.push(now);
    rateLimiter.set(key, recent);
    return true;
}

// Initialize app
window.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
        
        if (auth) {
            auth.onAuthStateChanged((user) => {
                if (user) {
                    currentUser = user;
                    isGuestMode = false;
                    showMainApp();
                    initializeUserData();
                    listenToUserData();
                } else {
                    showAuthScreen();
                }
            });
        } else {
            showAuthScreen();
        }
    }, 1000);
});

// User data initialization
async function initializeUserData() {
    if (!currentUser || !db) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        if (!userDoc.exists) {
            await db.collection('users').doc(currentUser.uid).set({
                stats: {
                    weight: '',
                    height: '',
                    goalWeight: '',
                    bmi: ''
                },
                exercises: {
                    push: [],
                    pull: [],
                    legs: []
                },
                dailyProgress: {},
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('✅ New user data initialized');
        }
    } catch (error) {
        console.error('Error initializing user data:', error);
    }
}

// Authentication functions
function toggleEmailForm() {
    const form = document.getElementById('emailForm');
    if (form) {
        form.classList.toggle('active');
    }
    const error = document.getElementById('authError');
    if (error) {
        error.style.display = 'none';
    }
}

async function signInWithGoogle() {
    if (!auth) {
        showAuthError('Firebase not available. Please use guest mode.');
        return;
    }
    
    if (!checkRateLimit('auth', 3, 60000)) {
        showAuthError('Too many attempts. Please wait.');
        return;
    }
    
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
    } catch (error) {
        showAuthError(error.message);
    }
}

async function signInWithEmail() {
    if (!auth) {
        showAuthError('Firebase not available. Please use guest mode.');
        return;
    }
    
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
    }
    
    if (!isValidEmail(email)) {
        showAuthError('Please enter a valid email address');
        return;
    }
    
    if (!checkRateLimit(`auth_${email}`, 5, 300000)) {
        showAuthError('Too many failed attempts. Please try again later.');
        return;
    }
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        handleAuthError(error);
    }
}

async function signUpWithEmail() {
    if (!auth) {
        showAuthError('Firebase not available. Please use guest mode.');
        return;
    }
    
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
    }
    
    if (!isValidEmail(email)) {
        showAuthError('Please enter a valid email address');
        return;
    }
    
    if (password.length < 6) {
        showAuthError('Password must be at least 6 characters');
        return;
    }
    
    try {
        await auth.createUserWithEmailAndPassword(email, password);
    } catch (error) {
        handleAuthError(error);
    }
}

function handleAuthError(error) {
    const errorMessages = {
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/invalid-login-credentials': 'Invalid username or password',
        'auth/email-already-in-use': 'Account already exists',
        'auth/weak-password': 'Password is too weak',
        'auth/invalid-email': 'Invalid email address',
        'auth/user-disabled': 'This account has been disabled',
        'auth/too-many-requests': 'Too many failed attempts. Try again later.'
    };
    
    showAuthError(errorMessages[error.code] || error.message);
}

function continueAsGuest() {
    isGuestMode = true;
    currentUser = null;
    showMainApp();
    loadLocalData();
}

async function signOut() {
    if (isGuestMode) {
        if (confirm('Sign out from guest mode? Your data is only saved on this device.')) {
            location.reload();
        }
    } else {
        if (!auth) {
            location.reload();
            return;
        }
        try {
            await auth.signOut();
            location.reload();
        } catch (error) {
            console.error('Error signing out:', error);
        }
    }
}

function showAuthError(message) {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
}

// UI functions
function showAuthScreen() {
    const authContainer = document.getElementById('authContainer');
    const mainApp = document.getElementById('mainApp');
    
    if (authContainer) authContainer.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
}

function showMainApp() {
    const authContainer = document.getElementById('authContainer');
    const mainApp = document.getElementById('mainApp');
    
    if (authContainer) authContainer.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
    
    if (isGuestMode) {
        updateElement('userName', 'Guest User');
        updateElement('userEmail', 'Data saved locally only');
        updateElement('userAvatar', 'G');
        const syncBadge = document.getElementById('syncBadge');
        if (syncBadge) syncBadge.style.display = 'none';
    } else if (currentUser) {
        const displayName = currentUser.displayName || currentUser.email.split('@')[0];
        updateElement('userName', displayName);
        updateElement('userEmail', currentUser.email);
        updateElement('userAvatar', displayName[0].toUpperCase());
        const syncBadge = document.getElementById('syncBadge');
        if (syncBadge) syncBadge.style.display = 'flex';
    }
    
    setupEventListeners();
}

function updateElement(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    }
}

// Data management
function listenToUserData() {
    if (!currentUser || isGuestMode || !db) return;
    
    unsubscribe = db.collection('users').doc(currentUser.uid)
        .onSnapshot(async (doc) => {
            if (doc.exists) {
                const firebaseData = doc.data();
                
                // Clean and validate data from Firebase
                userData = {
                    stats: firebaseData.stats || { weight: '', height: '', goalWeight: '', bmi: '' },
                    exercises: firebaseData.exercises || { push: [], pull: [], legs: [] },
                    dailyProgress: firebaseData.dailyProgress || {}
                };
                
                // Auto-fix hasImage flags for exercises that have images but flag is false
                let needsImageFlagFix = false;
                for (const category of ['push', 'pull', 'legs']) {
                    const exercises = userData.exercises[category] || [];
                    for (let i = 0; i < exercises.length; i++) {
                        const exercise = exercises[i];
                        if (!exercise.hasImage) {
                            // Check if image exists in Firestore
                            try {
                                const imageDoc = await db.collection('users').doc(currentUser.uid)
                                    .collection('images').doc(exercise.id.toString()).get();
                                if (imageDoc.exists) {
                                    console.log(`🔧 Auto-fixing hasImage flag for exercise ${exercise.id}`);
                                    userData.exercises[category][i].hasImage = true;
                                    needsImageFlagFix = true;
                                }
                            } catch (error) {
                                // Ignore errors during auto-fix
                            }
                        }
                    }
                }
                
                // Save the fixed flags if needed (but don't trigger infinite loop)
                if (needsImageFlagFix) {
                    console.log('💾 Auto-saving fixed hasImage flags...');
                    // Temporarily disable listener to avoid loop
                    const tempData = JSON.parse(JSON.stringify(userData));
                    setTimeout(async () => {
                        try {
                            await db.collection('users').doc(currentUser.uid).set({
                                exercises: tempData.exercises,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        } catch (error) {
                            console.error('Error auto-fixing hasImage flags:', error);
                        }
                    }, 100);
                }
                
                
                // Ensure all required fields exist
                if (!userData.stats.weight) userData.stats.weight = '';
                if (!userData.stats.height) userData.stats.height = '';
                if (!userData.stats.goalWeight) userData.stats.goalWeight = '';
                if (!userData.stats.bmi) userData.stats.bmi = '';
                
                if (!userData.exercises.push) userData.exercises.push = [];
                if (!userData.exercises.pull) userData.exercises.pull = [];
                if (!userData.exercises.legs) userData.exercises.legs = [];
                
                updateUIFromData();
                showSyncStatus('synced');
            }
        }, (error) => {
            console.error('Error listening to data:', error);
            showSyncStatus('error');
        });
}

// Function to estimate document size
function estimateDocumentSize(data) {
    try {
        const jsonString = JSON.stringify(data);
        return new Blob([jsonString]).size;
    } catch (error) {
        console.error('Error estimating document size:', error);
        return 0;
    }
}

async function saveUserData() {
    if (!checkRateLimit('save', 10, 60000)) {
        showSyncStatus('rate-limited');
        return;
    }
    
    showSyncStatus('syncing');
    
    if (isGuestMode) {
        localStorage.setItem('gymTrackerData', JSON.stringify(userData));
        showSyncStatus('local');
        return;
    }
    
    if (!currentUser || !db) return;
    
    try {
        // Helper function to create clean exercise object (NO IMAGES in main document)
        const createCleanExercise = (ex) => {
            const clean = {
                id: Number(ex.id) || 0,
                name: String(ex.name || '').trim().substring(0, 50),
                weight: String(ex.weight || ''),
                hasImage: !!(ex.image) // Just track if image exists
            };
            // Images are stored separately - don't include in main document
            return clean;
        };
        
        // Create a completely clean data structure
        const dataToSave = {
            stats: {
                weight: String(userData.stats?.weight || ''),
                height: String(userData.stats?.height || ''),
                goalWeight: String(userData.stats?.goalWeight || ''),
                bmi: String(userData.stats?.bmi || '')
            },
            exercises: {
                push: (userData.exercises?.push || []).map(createCleanExercise),
                pull: (userData.exercises?.pull || []).map(createCleanExercise),
                legs: (userData.exercises?.legs || []).map(createCleanExercise)
            },
            dailyProgress: userData.dailyProgress || {},
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Use JSON serialization to ensure completely plain objects
        const cleanData = JSON.parse(JSON.stringify(dataToSave));
        // Re-add server timestamp as it gets removed by JSON serialization
        cleanData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        
        // Check document size before saving
        const estimatedSize = estimateDocumentSize(cleanData);
        const maxSize = 1024 * 1024; // 1MB Firebase limit
        
        console.log('Saving data:', {
            statsCount: Object.keys(cleanData.stats).length,
            pushExercises: cleanData.exercises.push.length,
            pullExercises: cleanData.exercises.pull.length,
            legsExercises: cleanData.exercises.legs.length,
            estimatedSize: `${(estimatedSize / 1024).toFixed(1)}KB`,
            withinLimit: estimatedSize < maxSize
        });
        
        // If document is too large, save in parts automatically
        if (estimatedSize >= maxSize * 0.9) { // Use 90% of limit as threshold
            console.warn('Document approaching size limit, saving in parts...');
            
            // Save in parts directly instead of throwing error
            try {
                // First, save stats
                await db.collection('users').doc(currentUser.uid).set({
                    stats: JSON.parse(JSON.stringify({
                        weight: String(userData.stats?.weight || ''),
                        height: String(userData.stats?.height || ''),
                        goalWeight: String(userData.stats?.goalWeight || ''),
                        bmi: String(userData.stats?.bmi || '')
                    })),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log('Stats saved successfully (parts mode)');
                
                // Then save exercises one category at a time
                for (const category of ['push', 'pull', 'legs']) {
                    const exercises = (userData.exercises?.[category] || []).map(ex => {
                        const clean = {
                            id: Number(ex.id) || 0,
                            name: String(ex.name || '').trim().substring(0, 50),
                            weight: String(ex.weight || '')
                        };
                        if (ex.image && typeof ex.image === 'string' && ex.image.startsWith('data:image')) {
                            clean.image = ex.image;
                        }
                        return clean;
                    });
                    
                    const update = {};
                    update[`exercises.${category}`] = JSON.parse(JSON.stringify(exercises));
                    
                    await db.collection('users').doc(currentUser.uid).update(update);
                    console.log(`${category} exercises saved successfully (parts mode - ${exercises.length} exercises)`);
                }
                
                // Finally save daily progress
                await db.collection('users').doc(currentUser.uid).update({
                    dailyProgress: JSON.parse(JSON.stringify(userData.dailyProgress || {}))
                });
                console.log('Daily progress saved successfully (parts mode)');
                
                showSyncStatus('synced');
                console.log('✅ All data saved successfully in parts (proactive)');
                return; // Exit early since we've saved successfully
            } catch (partsError) {
                console.error('Parts save failed:', partsError);
                throw partsError; // Re-throw to trigger normal error handling
            }
        }
        
        // Use set with merge to avoid nested entity issues (normal path)
        await db.collection('users').doc(currentUser.uid).set(cleanData, { merge: true });
        
        showSyncStatus('synced');
        console.log('✅ Data saved successfully');
    } catch (error) {
        console.error('Error saving data:', error);
        
        // Handle specific Firebase errors
        if (error.code === 'permission-denied') {
            showSyncStatus('permission-error');
            console.error('Permission denied. Check Firestore rules.');
            alert('Permission denied. Please check your Firebase security rules or sign in again.');
        } else if (error.code === 'invalid-argument' || error.message.includes('invalid nested entity') || 
                   error.message.includes('maximum size') || error.message.includes('too large') || 
                   error.message.includes('Document too large') || error.code === 'resource-exhausted') {
            showSyncStatus('data-error');
            console.error('Document size limit or invalid data detected. Attempting to save in parts...');
            
            // Show user-friendly message about document size
            if (error.message.includes('too large') || error.message.includes('maximum size') || 
                error.message.includes('Document too large')) {
                console.warn('⚠️ Your data is getting large due to exercise images. Saving in smaller parts for better reliability.');
            }
            
            // Try saving data in parts
            setTimeout(async () => {
                try {
                    // Use the current userData (which includes the new exercise)
                    const currentData = userData;
                    
                    // First, save stats
                    await db.collection('users').doc(currentUser.uid).set({
                        stats: JSON.parse(JSON.stringify({
                            weight: String(currentData.stats?.weight || ''),
                            height: String(currentData.stats?.height || ''),
                            goalWeight: String(currentData.stats?.goalWeight || ''),
                            bmi: String(currentData.stats?.bmi || '')
                        })),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    console.log('Stats saved successfully');
                    
                    // Then save exercises one category at a time using current data
                    for (const category of ['push', 'pull', 'legs']) {
                        const exercises = (currentData.exercises?.[category] || []).map(ex => {
                            const clean = {
                                id: Number(ex.id) || 0,
                                name: String(ex.name || '').trim().substring(0, 50),
                                weight: String(ex.weight || '')
                            };
                            if (ex.image && typeof ex.image === 'string' && ex.image.startsWith('data:image')) {
                                clean.image = ex.image;
                            }
                            return clean;
                        });
                        
                        const update = {};
                        update[`exercises.${category}`] = JSON.parse(JSON.stringify(exercises));
                        
                        await db.collection('users').doc(currentUser.uid).update(update);
                        console.log(`${category} exercises saved successfully (${exercises.length} exercises)`);
                    }
                    
                    // Finally save daily progress
                    await db.collection('users').doc(currentUser.uid).update({
                        dailyProgress: JSON.parse(JSON.stringify(currentData.dailyProgress || {}))
                    });
                    console.log('Daily progress saved successfully');
                    
                    showSyncStatus('synced');
                    console.log('✅ All data saved successfully in parts');
                } catch (e) {
                    console.error('Recovery save failed:', e);
                    showSyncStatus('error');
                    alert('Failed to sync data to cloud. Your data is saved locally. Error: ' + e.message);
                }
            }, 1000);
        } else {
            showSyncStatus('error');
            console.error('Unexpected error:', error.message);
            alert('Sync error: ' + error.message + '. Your data is saved locally.');
        }
    }
}

function validateStats(stats) {
    const validated = { ...stats };
    
    // Validate weight
    if (validated.weight) {
        const weight = parseFloat(validated.weight);
        if (isNaN(weight) || weight < 20 || weight > 300) {
            delete validated.weight;
        }
    }
    
    // Validate height
    if (validated.height) {
        const height = parseFloat(validated.height);
        if (isNaN(height) || height < 100 || height > 250) {
            delete validated.height;
        }
    }
    
    // Validate goal weight
    if (validated.goalWeight) {
        const goalWeight = parseFloat(validated.goalWeight);
        if (isNaN(goalWeight) || goalWeight < 20 || goalWeight > 300) {
            delete validated.goalWeight;
        }
    }
    
    return validated;
}

function loadLocalData() {
    const saved = localStorage.getItem('gymTrackerData');
    if (saved) {
        try {
            userData = JSON.parse(saved);
            // Ensure dailyProgress is always initialized
            if (!userData.dailyProgress) {
                userData.dailyProgress = {};
            }
            updateUIFromData();
        } catch (error) {
            console.error('Error loading local data:', error);
        }
    }
}

function showSyncStatus(status) {
    const statusEl = document.getElementById('syncStatus');
    const badgeEl = document.getElementById('syncBadge');
    
    if (isGuestMode) {
        if (badgeEl) badgeEl.style.display = 'none';
        return;
    }
    
    if (statusEl) {
        const statusMessages = {
            'syncing': 'Syncing...',
            'synced': 'Synced',
            'error': 'Sync Error',
            'local': 'Saved Locally',
            'rate-limited': 'Too Many Saves',
            'permission-error': 'Permission Error',
            'data-error': 'Data Error'
        };
        statusEl.textContent = statusMessages[status] || 'Unknown';
    }
}

// Event listeners setup
function setupEventListeners() {
    // Weight input
    const weightInput = document.getElementById('weight');
    if (weightInput) {
        weightInput.addEventListener('focus', function() {
            isUserTyping = true;
        });
        
        weightInput.addEventListener('blur', function() {
            isUserTyping = false;
        });
        
        weightInput.addEventListener('input', function() {
            userData.stats.weight = this.value;
            saveUserData();
            updateStats();
        });
    }
    
    // Height input
    const heightInput = document.getElementById('height');
    if (heightInput) {
        heightInput.addEventListener('focus', function() {
            isUserTyping = true;
        });
        
        heightInput.addEventListener('blur', function() {
            isUserTyping = false;
        });
        
        heightInput.addEventListener('input', function() {
            userData.stats.height = this.value;
            saveUserData();
            updateStats();
        });
    }
    
    // Goal weight input
    const goalWeightInput = document.getElementById('goalWeight');
    if (goalWeightInput) {
        goalWeightInput.addEventListener('focus', function() {
            isUserTyping = true;
        });
        
        goalWeightInput.addEventListener('blur', function() {
            isUserTyping = false;
        });
        
        goalWeightInput.addEventListener('input', function() {
            userData.stats.goalWeight = this.value;
            saveUserData();
            updateStats();
        });
    }
    
    // Image upload functionality
    setupImageUpload();
}

function setupImageUpload() {
    const imageInput = document.getElementById('exerciseImage');
    const imageUploadArea = document.getElementById('imageUploadArea');
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    
    if (!imageInput || !imageUploadArea || !imagePreview || !previewImg) return;
    
    // File input change
    imageInput.addEventListener('change', function(e) {
        handleImageSelect(e.target.files[0]);
    });
    
    // Drag and drop functionality
    imageUploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        imageUploadArea.classList.add('dragover');
    });
    
    imageUploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        imageUploadArea.classList.remove('dragover');
    });
    
    imageUploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        imageUploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleImageSelect(files[0]);
        }
    });
    
    // Click to upload
    imageUploadArea.addEventListener('click', function() {
        imageInput.click();
    });
}

async function handleImageSelect(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
    }
    
    // Check file size (max 50MB before compression) - Much more lenient
    if (file.size > 50 * 1024 * 1024) {
        alert('Image size must be less than 50MB');
        return;
    }
    
    // Show loading indicator
    const imagePreview = document.getElementById('imagePreview');
    const imageUploadArea = document.getElementById('imageUploadArea');
    const previewImg = document.getElementById('previewImg');
    
    if (imageUploadArea) {
        imageUploadArea.innerHTML = '<div class="compression-loading">🔄 Compressing image...</div>';
    }
    
    try {
        // Start with WebP compression for best results
        let compressedFile = await compressImageWebP(file);
        
        // Smart adaptive compression with multiple levels
        if (compressedFile.size > 300 * 1024) { // 300KB threshold (lower due to WebP)
            console.log('Image too large, applying ultra WebP compression...');
            compressedFile = await compressImageWebP(file, 250, 0.25);
            
            if (compressedFile.size > 200 * 1024) { // 200KB threshold
                console.log('Still too large, applying extreme compression...');
                compressedFile = await compressImageWebP(file, 180, 0.15);
                
                if (compressedFile.size > 150 * 1024) { // 150KB final threshold
                    console.log('Applying maximum compression...');
                    compressedFile = await compressImageWebP(file, 120, 0.1); // Absolute minimum
                    
                    if (compressedFile.size > 100 * 1024) { // 100KB absolute limit
                        console.log('Using extreme compression - quality may be reduced');
                    }
                }
            }
        }
        
        // Show preview
        const reader = new FileReader();
        reader.onload = function(e) {
            if (previewImg) previewImg.src = e.target.result;
            if (imagePreview) imagePreview.style.display = 'block';
            if (imageUploadArea) imageUploadArea.style.display = 'none';
            
            // Show compression success message
            const originalSize = (file.size / 1024 / 1024).toFixed(2);
            const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
            const compressionRatio = ((1 - compressedFile.size / file.size) * 100).toFixed(0);
            
            console.log(`Image compressed: ${originalSize}MB → ${compressedSize}MB (${compressionRatio}% reduction)`);
        };
        reader.readAsDataURL(compressedFile);
        
    } catch (error) {
        console.error('Error compressing image:', error);
        alert('Error processing image. Please try again.');
        if (imageUploadArea) {
            imageUploadArea.innerHTML = `
                <div class="upload-icon">📷</div>
                <div class="upload-text">Click to upload image</div>
                <div class="upload-hint">or drag & drop</div>
            `;
        }
    }
}

// UI update functions
function updateUIFromData() {
    const weightInput = document.getElementById('weight');
    const heightInput = document.getElementById('height');
    const goalWeightInput = document.getElementById('goalWeight');
    
    // Only update input values if user is not currently typing
    if (weightInput && !isUserTyping) {
        weightInput.value = userData.stats?.weight || '';
    }
    if (heightInput && !isUserTyping) {
        heightInput.value = userData.stats?.height || '';
    }
    if (goalWeightInput && !isUserTyping) {
        goalWeightInput.value = userData.stats?.goalWeight || '';
    }
    
    updateStats();
    renderAllExercises();
}

function updateStats() {
    const weight = parseFloat(userData.stats?.weight);
    const height = parseFloat(userData.stats?.height);
    const goalWeight = parseFloat(userData.stats?.goalWeight);
    
    // Calculate BMI
    if (weight && height) {
        const heightInM = height / 100;
        const bmi = weight / (heightInM * heightInM);
        userData.stats.bmi = bmi.toFixed(1);
        updateElement('bmi', bmi.toFixed(1));
        
        const minHealthy = (18.5 * heightInM * heightInM).toFixed(1);
        const maxHealthy = (24.9 * heightInM * heightInM).toFixed(1);
        updateElement('healthyRange', `${minHealthy} - ${maxHealthy} kg`);
    } else {
        updateElement('bmi', '--');
        updateElement('healthyRange', '-- kg');
    }
    
    // Progress tracking
    const progressSection = document.getElementById('progressSection');
    if (weight && goalWeight && progressSection) {
        progressSection.style.display = 'block';
        updateElement('currentInProgress', weight.toFixed(1));
        updateElement('goalInProgress', goalWeight.toFixed(1));
        
        const remaining = Math.abs(weight - goalWeight);
        const progressStatus = document.getElementById('progressStatus');
        
        if (progressStatus) {
            if (remaining < 0.5) {
                progressStatus.textContent = '🎉 Goal Reached!';
                updateElement('progressPercent', '100');
                const progressBar = document.getElementById('progressBar');
                if (progressBar) {
                    progressBar.style.width = '100%';
                }
            } else {
                progressStatus.textContent = `${remaining.toFixed(1)} kg to go!`;
                updateElement('progressPercent', '0');
                const progressBar = document.getElementById('progressBar');
                if (progressBar) {
                    progressBar.style.width = '0%';
                }
            }
        }
    } else if (progressSection) {
        progressSection.style.display = 'none';
    }
}

// Exercise functions
let currentExerciseCategory = '';
let editingExerciseId = null;

function openModal(category) {
    currentExerciseCategory = category;
    editingExerciseId = null; // Reset editing mode
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.add('active');
    }
    const exerciseName = document.getElementById('exerciseName');
    if (exerciseName) {
        exerciseName.value = '';
        exerciseName.focus();
    }
    
    // Update modal title
    const modalTitle = modal.querySelector('h3');
    if (modalTitle) {
        modalTitle.textContent = 'Add New Exercise';
    }
}

function editExercise(category, exerciseId) {
    const exercise = userData.exercises[category].find(ex => ex.id === exerciseId);
    if (!exercise) return;
    
    currentExerciseCategory = category;
    editingExerciseId = exerciseId;
    
    const modal = document.getElementById('modal');
    const exerciseName = document.getElementById('exerciseName');
    
    if (modal && exerciseName) {
        modal.classList.add('active');
        exerciseName.value = exercise.name;
        exerciseName.focus();
        
        // Update modal title
        const modalTitle = modal.querySelector('h3');
        if (modalTitle) {
            modalTitle.textContent = 'Edit Exercise';
        }
        
        // Load existing image if available
        if (exercise.hasImage) {
            loadExerciseImageForEdit(exerciseId);
        }
    }
}

async function loadExerciseImageForEdit(exerciseId) {
    const imageData = await loadExerciseImage(exerciseId);
    if (imageData) {
        const imagePreview = document.getElementById('imagePreview');
        const imageUploadArea = document.getElementById('imageUploadArea');
        const previewImg = document.getElementById('previewImg');
        
        if (previewImg && imagePreview && imageUploadArea) {
            previewImg.src = imageData;
            imagePreview.style.display = 'block';
            imageUploadArea.style.display = 'none';
        }
    }
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
    }
    // Reset form
    const exerciseNameInput = document.getElementById('exerciseName');
    const imageInput = document.getElementById('exerciseImage');
    const imagePreview = document.getElementById('imagePreview');
    const imageUploadArea = document.getElementById('imageUploadArea');
    
    if (exerciseNameInput) exerciseNameInput.value = '';
    if (imageInput) imageInput.value = '';
    if (imagePreview) imagePreview.style.display = 'none';
    if (imageUploadArea) imageUploadArea.style.display = 'block';
}

// Image handling functions with multiple compression levels
function compressImage(file, maxWidth = 600, quality = 0.6, format = 'image/jpeg') {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            // Calculate new dimensions to maintain aspect ratio
            const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;
            
            // Draw and compress
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Try WebP first (better compression), fallback to JPEG
            if (format === 'image/webp' && canvas.toBlob) {
                canvas.toBlob((webpBlob) => {
                    if (webpBlob) {
                        resolve(webpBlob);
                    } else {
                        // WebP failed, use JPEG
                        canvas.toBlob(resolve, 'image/jpeg', quality);
                    }
                }, 'image/webp', quality);
            } else {
                canvas.toBlob(resolve, 'image/jpeg', quality);
            }
        };
        
        img.src = URL.createObjectURL(file);
    });
}

// Try WebP compression first (30-50% better than JPEG)
async function compressImageWebP(file, maxWidth = 400, quality = 0.4) {
    try {
        const webpFile = await compressImage(file, maxWidth, quality, 'image/webp');
        if (webpFile && webpFile.size > 0) {
            return webpFile;
        }
    } catch (error) {
        console.log('WebP not supported, using JPEG');
    }
    // Fallback to JPEG
    return compressImage(file, maxWidth, quality, 'image/jpeg');
}

// Better quality compression for zoom viewing
async function compressImageForViewing(file) {
    // Use higher quality settings for better zoom experience
    return compressImageWebP(file, 600, 0.7); // Larger size, better quality
}

// Ultra compression for maximum storage efficiency
function compressImageUltra(file) {
    return compressImage(file, 300, 0.3); // Very small, very compressed
}

// Extreme compression for when we need maximum space
function compressImageExtreme(file) {
    return compressImage(file, 200, 0.2); // Tiny but still usable
}

// More aggressive compression for when document size is getting large
function compressImageAggressively(file) {
    return compressImage(file, 400, 0.4); // Smaller size, lower quality
}

// Save image to separate document
async function saveExerciseImage(exerciseId, imageData) {
    if (!currentUser || !db || !imageData) return false;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('images').doc(exerciseId.toString()).set({
                imageData: imageData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        console.log(`✅ Image saved separately for exercise ${exerciseId}`);
        return true;
    } catch (error) {
        console.error('Error saving image separately:', error);
        return false;
    }
}

// Load image from separate document
async function loadExerciseImage(exerciseId) {
    if (!currentUser || !db) {
        console.warn('❌ Cannot load image: No user or database');
        return null;
    }
    
    try {
        console.log(`🔍 Attempting to load image for exercise ${exerciseId}`);
        const imageDoc = await db.collection('users').doc(currentUser.uid)
            .collection('images').doc(exerciseId.toString()).get();
        
        console.log(`📄 Image document exists: ${imageDoc.exists}`);
        
        if (imageDoc.exists) {
            const data = imageDoc.data();
            console.log(`📊 Image document data:`, {
                hasImageData: !!data.imageData,
                imageDataType: typeof data.imageData,
                imageDataLength: data.imageData ? data.imageData.length : 0,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            });
            return data.imageData;
        } else {
            console.warn(`⚠️ No image document found for exercise ${exerciseId}`);
        }
        return null;
    } catch (error) {
        console.error('Error loading image:', error);
        return null;
    }
}

// Delete image from separate document
async function deleteExerciseImage(exerciseId) {
    if (!currentUser || !db) return;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('images').doc(exerciseId.toString()).delete();
        console.log(`🗑️ Image deleted for exercise ${exerciseId}`);
    } catch (error) {
        console.error('Error deleting image:', error);
    }
}

function convertImageToBase64(file) {
    return new Promise(async (resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            resolve(null);
            return;
        }
        
        // Check file size (max 5MB before compression)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image size must be less than 5MB');
            resolve(null);
            return;
        }
        
        try {
            // Use better quality compression for viewing experience
            let compressedFile = await compressImageForViewing(file);
            
            // Apply progressive compression if still too large
            if (compressedFile.size > 150 * 1024) { // 150KB limit (increased for better quality)
                compressedFile = await compressImageWebP(file, 400, 0.5);
                
                if (compressedFile.size > 100 * 1024) { // 100KB limit
                    compressedFile = await compressImageWebP(file, 300, 0.4);
                    
                    if (compressedFile.size > 80 * 1024) { // 80KB final limit
                        compressedFile = await compressImageWebP(file, 200, 0.3);
                        console.warn('Image compressed for storage - quality may be reduced for zoom');
                    }
                }
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                resolve(e.target.result);
            };
            reader.onerror = function() {
                reject(new Error('Failed to read image'));
            };
            reader.readAsDataURL(compressedFile);
        } catch (error) {
            console.error('Error compressing image:', error);
            resolve(null);
        }
    });
}

function removeImage() {
    const imageInput = document.getElementById('exerciseImage');
    const imagePreview = document.getElementById('imagePreview');
    const imageUploadArea = document.getElementById('imageUploadArea');
    
    if (imageInput) imageInput.value = '';
    if (imagePreview) imagePreview.style.display = 'none';
    if (imageUploadArea) imageUploadArea.style.display = 'block';
}

async function saveExercise() {
    const exerciseNameInput = document.getElementById('exerciseName');
    const imageInput = document.getElementById('exerciseImage');
    if (!exerciseNameInput) return;
    
    const name = exerciseNameInput.value.trim();
    if (name) {
        const sanitizedName = sanitizeInput(name);
        if (sanitizedName.length > 50) {
            alert('Exercise name must be 50 characters or less');
            return;
        }
        
        let exerciseId, exercise;
        
        if (editingExerciseId) {
            // Editing existing exercise
            exerciseId = editingExerciseId;
            const existingExercise = userData.exercises[currentExerciseCategory].find(ex => ex.id === exerciseId);
            exercise = {
                id: exerciseId,
                name: sanitizedName,
                weight: existingExercise ? existingExercise.weight : '', // Keep existing weight
                hasImage: existingExercise ? existingExercise.hasImage : false // Keep existing hasImage flag
            };
        } else {
            // Creating new exercise
            exerciseId = Date.now();
            exercise = {
                id: exerciseId,
                name: sanitizedName,
                weight: ''
            };
        }
        
        // Handle image upload (Save separately)
        let imageData = null;
        if (imageInput && imageInput.files && imageInput.files[0]) {
            console.log('Processing exercise image...');
            imageData = await convertImageToBase64(imageInput.files[0]);
            if (imageData) {
                console.log('Image processed for exercise: Base64 format');
            }
        }
        
        if (!userData.exercises[currentExerciseCategory]) {
            userData.exercises[currentExerciseCategory] = [];
        }
        
        if (editingExerciseId) {
            // Update existing exercise
            const exerciseIndex = userData.exercises[currentExerciseCategory].findIndex(ex => ex.id === exerciseId);
            if (exerciseIndex !== -1) {
                userData.exercises[currentExerciseCategory][exerciseIndex] = exercise;
                console.log('✏️ Updated existing exercise');
            }
        } else {
            // Add new exercise
            userData.exercises[currentExerciseCategory].push(exercise);
            console.log('➕ Added new exercise');
        }
        
        // Save main exercise data first
        await saveUserData();
        
        // Save image separately if it exists
        if (imageData) {
            const imageSaved = await saveExerciseImage(exerciseId, imageData);
            if (imageSaved) {
                // Update exercise to mark it has an image
                exercise.hasImage = true;
                // Update the exercise in userData array
                const exerciseIndex = userData.exercises[currentExerciseCategory].findIndex(ex => ex.id === exerciseId);
                if (exerciseIndex !== -1) {
                    userData.exercises[currentExerciseCategory][exerciseIndex].hasImage = true;
                }
                await saveUserData(); // Update the hasImage flag
                console.log('✅ Exercise and image saved successfully');
            } else {
                console.warn('⚠️ Exercise saved but image failed to save separately');
            }
        }
        
        renderExercises(currentExerciseCategory);
        closeModal();
        
        // Force a re-render to show the image
        setTimeout(() => {
            console.log('🔄 Force re-rendering exercises to load images...');
            renderExercises(currentExerciseCategory);
        }, 1000);
    }
}

function renderExercises(category) {
    const container = document.getElementById(`${category}-exercises`);
    if (!container) return;
    
    const exercises = userData.exercises?.[category] || [];
    
    if (exercises.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${category === 'push' ? '🏋️' : category === 'pull' ? '💪' : '🦵'}</div>
                <div>No exercises yet</div>
            </div>
        `;
        return;
    }
    
    // Render exercises and load images separately
    container.innerHTML = exercises.map(ex => `
        <div class="exercise-item">
            <div class="exercise-info">
                ${ex.hasImage ? `<div class="exercise-image-placeholder" id="img-${ex.id}">📷 Loading...</div>` : ''}
                <div class="exercise-details">
                    <div class="exercise-name">${sanitizeInput(ex.name)}</div>
                </div>
                <div class="weight-input-group">
                    <input type="number" class="weight-input" placeholder="Weight" 
                           value="${sanitizeForAttribute(ex.weight || '')}" 
                           onchange="updateExerciseWeight('${sanitizeForAttribute(category)}', ${ex.id}, this.value)">
                    <span>kg</span>
                </div>
                <div class="exercise-actions">
                    <button onclick="editExercise('${sanitizeForAttribute(category)}', ${ex.id})" class="edit-btn" title="Edit exercise">
                        ✏️
                    </button>
                    <button onclick="deleteExercise('${sanitizeForAttribute(category)}', ${ex.id})" class="delete-btn" title="Delete exercise">
                        🗑️
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Load images separately for exercises that have them (with caching to prevent flashing)
    const imageCache = new Map();
    
    exercises.forEach(async (ex) => {
        if (ex.hasImage) {
            const placeholder = document.getElementById(`img-${ex.id}`);
            if (!placeholder) return;
            
            // Check cache first
            if (imageCache.has(ex.id)) {
                const cachedImageData = imageCache.get(ex.id);
                placeholder.outerHTML = `<img src="${cachedImageData}" alt="${sanitizeInput(ex.name)}" class="exercise-image" onclick="openImageZoom('${cachedImageData}', '${sanitizeForAttribute(ex.name)}')" style="cursor: zoom-in;" title="Click to view fullscreen">`;
                return;
            }
            
            // Load from Firestore
            const imageData = await loadExerciseImage(ex.id);
            
            if (placeholder && imageData) {
                // Cache the image data
                imageCache.set(ex.id, imageData);
                
                // Only update if placeholder still exists (prevents flashing)
                const currentPlaceholder = document.getElementById(`img-${ex.id}`);
                if (currentPlaceholder) {
                    currentPlaceholder.outerHTML = `<img src="${imageData}" alt="${sanitizeInput(ex.name)}" class="exercise-image" onclick="openImageZoom('${imageData}', '${sanitizeForAttribute(ex.name)}')" style="cursor: zoom-in;" title="Click to view fullscreen">`;
                }
            } else if (placeholder) {
                placeholder.textContent = '❌ Image failed to load';
            }
        }
    });
}

function renderAllExercises() {
    // Always render the exercise categories
    ['push', 'pull', 'legs'].forEach(category => {
        renderExercises(category);
    });
    
    // Only initialize workout interface if no muscle group is selected or workout is not active
    if (!selectedMuscleGroup || !isWorkoutActive) {
        initializeWorkoutInterface();
    } else {
        // Preserve the current workout state
        updateMuscleGroupButtons();
        renderWorkoutExercises();
    }
}

// Workout Functions
function initializeWorkoutInterface() {
    const dateInput = document.getElementById('selectedDate');
    if (dateInput && !dateInput.value) {
        dateInput.value = selectedDate;
    }
    
    // Clear any active muscle group selection
    selectedMuscleGroup = '';
    isWorkoutActive = false;
    updateMuscleGroupButtons();
    showWorkoutPlaceholder();
}

function selectMuscleGroup(muscleGroup) {
    selectedMuscleGroup = muscleGroup;
    isWorkoutActive = true;
    hasCelebrated = false; // Reset celebration flag for new workout
    updateMuscleGroupButtons();
    loadDailyWorkout();
}

function updateMuscleGroupButtons() {
    const buttons = ['pushWorkoutBtn', 'pullWorkoutBtn', 'legsWorkoutBtn'];
    const muscleGroups = ['push', 'pull', 'legs'];
    
    buttons.forEach((btnId, index) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            if (muscleGroups[index] === selectedMuscleGroup) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

function loadDailyWorkout() {
    const dateInput = document.getElementById('selectedDate');
    if (dateInput) {
        selectedDate = dateInput.value;
        hasCelebrated = false; // Reset celebration flag for new date
    }
    
    if (!selectedMuscleGroup) {
        showWorkoutPlaceholder();
        return;
    }
    
    renderWorkoutExercises();
}

function renderWorkoutExercises() {
    const container = document.getElementById('workoutExercisesContainer');
    if (!container) return;
    
    const exercises = userData.exercises[selectedMuscleGroup] || [];
    
    if (exercises.length === 0) {
        container.innerHTML = `
            <div class="workout-placeholder">
                <div class="placeholder-icon">🏋️</div>
                <div>No ${selectedMuscleGroup} exercises added yet</div>
                <div style="margin-top: 10px; font-size: 0.9rem; color: #999;">Add some exercises in the ${selectedMuscleGroup} category above</div>
            </div>
        `;
        updateWorkoutStats(0, 0);
        return;
    }
    
    // Get daily progress for selected date and muscle group
    const dailyProgress = (userData.dailyProgress && userData.dailyProgress[selectedDate]) || {};
    
    container.innerHTML = `
        <div class="workout-exercises">
            ${exercises.map(exercise => {
                const isCompleted = dailyProgress[exercise.id] || false;
                return `
                    <div class="workout-exercise-item ${isCompleted ? 'completed' : ''}">
                        <input type="checkbox" 
                               class="workout-exercise-checkbox" 
                               ${isCompleted ? 'checked' : ''}
                               onchange="toggleWorkoutExerciseCompletion(${exercise.id}, this.checked)">
                        <div class="workout-exercise-info">
                            ${exercise.hasImage ? `<div class="exercise-image-placeholder" id="workout-img-${exercise.id}">📷 Loading...</div>` : ''}
                            <div class="workout-exercise-details">
                                <div class="workout-exercise-name ${isCompleted ? 'completed' : ''}">${sanitizeInput(exercise.name)}</div>
                                <div class="workout-exercise-weight">${exercise.weight ? exercise.weight + ' kg' : 'No weight set'}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    // Load images separately for exercises that have them
    exercises.forEach(async (exercise) => {
        if (exercise.hasImage) {
            try {
                const imageData = await loadExerciseImage(exercise.id);
                if (imageData) {
                    const placeholder = document.getElementById(`workout-img-${exercise.id}`);
                    if (placeholder) {
                        placeholder.outerHTML = `<img src="${imageData}" alt="${sanitizeInput(exercise.name)}" class="exercise-image" onclick="openImageZoom('${imageData}', '${sanitizeForAttribute(exercise.name)}')" style="cursor: zoom-in;" title="Click to view fullscreen">`;
                    }
                }
            } catch (error) {
                console.error('Error loading workout exercise image:', error);
                const placeholder = document.getElementById(`workout-img-${exercise.id}`);
                if (placeholder) {
                    placeholder.style.display = 'none';
                }
            }
        }
    });
    
    updateWorkoutStats();
}

function showWorkoutPlaceholder() {
    const container = document.getElementById('workoutExercisesContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="workout-placeholder">
            <div class="placeholder-icon">🏋️</div>
            <div class="placeholder-text">Select a date and muscle group to start your workout</div>
        </div>
    `;
    
    updateWorkoutStats(0, 0);
}

function toggleWorkoutExerciseCompletion(exerciseId, isCompleted) {
    // Ensure dailyProgress exists
    if (!userData.dailyProgress) {
        userData.dailyProgress = {};
    }
    
    if (!userData.dailyProgress[selectedDate]) {
        userData.dailyProgress[selectedDate] = {};
    }
    
    userData.dailyProgress[selectedDate][exerciseId] = isCompleted;
    saveUserData();
    updateWorkoutStats();
    
    // Update visual state
    const exerciseItem = event.target.closest('.workout-exercise-item');
    if (exerciseItem) {
        const exerciseName = exerciseItem.querySelector('.workout-exercise-name');
        if (isCompleted) {
            exerciseItem.classList.add('completed');
            if (exerciseName) exerciseName.classList.add('completed');
        } else {
            exerciseItem.classList.remove('completed');
            if (exerciseName) exerciseName.classList.remove('completed');
        }
    }
}

function updateWorkoutStats() {
    if (!selectedMuscleGroup) {
        updateElement('completedCount', 0);
        updateElement('totalCount', 0);
        updateElement('completionRate', '0%');
        return;
    }
    
    const exercises = userData.exercises[selectedMuscleGroup] || [];
    const dailyProgress = (userData.dailyProgress && userData.dailyProgress[selectedDate]) || {};
    
    const completedCount = exercises.filter(ex => dailyProgress[ex.id]).length;
    const totalCount = exercises.length;
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    updateElement('completedCount', completedCount);
    updateElement('totalCount', totalCount);
    updateElement('completionRate', completionRate + '%');
    
    // Check for 100% completion and trigger celebration
    if (completionRate === 100 && totalCount > 0 && !hasCelebrated) {
        hasCelebrated = true;
        triggerCelebration();
    }
}

function goToToday() {
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('selectedDate');
    if (dateInput) {
        dateInput.value = today;
        selectedDate = today;
        loadDailyWorkout();
    }
}

async function updateExerciseWeight(category, id, weight) {
    const exercise = userData.exercises[category].find(ex => ex.id === id);
    if (exercise) {
        exercise.weight = weight;
        await saveUserData();
    }
}

async function deleteExercise(category, id) {
    if (confirm('Remove this exercise?')) {
        // Find the exercise to check if it has an image
        const exercise = userData.exercises[category].find(ex => ex.id === id);
        
        // Remove from main document
        userData.exercises[category] = userData.exercises[category].filter(ex => ex.id !== id);
        await saveUserData();
        
        // Delete image separately if it exists
        if (exercise && exercise.hasImage) {
            await deleteExerciseImage(id);
        }
        
        renderExercises(category);
    }
}

async function resetProgress() {
    if (confirm('Reset your progress tracking? This will clear your current progress data.')) {
        // Clear daily progress data
        userData.dailyProgress = {};
        await saveUserData();
        updateStats();
        renderAllExercises();
    }
}

// Privacy functions
async function downloadMyData() {
    const dataToDownload = isGuestMode ? userData : await getFirebaseData();
    
    const json = JSON.stringify(dataToDownload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-gym-data.json';
    a.click();
    
    URL.revokeObjectURL(url);
}

async function getFirebaseData() {
    if (!currentUser || !db) return userData;
    
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        return doc.data();
    } catch (error) {
        console.error('Error fetching data:', error);
        return userData;
    }
}

function showPrivacyInfo() {
    alert(`Privacy Info:\n\n• Your data is stored securely in Firebase\n• Only you can access your data\n• You can download or delete your data anytime\n• We never share your data with third parties\n• Guest mode stores data locally only`);
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('modal');
        if (modal && modal.classList.contains('active')) {
            closeModal();
        }
    }
});

// Celebration Functions
function triggerCelebration() {
    // Show celebration modal
    const celebrationModal = document.getElementById('celebrationModal');
    if (celebrationModal) {
        celebrationModal.classList.add('active');
    }
    
    // Start confetti animation
    createConfetti();
    
    // Play celebration sound (if supported)
    playCelebrationSound();
}

function createConfetti() {
    const confettiContainer = document.getElementById('confetti-container');
    if (!confettiContainer) return;
    
    // Clear existing confetti
    confettiContainer.innerHTML = '';
    
    // Create confetti pieces
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.animationDelay = Math.random() * 3 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        confettiContainer.appendChild(confetti);
    }
    
    // Remove confetti after animation
    setTimeout(() => {
        confettiContainer.innerHTML = '';
    }, 5000);
}

function playCelebrationSound() {
    // Create a simple celebration sound using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        // Sound not supported, continue silently
        console.log('Audio not supported');
    }
}

function closeCelebration() {
    const celebrationModal = document.getElementById('celebrationModal');
    if (celebrationModal) {
        celebrationModal.classList.remove('active');
    }
    
    // Clear confetti
    const confettiContainer = document.getElementById('confetti-container');
    if (confettiContainer) {
        confettiContainer.innerHTML = '';
    }
}

function shareAchievement() {
    const muscleGroupName = selectedMuscleGroup.charAt(0).toUpperCase() + selectedMuscleGroup.slice(1);
    const shareText = `🎉 Just completed my ${muscleGroupName} workout with 100% progress! 💪 #GymTracker #FitnessGoals`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Workout Complete!',
            text: shareText,
            url: window.location.href
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareText).then(() => {
            alert('Achievement copied to clipboard! 📋');
        }).catch(() => {
            // Fallback: show text for manual copy
            prompt('Copy this achievement text:', shareText);
        });
    }
}

function resetUserData() {
    if (confirm('This will reset all your data to a clean state. Are you sure?')) {
        userData = {
            stats: {
                weight: '',
                height: '',
                goalWeight: '',
                bmi: ''
            },
            exercises: {
                push: [],
                pull: [],
                legs: []
            },
            dailyProgress: {}
        };
        
        // Save the clean data
        saveUserData();
        
        // Update the UI
        updateUIFromData();
        
        console.log('User data has been reset to clean state');
        alert('Data has been reset successfully!');
    }
}


function openImageZoom(imageSrc, exerciseName) {
    const modal = document.getElementById('imageZoomModal');
    const modalImg = document.getElementById('zoomedImage');
    const caption = document.getElementById('imageCaption');
    
    if (modal && modalImg) {
        modal.classList.add('show');
        modalImg.src = imageSrc;
        
        // Reset any previous scaling
        modalImg.style.transform = 'scale(1)';
        currentScale = 1;
        
        // Auto-scale small images to be more visible
        modalImg.onload = function() {
            const naturalWidth = this.naturalWidth;
            const naturalHeight = this.naturalHeight;
            const viewportWidth = window.innerWidth * 0.9;
            const viewportHeight = window.innerHeight * 0.9;
            
            console.log(`📊 Image dimensions: ${naturalWidth}x${naturalHeight}`);
            
            // If image is very small, scale it up
            if (naturalWidth < 400 || naturalHeight < 400) {
                const scaleX = Math.min(viewportWidth / naturalWidth, 3); // Max 3x scale
                const scaleY = Math.min(viewportHeight / naturalHeight, 3);
                const autoScale = Math.min(scaleX, scaleY, 3);
                
                if (autoScale > 1) {
                    this.style.transform = `scale(${autoScale})`;
                    currentScale = autoScale;
                    console.log(`🔍 Auto-scaled image to ${autoScale.toFixed(1)}x`);
                }
            }
        };
        
        if (caption) {
            caption.textContent = exerciseName || '';
        }
        
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
    }
}

function closeImageZoom() {
    const modal = document.getElementById('imageZoomModal');
    const modalImg = document.getElementById('zoomedImage');
    
    if (modal) {
        modal.classList.remove('show');
        // Restore body scroll
        document.body.style.overflow = '';
    }
    
    // Reset image scale for next use
    if (modalImg) {
        modalImg.style.transform = 'scale(1)';
        currentScale = 1;
    }
}

// Close image zoom on escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeImageZoom();
    }
});

// Add mouse wheel zoom support
document.addEventListener('DOMContentLoaded', function() {
    const imageZoomModal = document.getElementById('imageZoomModal');
    const zoomedImage = document.getElementById('zoomedImage');
    
    if (imageZoomModal && zoomedImage) {
        imageZoomModal.addEventListener('wheel', function(e) {
            if (imageZoomModal.classList.contains('show')) {
                e.preventDefault();
                
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                currentScale = Math.max(0.5, Math.min(5, currentScale + delta));
                
                zoomedImage.style.transform = `scale(${currentScale})`;
                console.log(`🔍 Zoom level: ${currentScale.toFixed(1)}x`);
            }
        });
    }
});

// Add touch zoom support for mobile
let touchStartDistance = 0;
let currentScale = 1;

document.addEventListener('DOMContentLoaded', function() {
    const zoomedImage = document.getElementById('zoomedImage');
    
    if (zoomedImage) {
        zoomedImage.addEventListener('touchstart', function(e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                touchStartDistance = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
            }
        });
        
        zoomedImage.addEventListener('touchmove', function(e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                const touchDistance = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                
                const scale = Math.max(1, Math.min(3, (touchDistance / touchStartDistance) * currentScale));
                this.style.transform = `scale(${scale})`;
            }
        });
        
        zoomedImage.addEventListener('touchend', function(e) {
            if (e.touches.length < 2) {
                const computedStyle = window.getComputedStyle(this);
                const matrix = new DOMMatrix(computedStyle.transform);
                currentScale = matrix.a; // Get the current scale
            }
        });
    }
});

// Make functions available globally for onclick handlers
window.signInWithGoogle = signInWithGoogle;
window.signInWithEmail = signInWithEmail;
window.signUpWithEmail = signUpWithEmail;
window.continueAsGuest = continueAsGuest;
window.toggleEmailForm = toggleEmailForm;
window.signOut = signOut;
window.openModal = openModal;
window.closeModal = closeModal;
window.saveExercise = saveExercise;
window.updateExerciseWeight = updateExerciseWeight;
window.deleteExercise = deleteExercise;
window.resetProgress = resetProgress;
window.downloadMyData = downloadMyData;
window.showPrivacyInfo = showPrivacyInfo;
window.removeImage = removeImage;
window.loadDailyWorkout = loadDailyWorkout;
window.goToToday = goToToday;
window.selectMuscleGroup = selectMuscleGroup;
window.toggleWorkoutExerciseCompletion = toggleWorkoutExerciseCompletion;
window.closeCelebration = closeCelebration;
window.shareAchievement = shareAchievement;
window.resetUserData = resetUserData;
window.openImageZoom = openImageZoom;
window.closeImageZoom = closeImageZoom;
window.editExercise = editExercise;
