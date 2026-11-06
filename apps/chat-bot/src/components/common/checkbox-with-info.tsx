import { Checkbox } from '@ui/components/checkbox';
import { InfoTooltip } from '@ui/components/tooltip';
import React from 'react';

type CheckboxWithInfoProps = {
  label: string;
  tooltip: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  testId?: string;
};

export default function CheckboxWithInfo({
  label,
  tooltip,
  checked,
  onCheckedChange,
  disabled,
  testId,
}: CheckboxWithInfoProps) {
  return (
    <div className="flex items-center gap-1">
      <Checkbox
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        data-testid={testId}
      />
      <InfoTooltip tooltip={tooltip} ariaLabel={tooltip} />
    </div>
  );
}
