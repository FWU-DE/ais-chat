// Can be removed once jsxgraph > 1.14.0 ships this in its bundled typings.
declare module 'jsxgraph' {
  interface Board {
    // Missing from the bundled typings. Runs changes through the same lowercasing/merge
    // logic as the attributes passed to JXG.JSXGraph.initBoard, so e.g. `needShift` is
    // written to the `needshift` key the board's interaction handlers actually read.
    setAttribute(attributes: Partial<BoardAttributes>): Board;
  }
}
