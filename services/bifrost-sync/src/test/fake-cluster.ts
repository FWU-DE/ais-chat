import { randomUUID } from 'node:crypto';

import { type Restarter, RestartRefusedError, waitForInstances } from '../restarter';
import type { Instance } from '../types';
import { FakeDb, FakePod, type FakeRequest, type FaultRule } from './fake-bifrost';

type Entry = {
  uid: string;
  pod: FakePod;
  readyAtPoll: number;
  goneAtPoll?: number;
};

/**
 * Cluster with a PodDisruptionBudget of `maxUnavailable: 1`: a restart is refused while any pod
 * is not Ready or still terminating. Time advances with each `listInstances` call.
 */
export class FakeCluster implements Restarter {
  readonly db = new FakeDb();
  readonly events: string[] = [];
  readonly requests: FakeRequest[] = [];
  faults: FaultRule[] = [];
  /** Decides per new pod whether `GET /api/providers` works. */
  newPodHealthy: (name: string) => boolean = () => true;
  refused = 0;
  /** Refuses this many restarts regardless of the budget (PDB 429 from other disruptions). */
  refuseNext = 0;
  private entries: Entry[] = [];
  private poll = 0;
  private counter = 0;
  private readonly all: FakePod[] = [];

  constructor(private readonly replicas = 2) {}

  async init(): Promise<void> {
    for (let i = 0; i < this.replicas; i++) await this.addPod(0);
  }

  private async addPod(readyAtPoll: number): Promise<Entry> {
    const name = `bifrost-${String.fromCharCode(97 + this.counter++)}`;
    const pod = new FakePod(name, this.db, this.events, () => this.faults, this.requests);
    pod.healthy = readyAtPoll === 0 ? true : this.newPodHealthy(name);
    await pod.listen();
    this.all.push(pod);
    const entry = { uid: `uid-${name}-${randomUUID().slice(0, 4)}`, pod, readyAtPoll };
    this.entries.push(entry);
    return entry;
  }

  async close(): Promise<void> {
    await Promise.all(this.all.map((pod) => pod.close()));
  }

  podByName(name: string): FakePod {
    return this.entries.find((e) => e.pod.name === name)!.pod;
  }

  uidOf(name: string): string {
    return this.entries.find((e) => e.pod.name === name)!.uid;
  }

  /** Pod that disappears without replacement (node loss), for the missing-writer case. */
  removeWithoutReplacement(name: string): void {
    this.entries = this.entries.filter((e) => e.pod.name !== name);
  }

  listInstances(): Promise<Instance[]> {
    this.poll++;
    this.entries = this.entries.filter(
      (e) => e.goneAtPoll === undefined || e.goneAtPoll > this.poll,
    );
    return Promise.resolve(
      this.entries
        .map((e) => {
          const terminating = e.goneAtPoll !== undefined;
          return {
            id: e.uid,
            name: e.pod.name,
            baseUrl: e.pod.baseUrl,
            terminating,
            ready: !terminating && this.poll >= e.readyAtPoll,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  async restart(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.uid === id);
    if (!entry || entry.goneAtPoll !== undefined) return;
    const unavailable = this.entries.some(
      (e) => e.goneAtPoll !== undefined || this.poll < e.readyAtPoll,
    );
    if (unavailable || this.refuseNext > 0) {
      if (this.refuseNext > 0) this.refuseNext--;
      this.refused++;
      this.events.push(`refused ${entry.pod.name}`);
      throw new RestartRefusedError(entry.pod.name);
    }
    this.events.push(`evict ${entry.pod.name}`);
    entry.goneAtPoll = this.poll + 2;
    const replacement = await this.addPod(this.poll + 3);
    replacement.pod.reload();
    this.events.push(`new ${replacement.pod.name}`);
  }

  waitUntilAllReady(oldIds: string[], timeoutMs: number): Promise<void> {
    return waitForInstances(() => this.listInstances(), oldIds, this.replicas, timeoutMs, 1);
  }
}
