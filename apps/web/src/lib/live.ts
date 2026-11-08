/**
 * Screens stay current by asking again every few seconds while the tab is open and in view.
 * A tab in the background does not ask, which also lets a free host rest. A board that is
 * being dragged is left alone, so cards do not jump under the person's hand.
 */
let dragging = false;

export const setBoardBusy = (busy: boolean) => {
  dragging = busy;
};

export const livePoll = (ms: number) => (): number | false => (dragging ? false : ms);

/** How often each kind of screen asks again, in milliseconds. */
export const POLL = {
  /** Anything the other side of the hiring process can change. */
  fast: 15_000,
  board: 20_000,
  list: 30_000,
  numbers: 60_000,
} as const;
