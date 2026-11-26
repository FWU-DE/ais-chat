import { useTranslations } from 'next-intl';

export type CustomChatLastUpdateProps = {
  date: Date;
};

export function CustomChatLastUpdate({ date }: CustomChatLastUpdateProps) {
  const t = useTranslations('custom-chat');

  return (
    <div className="ml-auto">
      <div className="text-right text-xs text-foreground/60">{t('last-update')}</div>
      <div className="text-right text-sm text-foreground whitespace-pre">
        {date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        {'  |  '}
        {date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
