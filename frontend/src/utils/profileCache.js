// Profile settings live on the server; localStorage is only a cache so the
// sidebar can render instantly. Call this after login and after saving.
export const cacheProfile = (profile = {}) => {
    localStorage.setItem('displayName', profile.displayName || '');
    localStorage.setItem('bio', profile.bio || '');
    localStorage.setItem('avatarColor', profile.avatarColor || '#f97316');
    localStorage.setItem('betaMode', String(!!profile.betaMode));
    localStorage.setItem('notifications', String(profile.notifications !== false));
};
