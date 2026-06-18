import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, Button, useTheme, TextInput, Appbar, HelperText } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { registerWithEmail } from '../services/firebase/auth';
import { useAppStore } from '../store/useAppStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const theme = useTheme();
  const setUser = useAppStore((s) => s.setUser);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function validate(): string {
    if (!displayName.trim()) return 'İsim zorunludur.';
    if (!email.trim()) return 'E-posta zorunludur.';
    if (password.length < 6) return 'Şifre en az 6 karakter olmalıdır.';
    if (password !== confirmPassword) return 'Şifreler eşleşmiyor.';
    return '';
  }

  async function handleRegister() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const user = await registerWithEmail(email.trim(), password, displayName.trim());
      setUser(user);
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        setError('Bu e-posta zaten kullanımda.');
      } else if (e.code === 'auth/invalid-email') {
        setError('Geçersiz e-posta adresi.');
      } else if (e.code === 'auth/weak-password') {
        setError('Şifre çok zayıf.');
      } else {
        setError(`Kayıt başarısız: ${e.code ?? e.message ?? 'Bilinmeyen hata'}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Hesap Oluştur" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            Hesabınızı oluşturun, favori hatlarınızı kaydedin ve topluluğa katkı sağlayın.
          </Text>

          <View style={styles.form}>
            <TextInput
              label="Adınız"
              value={displayName}
              onChangeText={(v) => { setDisplayName(v); setError(''); }}
              autoCapitalize="words"
              autoComplete="name"
              mode="outlined"
              disabled={loading}
              left={<TextInput.Icon icon="account-outline" />}
              style={styles.input}
            />

            <TextInput
              label="E-posta"
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              mode="outlined"
              disabled={loading}
              left={<TextInput.Icon icon="email-outline" />}
              style={styles.input}
            />

            <TextInput
              label="Şifre"
              value={password}
              onChangeText={(v) => { setPassword(v); setError(''); }}
              secureTextEntry={!showPassword}
              mode="outlined"
              disabled={loading}
              left={<TextInput.Icon icon="lock-outline" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  onPress={() => setShowPassword((v) => !v)}
                />
              }
              style={styles.input}
            />

            <TextInput
              label="Şifre Tekrar"
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
              secureTextEntry={!showPassword}
              mode="outlined"
              disabled={loading}
              left={<TextInput.Icon icon="lock-check-outline" />}
              style={styles.input}
            />

            {error !== '' && (
              <HelperText type="error" visible>
                {error}
              </HelperText>
            )}

            <Button
              mode="contained"
              onPress={handleRegister}
              loading={loading}
              disabled={loading}
              style={styles.btn}
              contentStyle={styles.btnContent}
              labelStyle={styles.btnLabel}
            >
              Kayıt Ol
            </Button>

            <Button
              mode="text"
              onPress={() => navigation.goBack()}
              disabled={loading}
              labelStyle={{ color: theme.colors.onSurfaceVariant }}
            >
              Zaten hesabın var mı? Giriş yap
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
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { padding: 24, gap: 20, paddingBottom: 40 },
  subtitle: { fontSize: 14, lineHeight: 22 },
  form: { gap: 12 },
  input: { backgroundColor: 'transparent' },
  btn: { borderRadius: 12, marginTop: 4 },
  btnContent: { height: 52 },
  btnLabel: { fontSize: 15, fontWeight: '600' },
});
