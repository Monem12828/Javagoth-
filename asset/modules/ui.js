// assets/modules/ui.js

import { STATE, APP_CONSTANTS } from './state.js';
import * as Chat from './chat.js';
import * as Auth from './auth.js';
import * as Storage from './storage.js';
import { escapeHTML, truncateText, formatDate } from './utils.js';

let appElements; // Store references to common DOM elements

/**
 * Sets up event listeners for general UI interactions.
 * @param {Object} elements - Object containing references to relevant DOM elements.
 */
export function setupEventListeners(elements) {
    appElements = elements;

    appElements.googleLoginBtn.addEventListener('click', Auth.signInWithGoogle);
    appElements.guestLoginBtn.addEventListener('click', Auth.signInAsGuest);

    appElements.menuToggleBtn.addEventListener('click', toggleSidebar);
    appElements.sidebarOverlay.addEventListener('click', toggleSidebar);

    // Initial render of conversation history
    renderConversationHistory(appElements.conversationHistory);
}

/**
 * Renders the appropriate view (login or main app) based on authentication state.
 * @param {Object} elements - DOM elements object.
 */
export function renderApp(elements) {
    if (STATE.auth.isLoggedIn || STATE.auth.isGuest) {
        elements.loginScreen.classList.add('hidden');
        elements.mainApp.classList.remove('hidden');
        renderMainAppContent();
    } else {
        elements.loginScreen.classList.remove('hidden');
        elements.mainApp.classList.add('hidden');
    }
}

/**
 * Renders the login screen.
 * @param {Object} elements - DOM elements object.
 */
export function renderLogin(elements) {
    elements.loginScreen.classList.remove('hidden');
    elements.mainApp.classList.add('hidden');
}

/**
 * Renders the main application content, including chat area and sidebar.
 */
export function renderMainAppContent() {
    updateUserProfile(appElements);
    updateAdminBadge(appElements);
    updateChatHeader();
    renderConversationHistory(appElements.conversationHistory);
    renderChatArea();
    updateChatInputArea();
}

/**
 * Updates the user profile display in the sidebar.
 * @param {Object} elements - DOM elements object.
 */
