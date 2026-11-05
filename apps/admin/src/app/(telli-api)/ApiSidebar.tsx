import { Sidebar, SidebarItem } from '@/components/navigation/Sidebar';
import { ROUTES } from '@/consts/routes';

export function ApiSidebar() {
  return (
    <Sidebar>
      <SidebarItem label="Modelle" href={ROUTES.api.llms} />
      <SidebarItem label="Provider-Keys" href={ROUTES.api.providerKeys} />
      <SidebarItem label="Projekte" href={ROUTES.api.projects} />
    </Sidebar>
  );
}
