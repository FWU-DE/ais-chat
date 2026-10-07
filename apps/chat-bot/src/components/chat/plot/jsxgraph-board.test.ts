// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type JXG from 'jsxgraph';
import { applyInteractionOptions, createBoard } from './jsxgraph-board';
import { parsePlotSpec, type PlotSpec } from '@/utils/plot/plot-spec';

function spec(source: string): PlotSpec {
  const result = parsePlotSpec(source);
  if ('error' in result) {
    throw new Error(result.error.message);
  }
  return result.spec;
}

function fakeBoard() {
  const setAttribute = vi.fn();
  return { board: { setAttribute } as unknown as JXG.Board, setAttribute };
}

// jsdom has no layout engine, so JSXGraph's resize handling needs a matchMedia stub.
function stubMatchMedia() {
  window.matchMedia = (() => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('applyInteractionOptions', () => {
  it('requires shift to pan/zoom a 2D plot outside fullscreen', () => {
    const { board, setAttribute } = fakeBoard();
    applyInteractionOptions(board, spec('{"elements":[["point",[0,0]]]}'), false);
    expect(setAttribute).toHaveBeenCalledWith({
      pan: { needShift: true },
      zoom: { needShift: true },
    });
  });

  it('does not require shift in fullscreen', () => {
    const { board, setAttribute } = fakeBoard();
    applyInteractionOptions(board, spec('{"elements":[["point",[0,0]]]}'), true);
    expect(setAttribute).toHaveBeenCalledWith({
      pan: { needShift: false },
      zoom: { needShift: false },
    });
  });

  it('disables panning entirely for 3D plots, even in fullscreen', () => {
    const { board, setAttribute } = fakeBoard();
    const threeDSpec = spec('{"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]]]}');
    applyInteractionOptions(board, threeDSpec, true);
    expect(setAttribute).toHaveBeenCalledWith({
      pan: { enabled: false },
      zoom: { needShift: false },
    });
  });

  it('still requires shift to zoom a 3D plot outside fullscreen', () => {
    const { board, setAttribute } = fakeBoard();
    const threeDSpec = spec('{"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]]]}');
    applyInteractionOptions(board, threeDSpec, false);
    expect(setAttribute).toHaveBeenCalledWith({
      pan: { enabled: false },
      zoom: { needShift: true },
    });
  });
});

describe('createBoard', () => {
  it('does not turn ^ into a literal <sup> tag in legend labels', () => {
    stubMatchMedia();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const legendSpec = spec(
      JSON.stringify({
        board: { boundingBox: [-4, 6, 6, -4] },
        elements: [['legend', [3, 5.5], { labels: ['y = e^x'], colors: ['#d62728'] }]],
      }),
    );
    const { board } = createBoard(container, legendSpec, undefined, [], false);

    const texts = Object.values(board.objects)
      .filter((object): object is { elType: string; plaintext: string } =>
        ['text', 'label'].includes((object as { elType: string }).elType),
      )
      .map((object) => object.plaintext);

    expect(texts).toContain('y = e^x');
    expect(texts.some((text) => text.includes('<sup>'))).toBe(false);
  });
});
