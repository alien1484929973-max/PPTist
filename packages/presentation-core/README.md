# @pptist/presentation-core

Framework-independent presentation primitives shared by the PPTist editor and
the future standalone player.

This package must not import Vue, Pinia, editor stores, or Vue components. It
currently provides:

- versioned presentation metadata and PPTX source identities;
- slide transition and animation timeline types;
- PPTX transition, Morph, element identity, and timing metadata parsing;
- PowerPoint `!!name` aware Morph element matching;
- framework-independent playback navigation and animation cursor;
- a compatibility adapter for the existing PPTist animation renderer.

The Vue application consumes this package through an adapter. Keeping this
boundary clean allows the same core to be used by a Web Component or another
frontend framework later.
