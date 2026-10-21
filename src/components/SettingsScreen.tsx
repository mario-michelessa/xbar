import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  createProvider,
  PROVIDERS,
  providerInfo,
  saveSettings,
  withModelInHistory,
  type ProviderSettings,
  type Settings,
} from '../settings';
import { C } from '../theme';

type Props = { settings: Settings; onSaved: (s: Settings) => void; onClose: () => void };

export function SettingsScreen({ settings, onSaved, onClose }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const info = providerInfo(draft.provider);
  const ps = draft.providers[draft.provider];
  const setPs = (patch: Partial<ProviderSettings>) =>
    setDraft((d) => ({ ...d, providers: { ...d.providers, [d.provider]: { ...d.providers[d.provider], ...patch } } }));

  // Trimmed settings, with the current model recorded in its provider's history.
  const current = (): Settings => {
    const model = ps.model.trim() || info.defaultModel;
    return {
      ...draft,
      providers: {
        ...draft.providers,
        [draft.provider]: { apiKey: ps.apiKey.trim(), model, modelHistory: withModelInHistory(ps.modelHistory, model) },
      },
    };
  };

  const save = async () => {
    const s = current();
    await saveSettings(s);
    setDraft(s);
    onSaved(s);
    setStatus({ ok: true, text: 'Saved.' });
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const reply = await createProvider(current()).test();
      setStatus({ ok: true, text: `Connected. Model replied: ${reply.slice(0, 80) || '(empty)'}` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  // Default model first, then models the user saved before (long-press forgets one).
  const chips = [info.defaultModel, ...ps.modelHistory.filter((m) => m !== info.defaultModel)];

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>LLM provider</Text>
      <View style={styles.segment}>
        {PROVIDERS.map((p) => {
          const active = p.id === draft.provider;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                setDraft((d) => ({ ...d, provider: p.id }));
                setStatus(null);
              }}
              style={[styles.segmentItem, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && { color: C.panel }]}>{p.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{info.name} API key</Text>
      <TextInput
        style={styles.input}
        value={ps.apiKey}
        onChangeText={(apiKey) => setPs({ apiKey })}
        placeholder={info.keyHint}
        placeholderTextColor={C.faint}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Model</Text>
      <TextInput
        style={styles.input}
        value={ps.model}
        onChangeText={(model) => setPs({ model })}
        placeholder={info.defaultModel}
        placeholderTextColor={C.faint}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.chips}>
        {chips.map((m) => {
          const active = m === ps.model.trim();
          return (
            <Pressable
              key={m}
              onPress={() => setPs({ model: m })}
              onLongPress={() => setPs({ modelHistory: ps.modelHistory.filter((x) => x !== m) })}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && { color: C.panel }]}>
                {m}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.buttons}>
        <Pressable onPress={save} style={styles.button}>
          <Text style={styles.link}>Save</Text>
        </Pressable>
        <Pressable onPress={test} disabled={busy} style={styles.button}>
          <Text style={[styles.link, busy && { color: C.faint }]}>{busy ? 'Testing…' : 'Test connection'}</Text>
        </Pressable>
      </View>
      {status && <Text style={{ color: status.ok ? C.muted : C.danger, marginTop: 8 }}>{status.text}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  label: { fontSize: 13, color: C.muted, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    backgroundColor: C.panel,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 15,
    color: C.text,
    borderRadius: 3,
  },
  segment: { flexDirection: 'row' },
  segmentItem: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginRight: 8,
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 3,
  },
  segmentActive: { backgroundColor: C.accent },
  segmentText: { fontSize: 14, fontWeight: '600', color: C.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.accent,
    borderRadius: 3,
  },
  chipActive: { backgroundColor: C.accent },
  chipText: { fontSize: 12, color: C.accent },
  buttons: { flexDirection: 'row', marginTop: 18 },
  button: { marginRight: 24, paddingVertical: 6 },
  link: { fontSize: 15, fontWeight: '600', color: C.accent },
});
