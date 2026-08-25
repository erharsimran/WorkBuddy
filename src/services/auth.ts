const USERS_KEY = 'WORKBUDDY_AUTH_USERS';
const SESSION_KEY = 'WORKBUDDY_CURRENT_USER';

export async function getCurrentUser(): Promise<string | null> {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(SESSION_KEY);
        }
        return null;
    } catch (e) {
        console.error('Error reading current user:', e);
        return null;
    }
}

export async function loginOrRegister(name: string, pass: string): Promise<boolean> {
    const trimmedName = name.trim();
    const trimmedPass = pass.trim();
    if (!trimmedName || !trimmedPass) return false;

    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(USERS_KEY);
            let users: Record<string, string> = {};
            try {
                users = raw ? JSON.parse(raw) : {};
            } catch {
                users = {};
            }

            // Check if user already exists
            if (users[trimmedName.toLowerCase()]) {
                if (users[trimmedName.toLowerCase()] !== trimmedPass) {
                    return false; // Wrong password
                }
            } else {
                // Register new user
                users[trimmedName.toLowerCase()] = trimmedPass;
                window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
            }

            // Save active session
            window.localStorage.setItem(SESSION_KEY, trimmedName);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error in loginOrRegister:', e);
        return false;
    }
}

export async function logoutUser(): Promise<void> {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(SESSION_KEY);
        }
    } catch (e) {
        console.error('Error in logoutUser:', e);
    }
}
const DEFAULT_HOURLY_RATE = Number(process.env.EXPO_PUBLIC_HOURLY_RATE) || 18.10;

export async function getUserHourlyRate(username: string): Promise<number> {
    if (typeof window !== 'undefined' && window.localStorage) {
        const key = `WORKBUDDY_HOURLY_RATE_${username.toLowerCase()}`;
        const savedRate = window.localStorage.getItem(key);
        if (savedRate) {
            const parsed = parseFloat(savedRate);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }
    return DEFAULT_HOURLY_RATE;
}

export async function setUserHourlyRate(username: string, rate: number): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
        const key = `WORKBUDDY_HOURLY_RATE_${username.toLowerCase()}`;
        window.localStorage.setItem(key, rate.toFixed(2));
    }
}