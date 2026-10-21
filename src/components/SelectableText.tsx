import { useContext, useEffect, useId, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputSelectionChangeEventData,
  type TextStyle,
} from 'react-native';
import { SelectionContext } from '../selection';

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  onPress?: () => void;
  langCode: string;
  translation?: string;
  transliteration?: string | null;
};

/**
 * Read-only text that supports native selection (long-press / double-tap,
 * drag handles), including parts of words. It is a TextInput with the keyboard
 * suppressed, because RN's <Text> doesn't report the selected range.
 *
 * Android: `contextMenuHidden` would disable selection altogether (RN returns
 * false from the action-mode callback), so the system Copy menu stays.
 */
export function SelectableText({ text, style, onPress, langCode, translation, transliteration }: Props) {
  const { report, clearToken } = useContext(SelectionContext);
  const owner = useId();
  const ref = useRef<TextInput>(null);
  // Bumped to remount (and restore the text) if it gets edited via Cut/Paste.
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (clearToken) ref.current?.blur();
  }, [clearToken]);

  useEffect(() => () => report(owner, null), [owner, report]);

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start, end } = e.nativeEvent.selection;
    const fragment = text.slice(Math.min(start, end), Math.max(start, end)).trim();
    if (!fragment) {
      report(owner, null);
      return;
    }
    ref.current?.measureInWindow((x, y, width, height) =>
      report(owner, { fragment, source: text, langCode, translation, transliteration, anchor: { x, y, width, height } }),
    );
  };

  return (
    <TextInput
      key={rev}
      ref={ref}
      value={text}
      onChangeText={(t) => t !== text && setRev((r) => r + 1)}
      onSelectionChange={onSelectionChange}
      onPress={onPress}
      multiline
      scrollEnabled={false}
      showSoftInputOnFocus={false}
      caretHidden
      contextMenuHidden={Platform.OS === 'ios'}
      autoCorrect={false}
      spellCheck={false}
      underlineColorAndroid="transparent"
      style={[styles.reset, style]}
    />
  );
}

const styles = StyleSheet.create({
  reset: { padding: 0, margin: 0, textAlignVertical: 'top' },
});
