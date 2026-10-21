# Continuity log

Running log of what has been done, decisions, and what's next — read this first to avoid redoing work.

## State (2026-10-02)

### Done
- Scaffolded Expo SDK 57 blank-typescript app (RN 0.86, React 19.2, TS 6). `create-expo` also ran `git init`; nothing committed yet.
- Added deps via `npx expo install`: `expo-sqlite`, `expo-secure-store`, `react-native-safe-area-context`.
- Implemented MVP per spec (see README "Where things live"):
  - `src/languages.ts` (fr, ar=MSA rtl, ta, id, zh=Simplified), `src/db.ts` (tables `language`, `sentence`),
    `src/settings.ts` (SecureStore: key + model, default `qwen3.5:9b`), `src/prompts.ts`,
    `src/llm/{types,parse,soclaas}.ts`, `src/components/{LanguageBar,SentenceItem,SentenceList,ChatPanel,SettingsScreen}.tsx`, `App.tsx`.
- Verified: `npx tsc --noEmit` clean, `npx expo lint` clean, `npx expo-doctor` 18/18, `expo export --platform android` bundles.
  Parser tested on 5 sample outputs (plain JSON, fenced, `<think>`, plain text → raw, bare array).

### Decisions
- No Expo Router (single screen + Settings modal), despite template AGENTS.md suggesting it.
- Settings is a `Modal`; SettingsScreen only mounted when open (avoids setState-in-effect lint).
- Chat history in memory; last 8 turns of the *current* language sent as context.
- Translate op: results saved into the *target* language collection (`saveLang` on assistant messages).
- General ops (no selected sentence) send immediately; typed input becomes the topic.
- SoCLaaS: 90s timeout, one retry after 2s on 429/5xx. `response_format` not used (unsure SoCLaaS supports it) — relies on prompt + tolerant parser.

### Known issues / unverified
- SoCLaaS endpoint timed out from this dev machine (likely NUS network/VPN only). No real LLM call tested yet.
- Not yet run on a device/emulator.

### Next
- ~~Build an APK~~ → done, see 'Local native Android build' below.

## 2026-10-02 — Local native Android build
User request: keep generated `android/` in repo; build locally with `cd android && ./gradlew :app:assembleDebug|assembleRelease`; no EAS/cloud.
- [x] Installed Android cmdline-tools (16111833) + platform-tools into ~/Android/Sdk; licenses accepted. `android/local.properties` has sdk.dir (gitignored, per-machine).
- [x] Set `android.package` = `com.mario.xbar` in app.json; ran `npx expo prebuild --platform android`; removed `/android` from .gitignore. Gradle 9.3.1 wrapper. Prebuild changed package.json scripts to `expo run:*`.
- [x] `./gradlew :app:assembleDebug` OK (4m50s first run; Gradle auto-installed NDK 27.1.12297006, build-tools, platforms, cmake). → `android/app/build/outputs/apk/debug/app-debug.apk` (141M). Note: debug APK loads JS from Metro (`npx expo start`), not standalone.
- [x] `./gradlew :app:assembleRelease` OK (1m15s) → `android/app/build/outputs/apk/release/app-release.apk` (74M, all 4 ABIs). JS bundle embedded (`assets/index.android.bundle`), standalone. Signed with `android/app/debug.keystore` (template default) — installable, but not a real release key.

### Next / open
- Install release APK on phone, test flows A–C against SoCLaaS (needs NUS network/VPN?).
- Optional: real release keystore; `reactNativeArchitectures=arm64-v8a` in android/gradle.properties to shrink APK.
- If app.json / native deps change: rerun `npx expo prebuild --platform android` (NOT `--clean`, android/ is versioned).

## 2026-10-03 — Fragment selection, Gemini, model history, transliteration
User request (4 features):
1. Select any word / part of sentence / part of word → save as sentence, add to vocabulary, or use as LLM context.
2. Gemini provider; Settings lets user pick SoCLaaS or Gemini, enter Gemini key + model. Default provider Gemini, model `gemini-3.5-flash-lite` (verified stable on ai.google.dev/gemini-api/docs/models).
3. Remember models the user has saved (per provider) as quick-switch chips.
4. MSA/Tamil/Chinese: LLM returns `transliteration` field; toggle to show it as subtitle.

