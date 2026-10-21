import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { reportBoundaryError, sendReport } from '../../services/report/reportService';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  reportState: 'idle' | 'sending' | 'sent' | 'failed';
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, reportState: 'idle' };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { hasError: true, error: error instanceof Error ? error : new Error(String(error)), reportState: 'idle' };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Uygulama render hatası yakalandı:', error, info.componentStack);
    reportBoundaryError(error instanceof Error ? error : new Error(String(error)), info.componentStack);
  }

  private handleReport = async () => {
    this.setState({ reportState: 'sending' });
    try {
      await sendReport({
        kind: 'user',
        message: this.state.error?.message ?? 'Çökme ekranından bildirim',
        stack: this.state.error?.stack,
        userNote: 'Kullanıcı çökme ekranından "Hatayı bildir"e bastı',
      });
      this.setState({ reportState: 'sent' });
    } catch (e) {
      console.warn('[ErrorBoundary] rapor gönderilemedi:', e);
      this.setState({ reportState: 'failed' });
    }
  };

  render() {
    if (this.state.hasError) {
      const { reportState } = this.state;
      return (
        <View style={styles.container}>
          <MaterialCommunityIcons name="alert-circle-outline" size={56} color="#D93025" />
          <Text style={styles.title}>Bir şeyler ters gitti</Text>
          <Text style={styles.subtitle}>Uygulama beklenmedik bir hatayla karşılaştı.</Text>
          <Button mode="contained" onPress={() => this.setState({ hasError: false, error: null })} style={styles.button}>
            Tekrar Dene
          </Button>
          <Button
            mode="outlined"
            icon={reportState === 'sent' ? 'check' : 'bug-outline'}
            onPress={this.handleReport}
            loading={reportState === 'sending'}
            disabled={reportState === 'sending' || reportState === 'sent'}
            style={styles.button}
          >
            {reportState === 'sent' ? 'Bildirildi, teşekkürler' : 'Hatayı bildir'}
          </Button>
          {reportState === 'failed' && (
            <Text style={styles.subtitle}>Gönderilemedi, internet bağlantını kontrol et.</Text>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '700', marginTop: 8, color: '#1A1A1A' },
  subtitle: { fontSize: 14, color: '#5F6368', textAlign: 'center', marginBottom: 16 },
  button: { borderRadius: 10 },
});
