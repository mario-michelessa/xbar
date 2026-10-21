import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Language } from '../languages';
import { C } from '../theme';

type Props = {
  existing: Language[];
  onAdd: (l: Language) => Promise<void>;
  onClose: () => void;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function AddLanguageModal({ existing, onAdd, onClose }: Props) {
  const [name, setName] = useState('');
  const [translit, setTranslit] = useState('');
  const [rtl, setRtl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const code = `u-${slug(n) || Date.now()}`;
    if (existing.some((l) => l.code === code || l.name.toLowerCase() === n.toLowerCase())) {
      setError(`${n} is already in the list.`);
      return;
    }
    try {
      await onAdd({ code, name: n, fullName: n, rtl, transliteration: translit.trim() || undefined, custom: true });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Language (e.g. Japanese)"
            placeholderTextColor={C.faint}
            autoFocus
          />
          <TextInput
            style={styles.input}
            value={translit}
            onChangeText={setTranslit}
            placeholder="Transliteration, if non-Latin (e.g. Hepburn romaji)"
            placeholderTextColor={C.faint}
          />
          <Pressable style={styles.check} onPress={() => setRtl((v) => !v)}>
            <Ionicons name={rtl ? 'checkbox' : 'square-outline'} size={20} color={rtl ? C.accent : C.faint} />
            <Text style={styles.checkText}>Right-to-left</Text>
          </Pressable>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={[styles.action, { color: C.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={add} disabled={!name.trim()} hitSlop={8}>
              <Text style={[styles.action, !name.trim() && { color: C.faint }]}>Add</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: C.panel, borderRadius: 8, padding: 16 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 15,
    color: C.text,
    borderRadius: 3,
    marginBottom: 10,
  },
  check: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  checkText: { marginLeft: 8, fontSize: 15, color: C.text },
  error: { color: C.danger, fontSize: 13, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, gap: 24 },
  action: { fontSize: 15, fontWeight: '600', color: C.accent },
});
