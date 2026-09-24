'use client';
import React from 'react';
import * as Toast from '@radix-ui/react-toast';
import { cn } from '@/utils/tailwind';
import './toast.css';
import CheckIcon from '../icons/check';
import DangerIcon from '../icons/danger';

export type ToastContextType = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState<React.ReactNode>(null);
  const timerRef = React.useRef(0);

  const showToast = (msg: string, action: 'success' | 'error') => {
    setMessage(
      <div className="flex items-center p-6 gap-4">
        {action === 'success' && <CheckIcon className="w-10 h-10 text-[#02A59B]" />}
        {action === 'error' && <DangerIcon className="w-10 h-10 text-coral" />}
        <span className="whitespace-pre-line">{msg}</span>
      </div>,
    );
    setOpen(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(false), 3000);
  };

  const toast = {
    success: (msg: string) => showToast(msg, 'success'),
    error: (msg: string) => showToast(msg, 'error'),
  };

  return (
    <ToastContext value={toast}>
      <Toast.Provider swipeDirection="right">
        {children}
        <Toast.Root
          open={open}
          onOpenChange={setOpen}
          className={cn(
            'grid grid-cols-[auto_max-content] items-center gap-x-4 bg-white',
            'data-[state=closed]:animate-hide',
            'data-[state=open]:animate-slideIn',
            'data-[swipe=end]:animate-swipeOut',
            'rounded-enterprise-md shadow-dropdown',
          )}
        >
          <Toast.Title className="text-dark-gray">{message}</Toast.Title>
        </Toast.Root>
        <Toast.Viewport className="fixed top-0 right-0 z-2147483647 m-0 flex w-[390px] max-w-[100vw] list-none flex-col gap-2.5 p-(--viewport-padding) outline-hidden [--viewport-padding:25px]" />
      </Toast.Provider>
    </ToastContext>
  );
}
