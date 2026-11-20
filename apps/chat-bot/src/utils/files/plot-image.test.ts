import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRenderedPlotMock, renderPlotPngMock, createBoardMock, freeBoardMock, logWarningMock } =
  vi.hoisted(() => ({
    getRenderedPlotMock: vi.fn(),
    renderPlotPngMock: vi.fn(),
    createBoardMock: vi.fn(),
    freeBoardMock: vi.fn(),
    logWarningMock: vi.fn(),
  }));

vi.mock('@shared/logging', () => ({ logWarning: logWarningMock }));
vi.mock('jsxgraph', () => ({ default: { JSXGraph: { freeBoard: freeBoardMock } } }));
vi.mock('@/components/chat/plot/jsxgraph-board', () => ({ createBoard: createBoardMock }));
vi.mock('@/components/chat/plot/png-export', () => ({ renderPlotPng: renderPlotPngMock }));
vi.mock('@/components/chat/plot/rendered-plots', () => ({ getRenderedPlot: getRenderedPlotMock }));

const { renderPlotImage, waitForPlotActivation } = await import('./plot-image');

const spec = { board: {}, elements: [['point', [0, 0]]] } as never;
const png = { arrayBuffer: async () => new ArrayBuffer(4) };

function stubDocument(svg: unknown) {
  const container = { style: { cssText: '' }, querySelector: vi.fn(() => svg), remove: vi.fn() };
  vi.stubGlobal('document', {
    createElement: vi.fn(() => container),
    body: { append: vi.fn() },
  });
  return container;
}

describe('waitForPlotActivation', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves immediately without requestAnimationFrame', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);

    await expect(waitForPlotActivation()).resolves.toBeUndefined();
  });

  it('waits for two animation frames', async () => {
    const raf = vi.fn((callback: () => void) => callback());
    vi.stubGlobal('requestAnimationFrame', raf);

    await waitForPlotActivation();

    expect(raf).toHaveBeenCalledTimes(2);
  });
});

describe('renderPlotImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: () => void) => callback()),
    );
    getRenderedPlotMock.mockReturnValue(undefined);
    renderPlotPngMock.mockResolvedValue(png);
  });

  it('scales an already rendered plot to the maximum image size', async () => {
    getRenderedPlotMock.mockReturnValue({
      getBoundingClientRect: () => ({ width: 1200, height: 600 }),
    });

    const image = await renderPlotImage(spec);

    expect(image).toMatchObject({ width: 600, height: 300 });
    expect(image?.data.byteLength).toBe(4);
    expect(createBoardMock).not.toHaveBeenCalled();
  });

  it('renders a temporary board when no plot is visible', async () => {
    const container = stubDocument({});
    const board = { fullUpdate: vi.fn() };
    createBoardMock.mockReturnValue({ board });

    const image = await renderPlotImage(spec);

    expect(image).toMatchObject({ width: 600, height: 450 });
    expect(board.fullUpdate).toHaveBeenCalledTimes(1);
    expect(freeBoardMock).toHaveBeenCalledWith(board);
    expect(container.remove).toHaveBeenCalledTimes(1);
  });

  it('uses the bounding box aspect ratio for the board size', async () => {
    stubDocument({});
    createBoardMock.mockReturnValue({ board: { fullUpdate: vi.fn() } });

    const image = await renderPlotImage({
      board: { boundingBox: [-10, 1, 10, -1] },
      elements: [['point', [0, 0]]],
    } as never);

    expect(image).toMatchObject({ width: 600, height: 260 });
  });

  it('returns undefined when no svg was rendered', async () => {
    const container = stubDocument(null);
    createBoardMock.mockReturnValue({ board: { fullUpdate: vi.fn() } });

    await expect(renderPlotImage(spec)).resolves.toBeUndefined();
    expect(renderPlotPngMock).not.toHaveBeenCalled();
    expect(container.remove).toHaveBeenCalledTimes(1);
  });

  it('logs a warning and returns undefined on errors', async () => {
    const container = stubDocument({});
    createBoardMock.mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(renderPlotImage(spec)).resolves.toBeUndefined();
    expect(logWarningMock).toHaveBeenCalledWith('Plot could not be exported', {
      message: 'boom',
    });
    expect(freeBoardMock).not.toHaveBeenCalled();
    expect(container.remove).toHaveBeenCalledTimes(1);
  });
});
