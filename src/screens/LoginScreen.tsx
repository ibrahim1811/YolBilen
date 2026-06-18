import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, Button, useTheme, TextInput, Divider, HelperText } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { signInWithGoogle, signInWithEmail, signInAsGuest } from '../services/firebase/auth';
import { useAppStore } from '../store/useAppStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const theme = useTheme();
  const setUser = useAppStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<'google' | 'email' | 'guest' | null>(null);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    setLoading('google');
    try {
      const user = await signInWithGoogle();
      setUser(user);
    } catch (e: any) {
      setError(`Google girişi başarısız: ${e.code ?? e.message ?? String(e)}`);
    } finally {
      setLoading(null);
    }
  }

  async function handleEmailLogin() {
    if (!email || !password) {
      setError('E-posta ve şifre zorunludur.');
      return;
    }
    setError('');
    setLoading('email');
    try {
      const user = await signInWithEmail(email, password);
      setUser(user);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setError('E-posta veya şifre hatalı.');
      } else if (e.code === 'auth/invalid-email') {
        setError('Geçersiz e-posta adresi.');
      } else {
        setError(`Giriş başarısız: ${e.code ?? e.message ?? 'Bilinmeyen hata'}`);
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleGuest() {
    setError('');
    setLoading('guest');
    try {
      const user = await signInAsGuest();
      setUser(user);
    } catch {
      setLoading(null);
    }
  }

  const isLoading = loading !== null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={[styles.logoCircle, { backgroundColor: theme.colors.primaryContainer }]}>
              <MaterialCommunityIcons name="bus-multiple" size={48} color={theme.colors.primary} />
            </View>
            <Text style={[styles.appName, { color: theme.colors.onSurface }]}>YolBilen</Text>
            <Text style={[styles.tagline, { color: theme.colors.onSurfaceVariant }]}>
              Akıllı toplu taşıma asistanınız
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              label="E-posta"
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              mode="outlined"
              disabled={isLoading}
              left={<TextInput.Icon icon="email-outline" />}
              style={styles.input}
            />

            <TextInput
              label="Şifre"
              value={password}
              onChangeText={(v) => { setPassword(v); setError(''); }}
              secureTextEntry={!showPassword}
              autoComplete="password"
              mode="outlined"
              disabled={isLoading}
              left={<TextInput.Icon icon="lock-outline" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  onPress={() => setShowPassword((v) => !v)}
                />
              }
              style={styles.input}
            />

            {error !== '' && (
              <HelperText type="error" visible style={styles.errorText}>
                {error}
              </HelperText>
            )}

            <Button
              mode="contained"
              onPress={handleEmailLogin}
              loading={loading === 'email'}
              disabled={isLoading}
              style={styles.btn}
              contentStyle={styles.btnContent}
              labelStyle={styles.btnLabel}
            >
              Giriş Yap
            </Button>

            <Button
              mode="text"
              onPress={() => navigation.navigate('Register')}
              disabled={isLoading}
              labelStyle={{ color: theme.colors.primary }}
            >
              Hesabın yok mu? Kayıt ol
            </Button>
          </View>

          <View style={styles.dividerRow}>
            <Divider style={styles.dividerLine} />
            <Text style={[styles.dividerText, { color: theme.colors.onSurfaceVariant }]}>veya</Text>
            <Divider style={styles.dividerLine} />
          </View>

          <View style={styles.altButtons}>
            <Button
              mode="outlined"
              onPress={handleGoogle}
              loading={loading === 'google'}
              disabled={isLoading}
              style={styles.btn}
              contentStyle={styles.btnContent}
              icon="google"
              labelStyle={styles.btnLabel}
            >
              Google ile Giriş Yap
            </Button>

            <Button
              mode="text"
              onPress={handleGuest}
              loading={loading === 'guest'}
              disabled={isLoading}
              icon="account-outline"
              labelStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 14 }}
            >
              Misafir olarak devam et
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 24, gap: 24, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 8, paddingTop: 16 },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  appName: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  tagline: { fontSize: 15 },
  form: { gap: 12 },
  input: { backgroundColor: 'transparent' },
  errorText: { marginTop: -8 },
  btn: { borderRadius: 12 },
  btnContent: { height: 52 },
  btnLabel: { fontSize: 15, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1 },
  dividerText: { fontSize: 13 },
  altButtons: { gap: 8 },
});
