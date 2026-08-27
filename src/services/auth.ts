import { supabase } from './supabase';

const DEFAULT_HOURLY_RATE = Number(process.env.EXPO_PUBLIC_HOURLY_RATE) || 18.10;
const SESSION_KEY = 'WORKBUDDY_CURRENT_USER';

export async function getCurrentUser(): Promise<string | null> {
    if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(SESSION_KEY);
    }
    return null;
}

export async function loginOrRegister(name: string, pass: string): Promise<boolean> {
    const cleanUser = name.trim().toLowerCase();
    const cleanPass = pass.trim();

    // 1. Check if user already exists
    const { data: existingUser, error: fetchErr } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('username', cleanUser)
        .single();

    if (fetchErr && fetchErr.code !== 'PGRST116') {
        console.error('Supabase auth error:', fetchErr);
        throw new Error(fetchErr.message);
    }

    if (existingUser) {
        // Verify password
        if (existingUser.password_hash !== cleanPass) {
            return false;
        }
    } else {
      // Auto-register new user
      const { error: insertErr } = await supabase
          .from('user_profiles')
          .insert([
              {
                  username: cleanUser,
                  password_hash: cleanPass,
                  hourly_rate: DEFAULT_HOURLY_RATE,
              },
          ]);

      if (insertErr) {
          console.error('Registration error:', insertErr);
          throw new Error(insertErr.message);
      }
  }

    // Persist local session
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SESSION_KEY, cleanUser);
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
    const { data, error } = await supabase
        .from('user_profiles')
        .select('hourly_rate')
        .eq('username', cleanUser)
        .single();

    if (error || !data?.hourly_rate) {
    return DEFAULT_HOURLY_RATE;
    }
    return Number(data.hourly_rate);
}

export async function setUserHourlyRate(username: string, rate: number): Promise<void> {
    const cleanUser = username.trim().toLowerCase();
    const { error } = await supabase
        .from('user_profiles')
        .update({ hourly_rate: rate })
        .eq('username', cleanUser);

    if (error) {
        console.error('Failed to update hourly rate:', error);
        throw new Error(error.message);
    }
}