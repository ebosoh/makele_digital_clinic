/**
 * GitHubAdapter.js
 * 
 * This file acts as a bridge between your GitHub-hosted frontend and the Google Apps Script backend.
 * It polyfills the `google.script.run` API so your existing code continues to work with minimal changes.
 */

// CONFIGURATION: REPLACE THIS WITH YOUR DEPLOYED GOOGLE WEB APP URL
const GAS_BACKEND_URL = 'https://script.google.com/macros/u/1/s/AKfycbyMX1q7M14WhXsskbElNNJqVwIlyMJ1aZOfZx5WL8GwqdUz5sblYrEzOiOeUhk0yBYuCA/exec';

// Only activate if we are NOT in Google Apps Script environment
if (typeof google === 'undefined' || typeof google.script === 'undefined') {
  console.log('GitHubAdapter: Initializing polyfill for google.script.run');

  window.google = {
    script: {
      run: new Proxy({}, {
        get: function (target, prop) {
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
            // We use 'no-cors' mode initially to test, but ideally we need CORS support.
            // Google Apps Script Web Apps support CORS if the responding ContentService.createTextOutput() 
            // has the correct mime type.

            fetch(GAS_BACKEND_URL, {
              method: 'POST',
              body: JSON.stringify(payload)
            })
              .then(response => response.json())
              .then(data => {
                if (data.status === 'success') {
                  if (this._successHandler) {
                    this._successHandler(data.result);
                  }
                } else {
                  console.error("GitHubAdapter: Backend returned error:", data.error);
                  if (this._failureHandler) {
                    this._failureHandler(new Error(data.error));
                  }
                }
              })
              .catch(error => {
                console.error("GitHubAdapter: Network request failed:", error);
                if (this._failureHandler) {
                  this._failureHandler(error);
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
