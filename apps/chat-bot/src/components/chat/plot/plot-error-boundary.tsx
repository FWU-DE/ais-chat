'use client';

import { Component, type ReactNode } from 'react';
import { logError } from '@shared/logging/logging';
import { PlotError } from './plot-error';

// A broken plot must never take the whole chat down.
export class PlotErrorBoundary extends Component<
  { children: ReactNode; title?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    logError('Plot could not be rendered', error, { title: this.props.title });
  }

  render() {
    return this.state.hasError ? <PlotError /> : this.props.children;
  }
}
