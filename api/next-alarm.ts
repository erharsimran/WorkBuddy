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

      // 2. Synchronize date AND time strictly in America/Toronto
      const now = new Date();
      const estDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
      const estTimeStr = now.toLocaleTimeString('en-GB', {
          timeZone: 'America/Toronto',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
      });

      // 3. Query all shifts starting from today
      const { data: shifts, error } = await supabase
          .from('store_shifts')
          .select('*')
        .eq('employee_id', empRecord.id)
        .gte('date', estDateStr)
        .eq('is_vacation', false)
        .neq('start_time', '00:00')
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(7);

      if (error) {
          return res.status(500).json({ error: error.message });
      }

      if (!shifts || shifts.length === 0) {
          return res.status(200).json({
              hasShift: false,
              message: 'No upcoming shifts found.',
          });
    }

      // 4. Find the first shift that is in the future (tomorrow or later today)
      const upcomingShift = shifts.find((s) => {
          if (s.date > estDateStr) return true;
          if (s.date === estDateStr) {
              // If today's shift has already started/passed, ignore it and grab the next shift
              return s.start_time > estTimeStr;
          }
          return false;
      });

      if (!upcomingShift) {
          return res.status(200).json({
              hasShift: false,
              message: 'No upcoming future shifts found this week.',
          });
      }

      const [startH, startM] = upcomingShift.start_time.split(':').map(Number);

      // Compute alarm trigger time (2 hours prior)
      let alarmH = startH - 2;
      let alarmM = startM;
      let alarmDateStr = upcomingShift.date;

      if (alarmH < 0) {
          alarmH += 24;
        const prevDate = new Date(upcomingShift.date + 'T00:00:00');
        prevDate.setDate(prevDate.getDate() - 1);
        alarmDateStr = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(prevDate.getDate())}`;
    }

      const alarmTime = `${pad(alarmH)}:${pad(alarmM)}`;

      return res.status(200).json({
          hasShift: true,
        employeeName: empRecord.display_name,
        shiftDate: upcomingShift.date,
        shiftStart: upcomingShift.start_time,
        shiftEnd: upcomingShift.end_time,
        shiftHours: upcomingShift.hours,
        alarmDate: alarmDateStr,
        alarmTime: alarmTime,
        alarmHour: alarmH,
        alarmMinute: alarmM,
        label: `Work Shift (${upcomingShift.start_time} - ${upcomingShift.end_time})`,
    });
  } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}