import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { getLanguage, type Language } from '../languages';
import type { Display } from '../settings';
import { C } from '../theme';
import { AddLanguageModal } from './AddLanguageModal';

type Props = {
  value: string;
  onChange: (code: string) => void;
  onSettings: () => void;
  display: Display;
  onDisplayChange: (d: Display) => void;
  languages: Language[];
  onAddLanguage: (l: Language) => Promise<void>;
  onRemoveLanguage: (code: string) => void;
};

export function LanguageBar(p: Props) {
  const { value, onChange, onSettings, display, onDisplayChange, languages } = p;
  const [adding, setAdding] = useState(false);
  // Window position of the dropdown (anchored under the abc button); null = closed.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const abcRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();
  const openMenu = () =>
    abcRef.current?.measureInWindow((x, y, w, h) => setMenuPos({ top: y + h + 6, right: Math.max(8, windowWidth - x - w) }));
  const closeMenu = () => setMenuPos(null);
  const language = getLanguage(value);

  const options: { key: keyof Display; label: string }[] = [
    { key: 'text', label: language.name },
    ...(language.transliteration ? [{ key: 'transliteration' as const, label: 'Transliteration' }] : []),
    { key: 'translation', label: 'Translation' },
    { key: 'note', label: 'Notes' },
  ];

  const toggle = (k: keyof Display) => {
    const next = { ...display, [k]: !display[k] };
    // At least one of text / transliteration / translation stays visible.
    const visible = next.text || next.translation || (next.transliteration && !!language.transliteration);
    if (visible) onDisplayChange(next);
  };

  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {languages.map((l) => {
          const active = l.code === value;
          const remove = () =>
            Alert.alert(`Remove ${l.name}?`, 'Its saved sentences and vocabulary are kept.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => p.onRemoveLanguage(l.code) },
            ]);
          return (
            <Pressable
              key={l.code}
              onPress={() => onChange(l.code)}
              onLongPress={l.custom ? remove : undefined}
              style={styles.item}
              hitSlop={6}
            >
              <Text style={[styles.label, active && styles.active]}>{l.name}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setAdding(true)} style={styles.item} hitSlop={6} accessibilityLabel="Add language">
          <Ionicons name="add" size={18} color={C.faint} />
        </Pressable>
      </ScrollView>
      <Pressable ref={abcRef} onPress={openMenu} hitSlop={8} style={styles.abc} accessibilityLabel="Visible parts">
        <Text style={styles.abcText}>abc</Text>
      </Pressable>
      <Pressable onPress={onSettings} hitSlop={10} style={styles.settings}>
        <Ionicons name="settings-outline" size={20} color={C.muted} />
      </Pressable>

      <Modal transparent visible={!!menuPos} animationType="fade" statusBarTranslucent onRequestClose={closeMenu}>
        <Pressable style={styles.backdrop} onPress={closeMenu}>
          <View style={[styles.menu, menuPos ?? undefined]}>
            {options.map((o) => (
              <Pressable key={o.key} onPress={() => toggle(o.key)} style={styles.option} hitSlop={4}>
                <Ionicons
                  name={display[o.key] ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={display[o.key] ? C.accent : C.faint}
                />
                <Text style={styles.optionText}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      {adding && <AddLanguageModal existing={languages} onAdd={p.onAddLanguage} onClose={() => setAdding(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  row: { paddingHorizontal: 8, alignItems: 'center' },
  item: { paddingHorizontal: 8, paddingVertical: 10 },
  label: { fontSize: 15, color: C.muted },
  active: { color: C.text, fontWeight: '700', textDecorationLine: 'underline' },
  abc: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 3,
  },
  abcText: { fontSize: 12, fontStyle: 'italic', color: C.accent },
  settings: { paddingHorizontal: 14, paddingVertical: 8 },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: C.panel,
    borderRadius: 6,
    paddingVertical: 6,
    minWidth: 180,
    boxShadow: '0px 4px 14px rgba(0,0,0,0.18)',
  },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9 },
  optionText: { marginLeft: 10, fontSize: 15, color: C.text },
});
