'use client';

import React from 'react';

type AudioPlaybackCoordinator = {
  /** Registers a player's pause callback; returns an unregister function. */
  register: (id: string, pause: () => void) => () => void;
  /** Pauses every other registered player, keeping their state and position. */
  notifyPlaying: (id: string) => void;
};

// No-op default so `useAudioStream` works even without a provider mounted above it.
const AudioPlaybackCoordinatorContext = React.createContext<AudioPlaybackCoordinator>({
  register: () => () => {},
  notifyPlaying: () => {},
});

/**
 * Coordinates multiple `AudioPlayer` instances (e.g. one per chat message) so that starting or
 * resuming playback on one pauses all others in place, without affecting their buffered audio or
 * playback position.
 */
export function AudioPlaybackCoordinatorProvider({ children }: { children: React.ReactNode }) {
  const pauseCallbacksRef = React.useRef(new Map<string, () => void>());

  const coordinator = React.useMemo<AudioPlaybackCoordinator>(
    () => ({
      register: (id, pause) => {
        pauseCallbacksRef.current.set(id, pause);
        return () => {
          pauseCallbacksRef.current.delete(id);
        };
      },
      notifyPlaying: (id) => {
        for (const [playerId, pause] of pauseCallbacksRef.current) {
          if (playerId !== id) {
            pause();
          }
        }
      },
    }),
    [],
  );

  return (
    <AudioPlaybackCoordinatorContext.Provider value={coordinator}>
      {children}
    </AudioPlaybackCoordinatorContext.Provider>
  );
}

export function useAudioPlaybackCoordinator(): AudioPlaybackCoordinator {
  return React.useContext(AudioPlaybackCoordinatorContext);
}
