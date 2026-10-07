import { describe, it, expect } from 'vitest';
import { parsePlotSpec, getSliderRange, getSliderDefinitions, type PlotElement } from './plot-spec';

function expectValid(source: string) {
  const result = parsePlotSpec(source);
  if ('error' in result) {
    throw new Error(`Expected valid spec, got error: ${result.error.message}`);
  }
  return result.spec;
}

function expectInvalid(source: string) {
  const result = parsePlotSpec(source);
  if (!('error' in result)) {
    throw new Error('Expected an error, got a valid spec');
  }
  return result.error;
}

describe('parsePlotSpec', () => {
  it('parses a minimal valid spec', () => {
    const spec = expectValid('{"elements":[["point",[0,0]]]}');
    expect(spec.elements).toEqual([['point', [0, 0]]]);
    expect(spec.board).toEqual({});
  });

  it('accepts JSON comments and trailing commas', () => {
    const spec = expectValid(`{
      // a comment
      "elements": [["point", [0, 0]],],
    }`);
    expect(spec.elements).toHaveLength(1);
  });

  it('rejects invalid JSON', () => {
    const error = expectInvalid('{not json');
    expect(error.name).toBe('PlotSpecError');
    expect(error.message).toBe('Plot source is not valid JSON');
  });

  it.each(['image', 'foreignobject', 'button', 'input', 'checkbox', 'htmlslider'])(
    'rejects the blocked element type "%s"',
    (type) => {
      expectInvalid(`{"elements":[["${type}",[0,0]]]}`);
    },
  );

  it('is case-insensitive about blocked element types', () => {
    expectInvalid('{"elements":[["IMAGE",[0,0]]]}');
  });

  it.each([';', '{', '}', '"', "'", '`'])(
    'rejects the unsafe character %s in string parents',
    (unsafe) => {
      expectInvalid(`{"elements":[["functiongraph",["x${unsafe}"]]]}`);
    },
  );

  it.each([
    { name: 'an empty elements array', source: '{"elements":[]}' },
    {
      name: 'unsafe characters nested inside array parents',
      source: '{"elements":[["curve",[["a;b","c"]]]]}',
    },
    {
      name: 'an invalid bounding box where xMin >= xMax',
      source: '{"board":{"boundingBox":[5,5,-5,-5]},"elements":[["point",[0,0]]]}',
    },
    {
      name: 'an invalid bounding box where yMin >= yMax',
      source: '{"board":{"boundingBox":[-5,-5,5,5]},"elements":[["point",[0,0]]]}',
    },
    { name: 'a slider without a valid range', source: '{"elements":[["slider",[0,1]]]}' },
  ] as const)('rejects $name', ({ source }) => {
    expectInvalid(source);
  });

  it('allows unsafe characters in text content', () => {
    const spec = expectValid('{"elements":[["text",[0,0,"a \\"quoted\\" word"]]]}');
    expect(spec.elements[0]?.[1][2]).toBe('a "quoted" word');
  });

  it('allows unsafe characters in text3d content', () => {
    expectValid(
      '{"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]],["text3d",[0,0,0,"a;b"]]]}',
    );
  });

  it('accepts a valid bounding box', () => {
    const spec = expectValid('{"board":{"boundingBox":[-5,5,5,-5]},"elements":[["point",[0,0]]]}');
    expect(spec.board.boundingBox).toEqual([-5, 5, 5, -5]);
  });

  it('accepts a slider with a valid range', () => {
    const spec = expectValid('{"elements":[["slider",[0,1,3]]]}');
    expect(spec.elements).toHaveLength(1);
  });
});

describe('getSliderRange', () => {
  it('reads the plain [min, start, max] form', () => {
    expect(getSliderRange([0, 1, 3])).toEqual([0, 1, 3]);
  });

  it('reads the nested JSXGraph form', () => {
    expect(
      getSliderRange([
        [-1, 0],
        [1, 0],
        [0, 1, 3],
      ]),
    ).toEqual([0, 1, 3]);
  });

  it('returns undefined for a wrong-length plain array', () => {
    expect(getSliderRange([0, 1])).toBeUndefined();
  });

  it('returns undefined for non-numeric entries', () => {
    expect(getSliderRange(['a', 1, 3])).toBeUndefined();
    expect(
      getSliderRange([
        [-1, 0],
        [1, 0],
        ['a', 'b', 'c'],
      ]),
    ).toBeUndefined();
  });

  it('returns undefined when the third entry is missing', () => {
    expect(
      getSliderRange([
        [-1, 0],
        [1, 0],
      ]),
    ).toBeUndefined();
  });
});

describe('getSliderDefinitions', () => {
  const slider = (parents: PlotElement[1], attributes?: PlotElement[2]): PlotElement => [
    'slider',
    parents,
    attributes,
  ];

  it('ignores non-slider elements', () => {
    expect(getSliderDefinitions([['point', [0, 0], undefined]])).toEqual([]);
  });

  it('builds a definition from a valid slider', () => {
    const [definition] = getSliderDefinitions([slider([0, 1, 3], { name: 'a' })]);
    expect(definition).toEqual({ name: 'a', min: 0, start: 1, max: 3, step: 0.03 });
  });

  it('falls back to an indexed name when none is given', () => {
    const [first, second] = getSliderDefinitions([slider([0, 1, 3]), slider([0, 1, 3])]);
    expect(first?.name).toBe('slider1');
    expect(second?.name).toBe('slider2');
  });

  it('clamps the start value into [min, max]', () => {
    const [tooLow] = getSliderDefinitions([slider([0, -5, 3])]);
    expect(tooLow?.start).toBe(0);
    const [tooHigh] = getSliderDefinitions([slider([0, 50, 3])]);
    expect(tooHigh?.start).toBe(3);
  });

  it('uses snapWidth as the step when positive', () => {
    const [definition] = getSliderDefinitions([slider([0, 1, 3], { snapWidth: 0.5 })]);
    expect(definition?.step).toBe(0.5);
  });

  it('ignores a non-positive snapWidth', () => {
    const [definition] = getSliderDefinitions([slider([0, 1, 3], { snapWidth: -1 })]);
    expect(definition?.step).toBeCloseTo(0.03);
  });

  it('keeps index alignment by returning undefined for an invalid slider', () => {
    const [invalid, valid] = getSliderDefinitions([slider([3, 1, 0]), slider([0, 1, 3])]);
    expect(invalid).toBeUndefined();
    expect(valid).toBeDefined();
  });
});