export function updateUserProfile(elements) {
    if (STATE.auth.isGuest) {
        elements.userAvatar.src = STATE.auth.user?.photoURL || 'https://via.placeholder.com/40?text=G';
        elements.userName.textContent = 'Guest';
        elements.userEmail.textContent = '';
    } else if (STATE.auth.isLoggedIn && STATE.auth.user) {
        elements.userAvatar.src = STATE.auth.user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(STATE.auth.user.displayName || 'User')}&background=F59E0B&color=fff&size=40`;
        elements.userName.textContent = STATE.auth.user.displayName || STATE.auth.user.email;
        elements.userEmail.textContent = STATE.auth.user.email;
    } else {
        elements.userAvatar.src = 'https://via.placeholder.com/40';
        elements.userName.textContent = 'Not Logged In';
        elements.userEmail.textContent = '';
    }
}

/**
 * Updates the admin badge visibility.
 * @param {Object} elements - DOM elements object.
 */
export function updateAdminBadge(elements) {
    elements.adminBadge.classList.toggle('hidden', !STATE.auth.isAdmin);
}

/**
 * Toggles the sidebar visibility for mobile.
 */
export function toggleSidebar() {
    STATE.ui.sidebarOpen = !STATE.ui.sidebarOpen;
    appElements.sidebar.classList.toggle('active', STATE.ui.sidebarOpen);
    appElements.sidebarOverlay.classList.toggle('active', STATE.ui.sidebarOpen);
}

/**
 * Renders the conversation history in the sidebar.
 * @param {HTMLElement} container - The container element for conversation history.
 * @param {string} [searchTerm=''] - Optional search term to filter conversations.
 */
export function renderConversationHistory(container, searchTerm = '') {
    container.innerHTML = ''; // Clear existing history

    const filteredConversations = STATE.conversations.filter(conv =>
        conv.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groupedConversations = {
        'Today': [],
        'Yesterday': [],
        'This Week': [],
        'Older': []
    };

    filteredConversations.forEach(conv => {
        const group = formatDate(conv.lastUpdated);
        if (groupedConversations[group]) {
            groupedConversations[group].push(conv);
        } else {
            groupedConversations['Older'].push(conv); // Fallback for any unknown groups
        }
    });

    for (const groupName in groupedConversations) {
        if (groupedConversations[groupName].length > 0) {
            const groupHeader = document.createElement('h4');
            groupHeader.textContent = groupName;
            container.appendChild(groupHeader);

            groupedConversations[groupName].forEach(conv => {
                const convItem = document.createElement('div');
                convItem.classList.add('conversation-item');
                if (STATE.ui.activeConversationId === conv.id) {
                    convItem.classList.add('active');
                }
                convItem.dataset.id = conv.id;
                convItem.innerHTML = `
                    <span class="conversation-item-title">${escapeHTML(conv.title)}</span>
                    <button class="delete-conversation-btn" title="Delete Conversation" data-id="${conv.id}">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                `;
                convItem.addEventListener('click', (e) => {
                    if (!e.target.closest('.delete-conversation-btn')) {
                        Chat.loadConversation(conv.id);
                        toggleSidebar(); // Close sidebar on mobile after selection
                    }
                });
                convItem.querySelector('.delete-conversation-btn').addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent conversation click event
                    const idToDelete = e.currentTarget.dataset.id;
                    showConfirmationModal(
                        'Delete Conversation',
                        'Are you sure you want to delete this conversation? This action cannot be undone.',
                        () => {
                            if (!Security.verifyCsrfToken('delete_conversation')) {
                                showToast('error', 'Security error: CSRF token mismatch.');
                                return;
                            }
                            Chat.deleteConversation(idToDelete);
                            showToast('success', 'Conversation deleted.');
                        }
                    );
                });
                container.appendChild(convItem);
            });
        }
    }
    log('info', 'Conversation history rendered.');
}

/**
 * Renders the chat area, showing welcome screen or messages.
 */
export function renderChatArea() {
    if (!appElements) return;

    appElements.messageList.innerHTML = ''; // Clear existing messages
    const activeConversation = STATE.conversations.find(c => c.id === STATE.ui.activeConversationId);

    if (!activeConversation || activeConversation.messages.length === 0) {
        appElements.welcomeScreen.classList.remove('hidden');
        appElements.messageList.classList.add('hidden');
    } else {
        appElements.welcomeScreen.classList.add('hidden');
        appElements.messageList.classList.remove('hidden');
        activeConversation.messages.forEach(message => {
            appendMessageToChat(message);
        });
        scrollToBottom();
    }
    updateChatHeader();
    updateChatInputArea();
    log('info', 'Chat area rendered.');
}

/**
 * Appends a message to the chat display.
 * @param {Object} message - The message object to append.
 * @param {boolean} [isStreaming=false] - True if this is a streaming update for the last message.
 */
export function appendMessageToChat(message, isStreaming = false) {
    if (!appElements) return;

    let messageContainer;
    if (isStreaming && appElements.messageList.lastElementChild?.dataset.id === message.id) {
        // Update existing streaming message
        messageContainer = appElements.messageList.lastElementChild;
        const messageBubble = messageContainer.querySelector('.message-bubble');
        messageBubble.innerHTML = marked.parse(message.content);
        addCodeCopyButtons(messageBubble);
    } else {
        // Create new message container
        messageContainer = document.createElement('div');
        messageContainer.classList.add('message-container', message.role);
        messageContainer.dataset.id = message.id;

        const avatarSrc = message.role === 'user' ? (STATE.auth.user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(STATE.auth.user?.displayName || 'User')}&background=F59E0B&color=fff&size=40`) : '';
        const avatarHtml = message.role === 'ai' ? `<span class="message-avatar goat-avatar">🐐</span>` : `<img src="${avatarSrc}" alt="${message.role} avatar" class="message-avatar">`;

        let contentHtml;
        if (message.type === 'image') {
            contentHtml = `
                <div class="image-card ${message.role}">
                    <img src="${escapeHTML(message.content)}" alt="Generated Image" class="image-preview" loading="lazy">
                    <p class="image-prompt">${escapeHTML(message.prompt || 'Generated Image')}</p>
                    <div class="image-card-actions">
                        <a href="${escapeHTML(message.content)}" download="javagoat_image_${Date.now()}.png" class="action-btn primary-btn">Download</a>
                        <button class="action-btn secondary-btn copy-image-url-btn" data-url="${escapeHTML(message.content)}">Copy URL</button>
                    </div>
                </div>
            `;
        } else {
            contentHtml = `
                <div class="message-bubble">
                    ${message.error ? `<p class="error-message">${escapeHTML(message.errorMessage || 'An error occurred.')}</p>` : marked.parse(message.content)}
                </div>
                <div class="message-actions">
                    <button class="message-action-btn copy-message-btn" title="Copy Message">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    ${message.role === 'ai' ? `
                    <button class="message-action-btn regenerate-btn" title="Regenerate Response">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.84-4.32L21.5 2M22 12.5a10 10 0 0 1-18.84 4.32L2.5 22"></path></svg>
                    </button>` : ''}
                </div>
            `;
        }

        messageContainer.innerHTML = `
            ${message.role === 'ai' ? avatarHtml : ''}
            <div class="message-content">
                ${contentHtml}
            </div>
            ${message.role === 'user' ? avatarHtml : ''}
        `;
        appElements.messageList.appendChild(messageContainer);

        // Add event listeners for new message actions
        if (message.type === 'text') {
            const messageBubble = messageContainer.querySelector('.message-bubble');
            addCodeCopyButtons(messageBubble);

            messageContainer.querySelector('.copy-message-btn')?.addEventListener('click', () => {
                copyToClipboard(message.content);
                showToast('success', 'Message copied!');
            });
            messageContainer.querySelector('.regenerate-btn')?.addEventListener('click', () => {
                Chat.regenerateResponse();
            });
        } else if (message.type === 'image') {
            messageContainer.querySelector('.image-preview')?.addEventListener('click', (e) => {
                showFullscreenImageModal(e.target.src);
            });
            messageContainer.querySelector('.copy-image-url-btn')?.addEventListener('click', (e) => {
                const imageUrl = e.currentTarget.dataset.url;
                copyToClipboard(imageUrl);
                showToast('success', 'Image URL copied!');
            });
        }
    }
    scrollToBottom();
}

