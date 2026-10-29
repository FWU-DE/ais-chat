'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
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
import { getProjectsAction } from './actions';
import { ROUTES } from '../../../../../consts/routes';
import { Project } from '../../../../../types/project';
import { ClickableTableRow } from '@/components/common/ClickableTableRow';
import { CreateProjectModal } from './CreateProjectModal';
import { toast } from 'sonner';

export type ProjectListViewProps = {
  organizationId: string;
};

export function ProjectListView({ organizationId }: ProjectListViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    startTransition(async () => {
      try {
        setError(null);
        const fetchedProjects = await getProjectsAction(organizationId);
        setProjects(fetchedProjects);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Ein unbekannter Fehler ist aufgetreten.';
        setError(errorMessage);
        toast.error(`Fehler beim Laden der Projekte: ${errorMessage}`);
      }
    });
  }, [organizationId, startTransition]);

  useEffect(() => {
    loadProjects();
  }, [organizationId, loadProjects]);

  const handleRefresh = () => {
    loadProjects();
  };

  const handleNewProject = () => {
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    // Reload projects after successful creation
    loadProjects();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Projekte</CardTitle>
          <CardDescription>Liste aller Projekte in dieser Organisation.</CardDescription>
          <CardAction>
            <Button onClick={handleNewProject}>Neues Projekt</Button>
            <Button disabled={isPending} onClick={handleRefresh} className="ml-2">
              Aktualisieren
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
              {projects.map((project) => (
                <ClickableTableRow
                  key={project.id}
                  href={ROUTES.api.projectDetails(organizationId, project.id)}
                >
                  <TableCell>{project.id}</TableCell>
                  <TableCell>{project.name}</TableCell>
                  <TableCell>{new Date(project.createdAt).toLocaleString()}</TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />
    </>
  );
}
