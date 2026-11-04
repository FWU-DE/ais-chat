'use client';

import React, { startTransition, useEffect, useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { DisclaimerConfig } from './const';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

import MarkdownDisplay from '../chat/markdown-display';
import { usePortalContainer } from '@ui/components/portal-container';
import { useSession } from 'next-auth/react';
import { Button } from '@ui/components/button';
import type { ServerActionResult } from '@shared/actions/server-action-result';
import { Checkbox } from '@ui/components/checkbox';

type TermsConditionsModalProps = {
  handleAccept(): Promise<ServerActionResult<boolean>>;
  disclaimerConfig: DisclaimerConfig;
} & React.ComponentProps<'button'>;

/** This skips the scroll finishing check, to avoid the user from having to scroll to the bottom of the page to accept the terms and conditions. */
const SCROLL_EXCEEDING_TOLERANCE = 0.2;
const STANDARD_REM_SIZE = 16;

export default function TermsConditionsModal({
  disclaimerConfig,
  handleAccept,
}: TermsConditionsModalProps) {
  const [pageNumber, setPageNumber] = useState(0);
  const [scrollFinished, setScrollFinished] = useState(false);
  const [checkedBoxes, setCheckedBoxes] = useState<boolean[]>([]);
  const router = useRouter();
  const tUsage = useTranslations('usage-disclaimer');
  const tCommon = useTranslations('common');
  const container = usePortalContainer();
  const session = useSession();

  const nextPage = () => {
    setPageNumber(pageNumber + 1);
  };
  const prevPage = () => {
    setPageNumber(pageNumber - 1);
    setScrollFinished(false);
    setCheckedBoxes([]);
  };

  const contents: Array<string> = disclaimerConfig.pageContents;
  const checkboxLabels =
    disclaimerConfig.checkboxes ??
    (disclaimerConfig.acceptLabel ? [disclaimerConfig.acceptLabel] : []);
  const allCheckboxesChecked =
    checkboxLabels.length === 0 || checkboxLabels.every((_label, index) => checkedBoxes[index]);

  const toggleCheckbox = ({ index, isChecked }: { index: number; isChecked: boolean }) => {
    setCheckedBoxes((previous) => {
      const updated = [...previous];
      updated[index] = isChecked;
      return updated;
    });
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  const checkScrollState = () => {
    const div = scrollRef.current;
    if (div) {
      if (div.scrollHeight <= div.clientHeight) {
        startTransition(() => setScrollFinished(true));
      } else {
        const overflow = div.scrollHeight - div.clientHeight;
        const shouldBeFinished = overflow <= div.scrollHeight * SCROLL_EXCEEDING_TOLERANCE;
        startTransition(() => setScrollFinished(shouldBeFinished));
      }
    }
  };

  const handleScroll = () => {
    const div = scrollRef.current;
    if (!div) {
      return;
    }
    const overflow = div.scrollHeight - div.clientHeight;
    // If the overflow is less than 20% of the total height or the scrollTop is less than one line, set the scrollFinished state to true
    setScrollFinished(
      overflow <= div.scrollHeight * SCROLL_EXCEEDING_TOLERANCE ||
        div.scrollHeight - div.scrollTop - div.clientHeight <= STANDARD_REM_SIZE,
    );
  };

  const acceptAndClose = async () => {
    const result = await handleAccept();
    if (result.success) {
      await session.update(result.value);
    }
    router.refresh();
  };

  const navigationBar = (
    <div className="gap-6 flex flex-row">
      {pageNumber >= 1 ? (
        <Button onClick={prevPage} variant="outline" size="xl">
          {tCommon('back')}
        </Button>
      ) : null}
      {pageNumber === disclaimerConfig.pageContents.length - 1 ? (
        <Button
          onClick={acceptAndClose}
          size="xl"
          disabled={!allCheckboxesChecked && disclaimerConfig.showCheckBox}
        >
          {tCommon('accept')}
        </Button>
      ) : (
        <Button onClick={nextPage} size="xl" disabled={pageNumber > 0 && !scrollFinished}>
          {tCommon('continue')}
        </Button>
      )}
    </div>
  );

  const currentTitle =
    pageNumber >= 1 ? tUsage('terms-and-conditions-title') : tUsage('initial-title');
  const currentContent = <MarkdownDisplay>{contents[pageNumber] ?? ''}</MarkdownDisplay>;

  useEffect(() => {
    checkScrollState();
  }, [pageNumber, contents]);

  return (
    <AlertDialog.Root open defaultOpen>
      <AlertDialog.Portal container={container}>
        <AlertDialog.Overlay className="fixed inset-0 bg-[#333333] z-30 opacity-30 shadow-[0px_0px_80px_0px_rgba(0,41,102,0.1)]" />
        <AlertDialog.Content className="z-50 fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-enterprise-md bg-white p-5 lg:p-10 w-full sm:w-[450px] lg:w-[720px]">
          <AlertDialog.Title asChild>
            <h1 className="text-3xl font-medium pb-5 mb-auto mt-auto">{currentTitle}</h1>
          </AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="sr-only">{'Terms and conditions content'}</div>
          </AlertDialog.Description>
          <div className="flex flex-col gap-5 items-start self-stretch overflow-y-auto max-h-[60vh] disclaimer-content">
            <div className="min-w-0 self-stretch" ref={scrollRef} onScroll={handleScroll}>
              {currentContent}
            </div>
            {disclaimerConfig.image && (
              <div className="flex justify-center w-full mt-4">
                <Image
                  src={disclaimerConfig.image}
                  alt="Disclaimer"
                  width={300}
                  height={0}
                  style={{ height: 'auto' }}
                  onLoad={checkScrollState}
                />
              </div>
            )}
            {pageNumber === contents.length - 1 && disclaimerConfig.showCheckBox && (
              <div className="flex flex-col gap-3 items-start self-stretch">
                {checkboxLabels.map((label, index) => (
                  <div key={label} className="flex items-center gap-3 justify-center">
                    <Checkbox
                      checked={checkedBoxes[index] ?? false}
                      onCheckedChange={(checkedState) =>
                        toggleCheckbox({ index, isChecked: checkedState === true })
                      }
                      aria-labelledby={`terms-conditions-accept-label-${index}`}
                    />
                    <div
                      id={`terms-conditions-accept-label-${index}`}
                      className="flex-1 disclaimer"
                    >
                      <MarkdownDisplay>{label}</MarkdownDisplay>
                    </div>
                  </div>
                ))}
                {disclaimerConfig.footerText && (
                  <div className="disclaimer">
                    <MarkdownDisplay>{disclaimerConfig.footerText}</MarkdownDisplay>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end items-center gap-6 pt-5 mt-auto self-end">
            <AlertDialog.Action asChild>{navigationBar}</AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
