<!--
Copyright 2026 Ben Houston
SPDX-License-Identifier: CC-BY-4.0
-->

# Linear HDR examples

Both glTF 2.0 assets display a textured emissive triangle and require no other extension:

* `optional-fallback.gltf` references the external `linear-hdr.jxl` and includes an embedded PNG fallback, clipped to the SDR range and encoded as sRGB.
* `required-bufferView.gltf` embeds the same JPEG XL bytes in a buffer view, declares `image/jxl`, and requires the extension.

The 2 × 2 RGB image has these linear samples, in top-to-bottom row order. Alpha is absent and decodes to one.

| Texel | R | G | B |
|-------|---|---|---|
| Top left | 0 | 0.5 | 1 |
| Top right | 2 | 4 | 8 |
| Bottom left | 1 | 1 | 1 |
| Bottom right | 0.25 | 0.5 | 0.75 |

`linear-hdr.jxl` is an original synthetic fixture by Ben Houston. It was encoded from a little-endian RGB float32 PFM (bottom row first) using libjxl 0.12.0:

```sh
cjxl linear-hdr.pfm linear-hdr.jxl -d 0 -e 7 -x color_space=RGB_D65_SRG_Rel_Lin
```

`jxlinfo` reports a lossless 32-bit float RGB image with eight exponent bits, D65 white point, sRGB primaries, and linear transfer. The file is 117 bytes. The fixture is intended to expose clipping above one, accidental sRGB conversion, and image orientation errors. It is not a comprehensive JPEG XL profile conformance suite.

On Chrome 155.0.8059.41 with `--enable-experimental-web-platform-features`, a float16 `srgb-linear` canvas with `globalHDRHeadroom = Infinity` returned the exact samples above on a hardware NVIDIA GeForce GTX 1050 context. Re-encoding with `--intensity_target=1000` also preserved these values. This single-browser result does not establish arbitrary 32-bit range or precision support, alpha behavior, or interoperability across decoders.
