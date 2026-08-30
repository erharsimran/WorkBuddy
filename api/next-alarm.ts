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

        // 1. Resolve employee record
        const { data: empRecord } = await supabase
            .from('employees')
            .select('id, full_name, display_name')
            .or(`display_name.ilike.${username}%,full_name.ilike.${username}%`)
            .limit(1)
            .maybeSingle();

        if (!empRecord) {
            return res.status(200).json({
                hasShift: false,
                message: `Employee "${username}" not found in system.`,
            });
        }

        // 2. Determine today and calculate strictly TOMORROW in America/Toronto
        const now = new Date();
        const estDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

        const baseDate = new Date(`${estDateStr}T00:00:00`);
        baseDate.setDate(baseDate.getDate() + 1);
        const tomorrowDateStr = baseDate.toISOString().split('T')[0];

        // 3. Query shift specifically for TOMORROW
        const { data: shifts, error } = await supabase
            .from('store_shifts')
            .select('*')
            .eq('employee_id', empRecord.id)
            .eq('date', tomorrowDateStr)
            .eq('is_vacation', false)
            .neq('start_time', '00:00')
            .order('start_time', { ascending: true })
            .limit(1);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        if (!shifts || shifts.length === 0) {
            return res.status(200).json({
                hasShift: false,
                message: 'No shift scheduled for tomorrow.',
            });
        }

        const tomorrowShift = shifts[0];
        const [startH, startM] = tomorrowShift.start_time.split(':').map(Number);

        // Compute alarm trigger time (2 hours prior)
        let alarmH = startH - 2;
        let alarmM = startM;
        let alarmDateStr = tomorrowShift.date;

        if (alarmH < 0) {
            alarmH += 24;
            const prevDate = new Date(tomorrowShift.date + 'T00:00:00');
            prevDate.setDate(prevDate.getDate() - 1);
            alarmDateStr = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(prevDate.getDate())}`;
        }

        const alarmTime = `${pad(alarmH)}:${pad(alarmM)}`;

        return res.status(200).json({
            hasShift: true,
            employeeName: empRecord.display_name,
            shiftDate: tomorrowShift.date,
            shiftStart: tomorrowShift.start_time,
            shiftEnd: tomorrowShift.end_time,
            shiftHours: tomorrowShift.hours,
            alarmDate: alarmDateStr,
            alarmTime: alarmTime,
            alarmHour: alarmH,
            alarmMinute: alarmM,
            label: `Work Shift (${tomorrowShift.start_time} - ${tomorrowShift.end_time})`,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}