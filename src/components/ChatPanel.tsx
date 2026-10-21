import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderHandlers,
} from 'react-native';
import { allLanguages, getLanguage, type Language } from '../languages';
import type { GeneratedSentence, LLMResponse } from '../llm/types';
import { GENERAL_OPS, SENTENCE_OPS, type Focus, type GeneralOp, type SentenceOp } from '../prompts';
import { effectiveDisplay, type Display } from '../settings';
import { C } from '../theme';
import { IconButton, SentenceItem } from './SentenceItem';

export type UIMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; response: LLMResponse; saveLang: string }
  | { id: number; role: 'error'; text: string };

type Props = {
  language: Language;
  open: boolean;
  onToggle: () => void;
  // Spread on the header (and the closed bar) to drag-resize the panel.
  dragHandlers: GestureResponderHandlers;
  messages: UIMessage[];
  loading: boolean;
  selected: Focus | null;
  display: Display;
  onClearSelected: () => void;
  onSelect: (text: string) => void;
  isSaved: (text: string, langCode: string) => boolean;
  onSave: (s: GeneratedSentence, langCode: string) => void;
  onSend: (text: string) => void;
  onSentenceOp: (op: SentenceOp, target?: Language) => void;
  onGeneralOp: (op: GeneralOp, topic: string) => void;
  onClear: () => void;
  onScrollBegin: () => void;
};

