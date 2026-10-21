import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Portal, Modal, Text, TextInput, Button, useTheme } from 'react-native-paper';
import { sendReport } from '../../services/report/reportService';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  // Çökme ekranından açıldıysa hata bilgisi rapora eklenir
  error?: Error | null;
}

export function ReportProblemModal({ visible, onDismiss, error }: Props) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  function close() {
    setNote('');
    setState('idle');
    onDismiss();
  }

  async function handleSend() {
    setState('sending');
    try {
      await sendReport({
        kind: 'user',
        message: error?.message ?? 'Kullanıcı bildirimi',
        stack: error?.stack,
        userNote: note.trim(),
      });
      setState('sent');
    } catch (e) {
      console.warn('[ReportProblem] rapor gönderilemedi:', e);
      setState('failed');
    }
  }

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={close}
        style={styles.wrap}
        contentContainerStyle={[styles.card, { backgroundColor: theme.colors.surface }]}
      >
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Sorun bildir</Text>
        {state === 'sent' ? (
          <>
            <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
              Teşekkürler, bildirimin ulaştı. Uygulamanın son kayıtları da eklendi.
            </Text>
            <Button mode="contained" onPress={close} style={styles.single}>Tamam</Button>
          </>
        ) : (
          <>
            <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
              Ne oldu, ne yapıyordun? Kısaca yaz; uygulamanın son kayıtları otomatik eklenir.
            </Text>
            <TextInput
              mode="outlined"
              value={note}
              onChangeText={setNote}
              placeholder="Örn. Urla rotasında saatler yanlış çıktı"
              multiline
              numberOfLines={4}
              maxLength={2000}
              style={styles.input}
            />
            {state === 'failed' && (
              <Text style={[styles.body, { color: theme.colors.error }]}>
                Gönderilemedi. İnternet bağlantını kontrol edip tekrar dene.
              </Text>
            )}
            <Button
              mode="contained"
              icon="send"
              onPress={handleSend}
              loading={state === 'sending'}
              disabled={state === 'sending' || (!note.trim() && !error)}
              style={styles.single}
            >
              Gönder
            </Button>
          </>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'flex-start' },
  card: { marginHorizontal: 16, marginTop: 56, borderRadius: 20, padding: 20, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19 },
  input: { minHeight: 100 },
  single: { alignSelf: 'flex-end', marginTop: 4 },
});
