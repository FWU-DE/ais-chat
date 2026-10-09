import { describe, it, expect } from 'vitest';
import { parsePlotSpec, getSliderRange } from './plot-spec';

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
    expect(error.message).toMatch(/^Plot source is not valid JSON: /);
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
    {
      name: 'a slider where min >= max',
      source: '{"elements":[["slider",[3,1,0]]]}',
    },
    {
      name: 'a curve3d range given as a string instead of an array',
      source:
        '{"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]],' +
        '["curve3d",["cos(x)","sin(x)","0","[0,2*PI]"]]]}',
    },
    {
      name: 'a functiongraph3d bound given as a string instead of an array',
      source:
        '{"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]],' +
        '["functiongraph3d",["x^2+y^2","[-2,2]",[-2,2]]]]}',
    },
  ] as const)('rejects $name', ({ source }) => {
    expectInvalid(source);
  });

  it.each(['button', 'image', 'eval', 'remove', '$board', 'foo'])(
    'rejects a call to "%s" disguised as a math expression',
    (name) => {
      expectInvalid(`{"elements":[["functiongraph",["${name}(x)"]]]}`);
    },
  );

  it.each(['/* comment */remove(A)', 'remove/**/(A)', '// comment\nremove(A)'])(
    'rejects a blocked call hidden behind a JessieCode comment: %s',
    (unsafe) => {
      expectInvalid(`{"elements":[["functiongraph",[${JSON.stringify(unsafe)}]]]}`);
    },
  );

  it.each(['(remove) (A)', '(remove)\n(A)', '($board) (objects)'])(
    'rejects a blocked indirect call hidden behind whitespace: %s',
    (unsafe) => {
      expectInvalid(`{"elements":[["functiongraph",[${JSON.stringify(unsafe)}]]]}`);
    },
  );

  it('allows calls to permitted math functions', () => {
    const spec = expectValid('{"elements":[["functiongraph",["sin(x)+cos(x)"]]]}');
    expect(spec.elements).toHaveLength(1);
  });

  it('allows unsafe characters in text content', () => {
    const spec = expectValid('{"elements":[["text",[0,0,"a \\"quoted\\" word"]]]}');
    expect(spec.elements[0]?.[1][2]).toBe('a "quoted" word');
  });

  it('decodes HTML entities in the text payload', () => {
    const spec = expectValid('{"elements":[["text",[0,0,"caf&eacute;"]]]}');
    expect(spec.elements[0]?.[1][2]).toBe('café');
  });

  it('decodes HTML entities in the text3d payload', () => {
    const spec = expectValid(
      '{"board":{"boundingBox":[-5,5,5,-5]},"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]],["text3d",[0,0,0,"caf&eacute;"]]]}',
    );
    expect(spec.elements[1]?.[1][3]).toBe('café');
  });

  it('decodes HTML entities in attribute values', () => {
    const spec = expectValid(
      '{"elements":[["point",[0,0],{"name":"caf&eacute;","label":{"strokeColor":"caf&eacute;"}}]]}',
    );
    expect(spec.elements[0]?.[2]).toEqual({ name: 'café', label: { strokeColor: 'café' } });
  });

  it.each(['display', 'parse', 'usemathjax', 'usekatex', 'url', 'constructor', 'Prototype', 'id'])(
    'rejects the forbidden attribute "%s" at any nesting depth',
    (key) => {
      expectInvalid(`{"elements":[["point",[0,0],{"label":{"${key}":"html","name":"a"}}]]}`);
    },
  );

  it('never lets "__proto__" become an own key or pollute the prototype', () => {
    // Not in FORBIDDEN_ATTRIBUTES: zod's own object construction already drops `__proto__`
    // rather than letting it become an own key or pollute the prototype, so there's nothing
    // for an explicit check to catch here.
    const spec = expectValid('{"elements":[["point",[0,0],{"__proto__":{"polluted":true}}]]}');
    expect(spec.elements[0]?.[2]).toEqual({});
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('does not decode HTML entities in non-text-payload parents', () => {
    // No trailing `;`, so the unsafe-character check alone wouldn't catch this: decoding this
    // coordinate expression would turn it into "remove(A)", invoking JessieCode's `remove`.
    const spec = expectValid('{"elements":[["text",["remove&#40A&#41",0,"label"]]]}');
    expect(spec.elements[0]?.[1][0]).toBe('remove&#40A&#41');
  });

  it('allows unsafe characters in text3d content', () => {
    expectValid(
      '{"board":{"boundingBox":[-5,5,5,-5]},"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]],["text3d",[0,0,0,"a;b"]]]}',
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

  it('accepts a curve3d with a proper two-element range', () => {
    expectValid(
      '{"board":{"boundingBox":[-5,5,5,-5]},"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]],' +
        '["curve3d",["cos(x)","sin(x)","0",[0,"2*PI"]]]]}',
    );
  });

  it('rejects a 3D element without a view3d element', () => {
    const error = expectInvalid(
      '{"board":{"boundingBox":[-5,5,5,-5]},"elements":[["point3d",[0,0,0]]]}',
    );
    expect(error.message).toMatch(/view3d/);
  });

  it('rejects a 3D element without board.boundingBox', () => {
    const error = expectInvalid(
      '{"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]],["point3d",[0,0,0]]]}',
    );
    expect(error.message).toMatch(/boundingBox/);
  });

  it('accepts a 3D spec with view3d and a bounding box', () => {
    const spec = expectValid(
      '{"board":{"boundingBox":[-5,5,5,-5]},"elements":[["view3d",[[-4,-3],[8,8],[[-5,5],[-5,5],[-5,5]]]],["point3d",[0,0,0]]]}',
    );
    expect(spec.elements).toHaveLength(2);
  });

  it('does not require a view3d element or bounding box for a 2D spec', () => {
    const spec = expectValid('{"elements":[["point",[0,0]]]}');
    expect(spec.board.boundingBox).toBeUndefined();
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
