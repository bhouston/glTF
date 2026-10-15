<!--
Copyright 2026 Ben Houston
SPDX-License-Identifier: CC-BY-4.0
-->

# Linear HDR examples

Both assets display a textured emissive triangle using core glTF 2.0 plus `EXT_ultrajpeg`:

* `optional-fallback.gltf` references the external `linear-hdr.jpg`. The core and extension sources reference the same image: its SDR primary is available to core clients, while supporting clients reconstruct HDR.
* `required-bufferView.gltf` embeds the same Ultra HDR JPEG bytes in a buffer view with `mimeType: "image/jpeg"` and requires the extension.

`linear-hdr.jpg` is an original synthetic 16 × 16 constant-gray fixture by Ben Houston. Its primary image has an sRGB ICC profile and RGB code values `(128, 128, 128)`. Its single-channel gain map has code value `255`. Ultra HDR XMP metadata specifies gamma `1`, zero offsets, minimum gain and capacity `0`, and maximum gain and capacity `log2(4 / sRGBToLinear(128 / 255))`, approximately `4.2118288`. Capacity and gain metadata are in log2 units. Full reconstruction yields approximately `(4, 4, 4)` in linear sRGB; decoding only the primary yields approximately `(0.21586, 0.21586, 0.21586)`.

The fixture includes MPF indexing and a GContainer directory, uses XMP version `1.0` with an SDR primary, and contains no ISO-only metadata dependency. It tests HDR reconstruction, reference-white normalization, and accidental peak normalization. It does not test spatial gain-map filtering, three-channel gain maps, or the full Ultra HDR profile.

`generate-fixture.mjs` reproduces the JPEG file using Node.js and `sharp` (tested with 0.35.5). Install `sharp` in a temporary working copy or provide it through the Node module search path, then run the script. It encodes the primary/gain-map JPEGs and writes the XMP and MPF container metadata explicitly. The generated JPEG is included, so consumers do not need the generator or its dependency.

The libultrahdr WebAssembly binding in `open-ultrahdr` 0.2.0 recognizes the file and parses its gain-map metadata. Chrome 155.0.8059.41, with experimental web-platform features, a float16 linear-sRGB canvas, and `globalHDRHeadroom = Infinity`, returned RGB values between `3.998046875` and `4.0`, with alpha `1.0`. The hardware context was ANGLE / NVIDIA GeForce GTX 1050 / D3D11. This verifies this fixture's numerical reconstruction in one browser; it does not establish general decoder conformance or provide a glTF loader implementation.
