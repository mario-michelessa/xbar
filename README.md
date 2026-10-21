# xbar — personal language notebook

Minimal mobile-first app: pick a language, ask an LLM (Google Gemini or NUS SoCLaaS) for
explanations and example sentences, save the sentences and words you like to a local collection.

## Install & run

```bash
npm install
npx expo start          # scan the QR code with Expo Go (Android/iOS), or press a / i
```

`expo-sqlite` and `expo-secure-store` are bundled in Expo Go, so no custom dev build is needed.
Checks: `npx tsc --noEmit`, `npx expo lint`.

## Build APKs locally (no EAS)

The native `android/` project is committed. Requires JDK 17+ and the Android SDK
(`android/local.properties` with `sdk.dir=/path/to/Android/Sdk`, or `ANDROID_HOME`).

```bash
cd android
./gradlew :app:assembleDebug     # app/build/outputs/apk/debug/app-debug.apk   (loads JS from `npx expo start`)
./gradlew :app:assembleRelease   # app/build/outputs/apk/release/app-release.apk (standalone, JS embedded)
adb install -r app/build/outputs/apk/release/app-release.apk
```

The release build is signed with the template's `android/app/debug.keystore` — fine for personal
installs. After changing `app.json` or adding native modules, run `npx expo prebuild --platform android`
(not `--clean`, which would discard edits in `android/`).

SoCLaaS may only be reachable from the NUS network / VPN — if requests time out, check that first.

## Where things live

| What | File |
| --- | --- |
| Provider / API key / model settings (UI) | ⚙︎ button top-right → `src/components/SettingsScreen.tsx` |
| Settings storage (`expo-secure-store`), provider list + defaults, model history | `src/settings.ts` |
| **LLM system prompt + quick-operation prompts** | `src/prompts.ts` |
| **SQLite schema + queries** | `src/db.ts` |
| Languages (built-ins + registry of user-added ones) | `src/languages.ts` |
| Learn flashcards (weights) | `src/components/LearnModal.tsx` |
| LLM provider interface | `src/llm/types.ts` (`LLMProvider`) |
| SoCLaaS implementation (timeout, retry, errors) | `src/llm/soclaas.ts` |
| Gemini implementation (`generateContent`, JSON mode) | `src/llm/gemini.ts` |
| Selectable sentence text (native selection) | `src/components/SelectableText.tsx`, `src/selection.ts` |
| Selection menu + Explain popup | `src/components/SelectionMenu.tsx` |
| Chat drag-to-resize | `src/useChatDrag.ts` |
| Saved list with Sentences / Vocabulary tabs | `src/components/EntryList.tsx` |
| JSON response parser (fences, `<think>`, fallback to raw) | `src/llm/parse.ts` |
| Main screen / app state | `App.tsx` |
| Chat panel | `src/components/ChatPanel.tsx` |

To add an LLM backend, implement `LLMProvider` (`chat()` + `test()`), add an entry to `PROVIDERS`
and a branch in `createProvider()` in `src/settings.ts`.

## Behaviour notes

- Tap a sentence (saved or generated) to make it the "Working from" sentence; tap again or × to clear.
- Select text in any sentence like normal text (long-press / double-tap, drag the handles; parts of
  words work). A menu appears under it: **Explain** (LLM translation + explanation in a popup),
  **+ Sentence**, **+ Vocab** (translation filled by the LLM), **Select** (use as LLM context).
  On Android the system Copy menu also shows: hiding it would disable selection in RN.
- `abc` in the language bar: choose which parts of each card are visible (text, transliteration,
  translation, notes; at least one of the first three).
- Vocabulary items have a part-of-speech tag (filled by the LLM; tap it to change).
- **Learn** (Vocabulary tab): flashcards, front = text / text + transliteration / translation.
  Easy divides the card's weight by 4, Medium by 2, Hard resets it to 1; cards are drawn with
  probability ∝ weight (min 1/64), never twice in a row.
- List header: 🔍 searches text / transliteration / translation; the funnel (Vocabulary) sorts
  (newest, Learn probability, A–Z by English) and filters by category. Learn only uses the words
  currently shown.
- `+` at the end of the language bar adds a language (name, optional transliteration system, RTL).
  Long-press a user-added language to remove it (its saved items stay in the DB).
- A faint ✨ icon in the list header appears when items (saved by older versions) miss a translation,
  transliteration or category; tap it to let the LLM fill only the empty fields.
- Drag the chat header to resize the chat (up to full screen); drag it far down to close it.
- Settings: choose Gemini (default, `gemini-3.5-flash-lite`) or SoCLaaS; each keeps its own key and
  model. Every model you save is remembered as a chip for quick switching (long-press to forget).
- Quick operations are just prompts sent through the normal chat.
- Translate: results are saved into the *target* language's collection.
- Chat history is in-memory only; the last few turns of the current language are sent as context.
- Persisted data: `sentence` and `vocab` tables (plus a seeded `language` table). Settings live in SecureStore.
