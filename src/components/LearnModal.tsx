import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { VocabItem } from '../db';
import type { Language } from '../languages';
import { POS_LABELS } from '../llm/types';
import type { LearnFront } from '../settings';
import { C } from '../theme';
import { entryStyles } from './SentenceItem';

// Anki-like weighting: a card's chance of being picked is proportional to its weight.
const MIN_WEIGHT = 1 / 64;
export const RATINGS = [
  { id: 'hard', label: 'Hard', color: C.danger, next: () => 1 },
  { id: 'medium', label: 'Medium', color: C.accent, next: (w: number) => Math.max(MIN_WEIGHT, w / 2) },
  { id: 'easy', label: 'Easy', color: '#2e7d32', next: (w: number) => Math.max(MIN_WEIGHT, w / 4) },
] as const;

/** Weighted random pick, avoiding the card just shown when possible. */
function pick(items: VocabItem[], excludeId?: number): VocabItem | undefined {
  const pool = items.length > 1 ? items.filter((i) => i.id !== excludeId) : items;
  const total = pool.reduce((s, i) => s + (i.weight || 1), 0);
  let r = Math.random() * total;
  for (const i of pool) {
    r -= i.weight || 1;
    if (r <= 0) return i;
  }
  return pool[pool.length - 1];
}

type Props = {
  items: VocabItem[];
  language: Language;
  front: LearnFront;
  onFrontChange: (f: LearnFront) => void;
  onRate: (id: number, weight: number) => void;
  onClose: () => void;
};

export function LearnModal({ items, language, front, onFrontChange, onRate, onClose }: Props) {
  const [cardId, setCardId] = useState(() => pick(items)?.id);
  const [revealed, setRevealed] = useState(false);
  const card = items.find((i) => i.id === cardId) ?? items[0];
  const hasTranslit = !!language.transliteration;
  const effFront: LearnFront = front === 'textTranslit' && !hasTranslit ? 'text' : front;

  const fronts: { id: LearnFront; label: string }[] = [
    { id: 'text', label: language.name },
    ...(hasTranslit ? [{ id: 'textTranslit' as const, label: `${language.name} + abc` }] : []),
    { id: 'translation', label: 'Translation' },
  ];

  const rate = (next: (w: number) => number) => {
    if (!card) return;
    const weight = next(card.weight || 1);
    onRate(card.id, weight);
    const updated = items.map((i) => (i.id === card.id ? { ...i, weight } : i));
    setCardId(pick(updated, card.id)?.id);
    setRevealed(false);
  };

  const rtl = language.rtl;
  const text = card && <Text style={[styles.big, rtl && entryStyles.rtl, rtl && styles.bigRtl]}>{card.text}</Text>;
  const translit = card?.transliteration && (
    <Text style={[entryStyles.transliteration, styles.center]}>{card.transliteration}</Text>
  );
  const translation = card && <Text style={styles.translation}>{card.translation || '—'}</Text>;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.top}>
            {fronts.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => {
                  onFrontChange(f.id);
                  setRevealed(false);
                }}
                style={[styles.chip, effFront === f.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, effFront === f.id && { color: C.panel }]}>{f.label}</Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.muted} />
            </Pressable>
          </View>

          {card ? (
            <>
              <View style={styles.face}>
                {effFront === 'translation' ? translation : text}
                {effFront === 'textTranslit' && translit}
                {!!card.pos && <Text style={styles.pos}>{POS_LABELS[card.pos]}</Text>}
              </View>
              <View style={styles.divider} />
              <View style={styles.face}>
                {revealed &&
                  (effFront === 'translation' ? (
                    <>
                      {text}
                      {translit}
                    </>
                  ) : (
                    <>
                      {translation}
                      {!!card.note && <Text style={[entryStyles.note, styles.center]}>{card.note}</Text>}
                    </>
                  ))}
              </View>
              {revealed ? (
                <View style={styles.ratings}>
                  {RATINGS.map((r) => (
                    <Pressable key={r.id} onPress={() => rate(r.next)} style={[styles.rating, { borderColor: r.color }]}>
                      <Text style={[styles.ratingText, { color: r.color }]}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Pressable onPress={() => setRevealed(true)} style={styles.reveal}>
                  <Text style={styles.revealText}>Reveal</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={styles.translation}>—</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: C.panel, borderRadius: 10, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.accent,
    borderRadius: 3,
  },
  chipActive: { backgroundColor: C.accent },
  chipText: { fontSize: 12, color: C.accent },
  face: { minHeight: 90, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  big: { fontSize: 30, lineHeight: 40, color: C.text, textAlign: 'center' },
  bigRtl: { textAlign: 'center', fontSize: 32, lineHeight: 46 },
  center: { textAlign: 'center' },
  translation: { fontSize: 20, color: C.text, textAlign: 'center' },
  pos: { fontSize: 11, color: C.faint, marginTop: 6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line },
  reveal: { marginTop: 8, paddingVertical: 12, borderRadius: 6, backgroundColor: C.accent },
  revealText: { color: C.panel, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  ratings: { flexDirection: 'row', gap: 8, marginTop: 8 },
  rating: { flex: 1, paddingVertical: 12, borderRadius: 6, borderWidth: 1.5 },
  ratingText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
