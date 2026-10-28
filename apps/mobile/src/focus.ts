// Which night the user is looking at (so the dev panel can "make friends snap" into it).
let focused: string | null = null;
const subs = new Set<() => void>();
export const setFocusedNight = (id: string | null) => {
  focused = id;
  subs.forEach((s) => s());
};
export const getFocusedNight = () => focused;
export const onFocusChange = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

// Dev chrome (the DEV pill) can be hidden for clean screenshots: nightcap://devtools?chrome=0
let chrome = true;
export const devChrome = () => chrome;
export const setDevChrome = (on: boolean) => {
  chrome = on;
  subs.forEach((s) => s());
};
