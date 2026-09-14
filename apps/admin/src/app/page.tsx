import { auth } from '@/auth';
import { EDITOR_ROLE } from '@/auth/roles';
import { ROUTES } from '@/consts/routes';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();

  if (session?.adminRole === EDITOR_ROLE) {
    redirect(ROUTES.app.page);
  }

  return (
    <div>
      <div>Willkommen bei AIS.chat-admin.</div>
      <span>
        Benutzen Sie die Navigation im Header um AIS.chat-api bzw. AIS.chat-app zu konfigurieren.
      </span>
    </div>
  );
}
