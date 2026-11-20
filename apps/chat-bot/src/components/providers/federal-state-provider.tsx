'use client';

import { FederalStateModel } from '@shared/federal-states/types';
import React from 'react';

const FederalStateContext = React.createContext<FederalStateModel | undefined>(undefined);

export function useFederalState(): FederalStateModel | undefined {
  return React.useContext(FederalStateContext);
}

export function FederalStateProvider({
  children,
  federalState,
}: {
  children: React.ReactNode;
  federalState: FederalStateModel;
}) {
  return <FederalStateContext value={federalState}>{children}</FederalStateContext>;
}
