import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_INTERESTS, INTERESTS_CHANGED_EVENT, loadInterests, saveInterests, toggleInterest,
  type Interests,
} from '../../../lib/interests';

/**
 * Declared interests, loaded after mount (SSR renders EMPTY so hydration
 * matches) and kept in sync across mounts via INTERESTS_CHANGED_EVENT.
 */
export function useInterests() {
  const [interests, setInterests] = useState<Interests>(EMPTY_INTERESTS);

  useEffect(() => {
    setInterests(loadInterests());
    const onChange = (e: Event) => setInterests((e as CustomEvent<Interests>).detail);
    window.addEventListener(INTERESTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(INTERESTS_CHANGED_EVENT, onChange);
  }, []);

  // Every mount receives the change event, so this ref is always current,
  // and it keeps working in a browser where localStorage throws.
  const ref = useRef(interests);
  ref.current = interests;

  const toggle = useCallback((kind: 'domains' | 'regions', value: string) => {
    // saveInterests broadcasts; every mount's listener (ours included) applies it.
    saveInterests(toggleInterest(ref.current, kind, value));
  }, []);

  const clear = useCallback(() => saveInterests({ domains: [], regions: [] }), []);

  return { interests, toggle, clear };
}
