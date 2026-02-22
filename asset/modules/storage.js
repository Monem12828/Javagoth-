// assets/modules/storage.js

import { STATE } from './state.js';
import { showToast } from './utils.js';

const CONVERSATIONS_KEY = 'javagoat_conversations';
const LOCAL_SETTINGS_KEY = 'javagoat_local_settings';

/**
 * Loads initial state from localStorage.
 * For guests, this is their primary storage. For logged-in users, it's a fallback/cache.
 */
export function loadInitialState() {
    log('info', 'Loading initial state from localStorage...');
    loadConversations();
    loadLocalSettings();
}

/**
 * Loads conversations from localStorage into STATE.
 */
export function loadConversations() {
    try {
        const storedConversations = localStorage.getItem(CONVERSATIONS_KEY);
        if (storedConversations) {
            STATE.conversations = JSON.parse(storedConversations);
            log('info', `Loaded ${STATE.conversations.length} conversations.`);
            // Sort conversations by lastUpdated descending
            STATE.conversations.sort((a, b) => b.lastUpdated - a.lastUpdated);
        } else {
            STATE.conversations = [];
            log('info', 'No conversations found in localStorage.');
        }
    } catch (e) {
        log('error', 'Error loading conversations from localStorage:', e);
        showToast('error', 'Failed to load conversations from local storage.');
        STATE.conversations = []; // Reset to empty to prevent corrupted data issues
    }
}

/**
 * Saves all conversations from STATE to localStorage.
 */
export function saveConversations() {
    try {
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(STATE.conversations));
        log('info', `Saved ${STATE.conversations.length} conversations to localStorage.`);
    } catch (e) {
        log('error', 'Error saving conversations to localStorage:', e);
        showToast('error', 'Failed to save conversations to local storage.');
    }
}

/**
 * Clears all conversations from localStorage and STATE.
 */
export function clearConversations() {
    try {
        localStorage.removeItem(CONVERSATIONS_KEY);
        STATE.conversations = [];
        STATE.ui.activeConversationId = null;
        log('info', 'All conversations cleared from localStorage and state.');
    } catch (e) {
        log('error', 'Error clearing conversations from localStorage:', e);
        showToast('error', 'Failed to clear conversations from local storage.');
    }
}

/**
 * Saves a single conversation. If it's a new conversation, it will be added.
 * If it exists, it will be updated.
 * @param {Object} conversation - The conversation object to save.
 */
export function saveConversation(conversation) {
    const index = STATE.conversations.findIndex(c => c.id === conversation.id);
    if (index !== -1) {
        STATE.conversations[index] = conversation;
    } else {
        STATE.conversations.unshift(conversation); // Add new conversation to the top
    }
    conversation.lastUpdated = Date.now(); // Update timestamp
    saveConversations();
}

/**
 * Deletes a conversation by ID.
 * @param {string} conversationId - The ID of the conversation to delete.
 */
export function deleteConversation(conversationId) {
    STATE.conversations = STATE.conversations.filter(c => c.id !== conversationId);
    if (STATE.ui.activeConversationId === conversationId) {
        STATE.ui.activeConversationId = null; // Clear active if deleted
    }
    saveConversations();
}

/**
 * Loads local settings from localStorage into STATE.settings.
 * These are used as a fallback for guests or when cloud settings aren't available.
 */
export function loadLocalSettings() {
    try {
        const storedSettings = localStorage.getItem(LOCAL_SETTINGS_KEY);
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            // Merge with default settings to ensure all properties exist
            STATE.settings = { ...STATE.settings, ...parsedSettings };
            STATE.ui.theme = STATE.settings.theme; // Ensure UI theme matches
            log('info', 'Loaded local settings:', STATE.settings);
        } else {
            log('info', 'No local settings found, using defaults.');
        }
    } catch (e) {
        log('error', 'Error loading local settings from localStorage:', e);
        showToast('error', 'Failed to load local settings.');
    }
}

/**
 * Saves current STATE.settings to localStorage.
 */
export function saveLocalSettings() {
    try {
        localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(STATE.settings));
        log('info', 'Saved local settings to localStorage.');
    } catch (e) {
        log('error', 'Error saving local settings to localStorage:', e);
        showToast('error', 'Failed to save local settings.');
    }
}

/**
 * Clears local settings from localStorage and resets STATE.settings to defaults.
 */
export function clearLocalSettings() {
    try {
        localStorage.removeItem(LOCAL_SETTINGS_KEY);
        // Reset to default settings defined in state.js
        STATE.settings = {
            openrouterKey: '',
            modelId: 'openai/gpt-4o-mini',
            systemPrompt: 'You are JavaGoat, a helpful and secure AI assistant. Provide concise and accurate responses, format code blocks with markdown, and be friendly.',
            imageProvider: 'pollinations',
            imageModel: 'stabilityai/stable-diffusion-xl-base-1.0',
            theme: 'dark',
        };
        STATE.ui.theme = 'dark'; // Reset UI theme as well
        log('info', 'Local settings cleared and reset to defaults.');
    } catch (e) {
        log('error', 'Error clearing local settings from localStorage:', e);
        showToast('error', 'Failed to clear local settings.');
    }
}

/**
 * Clears any sensitive guest-related data from localStorage.
 * This is primarily for when a guest user logs in with Google.
 */
export function clearSensitiveGuestData() {
    // For JavaGoat, conversations and local settings are the main guest data.
    // If a guest logs in, their local conversations are effectively replaced by cloud sync logic.
    // However, the prompt says "Keep local guest chats only if user is guest".
    // So, if a guest logs IN as a *Firebase user*, their guest chats are cleared.
    // If a Firebase user logs OUT, their Firebase chats are cleared, but local guest chats (if any) are kept
    // if they were previously a guest and didn't clear them. This logic is complex.
    // Simplification: When a user *logs out* (from Firebase), we clear *all* local state to ensure a clean slate,
    // unless they explicitly chose "Continue as Guest" from the login screen, in which case their local data is preserved.
    // The `signOutUser` function in `firebase.js` handles this.
    // This `clearSensitiveGuestData` function is called when a guest user transitions to a logged-in user.
    log('info', 'Clearing guest data (conversations and local settings) as user is logging in.');
    clearConversations();
    clearLocalSettings();
}
