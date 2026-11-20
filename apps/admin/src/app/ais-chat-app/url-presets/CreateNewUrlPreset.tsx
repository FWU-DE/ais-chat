import { PlusIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';

export function CreateNewUrlPreset({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex justify-center items-center h-28 bg-gray-100 border rounded-md ">
      <Button onClick={onCreate}>
        <PlusIcon />
        Neues Webseitenpaket
      </Button>
    </div>
  );
}
