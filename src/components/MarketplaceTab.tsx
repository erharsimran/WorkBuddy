import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { getCurrentUserProfile, UserProfileDetails } from '../services/auth';
import { ShiftDbRow } from '../types';
import { formatDisplayDate, getTorontoTodayStr } from '../utils/dateUtils';

export interface Shift {
  id?: number;
  date: string;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  hours: number;
}

export interface SwapRequestItem {
  id: number;
  request_type: 'COVER' | 'SWAP';
  status: 'OPEN' | 'CLAIMED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  reason?: string;
  created_at: string;
  target_shift_id?: number;
  requester: { id: number; display_name: string; full_name: string; role_category?: string };
  claimant?: { id: number; display_name: string; full_name: string; role_category?: string };
  shift: { id: number; date: string; start_time: string; end_time: string; hours: number };
  target_shift?: { id: number; date: string; start_time: string; end_time: string; hours: number };
}

interface Props {
  currentUser: string;
  isAdmin: boolean;
  myShifts: (Shift | ShiftDbRow)[];
  onShowAlert: (title: string, message: string, type?: 'info' | 'success' | 'error') => void;
}

// Helper to determine role tier
function getRoleTier(role?: string): 'LEADERSHIP' | 'ASSOCIATE' {
  if (!role) return 'ASSOCIATE';
  const r = role.toLowerCase();
  if (
    r.includes('lead') ||
    r.includes('atl') ||
    r.includes('tl') ||
    r.includes('Management') ||
    r.includes('assist') ||
    r.includes('assist')
  ) {
    return 'LEADERSHIP';
  }
  return 'ASSOCIATE';
}

