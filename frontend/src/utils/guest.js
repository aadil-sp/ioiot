import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';

// sessionStorage survives reloads but not closing the browser/tab, so a guest
// login without this marker means the browser was closed since it started.
const SESSION_MARKER = 'guestSessionAlive';

export const isGuest = () => localStorage.getItem('isGuest') === 'true';

export function markGuestSession() {
    localStorage.setItem('isGuest', 'true');
    sessionStorage.setItem(SESSION_MARKER, '1');
}

// Tell the server to delete the guest account. sendBeacon still delivers while
// the page is unloading; the token goes in the body because beacons can't set headers.
export function endGuestSession(reason) {
    const token = localStorage.getItem('token');
    if (!token) return;
    const body = new Blob([JSON.stringify({ token, reason })], { type: 'text/plain' });
    if (!navigator.sendBeacon?.(`${API}/api/auth/guest/end`, body)) {
        fetch(`${API}/api/auth/guest/end`, { method: 'POST', body, keepalive: true }).catch(() => { });
    }
}

// Run once before the app renders.
export function endGuestIfBrowserWasClosed() {
    if (isGuest() && !sessionStorage.getItem(SESSION_MARKER)) {
        endGuestSession('closed');
        const theme = localStorage.getItem('theme');
        localStorage.clear();
        if (theme) localStorage.setItem('theme', theme);
    }
}

export function sendGuestHeartbeat() {
    const token = localStorage.getItem('token');
    if (!token) return;
    // A 401 here (session already ended) is handled by the global interceptor
    axios.post(`${API}/api/auth/guest/heartbeat`, {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => { });
}
