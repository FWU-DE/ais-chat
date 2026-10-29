import Link from 'next/link';
import { Button } from '@ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import { Checkbox } from '@ui/components/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/table';
import { ROUTES } from '@/consts/routes';
import { ClickableTableRow } from '@/components/common/ClickableTableRow';
import type { ProviderKey } from '@/types/provider-key';

export function ProviderKeyListView({
  organizationId,
  providerKeys,
}: {
  organizationId: string;
  providerKeys: ProviderKey[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider-Keys</CardTitle>
        <CardDescription>Provider-Zugänge und ihre zugewiesenen Sprachmodelle.</CardDescription>
        <CardAction>
          <Button asChild>
            <Link href={ROUTES.api.providerKeyNew(organizationId)}>Neuer Provider-Key</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Gewichtung</TableHead>
              <TableHead>Aktiv</TableHead>
              <TableHead>Modelle</TableHead>
              <TableHead>Erstellt am</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providerKeys.map((providerKey) => (
              <ClickableTableRow
                key={providerKey.id}
                href={ROUTES.api.providerKeyDetails(organizationId, providerKey.id)}
              >
                <TableCell className="font-medium">{providerKey.name}</TableCell>
                <TableCell>{providerKey.provider}</TableCell>
                <TableCell>{providerKey.weight}</TableCell>
                <TableCell className="text-center">
                  <Checkbox checked={providerKey.isEnabled} disabled />
                </TableCell>
                <TableCell>{providerKey.models.length}</TableCell>
                <TableCell>{new Date(providerKey.createdAt).toLocaleString()}</TableCell>
              </ClickableTableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
