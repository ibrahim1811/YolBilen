import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

// Cloudflare'daki güncelleme sunucusu (update-worker/). yayinla.ps1 yeni APK'yı ve version.json'ı buraya yükler.
export const UPDATE_BASE_URL = 'https://yolbul-updates.ibrahimkayracetin2008.workers.dev';

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  apk: string;
  md5: string;
  notes?: string;
}

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

export function currentVersionCode(): number {
  return Number(Application.nativeBuildVersion ?? 0);
}

export function currentVersionName(): string {
  return Application.nativeApplicationVersion ?? '';
}

// Yeni sürüm yoksa null; ağ hatası çağırana fırlatılır (sessizce yutulmaz).
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android' || __DEV__) return null;
  const res = await fetch(`${UPDATE_BASE_URL}/version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`version.json HTTP ${res.status}`);
  const info = (await res.json()) as UpdateInfo;
  if (!info.versionCode || !info.apk || !info.md5) throw new Error('version.json eksik alan içeriyor');
  return info.versionCode > currentVersionCode() ? info : null;
}

// APK'yı önbelleğe indirir, MD5'i doğrular; bozuksa siler ve hata fırlatır.
export async function downloadUpdate(info: UpdateInfo, onProgress: (ratio: number) => void): Promise<string> {
  const dir = `${FileSystem.cacheDirectory}update/`;
  const target = `${dir}${info.apk}`;
  const existing = await FileSystem.getInfoAsync(target, { md5: true });
  if (existing.exists && existing.md5 === info.md5) return target;

  await FileSystem.deleteAsync(dir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const task = FileSystem.createDownloadResumable(
    `${UPDATE_BASE_URL}/${info.apk}`,
    target,
    { cache: false },
    p => {
      if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  );
  const result = await task.downloadAsync();
  if (!result || result.status !== 200) throw new Error(`APK indirilemedi (HTTP ${result?.status ?? '?'})`);

  const downloaded = await FileSystem.getInfoAsync(target, { md5: true });
  if (!downloaded.exists || downloaded.md5 !== info.md5) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    throw new Error('İndirilen dosya doğrulanamadı (MD5 uyuşmuyor)');
  }
  return target;
}

// Android'in paket yükleyicisini açar; "bilinmeyen kaynak" izni yoksa sistem kendisi sorar.
export async function installUpdate(fileUri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
}
