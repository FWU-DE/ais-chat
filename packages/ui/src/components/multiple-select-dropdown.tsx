'use client';

import { CaretDownIcon } from '@phosphor-icons/react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Field, FieldLabel } from './field';

export type MultipleSelectDropdownOptionGroup<T extends string = string> = {
  title?: string;
  options: Array<{ value: T; label: string }>;
};

const multipleSelectDropdownTriggerVariants = cva(
  'border-input hover:border-primary/60 focus-visible:border-ring focus-visible:ring-ring/50 flex w-full items-center justify-between rounded-lg border bg-transparent px-2.5 text-left text-sm outline-none focus-visible:ring-3',
  {
    variants: {
      size: {
        default: 'h-11',
        sm: 'h-8',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

type MultipleSelectDropdownProps<T extends string = string> = VariantProps<
  typeof multipleSelectDropdownTriggerVariants
> & {
  label: string;
  tooltip?: string;
  value: T[];
  onValueChange: (values: T[]) => void;
  optionGroups: MultipleSelectDropdownOptionGroup<T>[];
  placeholder?: string;
  testId: string;
  selectedCountLabel?: (count: number) => string;
  contentClassName?: string;
  showSelectAll?: boolean;
  selectAllLabel?: string;
};

export function MultipleSelectDropdown<T extends string = string>({
  label,
  tooltip,
  value,
  onValueChange,
  optionGroups,
  placeholder,
  testId,
  selectedCountLabel,
  contentClassName,
  showSelectAll = true,
  selectAllLabel = 'Alle auswählen',
  size = 'default',
}: MultipleSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const options = useMemo(() => optionGroups.flatMap((group) => group.options), [optionGroups]);

  const selectedLabel = useMemo(() => {
    if (value.length === 0) {
      return placeholder;
    }

    if (value.length === 1) {
      const option = options.find((item) => item.value === value[0]);
      return option?.label ?? placeholder;
    }

    return selectedCountLabel?.(value.length) ?? String(value.length);
  }, [options, placeholder, selectedCountLabel, value]);

  const toggleValue = (optionValue: T) => {
    if (value.includes(optionValue)) {
      onValueChange(value.filter((selectedValue) => selectedValue !== optionValue));
      return;
    }

    onValueChange([...value, optionValue]);
  };

  const toggleAllOptions = () => {
    const allOptionValues = Array.from(new Set(options.map((opt) => opt.value)));
    const allSelected = allOptionValues.every((val) => value.includes(val));

    if (allSelected) {
      onValueChange(value.filter((selectedValue) => !allOptionValues.includes(selectedValue)));
    } else {
      const nextValues = [...value];

      allOptionValues.forEach((optionValue) => {
        if (!nextValues.includes(optionValue)) {
          nextValues.push(optionValue);
        }
      });

      onValueChange(nextValues);
    }
  };

  const getAllSelectState = () => {
    const allOptionValues = Array.from(new Set(options.map((opt) => opt.value)));
    const selectedCount = allOptionValues.filter((val) => value.includes(val)).length;

    if (selectedCount === 0) {
      return false;
    }

    if (selectedCount === allOptionValues.length) {
      return true;
    }

    return 'indeterminate' as const;
  };

  return (
    <Field>
      <FieldLabel tooltip={tooltip}>{label}</FieldLabel>
      <DropdownMenu modal={false} open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
            }
          }}
          aria-label={label}
          data-testid={testId}
          className={multipleSelectDropdownTriggerVariants({ size })}
        >
          <span className="truncate text-muted-foreground">{selectedLabel}</span>
          <CaretDownIcon className="text-muted-foreground size-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className={[
            'z-300 rounded-enterprise-md border border-gray-200 bg-white p-4 shadow-dropdown w-auto max-w-[calc(100vw-2rem)] scrollbar-gutter-stable',
            contentClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="flex flex-col gap-2">
            {showSelectAll && (
              <>
                <div className="flex flex-col gap-2">
                  <DropdownMenuCheckboxItem
                    checked={getAllSelectState()}
                    showIndicator={false}
                    onCheckedChange={toggleAllOptions}
                    onSelect={(event) => event.preventDefault()}
                    className="focus-visible:ring-ring/50 flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm font-medium text-gray-700 outline-none focus-visible:ring-3"
                  >
                    <span
                      aria-hidden="true"
                      className="border-dark-gray data-[checked=true]:border-primary data-[checked=true]:bg-primary data-[checked=true]:text-white flex size-4 shrink-0 items-center justify-center rounded-xs border"
                      data-checked={getAllSelectState()}
                    >
                      {getAllSelectState() === 'indeterminate' ? (
                        <div className="size-2 bg-primary" />
                      ) : getAllSelectState() ? (
                        <CheckIcon className="size-3" />
                      ) : null}
                    </span>
                    <span>{selectAllLabel}</span>
                  </DropdownMenuCheckboxItem>
                </div>
                <div className="border-b border-gray-200" />
              </>
            )}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4 pr-2">
              {optionGroups.map((group) => (
                <div key={group.title ?? group.options.map((item) => item.value).join('-')}>
                  {group.title && (
                    <p className="mb-2 wrap-break-word bg-gray-100 px-2 py-1 text-[10px] font-semibold tracking-[0.2em] text-gray-500 uppercase">
                      {group.title}
                    </p>
                  )}
                  <ul className="space-y-2">
                    {group.options.map((option) => {
                      const checked = value.includes(option.value);

                      return (
                        <li key={option.value}>
                          <DropdownMenuCheckboxItem
                            checked={checked}
                            showIndicator={false}
                            onCheckedChange={() => toggleValue(option.value)}
                            onSelect={(event) => event.preventDefault()}
                            className="focus-visible:ring-ring/50 flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-gray-700 outline-none focus-visible:ring-3"
                          >
                            <span
                              aria-hidden="true"
                              className="border-dark-gray data-[checked=true]:border-primary data-[checked=true]:bg-primary data-[checked=true]:text-white flex size-4 shrink-0 items-center justify-center rounded-xs border"
                              data-checked={checked}
                            >
                              {checked ? <CheckIcon className="size-3" /> : null}
                            </span>
                            <span>{option.label}</span>
                          </DropdownMenuCheckboxItem>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
}
