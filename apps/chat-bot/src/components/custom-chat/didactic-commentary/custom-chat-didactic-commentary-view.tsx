import { useTranslations } from 'next-intl';

import { CustomChatFieldInfo } from '../custom-chat-field-info';

export function CustomChatDidacticCommentaryView({
  didacticCommentary,
  tooltip,
}: {
  didacticCommentary: string;
  tooltip: string;
}) {
  const t = useTranslations('custom-chat.didactic-commentary');

  if (didacticCommentary.trim() === '') {
    return null;
  }

  return <CustomChatFieldInfo label={t('heading')} value={didacticCommentary} tooltip={tooltip} />;
}
