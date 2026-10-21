import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { UPDATE_BASE_URL, currentVersionCode, currentVersionName } from '../update/updateService';

// Son uyarı/hata satırları raporlara eklenir; böylece telefon bağlı olmadan da ne olduğunu görebiliriz.
const LOG_LIMIT = 80;
const PENDING_KEY = 'pending_reports:v1';
const logs: string[] = [];
let installed = false;
let currentUid: string | null = null;

export function setReportUser(uid: string | null) {
  currentUid = uid;
}

function stringify(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function remember(level: string, args: unknown[]) {
  const line = `${new Date().toISOString().slice(11, 19)} ${level} ${args.map(stringify).join(' ')}`;
  logs.push(line.slice(0, 600));
  if (logs.length > LOG_LIMIT) logs.shift();
}

export interface ReportPayload {
  kind: 'crash' | 'error' | 'user';
  message: string;
  stack?: string;
  userNote?: string;
  context?: Record<string, unknown>;
}

function enrich(p: ReportPayload) {
  return {
    ...p,
    appVersion: `${currentVersionName()} (${currentVersionCode()})`,
    updateId: Updates.updateId ?? 'gömülü',
    device: `${Platform.OS} ${Platform.Version}`,
    uid: currentUid,
    logs: logs.join('\n'),
  };
}

async function post(body: unknown): Promise<void> {
  const res = await fetch(`${UPDATE_BASE_URL}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Rapor gönderilemedi (HTTP ${res.status})`);
}

// Kullanıcının "Gönder" tuşu: hata fırlatır ki ekran başarısızlığı gösterebilsin.
export async function sendReport(p: ReportPayload): Promise<void> {
  await post(enrich(p));
}

// Otomatik raporlar: ağ yoksa saklanır, bir sonraki açılışta gönderilir.
async function queueReport(p: ReportPayload) {
  const body = enrich(p);
  try {
    await post(body);
  } catch {
    try {
      const raw = await AsyncStorage.getItem(PENDING_KEY);
      const list = raw ? (JSON.parse(raw) as unknown[]) : [];
      list.push(body);
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-10)));
    } catch {
      // Depolama da yoksa yapılacak bir şey kalmaz; kayıt logs dizisinde durur
    }
  }
}

async function flushPending() {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return;
  const list = JSON.parse(raw) as unknown[];
  const failed: unknown[] = [];
  for (const body of list) {
    try {
      await post(body);
    } catch {
      failed.push(body);
    }
  }
  if (failed.length) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(failed));
  else await AsyncStorage.removeItem(PENDING_KEY);
}

// Uygulama açılışında bir kez çağrılır: konsolu dinler, yakalanmamış hataları otomatik raporlar.
export function installErrorReporting() {
  if (installed) return;
  installed = true;

  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      remember(level === 'warn' ? 'UYARI' : 'HATA', args);
      original(...args);
    };
  }

  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const previous = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((error, isFatal) => {
    const err = error instanceof Error ? error : new Error(stringify(error));
    void queueReport({ kind: isFatal ? 'crash' : 'error', message: err.message, stack: err.stack });
    previous?.(error, isFatal);
  });

  flushPending().catch(e => console.warn('[report] bekleyen raporlar gönderilemedi:', e));
}

export function reportBoundaryError(error: Error, componentStack?: string | null) {
  void queueReport({ kind: 'crash', message: error.message, stack: `${error.stack ?? ''}\n${componentStack ?? ''}` });
}
