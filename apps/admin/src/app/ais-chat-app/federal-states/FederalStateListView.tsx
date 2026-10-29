'use client';

import { useEffect, useState, useTransition } from 'react';
import { getFederalStatesAction } from './actions';
import { CreateFederalStateModal } from './CreateFederalStateModal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/table';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import { Button } from '@ui/components/button';
import { ClickableTableRow } from '@/components/common/ClickableTableRow';
import { toast } from 'sonner';
import { ROUTES } from '@/consts/routes';
import { FederalStateModel } from '@shared/federal-states/types';

export default function FederalStateListView() {
  const [federalStates, setFederalStates] = useState<FederalStateModel[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const loadFederalStates = async () => {
    startTransition(async () => {
      try {
        setError(null);
        const fetchedFederalStates = await getFederalStatesAction();
        setFederalStates(fetchedFederalStates);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Ein unbekannter Fehler ist aufgetreten.';
        setError(errorMessage);
        toast.error(`Fehler beim Laden der Bundesländer: ${errorMessage}`);
      }
    });
  };

  useEffect(() => {
    void loadFederalStates();
  }, []);

  const handleRefresh = () => {
    void loadFederalStates();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Bundesländer</CardTitle>
          <CardDescription>Liste aller Bundesländer im System.</CardDescription>
          <CardAction>
            <Button onClick={() => setIsCreateModalOpen(true)} disabled={isPending}>
              Neues Bundesland
            </Button>
            <Button disabled={isPending} onClick={handleRefresh} className="ml-2">
              {isPending ? 'Lädt...' : 'Aktualisieren'}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Id</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Erstellt am</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {federalStates.map((federalState) => (
                <ClickableTableRow
                  key={federalState.id}
                  href={ROUTES.app.federalStateDetails(federalState.id)}
                >
                  <TableCell>{federalState.id}</TableCell>
                  <TableCell>{federalState.appName}</TableCell>
                  <TableCell>{federalState.createdAt.toLocaleString()}</TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateFederalStateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleRefresh}
      />
    </>
  );
}
