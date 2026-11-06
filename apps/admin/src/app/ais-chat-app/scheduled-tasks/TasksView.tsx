'use client';

import type { ServerActionResult } from '@shared/actions/server-action-result';
import { ConfirmAlertDialog, useConfirmAlertDialog } from '@ui/components/alert-dialog';
import { Button } from '@ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { useState } from 'react';
import { toast } from 'sonner';

import { refreshPopularityAction, runCleanupAction } from './actions';

type TaskId = 'cleanup' | 'cleanup-s3' | 'popularity';
type TaskOutput = { kind: 'success' | 'error'; text: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.';
}

function TaskResult({ label, output }: { label: string; output: TaskOutput | undefined }) {
  return (
    <div role="region" aria-live="polite" aria-label={label}>
      {output && (
        <pre
          className={`mt-4 max-h-96 overflow-auto rounded-lg border p-3 text-sm ${
            output.kind === 'error'
              ? 'border-red-400 bg-red-100 text-red-700'
              : 'border-border bg-muted'
          }`}
        >
          <code>{output.text}</code>
        </pre>
      )}
    </div>
  );
}

export default function TasksView() {
  const [runningTask, setRunningTask] = useState<TaskId | null>(null);
  const [cleanupOutput, setCleanupOutput] = useState<TaskOutput>();
  const [popularityOutput, setPopularityOutput] = useState<TaskOutput>();
  const { dialogProps: cleanupDialogProps, confirm: confirmCleanup } = useConfirmAlertDialog();
  const { dialogProps: cleanupS3DialogProps, confirm: confirmCleanupS3 } = useConfirmAlertDialog();

  async function runTask<T>(
    taskId: TaskId,
    action: () => Promise<ServerActionResult<T>>,
    setOutput: (output: TaskOutput) => void,
    successMessage: string,
  ) {
    setRunningTask(taskId);
    try {
      const result = await action();
      if (result.success) {
        setOutput({ kind: 'success', text: JSON.stringify(result.value, null, 2) });
        toast.success(successMessage);
      } else {
        setOutput({ kind: 'error', text: result.error.message });
        toast.error('Die Aufgabe ist fehlgeschlagen.');
      }
    } catch (error) {
      setOutput({
        kind: 'error',
        text: `${getErrorMessage(error)} Die Aufgabe läuft möglicherweise auf dem Server weiter, bitte die Logs prüfen.`,
      });
      toast.error('Die Aufgabe ist fehlgeschlagen.');
    } finally {
      setRunningTask(null);
    }
  }

  const runCleanup = (deleteUnusedS3Files: boolean) =>
    runTask(
      deleteUnusedS3Files ? 'cleanup-s3' : 'cleanup',
      () => runCleanupAction({ deleteUnusedS3Files }),
      setCleanupOutput,
      'Bereinigung abgeschlossen.',
    );

  const isRunning = runningTask !== null;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Alle diese Aufgaben laufen automatisch als Cronjob. Diese Seite dient nur zum manuellen
        Auslösen.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Bereinigung</CardTitle>
          <CardDescription>
            Löscht Unterhaltungen nach Ablauf der Aufbewahrungszeit, leere Entitäten und alte
            Webseiten-Chunks. Die zweite Variante löscht zusätzlich ungenutzte S3-Dateien und sollte
            nicht verwendet werden, wenn mehrere Deployments denselben S3-Speicher teilen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isRunning}
              aria-busy={runningTask === 'cleanup'}
              onClick={() => confirmCleanup(() => void runCleanup(false))}
            >
              {runningTask === 'cleanup' ? 'Läuft...' : 'Bereinigen'}
            </Button>
            <Button
              variant="destructive"
              disabled={isRunning}
              aria-busy={runningTask === 'cleanup-s3'}
              onClick={() => confirmCleanupS3(() => void runCleanup(true))}
            >
              {runningTask === 'cleanup-s3'
                ? 'Läuft...'
                : 'Bereinigen und ungenutzte S3-Dateien löschen'}
            </Button>
          </div>
          <TaskResult label="Ergebnis der letzten Bereinigung" output={cleanupOutput} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Beliebtheit</CardTitle>
          <CardDescription>
            Berechnet die Beliebtheit von Assistenten, Dialogpartnern und Lernszenarien neu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={isRunning}
            aria-busy={runningTask === 'popularity'}
            onClick={() =>
              void runTask(
                'popularity',
                refreshPopularityAction,
                setPopularityOutput,
                'Beliebtheit berechnet.',
              )
            }
          >
            {runningTask === 'popularity' ? 'Läuft...' : 'Beliebtheit berechnen'}
          </Button>
          <TaskResult label="Ergebnis der letzten Berechnung" output={popularityOutput} />
        </CardContent>
      </Card>

      <ConfirmAlertDialog
        title="Bereinigen"
        description="Gelöscht werden Unterhaltungen nach Ablauf der Aufbewahrungszeit, leere Entitäten und alte Webseiten-Chunks."
        confirmLabel="Bereinigen"
        cancelLabel="Abbrechen"
        {...cleanupDialogProps}
      />
      <ConfirmAlertDialog
        title="Bereinigen und ungenutzte S3-Dateien löschen"
        description="Gelöscht werden Unterhaltungen nach Ablauf der Aufbewahrungszeit, leere Entitäten und alte Webseiten-Chunks sowie zusätzlich alle ungenutzten S3-Dateien."
        confirmLabel="Bereinigen und löschen"
        cancelLabel="Abbrechen"
        {...cleanupS3DialogProps}
      />
    </div>
  );
}
