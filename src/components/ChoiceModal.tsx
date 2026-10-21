import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';

/** Small centered list of options (e.g. part-of-speech picker). */
export function ChoiceModal<T extends string>({ options, value, onPick, onClose }: {
  options: { id: T; label: string }[];
  value?: T | null;
  onPick: (v: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          {options.map((o) => (
            <Pressable key={o.id} onPress={() => onPick(o.id)} style={styles.option}>
              <Text style={[styles.text, o.id === value && styles.active]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: C.panel, borderRadius: 8, paddingVertical: 6, minWidth: 200 },
  option: { paddingHorizontal: 18, paddingVertical: 11 },
  text: { fontSize: 15, color: C.text },
  active: { color: C.accent, fontWeight: '700' },
});