export const MarketplaceTab: React.FC<Props> = ({
  currentUser,
  isAdmin,
  myShifts,
  onShowAlert,
}) => {
  const [userProfile, setUserProfile] = useState<UserProfileDetails | null>(null);
  const [requests, setRequests] = useState<SwapRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Post / Edit Modal States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [selectedShift, setSelectedShift] = useState<{
    id?: number;
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
  } | null>(null);
  const [requestType, setRequestType] = useState<'COVER' | 'SWAP'>('COVER');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Claim / Mutual Swap Modal States
  const [claimingItem, setClaimingItem] = useState<SwapRequestItem | null>(null);
  const [swappableShifts, setSwappableShifts] = useState<any[]>([]);
  const [selectedOfferedShiftId, setSelectedOfferedShiftId] = useState<number | null>(null);
  const [loadingSwaps, setLoadingSwaps] = useState<boolean>(false);

  const estToday = getTorontoTodayStr();

  const strictlyFutureShifts = (myShifts || [])
    .map((s: any) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime || s.start_time || '',
      endTime: s.endTime || s.end_time || '',
      hours: Number(s.hours) || 0,
    }))
    .filter((s) => s.date > estToday)
    .sort((a, b) => a.date.localeCompare(b.date));

  useEffect(() => {
    async function loadData() {
      if (currentUser) {
        const profile = await getCurrentUserProfile(currentUser);
        setUserProfile(profile);
      }
      fetchRequests();
    }
    loadData();
  }, [currentUser]);

  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/swap-request?action=list');
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests);
      }
    } catch (err: any) {
      console.error('Fetch swap error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingRequestId(null);
    setSelectedShift(null);
    setRequestType('COVER');
    setReason('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: SwapRequestItem) => {
    setEditingRequestId(item.id);
    setSelectedShift({
      id: item.shift.id,
      date: item.shift.date,
      startTime: item.shift.start_time,
      endTime: item.shift.end_time,
      hours: item.shift.hours,
    });
    setRequestType(item.request_type);
    setReason(item.reason || '');
    setIsModalOpen(true);
  };

  const handleSubmitRequest = async () => {
    if (!userProfile?.id) return;

    if (!editingRequestId && !selectedShift) {
      onShowAlert('Selection Required', 'Please choose a future shift to offer.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (editingRequestId) {
        const res = await fetch('/api/swap-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edit',
            requestId: editingRequestId,
            requesterId: userProfile.id,
            requestType,
            reason,
          }),
        });
        const data = await res.json();
        if (data.success) {
          onShowAlert('Updated', data.message, 'success');
          setIsModalOpen(false);
          fetchRequests();
        } else {
          onShowAlert('Error', data.error, 'error');
        }
      } else {
        const res = await fetch('/api/swap-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_by_details',
            employeeId: userProfile.id,
            shiftId: selectedShift?.id,
            date: selectedShift?.date,
            startTime: selectedShift?.startTime,
            endTime: selectedShift?.endTime,
            requestType,
            reason,
          }),
        });
        const data = await res.json();
        if (data.success) {
          onShowAlert('Posted!', 'Your shift is now listed on the marketplace.', 'success');
          setIsModalOpen(false);
          fetchRequests();
        } else {
          onShowAlert('Error', data.error, 'error');
        }
      }
    } catch (err: any) {
      onShowAlert('Network Error', err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId: number) => {
    if (!userProfile?.id) return;
    try {
      const res = await fetch('/api/swap-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          requestId,
          requesterId: userProfile.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert('Removed', 'Your swap request was removed.', 'info');
        fetchRequests();
      } else {
        onShowAlert('Error', data.error, 'error');
      }
    } catch (err: any) {
      onShowAlert('Error', err.message, 'error');
    }
  };

  // Open Claim / Swap selection flow
  const handleInitiateClaim = async (item: SwapRequestItem) => {
    if (!userProfile?.id) return;

    if (item.request_type === 'SWAP') {
      setClaimingItem(item);
      setSelectedOfferedShiftId(null);
      setLoadingSwaps(true);
      try {
        const res = await fetch('/api/swap-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_swappable_shifts',
            requestId: item.id,
            claimantId: userProfile.id,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setSwappableShifts(data.shifts);
        } else {
          onShowAlert('Notice', data.error || 'No matching swappable shifts found.', 'info');
        }
      } finally {
        setLoadingSwaps(false);
      }
    } else {
      // Direct cover claim
      executeClaim(item.id, null);
    }
  };

  const executeClaim = async (requestId: number, targetShiftId: number | null) => {
    if (!userProfile?.id) return;
    try {
      const res = await fetch('/api/swap-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim',
          requestId,
          claimantId: userProfile.id,
          targetShiftId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert('Success', data.message, 'success');
        setClaimingItem(null);
        fetchRequests();
      } else {
        onShowAlert('Cannot Claim', data.error, 'error');
      }
    } catch (err: any) {
      onShowAlert('Error', err.message, 'error');
    }
  };

  const handleManagerDecision = async (requestId: number, approved: boolean) => {
    try {
      const res = await fetch('/api/swap-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manager_decision',
          requestId,
          approved,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert('Decision Logged', data.message, 'success');
        fetchRequests();
      }
    } catch (err: any) {
      onShowAlert('Error', err.message, 'error');
    }
  };

  const myRoleTier = getRoleTier(userProfile?.role_category);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Shift Marketplace</Text>
          <Text style={styles.subtitle}>Peer swaps & coverage (Rank & OT protected)</Text>
        </View>
        <TouchableOpacity style={styles.postBtn} onPress={handleOpenCreateModal}>
          <Text style={styles.postBtnText}>+ Post Shift</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
      ) : requests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>☕</Text>
          <Text style={styles.emptyTitle}>No Open Shift Requests</Text>
          <Text style={styles.emptySub}>All future store shifts are covered!</Text>
        </View>
      ) : (
        requests.map((item) => {
          const isMine = item.requester.id === userProfile?.id;
          const requesterTier = getRoleTier(item.requester.role_category);
          const canClaimByTier = myRoleTier === requesterTier;

          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.tag,
                    item.request_type === 'COVER' ? styles.tagCover : styles.tagSwap,
                  ]}
                >
                  <Text style={styles.tagText}>
                    {item.request_type === 'COVER' ? '🙋 Needs Cover' : '🔄 Swap Request'}
                  </Text>
                </View>
                <Text style={styles.statusBadge}>{item.status}</Text>
              </View>

              {/* Requested Shift Info */}
              <Text style={styles.shiftTimeText}>
                📅 {formatDisplayDate(item.shift.date)} • {item.shift.start_time} - {item.shift.end_time} ({item.shift.hours} hrs)
              </Text>
              <Text style={styles.requesterText}>
                Offered by: <Text style={{ fontWeight: '700' }}>{item.requester.display_name}</Text>{' '}
                <Text style={styles.roleBadge}>({item.requester.role_category || 'Staff'})</Text>
              </Text>
              {item.claimant && (
                <Text style={styles.claimantText}>Claimed by: {item.claimant.display_name}</Text>
              )}

              {/* In-Exchange Shift (If Swap) */}
              {item.target_shift && (
                <View style={styles.swapTargetCard}>
                  <Text style={styles.swapTargetLabel}>🔄 In exchange for:</Text>
                  <Text style={styles.swapTargetText}>
                    {formatDisplayDate(item.target_shift.date)} • {item.target_shift.start_time} - {item.target_shift.end_time}
                  </Text>
                  {item.claimant && (
                    <Text style={styles.claimantText}>Claimed by: {item.claimant.display_name}</Text>
                  )}
                </View>
              )}

              {item.reason ? <Text style={styles.reasonText}>"{item.reason}"</Text> : null}

              {/* Action Buttons */}
              <View style={styles.cardActions}>
                {/* For Other Coworkers of the SAME TIER: Claim button */}
                {item.status === 'OPEN' && !isMine && canClaimByTier && (
                  <TouchableOpacity
                    style={styles.claimBtn}
                    onPress={() => handleInitiateClaim(item)}
                  >
                    <Text style={styles.claimBtnText}>
                      {item.request_type === 'SWAP' ? '🔄 Choose My Shift to Swap' : '🖐️ Claim This Shift'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* For Other Coworkers of a DIFFERENT TIER: Locked/Ineligible state */}
                {item.status === 'OPEN' && !isMine && !canClaimByTier && (
                  <View style={styles.tierRestrictedBadge}>
                    <Text style={styles.tierRestrictedText}>
                      🔒 {requesterTier === 'LEADERSHIP' ? 'Leadership (ATL/TL/Mgr) Only' : 'Associate Staff Only'}
                    </Text>
                  </View>
                )}

                {/* For The Original Poster: Edit or Cancel */}
                {item.status === 'OPEN' && isMine && (
                  <View style={styles.ownerActionRow}>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.editBtn]}
                      onPress={() => handleOpenEditModal(item)}
                    >
                      <Text style={styles.editBtnText}>✏️ Edit Post</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.cancelPostBtn]}
                      onPress={() => handleCancelRequest(item.id)}
                    >
                      <Text style={styles.cancelPostBtnText}>🗑️ Cancel Post</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* For Managers: Approvals */}
                {isAdmin && item.status === 'PENDING_APPROVAL' && (
                  <View style={styles.managerActionRow}>
                    <TouchableOpacity
                      style={[styles.decisionBtn, styles.approveBtn]}
                      onPress={() => handleManagerDecision(item.id, true)}
                    >
                      <Text style={styles.decisionBtnText}>✓ Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.decisionBtn, styles.rejectBtn]}
                      onPress={() => handleManagerDecision(item.id, false)}
                    >
                      <Text style={styles.decisionBtnText}>✕ Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}

      {/* MODAL 1: Choose Shift to Swap In Exchange */}
      <Modal visible={!!claimingItem} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Your Shift to Swap</Text>
            <Text style={styles.modalSub}>
              Select which of your shifts to give {claimingItem?.requester.display_name} in exchange for{' '}
              {formatDisplayDate(claimingItem?.shift.date)}:
            </Text>

            {loadingSwaps ? (
              <ActivityIndicator size="large" color="#2563eb" style={{ marginVertical: 24 }} />
            ) : swappableShifts.length === 0 ? (
              <View style={styles.noSwapsBox}>
                <Text style={styles.noSwapsTitle}>No Conflict-Free Shifts Found</Text>
                <Text style={styles.noSwapsSub}>
                  You don't have an upcoming shift where {claimingItem?.requester.display_name} is currently off and available to work for you.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 220, marginVertical: 12 }}>
                {swappableShifts.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.shiftSelectCard,
                      selectedOfferedShiftId === s.id && styles.shiftSelected,
                    ]}
                    onPress={() => setSelectedOfferedShiftId(s.id)}
                  >
                    <Text style={styles.shiftSelectDate}>📅 {formatDisplayDate(s.date)}</Text>
                    <Text style={styles.shiftSelectTime}>
                      ⏰ {s.start_time} - {s.end_time} ({s.hours} hrs)
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setClaimingItem(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              {swappableShifts.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    !selectedOfferedShiftId && { backgroundColor: '#94a3b8' },
                  ]}
                  disabled={!selectedOfferedShiftId}
                  onPress={() => claimingItem && executeClaim(claimingItem.id, selectedOfferedShiftId)}
                >
                  <Text style={styles.submitBtnText}>Confirm Swap</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Create / Edit Marketplace Post */}
      <Modal visible={isModalOpen} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingRequestId ? 'Edit Marketplace Post' : 'Offer Future Shift'}
            </Text>
            <Text style={styles.modalSub}>
              {editingRequestId
                ? `Shift: ${formatDisplayDate(selectedShift?.date)} (${selectedShift?.startTime} - ${selectedShift?.endTime})`
                : 'Select one of your upcoming future shifts:'}
            </Text>

            {!editingRequestId && (
              <ScrollView style={{ maxHeight: 190, marginVertical: 12 }}>
                {strictlyFutureShifts.length === 0 ? (
                  <Text style={styles.noFutureShiftsText}>
                    No upcoming shifts found after today ({formatDisplayDate(estToday)}).
                  </Text>
                ) : (
                  strictlyFutureShifts.map((s, idx) => (
                    <TouchableOpacity
                      key={`${s.date}_${s.startTime}_${idx}`}
                      style={[
                        styles.shiftSelectCard,
                        selectedShift?.date === s.date &&
                          selectedShift?.startTime === s.startTime &&
                          styles.shiftSelected,
                      ]}
                      onPress={() => setSelectedShift(s)}
                    >
                      <Text style={styles.shiftSelectDate}>📅 {formatDisplayDate(s.date)}</Text>
                      <Text style={styles.shiftSelectTime}>
                        ⏰ {s.startTime} - {s.endTime} ({s.hours} hrs)
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}

            {/* Type selector */}
            <View style={styles.typeSelectorRow}>
              <TouchableOpacity
                style={[styles.typeBtn, requestType === 'COVER' && styles.typeBtnActive]}
                onPress={() => setRequestType('COVER')}
              >
                <Text style={[styles.typeText, requestType === 'COVER' && styles.typeTextActive]}>
                  Give Away (Cover)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, requestType === 'SWAP' && styles.typeBtnActive]}
                onPress={() => setRequestType('SWAP')}
              >
                <Text style={[styles.typeText, requestType === 'SWAP' && styles.typeTextActive]}>
                  Swap Shift
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.reasonInput}
              placeholder="Reason or note (optional)"
              placeholderTextColor="#94a3b8"
              value={reason}
              onChangeText={setReason}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSubmitRequest}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {editingRequestId ? 'Save Changes' : 'Post to Marketplace'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingVertical: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  postBtn: { backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  postBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  emptyCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 36, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emptySub: { fontSize: 13, color: '#64748b', marginTop: 4 },
  card: { backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tag: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  tagCover: { backgroundColor: '#fef3c7' },
  tagSwap: { backgroundColor: '#e0e7ff' },
  tagText: { fontSize: 11, fontWeight: '700', color: '#1e293b' },
  statusBadge: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  shiftTimeText: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  requesterText: { fontSize: 13, color: '#475569' },
  roleBadge: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  reasonText: { fontSize: 13, fontStyle: 'italic', color: '#64748b', marginTop: 6 },
  swapTargetCard: { marginTop: 8, backgroundColor: '#f1f5f9', padding: 8, borderRadius: 8 },
  swapTargetLabel: { fontSize: 11, fontWeight: '700', color: '#475569' },
  swapTargetText: { fontSize: 12, fontWeight: '600', color: '#0f172a', marginTop: 2 },
  claimantText: { fontSize: 11, color: '#64748b', marginTop: 2 },
  cardActions: { marginTop: 12 },
  claimBtn: { backgroundColor: '#10b981', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  claimBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  tierRestrictedBadge: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tierRestrictedText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  ownerActionRow: { flexDirection: 'row', gap: 8 },
  smallBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  editBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  editBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 12 },
  cancelPostBtn: { backgroundColor: '#fee2e2' },
  cancelPostBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 12 },
  managerActionRow: { flexDirection: 'row', gap: 8 },
  decisionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  approveBtn: { backgroundColor: '#2563eb' },
  rejectBtn: { backgroundColor: '#ef4444' },
  decisionBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 18 },
  shiftSelectCard: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 8, backgroundColor: '#f8fafc' },
  shiftSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  shiftSelectDate: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  shiftSelectTime: { fontSize: 12, color: '#64748b', marginTop: 3 },
  noFutureShiftsText: { textAlign: 'center', color: '#94a3b8', paddingVertical: 16, fontSize: 13 },
  noSwapsBox: { padding: 16, backgroundColor: '#f8fafc', borderRadius: 10, marginVertical: 12, alignItems: 'center' },
  noSwapsTitle: { fontSize: 14, fontWeight: '700', color: '#475569' },
  noSwapsSub: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 4, lineHeight: 16 },
  typeSelectorRow: { flexDirection: 'row', gap: 8, marginVertical: 10 },
  typeBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, alignItems: 'center' },
  typeBtnActive: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  typeText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  typeTextActive: { color: '#ffffff' },
  reasonInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#f8fafc' },
  modalBtnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#e2e8f0' },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#2563eb' },
  submitBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
});