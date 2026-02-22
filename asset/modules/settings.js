// assets/modules/settings.js

import { STATE, APP_CONSTANTS } from './state.js';
import * as Cloud from './cloud.js';
import * as Storage from './storage.js';
import * as Security from './security.js';
import * as UI from './ui.js';
import { showToast } from './utils.js';

let elements; // Store references to settings panel elements

/**
 * Sets up event listeners for the settings panel.
 * @param {Object} domElements - Object containing references to relevant DOM elements.
 */
export function setupEventListeners(domElements) {
    elements = domElements;

    elements.settingsBtn.addEventListener('click', () => {
        UI.showSettingsModal(elements.settingsModal);
        loadSettingsToUI(); // Load current settings to modal fields
        updateSettingsPanelState(); // Set field enable/disable/masking
        Security.updateSecurityStatusUI(); // Ensure security status is up-to-date
    });

    elements.settingsModal.querySelector('.close-modal-btn').addEventListener('click', () => {
        UI.hideSettingsModal(elements.settingsModal);
    });

    elements.settingsModal.querySelector('#save-settings-btn').addEventListener('click', saveSettings);

    elements.settingsModal.querySelector('#theme-selector').addEventListener('click', (e) => {
        const themeBtn = e.target.closest('.theme-btn');
        if (themeBtn) {
            const theme = themeBtn.dataset.theme;
            STATE.settings.theme = theme;
            STATE.ui.theme = theme;
            document.documentElement.className = `theme-${theme}`; // Apply theme class to <html>
            document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
            themeBtn.classList.add('active');
            // Update highlight.js theme
            const highlightLight = document.getElementById('highlight-light-theme');
            const highlightDark = document.querySelector('link[href*="atom-one-dark"]');
            if (theme === 'light') {
                highlightLight.disabled = false;
                highlightDark.disabled = true;
            } else {
                highlightLight.disabled = true;
                highlightDark.disabled = false;
            }
        }
    });

    elements.settingsModal.querySelector('#image-provider').addEventListener('change', (e) => {
        const provider = e.target.value;
        STATE.settings.imageProvider = provider;
        updateOpenRouterImageModelVisibility();
    });

    // Toggle password visibility for sensitive fields
    elements.settingsModal.querySelectorAll('.toggle-password-visibility').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = elements.settingsModal.querySelector(`#${targetId}`);
            if (input.type === 'password') {
                input.type = 'text';
                btn.querySelector('.eye-open').classList.add('hidden');
                btn.querySelector('.eye-closed').classList.remove('hidden');
            } else {
                input.type = 'password';
                btn.querySelector('.eye-open').classList.remove('hidden');
                btn.querySelector('.eye-closed').classList.add('hidden');
            }
        });
    });
}

/**
 * Loads current settings from STATE to the settings modal UI.
 */
export function loadSettingsToUI() {
    if (!elements) return;

    elements.settingsModal.querySelector('#openrouter-api-key').value = STATE.settings.openrouterKey;
    elements.settingsModal.querySelector('#model-id').value = STATE.settings.modelId;
    elements.settingsModal.querySelector('#system-prompt').value = STATE.settings.systemPrompt;
    elements.settingsModal.querySelector('#image-provider').value = STATE.settings.imageProvider;
    elements.settingsModal.querySelector('#openrouter-image-model').value = STATE.settings.imageModel;

    // Set active theme button
    elements.settingsModal.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.dataset.theme === STATE.settings.theme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    updateOpenRouterImageModelVisibility();
    updateApiStatus();
    log('info', 'Settings loaded into UI.');
}

/**
 * Applies current settings from STATE to the application's overall UI and functionality.
 * This is called after loading from local storage or cloud.
 */
export function applySettingsToUI() {
    // Apply theme
    document.documentElement.className = `theme-${STATE.ui.theme}`;
    const highlightLight = document.getElementById('highlight-light-theme');
    const highlightDark = document.querySelector('link[href*="atom-one-dark"]');
    if (STATE.ui.theme === 'light') {
        if (highlightLight) highlightLight.disabled = false;
        if (highlightDark) highlightDark.disabled = true;
    } else {
        if (highlightLight) highlightLight.disabled = true;
        if (highlightDark) highlightDark.disabled = false;
    }

    // Update model badge (if elements are available)
    if (elements && elements.modelBadge) {
        elements.modelBadge.textContent = `${STATE.settings.modelId} `;
        const dot = document.createElement('span');
        dot.classList.add('pulsing-dot');
        elements.modelBadge.appendChild(dot);
    }

    log('info', 'Settings applied to UI.');
}

/**
 * Updates the state of settings panel elements (disabled, masked) based on admin status.
 */
