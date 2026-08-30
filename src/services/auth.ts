import {
    RecaptchaVerifier,
    signInWithPhoneNumber,
    ConfirmationResult,
} from 'firebase/auth';
import { supabase } from './supabase';
import { auth } from './firebase';

const DEFAULT_HOURLY_RATE = Number(process.env.EXPO_PUBLIC_HOURLY_RATE) || 18.10;
const SESSION_KEY = 'WORKBUDDY_CURRENT_USER';

let confirmationResultCache: ConfirmationResult | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

export interface UserProfileDetails {
    id: number;
    full_name: string;
    display_name: string;
    email?: string;
    phone?: string;
    password?: string;
    role_category?: string;
}

// ==========================================
// 1. Session & Standard Auth
// ==========================================

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

    // 1. Look up employee in the master directory
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
        throw new Error(`No employee found matching "${identifier}".`);
    }

    // 2. Strict Check: If password is not set, force the phone OTP registration flow
    if (!employee.password) {
        throw new Error(
            'First-time login detected. Please use "First time or Forgot Password? (Phone OTP)" below to set up and secure your account.'
        );
    }

    // 3. Password mismatch
    if (employee.password !== cleanPass) {
        return false;
  }

    // 4. Save active session using the canonical display name
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

// ==========================================
// 2. Wage Rates & Profile Management
// ==========================================

export async function getUserHourlyRate(username: string): Promise<number> {
    const cleanUser = username.trim().toLowerCase();

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

export async function getCurrentUserProfile(username: string): Promise<UserProfileDetails | null> {
    const cleanUser = username.trim().toLowerCase();
    const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, display_name, email, phone, password,role_category')
        .or(`display_name.ilike.${cleanUser},full_name.ilike.${cleanUser}`)
        .limit(1)
        .maybeSingle();

    if (error || !data) return null;
    return data;
}

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

    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SESSION_KEY, details.display_name.trim());
    }
}

// ==========================================
// 3. Firebase Phone OTP & First-Time Setup
// ==========================================

/**
 * Initialize or reuse an invisible RecaptchaVerifier
 */
/**
 * Initialize or reuse an invisible RecaptchaVerifier
 */
export function getOrCreateRecaptchaVerifier(containerId = 'recaptcha-container'): RecaptchaVerifier | null {
    if (typeof window === 'undefined') return null;

    try {
        // 1. Clear any existing Firebase verifier instance
        if (recaptchaVerifier) {
            try {
                recaptchaVerifier.clear();
            } catch (e) {
                // ignore cleanup error
            }
            recaptchaVerifier = null;
        }

        // 2. Ensure the container exists and completely wipe any leftover Google iframe/elements
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.position = 'absolute';
            container.style.top = '-9999px';
            container.style.left = '-9999px';
            document.body.appendChild(container);
        } else {
            // CRITICAL: Wipe stale grecaptcha DOM nodes that cause "already been rendered" error
            container.innerHTML = '';
        }

        // 3. Reset any globally cached grecaptcha widget IDs if present
        if ((window as any).grecaptcha && (window as any).grecaptcha.reset) {
            try {
                (window as any).grecaptcha.reset();
            } catch (e) { }
        }

        // 4. Create the fresh verifier instance
        recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
            size: 'invisible',
            callback: () => {
                // reCAPTCHA solved
            },
            'expired-callback': () => {
                if (recaptchaVerifier) {
                    try {
                        recaptchaVerifier.clear();
                    } catch (e) { }
                    recaptchaVerifier = null;
                }
            },
        });

        return recaptchaVerifier;
    } catch (err) {
        console.error('Error creating RecaptchaVerifier:', err);
        if (recaptchaVerifier) {
            try {
                recaptchaVerifier.clear();
            } catch (e) { }
            recaptchaVerifier = null;
        }
        return null;
    }
}

