import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Uygulama render hatası yakalandı:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <MaterialCommunityIcons name="alert-circle-outline" size={56} color="#D93025" />
          <Text style={styles.title}>Bir şeyler ters gitti</Text>
          <Text style={styles.subtitle}>Uygulama beklenmedik bir hatayla karşılaştı.</Text>
          <Button mode="contained" onPress={() => this.setState({ hasError: false })} style={styles.button}>
            Tekrar Dene
          </Button>
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
