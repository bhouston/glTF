<!-- Copyright 2026 The Khronos Group Inc. -->
<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Informative validation fixtures

From this extension directory run `npm ci`, `npm test`, and `npm run validate`.
`node tools/generate-examples.mjs` regenerates the six core fixtures;
`node tools/generate-material-example.mjs` regenerates the material-extension fixture.
The nonanimated fixtures include a visible quad; the animated fixture isolates
the shared graph interface and escaped JSON pointer.

Validation covers the repository's core glTF 2020-12 schemas, both extension
declaration schemas, reference types, node and custom-definition cycles,
material channel bindings, texture resources, reachable geometry streams in
each bound primitive context, uniform-source constraints, and animation targets.
The checkerboard and independent-channel tests evaluate elementary arithmetic
on the CPU. These tests are not GPU render tests or proof of full MaterialX
operator conformance. Standard signatures, literal defaults, and string modes
come from the checked-in registry generated from pinned MaterialX 1.39.0 XML.

The material-extension tests cover all 19 conditional binding points across the
ten referenced KHR extensions, owner declarations, output types and domains,
HDR specular color, homogeneous-medium uniforms, IOR compatibility mode, and
emission/attenuation arithmetic. Native extension equations and rendering still
require their own validators and runtime conformance checks.
Unknown or profile-excluded node categories and ambiguous overloads are rejected.
Numeric `enumvalues` UI metadata is not treated as a semantic closed range.
To regenerate the registry run `node tools/generate-library.mjs`; this downloads
only the two pinned official definition files and records their SHA-256 digests.
An optional directory argument supplies local copies instead. No network is
used by the validator or tests. Source attribution and exclusions are included
in the registry, with an Apache-2.0 license sidecar.

The validator does not resolve every material-extension interaction, validate
all binary buffer/codec contents, or numerically execute custom definitions or
image sampling. IRI syntax is delegated to resource loading. Standard geometry
and image nodes are conservatively varying; pure operations on uniform values
and graph-interface values are uniform. Custom implementations are expanded
with actual override contexts for these checks. Static stream-index evaluation
supports literals, interfaces, constants, elementary arithmetic, and custom
pass-throughs. An unresolved uniform stream index produces an explicit
`Unsupported validation:` diagnostic; this is a tool limitation, not proof
that the graph is normatively invalid. General runtime mode/range and finite
result checks require execution in addition to the checks provided here.
Other validators must also enforce the complete specification.

Examples declare required procedural support. Optional use follows standard
glTF extension rules and does not require duplicate textures or materials.
The checkerboard and image fixtures use explicit TEXCOORD_0 nodes; the
checkerboard multiplies UV by eight before calculating parity. The embedded
PNG is generated deterministically and tested for chunk CRCs and pixel data.
CLI parsing rejects duplicate properties, nonfinite numbers, comments, and
trailing commas; callers of `validate(object)` should use `parseAsset(text)`
when reading JSON so duplicate keys cannot be lost before validation.
