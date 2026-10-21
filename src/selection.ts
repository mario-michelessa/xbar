// Inline text selection: cards report the current selection here, and the
// app shows a floating menu (Explain / + Sentence / + Vocab / Select).
import { createContext } from 'react';

export type Rect = { x: number; y: number; width: number; height: number };

export type TextSelection = {
  fragment: string;
  source: string; // the whole sentence the fragment was selected in
  langCode: string;
  translation?: string;
  transliteration?: string | null;
  anchor: Rect; // window coordinates of the text field
};

export const SelectionContext = createContext<{
  report: (owner: string, sel: TextSelection | null) => void;
  // Incremented to ask every selectable text to drop its selection.
  clearToken: number;
}>({ report: () => {}, clearToken: 0 });