Plan / decisions:
- Selection UX: long-press any sentence → `SelectionSheet` modal with the sentence in a non-editable-looking TextInput (native selection handles, keyboard suppressed via `showSoftInputOnFocus={false}`); `onSelectionChange` gives the fragment (works for sub-word and for Chinese, no spaces). Tap still = whole sentence as context.
- Context becomes `{ text, source? }`; prompts say "Focus expression X (from sentence Y)" when it's a fragment.
- New `vocab` table; main list gets a Sentences / Vocabulary switch.
- `sentence` table gets `transliteration` column (migration via PRAGMA table_info + ALTER TABLE).
- Settings in SecureStore: provider, per-provider key + model, model history (JSON), showTranslit.

Done (2026-10-03):
- [x] `src/llm/gemini.ts` (x-goog-api-key header, systemInstruction, roles user/model, `responseMimeType: application/json`, skips `thought` parts, 1 retry on 429/5xx). Endpoint probed with a fake key → 400 "API key not valid" (mapped to a friendly message). Shared `fetchWithTimeout`/`sleep`/`stripThinking` moved to `src/llm/types.ts`; `LLMProvider` now has `test()`.
- [x] `src/settings.ts`: provider + per-provider {apiKey, model, modelHistory}, `showTransliteration`; `createProvider()`. Legacy keys `soclaas_api_key`/`soclaas_model` reused (same names) so old installs keep their key. Default provider = gemini.
- [x] Settings UI: provider segment, key, model + history chips (default model always shown; long-press forgets), transliteration switch. Saving records the model in that provider's history (max 8).
- [x] Transliteration: `Language.transliteration` set for ar/ta/zh; system prompt lists them; parser accepts transliteration/romanization/pinyin; `sentence.transliteration` column added by migration; shown as italic subtitle; `abc` toggle in LanguageBar (persisted).
- [x] Selection: long-press any sentence (saved list, vocab list, chat) → `SelectionSheet` modal. Removed `selectable` from SentenceItem's Text (it would swallow long-press). Focus `{text, source?}` replaces the selected string; `focusHeader()` in prompts tells the LLM to work on the fragment with the sentence as context. Saving with empty translation calls `lookupPrompt` (one-shot, no chat history).
- [x] `vocab` table + Sentences/Vocabulary tabs (`EntryList`, replaces `SentenceList`).
- [x] tsc clean, lint clean, `expo export --platform android` bundles. Parser checked with pinyin/transliteration keys.

Not verified: real Gemini call (no key here); native selection behaviour of the read-only-ish TextInput on a device (uses `showSoftInputOnFocus={false}` + remount on edit). If handles misbehave on Android, fallback idea: tap-start/tap-end on word/character tokens.
- [x] Release APK rebuilt OK (android/app/build/outputs/apk/release/app-release.apk, 77M).
Next: install on phone, add Gemini key in Settings, test selection handles + transliteration.

