// assets/app.js

import { STATE } from './modules/state.js';
import * as Auth from './modules/auth.js';
import * as UI from './modules/ui.js';
import * as Storage from './modules/storage.js';
import * as Chat from './modules/chat.js';
import * as ImageGen from './modules/image.js';
import * as Settings from './modules/settings.js';
import * as Security from './modules/security.js';
import { showToast, debounce } from './modules/utils.js';
import * as Cloud from './modules/cloud.js';

// --- Global Setup ---
const DEBUG_MODE = true; // Set to false for production to disable console logs

if (DEBUG_MODE) {
    console.log("JavaGoat App: Debug mode active.");
}

// Global logger
window.log = (level, ...args) => {
    if (DEBUG_MODE) {
        if (level === 'error') console.error(...args);
        else if (level === 'warn') console.warn(...args);
        else console.log(...args);
    }
};

// Initialize Marked.js and Highlight.js
marked.use(markedHighlight.MarkedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    }
}));
marked.use({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Render `\n` as `<br>`
    sanitize: true, // Sanitize HTML output to prevent XSS (basic)
    // For more robust XSS, a dedicated library like DOMPurify would be used,
    // but the prompt explicitly forbids extra dependencies.
    // We rely on marked's sanitize and our own input escaping.
});


// DOM Elements
const elements = {
    loginScreen: document.getElementById('login-screen'),
    googleLoginBtn: document.getElementById('google-login-btn'),
    guestLoginBtn: document.getElementById('guest-login-btn'),
    mainApp: document.getElementById('main-app'),
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    menuToggleBtn: document.getElementById('menu-toggle-btn'),
    newChatBtn: document.getElementById('new-chat-btn'),
    conversationSearch: document.getElementById('conversation-search'),
    conversationHistory: document.getElementById('conversation-history'),
    settingsBtn: document.getElementById('settings-btn'),
    clearAllChatsBtn: document.getElementById('clear-all-chats-btn'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    userEmail: document.getElementById('user-email'),
    adminBadge: document.getElementById('admin-badge'),
    chatTitle: document.getElementById('chat-title'),
    modelBadge: document.getElementById('model-badge'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    chatArea: document.getElementById('chat-area'),
    welcomeScreen: document.getElementById('welcome-screen'),
    suggestionCardsGrid: document.querySelector('.suggestion-cards-grid'),
    messageList: document.getElementById('message-list'),
    typingIndicator: document.getElementById('typing-indicator'),
    chatInput: document.getElementById('chat-input'),
    chatModeBtn: document.getElementById('chat-mode-btn'),
    imageModeBtn: document.getElementById('image-mode-btn'),
    stopBtn: document.getElementById('stop-btn'),
    sendBtn: document.getElementById('send-btn'),
    settingsModal: document.getElementById('settings-modal'),
    confirmationModal: document.getElementById('confirmation-modal'),
    fullscreenImageModal: document.getElementById('fullscreen-image-modal'),
};

// --- Initialization Function ---
async function initializeApp() {
    log('info', 'Initializing JavaGoat App...');

    // 1. Enforce HTTPS
    Security.enforceHttps();

    // 2. Initialize Firebase (Auth and DB)
    Auth.initFirebase();

    // 3. Initialize CSRF token
    Security.initCsrfToken();

    // 4. Load local state (conversations, settings fallback)
    Storage.loadInitialState();

    // 5. Setup UI event listeners
    UI.setupEventListeners(elements);
    Chat.setupEventListeners(elements);
    ImageGen.setupEventListeners(elements);
    Settings.setupEventListeners(elements);
    Security.setupEventListeners(); // For security status UI

    // 6. Attach global event handlers
    attachGlobalEventListeners();

    // 7. Handle Firebase Auth state changes
    Auth.onAuthStateChanged(async (user) => {
        log('info', 'Auth state changed:', user ? user.email : 'Logged out');
        if (user) {
            STATE.auth.isLoggedIn = true;
            STATE.auth.isGuest = false;
            STATE.auth.user = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL
            };
            STATE.auth.isAdmin = (user.email === Auth.ADMIN_EMAIL);
            log('info', 'User is admin:', STATE.auth.isAdmin);

            // Fetch cloud settings for logged-in users
            await Cloud.listenToCloudSettings();
            await Settings.applySettingsToUI(); // Apply settings loaded from cloud

            UI.renderApp(elements);
            UI.updateUserProfile(elements);
            UI.updateAdminBadge(elements);
            UI.updateChatHeader(); // Update model badge
            Settings.updateSettingsPanelState(elements); // Enable/disable settings based on admin status
            Security.updateSecurityStatusUI(); // Update security status
        } else {
            // User logged out or is a guest
            STATE.auth.isLoggedIn = false;
            STATE.auth.user = null;
            STATE.auth.isAdmin = false;
            Cloud.stopListeningToCloudSettings(); // Stop RTDB listener

            if (!STATE.auth.isGuest) { // If it was a full logout, not just switching to guest
                Storage.clearSensitiveGuestData(); // Clear only if not a guest
                Storage.loadInitialState(); // Reload local settings/conversations for a clean state
            }

            // Fallback to local settings for guests/logged out
            Settings.loadLocalSettings();
            Settings.applySettingsToUI(); // Apply local settings
            UI.renderLogin(elements);
            UI.updateUserProfile(elements);
            UI.updateAdminBadge(elements);
            UI.updateChatHeader(); // Update model badge
            Settings.updateSettingsPanelState(elements); // Disable settings for guests
            Security.updateSecurityStatusUI(); // Update security status
        }
    });

    // Initial render based on current state (might be guest or awaiting auth check)
    if (STATE.auth.isGuest) {
        UI.renderApp(elements);
        UI.updateUserProfile(elements);
        UI.updateAdminBadge(elements);
        UI.updateChatHeader();
        Settings.updateSettingsPanelState(elements);
        Security.updateSecurityStatusUI();
    } else if (!Auth.isAuthChecked) {
        // Show loading or login screen until Firebase auth state is resolved
        UI.renderLogin(elements);
    }
}

function attachGlobalEventListeners() {
    // Chat Input Auto-Resize
    elements.chatInput.addEventListener('input', UI.autoResizeChatInput);
    UI.autoResizeChatInput(); // Initial resize

    // Send on Enter (Shift+Enter for newline)
    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            elements.sendBtn.click();
        }
    });

    // Conversation Search Debounce
    elements.conversationSearch.addEventListener('input', debounce((e) => {
        UI.renderConversationHistory(elements.conversationHistory, e.target.value);
    }, 300));

    // Suggestion Card Clicks
    elements.suggestionCardsGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.suggestion-card');
        if (card) {
            const prompt = card.dataset.prompt;
            elements.chatInput.value = prompt;
            UI.autoResizeChatInput();
            elements.chatInput.focus();
        }
    });

    // Theme Toggle
    elements.themeToggleBtn.addEventListener('click', UI.toggleTheme);

    // Logout Button
    elements.logoutBtn.addEventListener('click', async () => {
        await Auth.signOutUser();
    });

    // New Chat Button
    elements.newChatBtn.addEventListener('click', () => {
        Chat.startNewConversation();
        UI.renderApp(elements);
    });

    // Clear All Chats Button
    elements.clearAllChatsBtn.addEventListener('click', () => {
        UI.showConfirmationModal(
            'Clear All Chats',
            'Are you sure you want to clear all conversations? This action cannot be undone.',
            async () => {
                if (!Security.verifyCsrfToken('clear_all_chats')) {
                    showToast('error', 'Security error: CSRF token mismatch.');
                    return;
                }
                Chat.clearAllConversations();
                UI.renderApp(elements);
                showToast('success', 'All conversations cleared.');
            }
        );
    });
}

// Start the application
initializeApp();
