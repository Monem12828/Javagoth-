# 🐐 JavaGoat AI Chat Web App

JavaGoat is a production-ready AI chat web application featuring streaming chat responses, image generation, robust authentication, and comprehensive security measures.

## Features

*   **Authentication:** Google OAuth Login and Guest Mode (local-only).
*   **Firebase Integration:** Session persistence, Realtime Database for global settings synchronization.
*   **Admin Role-Based Access Control (RBAC):** Specific admin email (`khanshahidkhanshahid96@gmail.com`) for managing global settings.
*   **AI Chat:** Streaming responses from OpenRouter, configurable models, conversation history, regeneration, stop functionality.
*   **Image Generation:** Integrates Pollinations.ai (with LoremFlickr fallback) and OpenRouter for image generation.
*   **Modern UI:** Dark/Light themes, responsive design, animated welcome screen, polished chat interface.
*   **Markdown Rendering:** `marked.js` for rich text, `highlight.js` for code syntax highlighting with copy-to-clipboard.
*   **Security:** HTTPS enforcement, Content Security Policy (CSP), XSS protection, anti-SQLi filter, CSRF protection, and security status display.
*   **Toast Notifications:** User-friendly feedback system.
*   **Local & Cloud Storage:** `localStorage` for guest data and local backups, Firebase Realtime Database for synced global settings.
*   **Performance:** Preconnect hints, debounced search, efficient DOM updates.

## Setup Instructions

To get JavaGoat up and running, you'll need to configure Firebase and OpenRouter.

### 1. Firebase Project Setup

1.  **Create a Firebase Project:**
    *   Go to the [Firebase Console](https://console.firebase.google.com/).
    *   Click "Add project" and follow the steps to create a new project.

2.  **Register a Web App:**
    *   In your Firebase project, click the "Web" icon ( `</>` ) to add a web app.
    *   Register your app and copy the `firebaseConfig` object.

3.  **Enable Authentication:**
    *   In the Firebase Console, navigate to "Authentication" > "Sign-in method".
    *   Enable "Google" as a provider. Make sure to set a project support email.
    *   Enable "Email/Password" (though not directly used for login, it's often a good fallback or requirement for other Firebase services).

4.  **Set up Realtime Database:**
    *   In the Firebase Console, navigate to "Realtime Database".
    *   Click "Create database" and choose a location.
    *   Start in "locked mode" for security, then update rules later if needed. For this app, public read/write for `/settings` is assumed for simplicity, but in a real production app, you'd secure it with Firebase Security Rules.
        *   **Important Security Note for Realtime Database Rules:** For a production environment, you should tighten your Firebase Realtime Database rules. The current setup assumes the admin can write to `/settings` and all authenticated users can read.
            A more secure rule set might look like this:
            ```json
            {
              "rules": {
                "settings": {
                  ".read": "auth != null",
                  ".write": "auth != null && auth.token.email == 'khanshahidkhanshahid96@gmail.com'"
                },
                // Other paths for user-specific data if any
                ".read": "false",
                ".write": "false"
              }
            }
            ```
            For the purpose of this demo, we are relying on client-side admin checks, but server-side security rules are paramount.

5.  **Update `firebaseConfig` in `assets/modules/firebase.js`:**
    *   Open `assets/modules/firebase.js` and replace the placeholder `firebaseConfig` with the actual configuration you copied from the Firebase Console.

    ```javascript
    // assets/modules/firebase.js
    export const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
      databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID"
    };
    ```

### 2. OpenRouter API Key

1.  **Get an OpenRouter API Key:**
    *   Go to [OpenRouter.ai](https://openrouter.ai/) and create an account.
    *   Navigate to your dashboard or API key section to generate a new API key.

2.  **Configure in JavaGoat:**
    *   Once logged into JavaGoat as an admin (`khanshahidkhanshahid96@gmail.com`), go to the settings panel.
    *   Enter your OpenRouter API key in the "OpenRouter API Key" field.
    *   Save the settings. This key will be stored in Firebase Realtime Database and synced for all logged-in users.

    **Security Warning:** Storing API keys directly in client-side code or client-accessible databases (like Firebase Realtime Database without strict server-side rules) carries inherent risks. For production, consider using a secure backend proxy to handle API calls and protect your keys.

## How to Run

### Local Development

1.  **Clone the Repository:**
    ```bash
    git clone <repository_url>
    cd JavaGoat
    ```
2.  **Serve `index.html`:**
    You need a local web server to run the application, as direct file opening might cause CORS or other issues.
    *   **Using Python (recommended for simplicity):**
        ```bash
        python -m http.server 8000
        ```
    *   **Using Node.js (if you have it installed):**
        Install `http-server`: `npm install -g http-server`
        Then run: `http-server -p 8000`
    *   **Using VS Code Live Server extension:** Open the project in VS Code and use the "Go Live" button.

3.  **Access the App:**
    Open your web browser and go to `http://localhost:8000` (or whatever port your server is running on).

### Deployment Notes (HTTPS)

For a production deployment, ensure your application is served over HTTPS. This is critical for security features like CSP and Firebase Authentication.

*   **Hosting Providers:** Services like Firebase Hosting, Netlify, Vercel, or GitHub Pages (with custom domain + Cloudflare for HTTPS) automatically provide HTTPS.
*   **HTTPS Redirect:** The application includes a client-side HTTPS redirect for non-localhost environments. However, relying solely on client-side redirect is not a substitute for proper server-side HTTPS configuration.

## Admin Access

The hardcoded admin email is `khanshahidkhanshahid96@gmail.com`. Log in with a Google account associated with this email to gain administrative privileges, which include editing and saving global settings to Firebase Realtime Database.

## Technologies Used

*   **Frontend:** HTML5, CSS3, JavaScript (ES Modules)
*   **Authentication & Database:** Firebase SDK 10.8.0 (Auth, Realtime Database)
*   **Markdown Rendering:** `marked.js` 9.1.6
*   **Code Highlighting:** `highlight.js` 11.9.0
*   **Fonts:** Google Fonts (Syne, DM Sans, Fira Code, Cascadia Code)
*   **AI Models:** OpenRouter API (openai/gpt-4o-mini, Stable Diffusion, configurable)
*   **Image Fallback:** Pollinations.ai, LoremFlickr

## Security Considerations

While comprehensive client-side security measures are implemented, remember that client-side security is always limited. For high-security applications, a robust backend is recommended to handle sensitive operations and API key management.

*   **API Key Exposure:** OpenRouter API key is stored client-side (in Firebase RTDB, then synced to `localStorage`). This is a common pattern for purely client-side apps but is not ideal for maximum security.
*   **Firebase Rules:** Ensure your Firebase Realtime Database rules are strictly defined to prevent unauthorized access or modification of data.
*   **CSP:** The provided CSP meta tag is functional but may need adjustments based on additional third-party services you integrate.

---
