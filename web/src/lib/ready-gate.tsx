import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Gate = { hold: () => () => void };

const GateContext = createContext<Gate | null>(null);

/**
 * Keeps a region hidden until every child that would still change its size
 * (thread loading, email bodies being measured) has settled, so the region
 * appears in one stable frame instead of jumping into place. Once revealed it
 * stays revealed; `maxWait` caps the wait on slow networks.
 */
export function useReadyGate(maxWait = 450) {
  const pending = useRef(0);
  const [revealed, setRevealed] = useState(false);
  const [tick, bump] = useReducer((x: number) => x + 1, 0);

  const gate = useMemo<Gate>(
    () => ({
      hold: () => {
        let released = false;
        pending.current++;
        return () => {
          if (released) return;
          released = true;
          pending.current--;
          bump();
        };
      },
    }),
    [],
  );

  // Runs after the children's layout effects, so their holds are already counted.
  useLayoutEffect(() => {
    if (!revealed && pending.current === 0) setRevealed(true);
  }, [tick, revealed]);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), maxWait);
    return () => clearTimeout(t);
  }, [maxWait]);

  return { gate, ready: revealed };
}

export function GateProvider({ gate, children }: { gate: Gate; children: ReactNode }) {
  return <GateContext.Provider value={gate}>{children}</GateContext.Provider>;
}

/** Holds the nearest gate closed while `active` is true. */
export function useHold(active: boolean) {
  const gate = useContext(GateContext);
  useLayoutEffect(() => {
    if (!gate || !active) return;
    return gate.hold();
  }, [gate, active]);
}

export function HoldWhile({ active }: { active: boolean }) {
  useHold(active);
  return null;
}