export function updateSettingsPanelState() {
    if (!elements) return;

    const isAdminUser = Security.isAdmin();
    log('info', 'Updating settings panel state. Is Admin:', isAdminUser);

    const sensitiveInputs = [
        elements.settingsModal.querySelector('#openrouter-api-key'),
        elements.settingsModal.querySelector('#model-id'),
        elements.settingsModal.querySelector('#system-prompt'),
    ];
    const imageProviderSelect = elements.settingsModal.querySelector('#image-provider');
    const openrouterImageModelInput = elements.settingsModal.querySelector('#openrouter-image-model');
    const saveButton = elements.settingsModal.querySelector('#save-settings-btn');
    const toggleButtons = elements.settingsModal.querySelectorAll('.toggle-password-visibility');
    const themeButtons = elements.settingsModal.querySelectorAll('.theme-btn');

    sensitiveInputs.forEach(input => {
        input.disabled = !isAdminUser;
        if (!isAdminUser) {
            input.type = 'password'; // Mask if not admin
            input.value = '********'; // Show masked value
        } else {
            // Restore actual value if admin, and ensure type is correct based on original state
            if (input.id === 'openrouter-api-key' || input.id === 'model-id') input.type = 'password';
            else input.type = 'text'; // System prompt is textarea, but this handles input type correctly
            input.value = STATE.settings[input.id] || '';
        }
    });

    imageProviderSelect.disabled = !isAdminUser;
    openrouterImageModelInput.disabled = !isAdminUser;
    saveButton.classList.toggle('hidden', !isAdminUser);

    toggleButtons.forEach(btn => {
        btn.classList.toggle('hidden', !isAdminUser);
        if (!isAdminUser) {
            // Hide the eye icons if not admin
            btn.querySelector('.eye-open').classList.remove('hidden');
            btn.querySelector('.eye-closed').classList.add('hidden');
        }
    });

    themeButtons.forEach(btn => {
        btn.disabled = !isAdminUser;
    });

    updateOpenRouterImageModelVisibility(); // Re-evaluate visibility after admin status changes
    updateApiStatus(); // Re-evaluate API status based on key presence
}

/**
 * Toggles visibility of OpenRouter image model input based on selected image provider.
 */
function updateOpenRouterImageModelVisibility() {
    if (!elements) return;
    const openrouterImageModelSetting = elements.settingsModal.querySelector('#openrouter-image-model-setting');
    const isVisible = STATE.settings.imageProvider === 'openrouter';
    openrouterImageModelSetting.classList.toggle('hidden', !isVisible);
    log('info', 'OpenRouter image model input visibility updated:', isVisible);
}

/**
 * Updates the API status indicator in the settings modal.
 */
function updateApiStatus() {
    if (!elements) return;
    const apiStatusSpan = elements.settingsModal.querySelector('#openrouter-api-status span');
    if (STATE.settings.openrouterKey && STATE.settings.openrouterKey.length > 0 && STATE.settings.openrouterKey !== '********') {
        apiStatusSpan.textContent = 'Configured';
        apiStatusSpan.classList.remove('status-not-configured');
        apiStatusSpan.classList.add('status-configured');
    } else {
        apiStatusSpan.textContent = 'Not Configured';
        apiStatusSpan.classList.remove('status-configured');
        apiStatusSpan.classList.add('status-not-configured');
    }
}

/**
 * Saves settings from the UI to STATE and then to storage (cloud/local).
 */
async function saveSettings() {
    if (!Security.isAdmin()) {
        showToast('error', 'You do not have permission to save settings.');
        log('warn', 'Non-admin attempted to save settings.');
        return;
    }

    if (!Security.verifyCsrfToken('save_settings')) {
        showToast('error', 'Security error: CSRF token mismatch. Please refresh and try again.');
        log('error', 'CSRF token mismatch during settings save.');
        return;
    }

    // Capture values from UI (only if not masked)
    STATE.settings.openrouterKey = elements.settingsModal.querySelector('#openrouter-api-key').value === '********' ? STATE.settings.openrouterKey : elements.settingsModal.querySelector('#openrouter-api-key').value;
    STATE.settings.modelId = elements.settingsModal.querySelector('#model-id').value === '********' ? STATE.settings.modelId : elements.settingsModal.querySelector('#model-id').value;
    STATE.settings.systemPrompt = elements.settingsModal.querySelector('#system-prompt').value === '********' ? STATE.settings.systemPrompt : elements.settingsModal.querySelector('#system-prompt').value;
    STATE.settings.imageProvider = elements.settingsModal.querySelector('#image-provider').value;
    STATE.settings.imageModel = elements.settingsModal.querySelector('#openrouter-image-model').value;

    STATE.ui.theme = STATE.settings.theme; // Ensure UI theme is consistent

    // Save to cloud (admin only)
    await Cloud.saveCloudSettings();
    // Also save to local storage as a fallback/cache
    Storage.saveLocalSettings();

    applySettingsToUI(); // Re-apply theme and model badge etc.
    updateApiStatus(); // Update API status immediately after saving
    UI.hideSettingsModal(elements.settingsModal);
}

/**
 * Public function to load local settings (used by auth module for guests/logout).
 */
export function loadLocalSettings() {
    Storage.loadLocalSettings();
}

/**
 * Public function to update security status UI.
 */
export function updateSecurityStatusUI() {
    Security.updateSecurityStatusUI();
}
