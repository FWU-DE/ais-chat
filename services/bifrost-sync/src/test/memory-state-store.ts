import { LockError, type StateStore, type Versioned } from '../state-store';
import type { State } from '../types';

export class MemoryStateStore implements StateStore {
  state: State = { phase: 'idle' };
  private version = 0;

  read(): Promise<Versioned> {
    return Promise.resolve({ state: structuredClone(this.state), version: String(this.version) });
  }

  write(state: State, version: string): Promise<string> {
    if (version !== String(this.version)) return Promise.reject(new LockError());
    this.state = structuredClone(state);
    this.version++;
    return Promise.resolve(String(this.version));
  }
}
