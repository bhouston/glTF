// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../examples');
fs.mkdirSync(directory, { recursive: true });
const K = 'KHR_texture_procedurals', M = 'EXT_texture_procedurals_mx_1_39';
const val = (type, value) => ({ nodetype: 'input', type, value });
const link = (type, node) => ({ nodetype: 'input', type, node, output: 'out' });
const port = type => ({ nodetype: 'output', type });
const output = (type, node) => ({ ...port(type), node, output: 'out' });
const atomic = (nodetype, type, inputs) => ({ nodetype, type, inputs, outputs: { out: port(type) } });
const graph = (nodes, outputs, inputs = {}) => ({ nodetype: 'nodegraph', type: Object.keys(outputs).length === 1 ? Object.values(outputs)[0].type : 'multioutput', inputs, nodes, outputs });
const scalar = x => atomic('constant', 'float', { value: val('float', [x]) });
function asset(g, bindings) {
  return { asset: { version: '2.0', generator: 'KHR_texture_procedurals fixtures' }, extensionsUsed: [K, M], extensions: { [K]: { procedurals: [g] } }, materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0.2, roughnessFactor: 0.8 }, extensions: { [K]: { bindings } } }] };
}
const binding = output => ({ index: 0, output });
function save(name, a) {
  if (!a.animations) {
    const positions = [-1,-1,0, 1,-1,0, 1,1,0, -1,-1,0, 1,1,0, -1,1,0];
    const uv = [0,0, 1,0, 1,1, 0,0, 1,1, 0,1];
    const data = Buffer.alloc((positions.length + uv.length) * 4);
    [...positions, ...uv].forEach((v,i) => data.writeFloatLE(v, i*4));
    a.buffers = [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${data.toString('base64')}` }];
    a.bufferViews = [{ buffer: 0, byteLength: 72, target: 34962 }, { buffer: 0, byteOffset: 72, byteLength: 48, target: 34962 }];
    a.accessors = [{ bufferView: 0, componentType: 5126, count: 6, type: 'VEC3', min: [-1,-1,0], max: [1,1,0] }, { bufferView: 1, componentType: 5126, count: 6, type: 'VEC2' }];
    a.meshes = [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }];
    a.nodes = [{ mesh: 0 }]; a.scenes = [{ nodes: [0] }]; a.scene = 0;
  }
  a.asset.extras = { copyright: 'Copyright 2026 The Khronos Group Inc.', license: 'SPDX-License-Identifier: Apache-2.0' }; fs.writeFileSync(path.join(directory, `${name}.gltf`), `${JSON.stringify(a, null, 2)}\n`);
}
const independent = asset(graph([scalar(0.15), scalar(0.85)], { metal: output('float', 0), rough: output('float', 1) }), { metallic: binding('metal'), roughness: binding('rough') });
save('independent-channels', independent);
const shared = structuredClone(independent); shared.materials.push(structuredClone(shared.materials[0])); shared.materials[1].pbrMetallicRoughness.baseColorFactor = [1, 0, 0, 1]; save('shared-multioutput', shared);
const checker = graph([
 atomic('extract', 'float', { in: { nodetype: 'input', type: 'vector2', input: 'uv' }, index: val('integer', [0]) }),
 atomic('extract', 'float', { in: { nodetype: 'input', type: 'vector2', input: 'uv' }, index: val('integer', [1]) }),
 atomic('floor', 'float', { in: link('float', 0) }), atomic('floor', 'float', { in: link('float', 1) }),
 atomic('add', 'float', { in1: link('float', 2), in2: link('float', 3) }),
 atomic('modulo', 'float', { in1: link('float', 4), in2: val('float', [2]) })
], { checker: output('float', 5) }, { uv: val('vector2', [0, 0]) });
save('checkerboard', asset(checker, { roughness: binding('checker') }));
const custom = asset(graph([{ nodetype: 'user_scalar', nodedef: 0, type: 'float', outputs: { out: port('float') } }], { out: output('float', 0) }), { roughness: binding('out') });
custom.extensions[K].procedural_definitions = [{ nodetype: 'nodedef', node: 'user_scalar', inputs: { amount: val('float', [0.6]) }, outputs: { out: port('float') } }, { nodetype: 'nodegraph', nodedef: 0, type: 'float', nodes: [], outputs: { out: { ...port('float'), input: 'amount' } } }]; save('custom-definition', custom);
const image = asset(graph([atomic('texcoord', 'vector2', { index: val('integer', [0]) }), atomic('image', 'color3', { file: { nodetype: 'input', type: 'filename', texture: 0 }, texcoord: link('vector2', 0) })], { out: output('color3', 1) }), { baseColor: binding('out') });
image.textures = [{ source: 0 }]; image.images = [{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' }]; save('image-resource', image);
const animated = asset(graph([], { out: { ...port('float'), input: 'rough/amount' } }, { 'rough/amount': val('float', [0.5]) }), { roughness: binding('out') });
animated.extensionsUsed.push('KHR_animation_pointer');
const data = Buffer.alloc(16); [0, 1, 0.2, 0.9].forEach((v, i) => data.writeFloatLE(v, i * 4));
animated.buffers = [{ byteLength: 16, uri: `data:application/octet-stream;base64,${data.toString('base64')}` }];
animated.bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 8 }];
animated.accessors = [{ bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] }, { bufferView: 1, componentType: 5126, count: 2, type: 'SCALAR' }];
animated.animations = [{ samplers: [{ input: 0, output: 1 }], channels: [{ sampler: 0, target: { path: 'pointer', extensions: { KHR_animation_pointer: { pointer: `/extensions/${K}/procedurals/0/inputs/rough~1amount/value` } } } }] }]; save('animated-interface', animated);
