import React from 'react';

import { cn } from '@/utils/tailwind';

import { ParagraphWithConditionalTitleTwoLine } from '../common/paragraph-with-conditional-title-two-line';

type PromptSuggestionsProps = {
  suggestions: string[];
  onSelectSuggestion(suggestion: string): void;
  hidden?: boolean;
};

export default function PromptSuggestions({
  suggestions,
  onSelectSuggestion,
}: PromptSuggestionsProps) {
  return (
    <div
      className={cn(
        'relative grid gap-2 mb-2 grid-cols-1 lg:mb-4 lg:grid-cols-2 lg:gap-4',
        suggestions.length === 1 && 'grid-cols-1',
      )}
    >
      {suggestions
        .filter((s) => s.trim() !== '')
        .map((suggestion, index) => (
          <button
            onClick={() => onSelectSuggestion(suggestion)}
            key={index}
            className={cn(
              'border rounded-enterprise-md py-2.5 px-4 hover:border-primary',
              index === 0 && suggestions.length % 2 !== 0 ? 'col-span-2' : '',
            )}
          >
            <ParagraphWithConditionalTitleTwoLine content={suggestion} />
          </button>
        ))}
    </div>
  );
}