/**
 * Dispatch Firebase SMS OTP to the registered phone OR a provided first-time phone number
 */
export async function sendFirebasePhoneOTP(
    identifier: string,
    customPhone?: string,
    containerId = 'recaptcha-container'
): Promise<{
    success: boolean;
    message: string;
    employeeId?: number;
    maskedPhone?: string;
    needsPhoneInput?: boolean;
}> {
    const cleanId = identifier.trim().toLowerCase();

    // 1. Locate employee in directory
    const { data: employee, error } = await supabase
        .from('employees')
        .select('id, full_name, display_name, phone')
        .or(`display_name.ilike.${cleanId},full_name.ilike.${cleanId},email.ilike.${cleanId}`)
        .limit(1)
        .maybeSingle();

    if (error || !employee) {
        return { success: false, message: `No employee found matching "${identifier}".` };
    }

    // 2. If no phone exists in DB and no custom phone was passed, prompt user for phone input
    const targetPhone = (customPhone || employee.phone || '').trim();
    if (!targetPhone) {
        return {
            success: false,
            needsPhoneInput: true,
            employeeId: employee.id,
            message: 'No phone number on file. Please enter your mobile phone number.',
        };
    }

    // Format to standard E.164 (+1XXXXXXXXXX)
    let rawPhone = targetPhone.replace(/[^0-9]/g, '');
    if (rawPhone.length === 10) {
        rawPhone = `+1${rawPhone}`;
    } else if (!rawPhone.startsWith('+')) {
        rawPhone = `+${rawPhone}`;
    }

    try {
        const verifier = getOrCreateRecaptchaVerifier(containerId);
        if (!verifier) {
            return { success: false, message: 'Failed to initialize SMS security verification.' };
        }

        confirmationResultCache = await signInWithPhoneNumber(auth, rawPhone, verifier);

        const masked = rawPhone.replace(/(\d{3})\d{4}(\d{3})/, '$1-****-$2');
        return {
            success: true,
            message: `SMS verification code sent to ${masked}`,
            employeeId: employee.id,
            maskedPhone: masked,
        };
    } catch (err: any) {
        console.error('Firebase SMS dispatch error:', err);
        if (recaptchaVerifier) {
            try {
                recaptchaVerifier.clear();
            } catch (e) { }
            recaptchaVerifier = null;
        }
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
        }
        return {
            success: false,
            message: err.message || 'Failed to dispatch verification code.',
        };
    }
}

/**
 * Verify SMS OTP, save newly entered phone number (if applicable), and store the password in Supabase
 */
export async function verifyFirebaseOTPAndSetPassword(
    employeeId: number,
    otpCode: string,
    newPassword: string,
    phoneNumberToSave?: string
): Promise<{ success: boolean; message: string }> {
    const cleanOtp = otpCode.trim();
    const cleanPass = newPassword.trim();

    if (!confirmationResultCache) {
        return { success: false, message: 'Session expired. Please request a new verification code.' };
    }

    if (!cleanOtp || !cleanPass) {
        return { success: false, message: 'Verification code and new password are required.' };
    }

    try {
        // Confirm token with Firebase
        await confirmationResultCache.confirm(cleanOtp);

        const updatePayload: Record<string, any> = { password: cleanPass };
        if (phoneNumberToSave && phoneNumberToSave.trim()) {
            updatePayload.phone = phoneNumberToSave.trim();
        }

        // Save password & phone number in Supabase
        const { error } = await supabase
            .from('employees')
            .update(updatePayload)
            .eq('id', employeeId);

        if (error) {
            return { success: false, message: error.message };
        }

        confirmationResultCache = null;
        return { success: true, message: 'Account verified and password saved! You can now log in.' };
    } catch (err: any) {
        return {
            success: false,
            message:
                err.code === 'auth/invalid-verification-code'
                    ? 'Invalid 6-digit verification code.'
                    : err.message || 'Verification failed.',
        };
    }
}

