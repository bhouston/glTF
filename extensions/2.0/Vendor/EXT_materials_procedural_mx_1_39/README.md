<!--
Copyright 2024-2026 The Khronos Group Inc.
SPDX-License-Identifier: LicenseRef-KhronosSpecCopyright
-->

# EXT_materials_procedural_mx_1_39

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

Draft

## Dependencies

Written against glTF 2.0 and `KHR_materials_procedural`. Normative node definitions and semantics are pinned to [MaterialX v1.39.0](https://github.com/AcademySoftwareFoundation/MaterialX/tree/v1.39.0), commit `f679db7875a928fd0162cd38bdc7461b2aa81c0f`. A later patch release MUST NOT silently change the semantics of this profile. A future incompatible profile requires a new extension identifier.

## Overview

This extension selects the MaterialX 1.39 node-library profile for [KHR_materials_procedural](../../Khronos/KHR_materials_procedural/README.md) graphs. Pattern and data-processing nodes supply inputs to the glTF material model.

## Declaration

Both `KHR_materials_procedural` and `EXT_materials_procedural_mx_1_39` MUST be listed in `extensionsUsed`. The library applies to every procedural graph and custom functional definition in the asset. More than one `EXT_materials_procedural_mx_*` identifier is invalid, including in `extensionsRequired`. If either identifier is required, both MUST be required. Other library profiles cannot be combined with this one.

```json
{
  "asset": { "version": "2.0" },
  "extensionsUsed": ["KHR_materials_procedural", "EXT_materials_procedural_mx_1_39"],
  "extensionsRequired": ["KHR_materials_procedural", "EXT_materials_procedural_mx_1_39"],
  "materials": [{
    "extensions": {
      "KHR_materials_procedural": {
        "bindings": {
          "metallic": { "index": 0, "output": "metallic" },
          "roughness": { "index": 0, "output": "roughness" }
        }
      }
    }
  }],
  "extensions": {
    "KHR_materials_procedural": {
      "procedurals": [{
        "nodetype": "nodegraph",
        "type": "multioutput",
        "inputs": {
          "metalness": { "nodetype": "input", "type": "float", "value": [0.2] },
          "roughness": { "nodetype": "input", "type": "float", "value": [0.6] }
        },
        "nodes": [],
        "outputs": {
          "metallic": { "nodetype": "output", "type": "float", "input": "metalness" },
          "roughness": { "nodetype": "output", "type": "float", "input": "roughness" }
        }
      }]
    }
  }
}
```

The companion has **no extension payload**. All graph data belongs to the root base extension and all channel bindings belong to the material base extension. This version is not selected per node or per material.

## Node-library profile

The normative definition sources are the node definitions and functional implementations under MaterialX v1.39.0 [`libraries/stdlib`](https://github.com/AcademySoftwareFoundation/MaterialX/tree/v1.39.0/libraries/stdlib) and [`libraries/pbrlib`](https://github.com/AcademySoftwareFoundation/MaterialX/tree/v1.39.0/libraries/pbrlib), subject to the following restrictions. Renderer code implementations are not carried in a glTF asset; runtime libraries implement the specified operations.

An atomic definition is in this profile only if all its input/output types can be represented by the base extension and all of these restrictions are satisfied:

- No `BSDF`, `EDF`, `VDF`, `surfaceshader`, `volumeshader`, `displacementshader`, `lightshader`, `material`, closure, array, or other unsupported port types. A conversion or helper node that requires such a port is also excluded. The `gltf_pbr` surface node is not an atomic graph node; its inputs are mapped to the existing glTF material as described below.
- No target-specific behavior, external source execution, animation/time nodes, application-specific user data, or external filename/node-definition libraries. Texture filenames are resolved only through the base extension's glTF resource-index binding.
- Geometry access is limited to `texcoord`, `geomcolor`, `position`, `normal`, `tangent`, and `bitangent`. Arbitrary named `geompropvalue`, custom attribute names, and renderer/camera/light properties are excluded. Only texcoord vector2 and geomcolor color3/color4 overloads are included. Texture coordinate and color nodes select numbered glTF streams. Tangent/bitangent index is zero. Geometry `space` and transformpoint/transformvector/transformnormal `fromspace`/`tospace` selections are restricted to `object` and `world`; unsupported spaces are invalid. Normals transform by inverse transpose and tangent handedness follows glTF. The base extension defines deformation, interpolation, and missing-tangent-frame behavior.
- No alternate color-space requirement. Constants and computed colors are linear Rec.709; image color/data interpretation is the base extension's fixed glTF profile. Definitions requiring other color transforms are excluded.
- Geometric defaults such as `defaultgeomprop` must be expanded into explicit geometry node connections. Supported ordinary literal defaults and standard string mode/enum values retain MaterialX semantics. Uniform inputs MUST remain uniform through connections; string mode and stream-index inputs cannot be driven by surface-varying data. Image sequences are excluded (`framerange` MUST be empty). Custom enumeration declarations, target metadata, node disabling and output pass-through defaults are not transferred.

Definitions using supported types retain their MaterialX operation, port names, literal defaults, overloads, and functional logic. Unsupported nodes are handled according to the base extension's required-extension rules.

Overload selection uses `nodetype`, declared input types, and the complete declared output name/type set. There MUST be exactly one matching definition after applying the restrictions. Required port values and supported default values come from that definition. Standard node `version` resolution uses the default definition of the pinned release; assets cannot select an arbitrary later node version. If selection is ambiguous or a declared input/output is not in the selected definition, the graph is invalid. Custom definitions are selected explicitly by the base extension's `nodedef` index and MUST NOT shadow a standard node category.

## MaterialX conversion

Converters translate between the base extension's JSON encoding and MaterialX's typed port representation. Port maps remain named maps; node-array references become unique MaterialX node names. Converters MUST preserve graph interface values and links, explicit outputs, matrix values, node defaults, custom functional definitions and selected resources. Labels are not unique identifiers; a converter generates stable unique identifiers without changing public interface names. Image-coordinate orientation is adjusted at the boundary as required by the base extension's top-left convention. MaterialX `normalmap` returns a world-space normal and can bind directly to the world-space `normal` channel; an authoring graph returning a tangent-space normal needs an explicit frame transformation instead.

| glTF graph type | MaterialX type |
| --- | --- |
| `matrix3x3` | `matrix33` |
| `matrix4x4` | `matrix44` |
| `boolean`, `integer`, `float`, `vector2/3/4`, `color3/4`, `string`, `filename` | Same named MaterialX type |
| `integer2/3/4` | Not standard MaterialX 1.39 atomic types; custom functional data only |

Nested authoring graphs must be flattened. Renderer source/closure nodes cannot be transferred merely by preserving opaque metadata. Converters MUST diagnose unsupported content instead of claiming a lossless conversion. Resource filename strings become glTF texture indices, and implicit geometric bindings become explicit nodes.

### glTF PBR inputs

An authoring MaterialX `gltf_pbr` surface is a conversion endpoint, not a replacement BRDF serialized in the asset. Convert its supported input graphs into the base extension's named channels. The resulting glTF material retains its standard metallic-roughness shading model or `KHR_materials_unlit` shading model, as appropriate. The base extension supplies the channel value, color, alpha, normal and factor rules.

MaterialX surface-model translations that can be expressed as valid pattern graphs into the supported glTF channels MAY be converted. Importing an arbitrary MaterialX surface shader unchanged, custom BRDF parameters, displacement, or extension-defined material inputs is outside this profile. Conversion to glTF may therefore be an explicitly documented approximation of a source surface model, distinct from exact preservation of the transferred pattern graphs.

## Validation and examples

The [document declaration schema](schema/material.EXT_materials_procedural_mx_1_39_schema.json) validates the required paired identifiers; it is not a schema for a companion payload or proof of node execution semantics. Use the base extension schemas, core glTF schemas and semantic checks as well.

Examples and validation tools are shared with the base extension: [examples](../../Khronos/KHR_materials_procedural/examples/) and [validation guide](../../Khronos/KHR_materials_procedural/tests/README.md). 

## References

- [MaterialX v1.39.0 specification](https://github.com/AcademySoftwareFoundation/MaterialX/tree/v1.39.0/documents/Specification)
- [MaterialX v1.39.0 standard definitions](https://github.com/AcademySoftwareFoundation/MaterialX/tree/v1.39.0/libraries/stdlib)
- [MaterialX v1.39.0 PBR definitions](https://github.com/AcademySoftwareFoundation/MaterialX/tree/v1.39.0/libraries/pbrlib)
- [KHR_materials_procedural](../../Khronos/KHR_materials_procedural/README.md)


## Appendix: Full Khronos Copyright Statement

Copyright 2024-2026 The Khronos Group Inc.

This Specification is protected by copyright laws and contains material proprietary to Khronos. Except as described by these terms, it or any components may not be reproduced, republished, distributed, transmitted, displayed, broadcast or otherwise exploited in any manner without the express prior written permission of Khronos.

Khronos grants a conditional copyright license to use and reproduce the unmodified Specification for any purpose, without fee or royalty, EXCEPT no licenses to any patent, trademark or other intellectual property rights are granted under these terms.

Khronos makes no, and expressly disclaims any, representations or warranties, express or implied, regarding this Specification, including, without limitation: merchantability, fitness for a particular purpose, non-infringement of any
intellectual property, correctness, accuracy, completeness, timeliness, and reliability. Under no circumstances will Khronos, or any of its Promoters, Contributors or Members, or their respective partners, officers, directors, employees, agents or representatives be liable for any damages, whether direct, indirect, special or consequential damages for lost revenues, lost profits, or otherwise, arising from or in connection with these materials.

This specification has been created under the Khronos Intellectual Property Rights Policy, which is Attachment A of the Khronos Group Membership Agreement available at https://www.khronos.org/files/member_agreement.pdf. Khronos grants a conditional copyright license to use and reproduce the unmodified specification for any purpose, without fee or royalty, EXCEPT no licenses to any patent, trademark or other intellectual property rights are granted under these terms. Parties desiring to implement the specification and make use of Khronos trademarks in relation to that implementation, and receive reciprocal patent license protection under the Khronos IP Policy must become Adopters and confirm the implementation as conformant under
the process defined by Khronos for this specification; see https://www.khronos.org/conformance/adopters/file-format-adopter-program.

Where this Specification identifies specific sections of external references, only those specifically identified sections define normative functionality. The Khronos Intellectual Property Rights Policy excludes external references to materials and associated enabling technology not created by Khronos from the Scope of this Specification, and any licenses that may be required to implement such referenced materials and associated technologies must be obtained separately and may involve royalty payments.

Khronos® is a registered trademark, and glTF™ is a trademark of The Khronos Group Inc. All other product names, trademarks, and/or company names are used solely for identification and belong to their respective owners.
