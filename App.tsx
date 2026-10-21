import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';
import { lightTheme, darkTheme } from './src/theme/theme';
import { useAppStore } from './src/store/useAppStore';
import { auth, db } from './src/services/firebase/config';
import type { User } from './src/types';
import { installErrorReporting, setReportUser } from './src/services/report/reportService';
import { loadRemoteConfig } from './src/services/config/remoteConfig';

// Modül yüklenirken: ilk render'dan önce oluşan hatalar da raporlanabilsin
installErrorReporting();
loadRemoteConfig().catch(e => console.warn('[App] uzaktan ayar alınamadı, son bilinen kullanılıyor:', e));

function ThemedApp() {
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const setUser = useAppStore((s) => s.setUser);
  const [authReady, setAuthReady] = React.useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setReportUser(firebaseUser?.uid ?? null);
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data() as User;
            setUser({
              ...data,
              uid: firebaseUser.uid,
              isGuest: firebaseUser.isAnonymous,
              displayName: data.displayName ?? firebaseUser.displayName,
              email: data.email ?? firebaseUser.email,
              photoURL: data.photoURL ?? firebaseUser.photoURL,
            });
          } else {
            setUser({
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName,
              email: firebaseUser.email,
              photoURL: firebaseUser.photoURL,
              isGuest: firebaseUser.isAnonymous,
            });
          }
        } catch (e) {
          console.warn('[App] kullanıcı profili okunamadı, temel bilgilerle devam ediliyor:', e);
          setUser({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            isGuest: firebaseUser.isAnonymous,
          });
        }
      } else {
        // Non-guest token expired — force re-login so Firestore writes work.
        const existing = useAppStore.getState().user;
        if (existing && !existing.isGuest) {
          setUser(null);
        }
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const theme = isDarkMode ? darkTheme : lightTheme;

  if (!authReady) {
    return (
      <View style={styles.splash}>
        <View style={styles.logoCircle}>
          <MaterialCommunityIcons name="bus-multiple" size={52} color="#FFFFFF" />
        </View>
        <Text style={styles.appName}>YolBilen</Text>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </PaperProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemedApp />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A73E8',
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
});
