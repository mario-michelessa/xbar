import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { Language } from '../languages';
import { PARTS_OF_SPEECH, POS_LABELS, type PartOfSpeech } from '../llm/types';
import { effectiveDisplay, type Display } from '../settings';
import { C } from '../theme';
import { IconButton, SentenceItem } from './SentenceItem';

// Common shape of saved sentences and vocabulary items.
export type Entry = {
  id: number;
  text: string;
  translation: string;
  transliteration: string | null;
  note: string | null;
  source?: string | null;
  pos?: PartOfSpeech | null;
  weight?: number; // vocabulary: Learn probability weight
};

type SortMode = 'newest' | 'weight' | 'az';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'weight', label: 'Most likely in Learn' },
  { id: 'az', label: 'A–Z (English)' },
];

// Case- and accent-insensitive, so "nī" is found by typing "ni".
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export type ListMode = 'sentences' | 'vocab';

type Props = {
  mode: ListMode;
  onModeChange: (m: ListMode) => void;
  counts: Record<ListMode, number>;
  items: Entry[];
  language: Language;
  display: Display;
  isSelected: (e: Entry) => boolean;
  onSelect: (e: Entry) => void;
  onDelete: (e: Entry) => void;
  onScrollBegin: () => void;
  // Receives the vocabulary items currently shown (after filter + search).
  onLearn: (ids: number[]) => void;
  onTagPress: (e: Entry) => void;
  // Items saved by older versions that miss fields; 0 hides the refresh icon.
  missingCount: number;
  refreshing: boolean;
  onRefresh: () => void;
};

const TABS: { id: ListMode; label: string }[] = [
  { id: 'sentences', label: 'Sentences' },
  { id: 'vocab', label: 'Vocabulary' },
];

