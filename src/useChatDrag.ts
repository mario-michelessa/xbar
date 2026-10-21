// Drag-to-resize for the chat panel. The panel's header stays mounted whether
// the chat is open or closed, so one gesture can open, resize or close it.
import { useState } from 'react';
import { Animated, PanResponder, type LayoutChangeEvent } from 'react-native';

const CLOSED_HEIGHT = 44; // roughly the header alone
const CLOSE_BELOW = 120; // releasing shorter than this closes the chat
const MIN_OPEN = 180;
const DEFAULT_RATIO = 0.5;

/** Gesture state lives in this closure (created once), outside React state. */
function createController(setOpenState: (v: boolean) => void, onDragStart: () => void) {
  const height = new Animated.Value(0);
  let open = false;
  let current = 0; // 0 = use the default next time it opens
  let area = 0; // height available to list + chat
  let start = 0;

  const setHeight = (h: number) => {
    current = h;
    height.setValue(h);
  };

  const setOpen = (v: boolean) => {
    if (v && !current) setHeight(Math.round(area * DEFAULT_RATIO));
    open = v;
    setOpenState(v);
  };

  const finish = (h: number) => {
    if (h < CLOSE_BELOW) {
      current = 0;
      setOpen(false);
    } else if (h < MIN_OPEN) {
      current = MIN_OPEN;
      Animated.timing(height, { toValue: MIN_OPEN, duration: 120, useNativeDriver: false }).start();
    }
  };

  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => {
      start = open ? current : CLOSED_HEIGHT;
      onDragStart();
    },
    onPanResponderMove: (_, g) => {
      setHeight(Math.max(CLOSED_HEIGHT, Math.min(area, start - g.dy)));
      if (!open && current > CLOSE_BELOW) {
        open = true;
        setOpenState(true);
      }
    },
    onPanResponderRelease: (_, g) => finish(start - g.dy),
    onPanResponderTerminate: (_, g) => finish(start - g.dy),
  });

  return {
    height,
    setOpen,
    panHandlers: pan.panHandlers,
    onAreaLayout: (e: LayoutChangeEvent) => {
      area = e.nativeEvent.layout.height;
    },
  };
}

/** `onDragStart` must be stable (it is captured once). */
export function useChatDrag(onDragStart: () => void) {
  const [open, setOpenState] = useState(false);
  const [ctl] = useState(() => createController(setOpenState, onDragStart));
  return { open, ...ctl };
}
