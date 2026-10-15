<!--
Copyright 2026 Ben Houston
SPDX-License-Identifier: CC-BY-4.0
-->

# KHR_jpegxl_linear

## Contributors

* Ben Houston, [@bhouston](https://github.com/bhouston)

## Status

Initial draft for discussion. The name and `KHR` prefix are proposed; this extension has not been ratified by Khronos.

## Dependencies

Written against the glTF 2.0 specification. No other extension is required.

## Overview

This extension adds JPEG XL images containing linear floating-point texture samples. It provides HDR image storage without packing values into normalized integer channels or requiring a display transfer function such as PQ or HLG. It changes image storage and decoding, not material equations, texture bindings, or lighting models.

Like `EXT_texture_webp` and `KHR_texture_basisu`, the extension selects an image through an alternate `source` on a texture. A core PNG or JPEG image may provide an SDR fallback. JPEG XL is a transmission format; decoded textures are not necessarily GPU compressed.

An HDR emissive texture is usable with core glTF 2.0 alone. Baked lighting, including the proposed [`KHR_lightmap`](https://github.com/KhronosGroup/glTF/pull/2679), is another motivation, but is not a dependency.

## glTF Schema Updates

The `KHR_jpegxl_linear` object is added to a `texture` object's `extensions` property.

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `source` | integer | Index of the JPEG XL image in `images`. | Yes |

The extension **MUST** be listed in `extensionsUsed`. Its `source` **MUST** reference an image conforming to the [image profile](#jpeg-xl-image-profile). The MIME type `image/jxl` is permitted for these images. An image stored in a `bufferView` **MUST** declare `mimeType: "image/jxl"`; for a URI image, `mimeType`, if present, **MUST** be `image/jxl`. Both JPEG XL codestream and container representations are permitted.

The texture's `sampler` and all texture binding properties retain their usual meanings. Mipmaps, when needed, are generated from decoded linear samples; this extension does not define stored mip levels, arrays, or cubemaps.

### Optional PNG or JPEG fallback

```json
{
    "asset": { "version": "2.0" },
    "extensionsUsed": ["KHR_jpegxl_linear"],
    "textures": [{
        "source": 0,
        "extensions": { "KHR_jpegxl_linear": { "source": 1 } }
    }],
    "images": [
        { "uri": "emission.png" },
        { "uri": "emission.jxl", "mimeType": "image/jxl" }
    ]
}
```

A supporting client **MUST** select the extension image when it can decode and use it. If support is unavailable and the extension is not required, the client **MUST** use the core `texture.source`. A client **MAY** also use that fallback after a JPEG XL loading or decoding failure. The fallback **MUST** be a core PNG or JPEG image and follows core color-space rules, including sRGB decoding for color textures. It does not inherit this extension's linear interpretation.

An SDR fallback cannot generally reproduce HDR values. Authors **SHOULD** provide an acceptable SDR approximation when broad compatibility is desired, and **SHOULD** omit the extension from `extensionsRequired` when that approximation is sufficient.

### Required HDR image

If any texture using the extension omits a core `source`, the extension **MUST** appear in both `extensionsUsed` and `extensionsRequired`. Authors **MAY** also require it when an SDR approximation is unacceptable. A client unable to decode and use a required image **MUST** report a loading failure rather than silently substitute an SDR image.

```json
{
    "asset": { "version": "2.0" },
    "extensionsUsed": ["KHR_jpegxl_linear"],
    "extensionsRequired": ["KHR_jpegxl_linear"],
    "textures": [{
        "extensions": { "KHR_jpegxl_linear": { "source": 0 } }
    }],
    "images": [{ "bufferView": 0, "mimeType": "image/jxl" }],
    "bufferViews": [{ "buffer": 0, "byteLength": 128 }],
    "buffers": [{ "uri": "emission.bin", "byteLength": 128 }]
}
```

The buffer lengths above are illustrative and must match the actual encoded image bytes.

### JSON Schema

[texture.KHR_jpegxl_linear.schema.json](schema/texture.KHR_jpegxl_linear.schema.json)

Complete, self-contained glTF examples with an external image and optional fallback, and a required buffer-view image, are provided in [examples](examples/README.md).

## JPEG XL Image Profile

Images **MUST** satisfy the following requirements:

* A single, still, two-dimensional RGB image, optionally with one alpha channel. Animation, additional frames, grayscale, and extra channels other than alpha are not permitted.
* Color samples use floating-point representation: `bits_per_sample` / `exponent_bits_per_sample` are either `16` / `5` or `32` / `8`. Normalized integer images are outside this profile.
* Color encoding uses sRGB/BT.709 primaries, the D65 white point, and a linear transfer function. Encoded color-space metadata **MUST** describe this encoding. Conflicting ICC profiles or alternate color encodings are not permitted. Internal JPEG XL coding transforms do not change the required decoded color encoding.
* Decoded RGB values **MUST** be finite and nonnegative. Values greater than `1.0` are permitted. NaN and infinity are not permitted.
* Alpha, if present, **MUST** be unassociated (not premultiplied), linear, finite, and within `[0, 1]`. If absent, alpha is `1.0`. Alpha sample precision need not match color sample precision.
* Image orientation **MUST** be identity (JPEG XL orientation `1`). The top-left texel corresponds to the glTF texture coordinate origin, as in core glTF.

These requirements apply to the decoded image, including any effects of lossy encoding. Encoders **SHOULD** select precision and compression settings appropriate to the texture's use. Lossless encoding is useful when exact sample recovery is needed; floating-point storage alone does not guarantee lossless compression.

### Sample interpretation

Decoded color samples are already in linear sRGB. Clients **MUST NOT** apply an sRGB, PQ, or HLG transfer function to them, including when the texture is bound to a slot whose core PNG/JPEG encoding is sRGB. Clients **MUST NOT** apply tone mapping, exposure adjustment, display adaptation, or luminance normalization during image decoding. In particular, JPEG XL luminance metadata, including `intensity_target`, **MUST NOT** introduce a scale factor into the material's texture samples.

The consuming material or extension defines channel meanings, units, factors, and allowed ranges. Those rules continue to apply. For example, HDR emissive RGB values are permitted, but this extension does not expand the permitted ranges of base color, metallic, roughness, occlusion, or alpha. Non-color textures use the decoded channel values directly, without color conversion. Binding the same image to different slots does not change its transfer function.

Clients **MUST** retain values above `1.0` through texture decoding and sampling. They **MAY** use a runtime floating-point representation different from the encoded precision, subject to its precision and range limitations. A client unable to represent the image's range without clipping or overflow **MUST** treat the image as unsupported. No bit-exact 32-bit GPU storage is implied by a 32-bit source image.

## Implementation Considerations (Informative)

Browser image display support alone is insufficient. A browser implementation needs a path to linear floating-point pixels that preserves values above one. An 8-bit canvas or a display-oriented decode path can silently lose the very data this extension carries. Implementations should test actual HDR sample values, alpha, and luminance scaling, not just successful image decoding.

The initial Three.js implementation builds on [`JXLLoader`](https://github.com/mrdoob/three.js/pull/35015), which reads linear float16 Canvas pixels and produces half-float textures even for 32-bit source images. Its required Canvas capabilities remain experimental. This is an implementation constraint, not a requirement to use browser decoding: native or WebAssembly decoders may also implement this profile.

Texture filtering and mipmap support for floating-point textures vary by graphics API and device. Implementations must account for the selected sampler. JPEG XL does not provide the runtime GPU memory savings of block-compressed textures.

## Background (Informative)

Earlier discussions include [`KHR_texture_hdr` (#1220)](https://github.com/KhronosGroup/glTF/issues/1220), [`EXT_hdr_textures` (#1365)](https://github.com/KhronosGroup/glTF/issues/1365), and [16-bit texture support (#1561)](https://github.com/KhronosGroup/glTF/issues/1561). They establish the need for HDR storage and unambiguous precision and color semantics. They did not produce a ratified general HDR image extension. `KHR_materials_emissive_strength` scales emission but does not itself store an HDR image.

The closer format proposals [`KHR_texture_float_f16` (#1954)](https://github.com/KhronosGroup/glTF/pull/1954) and [`KHR_texture_float_bc6h` (#1955)](https://github.com/KhronosGroup/glTF/pull/1955) use KTX2 for floating-point and GPU block-compressed HDR textures, respectively. This proposal instead targets compressed image delivery with a path to native browser decoding. It does not claim that JPEG XL is the only HDR-capable codec or that KTX2 or Basis Universal cannot carry HDR data.

The proposed [`EXT_texture_avif` (#2235)](https://github.com/KhronosGroup/glTF/pull/2235) and ratified [`EXT_texture_webp`](../../Vendor/EXT_texture_webp/README.md) demonstrate alternate image sources and optional fallbacks. This proposal follows that structure while explicitly defining linear floating-point decoding. It complements rather than replaces [`KHR_texture_basisu`](../KHR_texture_basisu/README.md).

[Chrome 155 introduced JPEG XL decoding](https://developer.chrome.com/blog/jpeg-xl-in-chrome), creating an opportunity to investigate browser-native HDR texture delivery. Format support and unclipped floating-point pixel extraction are separate capabilities; this proposal does not assume universal browser support for either.

## References

* [JPEG XL specification overview, ISO/IEC 18181](https://jpeg.org/jpegxl/)
* [libjxl image metadata API](https://libjxl.github.io/libjxl/api_metadata.html)
* [libjxl color encoding API](https://libjxl.github.io/libjxl/api_color.html)
* [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
