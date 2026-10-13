'use client';

import { useTranslations } from 'next-intl';
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import { Chip } from '@ui/components/chip';
import { WebSearchFields } from './web-search.types';
import { Card, CardContent } from '@ui/components/card';
import { CustomChatHeading2 } from '../custom-chat-heading2';

type CustomChatWebSearchViewProps = WebSearchFields;

export function CustomChatWebSearchView(props: CustomChatWebSearchViewProps) {
  const t = useTranslations('custom-chat.web-search');

  return (
    <div className="flex flex-col gap-3 mt-10">
      <CustomChatHeading2 text={t('heading')} tooltip={t('heading-tooltip')} />
      <Card>
        <CardContent>
          <div className="flex items-center gap-2">
            {props.isWebSearchEnabled ? (
              <>
                <CheckCircleIcon className="size-6.5 shrink-0 text-success" />
                <span>{t('activated')}</span>
              </>
            ) : (
              <>
                <XCircleIcon className="size-6.5 shrink-0 text-muted-foreground" />
                <span>{t('deactivated')}</span>
              </>
            )}
          </div>

          {props.isWebSearchEnabled && props.webSearchScope === 'included-domains' && (
            <>
              <div className="pt-4">{t('scope-included-domains')}</div>
              <ul className="flex flex-row flex-wrap gap-2 pt-4">
                {props.webSearchIncludedDomains.toSorted().map((domain) => (
                  <li key={domain}>
                    <Chip href={`https://${domain}`} label={domain} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
