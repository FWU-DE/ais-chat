import { SuspensionRequestSelectModel } from '@shared/db/schema';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { Button } from '@ui/components/button';
import { Checkbox } from '@ui/components/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/collapsible';
import { FieldLabel } from '@ui/components/field';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { useState } from 'react';

import { mapReasonToLabel } from '../../utils';

type SuspensionRequestItemProps = {
  request: SuspensionRequestSelectModel;
  canMarkAsChecked: boolean;
  onMarkAsChecked: (suspensionRequestId: string) => void;
};

export function SuspensionRequestItem({
  request,
  canMarkAsChecked,
  onMarkAsChecked,
}: SuspensionRequestItemProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border rounded bg-background-2 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex flex-row items-center">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="aria-expanded:bg-transparent hover:bg-transparent">
              {isOpen ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronUpIcon className="size-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <span>{mapReasonToLabel(request.reason)}</span>
          <span className="text-sm italic pl-2">{` gemeldet am (${formatDateToGermanTimestamp(request.createdAt)})`}</span>
          <div className="ml-auto flex items-center space-x-2 pr-2">
            <Checkbox
              disabled={!canMarkAsChecked}
              checked={request.checked}
              onCheckedChange={() => onMarkAsChecked(request.id)}
            />
            <FieldLabel>Gelesen</FieldLabel>
          </div>
        </div>

        <CollapsibleContent className="p-4">
          <div>
            <span className="font-semibold">{'Melder: '}</span>
            <span>{request.requesterId}</span>
          </div>
          <div>
            <span className="font-semibold">{'Beschreibung: '}</span>
            <span>{request.description}</span>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
