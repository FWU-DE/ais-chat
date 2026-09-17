import React from 'react';
import { Button } from '@ais-chat/ui/components/button';

export const SubmitButton: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Button type="submit">{children}</Button>
);
