import React from 'react';
import type { ObjectWrapperProps } from '@autoform/react';

export const ObjectWrapper: React.FC<ObjectWrapperProps> = ({ label, children, parsedField }) => {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-medium">{label}</h3>
        {parsedField.fieldConfig?.description && (
          <div className="text-muted-foreground text-sm">{parsedField.fieldConfig.description}</div>
        )}
      </div>
      {children}
    </div>
  );
};
