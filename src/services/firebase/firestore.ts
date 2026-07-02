import {
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  deleteDoc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  doc,
  updateDoc,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from './config';
import type { Feedback, FavoriteLocation, FavoriteLine, FavoriteType, Location } from '../../types';
import { updateBusCardFromFeedback } from './busCardService';

// ── Feedback ──────────────────────────────────────────────────────────────────

export async function submitFeedback(feedback: Omit<Feedback, 'id'>): Promise<{ pointsAwarded: boolean }> {
  if (!auth.currentUser) throw new Error('auth/session-expired');
  await addDoc(collection(db, 'feedbacks'), {
    ...feedback,
    timestamp: Timestamp.fromDate(feedback.timestamp),
  });

  try {
    await setDoc(doc(db, 'line_stats', feedback.lineNumber), {
      lineNumber: feedback.lineNumber,
      totalFeedbacks: increment(1),
      [`ac_${feedback.ac}`]: increment(1),
      [`comfort_${feedback.comfort}`]: increment(1),
      [`crowd_${feedback.crowd}`]: increment(1),
      [`temp_${feedback.temperature}`]: increment(1),
      lastUpdated: Timestamp.now(),
    }, { merge: true });
  } catch {}

  let pointsAwarded = true;
  try {
    await setDoc(doc(db, 'users', feedback.userId), {
      contributionPoints: increment(10),
    }, { merge: true });
  } catch {
    pointsAwarded = false;
  }

  updateBusCardFromFeedback(feedback as Feedback).catch(() => {});

  return { pointsAwarded };
}

export async function getUserPoints(userId: string): Promise<number> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return 0;
  return (snap.data().contributionPoints as number) ?? 0;
}

function mapFeedbacks(docs: any[]): Feedback[] {
  return docs.map(d => {
    const data = d.data();
    return { id: d.id, ...data, timestamp: (data.timestamp as Timestamp).toDate() } as Feedback;
  });
}

export async function getLineFeedbacks(lineNumber: string): Promise<Feedback[]> {
  const col = collection(db, 'feedbacks');
  try {
    const snap = await getDocs(query(col, where('lineNumber', '==', lineNumber), orderBy('timestamp', 'desc'), limit(20)));
    return mapFeedbacks(snap.docs);
  } catch {
    // Composite index missing — fall back to unordered query
    const snap = await getDocs(query(col, where('lineNumber', '==', lineNumber), limit(20)));
    return mapFeedbacks(snap.docs).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

export async function getUserFeedbackCount(userId: string): Promise<number> {
  try {
    const snap = await getCountFromServer(query(collection(db, 'feedbacks'), where('userId', '==', userId)));
    return snap.data().count;
  } catch {
    return 0;
  }
}

export async function getRecentFeedbacks(limitCount = 10): Promise<Feedback[]> {
  const q = query(
    collection(db, 'feedbacks'),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      timestamp: (data.timestamp as Timestamp).toDate(),
    } as Feedback;
  });
}

// ── Favorite Locations ────────────────────────────────────────────────────────

export async function getUserFavoriteLocations(userId: string): Promise<FavoriteLocation[]> {
  const q = query(
    collection(db, 'favorite_locations'),
    where('userId', '==', userId),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: (data.createdAt as Timestamp).toDate(),
    } as FavoriteLocation;
  });
}

export async function addFavoriteLocation(
  userId: string,
  type: FavoriteType,
  label: string,
  location: Location
): Promise<FavoriteLocation> {
  const payload = {
    userId,
    type,
    label,
    location,
    createdAt: Timestamp.now(),
  };
  const ref = await addDoc(collection(db, 'favorite_locations'), payload);
  return { id: ref.id, ...payload, createdAt: payload.createdAt.toDate() };
}

export async function removeFavoriteLocation(id: string): Promise<void> {
  await deleteDoc(doc(db, 'favorite_locations', id));
}

// ── Favorite Lines ────────────────────────────────────────────────────────────

export async function getUserFavoriteLines(userId: string): Promise<FavoriteLine[]> {
  const q = query(
    collection(db, 'favorite_lines'),
    where('userId', '==', userId),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: (data.createdAt as Timestamp).toDate(),
    } as FavoriteLine;
  });
}

export async function addFavoriteLine(
  userId: string,
  lineNumber: string,
  lineName: string
): Promise<FavoriteLine> {
  const payload = {
    userId,
    lineNumber,
    lineName,
    createdAt: Timestamp.now(),
  };
  const ref = await addDoc(collection(db, 'favorite_lines'), payload);
  return { id: ref.id, ...payload, createdAt: payload.createdAt.toDate() };
}

export async function removeFavoriteLine(id: string): Promise<void> {
  await deleteDoc(doc(db, 'favorite_lines', id));
}
