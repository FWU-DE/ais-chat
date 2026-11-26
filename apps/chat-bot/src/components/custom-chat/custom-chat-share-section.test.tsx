// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/common/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../providers/federal-state-provider', () => ({
  useFederalState: () => ({ featureToggles: { isShareTemplateWithSchoolEnabled: true } }),
}));

import CustomShareSection from './custom-chat-share-section';

type FormValues = {
  author: string;
  isSchoolShared: boolean;
  isCommunityShared: boolean;
  hasLinkAccess: boolean;
};

function Harness({ sharingPending }: { sharingPending: boolean }) {
  const { control } = useForm<FormValues>({
    defaultValues: {
      author: 'Author stays editable',
      isSchoolShared: false,
      isCommunityShared: false,
      hasLinkAccess: true,
    },
  });

  return (
    <CustomShareSection
      control={control}
      schoolSharingName="isSchoolShared"
      communitySharingName="isCommunityShared"
      linkSharingName="hasLinkAccess"
      linkToShare="/shared/entity"
      sharingPending={sharingPending}
    >
      <input aria-label="author" defaultValue="Author stays editable" />
    </CustomShareSection>
  );
}

function renderHarness(sharingPending: boolean) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;

  act(() => {
    root = createRoot(container);
    root.render(<Harness sharingPending={sharingPending} />);
  });

  return {
    container,
    rerender(nextPending: boolean) {
      act(() => root.render(<Harness sharingPending={nextPending} />));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function sharingControls(container: HTMLElement) {
  return {
    root: container.querySelector('#share-settings'),
    school: container.querySelector('[data-testid="school-sharing-checkbox"]'),
    community: container.querySelector('[data-testid="community-sharing-checkbox"]'),
    link: container.querySelector('[aria-label="link"]'),
    copyLink: container.querySelector('button[aria-label="copy-link"]'),
    author: container.querySelector('input[aria-label="author"]'),
  };
}

function expectDisabled(element: Element | null, disabled: boolean) {
  expect(element).not.toBeNull();
  expect((element as HTMLButtonElement).disabled).toBe(disabled);
}

describe('CustomChatShareSection pending state', () => {
  const mounted: Array<() => void> = [];

  afterEach(() => {
    mounted.splice(0).forEach((unmount) => unmount());
  });

  it('marks the sharing region busy and disables sharing controls without disabling author editing', () => {
    const harness = renderHarness(true);
    mounted.push(harness.unmount);
    const controls = sharingControls(harness.container);

    expect(controls.root?.getAttribute('aria-busy')).toBe('true');
    expectDisabled(controls.school, true);
    expectDisabled(controls.community, true);
    expectDisabled(controls.link, true);
    expectDisabled(controls.copyLink, true);
    expectDisabled(controls.author, false);
    expect(controls.root?.contains(controls.author)).toBe(true);
    expect(controls.author?.closest('[data-slot="card"]')).toBe(
      controls.school?.closest('[data-slot="card"]'),
    );
    expect(
      controls.school!.compareDocumentPosition(controls.author!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('restores sharing controls when pending completes', async () => {
    const harness = renderHarness(true);
    mounted.push(harness.unmount);

    await act(async () => {
      harness.rerender(false);
      await Promise.resolve();
    });
    const controls = sharingControls(harness.container);

    expect(controls.root?.getAttribute('aria-busy')).toBe('false');
    expectDisabled(controls.school, false);
    expectDisabled(controls.community, false);
    expectDisabled(controls.link, false);
    expectDisabled(controls.copyLink, false);
    expectDisabled(controls.author, false);
  });

  it('renders sharing controls busy and disabled during SSR, then enables them after hydration', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Harness sharingPending={false} />);
    document.body.appendChild(container);

    const serverControls = sharingControls(container);
    expect(serverControls.root?.getAttribute('aria-busy')).toBe('true');
    expectDisabled(serverControls.school, true);
    expectDisabled(serverControls.community, true);
    expectDisabled(serverControls.link, true);
    expectDisabled(serverControls.copyLink, true);
    expectDisabled(serverControls.author, false);

    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Harness sharingPending={false} />);
      await Promise.resolve();
    });

    const hydratedControls = sharingControls(container);
    expect(hydratedControls.root?.getAttribute('aria-busy')).toBe('false');
    expectDisabled(hydratedControls.school, false);
    expectDisabled(hydratedControls.community, false);
    expectDisabled(hydratedControls.link, false);
    expectDisabled(hydratedControls.copyLink, false);
    expectDisabled(hydratedControls.author, false);

    mounted.push(() => {
      act(() => root.unmount());
      container.remove();
    });
  });
});
