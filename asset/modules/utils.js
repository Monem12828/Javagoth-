// assets/modules/utils.js

import { APP_CONSTANTS } from './state.js';

/**
 * Shows a toast notification.
 * @param {'success'|'error'|'info'|'warning'} type - Type of toast.
 * @param {string} message - Message to display.
 */
export function showToast(type, message) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.error('Toast container not found!');
        return;
    }

    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    toast.innerHTML = `<span class="toast-message">${escapeHTML(message)}</span>`;

    toastContainer.appendChild(toast);

    // Force reflow to ensure animation plays
    void toast.offsetWidth;

    setTimeout(() => {
        toast.remove();
    }, APP_CONSTANTS.TOAST_DURATION); // Remove after animation + duration
}

/**
 * Debounces a function call.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The debounce delay in milliseconds.
 * @returns {Function} The debounced function.
 */
export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

/**
 * Generates a cryptographically secure random string for CSRF token.
 * @param {number} bytes - The number of bytes to generate.
 * @returns {string} A hexadecimal string.
 */
export function generateCsrfToken(bytes) {
    const array = new Uint8Array(bytes);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Escapes HTML entities in a string to prevent XSS.
 * @param {string} str - The input string.
 * @returns {string} The escaped string.
 */
export function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

/**
 * Sanitizes user input to prevent SQL injection patterns.
 * This is a client-side filter and should be complemented by server-side validation.
 * @param {string} input - The user input string.
 * @returns {string} The sanitized string.
 * @throws {Error} If a potential SQL injection pattern is detected.
 */
export function sanitizeInput(input) {
    // Common SQL injection patterns
    const sqlInjectionPatterns = [
        /(%27|')(\s*|\+|%2b)or(\s*|\+|%2b)/gmi, // ' or
        /(--|#|\/\*|\*\/)/gmi, // SQL comments
        /(union|select|insert|update|delete|drop|alter|create|truncate)\s+/gmi, // DDL/DML keywords
        /(xp_cmdshell|exec|execute|sp_configure)/gmi, // Stored procedures/commands
        /(\b(and|or)\b\s+.*\s*(=|<|>|like|in)\s*.*)/gmi, // Generic boolean-based
        /(\bwaitfor\b|\bdelay\b)/gmi, // Time-based
        /(benchmark|pg_sleep)/gmi, // Benchmark/sleep functions
        /(\bcast\b|\bconvert\b)/gmi, // Type conversion functions
        /(information_schema|sys.objects|sys.tables)/gmi, // Schema access
    ];

    for (const pattern of sqlInjectionPatterns) {
        if (pattern.test(input)) {
            log('warn', 'SQLi detected:', input);
            throw new Error('Potential SQL injection attempt detected. Please remove suspicious characters.');
        }
    }
    return input;
}

/**
 * Truncates a string to a maximum length and appends an ellipsis if truncated.
 * @param {string} str - The input string.
 * @param {number} maxLength - The maximum allowed length.
 * @returns {string} The truncated string.
 */
export function truncateText(str, maxLength) {
    if (str.length <= maxLength) {
        return str;
    }
    return str.substring(0, maxLength - 3) + '...';
}

/**
 * Formats a timestamp into a human-readable date.
 * @param {number} timestamp - Unix timestamp in milliseconds.
 * @returns {string} Formatted date string.
 */
export function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();

    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 1 && date.getDate() === now.getDate()) {
        return 'Today';
    } else if (diffDays <= 2 && date.getDate() === now.getDate() - 1) {
        return 'Yesterday';
    } else if (diffDays <= 7) {
        return 'This Week';
    } else {
        return 'Older';
    }
}
