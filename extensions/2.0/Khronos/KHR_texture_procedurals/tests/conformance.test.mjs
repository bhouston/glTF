// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validate, directory } from '../tools/validate.mjs';
import { evaluate } from '../tools/reference.mjs';
const K = 'KHR_texture_procedurals';
const read = name => JSON.parse(fs.readFileSync(path.join(directory, 'examples', `${name}.gltf`), 'utf8'));
const root = a => a.extensions[K];
for (const name of fs.readdirSync(path.join(directory, 'examples')).filter(n => n.endsWith('.gltf'))) test(`schema + semantics: ${name}`, () => assert.deepEqual(validate(read(name.slice(0, -5))), []));
test('metallic and roughness remain independent scalar outputs', () => {
  const g = root(read('independent-channels')).procedurals[0];
  assert.deepEqual(evaluate(g), { metal: [0.15], rough: [0.85] });
});
test('checkerboard parity including negative coordinates', () => {
  const g = root(read('checkerboard')).procedurals[0];
  for (const [uv, expected] of [[[0.1,0.1],0], [[1.1,0.1],1], [[1.1,1.1],0], [[-0.1,0.1],1]]) assert.deepEqual(evaluate(g, { uv }).checker, [expected]);
});
const negatives = {
  'unpaired required declarations': a => { a.extensionsRequired = [K]; },
  'different MaterialX version': a => { a.extensionsUsed.push('EXT_texture_procedurals_mx_1_38'); },
  'out of range graph': a => { a.materials[0].extensions[K].bindings.metallic.index = 100; },
  'nonexistent named output': a => { a.materials[0].extensions[K].bindings.metallic.output = 'missing'; },
  'wrong scalar channel type': a => { a.materials[0].extensions[K].bindings.baseColor = { index: 0, output: 'metal' }; },
  'node cycle': a => { const n = root(a).procedurals[0].nodes[0]; n.inputs.value = { nodetype: 'input', type: 'float', node: 0, output: 'out' }; },
  'interface missing': a => { root(a).procedurals[0].outputs.metal = { nodetype: 'output', type: 'float', input: 'absent' }; },
  'multiple sources': a => { root(a).procedurals[0].nodes[0].inputs.value.input = 'other'; },
  'typed value wrong shape': a => { root(a).procedurals[0].nodes[0].inputs.value.value = [1,2]; },
  'legacy numeric selector': a => { root(a).procedurals[0].outputs.metal.output = 0; },
  'unknown graph property': a => { root(a).procedurals[0].code = 'void main(){}'; },
  'invalid fallback factor': a => { a.materials[0].pbrMetallicRoughness.roughnessFactor = 2; },
  'standard input type mismatch': a => { const p = root(a).procedurals[0].nodes[0].inputs.value; p.type = 'integer'; },
  'unlit lit channel': a => { a.materials[0].extensions.KHR_materials_unlit = {}; },
};
for (const [name, mutate] of Object.entries(negatives)) test(`reject ${name}`, () => { const a = read('independent-channels'); mutate(a); assert.ok(validate(a).length); });
test('reject recursive custom definitions', () => {
  const a = read('custom-definition'), impl = root(a).procedural_definitions[1];
  impl.nodes = [structuredClone(root(a).procedurals[0].nodes[0])]; impl.outputs.out = { nodetype: 'output', type: 'float', node: 0, output: 'out' };
  assert.ok(validate(a).some(e => e.includes('Recursive')));
});
test('reject custom definition without implementation', () => { const a = read('custom-definition'); root(a).procedural_definitions.pop(); assert.ok(validate(a).length); });
test('reject missing geometry stream', () => { const a = read('image-resource'); delete a.meshes[0].primitives[0].attributes.TEXCOORD_0; assert.ok(validate(a).length); });
test('reject invalid image reference', () => { const a = read('image-resource'); a.textures[0].source = 10; assert.ok(validate(a).length); });
test('reject animating interior component', () => { const a = read('animated-interface'); a.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer += '/0'; assert.ok(validate(a).length); });
test('reject mismatched animation output accessor', () => { const a = read('animated-interface'); a.accessors[1].type = 'VEC3'; assert.ok(validate(a).length); });
