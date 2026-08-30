import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { formatDisplayDate } from '../utils/dateUtils';

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface Props {
  visible: boolean;
  userId?: number;
  onClose: () => void;
  onRefreshUnread: () => void;
}

export const NotificationCenterModal: React.FC<Props> = ({
  visible,
  userId,
  onClose,
  onRefreshUnread,
}) => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchNotifications = async () => {
    if (!userId) {
      setLoading(false);
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?action=list&userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.notifications || []);
      } else {
        console.warn('Notifications fetch warning:', data.error);
        setItems([]);
      }
    } catch (err) {
      console.error('Network error fetching notifications:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchNotifications();
    }
  }, [visible, userId]);

  const handleMarkAllRead = async () => {
    if (!userId || items.length === 0) return;
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', userId }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      onRefreshUnread();
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'SWAP_ALERT':
        return '🔄';
      case 'CLAIM_ALERT':
        return '🖐️';
      case 'APPROVAL_ALERT':
        return '✅';
      case 'ROSTER_PUBLISHED':
        return '📋';
      default:
        return '🔔';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      {/* Tap backdrop to close */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.popoverContainer}>
              {/* Top pointer arrow aligned with the header bell icon area */}
              <View style={styles.arrowPointer} />

              {/* Popover Content Card */}
              <View style={styles.popoverCard}>
                {/* Header */}
                <View style={styles.header}>
                  <View>
                    <Text style={styles.title}>Notifications</Text>
                    <Text style={styles.subtitle}>Activity & shift alerts</Text>
                  </View>
                  <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.readAllBtn} onPress={handleMarkAllRead}>
                      <Text style={styles.readAllText}>Mark read</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
                      <Text style={styles.dismissBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Notifications Scroll List */}
                {loading ? (
                  <ActivityIndicator size="small" color="#2563eb" style={{ marginVertical: 30 }} />
                ) : items.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🔕</Text>
                    <Text style={styles.emptyTitle}>No notifications</Text>
                    <Text style={styles.emptyText}>You're completely caught up!</Text>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.scrollArea}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                  >
                    {items.map((n) => {
                      const datePart = n.created_at ? n.created_at.split('T')[0] : '';
                      return (
                        <View
                          key={n.id}
                          style={[styles.notificationCard, !n.is_read && styles.unreadCard]}
                        >
                          <Text style={styles.icon}>{getIcon(n.type)}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{n.title}</Text>
                            <Text style={styles.itemMessage}>{n.message}</Text>
                            <Text style={styles.itemTime}>{formatDisplayDate(datePart)}</Text>
                          </View>
                          {!n.is_read && <View style={styles.unreadDot} />}
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 68, // Positions dropdown right below the app top navigation bar
    paddingHorizontal: 12,
  },
  popoverContainer: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'flex-end', // Aligns the top arrow towards the right where the header icons sit
  },
  arrowPointer: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ffffff',
    marginRight: 110, // Matches bell icon horizontal offset
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  popoverCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  readAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
  },
  readAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  dismissBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '800',
  },
  scrollArea: {
    maxHeight: 340,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    marginBottom: 6,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  unreadCard: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  icon: {
    fontSize: 20,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  itemMessage: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    lineHeight: 15,
  },
  itemTime: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 3,
    fontWeight: '600',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#2563eb',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
});