/**
 * GitHubAdapter.js
 * 
 * This file acts as a bridge between your GitHub-hosted frontend and the Google Apps Script backend.
 * It polyfills the `google.script.run` API so your existing code continues to work with minimal changes.
 */

// CONFIGURATION: REPLACE THIS WITH YOUR DEPLOYED GOOGLE WEB APP URL
const GAS_BACKEND_URL = 'https://script.google.com/macros/s/AKfycbyMX1q7M14WhXsskbElNNJqVwIlyMJ1aZOfZx5WL8GwqdUz5sblYrEzOiOeUhk0yBYuCA/exec';

// Only activate if we are NOT in Google Apps Script environment
if (typeof google === 'undefined' || typeof google.script === 'undefined') {
  console.log('GitHubAdapter: Initializing polyfill for google.script.run');

  window.google = {
    script: {
      run: new Proxy({}, {
        get: function (target, prop) {
          // FIX: If the property exists on the target (e.g. _successHandler), return it directly
          if (prop in target) {
            return target[prop];
          }

          if (prop === 'withSuccessHandler') {
            return function (successCallback) {
              this._successHandler = successCallback;
              return this;
            };
          }
          if (prop === 'withFailureHandler') {
            return function (failureCallback) {
              this._failureHandler = failureCallback;
              return this;
            };
          }

          // Return a function that handles the server-side call
          return function (...args) {
            console.log(`GitHubAdapter: Calling backend function '${prop}' with argsInfo:`, args);

            // Get the user's email from localStorage (set during login)
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

            // Use fetch to call the Google Apps Script Web App
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            fetch(GAS_BACKEND_URL, {
              method: 'POST',
              mode: 'cors', // Explicitly state we expect CORS
              credentials: 'omit', // Don't send cookies
              redirect: 'follow', // Follow redirects (GAS redirects to content)
              headers: {
                "Content-Type": "text/plain;charset=utf-8", // FORCE simple request to avoid Preflight (OPTIONS)
              },
              body: JSON.stringify(payload),
              signal: controller.signal
            })
              .then(response => {
                clearTimeout(timeoutId);
                // Check if response is OK and likely JSON
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
                  // FIX: Trigger success handler if it exists
                  if (this._successHandler && typeof this._successHandler === 'function') {
                    this._successHandler(data.result);
                  }
                } else {
                  console.error("GitHubAdapter: Backend returned error:", data.error);
                  if (this._failureHandler && typeof this._failureHandler === 'function') {
                    this._failureHandler(new Error(data.error));
                  } else {
                    // Fallback to alert if no handler
                    console.error("System Error (No failure handler): " + data.error);
                  }
                }
              })
              .catch(error => {
                clearTimeout(timeoutId);
                console.error("GitHubAdapter: Network request failed:", error);

                // Show visible error to user if strictly necessary, but prefer failure handler
                if (this._failureHandler && typeof this._failureHandler === 'function') {
                  this._failureHandler(error);
                } else {
                  // Only alert if no handler is defined, to avoid spam
                  console.error("Unhandled network error:", error);
                }
              });
          };
        }
      })
    }
  };
} else {
  console.log('GitHubAdapter: Native Google environment detected. Adapter disabled.');
}
