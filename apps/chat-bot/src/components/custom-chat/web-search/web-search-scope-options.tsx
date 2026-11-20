'use client';

import type { WebSearchScope } from '@shared/db/schema';
import { FieldLabel } from '@ui/components/field';
import { RadioGroup, RadioGroupItem } from '@ui/components/radio-group';
import { useTranslations } from 'next-intl';

export function WebSearchScopeOptions({
  scopeValue,
  onScopeChange,
}: {
  scopeValue: WebSearchScope;
  onScopeChange: (value: WebSearchScope) => void;
}) {
  const t = useTranslations('custom-chat.web-search');
  const allWebId = 'web-search-scope-all-web';
  const includedDomainsId = 'web-search-scope-included-domains';

  return (
    <RadioGroup
      value={scopeValue}
      onValueChange={(value) => {
        onScopeChange(value as WebSearchScope);
      }}
      aria-label={t('scope-aria-label')}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value="all-web" id={allWebId} />
        <FieldLabel htmlFor={allWebId} size="normal">
          {t('scope-all-web')}
        </FieldLabel>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="included-domains" id={includedDomainsId} />
        <FieldLabel htmlFor={includedDomainsId} size="normal">
          {t('scope-included-domains')}
        </FieldLabel>
      </div>
    </RadioGroup>
  );
}
