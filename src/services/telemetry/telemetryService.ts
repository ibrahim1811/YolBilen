import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_VERSION = '1.0.0';
let _sessionId: string | null = null;

async function getSessionId(): Promise<string> {
  if (_sessionId) return _sessionId;
  try {
    const stored = await AsyncStorage.getItem('telemetry_session');
    if (stored) { _sessionId = stored; return stored; }
  } catch {}
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  _sessionId = id;
  try { await AsyncStorage.setItem('telemetry_session', id); } catch {}
  return id;
}

async function track(payload: Record<string, unknown>): Promise<void> {
  try {
    const sessionId = await getSessionId();
    await addDoc(collection(db, 'telemetry'), {
      ...payload,
      sessionId,
      appVersion: APP_VERSION,
      timestamp: Timestamp.now(),
    });
  } catch {}
}

export function trackScreenView(screen: string): void {
  void track({ type: 'screen_view', screen });
}

export function trackRouteSearch(origin: string, destination: string): void {
  void track({ type: 'route_search', origin, destination });
}

export function trackLineOpen(lineNum: string): void {
  void track({ type: 'line_open', lineNum });
}

export function trackStopOpen(stopId: string): void {
  void track({ type: 'stop_open', stopId });
}

export function trackBusCardOpen(plate: string): void {
  void track({ type: 'bus_card_open', plate });
}

export function trackFeedbackSubmit(hasPlate: boolean): void {
  void track({ type: 'feedback_submit', hasPlate });
}
