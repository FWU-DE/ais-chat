import { Sidebar, SidebarItem } from '@/components/navigation/Sidebar';
import { ROUTES } from '@/consts/routes';
import { auth } from '@/auth';
import { canAccessEditorArea } from '@/auth/roles';

export async function AdminAppSidebar() {
  const session = await auth();
  const canAccessApp = canAccessEditorArea(session?.adminRole);

  return (
    <Sidebar>
      {session?.adminRole === 'Admin' && (
        <>
          <SidebarItem label="Bundesländer" href={ROUTES.app.federalStates} />
          <SidebarItem label="Info-Banner" href={ROUTES.app.infoBanners} />
          <SidebarItem label="Tool Call Kosten" href={ROUTES.app.toolCallCosts} />
          <SidebarItem label="Statische Modelle" href={ROUTES.app.staticModels} />
          <SidebarItem label="Webseitenpakete" href={ROUTES.app.urlPresets} />
        </>
      )}
      {canAccessApp && <SidebarItem label="Vorlagen" href={ROUTES.app.templates} />}
      {canAccessApp && <SidebarItem label="Sperrungen" href={ROUTES.app.suspensions} />}
    </Sidebar>
  );
}
