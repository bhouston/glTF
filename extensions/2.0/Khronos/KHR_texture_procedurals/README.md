<!-- Copyright 2026 The Khronos Group Inc. SPDX-License-Identifier: CC-BY-4.0 -->

# KHR_texture_procedurals

## Contributors

- Ashwin Bhat, Autodesk
- Alexey Knyazev, Individual Contributor
- Bernard Kwok, Individual Contributor
- Ed Mackey, AGI
- Lutz Kettner, NVIDIA
- Richard Sahlin, IKEA
- Timothy Blut, NVIDIA
- Ben Houston, Individual Contributor

## Status

Draft. This revision proposes material-channel bindings and intentionally changes the wire format of the earlier draft in [PR #2381](https://github.com/KhronosGroup/glTF/pull/2381). It is not a ratified extension. See [revision decisions and remaining adoption work](#revision-decisions-and-remaining-adoption-work).

## Dependencies and scope

Written against glTF 2.0. The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in the glTF specification.

This extension represents directed acyclic graphs that compute inputs to glTF's metallic-roughness material model. It is a **material-channel graph**, with access to geometric streams and sampled resources, rather than a replacement for the `images` array. Graph outputs are values, not necessarily stored images. An implementation MAY compile the graph into its material shader, evaluate it at runtime, or bake it when that preserves the graph's specified behavior, including geometric dependencies and animation.

This extension does not replace the glTF BRDF. It does not carry BSDFs, EDFs, closures, surface shaders, displacement shaders, renderer-specific shader source, or arbitrary executable code. Core material inputs and the base color/opacity inputs of `KHR_materials_unlit` are covered. Graph binding to inputs introduced by other material extensions requires a separate specification; those extensions retain their ordinary behavior for unbound inputs. The final-emissive rule below explicitly handles the interaction with `KHR_materials_emissive_strength` without adding a separate binding for its strength input.

The graph structure is independent of a particular library. This revision defines one interoperable library profile, [EXT_texture_procedurals_mx_1_39](../../Vendor/EXT_texture_procedurals_mx_1_39/README.md). Assets using this revision **MUST** declare that profile. Future profiles require a separate extension defining their semantics; they are not implied by arbitrary node names. MaterialX compatibility is a design requirement, with a deliberately restricted subset of MaterialX and explicit glTF resource and channel mappings.

## Declaration

An asset using procedural graphs **MUST** list both `KHR_texture_procedurals` and `EXT_texture_procedurals_mx_1_39` in `extensionsUsed`. Graph payload belongs only to the root `extensions.KHR_texture_procedurals` object. The companion library identifier has no payload, either at the root or on any child object. Exactly one library profile applies to the entire asset.

```json
{
  "asset": { "version": "2.0" },
  "extensionsUsed": ["KHR_texture_procedurals", "EXT_texture_procedurals_mx_1_39"],
  "materials": [{
    "pbrMetallicRoughness": { "roughnessFactor": 0.8 },
    "extensions": {
      "KHR_texture_procedurals": {
        "bindings": { "roughness": { "index": 0, "output": "roughness" } }
      }
    }
  }],
  "extensions": {
    "KHR_texture_procedurals": {
      "procedurals": [{
        "nodetype": "nodegraph",
        "type": "float",
        "inputs": { "amount": { "nodetype": "input", "type": "float", "value": [0.25] } },
        "nodes": [],
        "outputs": { "roughness": { "nodetype": "output", "type": "float", "input": "amount" } }
      }]
    }
  }
}
```

For extension-aware rendering this material's roughness is `0.25`, not `0.25 * 0.8`. An extension-unaware client renders the standard fallback roughness `0.8`.

When an author requires procedural rendering, both identifiers **MUST** also appear in `extensionsRequired`. Requiring just one is invalid. A client unable to implement either required extension **MUST** reject the asset as specified by glTF. If procedural support is optional, a client unable to evaluate any reachable bound graph **MUST** use the complete standard fallback for that material, rather than mixing successful procedural channels with fallback channels. Different materials MAY independently fall back. Unsupported reachable resources or operators trigger the same policy. Structural and semantic invalidity remains invalidity, not an alternative valid encoding.

Standard material factors and textures are the fallback. Textures are optional; a material using only factors is valid. When present, fallback textures **MUST** satisfy core glTF requirements, including valid `textureInfo.index` references. A dummy bitmap is neither required nor an appearance-equivalent fallback. Authors **SHOULD** provide an appropriate baked or constant fallback when this extension is optional. A fallback cannot represent every animated or geometry-dependent procedural exactly.

## Material-channel binding

Bindings are declared on `materials[i].extensions.KHR_texture_procedurals.bindings`. Each property in this nonempty object names one channel. Its value contains a nonnegative `index` into the root `procedurals` array and an `output` naming a graph output. `output` is always required, including single-output graphs. A graph MAY drive several channels and several materials. A material MAY use several graphs. There is no restriction to one graph per material.

| Binding | Required output type | Value supplied to the material |
| --- | --- | --- |
| `baseColor` | `color3` | Linear Rec.709 RGB, clamped to [0, 1] |
| `opacity` | `float` | Alpha coverage, clamped to [0, 1] |
| `metallic` | `float` | Metalness, clamped to [0, 1] |
| `roughness` | `float` | Perceptual roughness, clamped to [0, 1] |
| `normal` | `vector3` | Nonzero signed world-space shading normal, normalized before use |
| `occlusion` | `float` | Final indirect-light occlusion multiplier, clamped to [0, 1] |
| `emissive` | `color3` | Linear Rec.709 emitted radiance, each component clamped to at least zero |

A binding replaces the complete conventional calculation of that channel. The implementation **MUST NOT** additionally multiply a bound channel by its core factor, sample its fallback texture, or apply a fallback texture transform. In particular:

- Bound `baseColor` replaces RGB from `baseColorFactor`, `baseColorTexture`, and the automatic `COLOR_0` RGB multiplier. Bound `opacity` separately replaces alpha from those sources and the automatic vertex alpha multiplier. To include vertex colors, authors explicitly use a geometric color node in the graph. When only one of RGB/alpha is bound, the other retains its standard calculation.
- Bound `metallic` and `roughness` independently replace their factors and their respective texture samples. They are **independent scalar outputs**. Graphs **MUST NOT** be required to pack them into a tuple or image. An implementation MAY pack intermediate values as an internal optimization without changing semantics.
- Bound `normal` is already a signed world-space shading normal, not an RGB-encoded bitmap value. `normalTexture.scale` is not applied. The material's ordinary double-sided back-face normal reversal is applied after graph evaluation. A zero-length result is an evaluation error and triggers the required/optional policy. Authors converting a tangent-space bitmap normal must decode it and transform through an explicit tangent frame in the graph, or use the profile's MaterialX `normalmap` node, whose output is world-space. Core glTF normal handling remains unchanged when this channel is unbound.
- Bound `occlusion` already incorporates any desired strength; `occlusionTexture.strength` is not applied.
- Bound `emissive` replaces `emissiveFactor` and `emissiveTexture`. If `KHR_materials_emissive_strength` is present, its strength is also included in the graph's final radiance and **MUST NOT** be applied again to that bound channel.

For unbound channels, all ordinary glTF calculations continue to apply. `alphaMode`, `alphaCutoff`, and `doubleSided` remain material properties and are not graph inputs. This version does not bind the discrete choice of a material model. On an unlit material, only `baseColor` and `opacity` bindings are valid. Unknown channel names are invalid, rather than ignored aliases.

The core [`metallicRoughnessTexture`](../../../../specification/2.0/Specification.adoc#materials) uses G for roughness and B for metallic. That storage rule still applies to ordinary and fallback textures. It does not constrain this extension's scalar graph outputs. Imported MaterialX graphs can connect metallic and roughness separately without inserting a combine node. If the graph itself samples an ORM bitmap, explicit extract/swizzle nodes select the desired channels.

There are **no** procedural payloads on `textureInfo`, `textures`, or `images` in this revision. This removes the previous draft's dependence on an artificial texture-info entry for every procedural channel.

## Types and values

Ports are typed. Connected ports **MUST** have exactly matching types; conversion requires an explicit library node. `multioutput` is a graph/node result marker, not a port type. Numerical values **MUST** be finite. No NaN or infinity encoding is permitted.

| Type | JSON value representation |
| --- | --- |
| `boolean` | JSON boolean |
| `integer` | One-element array of integers |
| `float` | One-element array of numbers |
| `integer2`, `integer3`, `integer4` | Arrays of 2, 3, or 4 integers |
| `vector2`, `vector3`, `vector4` | Arrays of 2, 3, or 4 numbers |
| `color3`, `color4` | Arrays of 3 or 4 linear Rec.709 components; alpha is linear |
| `matrix3x3`, `matrix4x4` | Arrays of 9 or 16 numbers in row-major order |
| `string` | JSON string, such as a mode or channel selector |
| `filename` | A `texture` index resource source; no URI string on an instance |

Converters **MUST** preserve matrix mathematical values when converting between this row-major representation, MaterialX matrix types, and host-language matrices. The profile maps `matrix3x3`/`matrix4x4` to MaterialX `matrix33`/`matrix44`. Integer vector types are available to future profiles or custom functional definitions; their existence here does not introduce unsupported atomic overloads into MaterialX 1.39.

Legacy arrays of named port objects, scalar JSON numbers, integer port selectors, and the earlier matrix type spellings are not valid encodings of this revision. Input and output sets are JSON objects keyed by nonempty, case-sensitive port names. Duplicate JSON keys are invalid; parsers **MUST NOT** use last-key-wins behavior to accept them. Numeric indices are zero-based and refer to the relevant array, not a port map.

## Graph structure and connections

The root extension contains a nonempty `procedurals` array and MAY contain `procedural_definitions`. Each procedural contains:

- `nodetype`: exactly `nodegraph`.
- `type`: the type of its only output, or `multioutput` when there is more than one output.
- `inputs`: an optional map of graph-interface inputs; omission means an empty map.
- `outputs`: a nonempty map of graph outputs.
- `nodes`: an array of atomic processing nodes, which MAY be empty for an interface pass-through.
- Optional `name` and descriptive metadata.

Each root graph-interface input has `nodetype: "input"`, a port `type`, and exactly one of a typed `value` or, for `filename`, a `texture` index. An interface input cannot connect to an internal node or another interface input. Each processing node has a library `nodetype`, a result `type`, an optional input map, and a nonempty output map. All output names and types of the selected node definition **MUST** be declared; they cannot be renamed. Missing ordinary input overrides use library definition defaults. A required input without a default **MUST** be supplied. Implicit geometric defaults **MUST** be expanded into explicit geometric nodes and connections before export.

Every node input has `nodetype: "input"`, a type, and exactly one source. The selected library definition's `uniform` constraints **MUST** be preserved: a uniform port cannot be driven by a value that varies over a primitive's surface. Root interface values are uniform (including animated values at a given time); constants and operations on uniform inputs remain uniform. Geometric streams and spatial image/noise evaluations are varying. Implementations **MUST** validate uniform requirements through graph and custom-definition connections, including mode and stream-index inputs, rather than infer uniformity from a matching type alone.

| Source properties | Meaning |
| --- | --- |
| `value` | Typed literal |
| `texture` | glTF texture resource index; allowed only for `filename` |
| `input` | Name of an input on the enclosing graph interface |
| `node` and `output` | Index of an upstream node in this graph, and name of its output |

Node output descriptors contain `nodetype: "output"` and a port type. Graph outputs additionally contain exactly one source: `node` plus `output`, or `input` for pass-through. Named selectors are required even for a single upstream output. References outside the enclosing graph's node array are invalid. Node ordering need not be topological; implementations **MUST** resolve forward references and **MUST** reject cycles. Self-links are cycles. Graphs cannot contain nested graphs; authoring tools flatten them while preserving interfaces, names, dependencies, and semantics.

```json
{
  "name": "IndependentChannels",
  "nodetype": "nodegraph",
  "type": "multioutput",
  "inputs": {
    "metalness": { "nodetype": "input", "type": "float", "value": [0.1] },
    "perceptualRoughness": { "nodetype": "input", "type": "float", "value": [0.7] }
  },
  "nodes": [],
  "outputs": {
    "metallic": { "nodetype": "output", "type": "float", "input": "metalness" },
    "roughness": { "nodetype": "output", "type": "float", "input": "perceptualRoughness" }
  }
}
```

Unknown structural properties are invalid. `extras` and `extensions` retain their normal glTF meanings; unrecognized optional extensions do not modify graph evaluation. Port, node, graph, and definition names are case-sensitive. Graph/node `name` is an optional human-readable label, not a connection key. Supported descriptive metadata includes `uiname`, `doc`, `xpos`, `ypos` and input UI hints `uimin`, `uimax`, `uisoftmin`, `uisoftmax`, `uistep`, `uifolder`, and `unittype` as allowed by the schemas. UI hints never clamp or alter evaluation values. `unittype` describes the already-converted quantity; no `unit` conversion is requested. Numeric distance values are metres and angular values follow the selected MaterialX node definition. Numeric colors are linear Rec.709. `colorspace`, `target`, custom `enum` metadata, `defaultgeomprop`, node disabling, `defaultvalue`, and `defaultinput` are not supported in this encoding. Standard library string mode values remain valid; forbidding custom enum metadata does not forbid those values.

## Resource and geometry binding

A filename port's `texture` source indexes glTF's `textures` array. The selected texture resolves its source image through ordinary glTF image and codec extension rules, including external `uri`, data URI, and `bufferView` resources. The texture/image indices **MUST** be valid and all required image extensions **MUST** be supported. MaterialX importers map filename references to glTF resources; exporters reconstruct a filename or resolver handle from those resources. Arbitrary filename strings or external node-definition libraries are not loaded by this extension.

Image nodes own sampling behavior through their MaterialX inputs/defaults. For procedural evaluation the implementation **MUST NOT** apply a fallback texture-info's `texCoord`, `KHR_texture_transform`, or a referenced glTF texture's `sampler`. Default filters and address modes are those of the selected MaterialX definition; explicit image/place2d/geometry nodes supply overrides. Profile image coordinates follow glTF: (0, 0) addresses the top-left of an image. MaterialX import/export converters **MUST** compensate for differing authoring image-coordinate conventions at the conversion boundary, preserving appearance rather than assuming identical UV orientation. Fallback rendering continues to apply ordinary glTF sampling rules. Implementations can share decoded image data but must preserve per-node sampling behavior. Image sequences are not supported: `framerange` **MUST** be empty, and frame offset/end-action inputs cannot select resources outside the bound glTF image.

For `image`/equivalent resource nodes returning `color3` or `color4`, image RGB is treated as sRGB and decoded to linear Rec.709 before graph arithmetic; alpha remains linear. For scalar/vector image outputs, the resource is linear data without sRGB decoding. Graph authors **MUST** select the overload that matches the resource's role. Reusing one image as color and data requires distinct evaluations with the appropriate interpretation. This restriction is the glTF interoperability profile, rather than support for arbitrary MaterialX color spaces. Color-transform nodes that require another color space are outside this profile.

Geometry nodes with a numbered stream index bind to the corresponding glTF attribute: `texcoord` index n to `TEXCOORD_n`, and `geomcolor` index n to `COLOR_n`. Indices **MUST** be nonnegative uniform integers and need not be sequential. Only the `texcoord` vector2 overload is supported; VEC3 texture-coordinate streams are not introduced here. `geomcolor` color3/color4/vector3/vector4 overloads select the corresponding RGB or RGBA values; the scalar overload is excluded. COLOR_0/COLOR_n RGB is linear and absent alpha means one. A requested missing stream is a semantic error on every affected primitive.

Geometry nodes read the interpolated geometry after morphing and skinning, before procedural shading-normal perturbation. In particular the geometric `normal` node does not read this material's bound procedural normal, avoiding an implicit evaluation cycle. `position`, `normal`, `tangent`, and `bitangent` support only `object` and `world` spaces; position units are metres. World-space inputs include the current instance transform. Normals use inverse-transpose transformation and normalization. Tangents and bitangents use glTF's tangent handedness. `tangent`/`bitangent` index **MUST** be zero because glTF defines only one TANGENT stream. When a tangent-frame node or `normalmap` needs a frame and no TANGENT stream is present, the implementation **MUST** generate the frame with MikkTSpace using TEXCOORD_0, or diagnose unsupported evaluation and apply the required/optional policy. Missing TEXCOORD_0 in that case is invalid; converters may instead provide an explicit TANGENT stream. Implementations **MUST** evaluate shared graphs in the current primitive/instance context rather than cache geometry-dependent results globally.

Name-based arbitrary geometric properties are outside the profile. The MaterialX companion specifies permitted geometry nodes and supported coordinate spaces.

## Custom functional definitions

`procedural_definitions` is one array containing definition (`nodetype: "nodedef"`) entries and functional implementation (`nodetype: "nodegraph"`) entries. A definition contains `node`, optional `name`, optional `version` and `defaultVersion` (default false), optional `nodegroup`, an input-default map, and a nonempty output-description map. Every definition input **MUST** have a typed default value. An empty string is allowed as a filename default only on a definition; every reachable instance **MUST** override such a default with a texture resource. This permits conversion of MaterialX filename interfaces without permitting unresolved files at runtime.

Each definition **MUST** have exactly one functional implementation in this array. That implementation has a `nodedef` index pointing to its definition, `type`, `nodes`, and `outputs`, but **MUST NOT** declare an `inputs` map. References using `input` inside it resolve against the attached definition's input names. Implementation output names and types **MUST** exactly match the definition. `type` follows the same single/multiple-output rule as ordinary graphs.

A custom instance carries a `nodedef` index and a `nodetype` equal to the definition's `node`. Its input overrides and output descriptors match that exact definition. Indices select definitions unambiguously even when versions share a node category; `defaultVersion` is preserved authoring metadata and does not override an explicit index. Multiple defaults for the same custom category are invalid. Custom definitions **MUST NOT** override a standard profile node category. Implementations can call other custom definitions, but their dependency graph **MUST** be acyclic. A graph being flat does not excuse recursion between definitions.

Definition data is immutable and not an animation target. Functional implementations contain only profile nodes or other valid functional definitions, not embedded source or backend deployment targets. External definition references, code implementations, output defaults, disabled-node pass-through rules, and implicit geometric defaults are prohibited. Importers expand the latter explicitly or diagnose unsupported content. The MaterialX profile's atomic definitions remain authoritative for standard node defaults and overload selection.

## Animation and asset object model

Graph-interface inputs of the root `procedurals` array can be animated using [KHR_animation_pointer](../KHR_animation_pointer/README.md). Only a present literal numeric `value` of type `float`, `vector2/3/4`, or `color3/4` is mutable in this version. Node-internal inputs, definition data, graph topology, resource indices, integer/boolean/string/filename values, matrices, and individual components of values **MUST NOT** be animation targets.

| Property pattern | Asset Object Model type | Output accessor type | Mutable |
| --- | --- | --- | --- |
| `/extensions/KHR_texture_procedurals/procedurals/{i}/inputs/{name}/value`, type `float` | `float[]` of fixed length 1 | SCALAR, one value per sample | Yes |
| Same path, type `vector2` | `float2` | VEC2 | Yes |
| Same path, type `vector3` or `color3` | `float3` | VEC3 | Yes |
| Same path, type `vector4` or `color4` | `float4` | VEC4 | Yes |

The path **MUST** resolve to the entire `value` array of an existing eligible interface input. Port names are escaped according to RFC 6901 (`~` becomes `~0`, `/` becomes `~1`). `KHR_animation_pointer` accessor component types, sample counts, interpolation, and duplicate-target restrictions apply unchanged. Scalar-array length is fixed at one, including for CUBICSPLINE samples. Animating a shared graph updates all materials using that graph.

```json
{
  "path": "pointer",
  "extensions": {
    "KHR_animation_pointer": {
      "pointer": "/extensions/KHR_texture_procedurals/procedurals/0/inputs/amount/value"
    }
  }
}
```

This fragment is an animation channel's `target`; a complete asset with accessors is included in [the examples](examples/). Assets containing these targets **MUST** declare `KHR_animation_pointer` in `extensionsUsed`, and **MUST** require it when the animation is essential. If a required procedural animation cannot be supported the client rejects the asset. If optional animation is unsupported, the initialized interface value remains in use, according to the ordinary extension-required rules.

## Schemas, examples, and validation

Schemas in [schema/](schema/) describe root payloads, material bindings, typed ports and functional definitions. [glTF.KHR_texture_procedurals.schema.json](schema/glTF.KHR_texture_procedurals.schema.json) validates the root payload and [material.KHR_texture_procedurals.schema.json](schema/material.KHR_texture_procedurals.schema.json) validates a material payload. The [whole-document overlay](schema/material.KHR_texture_procedurals_schema.json) additionally enforces extension declaration requirements. Validate core glTF structure with the core schemas as well; extension schemas do not substitute for core validation. The companion declaration schema is applied to the document, not to a nonexistent companion payload.

Schema validation alone cannot verify array index bounds, DAG acyclicity, custom-definition recursion, resolved port types, node-library overloads/defaults, primitive attributes, runtime value ranges, sampling behavior, or rendered equivalence. A conformant implementation **MUST** validate these semantic requirements as well. Runtime results must be finite; invalid results are evaluation errors subject to the declared required/fallback policy. Geometry/resource checks are performed in every bound primitive context. Unsupported valid operators are distinct from invalid signatures.

Runnable examples and Node-based structural/semantic checks are provided in this directory. See [the validation guide](tests/README.md) for commands and the scope of the reference evaluator. Examples include separate metallic/roughness outputs, checkerboard math, shared outputs, custom definitions, image resources, and animated interface values. Reference numeric results exercise selected elementary operators; they are not evidence of full MaterialX or GPU rendering conformance.

## Revision decisions and remaining adoption work

This revision resolves the local design choices as follows:

1. Graphs bind directly to named material channels. Earlier procedural texture-info bindings are replaced, not retained as a second competing format.
2. Graph results are final channel values. Conventional factors, fallback textures, and automatic vertex-color multipliers for those channels are not applied again. This prevents accidental double application; desired multipliers belong in the graph.
3. Metallic and roughness are independent scalar outputs. Packing is only an implementation optimization or a standard fallback bitmap representation.
4. The initial library is a pinned MaterialX 1.39.0 subset; custom definitions are functional graphs. Closure/shader nodes and deployment-specific code are excluded.
5. Named port maps, required named output selectors, typed numeric arrays, resource-index filename binding, explicit geometry, and strict DAG/type rules replace the inconsistent earlier examples/schemas.
6. Color inputs use a fixed glTF-compatible interpretation; units and defaults are explicit. Normal results are world-space, matching the MaterialX normal-map operation. Root-interface float/vector/color animation is defined; other types remain immutable in this version.
7. Optional unsupported graphs fall back atomically per material. Fallbacks can be ordinary factors without synthetic textures.

These are proposed decisions for review, not a statement of working-group consensus. The wire-format migration and final-value channel semantics require exporter/runtime updates. Old diagrams in `figures/` are historical illustrations from the original proposal and are not normative for this revised binding format. The schemas and examples in this revision describe the current format.

Before ratification, the working group still needs to approve this scope/profile, review the normative channel/resource/default/animation rules, provide independent runtime implementations and operator/rendering reference results, and complete its extension/adopter process. Contributor CLA requirements also remain external to this patch. A documentation/schema PR cannot itself establish Khronos ratification, performance, renderer interoperability, or GPU conformance.

## Normative references

- [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [KHR_animation_pointer](../KHR_animation_pointer/README.md), when animation is used.
- [EXT_texture_procedurals_mx_1_39](../../Vendor/EXT_texture_procedurals_mx_1_39/README.md), for the node-library profile.
- [RFC 6901: JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901)


## Appendix: Full Khronos Copyright Statement

Copyright 2024 The Khronos Group Inc.

This Specification is protected by copyright laws and contains material proprietary to Khronos. Except as described by these terms, it or any components may not be reproduced, republished, distributed, transmitted, displayed, broadcast or otherwise exploited in any manner without the express prior written permission of Khronos.

Khronos grants a conditional copyright license to use and reproduce the unmodified Specification for any purpose, without fee or royalty, EXCEPT no licenses to any patent, trademark or other intellectual property rights are granted under these terms.

Khronos makes no, and expressly disclaims any, representations or warranties, express or implied, regarding this Specification, including, without limitation: merchantability, fitness for a particular purpose, non-infringement of any
intellectual property, correctness, accuracy, completeness, timeliness, and reliability. Under no circumstances will Khronos, or any of its Promoters, Contributors or Members, or their respective partners, officers, directors, employees, agents or representatives be liable for any damages, whether direct, indirect, special or consequential damages for lost revenues, lost profits, or otherwise, arising from or in connection with these materials.

This specification has been created under the Khronos Intellectual Property Rights Policy, which is Attachment A of the Khronos Group Membership Agreement available at https://www.khronos.org/files/member_agreement.pdf. Khronos grants a conditional copyright license to use and reproduce the unmodified specification for any purpose, without fee or royalty, EXCEPT no licenses to any patent, trademark or other intellectual property rights are granted under these terms. Parties desiring to implement the specification and make use of Khronos trademarks in relation to that implementation, and receive reciprocal patent license protection under the Khronos IP Policy must become Adopters and confirm the implementation as conformant under
the process defined by Khronos for this specification; see https://www.khronos.org/conformance/adopters/file-format-adopter-program.

Where this Specification identifies specific sections of external references, only those specifically identified sections define normative functionality. The Khronos Intellectual Property Rights Policy excludes external references to materials and associated enabling technology not created by Khronos from the Scope of this Specification, and any licenses that may be required to implement such referenced materials and associated technologies must be obtained separately and may involve royalty payments.

Khronos® is a registered trademark, and glTF™ is a trademark of The Khronos Group Inc. All other product names, trademarks, and/or company names are used solely for identification and belong to their respective owners.
