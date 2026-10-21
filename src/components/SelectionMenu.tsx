import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Language } from '../languages';
import { POS_LABELS, type GeneratedSentence } from '../llm/types';
import type { TextSelection } from '../selection';
import { C } from '../theme';
import { entryStyles, IconButton } from './SentenceItem';

export type MenuAction = 'explain' | 'sentence' | 'vocab' | 'select';

const ITEMS: { id: MenuAction; label: string }[] = [
  { id: 'explain', label: 'Explain' },
  { id: 'sentence', label: '+ Sentence' },
  { id: 'vocab', label: '+ Vocab' },
  { id: 'select', label: 'Select' },
];

const MENU_HEIGHT = 40;

/** Floating menu shown under the text field holding the selection. */
export function SelectionMenu({ sel, offsetY, windowHeight, onAction }: {
  sel: TextSelection;
  offsetY: number; // window y of the overlay's parent
  windowHeight: number;
  onAction: (a: MenuAction) => void;
}) {
  const below = sel.anchor.y + sel.anchor.height + 6;
  const top = below + MENU_HEIGHT < windowHeight - 8 ? below : sel.anchor.y - MENU_HEIGHT - 6;
  return (
    <View pointerEvents="box-none" style={[styles.menuWrap, { top: top - offsetY }]}>
      <View style={styles.menu}>
        {ITEMS.map((it) => (
          <Pressable key={it.id} onPress={() => onAction(it.id)} style={styles.menuItem} hitSlop={4}>
            <Text style={styles.menuText}>{it.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export type ExplainState = {
  sel: TextSelection;
  language: Language;
  result?: { entry: GeneratedSentence; explanation?: string };
  error?: string;
};

/** Popup with the LLM's translation + explanation of a selected fragment. */
export function ExplainPopup({ state, onClose, onAction }: {
  state: ExplainState;
  onClose: () => void;
  onAction: (a: Exclude<MenuAction, 'explain'>) => void;
}) {
  const { sel, language, result, error } = state;
  const rtl = language.rtl;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps so they don't close the popup. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <ScrollView>
            <Text style={[entryStyles.text, rtl && entryStyles.rtl]} selectable>
              {sel.fragment}
            </Text>
            {!!result?.entry.transliteration && (
              <Text style={[entryStyles.transliteration, rtl && entryStyles.rtlAlign]}>
                {result.entry.transliteration}
              </Text>
            )}
            {!!result?.entry.translation && <Text style={entryStyles.translation}>{result.entry.translation}</Text>}
            {!!(result?.entry.note || result?.entry.pos) && (
              <Text style={entryStyles.note}>
                {[result.entry.pos && POS_LABELS[result.entry.pos], result.entry.note].filter(Boolean).join(' · ')}
              </Text>
            )}
            {!!result?.explanation && <Text style={styles.explanation}>{result.explanation}</Text>}
            {!result && !error && <ActivityIndicator style={{ marginTop: 14 }} color={C.muted} />}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable onPress={() => onAction('sentence')} style={styles.action} hitSlop={6}>
              <Text style={styles.actionText}>+ Sentence</Text>
            </Pressable>
            <Pressable onPress={() => onAction('vocab')} style={styles.action} hitSlop={6}>
              <Text style={styles.actionText}>+ Vocab</Text>
            </Pressable>
            <Pressable onPress={() => onAction('select')} style={styles.action} hitSlop={6}>
              <Text style={styles.actionText}>Select</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <IconButton name="close" color={C.muted} onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menuWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  menu: {
    flexDirection: 'row',
    height: MENU_HEIGHT,
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: C.menu,
    borderRadius: 8,
    boxShadow: '0px 3px 10px rgba(0,0,0,0.25)',
  },
  menuItem: { paddingHorizontal: 12, paddingVertical: 8 },
  menuText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 20 },
  card: { maxHeight: '75%', backgroundColor: C.panel, borderRadius: 8, padding: 16 },
  explanation: { fontSize: 14, color: C.text, lineHeight: 20, marginTop: 10 },
  error: { fontSize: 13, color: C.danger, marginTop: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  action: { marginRight: 18, paddingVertical: 4 },
  actionText: { fontSize: 14, fontWeight: '600', color: C.accent },
});
