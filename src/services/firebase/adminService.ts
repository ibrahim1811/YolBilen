import { doc, getDoc } from 'firebase/firestore';
import { db } from './config';

const cache = new Map<string, boolean>();

const DEV_ADMINS = ['ikcdeveloper@gmail.com'];

export async function checkIsAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if (DEV_ADMINS.includes(email)) return true;
  if (cache.has(email)) return cache.get(email)!;
  try {
    const snap = await getDoc(doc(db, 'admin', email));
    const result = snap.exists();
    cache.set(email, result);
    return result;
  } catch {
    return false;
  }
}
