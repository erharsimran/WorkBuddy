import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '../src/utils/notifier';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lhfwqxqujlagaudbrctg.supabase.co';
const SUPABASE_ANON_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_jwmblHXTHZXoljX0OslnbQ_dmfpodVc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const REQUIRE_MANAGER_APPROVAL = process.env.REQUIRE_MANAGER_APPROVAL === 'true';

// Normalize role category to tier: 'LEADERSHIP' vs 'ASSOCIATE'
function getRoleTier(role?: string): 'LEADERSHIP' | 'ASSOCIATE' {
    if (!role) return 'ASSOCIATE';
    const r = role.toLowerCase();
    if (
        r.includes('lead') ||
        r.includes('atl') ||
        r.includes('tl') ||
        r.includes('manag') ||
        r.includes('assist')
    ) {
        return 'LEADERSHIP';
    }
    return 'ASSOCIATE';
}

// Calculate ISO week start (Monday) and end (Sunday) dates
function getWeekRange(dateStr: string) {
    const d = new Date(`${dateStr}T00:00:00`);
    const day = d.getDay();
    const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diffToMon));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return {
        start: mon.toISOString().split('T')[0],
        end: sun.toISOString().split('T')[0],
    };
}

async function notifyEligibleEmployees(
    requesterId: number,
    requesterRole: string,
    shiftDate: string,
    shiftHours: number,
    shiftTime: string,
    type: string,
    requestId: number
) {
    try {
        const requesterTier = getRoleTier(requesterRole);
        const { start: weekStart, end: weekEnd } = getWeekRange(shiftDate);

      // 1. Employees working on same date
      const { data: sameDayShifts } = await supabase
          .from('store_shifts')
          .select('employee_id')
          .eq('date', shiftDate);

      const busyEmpIds = new Set((sameDayShifts || []).map((s) => s.employee_id));
      busyEmpIds.add(requesterId);

      // 2. Fetch all candidates
      const { data: allEmployees } = await supabase
          .from('employees')
        .select('id, full_name, display_name, phone, email, role_category, push_token');

      const tierMatched = (allEmployees || []).filter(
          (e) => !busyEmpIds.has(e.id) && getRoleTier(e.role_category) === requesterTier
      );

      // 3. Overtime check and notification dispatch
      for (const emp of tierMatched) {
          const { data: empWeekShifts } = await supabase
              .from('store_shifts')
              .select('hours')
              .eq('employee_id', emp.id)
              .gte('date', weekStart)
              .lte('date', weekEnd);

        const totalHrs = (empWeekShifts || []).reduce((acc, s) => acc + (Number(s.hours) || 0), 0);

        if (type === 'SWAP' || totalHrs + shiftHours <= 40) {
              await sendNotification({
                  userId: emp.id,
                  phone: emp.phone,
                  email: emp.email,
                  pushToken: emp.push_token,
                  title: type === 'COVER' ? '🙋 Shift Cover Available' : '🔄 Shift Swap Available',
                  message: `A shift on ${shiftDate} (${shiftTime}) needs ${type === 'COVER' ? 'coverage' : 'a swap'
                      }. Tap to view in Marketplace!`,
                  type: 'SWAP_ALERT',
                  relatedId: requestId,
              });
          }
      }
  } catch (err: any) {
      console.error('Notification error:', err.message);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const action = req.body?.action || req.query?.action;

      // =========================================================================
      // 1. LIST ACTIVE SWAP / COVER REQUESTS
      // =========================================================================
      if (req.method === 'GET' || action === 'list') {
          const now = new Date();
          const estToday = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

        const { data, error } = await supabase
            .from('shift_swap_requests')
            .select(`
          id, request_type, status, reason, created_at, target_shift_id,
          requester:employees!shift_swap_requests_requester_id_fkey(id, display_name, full_name, role_category, phone, email),
          claimant:employees!shift_swap_requests_claimant_id_fkey(id, display_name, full_name, role_category, phone, email),
          shift:store_shifts!shift_swap_requests_shift_id_fkey(id, date, start_time, end_time, hours),
          target_shift:store_shifts!shift_swap_requests_target_shift_id_fkey(id, date, start_time, end_time, hours)
        `)
          .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ success: false, error: error.message });

        const futureRequests = (data || []).filter((r: any) => r.shift && r.shift.date > estToday);
        return res.status(200).json({ success: true, requests: futureRequests });
    }

      // =========================================================================
      // 2. GET SWAPPABLE SHIFTS
      // =========================================================================
      if (action === 'get_swappable_shifts') {
          const requestId = Number(req.body?.requestId || req.query?.requestId);
          const claimantId = Number(req.body?.claimantId || req.query?.claimantId);

        const now = new Date();
        const estToday = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

        const { data: reqItem } = await supabase
            .from('shift_swap_requests')
            .select(`
          id, requester_id,
          shift:store_shifts!shift_swap_requests_shift_id_fkey(id, date, start_time, end_time, hours)
        `)
          .eq('id', requestId)
          .single();

        if (!reqItem) return res.status(404).json({ success: false, error: 'Request not found.' });

        const requesterShiftDate = (reqItem.shift as any).date;

        const { data: requesterShifts } = await supabase
            .from('store_shifts')
            .select('date')
            .eq('employee_id', reqItem.requester_id)
            .gt('date', estToday);

        const requesterBusyDates = new Set((requesterShifts || []).map((s) => s.date));

        const { data: claimantShifts } = await supabase
            .from('store_shifts')
            .select('id, date, start_time, end_time, hours')
            .eq('employee_id', claimantId)
            .gt('date', estToday)
          .neq('date', requesterShiftDate)
          .order('date', { ascending: true });

        const swappableShifts = (claimantShifts || []).filter(
            (cs) => !requesterBusyDates.has(cs.date)
        );

        return res.status(200).json({ success: true, shifts: swappableShifts });
    }

      // =========================================================================
      // 3. CREATE REQUEST
      // =========================================================================
      if (action === 'create_by_details') {
          const { employeeId, shiftId, date, startTime, requestType, reason } = req.body;

        const now = new Date();
        const estToday = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

        if (date <= estToday) {
          return res.status(400).json({
              success: false,
              error: 'Only future shifts (starting tomorrow) can be posted.',
          });
      }

        let targetShiftId = shiftId;
        let matchedShift: any = null;

        if (!targetShiftId) {
            const { data: foundShift } = await supabase
                .from('store_shifts')
                .select('id, date, start_time, end_time, hours')
                .eq('employee_id', employeeId)
                .eq('date', date)
                .eq('start_time', startTime)
                .limit(1)
                .maybeSingle();

          if (!foundShift) {
              return res.status(404).json({ success: false, error: 'Shift record not found.' });
          }
          targetShiftId = foundShift.id;
          matchedShift = foundShift;
      } else {
          const { data: foundShift } = await supabase
              .from('store_shifts')
              .select('id, date, start_time, end_time, hours')
              .eq('id', targetShiftId)
              .single();
          matchedShift = foundShift;
      }

        const { data: requesterInfo } = await supabase
            .from('employees')
            .select('role_category')
            .eq('id', employeeId)
            .single();

        const { data: newReq, error: insertErr } = await supabase
            .from('shift_swap_requests')
            .insert({
                shift_id: targetShiftId,
                requester_id: employeeId,
                request_type: requestType || 'COVER',
                reason: reason || '',
                status: 'OPEN',
            })
            .select()
            .single();

        if (insertErr) return res.status(500).json({ success: false, error: insertErr.message });

        if (matchedShift && newReq) {
            await notifyEligibleEmployees(
                employeeId,
                requesterInfo?.role_category || 'Staff',
                matchedShift.date,
                Number(matchedShift.hours) || 0,
                `${matchedShift.start_time} - ${matchedShift.end_time}`,
            requestType || 'COVER',
            newReq.id
        );
      }

        return res.status(200).json({ success: true, request: newReq });
    }

      // =========================================================================
      // 4. EDIT POSTED REQUEST
      // =========================================================================
      if (action === 'edit') {
          const { requestId, requesterId, requestType, reason } = req.body;

        const { data: existing } = await supabase
            .from('shift_swap_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (!existing || existing.requester_id !== requesterId) {
            return res.status(403).json({ success: false, error: 'Unauthorized to edit this request.' });
        }

        if (existing.status !== 'OPEN') {
            return res.status(400).json({ success: false, error: 'Only OPEN requests can be edited.' });
        }

        const { error: updateErr } = await supabase
            .from('shift_swap_requests')
            .update({
                request_type: requestType || existing.request_type,
                reason: reason !== undefined ? reason : existing.reason,
                updated_at: new Date().toISOString(),
            })
            .eq('id', requestId);

        if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
        return res.status(200).json({ success: true, message: 'Request updated successfully.' });
    }

      // =========================================================================
      // 5. CANCEL REQUEST
      // =========================================================================
      if (action === 'cancel') {
          const { requestId, requesterId } = req.body;

        const { data: existing } = await supabase
            .from('shift_swap_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (!existing || existing.requester_id !== requesterId) {
            return res.status(403).json({ success: false, error: 'Unauthorized to cancel this request.' });
        }

        await supabase.from('shift_swap_requests').delete().eq('id', requestId);
        return res.status(200).json({ success: true, message: 'Request cancelled.' });
    }

      // =========================================================================
      // 6. CLAIM SHIFT (Cover OR Two-Way Swap)
      // =========================================================================
      if (action === 'claim') {
          const { requestId, claimantId, targetShiftId } = req.body;

        const { data: reqItem } = await supabase
            .from('shift_swap_requests')
            .select(`
          id, status, shift_id, requester_id, request_type,
          requester:employees!shift_swap_requests_requester_id_fkey(id, display_name, role_category, phone, email, push_token),
          shift:store_shifts!shift_swap_requests_shift_id_fkey(id, date, start_time, end_time, hours)
        `)
          .eq('id', requestId)
          .single();

        if (!reqItem || reqItem.status !== 'OPEN') {
            return res.status(400).json({ success: false, error: 'Shift is no longer open.' });
        }

        if (reqItem.requester_id === claimantId) {
            return res.status(400).json({ success: false, error: 'You cannot claim your own request.' });
        }

        const { data: claimant } = await supabase
            .from('employees')
          .select('id, display_name, full_name, role_category, phone, email, push_token')
          .eq('id', claimantId)
          .single();

        if (!claimant) {
            return res.status(404).json({ success: false, error: 'Claimant profile not found.' });
        }

        // 1. Role Tier Verification
        const reqTier = getRoleTier((reqItem.requester as any)?.role_category);
        const claimTier = getRoleTier(claimant.role_category);

        if (reqTier !== claimTier) {
            return res.status(400).json({
                success: false,
                error: `Role restriction: ${reqTier} shifts can only be swapped/claimed by ${reqTier} staff.`,
            });
        }

        const shiftDate = (reqItem.shift as any).date;
        const shiftHours = Number((reqItem.shift as any).hours) || 0;

        // 2. Claimant Availability on Requested Shift Date
        const { data: claimantSameDay } = await supabase
            .from('store_shifts')
            .select('id')
            .eq('employee_id', claimantId)
            .eq('date', shiftDate)
            .limit(1)
            .maybeSingle();

        if (claimantSameDay) {
            return res.status(400).json({
                success: false,
                error: 'Conflict: You already have a scheduled shift on this date.',
            });
        }

        // 3. Handle Mutual SWAP Verification
        let offeredShift: any = null;
        if (reqItem.request_type === 'SWAP') {
            if (!targetShiftId) {
                return res.status(400).json({
                    success: false,
                    error: 'You must select one of your own shifts to offer in exchange for this swap.',
                });
            }

          const { data: chosenShift } = await supabase
              .from('store_shifts')
              .select('id, date, start_time, end_time, hours, employee_id')
              .eq('id', targetShiftId)
              .eq('employee_id', claimantId)
              .single();

          if (!chosenShift) {
              return res.status(400).json({
                  success: false,
                  error: 'The offered shift was not found in your schedule.',
              });
          }
          offeredShift = chosenShift;

          const { data: requesterSameDay } = await supabase
              .from('store_shifts')
              .select('id')
              .eq('employee_id', reqItem.requester_id)
              .eq('date', offeredShift.date)
              .limit(1)
              .maybeSingle();

          if (requesterSameDay) {
              return res.status(400).json({
                  success: false,
                  error: `Conflict: The original poster is already working on ${offeredShift.date} and cannot take this shift.`,
              });
          }
      }

        // 4. Overtime Validation (For COVER requests only)
        if (reqItem.request_type === 'COVER') {
            const { start: weekStart, end: weekEnd } = getWeekRange(shiftDate);
            const { data: weekShifts } = await supabase
                .from('store_shifts')
                .select('hours')
                .eq('employee_id', claimantId)
                .gte('date', weekStart)
                .lte('date', weekEnd);

          const currentWeeklyHours = (weekShifts || []).reduce((acc, s) => acc + (Number(s.hours) || 0), 0);
          if (currentWeeklyHours + shiftHours > 40) {
              return res.status(400).json({
                  success: false,
              error: `Overtime limit: Claiming ${shiftHours}h will push your week total to ${(
                  currentWeeklyHours + shiftHours
              ).toFixed(1)}h (Max 40h allowed).`,
          });
          }
      }

        // 5. Update Status
        const nextStatus = REQUIRE_MANAGER_APPROVAL ? 'PENDING_APPROVAL' : 'APPROVED';

        const { error: updateErr } = await supabase
            .from('shift_swap_requests')
            .update({
                claimant_id: claimantId,
                target_shift_id: targetShiftId || null,
                status: nextStatus,
                updated_at: new Date().toISOString(),
            })
            .eq('id', requestId)
            .eq('status', 'OPEN');

        if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });

        // Auto-assign if manager approval is disabled
        if (!REQUIRE_MANAGER_APPROVAL) {
          await supabase
              .from('store_shifts')
              .update({ employee_id: claimantId })
              .eq('id', reqItem.shift_id);

          if (reqItem.request_type === 'SWAP' && targetShiftId) {
              await supabase
                  .from('store_shifts')
                  .update({ employee_id: reqItem.requester_id })
                  .eq('id', targetShiftId);
          }
      }

        // 6. Notify the original poster that their shift was claimed
        const requester = reqItem.requester as any;
        await sendNotification({
            userId: reqItem.requester_id,
            phone: requester?.phone,
            email: requester?.email,
            pushToken: requester?.push_token,
            title: reqItem.request_type === 'SWAP' ? '🔄 Shift Swap Claimed' : '🖐️ Shift Cover Claimed',
            message: `${claimant.display_name} has claimed your shift on ${shiftDate}. ${REQUIRE_MANAGER_APPROVAL ? 'Awaiting manager approval.' : 'The shift roster is now updated.'
                }`,
            type: 'CLAIM_ALERT',
            relatedId: reqItem.id,
        });

        return res.status(200).json({
            success: true,
            message: REQUIRE_MANAGER_APPROVAL
                ? 'Swap submitted! Awaiting manager approval.'
                : 'Shifts swapped successfully!',
            status: nextStatus,
        });
    }

      // =========================================================================
      // 7. MANAGER APPROVAL / REJECTION
      // =========================================================================
      if (action === 'manager_decision') {
          const { requestId, approved } = req.body;

        const { data: reqItem } = await supabase
            .from('shift_swap_requests')
          .select(`
          id, shift_id, requester_id, claimant_id, target_shift_id, request_type, status,
          requester:employees!shift_swap_requests_requester_id_fkey(id, display_name, phone, email, push_token),
          claimant:employees!shift_swap_requests_claimant_id_fkey(id, display_name, phone, email, push_token),
          shift:store_shifts!shift_swap_requests_shift_id_fkey(date, start_time, end_time)
        `)
          .eq('id', requestId)
          .single();

        if (!reqItem || reqItem.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ success: false, error: 'Request not pending approval.' });
        }

        const requester = reqItem.requester as any;
        const claimant = reqItem.claimant as any;
        const shiftDate = (reqItem.shift as any)?.date || '';

        if (approved) {
            // Reassign primary shift to claimant
            await supabase
                .from('store_shifts')
                .update({ employee_id: reqItem.claimant_id })
                .eq('id', reqItem.shift_id);

          // If mutual swap, reassign offered shift to requester
          if (reqItem.request_type === 'SWAP' && reqItem.target_shift_id) {
              await supabase
                  .from('store_shifts')
                  .update({ employee_id: reqItem.requester_id })
                  .eq('id', reqItem.target_shift_id);
          }

          await supabase
              .from('shift_swap_requests')
              .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
              .eq('id', requestId);

          // Notify original requester
          if (requester) {
              await sendNotification({
                  userId: reqItem.requester_id,
                  phone: requester.phone,
                  email: requester.email,
                  pushToken: requester.push_token,
                  title: '✅ Shift Swap Approved',
                  message: `Manager approved your swap with ${claimant?.display_name || 'coworker'} for ${shiftDate}.`,
                  type: 'APPROVAL_ALERT',
                  relatedId: reqItem.id,
              });
          }

          // Notify claimant
          if (claimant) {
              await sendNotification({
                  userId: reqItem.claimant_id,
                  phone: claimant.phone,
                  email: claimant.email,
                  pushToken: claimant.push_token,
                  title: '✅ Shift Swap Approved',
                  message: `Manager approved your shift claim for ${shiftDate}. You are now rostered.`,
                  type: 'APPROVAL_ALERT',
                  relatedId: reqItem.id,
              });
          }

          return res.status(200).json({
              success: true,
              message: 'Swap approved and both shifts updated.',
          });
      } else {
          await supabase
              .from('shift_swap_requests')
              .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
              .eq('id', requestId);

            // Notify original requester of rejection
            if (requester) {
                await sendNotification({
                    userId: reqItem.requester_id,
                    phone: requester.phone,
                    email: requester.email,
                    pushToken: requester.push_token,
                    title: '✕ Shift Request Rejected',
                    message: `Manager did not approve the shift request for ${shiftDate}.`,
                    type: 'APPROVAL_ALERT',
                    relatedId: reqItem.id,
                });
            }

            // Notify claimant of rejection
            if (claimant) {
                await sendNotification({
                    userId: reqItem.claimant_id,
                    phone: claimant.phone,
                    email: claimant.email,
                    pushToken: claimant.push_token,
                    title: '✕ Shift Claim Rejected',
                    message: `Manager did not approve your claim for the shift on ${shiftDate}.`,
                    type: 'APPROVAL_ALERT',
                    relatedId: reqItem.id,
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Swap request rejected.',
            });
        }
    }

      return res.status(400).json({ success: false, error: 'Invalid action.' });
  } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
}