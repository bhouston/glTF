// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materialBindings } from './material-bindings.mjs';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../examples');
const K = 'KHR_materials_procedural', MX = 'EXT_materials_procedural_mx_1_39';
const values = {
  anisotropyStrength: [0.6], anisotropyDirection: [0, 1], clearcoat: [0.4],
  clearcoatRoughness: [0.2], clearcoatNormal: [0, 0, 1], dispersion: [0.3],
  emissiveStrength: [3], ior: [1.45], iridescence: [0.5], iridescenceIor: [1.3],
  iridescenceThickness: [250], sheenColor: [0.2, 0.1, 0.05], sheenRoughness: [0.6],
  specular: [0.8], specularColor: [2, 1, 0.5], transmission: [0.7], thickness: [0],
  attenuationDistance: [0.1], attenuationColor: [0.5, 0.75, 1], emissive: [0.1, 0.2, 0.3]
};
const owners = [...new Set(Object.keys(values).map(n => materialBindings[n].owner).filter(Boolean))];
const graph = { nodetype: 'nodegraph', type: 'multioutput', inputs: {}, nodes: [], outputs: {} };
const bindings = {};
for (const [name, value] of Object.entries(values)) {
  const type = materialBindings[name].type;
  graph.inputs[name] = { nodetype: 'input', type, value };
  graph.outputs[name] = { nodetype: 'output', type, input: name };
  bindings[name] = { index: 0, output: name };
}
// Two triangles, with an explicit right-handed tangent frame and UV stream.
const positions = [-1,-1,0, 1,-1,0, 1,1,0, -1,-1,0, 1,1,0, -1,1,0];
const streams = [positions, [0,0, 1,0, 1,1, 0,0, 1,1, 0,1],
  Array.from({ length: 6 }, () => [0,0,1]).flat(), Array.from({ length: 6 }, () => [1,0,0,1]).flat()];
const buffer = Buffer.alloc(streams.flat().length * 4);
let offset = 0;
const bufferViews = streams.map(stream => {
  const view = { buffer: 0, byteOffset: offset, byteLength: stream.length * 4, target: 34962 };
  for (const value of stream) { buffer.writeFloatLE(value, offset); offset += 4; }
  return view;
});
const asset = {
  asset: { version: '2.0', generator: 'KHR_materials_procedural material extension fixture',
    extras: { copyright: 'Copyright 2026 The Khronos Group Inc.', license: 'Apache-2.0' } },
  extensionsUsed: [K, MX, ...owners], extensionsRequired: [K, MX],
  extensions: { [K]: { procedurals: [graph] } },
  materials: [{ name: 'Conditional material extension channels',
    pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.3 },
    extensions: { ...Object.fromEntries(owners.map(owner => [owner, {}])), [K]: { bindings } } }],
  buffers: [{ byteLength: buffer.length, uri: `data:application/octet-stream;base64,${buffer.toString('base64')}` }],
  bufferViews,
  accessors: streams.map((_, i) => ({ bufferView: i, componentType: 5126, count: 6,
    type: ['VEC3', 'VEC2', 'VEC3', 'VEC4'][i], ...(i === 0 ? { min: [-1,-1,0], max: [1,1,0] } : {}) })),
  meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, NORMAL: 2, TANGENT: 3 }, material: 0 }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
};
fs.writeFileSync(path.join(directory, 'material-extensions.gltf'), `${JSON.stringify(asset, null, 2)}\n`);
fs.writeFileSync(path.join(directory, 'material-extensions.gltf.license'),
  'Copyright 2026 The Khronos Group Inc.\nSPDX-License-Identifier: Apache-2.0\n');
