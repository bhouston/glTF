// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0

export const materialBindings = {
  baseColor: { type: 'color3' },
  metallic: { type: 'float' },
  roughness: { type: 'float' },
  opacity: { type: 'float' },
  normal: { type: 'vector3' },
  occlusion: { type: 'float' },
  emissive: { type: 'color3' },
  anisotropyStrength: { type: 'float', owner: 'KHR_materials_anisotropy', min: 0, max: 1 },
  anisotropyDirection: { type: 'vector2', owner: 'KHR_materials_anisotropy', nonzero: true },
  clearcoat: { type: 'float', owner: 'KHR_materials_clearcoat', min: 0, max: 1 },
  clearcoatRoughness: { type: 'float', owner: 'KHR_materials_clearcoat', min: 0, max: 1 },
  clearcoatNormal: { type: 'vector3', owner: 'KHR_materials_clearcoat', nonzero: true },
  dispersion: { type: 'float', owner: 'KHR_materials_dispersion', min: 0, uniform: true },
  emissiveStrength: { type: 'float', owner: 'KHR_materials_emissive_strength', min: 0 },
  ior: { type: 'float', owner: 'KHR_materials_ior', min: 1, uniformWhen: 'KHR_materials_volume' },
  iridescence: { type: 'float', owner: 'KHR_materials_iridescence', min: 0, max: 1 },
  iridescenceIor: { type: 'float', owner: 'KHR_materials_iridescence', min: 1 },
  iridescenceThickness: { type: 'float', owner: 'KHR_materials_iridescence', min: 0 },
  sheenColor: { type: 'color3', owner: 'KHR_materials_sheen', min: 0, max: 1 },
  sheenRoughness: { type: 'float', owner: 'KHR_materials_sheen', min: 0, max: 1 },
  specular: { type: 'float', owner: 'KHR_materials_specular', min: 0, max: 1 },
  specularColor: { type: 'color3', owner: 'KHR_materials_specular', min: 0 },
  transmission: { type: 'float', owner: 'KHR_materials_transmission', min: 0, max: 1 },
  thickness: { type: 'float', owner: 'KHR_materials_volume', min: 0 },
  attenuationDistance: { type: 'float', owner: 'KHR_materials_volume', min: 0, exclusiveMin: true, uniform: true },
  attenuationColor: { type: 'color3', owner: 'KHR_materials_volume', min: 0, max: 1, uniform: true }
};