export function ChatPanel(p: Props) {
  const [input, setInput] = useState('');
  // Remembers which focus/language the translate picker was opened for,
  // so it closes automatically when either changes.
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const pickerKey = `${p.language.code}|${p.selected?.text}|${p.selected?.source}`;
  const pickingTarget = pickerFor === pickerKey;
  const setPickingTarget = (v: boolean) => setPickerFor(v ? pickerKey : null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (p.open) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [p.messages.length, p.loading, p.open]);

  const send = () => {
    const text = input.trim();
    if (!text || p.loading) return;
    setInput('');
    p.onSend(text);
  };

  const sentenceOp = (op: SentenceOp) => {
    if (op === 'translate') setPickingTarget(!pickingTarget);
    else p.onSentenceOp(op);
  };

  const canSend = !p.loading && !!input.trim();

  // The header is the same element open or closed, so a drag that starts on
  // the closed bar keeps its responder while the panel opens.
  const header = (
    <View style={styles.header} {...p.dragHandlers}>
      <View style={styles.grip} />
      <View style={styles.headerRow}>
        <Pressable onPress={p.onToggle} hitSlop={10} style={styles.headerLeft}>
          <Ionicons name={p.open ? 'chevron-down' : 'chevron-up'} size={16} color={C.accent} />
          <Text style={styles.headerTitle}>Chat</Text>
          {!p.open && p.selected && (
            <Text style={styles.closedSelected} numberOfLines={1}>
              {p.selected.text}
            </Text>
          )}
        </Pressable>
        {p.open && p.messages.length > 0 && (
          <IconButton name="trash-outline" size={18} color={C.muted} onPress={p.onClear} />
        )}
      </View>
    </View>
  );

  if (!p.open) return <View style={styles.panel}>{header}</View>;

  return (
    <View style={[styles.panel, styles.panelOpen]}>
      {header}

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={p.onScrollBegin}
      >
        {p.messages.map((m) => {
          if (m.role === 'user')
            return (
              <Text key={m.id} style={styles.user} numberOfLines={4}>
                {m.text}
              </Text>
            );
          if (m.role === 'error')
            return (
              <Text key={m.id} style={styles.error}>
                {m.text}
              </Text>
            );
          const r = m.response;
          const lang = getLanguage(m.saveLang);
          const display = effectiveDisplay(p.display, lang);
          const highlighted = p.selected?.source ?? p.selected?.text;
          return (
            <View key={m.id} style={styles.assistant}>
              {!!r.explanation && <Text style={styles.explanation}>{r.explanation}</Text>}
              {!!r.raw && (
                <Text style={styles.explanation} selectable>
                  {r.raw}
                </Text>
              )}
              {r.sentences.map((s, i) => {
                const saved = p.isSaved(s.text, m.saveLang);
                return (
                  <SentenceItem
                    key={i}
                    text={s.text}
                    translation={s.translation}
                    transliteration={s.transliteration}
                    note={s.note}
                    langCode={m.saveLang}
                    rtl={lang.rtl}
                    display={display}
                    selected={s.text === highlighted}
                    onPress={() => p.onSelect(s.text)}
                    action={
                      <IconButton
                        name={saved ? 'checkmark' : 'add'}
                        disabled={saved}
                        onPress={() => p.onSave(s, m.saveLang)}
                      />
                    }
                  />
                );
              })}
            </View>
          );
        })}
        {p.loading && <ActivityIndicator style={{ margin: 12 }} color={C.muted} />}
      </ScrollView>

      {p.selected && (
        <View style={styles.selectedRow}>
          <Text style={styles.selectedText} numberOfLines={1}>
            {p.selected.text}
            {!!p.selected.source && <Text style={styles.selectedSource}>{`  ${p.selected.source}`}</Text>}
          </Text>
          <IconButton name="close" size={18} color={C.muted} onPress={p.onClearSelected} />
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ops} keyboardShouldPersistTaps="handled">
        {pickingTarget
          ? [
              <Ionicons key="to" name="arrow-forward" size={16} color={C.muted} style={styles.opsLabel} />,
              ...allLanguages().filter((l) => l.code !== p.language.code).map((l) => (
                <Op
                  key={l.code}
                  label={l.name}
                  disabled={p.loading}
                  onPress={() => {
                    setPickingTarget(false);
                    p.onSentenceOp('translate', l);
                  }}
                />
              )),
              <Op key="cancel" label="Cancel" onPress={() => setPickingTarget(false)} />,
            ]
          : p.selected
            ? SENTENCE_OPS.map((o) => (
                <Op key={o.id} label={o.label} disabled={p.loading} onPress={() => sentenceOp(o.id)} />
              ))
            : GENERAL_OPS.map((o) => (
                <Op
                  key={o.id}
                  label={o.label}
                  disabled={p.loading}
                  onPress={() => {
                    p.onGeneralOp(o.id, input);
                    setInput('');
                  }}
                />
              ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          multiline
          onSubmitEditing={send}
          submitBehavior="submit"
          returnKeyType="send"
        />
        <Pressable onPress={send} disabled={!canSend} style={styles.sendBtn} hitSlop={6}>
          <Ionicons name="send" size={20} color={canSend ? C.accent : C.faint} />
        </Pressable>
      </View>
    </View>
  );
}

function Op({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.op}>
      <Text style={[styles.opText, disabled && { color: C.faint }]}>{label}</Text>
    </Pressable>
  );
}

// Casts a shadow upwards onto the saved list, so the chat reads as a separate layer.
const PANEL_SHADOW = '0px -4px 12px rgba(0,0,0,0.14)';

const styles = StyleSheet.create({
  closedSelected: { flex: 1, marginLeft: 12, fontSize: 13, color: C.muted },
  grip: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#c5cad3',
    marginTop: 6,
    marginBottom: 6,
  },
  panel: { backgroundColor: C.panel, boxShadow: PANEL_SHADOW },
  panelOpen: { flex: 1 },
  header: {
    backgroundColor: C.chrome,
    paddingBottom: 8,
    zIndex: 1,
    boxShadow: '0px 2px 6px rgba(0,0,0,0.10)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { marginLeft: 6, fontSize: 15, fontWeight: '600', color: C.accent },
  messages: { flex: 1 },
  user: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    margin: 8,
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f0eee9',
    color: C.text,
    fontSize: 14,
    borderRadius: 4,
  },
  assistant: { marginTop: 4 },
  explanation: { paddingHorizontal: 14, paddingVertical: 6, fontSize: 14, color: C.text, lineHeight: 20 },
  error: { margin: 10, fontSize: 13, color: C.danger },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 11,
    paddingRight: 14,
    paddingVertical: 5,
    backgroundColor: C.selected,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  selectedText: { flex: 1, fontSize: 14, color: C.text },
  selectedSource: { fontSize: 12, color: C.faint },
  ops: {
    flexGrow: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
  },
  opsLabel: { alignSelf: 'center', marginHorizontal: 6 },
  op: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginHorizontal: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.accent,
    borderRadius: 3,
  },
  opText: { fontSize: 13, color: C.accent },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  input: {
    flex: 1,
    maxHeight: 90,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: C.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    borderRadius: 3,
  },
  sendBtn: { paddingHorizontal: 12, paddingVertical: 9 },
});
