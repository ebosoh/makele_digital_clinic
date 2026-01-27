/**
 * GitHubAdapter.js
 * 
 * This file acts as a bridge between your GitHub-hosted frontend and the Google Apps Script backend.
 * It polyfills the `google.script.run` API so your existing code continues to work with minimal changes.
 */

// CONFIGURATION: REPLACE THIS WITH YOUR DEPLOYED GOOGLE WEB APP URL
const GAS_BACKEND_URL = 'https://script.google.com/macros/s/AKfycbyMX1q7M14WhXsskbElNNJqVwIlyMJ1aZOfZx5WL8GwqdUz5sblYrEzOiOeUhk0yBYuCA/exec';

// Only activate if we are NOT in Google Apps Script environment
// Only activate if we are NOT in Google Apps Script environment
if (typeof google === 'undefined' || typeof google.script === 'undefined') {
  console.log('GitHubAdapter: Initializing polyfill for google.script.run');

  // Factory function to create a new runner with its own state (handlers)
  // This prevents race conditions when multiple calls are made simultaneously
  const createGoogleScriptRun = (state = { success: null, failure: null }) => {
    return new Proxy({}, {
      get: function (target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (callback) {
            // Return a NEW runner with the updated success handler
            return createGoogleScriptRun({ ...state, success: callback });
          };
        }
        if (prop === 'withFailureHandler') {
          return function (callback) {
            // Return a NEW runner with the updated failure handler
            return createGoogleScriptRun({ ...state, failure: callback });
          };
        }

        // Return a function that handles the server-side call
        return function (...args) {
          console.log(`GitHubAdapter: Calling backend function '${prop}' with argsInfo:`, args);

          const userEmail = localStorage.getItem('userEmail');
          const authToken = localStorage.getItem('authToken');

          if (!userEmail && prop !== 'authenticateUser' && prop !== 'getUserAccess') {
            console.warn("GitHubAdapter: No user email found. Function might fail if it requires auth.");
          }

          const payload = {
            functionName: prop,
            args: args,
            userEmail: userEmail,
            authToken: authToken
          };

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

          fetch(GAS_BACKEND_URL, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            redirect: 'follow',
            headers: {
              "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          })
            .then(response => {
              clearTimeout(timeoutId);
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.text().then(text => {
                try {
                  return JSON.parse(text);
                } catch (e) {
                  console.error("GitHubAdapter: Received non-JSON response:", text.substring(0, 500));
                  throw new Error("Invalid server response. Did you set access to 'Anyone'? (Check console)");
                }
              });
            })
            .then(data => {
              if (data.status === 'success') {
                if (state.success && typeof state.success === 'function') {
                  state.success(data.result);
                }
              } else {
                console.error("GitHubAdapter: Backend returned error:", data.error);
                if (state.failure && typeof state.failure === 'function') {
                  state.failure(new Error(data.error));
                } else {
                  console.error("System Error (No failure handler): " + data.error);
                }
              }
            })
            .catch(error => {
              clearTimeout(timeoutId);
              console.error("GitHubAdapter: Network request failed:", error);
              if (state.failure && typeof state.failure === 'function') {
                state.failure(error);
              } else {
                console.error("Unhandled network error:", error);
              }
            });
        };
      }
    });
  };

  window.google = {
    script: {
      run: createGoogleScriptRun()
    }
  };
} else {
  console.log('GitHubAdapter: Native Google environment detected. Adapter disabled.');
}
