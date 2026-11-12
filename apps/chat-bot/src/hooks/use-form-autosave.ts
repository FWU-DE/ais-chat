'use client';

import { useCallback, useRef, useState } from 'react';

import { deepEqual } from '@/utils/object';

type UseFormAutosaveOptions<T> = {
  initialValues: T;
  isDirty: boolean;
  getValues: () => T;
  reset: (values: T) => void;
  saveValues: (values: T) => Promise<boolean>;
  validate?: () => Promise<boolean>;
};

type UseFormAutosaveResult = {
  isSaving: boolean;
  hasSaveError: boolean;
  flushAutoSave: () => Promise<boolean>;
  handleAutoSave: () => void;
};

/**
 * Custom hook for handling form autosave functionality.
 */
export function useFormAutosave<T>({
  initialValues,
  isDirty,
  getValues,
  reset,
  saveValues,
  validate,
}: UseFormAutosaveOptions<T>): UseFormAutosaveResult {
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  const lastSavedValuesRef = useRef<T>(initialValues);
  const saveQueuedRef = useRef(false);
  const flushRunningRef = useRef(false);
  const currentFlushPromiseRef = useRef<Promise<boolean> | null>(null);

  const saveCurrentValues = useCallback(async (): Promise<boolean> => {
    if (validate) {
      const isValid = await validate();
      if (!isValid) {
        return false;
      }
    }

    const data = getValues();
    if (deepEqual(data, lastSavedValuesRef.current)) {
      return true;
    }

    setIsSaving(true);
    try {
      const updateResult = await saveValues(data);
      if (updateResult) {
        setHasSaveError(false);
        lastSavedValuesRef.current = data;
        // Only reset the form (including isDirty) if the current values are the same as the values we just saved.
        // if the form is dirty again, we do not want to reset the form state for the user
        if (deepEqual(getValues(), data)) {
          reset(data);
        }
        return true;
      }

      setHasSaveError(true);
      return false;
    } catch {
      setHasSaveError(true);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [getValues, reset, saveValues, validate]);

  const flushAutoSave = useCallback(async (): Promise<boolean> => {
    if (flushRunningRef.current && currentFlushPromiseRef.current) {
      saveQueuedRef.current = true;
      return currentFlushPromiseRef.current;
    }

    const flushPromise = (async () => {
      flushRunningRef.current = true;
      let isSuccess = true;

      try {
        do {
          saveQueuedRef.current = false;
          const saveResult = await saveCurrentValues();
          if (!saveResult) {
            isSuccess = false;
          }
        } while (saveQueuedRef.current);

        return isSuccess;
      } finally {
        flushRunningRef.current = false;
      }
    })();

    currentFlushPromiseRef.current = flushPromise;
    try {
      return await flushPromise;
    } finally {
      currentFlushPromiseRef.current = null;
    }
  }, [saveCurrentValues]);

  const handleAutoSave = useCallback(() => {
    if (!isDirty) {
      return;
    }

    // Fire and forget. We do not wait for the result.
    // If you need the result, use flushAutoSave directly.
    void flushAutoSave();
  }, [flushAutoSave, isDirty]);

  return {
    isSaving,
    hasSaveError,
    flushAutoSave,
    handleAutoSave,
  };
}
