// assets/modules/chat.js

import { STATE, APP_CONSTANTS } from './state.js';
import * as UI from './ui.js';
import * as Storage from './storage.js';
import * as Security from './security.js';
import * as ImageGen from './image.js';
import { showToast, sanitizeInput, truncateText } from './utils.js';

let appElements; // Store references to common DOM elements

/**
 * Sets up event listeners for chat functionality.
 * @param {Object} elements - Object containing references to relevant DOM elements.
 */
export function setupEventListeners(elements) {
    appElements = elements;

    elements.sendBtn.addEventListener('click', handleSendMessage);
    elements.stopBtn.addEventListener('click', stopGenerating);
    elements.chatModeBtn.addEventListener('click', () => setMode('chat'));
    elements.imageModeBtn.addEventListener('click', () => setMode('image'));
}

/**
 * Sets the current application mode (chat or image generation).
 * @param {'chat'|'image'} mode - The mode to set.
 */
export function setMode(mode) {
    if (STATE.ui.mode === mode) return; // No change

    if (STATE.ui.isGenerating) {
        showToast('warning', 'Please wait for the current generation to complete or stop it.');
        return;
    }

    STATE.ui.mode = mode;
    UI.updateChatInputArea();
    log('info', `App mode set to: ${mode}`);
    showToast('info', `Switched to ${mode === 'chat' ? 'Chat' : 'Image Generation'} Mode.`);
}

/**
 * Handles sending a message or generating an image based on the current mode.
 */
async function handleSendMessage() {
    const prompt = appElements.chatInput.value.trim();
    if (!prompt) {
        showToast('warning', 'Please enter a message or prompt.');
        return;
    }

    if (STATE.ui.isGenerating) {
        showToast('warning', 'Please wait for the current generation to complete or stop it.');
        return;
    }

    try {
        // Apply SQLi filter to user input
        const sanitizedPrompt = Security.filterSQLi(prompt);
        // HTML escape user input before displaying or sending to Markdown parser
        const escapedPrompt = Security.preventXSS(sanitizedPrompt);

        appElements.chatInput.value = ''; // Clear input
        UI.autoResizeChatInput();

        STATE.ui.isGenerating = true;
        UI.updateChatInputArea();
        UI.showTypingIndicator(true);

        if (STATE.ui.mode === 'chat') {
            await sendChatMessage(escapedPrompt);
        } else if (STATE.ui.mode === 'image') {
            await ImageGen.generateImage(escapedPrompt);
        }
    } catch (error) {
        log('error', 'Error handling message/image generation:', error);
        showToast('error', error.message);
        // Add user message with error state if it was a chat message
        if (STATE.ui.mode === 'chat') {
            addMessageToConversation({
                id: crypto.randomUUID(),
                role: 'user',
                type: 'text',
                content: prompt, // Use original prompt here for user's view
                timestamp: Date.now(),
            });
            addMessageToConversation({
                id: crypto.randomUUID(),
                role: 'ai',
                type: 'text',
                content: 'An internal error occurred while processing your request.',
                errorMessage: error.message,
                error: true,
                timestamp: Date.now(),
            });
        }
    } finally {
        STATE.ui.isGenerating = false;
        UI.updateChatInputArea();
        UI.showTypingIndicator(false);
        STATE.abortController = null; // Clear controller after use
    }
}

/**
 * Sends a chat message to the OpenRouter API and handles streaming responses.
 * @param {string} prompt - The user's message.
 */
