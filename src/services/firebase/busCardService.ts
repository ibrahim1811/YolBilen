import { doc, getDoc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from './config';
import type { BusCard, Feedback } from '../../types';

function acScore(ac: Feedback['ac']): number {
  return ac === 'good' ? 10 : ac === 'medium' ? 5 : 0;
}
function crowdScore(crowd: Feedback['crowd']): number {
  return crowd === 'seated' ? 10 : crowd === 'standing' ? 5 : 0;
}
function comfortScore(comfort: Feedback['comfort']): number {
  return comfort === 'comfortable' ? 10 : comfort === 'medium' ? 5 : 0;
}
function tempScore(temp: Feedback['temperature']): number {
  return temp === 'cool' ? 10 : temp === 'normal' ? 7 : 3;
}

export async function getBusCard(plate: string): Promise<BusCard | null> {
  try {
    const snap = await getDoc(doc(db, 'bus_cards', plate));
    if (!snap.exists()) return null;
    const d = snap.data();
    return { ...d, updatedAt: d.updatedAt?.toDate() ?? new Date() } as BusCard;
  } catch {
    return null;
  }
}

export async function updateBusCardFromFeedback(feedback: Feedback): Promise<void> {
  if (!feedback.plateNumber) return;
  const plate = feedback.plateNumber.trim();
  if (!plate) return;

  const ref = doc(db, 'bus_cards', plate);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const newAc = acScore(feedback.ac);
    const newCrowd = crowdScore(feedback.crowd);
    const newComfort = comfortScore(feedback.comfort);
    const newSat = tempScore(feedback.temperature);

    if (!snap.exists()) {
      const overall = Math.round((newAc + newCrowd + newComfort + newSat) / 4 * 10) / 10;
      tx.set(ref, {
        plate,
        totalReports: 1,
        climateScore: newAc,
        crowdScore: newCrowd,
        comfortScore: newComfort,
        satisfactionScore: newSat,
        overallScore: overall,
        updatedAt: Timestamp.now(),
      });
    } else {
      const d = snap.data();
      const n = d.totalReports as number;
      const avg = (old: number, val: number) =>
        Math.round(((old * n + val) / (n + 1)) * 10) / 10;
      const climate = avg(d.climateScore, newAc);
      const crowd = avg(d.crowdScore, newCrowd);
      const comfort = avg(d.comfortScore, newComfort);
      const sat = avg(d.satisfactionScore, newSat);
      const overall = Math.round((climate + crowd + comfort + sat) / 4 * 10) / 10;
      tx.update(ref, {
        totalReports: n + 1,
        climateScore: climate,
        crowdScore: crowd,
        comfortScore: comfort,
        satisfactionScore: sat,
        overallScore: overall,
        updatedAt: Timestamp.now(),
      });
    }
  });
}
