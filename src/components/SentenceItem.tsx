import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Display } from '../settings';
import { C } from '../theme';
import { SelectableText } from './SelectableText';

type Props = {
  text: string;
  translation: string;
  transliteration?: string | null;
  note?: string | null;
  langCode: string;
  rtl?: boolean;
  // Effective visibility for this card's language (see effectiveDisplay).
  display: Display;
  selected?: boolean;
  onPress?: () => void;
  action?: ReactNode;
  // Small category pill (vocabulary part of speech); `null` shows a faint placeholder.
  tag?: string | null;
  onTagPress?: () => void;
};

export function SentenceItem(p: Props) {
  const { display: d, rtl } = p;
  return (
    <Pressable onPress={p.onPress} style={[styles.item, p.selected && styles.selected]}>
      <View style={styles.body}>
        {d.text && (
          <SelectableText
            text={p.text}
            style={[entryStyles.text, rtl && entryStyles.rtl]}
            onPress={p.onPress}
            langCode={p.langCode}
            translation={p.translation}
            transliteration={p.transliteration}
          />
        )}
        {d.transliteration && !!p.transliteration && (
          <Text style={[entryStyles.transliteration, rtl && entryStyles.rtlAlign]}>{p.transliteration}</Text>
        )}
        {d.translation && !!p.translation && <Text style={entryStyles.translation}>{p.translation}</Text>}
        {(p.tag !== undefined || (d.note && !!p.note)) && (
          <View style={styles.meta}>
            {p.tag !== undefined && (
              <Pressable onPress={p.onTagPress} hitSlop={6} style={[styles.tag, !p.tag && styles.tagEmpty]}>
                <Text style={[styles.tagText, !p.tag && { color: C.faint }]}>{p.tag ?? 'type'}</Text>
              </Pressable>
            )}
            {d.note && !!p.note && <Text style={[entryStyles.note, styles.metaNote]}>{p.note}</Text>}
          </View>
        )}
      </View>
      {p.action}
    </Pressable>
  );
}

/** Text styles shared by every place that shows a sentence or word. */
export const entryStyles = StyleSheet.create({
  text: { fontSize: 18, color: C.text, lineHeight: 25 },
  rtl: { textAlign: 'right', writingDirection: 'rtl', fontSize: 21, lineHeight: 32 },
  rtlAlign: { textAlign: 'right' },
  transliteration: { fontSize: 14, color: C.accent, fontStyle: 'italic', marginTop: 1 },
  translation: { fontSize: 14, color: C.muted, marginTop: 2 },
  note: { fontSize: 12, color: C.faint, marginTop: 2 },
});

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  selected: { backgroundColor: C.selected, borderLeftWidth: 3, borderLeftColor: C.accent, paddingLeft: 11 },
  body: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 3 },
  metaNote: { flexShrink: 1, marginTop: 0 },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: 6,
    borderRadius: 3,
    backgroundColor: C.selected,
  },
  tagEmpty: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  tagText: { fontSize: 11, color: C.accent },
});

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function IconButton({ name, onPress, color = C.accent, disabled, size = 20 }: {
  name: IconName;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={buttonStyles.btn}>
      <Ionicons name={name} size={size} color={disabled ? C.faint : color} />
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  btn: { paddingLeft: 12, paddingVertical: 2 },
});