async function sendChatMessage(prompt) {
    if (!STATE.settings.openrouterKey) {
        showToast('error', 'OpenRouter API key is not configured in settings.');
        log('error', 'API key missing for chat.');
        addMessageToConversation({
            id: crypto.randomUUID(),
            role: 'user',
            type: 'text',
            content: prompt,
            timestamp: Date.now(),
        });
        addMessageToConversation({
            id: crypto.randomUUID(),
            role: 'ai',
            type: 'text',
            content: 'Error: OpenRouter API key is not configured. Please check settings.',
            errorMessage: 'API key not configured.',
            error: true,
            timestamp: Date.now(),
        });
        return;
    }

    // Create a new conversation if none is active or if the active one is empty
    if (!STATE.ui.activeConversationId || STATE.conversations.find(c => c.id === STATE.ui.activeConversationId)?.messages.length === 0) {
        startNewConversation(prompt);
    }

    const activeConversation = STATE.conversations.find(c => c.id === STATE.ui.activeConversationId);
    if (!activeConversation) {
        showToast('error', 'No active conversation found.');
        return;
    }

    // Add user message to conversation
    const userMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: prompt,
        timestamp: Date.now(),
    };
    addMessageToConversation(userMessage);

    // Prepare messages for API (system prompt + history)
    const messagesForApi = [
        { role: 'system', content: STATE.settings.systemPrompt },
        ...activeConversation.messages.filter(m => m.type === 'text').map(m => ({
            role: m.role,
            content: m.content
        })),
        { role: 'user', content: prompt } // Add the current user prompt again for context
    ];

    STATE.abortController = new AbortController();
    const signal = STATE.abortController.signal;

    let aiMessageContent = '';
    const aiMessageId = crypto.randomUUID();
    const aiMessagePlaceholder = {
        id: aiMessageId,
        role: 'ai',
        type: 'text',
        content: '',
        timestamp: Date.now(),
    };
    addMessageToConversation(aiMessagePlaceholder); // Add placeholder for streaming

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${STATE.settings.openrouterKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin, // Optional, for OpenRouter analytics
                'X-Title': APP_CONSTANTS.APP_NAME, // Optional, for OpenRouter analytics
            },
            body: JSON.stringify({
                model: STATE.settings.modelId,
                messages: messagesForApi,
                stream: true,
            }),
            signal,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error ? errorData.error.message : response.statusText);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            // OpenRouter sends data in 'data: {json}\n\n' format
            chunk.split('\n\n').forEach(part => {
                if (part.startsWith('data: ')) {
                    const jsonStr = part.substring(6);
                    if (jsonStr === '[DONE]') return;
                    try {
                        const data = JSON.parse(jsonStr);
                        const delta = data.choices[0]?.delta?.content || '';
                        if (delta) {
                            aiMessageContent += delta;
                            // Update the last message in the UI with streaming content
                            updateLastMessageContent(aiMessageId, aiMessageContent);
                        }
                    } catch (e) {
                        log('error', 'Error parsing streaming chunk:', e, jsonStr);
                    }
                }
            });
        }
    } catch (error) {
        if (signal.aborted) {
            log('info', 'Chat stream aborted by user.');
            aiMessageContent += '\n\n*(Generation stopped by user)*';
            showToast('info', 'AI response generation stopped.');
        } else {
            log('error', 'Error streaming chat response:', error);
            aiMessageContent += `\n\n**Error:** ${error.message}`;
            showToast('error', `AI chat error: ${error.message}`);
        }
        // Ensure the last message is updated with any partial content and error info
        updateLastMessageContent(aiMessageId, aiMessageContent, true, error.message);
    } finally {
        STATE.ui.isGenerating = false;
        UI.updateChatInputArea();
        UI.showTypingIndicator(false);
        STATE.abortController = null; // Clear controller after use
        Storage.saveConversations(); // Save conversations after completion
    }
}

/**
 * Adds a message to the active conversation and updates the UI.
 * If no conversation is active, a new one is created.
 * @param {Object} message - The message object to add.
 */
export function addMessageToConversation(message) {
    let activeConversation = STATE.conversations.find(c => c.id === STATE.ui.activeConversationId);

    if (!activeConversation) {
        startNewConversation(message.type === 'text' ? message.content : 'Image Generation');
        activeConversation = STATE.conversations.find(c => c.id === STATE.ui.activeConversationId);
        if (!activeConversation) {
            log('error', 'Failed to create or find active conversation.');
            showToast('error', 'Failed to start conversation.');
            return;
        }
    }

    activeConversation.messages.push(message);
    activeConversation.lastUpdated = Date.now();
    Storage.saveConversation(activeConversation); // Save updated conversation

    UI.appendMessageToChat(message); // Append to UI
    UI.renderConversationHistory(appElements.conversationHistory); // Update sidebar history
    UI.scrollToBottom();
}

/**
 * Updates the content of the last message in the active conversation and UI.
 * Used for streaming responses.
 * @param {string} messageId - The ID of the message to update.
 * @param {string} newContent - The new content for the message.
 * @param {boolean} [isError=false] - Whether the message should be marked as an error.
 * @param {string} [errorMessage=''] - The error message if `isError` is true.
 */
function updateLastMessageContent(messageId, newContent, isError = false, errorMessage = '') {
    const activeConversation = STATE.conversations.find(c => c.id === STATE.ui.activeConversationId);
    if (activeConversation) {
        const messageIndex = activeConversation.messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
            activeConversation.messages[messageIndex].content = newContent;
            activeConversation.messages[messageIndex].error = isError;
            activeConversation.messages[messageIndex].errorMessage = errorMessage;
            UI.appendMessageToChat(activeConversation.messages[messageIndex], true); // Update UI streaming
            Storage.saveConversation(activeConversation); // Save updated conversation
        }
    }
}

