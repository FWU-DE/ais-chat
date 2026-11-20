// Note: inside `declare module 'jsxgraph'`, unqualified names (e.g. `Board`) do not resolve
// to the namespace's members, so type names must be qualified as `JXG.Board` etc. Getting this
// wrong silently degrades to `any` instead of erroring, because `skipLibCheck` is required for
// this project (the package's own `src/index.d.ts` has an unrelated pre-existing error).
declare module 'jsxgraph' {
  interface Board {
    // Can be removed once jsxgraph > 1.14.0 ships this in its bundled typings. Runs changes
    // through the same lowercasing/merge logic as the attributes passed to
    // JXG.JSXGraph.initBoard, so e.g. `needShift` is written to the `needshift` key the
    // board's interaction handlers actually read.
    setAttribute(attributes: Partial<JXG.BoardAttributes>): JXG.Board;
  }
  interface View3D {
    // Unlike `Board.create`, the bundled typings only overload `View3D.create` for literal
    // element type strings, so a runtime `type: string` never matches. This mirrors the
    // generic fallback overload `Board.create` already ships with.
    create(
      elementType: string,
      parents: unknown[],
      attributes?: Record<string, unknown>,
    ): JXG.GeometryElement | JXG.Composition | JXG.GeometryElement[];
    // Missing from the bundled typings: the view's rotation sliders.
    az_slide?: JXG.Slider;
    el_slide?: JXG.Slider;
    bank_slide?: JXG.Slider;
  }
}
