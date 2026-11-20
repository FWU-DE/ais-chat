import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';

import AvatarPicture from '../common/avatar-picture';
import MarkdownDisplay from './markdown-display';

export function InitialChatContentDisplay({
  title,
  imageSource,
  description,
  exerciseDescription,
  setDialogStarted,
  startDialogLabel,
}: {
  title: string;
  imageSource?: string;
  description?: string;
  exerciseDescription?: string;
  setDialogStarted?: (dialogStarted: boolean) => void;
  startDialogLabel?: string;
}) {
  const tCustomChat = useTranslations('custom-chat.shared');

  return (
    <div className="flex flex-col items-center justify-center h-full mx-auto p-4 gap-1">
      {imageSource && <AvatarPicture src={imageSource} alt={title} variant="normal" />}
      <h1 className="text-2xl font-medium mt-8 text-center">{title}</h1>
      {description !== undefined && description.trim() !== '' && (
        <p className="max-w-full text-center">{description}</p>
      )}
      {exerciseDescription !== undefined && exerciseDescription.trim() !== '' && (
        <div className="flex flex-col max-w-full min-w-[50%] min-h-0 m-4 border-primary border-2 rounded-enterprise-md py-3 pr-2">
          <div className="min-h-0 overflow-y-auto pl-4 pr-2">
            <MarkdownDisplay>{exerciseDescription}</MarkdownDisplay>
          </div>
        </div>
      )}
      {setDialogStarted !== undefined && (
        <Button
          onClick={() => setDialogStarted(true)}
          className="mt-3 shrink-0"
          data-testid="start-dialog-button"
        >
          {startDialogLabel ?? tCustomChat('start-chat')}
        </Button>
      )}
    </div>
  );
}
