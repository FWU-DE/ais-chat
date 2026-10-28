import { getOrganizations } from '../../../services/organization-service';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/table';
import { ClickableTableRow } from '@/components/common/ClickableTableRow';
import { ROUTES } from '@/consts/routes';

export async function OrganizationListView() {
  const organizations = await getOrganizations();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[300px]">Id</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Erstellt am</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {organizations.map((org) => (
          <ClickableTableRow key={org.id} href={ROUTES.api.organizationDetails(org.id)}>
            <TableCell>{org.id}</TableCell>
            <TableCell>{org.name}</TableCell>
            <TableCell>{JSON.stringify(org.createdAt)}</TableCell>
          </ClickableTableRow>
        ))}
      </TableBody>
    </Table>
  );
}
