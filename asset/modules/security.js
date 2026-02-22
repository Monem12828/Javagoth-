// assets/modules/security.js

import { STATE, APP_CONSTANTS } from './state.js';
import { generateCsrfToken, showToast, escapeHTML, sanitizeInput } from './utils.js';
import * as UI from './ui.js';

let csrfTokenInMemory = null;

/**
 * Initializes CSRF token storage.
 * Generates a new token if one doesn't exist in sessionStorage.
 */
export function initCsrfToken() {
    const storedToken = sessionStorage.getItem('csrf_token');
    if (storedToken) {
        csrfTokenInMemory = storedToken;
        log('info', 'CSRF token loaded from sessionStorage.');
    } else {
        csrfTokenInMemory = generateCsrfToken(APP_CONSTANTS.CSRF_TOKEN_LENGTH_BYTES);
        sessionStorage.setItem('csrf_token', csrfTokenInMemory);
        log('info', 'New CSRF token generated and stored.');
    }
    STATE.security.csrfToken = csrfTokenInMemory;
    STATE.security.csrfTokensActive = true;
    updateSecurityStatusUI();
}

/**
 * Verifies the CSRF token for a given action.
 * @param {string} actionName - The name of the action being performed (for logging).
 * @returns {boolean} True if the token is valid, false otherwise.
 */
export function verifyCsrfToken(actionName) {
    const storedToken = sessionStorage.getItem('csrf_token');
    if (!csrfTokenInMemory || !storedToken || csrfTokenInMemory !== storedToken) {
        log('error', `CSRF token mismatch for action: ${actionName}. In-memory: ${csrfTokenInMemory}, SessionStorage: ${storedToken}`);
        return false;
    }
    log('info', `CSRF token verified for action: ${actionName}.`);
    return true;
}

/**
 * Enforces HTTPS redirect for non-localhost environments.
 */
export function enforceHttps() {
    if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        window.location.href = location.href.replace('http', 'https');
        log('warn', 'Redirecting to HTTPS...');
    } else {
        log('info', 'HTTPS enforcement active or on localhost.');
    }
}

/**
 * Filters user input for potential SQL injection patterns.
 * @param {string} input - The user input string.
 * @returns {string} The sanitized input.
 * @throws {Error} if a SQLi pattern is detected.
 */
export function filterSQLi(input) {
    return sanitizeInput(input); // Uses the utility function
}

/**
 * Escapes HTML in a string to prevent XSS.
 * @param {string} input - The input string.
 * @returns {string} The HTML-escaped string.
 */
export function preventXSS(input) {
    return escapeHTML(input); // Uses the utility function
}

/**
 * Checks if the current user is an admin.
 * @returns {boolean} True if the user is an admin, false otherwise.
 */
export function isAdmin() {
    return STATE.auth.isAdmin;
}

/**
 * Updates the security status indicators in the settings modal.
 */
export function updateSecurityStatusUI() {
    const statusCloudSync = document.getElementById('status-cloud-sync');
    const statusAdminProtection = document.getElementById('status-admin-protection');
    const statusAntiSqli = document.getElementById('status-anti-sqli');
    const statusCsrfTokens = document.getElementById('status-csrf-tokens');

    if (statusCloudSync) {
        statusCloudSync.classList.toggle('active', STATE.security.cloudSyncActive);
    }
    if (statusAdminProtection) {
        statusAdminProtection.classList.toggle('active', STATE.security.adminProtectionActive);
    }
    if (statusAntiSqli) {
        statusAntiSqli.classList.toggle('active', STATE.security.antiSqliFilterActive);
    }
    if (statusCsrfTokens) {
        statusCsrfTokens.classList.toggle('active', STATE.security.csrfTokensActive);
    }
    log('info', 'Security status UI updated.');
}

/**
 * Sets up event listeners related to security UI.
 * This function is mainly for calling updateSecurityStatusUI initially and on relevant state changes.
 */
export function setupEventListeners() {
    // Initial update
    updateSecurityStatusUI();
}