export function EntryList(p: Props) {
  const display = effectiveDisplay(p.display, p.language);
  const isVocab = p.mode === 'vocab';

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  // Vocabulary category filter; null = all.
  const [posFilter, setPosFilter] = useState<PartOfSpeech[] | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const filterRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();

  const togglePos = (pos: PartOfSpeech) => {
    const cur = posFilter ?? [];
    const next = cur.includes(pos) ? cur.filter((x) => x !== pos) : [...cur, pos];
    setPosFilter(next.length === 0 || next.length === PARTS_OF_SPEECH.length ? null : next);
  };

  const q = fold(query.trim());
  let items = p.items;
  if (isVocab && posFilter) items = items.filter((e) => !!e.pos && posFilter.includes(e.pos));
  if (searching && q)
    items = items.filter(
      (e) =>
        e.text.toLowerCase().includes(query.trim().toLowerCase()) ||
        fold(e.transliteration ?? '').includes(q) ||
        fold(e.translation).includes(q),
    );
  // `p.items` arrive newest first.
  if (isVocab && sort === 'weight') items = [...items].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  if (isVocab && sort === 'az')
    items = [...items].sort((a, b) => fold(a.translation).localeCompare(fold(b.translation)));

  const filterActive = isVocab && (!!posFilter || sort !== 'newest');
  const openMenu = () =>
    filterRef.current?.measureInWindow((x, y, w, h) =>
      setMenuPos({ top: y + h + 4, right: Math.max(8, windowWidth - x - w) }),
    );

  const confirmDelete = (e: Entry) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${e.text}"?`)) p.onDelete(e);
      return;
    }
    Alert.alert('Delete?', e.text, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => p.onDelete(e) },
    ]);
  };

  const confirmRefresh = () => {
    const msg = `Ask the LLM to fill missing fields of ${p.missingCount} item${p.missingCount > 1 ? 's' : ''}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) p.onRefresh();
      return;
    }
    Alert.alert('Complete missing fields', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Fill', onPress: p.onRefresh },
    ]);
  };

  return (
    <View style={styles.list}>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => p.onModeChange(t.id)} hitSlop={6} style={styles.tab}>
            <Text style={[styles.tabLabel, p.mode === t.id && styles.tabActive]}>
              {t.label} · {p.counts[t.id]}
            </Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        {p.refreshing ? (
          <ActivityIndicator size="small" color={C.faint} style={styles.headerBtn} />
        ) : (
          p.missingCount > 0 && (
            <IconButton name="sparkles-outline" size={15} color={C.faint} onPress={confirmRefresh} />
          )
        )}
        <IconButton
          name="search"
          size={17}
          color={searching ? C.accent : C.muted}
          onPress={() => {
            setSearching((v) => !v);
            setQuery('');
          }}
        />
        {isVocab && (
          <View ref={filterRef} collapsable={false}>
            <IconButton
              name={filterActive ? 'funnel' : 'funnel-outline'}
              size={17}
              color={filterActive ? C.accent : C.muted}
              onPress={openMenu}
            />
          </View>
        )}
        {isVocab && (
          <Pressable
            onPress={() => p.onLearn(items.map((e) => e.id))}
            disabled={!items.length}
            hitSlop={6}
            style={styles.headerBtn}
          >
            <Text style={[styles.learn, !items.length && { color: C.faint }]}>Learn</Text>
          </Pressable>
        )}
      </View>
      {searching && (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={C.faint}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!query && <IconButton name="close-circle" size={18} color={C.faint} onPress={() => setQuery('')} />}
        </View>
      )}

      <Modal transparent visible={!!menuPos} animationType="fade" statusBarTranslucent onRequestClose={() => setMenuPos(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuPos(null)}>
          <View style={[styles.menu, menuPos ?? undefined]}>
            {SORTS.map((o) => (
              <Option key={o.id} label={o.label} on={sort === o.id} radio onPress={() => setSort(o.id)} />
            ))}
            <View style={styles.menuDivider} />
            <Option label="All" on={!posFilter} onPress={() => setPosFilter(null)} />
            {PARTS_OF_SPEECH.map((pos) => (
              <Option key={pos} label={POS_LABELS[pos]} on={!!posFilter?.includes(pos)} onPress={() => togglePos(pos)} />
            ))}
          </View>
        </Pressable>
      </Modal>
      <FlatList
        data={items}
        keyExtractor={(e) => String(e.id)}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={p.onScrollBegin}
        renderItem={({ item }) => (
          <SentenceItem
            text={item.text}
            translation={item.translation}
            transliteration={item.transliteration}
            note={[item.note, item.source].filter(Boolean).join(' · ')}
            langCode={p.language.code}
            rtl={p.language.rtl}
            display={display}
            selected={p.isSelected(item)}
            onPress={() => p.onSelect(item)}
            tag={p.mode === 'vocab' ? (item.pos ? POS_LABELS[item.pos] : null) : undefined}
            onTagPress={() => p.onTagPress(item)}
            action={<IconButton name="close" size={18} color={C.faint} onPress={() => confirmDelete(item)} />}
          />
        )}
      />
    </View>
  );
}

function Option({ label, on, radio, onPress }: { label: string; on: boolean; radio?: boolean; onPress: () => void }) {
  const icon = radio ? (on ? 'radio-button-on' : 'radio-button-off') : on ? 'checkbox' : 'square-outline';
  return (
    <Pressable onPress={onPress} style={styles.option} hitSlop={2}>
      <Ionicons name={icon} size={19} color={on ? C.accent : C.faint} />
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  search: { flex: 1, paddingVertical: 7, fontSize: 15, color: C.text },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: C.panel,
    borderRadius: 6,
    paddingVertical: 6,
    minWidth: 210,
    boxShadow: '0px 4px 14px rgba(0,0,0,0.18)',
  },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 4 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7 },
  optionText: { marginLeft: 10, fontSize: 15, color: C.text },
  list: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  tab: { paddingHorizontal: 8, paddingVertical: 7 },
  tabLabel: { fontSize: 13, color: C.faint },
  tabActive: { color: C.text, fontWeight: '600' },
  headerBtn: { paddingLeft: 14, paddingRight: 6, paddingVertical: 6 },
  learn: { fontSize: 14, fontWeight: '700', color: C.accent },
});