/**
 * Adds copy-to-clipboard buttons to code blocks within a given element.
 * @param {HTMLElement} parentElement - The element containing code blocks.
 */
function addCodeCopyButtons(parentElement) {
    parentElement.querySelectorAll('pre code').forEach((codeBlock) => {
        if (!codeBlock.closest('.code-block-wrapper')) { // Prevent adding multiple wrappers/buttons
            const wrapper = document.createElement('div');
            wrapper.classList.add('code-block-wrapper');
            codeBlock.parentNode.insertBefore(wrapper, codeBlock);
            wrapper.appendChild(codeBlock);

            const copyButton = document.createElement('button');
            copyButton.classList.add('code-copy-btn');
            copyButton.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
            wrapper.appendChild(copyButton);

            copyButton.addEventListener('click', () => {
                const code = codeBlock.textContent;
                copyToClipboard(code);
                copyButton.textContent = 'Copied!';
                copyButton.classList.add('copied');
                setTimeout(() => {
                    copyButton.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
                    copyButton.classList.remove('copied');
                }, 2000);
            });
        }
    });
}


/**
 * Copies text to the clipboard.
 * @param {string} text - The text to copy.
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        log('error', 'Failed to copy text:', err);
        showToast('error', 'Failed to copy text.');
    });
}

/**
 * Scrolls the chat area to the bottom.
 */
export function scrollToBottom() {
    appElements.chatArea.scrollTop = appElements.chatArea.scrollHeight;
}

/**
 * Updates the chat header (title, model badge).
 */
export function updateChatHeader() {
    const activeConversation = STATE.conversations.find(c => c.id === STATE.ui.activeConversationId);
    appElements.chatTitle.textContent = activeConversation ? truncateText(activeConversation.title, APP_CONSTANTS.CONVERSATION_TITLE_MAX_LENGTH) : 'New Chat';
    appElements.modelBadge.textContent = `${STATE.settings.modelId} `;
    const dot = document.createElement('span');
    dot.classList.add('pulsing-dot');
    appElements.modelBadge.appendChild(dot);
}

/**
 * Auto-resizes the chat input textarea.
 */
export function autoResizeChatInput() {
    appElements.chatInput.style.height = 'auto';
    const scrollHeight = appElements.chatInput.scrollHeight;
    const maxHeight = APP_CONSTANTS.MAX_CHAT_INPUT_HEIGHT;
    appElements.chatInput.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    appElements.chatInput.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
}

/**
 * Toggles the dark/light theme.
 */
