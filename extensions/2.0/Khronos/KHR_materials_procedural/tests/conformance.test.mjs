// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validate, parseAsset, directory } from '../tools/validate.mjs';
import { evaluate } from '../tools/reference.mjs';
import { crc32 } from '../tools/png.mjs';
import { inflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
const K = 'KHR_materials_procedural';
const read = name => JSON.parse(fs.readFileSync(path.join(directory, 'examples', `${name}.gltf`), 'utf8'));
const root = a => a.extensions[K];
for (const name of fs.readdirSync(path.join(directory, 'examples')).filter(n => n.endsWith('.gltf'))) test(`schema + semantics: ${name}`, () => assert.deepEqual(validate(read(name.slice(0, -5))), []));
test('metallic and roughness remain independent scalar outputs', () => {
  const g = root(read('independent-channels')).procedurals[0];
  assert.deepEqual(evaluate(g), { metal: [0.15], rough: [0.85] });
});
test('checkerboard parity including negative coordinates', () => {
  const g = root(read('checkerboard')).procedurals[0];
  for (const [uv, expected] of [[[0.1,0.1],0], [[1.1,0.1],1], [[1.1,1.1],0], [[-0.1,0.1],1]]) assert.deepEqual(evaluate(g, {}, { TEXCOORD_0: uv.map(x => x / 8) }).checker, [expected]);
});
const negatives = {
  'unpaired required declarations': a => { a.extensionsRequired = [K]; },
  'different MaterialX version': a => { a.extensionsUsed.push('EXT_materials_procedural_mx_1_38'); },
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
test('unrelated material primitives do not require procedural streams', () => {
  const a = read('image-resource'), primitive = structuredClone(a.meshes[0].primitives[0]);
  a.materials.push({}); primitive.material = 1; delete primitive.attributes.TEXCOORD_0; a.meshes[0].primitives.push(primitive);
  assert.deepEqual(validate(a), []);
});
test('unbound graph outputs do not require procedural streams', () => {
  const a = read('image-resource'), g = root(a).procedurals[0];
  g.nodes.push({ nodetype: 'constant', type: 'color3', inputs: { value: { nodetype: 'input', type: 'color3', value: [1,0,0] } }, outputs: { out: { nodetype: 'output', type: 'color3' } } });
  g.outputs.unused = g.outputs.out; g.outputs.out = { nodetype: 'output', type: 'color3', node: 2, output: 'out' }; g.type = 'multioutput';
  delete a.meshes[0].primitives[0].attributes.TEXCOORD_0;
  assert.deepEqual(validate(a), []);
});
function customImage() {
  const a = read('image-resource'), g = root(a).procedurals[0], outputs = { out: { nodetype: 'output', type: 'color3' } };
  root(a).procedural_definitions = [{ nodetype: 'nodedef', node: 'user_image', inputs: {}, outputs }, { nodetype: 'nodegraph', nodedef: 0, type: 'color3', nodes: g.nodes, outputs: g.outputs }];
  g.nodes = [{ nodetype: 'user_image', nodedef: 0, type: 'color3', outputs }]; g.outputs = { out: { nodetype: 'output', type: 'color3', node: 0, output: 'out' } };
  return a;
}
test('custom implementation geometry is checked in the bound context', () => {
  const a = customImage(); assert.deepEqual(validate(a), []);
  delete a.meshes[0].primitives[0].attributes.TEXCOORD_0;
  assert.ok(validate(a).some(e => e.includes('TEXCOORD_0')));
});
test('reject unknown MaterialX category', () => { const a = read('independent-channels'); root(a).procedurals[0].nodes[0].nodetype = 'imaginary_operator'; assert.ok(validate(a).some(e => e.includes('signature'))); });
test('reject excluded time operator', () => { const a = read('independent-channels'); root(a).procedurals[0].nodes[0].nodetype = 'time'; delete root(a).procedurals[0].nodes[0].inputs; assert.ok(validate(a).some(e => e.includes('signature'))); });
test('reject missing geometric default override', () => { const a = read('image-resource'); delete root(a).procedurals[0].nodes[1].inputs.texcoord; assert.ok(validate(a).some(e => e.includes('required explicit input texcoord'))); });
test('reject missing filename default override', () => { const a = read('image-resource'); delete root(a).procedurals[0].nodes[1].inputs.file; assert.ok(validate(a).some(e => e.includes('required explicit input file'))); });
test('ordinary literal defaults remain supported', () => { const a = read('independent-channels'); delete root(a).procedurals[0].nodes[0].inputs; assert.deepEqual(validate(a), []); });
test('reject unknown standard port', () => { const a = read('independent-channels'); root(a).procedurals[0].nodes[0].inputs.unknown = { nodetype: 'input', type: 'float', value: [1] }; assert.ok(validate(a).some(e => e.includes('signature'))); });
test('reject standard string mode outside library enum', () => { const a = read('image-resource'); root(a).procedurals[0].nodes[1].inputs.filtertype = { nodetype: 'input', type: 'string', value: 'imaginary' }; assert.ok(validate(a).some(e => e.includes('mode'))); });
test('reject numbered image sequence', () => { const a = read('image-resource'); root(a).procedurals[0].nodes[1].inputs.framerange = { nodetype: 'input', type: 'string', value: '1-10' }; assert.ok(validate(a).some(e => e.includes('mode'))); });
test('reject multiple custom default versions', () => {
  const a = read('custom-definition'), d = root(a).procedural_definitions; d[0].defaultVersion = true;
  d.push({ ...structuredClone(d[0]), version: '2' }, { ...structuredClone(d[1]), nodedef: 2 });
  assert.ok(validate(a).some(e => e.includes('Multiple default')));
});
test('reject mismatched custom implementation outputs', () => { const a = read('custom-definition'); const outputs = root(a).procedural_definitions[1].outputs; outputs.other = outputs.out; delete outputs.out; assert.ok(validate(a).some(e => e.includes('implementation outputs'))); });
test('reject invalid RFC6901 escape', () => { const a = read('animated-interface'); a.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer = '/extensions/KHR_materials_procedural/procedurals/0/inputs/rough~2amount/value'; assert.ok(validate(a).some(e => e.includes('Invalid procedural animation'))); });
test('reject duplicate animation target in one animation', () => { const a = read('animated-interface'); a.animations[0].channels.push(structuredClone(a.animations[0].channels[0])); assert.ok(validate(a).some(e => e.includes('Duplicate'))); });
test('allow different animations to target the same input', () => { const a = read('animated-interface'); a.animations.push(structuredClone(a.animations[0])); assert.deepEqual(validate(a), []); });
test('allow normalized integer pointer output accessor', () => { const a = read('animated-interface'); a.accessors[1].componentType = 5121; a.accessors[1].normalized = true; assert.deepEqual(validate(a), []); });
test('reject node property on animation pointer target', () => { const a = read('animated-interface'); a.nodes = [{}]; a.animations[0].channels[0].target.node = 0; assert.ok(validate(a).length); });
test('reject misplaced base payload', () => { const a = read('independent-channels'); a.meshes[0].primitives[0].extensions = { [K]: { bindings: { roughness: { index: 0, output: 'rough' } } } }; assert.ok(validate(a).some(e => e.includes('invalid location'))); });
test('reject nonfinite API values', () => { for (const x of [Infinity, NaN]) { const a = read('independent-channels'); root(a).procedurals[0].nodes[0].inputs.value.value = [x]; assert.ok(validate(a).length); } });
test('reject duplicate JSON keys in CLI', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'procedurals-json-'));
  try {
    const file = path.join(temporary, 'duplicate.gltf'); fs.writeFileSync(file, '{"asset":{"version":"2.0","version":"2.0"}}');
    const result = spawnSync(process.execPath, [path.join(directory, 'tools/validate.mjs'), file], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /Duplicate JSON property/);
  } finally { fs.rmSync(temporary, { recursive: true }); }
});
test('strict JSON rejects comments, trailing commas, and numeric overflow', () => { for (const text of ['{"a":1,"a":2}', '{"a":1,}', '{/*comment*/"a":1}', '{"a":1e400}']) assert.throws(() => parseAsset(text)); });
test('embedded PNG has valid chunks, CRCs and pixel data', () => {
  const bytes = Buffer.from(read('image-resource').images[0].uri.split(',')[1], 'base64'), data = [];
  assert.deepEqual([...bytes.subarray(0,8)], [137,80,78,71,13,10,26,10]);
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii',offset+4,offset+8), payload = bytes.subarray(offset+8,offset+8+length);
    assert.equal(bytes.readUInt32BE(offset+8+length), crc32(bytes.subarray(offset+4,offset+8+length)));
    if (type === 'IHDR') { assert.equal(payload.readUInt32BE(0), 1); assert.equal(payload.readUInt32BE(4), 1); assert.equal(payload[9], 2); }
    if (type === 'IDAT') data.push(payload);
    offset += length + 12;
  }
  assert.equal(offset,bytes.length); assert.deepEqual([...inflateSync(Buffer.concat(data))], [0,255,255,255]);
});
const literalInput = (type, value) => ({ nodetype: 'input', type, value });
const nodeInput = (type, node) => ({ nodetype: 'input', type, node, output: 'out' });
const atomic = (nodetype, type, inputs) => ({ nodetype, type, inputs, outputs: { out: { nodetype: 'output', type } } });
test('uniform geometry stream index through root interface', () => {
  const a = read('image-resource'), g = root(a).procedurals[0];
  g.inputs.stream = literalInput('integer', [0]); g.nodes[0].inputs.index = { nodetype: 'input', type: 'integer', input: 'stream' };
  assert.deepEqual(validate(a), []);
});
test('uniform geometry stream index through arithmetic DAG', () => {
  const a = read('image-resource'), g = root(a).procedurals[0];
  g.nodes.push(atomic('add','integer',{ in1: literalInput('integer',[0]), in2: literalInput('integer',[0]) }));
  g.nodes[0].inputs.index = nodeInput('integer',2);
  assert.deepEqual(validate(a), []);
});
test('reject spatial source driving a uniform index', () => {
  const a = read('image-resource'), g = root(a).procedurals[0];
  g.nodes.push(atomic('texcoord','vector2',{ index: literalInput('integer',[0]) }), atomic('extract','float',{ in: nodeInput('vector2',2), index: literalInput('integer',[0]) }), atomic('floor','integer',{ in: nodeInput('float',3) }));
  g.nodes[0].inputs.index = nodeInput('integer',4);
  assert.ok(validate(a).some(e => e.includes('requires a uniform source')));
});
test('reject varying custom override forwarded to a uniform port', () => {
  const a = customImage(), g = root(a).procedurals[0], defs = root(a).procedural_definitions;
  defs[0].inputs.index = literalInput('integer',[0]); defs[1].nodes[0].inputs.index = { nodetype: 'input', type: 'integer', input: 'index' };
  g.nodes.push(atomic('texcoord','vector2',{ index: literalInput('integer',[0]) }), atomic('extract','float',{ in: nodeInput('vector2',1), index: literalInput('integer',[0]) }), atomic('floor','integer',{ in: nodeInput('float',2) }));
  g.nodes[0].inputs = { index: nodeInput('integer',3) };
  assert.ok(validate(a).some(e => e.includes('requires a uniform source')));
});
function tangentAsset(index = 0) {
  const a = read('image-resource'), g = root(a).procedurals[0];
  g.nodes = [atomic('tangent','vector3',{ index: literalInput('integer',[index]) })];
  g.outputs.out = { nodetype: 'output', type: 'vector3', node: 0, output: 'out' }; g.type = 'vector3';
  a.materials[0].extensions[K].bindings = { normal: { index: 0, output: 'out' } }; return a;
}
test('tangent frame can be generated with TEXCOORD_0', () => assert.deepEqual(validate(tangentAsset()), []));
test('missing tangent frame and TEXCOORD_0 is invalid', () => { const a = tangentAsset(); delete a.meshes[0].primitives[0].attributes.TEXCOORD_0; assert.ok(validate(a).some(e => e.includes('tangent-frame'))); });
test('reject nonzero tangent stream index', () => assert.ok(validate(tangentAsset(1)).some(e => e.includes('invalid geometry index'))));
test('reject unsupported geometry coordinate space', () => { const a = tangentAsset(); root(a).procedurals[0].nodes[0].inputs.space = literalInput('string','model'); assert.ok(validate(a).some(e => e.includes('invalid space mode'))); });
test('reject fallback texture index out of range', () => { const a = read('independent-channels'); a.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 100 }; assert.ok(validate(a).some(e => e.includes('fallback'))); });
test('reject out of range codec-extension image source', () => { const a = read('image-resource'); a.extensionsUsed.push('KHR_texture_basisu'); a.textures[0] = { extensions: { KHR_texture_basisu: { source: 100 } } }; assert.ok(validate(a).some(e => e.includes('texture/image'))); });

test('out of range implementation definition returns diagnostics without throwing', () => {
  const a = read('custom-definition'), impl = root(a).procedural_definitions[1];
  impl.nodedef = 999;
  impl.nodes = [structuredClone(root(a).procedurals[0].nodes[0])];
  impl.outputs.out = { nodetype: 'output', type: 'float', node: 0, output: 'out' };
  assert.ok(validate(a).some(e => e.includes('invalid nodedef')));
});

test('malformed animation extension returns diagnostics without throwing', () => {
  for (const pointer of [123, {}, null, undefined]) {
    const a = read('animated-interface');
    a.animations[0].channels[0].target.extensions.KHR_animation_pointer = { pointer };
    assert.ok(validate(a).some(e => e.includes('Invalid animation pointer extension')));
  }
});

test('root procedural object cannot be animated', () => {
  const a = read('animated-interface');
  a.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer = '/extensions/KHR_materials_procedural';
  assert.ok(validate(a).some(e => e.includes('Invalid procedural animation target')));
});