## 2026-10-03 (b) — UI cleanup round
User feedback: features work well. Requested:
- Remove hint/subtitle texts everywhere.
- Replace SelectionSheet with inline native selection + contextual menu: Explain (LLM translation + explanation in a popup; user first wrote "Create"), +Sentence, +Vocab, Select (= LLM context).
- Chat header draggable to resize (up to full screen; drag far down closes). Header label "Chat" (no language). Clear → icon, Save → "+", Send → icon.
- `abc` button → multi-select popover: [text] [transliteration] [translation] [notes], at least one of first three; hides unselected parts on every card. Replaces showTransliteration.
- Chat header: shadow on the content below + slightly different colour.
Decisions: no custom-menu API in RN 0.86 Text/TextInput → each card's text is a TextInput (keyboard suppressed, caret hidden, native context menu hidden); onSelectionChange → floating menu anchored via measureInWindow. Icons: @expo/vector-icons.
Done (b):
- [x] `SelectionSheet` removed. Cards render text via `SelectableText` (TextInput, `showSoftInputOnFocus={false}`, caretHidden, remount on edit). Reports selection + `measureInWindow` rect through `SelectionContext`; App shows `SelectionMenu` under the field. Explain → `ExplainPopup` (modal). Lookups cached per (lang, source, fragment). Quick saves show a toast.
- [x] Android `contextMenuHidden` = return false from action-mode callback → kills selection (checked ReactEditText.kt). So it's only set on iOS; on Android the system Copy/Select-all toolbar coexists with our menu (ours is placed under the text).
- [x] `Settings.display` {text, transliteration, translation, note} replaces `showTransliteration` (SecureStore key `display`, JSON). `effectiveDisplay()` per language. `abc` opens a checkbox dropdown anchored to the button.
- [x] Chat: header always mounted (closed = header only) so the drag keeps its responder while opening; `useChatDrag` = closure controller + Animated height (React Compiler lint forbids ref access in render). Close if released < 120px, snap to min 180px, max = whole area.
- [x] Icons: `@expo/vector-icons` (Ionicons) + `expo-font` peer (expo-doctor flagged it). Ran `npx expo prebuild --platform android --no-install`.
- [x] Removed hint texts, "(default)" chip suffix, endpoint text, "Working from:", raw-output label, empty-list texts.
- [x] tsc, lint clean; expo-doctor only flags the known non-CNG app.json warning. Release APK built.
GOTCHA: `expo prebuild` deletes `android/local.properties` → recreate with `sdk.dir=/home/mario/Android/Sdk`.
Not verified on device: selection menu positioning, drag gesture feel, boxShadow rendering.

## 2026-10-04 — Vocab categories, Learn mode, custom languages, refresh
Request: (1) vocab gets a part-of-speech category (verb/noun/prep-postposition/adverb/adjective/grammar/other); (2) "Learn" in the vocab tab → flashcard popup, front = text | text+translit | translation, Reveal, then Easy/Medium/Hard adjusting the pick probability (Anki-like); (3) add new languages from the top bar; (4) discreet "refresh" to fill fields missing on items saved by older versions.
Decisions:
- `vocab.pos` (verb|noun|adposition|adverb|adjective|grammar|other) and `vocab.weight REAL DEFAULT 1`. Easy → weight/4, Medium → weight/2, Hard → 1; min 1/64. Weighted random pick, never the same card twice in a row.
- LLM lookup returns `pos`; parser normalizes synonyms. Tap the tag on a vocab card to change it.
- Custom languages stored in the existing `language` table (new columns custom, rtl, transliteration); registry in languages.ts (`allLanguages()`), App re-renders on change. Long-press a custom language to remove it (saved items kept).
- Refresh: faint sparkles icon in the list tab row, only shown when some items miss translation / transliteration / pos; batch LLM fill (chunks of 12), only empty fields are written.
Done (2026-10-04):
- [x] DB: vocab.pos, vocab.weight (REAL default 1), language.custom/rtl/transliteration; `updateSentence/updateVocab` (patch only given fields), `setVocabWeight`, custom-language CRUD.
- [x] POS: `PARTS_OF_SPEECH`/`POS_LABELS` in llm/types; `normalizePos` in parse; lookupPrompt asks "pos"; quick-save vocab stores it; tag pill on vocab cards (tap → ChoiceModal); shown in Explain popup.
- [x] Learn: `LearnModal` (front chips, Reveal, Hard/Medium/Easy). Front persisted in settings (`learn_front`).
- [x] Languages: registry `allLanguages()/setCustomLanguages()` (LANGUAGES export renamed BUILTIN_LANGUAGES); `AddLanguageModal`; code = `u-<slug>` so re-adding the same name re-attaches old items.
- [x] Refresh: sparkles icon in list header when missing.length > 0 → confirm → `fillPrompt` batches of 12, fills only empty translation/transliteration/pos.
- [x] tsc + lint clean, POS normalisation tested, release APK built.
- [x] (2026-10-04, later) Vocab list: search icon (both tabs; matches text / transliteration / translation, accent-insensitive), funnel dropdown in vocab tab = sort (Newest / Most likely in Learn / A–Z English) + multi-select category filter with "All". State local to `EntryList`; `onLearn(ids)` passes the visible items so Learn only draws from them. Untyped words are hidden when a category filter is active.