export function toggleTheme() {
    const newTheme = STATE.ui.theme === 'dark' ? 'light' : 'dark';
    STATE.ui.theme = newTheme;
    STATE.settings.theme = newTheme; // Update settings theme as well
    document.documentElement.className = `theme-${newTheme}`;
    Storage.saveLocalSettings(); // Save local theme preference
    // Update highlight.js theme
    const highlightLight = document.getElementById('highlight-light-theme');
    const highlightDark = document.querySelector('link[href*="atom-one-dark"]');
    if (newTheme === 'light') {
        highlightLight.disabled = false;
        highlightDark.disabled = true;
    } else {
        highlightLight.disabled = true;
        highlightDark.disabled = false;
    }
    showToast('info', `Switched to ${newTheme} theme.`);
    log('info', `Theme toggled to ${newTheme}.`);
}

/**
 * Shows the typing indicator.
 * @param {boolean} show - True to show, false to hide.
 */
export function showTypingIndicator(show) {
    appElements.typingIndicator.classList.toggle('hidden', !show);
    STATE.ui.isTyping = show;
    if (show) {
        scrollToBottom();
    }
}

/**
 * Updates the state of the chat input area (buttons, mode).
 */
export function updateChatInputArea() {
    // Disable input and send/image buttons while generating
    const disableInput = STATE.ui.isGenerating;
    appElements.chatInput.disabled = disableInput;
    appElements.sendBtn.disabled = disableInput;
    appElements.imageModeBtn.disabled = disableInput;
    appElements.chatModeBtn.disabled = disableInput;

    // Show/hide stop button
    appElements.stopBtn.classList.toggle('hidden', !STATE.ui.isGenerating);
    appElements.sendBtn.classList.toggle('hidden', STATE.ui.isGenerating);

    // Update mode toggle buttons
    appElements.chatModeBtn.classList.toggle('active', STATE.ui.mode === 'chat');
    appElements.imageModeBtn.classList.toggle('active', STATE.ui.mode === 'image');
}

/**
 * Shows the settings modal.
 * @param {HTMLElement} modalElement - The settings modal DOM element.
 */
export function showSettingsModal(modalElement) {
    modalElement.classList.add('active');
}

/**
 * Hides the settings modal.
 * @param {HTMLElement} modalElement - The settings modal DOM element.
 */
export function hideSettingsModal(modalElement) {
    modalElement.classList.remove('active');
}

/**
 * Shows the confirmation modal.
 * @param {string} title - The title of the confirmation modal.
 * @param {string} message - The message to display.
 * @param {Function} onConfirm - Callback function to execute on confirm.
 */
export function showConfirmationModal(title, message, onConfirm) {
    appElements.confirmationModal.querySelector('#confirmation-title').textContent = title;
    appElements.confirmationModal.querySelector('#confirmation-message').innerHTML = escapeHTML(message);

    const executeBtn = appElements.confirmationModal.querySelector('#execute-confirm-btn');
    const cancelBtn = appElements.confirmationModal.querySelector('#cancel-confirm-btn');
    const closeModalBtn = appElements.confirmationModal.querySelector('.close-modal-btn');

    const cleanUp = () => {
        executeBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
        closeModalBtn.removeEventListener('click', cancelHandler);
        appElements.confirmationModal.classList.remove('active');
    };

    const confirmHandler = () => {
        onConfirm();
        cleanUp();
    };

    const cancelHandler = () => {
        cleanUp();
    };

    executeBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    closeModalBtn.addEventListener('click', cancelHandler);

    appElements.confirmationModal.classList.add('active');
}

/**
 * Shows the fullscreen image modal.
 * @param {string} imageUrl - The URL of the image to display.
 */
export function showFullscreenImageModal(imageUrl) {
    const fullscreenImage = appElements.fullscreenImageModal.querySelector('#fullscreen-image');
    const downloadLink = appElements.fullscreenImageModal.querySelector('#download-image-link');
    const copyUrlBtn = appElements.fullscreenImageModal.querySelector('#copy-image-url-btn');

    fullscreenImage.src = imageUrl;
    downloadLink.href = imageUrl;
    downloadLink.download = `javagoat_image_${Date.now()}.png`; // Dynamic download name

    copyUrlBtn.dataset.url = imageUrl;
    copyUrlBtn.onclick = () => {
        copyToClipboard(imageUrl);
        showToast('success', 'Image URL copied!');
    };

    appElements.fullscreenImageModal.classList.add('active');

    appElements.fullscreenImageModal.querySelector('.close-modal-btn').onclick = () => {
        appElements.fullscreenImageModal.classList.remove('active');
    };
}
