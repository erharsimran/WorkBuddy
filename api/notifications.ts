import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lhfwqxqujlagaudbrctg.supabase.co';
const SUPABASE_ANON_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_jwmblHXTHZXoljX0OslnbQ_dmfpodVc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const action = req.body?.action || req.query?.action;
        const userId = Number(req.body?.userId || req.query?.userId);

        if (!userId) {
            return res.status(400).json({ success: false, error: 'User ID is required.' });
        }

        // 1. Fetch user notifications & unread count
        if (req.method === 'GET' || action === 'list') {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(30);

            if (error) return res.status(500).json({ success: false, error: error.message });

            const unreadCount = (data || []).filter((n) => !n.is_read).length;

            return res.status(200).json({
                success: true,
                notifications: data || [],
                unreadCount,
            });
        }

        // 2. Mark specific or all notifications as read
        if (action === 'mark_read') {
            const notificationId = req.body?.notificationId;

            let query = supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);

            if (notificationId) {
                query = query.eq('id', notificationId);
            }

            const { error } = await query;
            if (error) return res.status(500).json({ success: false, error: error.message });

            return res.status(200).json({ success: true, message: 'Marked as read.' });
        }

        return res.status(400).json({ success: false, error: 'Invalid action.' });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
    }
}