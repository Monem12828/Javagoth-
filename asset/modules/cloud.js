// assets/modules/cloud.js

import { STATE } from './state.js';
import * as Firebase from './firebase.js';
import * as Settings from './settings.js';
import { showToast } from './utils.js';

const SETTINGS_PATH = 'settings'; // Path in Firebase Realtime Database

let settingsRef;
let settingsListenerDetached = true; // Flag to track listener status

/**
 * Listens for real-time updates to global settings in Firebase Realtime Database.
 * Applies settings to STATE and updates UI.
 */
export function listenToCloudSettings() {
    if (!STATE.auth.isLoggedIn || STATE.auth.isGuest || !Firebase.getDatabase() || !settingsListenerDetached) {
        log('warn', 'Not listening to cloud settings: Not logged in, is guest, or listener already active.');
        return Promise.resolve();
    }

    log('info', 'Starting to listen to cloud settings...');
    settingsRef = Firebase.getDatabase().ref(SETTINGS_PATH);

    return new Promise((resolve) => {
        settingsRef.on('value', (snapshot) => {
            const cloudSettings = snapshot.val();
            if (cloudSettings) {
                // Only update specific settings that are meant to be global
                STATE.settings = { ...STATE.settings, ...cloudSettings };
                STATE.ui.theme = STATE.settings.theme; // Ensure UI theme matches
                log('info', 'Cloud settings updated:', STATE.settings);
                Settings.applySettingsToUI();
                showToast('info', 'Settings synced from cloud.');
                STATE.security.cloudSyncActive = true;
            } else {
                log('info', 'No cloud settings found, using local defaults/existing state.');
                STATE.security.cloudSyncActive = false;
            }
            Settings.updateSecurityStatusUI(); // Update UI after sync status changes
            settingsListenerDetached = false;
            resolve(); // Resolve when first value is received
        }, (error) => {
            log('error', 'Firebase Realtime Database error:', error);
            showToast('error', `Cloud settings sync error: ${error.message}`);
            STATE.security.cloudSyncActive = false;
            Settings.updateSecurityStatusUI();
            settingsListenerDetached = true; // Listener might have detached on error
            resolve(); // Resolve even on error
        });
    });
}

/**
 * Stops listening to real-time updates for global settings.
 */
export function stopListeningToCloudSettings() {
    if (settingsRef && !settingsListenerDetached) {
        settingsRef.off('value');
        settingsRef = null;
        settingsListenerDetached = true;
        STATE.security.cloudSyncActive = false;
        Settings.updateSecurityStatusUI();
        log('info', 'Stopped listening to cloud settings.');
    }
}

/**
 * Saves the current STATE.settings to Firebase Realtime Database.
 * Only callable by admin.
 */
export async function saveCloudSettings() {
    if (!STATE.auth.isAdmin) {
        showToast('error', 'Only administrators can save global settings.');
        log('warn', 'Attempted to save cloud settings without admin privileges.');
        return;
    }

    if (!Firebase.getDatabase()) {
        showToast('error', 'Firebase database not initialized.');
        log('error', 'Firebase database not initialized for cloud settings save.');
        return;
    }

    try {
        await Firebase.getDatabase().ref(SETTINGS_PATH).set(STATE.settings);
        log('info', 'Cloud settings saved successfully by admin.');
        showToast('success', 'Settings saved to cloud.');
    } catch (error) {
        log('error', 'Error saving cloud settings:', error);
        showToast('error', `Failed to save settings to cloud: ${error.message}`);
    }
}
