import {
  collection, addDoc, getDocs, query, where, orderBy, Timestamp, doc, updateDoc, increment,
} from 'firebase/firestore';
import { db } from './config';
import type { CommunityAlert } from '../../types';

export const ALERT_LABELS: Record<CommunityAlert['type'], string> = {
  ac_broken: 'Klima Bozuk',
  traffic: 'Trafik',
  crowded: 'Çok Kalabalık',
  breakdown: 'Arıza',
  delay: 'Gecikme',
};

export const ALERT_ICONS: Record<CommunityAlert['type'], string> = {
  ac_broken: 'snowflake-off',
  traffic: 'car-multiple',
  crowded: 'account-group',
  breakdown: 'bus-alert',
  delay: 'clock-alert',
};

export const ALERT_EXPIRY_MINS: Record<CommunityAlert['type'], number> = {
  ac_broken: 120,
  traffic: 30,
  crowded: 20,
  breakdown: 60,
  delay: 15,
};

export async function postAlert(alert: Omit<CommunityAlert, 'id' | 'upvotes'>): Promise<void> {
  await addDoc(collection(db, 'community_alerts'), {
    ...alert,
    createdAt: Timestamp.fromDate(alert.createdAt),
    expiresAt: Timestamp.fromDate(alert.expiresAt),
    upvotes: 0,
  });
}

export async function getActiveAlerts(): Promise<CommunityAlert[]> {
  try {
    const q = query(
      collection(db, 'community_alerts'),
      where('expiresAt', '>', Timestamp.now()),
      orderBy('expiresAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id, ...data,
        createdAt: (data.createdAt as Timestamp).toDate(),
        expiresAt: (data.expiresAt as Timestamp).toDate(),
      } as CommunityAlert;
    });
  } catch {
    return [];
  }
}

export async function upvoteAlert(alertId: string): Promise<void> {
  await updateDoc(doc(db, 'community_alerts', alertId), { upvotes: increment(1) });
}
