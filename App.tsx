import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChatPanel, type UIMessage } from './src/components/ChatPanel';
import { EntryList, type Entry, type ListMode } from './src/components/EntryList';
import { ChoiceModal } from './src/components/ChoiceModal';
import { LanguageBar } from './src/components/LanguageBar';
import { LearnModal } from './src/components/LearnModal';
import { ExplainPopup, SelectionMenu, type ExplainState, type MenuAction } from './src/components/SelectionMenu';
import { SettingsScreen } from './src/components/SettingsScreen';
import {
  addCustomLanguage,
  addSentence,
  addVocab,
  deleteCustomLanguage,
  deleteSentence,
  deleteVocab,
  listCustomLanguages,
  listSentences,
  listVocab,
  setVocabWeight,
  updateSentence,
  updateVocab,
  type EntryPatch,
  type NewEntry,
  type Sentence,
  type VocabItem,
} from './src/db';
import { allLanguages, getLanguage, setCustomLanguages, type Language } from './src/languages';
import {
  LLMError,
  POS_LABELS,
  PARTS_OF_SPEECH,
  type ChatMessage,
  type GeneratedSentence,
  type LLMProvider,
} from './src/llm/types';
import {
  buildSystemPrompt,
  fillPrompt,
  focusHeader,
  generalOpPrompt,
  lookupPrompt,
  sentenceOpPrompt,
  SENTENCE_OPS,
  type Focus,
  type GeneralOp,
  type SentenceOp,
} from './src/prompts';
import { SelectionContext, type TextSelection } from './src/selection';
import { createProvider, defaultSettings, loadSettings, saveSettings, type Display, type Settings } from './src/settings';
import { C } from './src/theme';
import { useChatDrag } from './src/useChatDrag';

// Messages sent to the LLM carry the full prompt; the UI shows a short label.
type Turn = UIMessage & { langCode: string; prompt?: string };

type Lookup = { entry: GeneratedSentence; explanation?: string };

const HISTORY_TURNS = 8;
const FILL_CHUNK = 12;

