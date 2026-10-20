import { collection, addDoc, getDocs, orderBy, query, deleteDoc, doc, Timestamp, limit } from 'firebase/firestore';
import { db } from './config';

export interface Announcement {
  id?: string;
  title: string;
  body: string;
  createdAt: Date;
}

export async function postAnnouncement(data: Omit<Announcement, 'id' | 'createdAt'>): Promise<void> {
  await addDoc(collection(db, 'announcements'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      title: data.title,
      body: data.body,
      createdAt: (data.createdAt as Timestamp).toDate(),
    } as Announcement;
  });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteDoc(doc(db, 'announcements', id));
}
