import { randomUUID } from 'node:crypto';

import type { Restarter } from '../restarter';
import type { Instance } from '../types';
import { FakeDb, FakePod, type FakeRequest, type FaultRule, type Quirks } from './fake-bifrost';

type Entry = { uid: string; pod: FakePod; ready: boolean };

/**
 * Bifrost Deployment with a rolling update. `restart()` sets the annotation, `waitForRollout()`
 * replaces every pod by a new one that loads the DB state, like Kubernetes does after the patch.
 */
export class FakeCluster implements Restarter {
  readonly db = new FakeDb();
  readonly events: string[] = [];
  readonly requests: FakeRequest[] = [];
  readonly patches: string[] = [];
  faults: FaultRule[] = [];
  quirks: Quirks = {};
  /** Decides per new pod whether `GET /api/providers` works. */
  newPodHealthy: (name: string) => boolean = () => true;
  /** The rolling update never completes (stuck pod). */
  rolloutStuck = false;
  private annotation?: string;
  private rolloutPending = false;
  private entries: Entry[] = [];
  private counter = 0;
  private readonly all: FakePod[] = [];

  constructor(private readonly replicas = 2) {}

  async init(): Promise<void> {
    for (let i = 0; i < this.replicas; i++) await this.addPod(true);
  }

  private async addPod(initial: boolean): Promise<Entry> {
    const name = `bifrost-${String.fromCharCode(97 + this.counter++)}`;
    const pod = new FakePod(
      name,
      this.db,
      this.events,
      () => this.faults,
      this.requests,
      () => this.quirks,
    );
    pod.healthy = initial ? true : this.newPodHealthy(name);
    await pod.listen();
    this.all.push(pod);
    const entry = { uid: `uid-${name}-${randomUUID().slice(0, 4)}`, pod, ready: true };
    this.entries.push(entry);
    return entry;
  }

  async close(): Promise<void> {
    await Promise.all(this.all.map((pod) => pod.close()));
  }

  podByName(name: string): FakePod {
    return this.entries.find((e) => e.pod.name === name)!.pod;
  }

  setReady(name: string, ready: boolean): void {
    this.entries.find((e) => e.pod.name === name)!.ready = ready;
  }

  removePod(name: string): void {
    this.entries = this.entries.filter((e) => e.pod.name !== name);
  }

  listInstances(): Promise<Instance[]> {
    return Promise.resolve(
      this.entries
        .map((e) => ({
          id: e.uid,
          name: e.pod.name,
          baseUrl: e.pod.baseUrl,
          ready: e.ready,
          terminating: false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  desiredReplicas(): Promise<number> {
    return Promise.resolve(this.replicas);
  }

  restart(restartedAt: string): Promise<void> {
    if (this.annotation === restartedAt) return Promise.resolve();
    this.annotation = restartedAt;
    this.patches.push(restartedAt);
    this.events.push('patch');
    this.rolloutPending = true;
    return Promise.resolve();
  }

  async waitForRollout(): Promise<void> {
    if (this.rolloutStuck) throw new Error('rollout not complete after 1 ms');
    if (!this.rolloutPending) return;
    this.rolloutPending = false;
    const old = this.entries;
    this.entries = [];
    for (let i = 0; i < old.length; i++) {
      const replacement = await this.addPod(false);
      replacement.pod.reload();
      this.events.push(`new ${replacement.pod.name}`);
    }
  }
}
