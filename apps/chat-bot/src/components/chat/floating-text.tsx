'use client';

import { NotchesIcon } from '@phosphor-icons/react';
import React from 'react';
import { createPortal } from 'react-dom';

import { useChatOverlayRoot } from '@/components/layout/chat-overlay-root-context';
import { cn } from '@/utils/tailwind';

import useBreakpoints from '../hooks/use-breakpoints';
import ChevronDownIcon from '../icons/chevron-down';
import ChevronRightIcon from '../icons/chevron-right';
import MarkdownDisplay from './markdown-display';

export const dynamic = 'force-dynamic';

const MIN_WIDTH = 240;
const MIN_HEIGHT = 120;

// Floating, minimizable, movable learning context dialog (desktop only) on mobile it's sticky on the top
export function FloatingText({
  learningContext,
  dialogStarted,
  title,
  parentRef,
  parentElement,
  maxWidth,
  maxHeight,
  minMargin,
}: {
  learningContext: string;
  dialogStarted: boolean;
  title: string;
  parentRef?: React.RefObject<HTMLElement>;
  parentElement?: HTMLElement | null;
  maxWidth: number;
  maxHeight: number;
  minMargin: number;
}) {
  const { isAtLeast } = useBreakpoints();
  const overlayTarget = useChatOverlayRoot();
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [position, setPosition] = React.useState({ x: minMargin, y: minMargin });
  const [dragging, setDragging] = React.useState(false);
  const [rel, setRel] = React.useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const resizeStartRef = React.useRef<{
    pointerX: number;
    pointerY: number;
    width: number;
    height: number;
  } | null>(null);
  const isDraggable = isAtLeast.lg;
  const isResizable = isDraggable && !isMinimized;
  const dragCursorClass = isDraggable ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : undefined;

  const getParentElement = React.useCallback(() => {
    return overlayTarget ?? parentElement ?? parentRef?.current ?? null;
  }, [overlayTarget, parentElement, parentRef]);

  // Helper to clamp position within parent bounds
  function clampPosition({
    x,
    y,
    containerWidth,
    containerHeight,
  }: {
    x: number;
    y: number;
    containerWidth: number;
    containerHeight: number;
  }) {
    const parent = getParentElement();
    if (!parent) return { x, y };
    const parentRect = parent.getBoundingClientRect();
    const newX = Math.max(minMargin, Math.min(x, parentRect.width - containerWidth - minMargin));
    const newY = Math.max(minMargin, Math.min(y, parentRect.height - containerHeight - minMargin));
    return { x: newX, y: newY };
  }

  React.useEffect(() => {
    // Set initial position within parent (top-left corner with minMargin)
    if (getParentElement() && containerRef.current) {
      setPosition({
        x: minMargin,
        y: minMargin,
      });
    }
  }, [minMargin, containerRef, getParentElement]);

  React.useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging || !rel) return;
      const parent = getParentElement();
      if (!containerRef.current || !parent) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      const parentRect = parent.getBoundingClientRect();
      const newX = e.clientX - parentRect.left - rel.x;
      const newY = e.clientY - parentRect.top - rel.y;

      // Clamp values within parent
      const clamped = clampPosition({ x: newX, y: newY, containerWidth, containerHeight });
      setPosition(clamped);
    }
    function onMouseUp() {
      setDragging(false);
      setRel(null);
    }
    // Touch event handlers
    function onTouchMove(e: TouchEvent) {
      if (!dragging || !rel) return;
      const parent = getParentElement();
      if (!containerRef.current || !parent) return;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch?.clientX || !touch?.clientY) return;
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      const parentRect = parent.getBoundingClientRect();
      const newX = touch.clientX - parentRect.left - rel.x;
      const newY = touch.clientY - parentRect.top - rel.y;

      // Clamp values within parent
      const clamped = clampPosition({ x: newX, y: newY, containerWidth, containerHeight });
      setPosition(clamped);
    }
    function onTouchEnd() {
      setDragging(false);
      setRel(null);
    }
    if (dragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onTouchEnd);
    } else {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, rel, getParentElement]);

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDragging(true);
      setRel({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }

  // Touch start handler
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (containerRef.current && e.touches.length === 1) {
      const rect = containerRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      if (!touch) return;
      setDragging(true);
      setRel({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
    }
  }

  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      width: rect.width,
      height: rect.height,
    };
  }

  function handleResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = resizeStartRef.current;
    if (!start) return;
    const parentRect = getParentElement()?.getBoundingClientRect();
    const availableWidth = parentRect ? parentRect.width - position.x - minMargin : Infinity;
    const availableHeight = parentRect ? parentRect.height - position.y - minMargin : Infinity;
    setSize({
      width: Math.max(
        MIN_WIDTH,
        Math.min(start.width + e.clientX - start.pointerX, availableWidth),
      ),
      height: Math.max(
        MIN_HEIGHT,
        Math.min(start.height + e.clientY - start.pointerY, availableHeight),
      ),
    });
  }

  function handleResizePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    resizeStartRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // Until the window is resized, the initial limits apply. Afterwards it may use the space left in the parent.
  function getMaxSize(initialMax: number, offset: number) {
    return size === null ? initialMax : `calc(100% - ${offset + minMargin}px)`;
  }

  if (!dialogStarted) return null;

  const floatingTextElement = (
    <aside
      ref={containerRef}
      aria-labelledby="floating-text-title"
      className={cn(
        'pointer-events-auto flex flex-col z-10 bg-secondary rounded-xl border select-none',
        // using string interpolations is extremely flaky, so we're using a static class name
        isDraggable ? 'absolute' : 'sticky',
        !isDraggable && 'mx-4',
        dragCursorClass,
      )}
      style={{
        left: isDraggable ? position.x : undefined,
        top: isDraggable ? position.y : minMargin,
        maxWidth: isDraggable ? getMaxSize(maxWidth, position.x) : '100%',
        maxHeight: isDraggable ? getMaxSize(maxHeight, position.y) : '40%',
        width: isResizable ? size?.width : undefined,
        height: isResizable ? size?.height : undefined,
      }}
    >
      <div
        role="presentation"
        className="flex items-center justify-between pl-4 py-2 rounded-t-xl mr-1"
        onMouseDown={isDraggable ? handleMouseDown : undefined}
        onTouchStart={isDraggable ? handleTouchStart : undefined}
      >
        <span id="floating-text-title" className={cn(dragCursorClass, 'font-semibold text-base')}>
          {title}
        </span>
        <button
          aria-label="Minimize"
          aria-expanded={!isMinimized}
          onClick={() => {
            setIsMinimized(!isMinimized);
            // The max size depends on the position, so a resized panel must be moved back into view
            // using its saved size before it expands. Measuring it afterwards would see the capped size.
            if (isMinimized && size !== null) {
              setPosition(
                clampPosition({
                  ...position,
                  containerWidth: size.width,
                  containerHeight: size.height,
                }),
              );
              return;
            }
            setTimeout(() => {
              const parent = getParentElement();
              if (containerRef.current && parent) {
                const parentRect = parent.getBoundingClientRect();
                const rect = containerRef.current.getBoundingClientRect();
                const newPos = {
                  x: Math.max(
                    minMargin,
                    Math.min(position.x, parentRect.width - rect.width - minMargin),
                  ),
                  y: Math.max(
                    minMargin,
                    Math.min(position.y, parentRect.height - rect.height - minMargin),
                  ),
                };
                if (newPos.x !== position.x || newPos.y !== position.y) {
                  setPosition(newPos);
                }
              }
            }, 0);
          }}
          className="flex items-center justify-center bg-none border-none cursor-pointer w-6 h-6"
        >
          {isMinimized ? (
            <ChevronRightIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )}
        </button>
      </div>
      {!isMinimized && (
        <div className="flex min-h-0 flex-1 pt-2 pb-3 lg:pb-5 pl-4 pr-2">
          <div className="min-h-0 flex-1 cursor-text select-text overflow-auto pr-2">
            <MarkdownDisplay>{learningContext ?? ''}</MarkdownDisplay>
          </div>
        </div>
      )}
      {/*
        Custom handle instead of CSS `resize`: the native handle cannot be inset, so it overlaps the
        rounded corner, and it applies a size on the first mousedown, which breaks the max-size limits.
      */}
      {isResizable && (
        <div
          role="presentation"
          className="absolute bottom-1 right-1 cursor-nwse-resize touch-none opacity-60"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
        >
          <NotchesIcon className="size-3" aria-hidden="true" />
        </div>
      )}
    </aside>
  );

  if (isDraggable && overlayTarget) {
    return createPortal(floatingTextElement, overlayTarget);
  }

  return floatingTextElement;
}
