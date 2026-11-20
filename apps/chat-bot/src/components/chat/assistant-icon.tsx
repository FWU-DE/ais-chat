import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';

import { cn } from '@/utils/tailwind';

import AvatarPicture from '../common/avatar-picture';
import RobotIcon from '../icons/robot';

export function AssistantIcon({
  customGptId,
  imageName,
  imageSource,
  className,
}: {
  customGptId?: string;
  imageName?: string;
  imageSource?: string;
  className?: string;
}) {
  if (customGptId === HELP_MODE_ASSISTANT_ID) {
    return (
      <div className="rounded-enterprise-sm bg-secondary/5 w-8 h-8 place-self-start m-4 mt-1">
        <RobotIcon className="w-8 h-8 text-primary p-1" />
      </div>
    );
  }
  if (imageSource !== undefined && imageName !== undefined) {
    return (
      <div className={cn('p-1.5 place-self-start mx-4 mt-1 ', className)}>
        <AvatarPicture src={imageSource} alt={imageName} variant="small" />
      </div>
    );
  }
}