const POS_OPTIONS = PARTS_OF_SPEECH.map((id) => ({ id, label: POS_LABELS[id] }));

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isWhole = (sel: TextSelection) => sel.fragment === sel.source.trim();
const focusOf = (sel: TextSelection): Focus =>
  isWhole(sel) ? { text: sel.source } : { text: sel.fragment, source: sel.source };

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const [languages, setLanguages] = useState(allLanguages);
  const [langCode, setLangCode] = useState(languages[0].code);
  const language = getLanguage(langCode);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [listMode, setListMode] = useState<ListMode>('sentences');
  const [sessionSaved, setSessionSaved] = useState<Set<string>>(new Set());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selected, setSelected] = useState<Focus | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const nextId = useRef(1);
  // Ids of the vocabulary items being studied (the list's current filter); null = Learn closed.
  const [learnIds, setLearnIds] = useState<number[] | null>(null);
  const [posFor, setPosFor] = useState<Entry | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Inline text selection (see src/selection.ts).
  const [textSel, setTextSel] = useState<{ owner: string; sel: TextSelection } | null>(null);
  const [clearToken, setClearToken] = useState(0);
  const [explain, setExplain] = useState<ExplainState | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookups = useRef(new Map<string, Promise<Lookup>>());
  const rootRef = useRef<View>(null);
  const [rootY, setRootY] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  const report = useCallback((owner: string, sel: TextSelection | null) => {
    setTextSel((cur) => (sel ? { owner, sel } : cur?.owner === owner ? null : cur));
  }, []);
  const clearSelection = useCallback(() => {
    setTextSel(null);
    setClearToken((t) => t + 1);
  }, []);
  const selectionCtx = useMemo(() => ({ report, clearToken }), [report, clearToken]);

  const chat = useChatDrag(clearSelection);

  useEffect(() => {
    loadSettings().then(setSettings).catch(() => {});
    listCustomLanguages()
      .then((custom) => {
        setCustomLanguages(custom);
        setLanguages(allLanguages());
      })
      .catch((e) => console.warn('load languages', e));
  }, []);

  const onAddLanguage = async (l: Language) => {
    await addCustomLanguage(l);
    setCustomLanguages([...languages.filter((x) => x.custom), l]);
    setLanguages(allLanguages());
    changeLanguage(l.code);
  };

  const onRemoveLanguage = async (code: string) => {
    await deleteCustomLanguage(code);
    setCustomLanguages(languages.filter((x) => x.custom && x.code !== code));
    setLanguages(allLanguages());
    if (code === langCode) changeLanguage(allLanguages()[0].code);
  };

  const refresh = useCallback(async () => {
    const [s, v] = await Promise.all([listSentences(langCode), listVocab(langCode)]);
    setSentences(s);
    setVocab(v);
  }, [langCode]);

  useEffect(() => {
    refresh().catch((e) => console.warn('load sentences', e));
  }, [refresh]);

  const changeLanguage = (code: string) => {
    if (code === langCode) return;
    setLangCode(code);
    setSelected(null);
    clearSelection();
  };

  const provider: LLMProvider = useMemo(() => createProvider(settings), [settings]);

  const run = async (label: string, prompt: string, responseLang: string = langCode) => {
    if (loading) return;
    const userTurn: Turn = { id: nextId.current++, role: 'user', text: label, prompt, langCode };
    // History: only previous turns for the current language, so switching
    // language gives the model a clean context.
    const history: ChatMessage[] = turns
      .filter((t) => t.langCode === langCode && t.role !== 'error')
      .slice(-HISTORY_TURNS)
      .map((t): ChatMessage => {
        if (t.role === 'assistant') {
          const r = t.response;
          return { role: 'assistant', content: r.raw ?? JSON.stringify({ explanation: r.explanation, sentences: r.sentences }) };
        }
        return { role: 'user', content: t.prompt ?? t.text };
      });
    setTurns((ts) => [...ts, userTurn]);
    setLoading(true);
    try {
      const response = await provider.chat({
        messages: [
          { role: 'system', content: buildSystemPrompt(language) },
          ...history,
          { role: 'user', content: prompt },
        ],
      });
      setTurns((ts) => [
        ...ts,
        { id: nextId.current++, role: 'assistant', response, saveLang: responseLang, langCode },
      ]);
    } catch (e) {
      setTurns((ts) => [...ts, { id: nextId.current++, role: 'error', text: errorText(e), langCode }]);
    } finally {
      setLoading(false);
    }
  };

  const onSend = (text: string) => {
    const prompt = selected ? focusHeader(selected) + text : text;
    run(text, prompt);
  };

  const onSentenceOp = (op: SentenceOp, target?: Language) => {
    if (!selected) return;
    const base = SENTENCE_OPS.find((o) => o.id === op)?.label ?? op;
    const label = target ? `${base} → ${target.name}` : base;
    run(`${label}: ${selected.text}`, sentenceOpPrompt(op, language, selected, target), target?.code);
  };

  const onGeneralOp = (op: GeneralOp, topic: string) => {
    const prompt = generalOpPrompt(op, language, topic);
    run(prompt, prompt);
  };

  const key = (code: string, text: string) => `${code}\u0000${text}`;
  const isSaved = (text: string, code: string) =>
    sessionSaved.has(key(code, text)) || (code === langCode && sentences.some((s) => s.text === text));

  const onSave = async (s: GeneratedSentence, code: string) => {
    setSessionSaved((prev) => new Set(prev).add(key(code, s.text)));
    try {
      await addSentence(code, s);
      if (code === langCode) await refresh();
    } catch (e) {
      console.warn('save', e);
      setSessionSaved((prev) => {
        const next = new Set(prev);
        next.delete(key(code, s.text));
        return next;
      });
    }
  };

  const onDelete = async (id: number) => {
    const s = sentences.find((x) => x.id === id);
    await deleteSentence(id);
    if (s) {
      setSessionSaved((prev) => {
        const next = new Set(prev);
        next.delete(key(s.languageCode, s.text));
        return next;
      });
      if (s.text === (selected?.source ?? selected?.text)) setSelected(null);
    }
    await refresh();
  };

  const onDeleteVocab = async (id: number) => {
    await deleteVocab(id);
    await refresh();
  };

  // Tapping a whole sentence selects it (or clears it if it is already the focus).
  const toggleSelected = (text: string) =>
    setSelected((cur) => (cur && !cur.source && cur.text === text ? null : { text }));

  const showToast = (ok: boolean, text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ok, text });
    toastTimer.current = setTimeout(() => setToast(null), ok ? 1800 : 4000);
  };

  // Translation + explanation of a selection; cached so Explain then "+ Vocab" asks only once.
  const lookup = (sel: TextSelection): Promise<Lookup> => {
    const k = `${sel.langCode}\u0000${sel.source}\u0000${sel.fragment}`;
    let p = lookups.current.get(k);
    if (!p) {
      const lang = getLanguage(sel.langCode);
      const focus = focusOf(sel);
      p = provider
        .chat({
          messages: [
            { role: 'system', content: buildSystemPrompt(lang) },
            { role: 'user', content: lookupPrompt(lang, focus) },
          ],
        })
        .then((r) => {
          const hit = r.sentences.find((s) => s.text === focus.text) ?? r.sentences[0];
          if (!hit) throw new LLMError(r.raw ? r.raw.slice(0, 200) : 'The LLM did not return a translation.');
          return { entry: { ...hit, text: focus.text }, explanation: r.explanation };
        });
      p.catch(() => lookups.current.delete(k));
      lookups.current.set(k, p);
    }
    return p;
  };

  const quickSave = async (kind: 'sentence' | 'vocab', sel: TextSelection) => {
    const whole = isWhole(sel);
    let entry: NewEntry;
    let warning = '';
    if (whole && sel.translation) {
      entry = { text: sel.source, translation: sel.translation, transliteration: sel.transliteration ?? undefined };
    } else {
      try {
        const { entry: e } = await lookup(sel);
        entry = { text: e.text, translation: e.translation, transliteration: e.transliteration, note: e.note, pos: e.pos };
      } catch (e) {
        entry = { text: whole ? sel.source : sel.fragment, translation: '' };
        warning = ` without translation (${errorText(e)})`;
      }
    }
    try {
      if (kind === 'sentence') {
        await addSentence(sel.langCode, entry);
        setSessionSaved((prev) => new Set(prev).add(key(sel.langCode, entry.text)));
      } else {
        await addVocab(sel.langCode, { ...entry, source: whole ? undefined : sel.source });
      }
      if (sel.langCode === langCode) await refresh();
      showToast(!warning, `${kind === 'sentence' ? 'Sentence saved' : 'Added to vocabulary'}${warning}`);
    } catch (e) {
      showToast(false, errorText(e));
    }
  };

  const applyAsContext = (focus: Focus, code: string) => {
    if (code !== langCode) setLangCode(code);
    setSelected(focus);
    chat.setOpen(true);
  };

  const onSelectionAction = (action: MenuAction, sel: TextSelection) => {
    clearSelection();
    switch (action) {
      case 'explain': {
        setExplain({ sel, language: getLanguage(sel.langCode) });
        const update = (patch: Partial<ExplainState>) =>
          setExplain((cur) => (cur?.sel === sel ? { ...cur, ...patch } : cur));
        lookup(sel).then(
          (result) => update({ result }),
          (e) => update({ error: errorText(e) }),
        );
        break;
      }
      case 'sentence':
      case 'vocab':
        quickSave(action, sel);
        break;
      case 'select':
        applyAsContext(focusOf(sel), sel.langCode);
        break;
    }
  };

  const setDisplay = (display: Display) => saveSetting({ ...settings, display });

  const listItems: Entry[] = listMode === 'sentences' ? sentences : vocab;

  // Items saved by older versions of the app can miss these fields.
  const isMissing = (e: Entry) =>
    !e.translation || (!!language.transliteration && !e.transliteration) || (listMode === 'vocab' && !e.pos);
  const missing = listItems.filter(isMissing);

  const fillMissing = async () => {
    const isVocab = listMode === 'vocab';
    const items = missing;
    const update = isVocab ? updateVocab : updateSentence;
    setRefreshing(true);
    let updated = 0;
    try {
      for (let i = 0; i < items.length; i += FILL_CHUNK) {
        const chunk = items.slice(i, i + FILL_CHUNK);
        const r = await provider.chat({
          messages: [
            { role: 'system', content: buildSystemPrompt(language) },
            { role: 'user', content: fillPrompt(language, chunk, isVocab) },
          ],
        });
        for (const [j, it] of chunk.entries()) {
          const g = r.sentences.find((s) => s.text === it.text) ?? r.sentences[j];
          if (!g) continue;
          // Only fill what is empty; never overwrite the learner's data.
          const patch: EntryPatch = {};
          if (!it.translation && g.translation) patch.translation = g.translation;
          if (language.transliteration && !it.transliteration && g.transliteration)
            patch.transliteration = g.transliteration;
          if (isVocab && !it.pos && g.pos) patch.pos = g.pos;
          if (Object.keys(patch).length) {
            await update(it.id, patch);
            updated++;
          }
        }
      }
      showToast(true, `Updated ${updated} item${updated === 1 ? '' : 's'}`);
    } catch (e) {
      showToast(false, `${updated ? `Updated ${updated}, then: ` : ''}${errorText(e)}`);
    } finally {
      setRefreshing(false);
      await refresh();
    }
  };

  const rateCard = (id: number, weight: number) => {
    setVocab((vs) => vs.map((v) => (v.id === id ? { ...v, weight } : v)));
    setVocabWeight(id, weight).catch((e) => console.warn('rate', e));
  };

  const setPos = async (e: Entry, pos: (typeof PARTS_OF_SPEECH)[number]) => {
    setPosFor(null);
    await updateVocab(e.id, { pos });
    await refresh();
  };

  const saveSetting = (next: Settings) => {
    setSettings(next);
    saveSettings(next).catch((e) => console.warn('save settings', e));
  };
  const isEntrySelected = (e: Entry) =>
    !!selected &&
    (listMode === 'sentences'
      ? e.text === (selected.source ?? selected.text)
      : e.text === selected.text && (e.source ?? undefined) === selected.source);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <SelectionContext.Provider value={selectionCtx}>
        <View
          ref={rootRef}
          style={styles.root}
          onLayout={() => rootRef.current?.measureInWindow((_x, y) => setRootY(y))}
        >
          <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <LanguageBar
              value={langCode}
              onChange={changeLanguage}
              onSettings={() => setSettingsOpen(true)}
              display={settings.display}
              onDisplayChange={setDisplay}
              languages={languages}
              onAddLanguage={onAddLanguage}
              onRemoveLanguage={onRemoveLanguage}
            />
            <View style={styles.root} onLayout={chat.onAreaLayout}>
              <EntryList
                mode={listMode}
                onModeChange={setListMode}
                counts={{ sentences: sentences.length, vocab: vocab.length }}
                items={listItems}
                language={language}
                display={settings.display}
                isSelected={isEntrySelected}
                onSelect={(e) =>
                  listMode === 'sentences'
                    ? toggleSelected(e.text)
                    : setSelected((cur) =>
                        cur && cur.text === e.text && cur.source === (e.source ?? undefined)
                          ? null
                          : { text: e.text, source: e.source ?? undefined },
                      )
                }
                onDelete={(e) => (listMode === 'sentences' ? onDelete(e.id) : onDeleteVocab(e.id))}
                onScrollBegin={clearSelection}
                onLearn={setLearnIds}
                onTagPress={setPosFor}
                missingCount={missing.length}
                refreshing={refreshing}
                onRefresh={fillMissing}
              />
              <Animated.View style={chat.open ? { height: chat.height, maxHeight: '100%' } : undefined}>
                <ChatPanel
                  language={language}
                  open={chat.open}
                  onToggle={() => chat.setOpen(!chat.open)}
                  dragHandlers={chat.panHandlers}
                  messages={turns}
                  loading={loading}
                  selected={selected}
                  display={settings.display}
                  onClearSelected={() => setSelected(null)}
                  onSelect={toggleSelected}
                  isSaved={isSaved}
                  onSave={onSave}
                  onSend={onSend}
                  onSentenceOp={onSentenceOp}
                  onGeneralOp={onGeneralOp}
                  onClear={() => setTurns([])}
                  onScrollBegin={clearSelection}
                />
              </Animated.View>
            </View>
          </KeyboardAvoidingView>

          {textSel && (
            <SelectionMenu
              sel={textSel.sel}
              offsetY={rootY}
              windowHeight={windowHeight}
              onAction={(a) => onSelectionAction(a, textSel.sel)}
            />
          )}
          {toast && (
            <View pointerEvents="none" style={styles.toastWrap}>
              <Text style={[styles.toast, !toast.ok && { backgroundColor: C.danger }]}>{toast.text}</Text>
            </View>
          )}
        </View>
      </SelectionContext.Provider>

      {explain && (
        <ExplainPopup
          state={explain}
          onClose={() => setExplain(null)}
          onAction={(a) => {
            setExplain(null);
            onSelectionAction(a, explain.sel);
          }}
        />
      )}

      {learnIds && (
        <LearnModal
          items={vocab.filter((v) => learnIds.includes(v.id))}
          language={language}
          front={settings.learnFront}
          onFrontChange={(learnFront) => saveSetting({ ...settings, learnFront })}
          onRate={rateCard}
          onClose={() => setLearnIds(null)}
        />
      )}
      {posFor && (
        <ChoiceModal
          options={POS_OPTIONS}
          value={posFor.pos}
          onPick={(pos) => setPos(posFor, pos)}
          onClose={() => setPosFor(null)}
        />
      )}

      <Modal visible={settingsOpen} animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <SafeAreaView style={styles.root}>
          {settingsOpen && <SettingsScreen settings={settings} onSaved={setSettings} onClose={() => setSettingsOpen(false)} />}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  toastWrap: { position: 'absolute', left: 16, right: 16, bottom: 72, alignItems: 'center' },
  toast: {
    color: '#fff',
    backgroundColor: C.menu,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 14,
    overflow: 'hidden',
  },
});
