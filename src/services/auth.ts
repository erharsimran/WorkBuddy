import { supabase } from './supabase';

const DEFAULT_HOURLY_RATE = Number(process.env.EXPO_PUBLIC_HOURLY_RATE) || 18.10;
const SESSION_KEY = 'WORKBUDDY_CURRENT_USER';

export async function getCurrentUser(): Promise<string | null> {
    if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(SESSION_KEY);
    }
    return null;
}

export async function loginOrRegister(identifier: string, pass: string): Promise<boolean> {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = pass.trim();

    if (!cleanId || !cleanPass) return false;

    // 1. Look up employee in the master employees directory
    const { data: employee, error: fetchErr } = await supabase
        .from('employees')
        .select('id, full_name, display_name, password')
        .or(`display_name.ilike.${cleanId},full_name.ilike.${cleanId},email.ilike.${cleanId}`)
        .limit(1)
        .maybeSingle();

    if (fetchErr) {
        console.error('Supabase auth error:', fetchErr);
        throw new Error(fetchErr.message);
    }

    if (!employee) {
        console.warn(`No employee found matching "${cleanId}"`);
        return false;
    }

    // 2. First-time login: if employee has no password set, claim and save this password
    if (!employee.password) {
        const { error: updateErr } = await supabase
            .from('employees')
            .update({ password: cleanPass })
            .eq('id', employee.id);

        if (updateErr) {
            console.error('Failed to set employee password:', updateErr);
            throw new Error(updateErr.message);
      }
    } else if (employee.password !== cleanPass) {
        // Password mismatch
        return false;
  }

    // 3. Persist local session using the canonical display name
    const sessionName = employee.display_name || employee.full_name;
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SESSION_KEY, sessionName);
    }

    return true;
}

export async function logoutUser(): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(SESSION_KEY);
    }
}

export async function getUserHourlyRate(username: string): Promise<number> {
    const cleanUser = username.trim().toLowerCase();

    // Find employee and retrieve custom hourly rate if present
    const { data, error } = await supabase
        .from('employees')
        .select('hourly_rate')
        .or(`display_name.ilike.${cleanUser},full_name.ilike.${cleanUser}`)
        .limit(1)
        .maybeSingle();

    if (error || !data?.hourly_rate) {
    return DEFAULT_HOURLY_RATE;
    }

    return Number(data.hourly_rate);
}

export async function setUserHourlyRate(username: string, rate: number): Promise<void> {
    const cleanUser = username.trim().toLowerCase();

    const { error } = await supabase
        .from('employees')
        .update({ hourly_rate: rate })
        .or(`display_name.ilike.${cleanUser},full_name.ilike.${cleanUser}`);

    if (error) {
        console.error('Failed to update hourly rate:', error);
        throw new Error(error.message);
    }
}

export interface UserProfileDetails {
    id: number;
    full_name: string;
    display_name: string;
    email?: string;
    phone?: string;
    password?: string;
}

/**
 * Fetch the complete profile of the currently logged-in user
 */
export async function getCurrentUserProfile(username: string): Promise<UserProfileDetails | null> {
    const cleanUser = username.trim().toLowerCase();
    const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, display_name, email, phone, password')
        .or(`display_name.ilike.${cleanUser},full_name.ilike.${cleanUser}`)
        .limit(1)
        .maybeSingle();

    if (error || !data) return null;
    return data;
}

/**
 * Update the user's personal profile information
 */
export async function updateUserProfile(
    id: number,
    details: {
        display_name: string;
        email?: string;
        phone?: string;
        password?: string;
    }
): Promise<void> {
    const payload: Record<string, any> = {
        display_name: details.display_name.trim(),
        email: details.email?.trim() || null,
        phone: details.phone?.trim() || null,
    };

    if (details.password && details.password.trim()) {
        payload.password = details.password.trim();
    }

    const { error } = await supabase
        .from('employees')
        .update(payload)
        .eq('id', id);

    if (error) throw new Error(error.message);

    // Update active session name if display_name changed
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SESSION_KEY, details.display_name.trim());
    }
}