<!-- Copyright 2026 The Khronos Group Inc. -->
<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Informative validation fixtures

From this extension directory run `npm ci`, `npm test`, and `npm run validate`.
`node tools/generate-examples.mjs` regenerates all six self-contained fixtures.
The nonanimated fixtures include a visible quad; the animated fixture isolates
the shared graph interface and escaped JSON pointer.

Validation covers the repository's core glTF 2020-12 schemas, the extension's
draft-07 schemas, reference types, node and custom-definition cycles, material
channel bindings, texture resources, geometry streams, and animation targets.
The checkerboard and independent-channel tests evaluate elementary arithmetic
on the CPU. These tests are not GPU render tests or proof of full MaterialX
operator conformance. The semantic validator checks signatures only for the
listed elementary fixture operators; unknown library operators require the
normative MaterialX 1.39.0 library validation. It does not resolve all material
extension interactions, validate binary buffer contents, or execute custom
definitions or image sampling. IRI syntax is delegated to resource loading.
Other validators must also enforce the complete specification.

Core fallback materials are independently valid, with no dummy textures.
Checkerboard coordinates are an overridable graph interface; rendering a
spatial checkerboard requires supplying coordinates, while the default is a
constant valid fallback. The image fixture uses an explicit TEXCOORD_0 node.
