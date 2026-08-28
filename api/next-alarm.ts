import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lhfwqxqujlagaudbrctg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jwmblHXTHZXoljX0OslnbQ_dmfpodVc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const username = ((req.query.user as string) || 'harry').toLowerCase().trim();

        // Current date formatted for America/Toronto (EST/EDT)
        const now = new Date();
        const estDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

        const { data: shifts, error } = await supabase
            .from('user_shifts')
            .select('*')
            .eq('username', username)
            .gte('date', estDateStr)
            .order('date', { ascending: true })
            .order('start_time', { ascending: true })
            .limit(2);

        if (error) {
            return res.status(500).json({ error: error.message });
        }
        let hasShift = "";
        if (!shifts || shifts.length === 0) {
            return res.status(200).json({
                hasShift: false,
                message: 'No upcoming shifts found.',
            });
        }

        const nextShift = shifts[0];
        const [startH, startM] = nextShift.start_time.split(':').map(Number);

        // Compute alarm trigger time (2 hours prior)
        let alarmH = startH - 2;
        let alarmM = startM;
        let alarmDateStr = nextShift.date;

        if (alarmH < 0) {
            alarmH += 24;

            const prevDate = new Date(nextShift.date + 'T00:00:00');
            prevDate.setDate(prevDate.getDate() - 1);
            alarmDateStr = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(prevDate.getDate())}`;

        }
        hasShift = "yes";
        const alarmTime = `${pad(alarmH)}:${pad(alarmM)}`;

        return res.status(200).json({
            hasShift: hasShift,
            shiftDate: nextShift.date,
            shiftStart: nextShift.start_time,
            shiftEnd: nextShift.end_time,
            shiftHours: nextShift.hours,
            alarmDate: alarmDateStr,
            alarmTime: alarmTime,
            alarmHour: alarmH,
            alarmMinute: alarmM,
            label: `Work Shift (${nextShift.start_time} - ${nextShift.end_time})`,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}