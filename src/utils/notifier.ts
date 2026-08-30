import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lhfwqxqujlagaudbrctg.supabase.co';
const SUPABASE_ANON_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_jwmblHXTHZXoljX0OslnbQ_dmfpodVc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ENABLE_SMS = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
const ENABLE_EMAIL = process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true';

// -------------------------------------------------------------
// Initialize Google SMTP Transporter
// -------------------------------------------------------------
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

export interface NotificationPayload {
    userId: number;
    phone?: string;
    email?: string;
    pushToken?: string;
    title: string;
    message: string;
    type: 'SWAP_ALERT' | 'CLAIM_ALERT' | 'APPROVAL_ALERT' | 'ROSTER_PUBLISHED';
    relatedId?: number;
}

/**
 * Dispatches notification across all active channels:
 * 1. Supabase In-App DB (Notifications table)
 * 2. Push Notification (Expo/Firebase FCM token)
 * 3. SMS (Twilio or Console Fallback)
 * 4. Email (Google SMTP or Console Fallback)
 */
export async function sendNotification(payload: NotificationPayload) {
    try {
        // -------------------------------------------------------------
        // 1. Insert In-App DB Record (Always executed)
        // -------------------------------------------------------------
        await supabase.from('notifications').insert({
            user_id: payload.userId,
            title: payload.title,
            message: payload.message,
            type: payload.type,
            related_id: payload.relatedId || null,
            is_read: false,
        });

        // -------------------------------------------------------------
        // 2. Push Notification (Firebase / Expo Push Token)
        // -------------------------------------------------------------
        let targetPushToken = payload.pushToken;

        // Look up push token from database if not supplied in payload
        if (!targetPushToken) {
            const { data: emp } = await supabase
                .from('employees')
                .select('push_token')
                .eq('id', payload.userId)
                .single();
            targetPushToken = emp?.push_token;
        }

        if (targetPushToken) {
            if (targetPushToken.startsWith('ExponentPushToken') || targetPushToken.startsWith('ExpoPushToken')) {
                await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        to: targetPushToken,
                        sound: 'default',
                        title: payload.title,
                        body: payload.message,
                        data: { type: payload.type, relatedId: payload.relatedId },
                    }),
                });
            } else {
                console.log(`[Push Token Registered for User ${payload.userId}]: ${targetPushToken}`);
            }
        }

        // -------------------------------------------------------------
        // 3. SMS Dispatch (Twilio API with Console Fallback)
        // -------------------------------------------------------------
        if (ENABLE_SMS && payload.phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            const auth = Buffer.from(
                `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
            ).toString('base64');

            const body = new URLSearchParams({
                To: payload.phone,
                From: process.env.TWILIO_PHONE_NUMBER || '',
                Body: `${payload.title}: ${payload.message}`,
            });

            await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: body.toString(),
                }
            );
        } else if (ENABLE_SMS && payload.phone) {
            console.log(`[SMS to ${payload.phone}]: ${payload.title} - ${payload.message}`);
        }

        // -------------------------------------------------------------
        // 4. Email Dispatch (Google SMTP with Console Fallback)
        // -------------------------------------------------------------
        if (ENABLE_EMAIL && payload.email && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
            await transporter.sendMail({
                from: `"WorkBuddy Alerts" <${process.env.GMAIL_USER}>`,
                to: payload.email,
                subject: payload.title,
                html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 540px;">
            <h2 style="color: #2563eb; margin-top: 0; font-size: 18px;">${payload.title}</h2>
            <p style="font-size: 14px; color: #1e293b; line-height: 1.6;">${payload.message}</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 18px 0;" />
            <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dollarama WorkBuddy Automated System</p>
          </div>
        `,
            });
            console.log(`[Google SMTP]: Email sent to ${payload.email}`);
        } else if (ENABLE_EMAIL && payload.email) {
            console.log(`[EMAIL to ${payload.email}]: ${payload.title} - ${payload.message}`);
        }
    } catch (err: any) {
        console.error('Notification dispatch error:', err.message);
    }
}