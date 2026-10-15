<!--
Copyright 2026 Ben Houston
SPDX-License-Identifier: CC-BY-4.0
-->

# EXT_ultrajpeg

## Contributors

* Ben Houston, [@bhouston](https://github.com/bhouston)

## Status

Initial draft for discussion. The name and `EXT` prefix are proposed; this extension has not been ratified by Khronos.

## Dependencies

Written against the glTF 2.0 specification. No other glTF extension is required.

## Overview

This extension adds Ultra HDR JPEG images as a source of linear HDR texture data. An Ultra HDR JPEG contains an SDR JPEG primary image, a JPEG gain map, and metadata for reconstructing an HDR rendition. The extension selects the full HDR rendition for texture sampling, independently of the display's capabilities. It changes image storage and decoding, not material equations, texture bindings, or lighting models.

JPEG provides compact image delivery, broad decoder support, and established software encoders and decoders. Ultra HDR builds on that ecosystem with a gain map rather than requiring a new primary image codec. Ordinary JPEG readers can decode the SDR primary image; implementing this extension additionally requires gain-map reconstruction and access to the resulting linear HDR samples. Decoded textures are not necessarily GPU compressed.

HDR emissive textures are usable with core glTF 2.0 alone. Baked lighting, including the proposed [`KHR_lightmap`](https://github.com/KhronosGroup/glTF/pull/2679), is another motivation, but is not a dependency.

## glTF Schema Updates

The `EXT_ultrajpeg` object is added to a `texture` object's `extensions` property.

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `source` | integer | Index of the Ultra HDR JPEG image in `images`. | Yes |

The extension **MUST** be listed in `extensionsUsed`. Its `source` **MUST** reference an image conforming to the [image profile](#ultra-hdr-jpeg-image-profile). The image uses the existing MIME type `image/jpeg`. An image stored in a `bufferView` **MUST** declare `mimeType: "image/jpeg"`; for a URI image, `mimeType`, if present, **MUST** be `image/jpeg`.

The texture's `sampler` and all texture binding properties retain their usual meanings. Mipmaps, when needed, are generated from reconstructed linear HDR samples. The extension does not define stored mip levels, arrays, or cubemaps.

The following example selects `emission.jpg` in clients that support this extension. The core source references the same image for its SDR rendition, avoiding a separate fallback file.

```json
{
    "asset": { "version": "2.0" },
    "extensionsUsed": ["EXT_ultrajpeg"],
    "textures": [{
        "source": 0,
        "extensions": { "EXT_ultrajpeg": { "source": 0 } }
    }],
    "images": [{ "uri": "emission.jpg", "mimeType": "image/jpeg" }]
}
```

A supporting client **MUST** select the full HDR rendition when it can decode and use it. An optional core `texture.source` provides a PNG or JPEG fallback for clients without support. If it references the same image, core sampling uses only the SDR primary image. Fallback images follow core color-space rules, including sRGB decoding for color textures. When a fallback is provided, this extension **SHOULD NOT** be listed in `extensionsRequired`, unless preserving HDR values is essential.

### Using Without a Fallback

If any texture using the extension omits a core `source`, the extension **MUST** appear in both `extensionsUsed` and `extensionsRequired`. Clients unable to support a required extension **MUST** report a loading failure.

```json
{
    "asset": { "version": "2.0" },
    "extensionsUsed": ["EXT_ultrajpeg"],
    "extensionsRequired": ["EXT_ultrajpeg"],
    "textures": [{
        "extensions": { "EXT_ultrajpeg": { "source": 0 } }
    }],
    "images": [{ "uri": "emission.jpg", "mimeType": "image/jpeg" }]
}
```

### JSON Schema

[texture.EXT_ultrajpeg.schema.json](schema/texture.EXT_ultrajpeg.schema.json)

Complete emissive-triangle assets using an external JPEG with its built-in SDR rendition, and a required buffer-view image, are provided in [examples](examples/README.md).

## Ultra HDR JPEG Image Profile

Images **MUST** conform to the Ultra HDR v1.0 file format and decoding rules documented in [Ultra HDR Image Format v1.1](https://developer.android.com/media/platform/hdr-image-format), with these additional requirements:

* The file contains one SDR primary JPEG image and its associated single-channel or three-channel JPEG gain map, with valid Ultra HDR XMP metadata (`hdrgm:Version` is `"1.0"` and `hdrgm:BaseRenditionIsHDR` is absent or `"False"`). These two images form one static texture, not an animation or image array.
* The primary image **MUST** declare an sRGB color profile. The gain map is reconstruction data, not an independently color-managed texture. Its samples **MUST NOT** be sRGB-decoded.
* EXIF orientation **MUST** be absent or identity (`1`). The top-left texel corresponds to the glTF texture coordinate origin, as in core glTF.
* Reconstructed linear RGB samples **MUST** be finite and nonnegative. Values above `1.0` are permitted. JPEG has no alpha channel; sampled alpha is `1.0`.

The v1.1 document retains the v1.0 bitstream and adds information about ISO 21496-1 interoperability. This profile requires Ultra HDR XMP metadata and uses that metadata for reconstruction. Files containing only ISO 21496-1 metadata are outside this profile. If both metadata forms are present, they **MUST** describe equivalent HDR renditions.

### Linear HDR Reconstruction

Clients **MUST** reconstruct the full target HDR rendition using the referenced format's decoding equations with `weight_factor = 1`. Gain-map resampling **MUST** use bilinear filtering or better, as required by that format. Neither the connected display's headroom nor operating-system brightness settings may reduce gain-map application.

The primary JPEG is decoded to linear sRGB before applying the gain map. The reconstructed samples use sRGB/BT.709 primaries and D65, with linear SDR reference white equal to `1.0`. Clients **MUST NOT** divide the reconstructed samples by the image's maximum boost or normalize the brightest texel to one. A decoder exposing absolute luminance **MUST** convert to this relative scale using its documented SDR reference-white convention, preserving SDR reference white at `1.0`, rather than using the current display's white level.

Once reconstructed, clients **MUST NOT** apply another sRGB, PQ, or HLG transfer-function decode, including in slots whose core PNG/JPEG representation is sRGB. Clients **MUST NOT** apply tone mapping, exposure adjustment, display adaptation, or gamut mapping as part of texture decoding. Merely decoding the primary JPEG as SDR does not implement this extension.

The consuming material or extension defines channel meanings, units, factors, and permitted ranges. Those rules continue to apply. For example, HDR emissive RGB values are permitted, but this extension does not expand the permitted ranges of base color, metallic, roughness, or occlusion. Non-color textures use the reconstructed channel values directly. Binding an image to different slots does not change its transfer function or reconstruction strength.

### Runtime Representation

Clients **MUST** retain linear HDR values, including values above `1.0`, through reconstruction and texture sampling. Decoding to IEEE 754 binary16 (16-bit floating-point) samples is **RECOMMENDED** when its precision and range are sufficient for the asset. Clients **MAY** instead use 32-bit floating-point samples or another runtime representation, including a transcoded representation, provided texture sampling recovers the linear HDR values within that representation's precision without clipping or overflow. A client unable to represent the image's range **MUST** treat the image as unsupported. No particular decoder output type or GPU storage format is required.

## Implementation Considerations (Informative)

[libultrahdr](https://github.com/google/libultrahdr) provides software encoding and decoding. Its linear output path uses `UHDR_CT_LINEAR` with half-float RGBA output. Implementations must request full gain-map application, rather than a rendition adapted to a particular display. The library API expresses capacity values as linear ratios, while Ultra HDR XMP expresses them in log2 units. A library's available output formats do not constrain this extension's runtime representation.

Browser JPEG support alone is insufficient: decoding may return only the SDR primary or adapt the HDR rendition to the current display. Implementations should verify numerical samples above one, fixed reconstruction strength, and SDR white normalization. Native or WebAssembly decoders may be used when a browser cannot provide the required samples.

The primary JPEG and gain map are generally lossy. High dynamic range does not imply lossless reconstruction or floating-point source precision. Encoders should choose primary-image quality, gain-map quality and resolution appropriate to texture use. Material data maps may require higher quality than photographs. Floating-point filtering and mipmap support also vary by graphics API and device.

## Background (Informative)

Earlier discussions include [`KHR_texture_hdr` (#1220)](https://github.com/KhronosGroup/glTF/issues/1220), [`EXT_hdr_textures` (#1365)](https://github.com/KhronosGroup/glTF/issues/1365), and [16-bit texture support (#1561)](https://github.com/KhronosGroup/glTF/issues/1561). Related KTX2 proposals include [`KHR_texture_float_f16` (#1954)](https://github.com/KhronosGroup/glTF/pull/1954) and [`KHR_texture_float_bc6h` (#1955)](https://github.com/KhronosGroup/glTF/pull/1955). These proposals have not established a ratified general HDR image path for core material textures. `KHR_materials_emissive_strength` scales emission but does not itself store an HDR image.

The texture-level alternate source follows [`EXT_texture_webp`](../EXT_texture_webp/README.md), proposed [`EXT_texture_avif` (#2235)](https://github.com/KhronosGroup/glTF/pull/2235), and [`KHR_texture_basisu`](../../Khronos/KHR_texture_basisu/README.md). The distinguishing requirement here is full, display-independent gain-map reconstruction into linear HDR texture samples.

## References

* [Ultra HDR Image Format v1.1](https://developer.android.com/media/platform/hdr-image-format) — normative v1.0 file format and decoding equations, subject to the profile above.
* [libultrahdr reference software](https://github.com/google/libultrahdr)
* [libultrahdr public API](https://github.com/google/libultrahdr/blob/main/ultrahdr_api.h)
* [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
