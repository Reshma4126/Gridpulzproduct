/**
 * API Configuration
 * Dynamically determines the backend URL based on the current environment
 * Works correctly whether frontend is served from same backend or different port
 */

// Determine the backend URL based on current environment
function getBackendURL() {
    // If frontend is being served by the backend (e.g., localhost:8000)
    // Use the same origin. This works for both development and production.
    if (window.location.port === '8000' || window.location.hostname === 'localhost' && window.location.port === '') {
        // Backend is at same origin
        return window.location.origin;
    }
    
    // If frontend is on a different port (e.g., Live Server on 5500)
    // Redirect to backend on localhost:8000
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:8000';
    }
    
    // For production: use deployed Render backend
    return 'https://gridpulzproduct.onrender.com';
}

const BACKEND_BASE_URL = getBackendURL();
const API_BASE_URL = `${BACKEND_BASE_URL}/api`;

console.log(`[API Config] Backend URL: ${BACKEND_BASE_URL}`);
console.log(`[API Config] Current origin: ${window.location.origin}`);
console.log(`[API Config] Current port: ${window.location.port}`);
