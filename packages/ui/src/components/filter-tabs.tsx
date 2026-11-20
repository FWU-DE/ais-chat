'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export type FilterTabItem<T extends string> = {
  value: T;
  label: string;
};

type FilterTabsProps<T extends string> = {
  tabs: FilterTabItem<T>[];
  activeTab: T;
  onTabChange: (value: T) => void;
};

export function FilterTabs<T extends string>({ tabs, activeTab, onTabChange }: FilterTabsProps<T>) {
  return (
    <>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          data-testid={`filter-tab-${tab.value}`}
          aria-pressed={activeTab === tab.value}
          onClick={() => onTabChange(tab.value)}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium transition-colors border',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            activeTab === tab.value
              ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/85'
              : 'bg-background text-primary border-primary hover:bg-primary/15',
          )}
        >
          {tab.label}
        </button>
      ))}
    </>
  );
}
