import {
  collection, getDocs, orderBy, query, deleteDoc, doc, setDoc,
  increment, runTransaction, Timestamp,
} from 'firebase/firestore';
import { db } from './config';

export interface RedeemCode {
  code: string;
  coinAmount: number;
  maxUses: number;
  usedCount: number;
  createdAt: Date;
  createdByEmail: string | null;
}

export type RedeemResult =
  | { ok: true; coinAmount: number }
  | { ok: false; error: 'not_found' | 'limit_reached' | 'already_used' };

export async function createRedeemCode(
  code: string,
  coinAmount: number,
  maxUses: number,
  createdByEmail: string | null
): Promise<void> {
  const normalized = code.trim().toUpperCase();
  await setDoc(doc(db, 'redeem_codes', normalized), {
    code: normalized,
    coinAmount,
    maxUses,
    usedCount: 0,
    createdAt: Timestamp.now(),
    createdByEmail,
  });
}

export async function getRedeemCodes(): Promise<RedeemCode[]> {
  try {
    const q = query(collection(db, 'redeem_codes'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        code: data.code,
        coinAmount: data.coinAmount,
        maxUses: data.maxUses,
        usedCount: data.usedCount,
        createdAt: (data.createdAt as Timestamp).toDate(),
        createdByEmail: data.createdByEmail ?? null,
      } as RedeemCode;
    });
  } catch {
    return [];
  }
}

export async function deleteRedeemCode(code: string): Promise<void> {
  await deleteDoc(doc(db, 'redeem_codes', code.trim().toUpperCase()));
}

export async function redeemCode(code: string, uid: string): Promise<RedeemResult> {
  const normalized = code.trim().toUpperCase();
  const codeRef = doc(db, 'redeem_codes', normalized);
  const useRef = doc(db, 'redeem_code_uses', `${normalized}_${uid}`);

  try {
    return await runTransaction(db, async (tx) => {
      const codeSnap = await tx.get(codeRef);
      if (!codeSnap.exists()) {
        return { ok: false, error: 'not_found' } as RedeemResult;
      }
      const data = codeSnap.data();
      if (data.usedCount >= data.maxUses) {
        return { ok: false, error: 'limit_reached' } as RedeemResult;
      }
      const useSnap = await tx.get(useRef);
      if (useSnap.exists()) {
        return { ok: false, error: 'already_used' } as RedeemResult;
      }

      tx.set(useRef, { code: normalized, uid, redeemedAt: Timestamp.now() });
      tx.update(codeRef, { usedCount: increment(1) });
      tx.set(doc(db, 'users', uid), { coins: increment(data.coinAmount) }, { merge: true });

      return { ok: true, coinAmount: data.coinAmount } as RedeemResult;
    });
  } catch {
    return { ok: false, error: 'not_found' };
  }
}

export async function addCoins(uid: string, amount: number): Promise<void> {
  await setDoc(doc(db, 'users', uid), { coins: increment(amount) }, { merge: true });
}
