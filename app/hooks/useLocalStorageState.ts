import { useState, useEffect } from "react";

export function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T | undefined, React.Dispatch<React.SetStateAction<T | undefined>>] {
  // Initialize state from localStorage or with a default value
  const [state, setState] = useState<T>();

  // Watch for changes in state and save to localStorage
  useEffect(() => {
    if (state === undefined) {
      const storedValue = localStorage.getItem(key);
      if (storedValue) setState(JSON.parse(storedValue));
      else setState(defaultValue);
    } else {
      localStorage.setItem(key, JSON.stringify(state));
    }
  }, [key, state]);

  return [state, setState];
}
