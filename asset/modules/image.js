// assets/modules/image.js

import { STATE, APP_CONSTANTS } from './state.js';
import * as UI from './ui.js';
import * as Chat from './chat.js';
import { showToast } from './utils.js';

let appElements;

/**
 * Sets up event listeners for image generation functionality.
 * @param {Object} elements - Object containing references to relevant DOM elements.
 */
export function setupEventListeners(elements) {
    appElements = elements;
}

/**
 * Generates an image based on the provided prompt and current settings.
 * @param {string} prompt - The image generation prompt.
 */
export async function generateImage(prompt) {
    // Add user prompt as a message
    Chat.addMessageToConversation({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: prompt,
        timestamp: Date.now(),
    });

    const aiImageMessageId = crypto.randomUUID();
    const aiImagePlaceholder = {
        id: aiImageMessageId,
        role: 'ai',
        type: 'text', // Temporarily text, will be updated to image
        content: 'Generating image...',
        timestamp: Date.now(),
    };
    Chat.addMessageToConversation(aiImagePlaceholder); // Add placeholder message

    let imageUrl = '';
    let errorOccurred = false;
    let errorMessage = '';

    try {
        showToast('info', 'Generating image...');
        log('info', `Image generation requested using provider: ${STATE.settings.imageProvider}`);

        STATE.abortController = new AbortController();
        const signal = STATE.abortController.signal;

        if (STATE.settings.imageProvider === 'pollinations') {
            imageUrl = await generateWithPollinations(prompt, signal);
        } else if (STATE.settings.imageProvider === 'openrouter') {
            imageUrl = await generateWithOpenRouter(prompt, signal);
        }

        if (!imageUrl) {
            throw new Error('Image generation failed or returned no URL.');
        }

    } catch (error) {
        errorOccurred = true;
        errorMessage = error.message;
        log('error', 'Image generation failed:', error);
        showToast('error', `Image generation failed: ${error.message}`);

        // Fallback to LoremFlickr for Pollinations if it's the selected provider
        if (STATE.settings.imageProvider === 'pollinations') {
            log('info', 'Falling back to LoremFlickr...');
            showToast('info', 'Pollinations.ai failed, falling back to LoremFlickr...');
            try {
                imageUrl = generateWithLoremFlickr();
                errorOccurred = false; // Fallback was successful
                errorMessage = '';
            } catch (fallbackError) {
                log('error', 'LoremFlickr fallback failed:', fallbackError);
                errorMessage = `Both Pollinations.ai and LoremFlickr failed: ${fallbackError.message}`;
                showToast('error', `Fallback failed: ${fallbackError.message}`);
            }
        }
    } finally {
        // Update the placeholder message with the actual image or error
        const activeConversation = Chat.STATE.conversations.find(c => c.id === Chat.STATE.ui.activeConversationId);
        if (activeConversation) {
            const messageIndex = activeConversation.messages.findIndex(m => m.id === aiImageMessageId);
            if (messageIndex !== -1) {
                activeConversation.messages[messageIndex] = {
                    ...activeConversation.messages[messageIndex],
                    type: errorOccurred ? 'text' : 'image',
                    content: errorOccurred ? `Image generation failed: ${errorMessage}` : imageUrl,
                    prompt: prompt,
                    error: errorOccurred,
                    errorMessage: errorMessage,
                };
                Chat.Storage.saveConversation(activeConversation);
                UI.renderChatArea(); // Re-render to show the image or error text
            }
        }
        STATE.ui.isGenerating = false;
        UI.updateChatInputArea();
        UI.showTypingIndicator(false);
        STATE.abortController = null;
    }
}

/**
 * Generates an image using Pollinations.ai.
 * @param {string} prompt - The image generation prompt.
 * @param {AbortSignal} signal - Abort signal for cancellation.
 * @returns {Promise<string>} The URL of the generated image.
 */
async function generateWithPollinations(prompt, signal) {
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024`;
    log('info', 'Pollinations.ai URL:', url);

    // Pollinations.ai directly returns the image, so we just need its URL.
    // We can fetch it to ensure it's valid, but the URL itself is the "result".
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
            throw new Error(`Pollinations.ai returned status ${response.status}`);
        }
        // Check if the response content-type is an image
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.startsWith('image/')) {
            throw new Error('Pollinations.ai did not return an image. It might be an error page.');
        }
        return url; // The URL itself is the image
    } catch (error) {
        log('error', 'Error fetching image from Pollinations.ai:', error);
        throw error;
    }
}

/**
 * Generates an image using LoremFlickr (fallback).
 * @returns {string} The URL of a random image from LoremFlickr.
 */
function generateWithLoremFlickr() {
    const size = APP_CONSTANTS.IMAGE_DEFAULT_SIZE.split('x'); // e.g., "1024x1024"
    const width = size[0];
    const height = size[1];
    const url = `https://loremflickr.com/${width}/${height}/abstract,random`;
    log('info', 'LoremFlickr URL:', url);
    return url;
}

/**
 * Generates an image using OpenRouter API.
 * @param {string} prompt - The image generation prompt.
 * @param {AbortSignal} signal - Abort signal for cancellation.
 * @returns {Promise<string>} The URL of the generated image.
 */
async function generateWithOpenRouter(prompt, signal) {
    if (!STATE.settings.openrouterKey) {
        throw new Error('OpenRouter API key is not configured for image generation.');
    }
    if (!STATE.settings.imageModel) {
        throw new Error('OpenRouter image model ID is not configured.');
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${STATE.settings.openrouterKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': APP_CONSTANTS.APP_NAME,
            },
            body: JSON.stringify({
                prompt: prompt,
                model: STATE.settings.imageModel,
                size: APP_CONSTANTS.IMAGE_DEFAULT_SIZE, // e.g., "1024x1024"
                quality: 'standard', // or 'hd'
                n: 1, // Number of images
            }),
            signal,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error ? errorData.error.message : response.statusText);
        }

        const data = await response.json();
        if (data.data && data.data.length > 0 && data.data[0].url) {
            return data.data[0].url;
        } else {
            throw new Error('OpenRouter did not return an image URL.');
        }
    } catch (error) {
        log('error', 'Error generating image with OpenRouter:', error);
        throw error;
    }
}