/**
 * Creates and activates a new conversation.
 * @param {string} [initialPrompt='New Chat'] - The initial prompt to use for the conversation title.
 */
export function startNewConversation(initialPrompt = 'New Chat') {
    const newConversation = {
        id: crypto.randomUUID(),
        title: truncateText(initialPrompt, APP_CONSTANTS.CONVERSATION_TITLE_MAX_LENGTH),
        messages: [],
        lastUpdated: Date.now(),
    };
    STATE.conversations.unshift(newConversation); // Add to beginning
    STATE.ui.activeConversationId = newConversation.id;
    Storage.saveConversations(); // Save new list of conversations
    UI.renderApp(appElements); // Re-render everything
    log('info', 'Started new conversation:', newConversation.id);
}

/**
 * Loads a specific conversation by ID and makes it active.
 * @param {string} conversationId - The ID of the conversation to load.
 */
export function loadConversation(conversationId) {
    if (STATE.ui.activeConversationId === conversationId) return;

    STATE.ui.activeConversationId = conversationId;
    UI.renderChatArea(); // Re-render chat messages
    UI.renderConversationHistory(appElements.conversationHistory); // Update active state in sidebar
    log('info', 'Loaded conversation:', conversationId);
}

/**
 * Deletes a conversation by ID.
 * @param {string} conversationId - The ID of the conversation to delete.
 */
export function deleteConversation(conversationId) {
    if (!Security.verifyCsrfToken('delete_conversation')) {
        showToast('error', 'Security error: CSRF token mismatch.');
        return;
    }
    Storage.deleteConversation(conversationId);
    UI.renderApp(appElements); // Re-render everything
    log('info', 'Deleted conversation:', conversationId);
}

/**
 * Clears all conversations.
 */
export function clearAllConversations() {
    if (!Security.verifyCsrfToken('clear_all_chats')) {
        showToast('error', 'Security error: CSRF token mismatch.');
        return;
    }
    Storage.clearConversations();
    UI.renderApp(appElements); // Re-render everything
    log('info', 'Cleared all conversations.');
}

/**
 * Stops the current AI generation if an AbortController is active.
 */
export function stopGenerating() {
    if (STATE.abortController) {
        STATE.abortController.abort();
        log('info', 'AI generation manually aborted.');
    } else {
        log('warn', 'No active generation to stop.');
        showToast('info', 'No active generation to stop.');
    }
}

/**
 * Regenerates the last AI response in the current conversation.
 */
export async function regenerateResponse() {
    if (STATE.ui.isGenerating) {
        showToast('warning', 'Please wait for the current generation to complete or stop it.');
        return;
    }

    const activeConversation = STATE.conversations.find(c => c.id === STATE.ui.activeConversationId);
    if (!activeConversation || activeConversation.messages.length < 2) {
        showToast('info', 'No previous AI response to regenerate.');
        return;
    }

    // Find the last user message to regenerate from
    const lastUserMessage = activeConversation.messages
        .slice() // Create a shallow copy to reverse without modifying original
        .reverse()
        .find(msg => msg.role === 'user' && msg.type === 'text');

    if (!lastUserMessage) {
        showToast('info', 'No user message found to regenerate from.');
        return;
    }

    // Remove the last AI response (and its corresponding user prompt if it was a pair)
    // For simplicity, we just remove the last AI response. The user prompt remains.
    const lastAIMessageIndex = activeConversation.messages.findIndex(msg => msg.id === activeConversation.messages.at(-1)?.id && msg.role === 'ai');
    if (lastAIMessageIndex !== -1) {
        activeConversation.messages.splice(lastAIMessageIndex, 1);
        Storage.saveConversation(activeConversation);
        UI.renderChatArea(); // Re-render chat without the last AI message
    }

    log('info', 'Regenerating response for:', lastUserMessage.content);
    showToast('info', 'Regenerating AI response...');

    try {
        STATE.ui.isGenerating = true;
        UI.updateChatInputArea();
        UI.showTypingIndicator(true);
        await sendChatMessage(lastUserMessage.content);
    } catch (error) {
        log('error', 'Error during regeneration:', error);
        showToast('error', `Regeneration failed: ${error.message}`);
    } finally {
        STATE.ui.isGenerating = false;
        UI.updateChatInputArea();
        UI.showTypingIndicator(false);
    }
}
