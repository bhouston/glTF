// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import { directory, validate } from '../tools/validate.mjs';
const KHR = 'KHR_materials_procedural';
const MX = 'EXT_materials_procedural_mx_1_39';
const read = () => JSON.parse(fs.readFileSync(path.join(directory, 'examples/independent-channels.gltf'), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
for (const name of fs.readdirSync(path.join(directory, 'schema')).filter(name => name.endsWith('.json'))) {
  const uri = pathToFileURL(path.join(directory, 'schema', name)).href;
  ajv.addSchema({ ...JSON.parse(fs.readFileSync(path.join(directory, 'schema', name), 'utf8')), $id: uri }, uri);
}
const overlay = ajv.getSchema(pathToFileURL(path.join(directory, 'schema/material.KHR_materials_procedural_schema.json')).href);
const data = { extensions: { [KHR]: { arbitrary: 'application data' }, [MX]: { hello: 'data' } } };
for (const [name, attach] of [
  ['asset extras', asset => { asset.asset.extras = structuredClone(data); }],
  ['graph extras', asset => { asset.extensions[KHR].procedurals[0].extras = structuredClone(data); }],
  ['unknown root extension', asset => { asset.extensionsUsed.push('VENDOR_opaque'); asset.extensions.VENDOR_opaque = structuredClone(data); }],
  ['unknown graph extension', asset => { asset.extensionsUsed.push('VENDOR_opaque'); asset.extensions[KHR].procedurals[0].extensions = { VENDOR_opaque: structuredClone(data) }; }],
]) {
  test(`overlay preserves opaque ${name}`, () => { const asset = read(); attach(asset); assert.equal(overlay(asset), true, JSON.stringify(overlay.errors)); });
  test(`validate API preserves opaque ${name}`, () => { const asset = read(); attach(asset); assert.deepEqual(validate(asset), []); });
}
for (const [name, slot] of [
  ['root', asset => asset],
  ['asset', asset => asset.asset],
  ['material', asset => asset.materials[0]],
  ['primitive', asset => asset.meshes[0].primitives[0]],
  ['graph', asset => asset.extensions[KHR].procedurals[0]],
  ['node', asset => asset.extensions[KHR].procedurals[0].nodes[0]],
  ['input port', asset => asset.extensions[KHR].procedurals[0].nodes[0].inputs.value],
  ['output port', asset => asset.extensions[KHR].procedurals[0].nodes[0].outputs.out],
]) test(`overlay rejects companion payload at real ${name} slot`, () => {
  const asset = read(), target = slot(asset); target.extensions ??= {}; target.extensions[MX] = {};
  assert.equal(overlay(asset), false);
  assert.ok(validate(asset).length);
});
for (const [name, slot] of [
  ['root', asset => asset],
  ['material', asset => asset.materials[0]],
  ['root procedural', asset => asset.extensions[KHR]],
  ['material procedural', asset => asset.materials[0].extensions[KHR]],
  ['binding', asset => asset.materials[0].extensions[KHR].bindings.metallic],
  ['graph', asset => asset.extensions[KHR].procedurals[0]],
  ['node', asset => asset.extensions[KHR].procedurals[0].nodes[0]],
  ['input port', asset => asset.extensions[KHR].procedurals[0].nodes[0].inputs.value],
  ['output port', asset => asset.extensions[KHR].procedurals[0].nodes[0].outputs.out],
]) test(`overlay requires object extension payload on ${name}`, () => {
  const asset = read(), target = slot(asset); target.extensions ??= {}; target.extensions.VENDOR_test = 7;
  assert.equal(overlay(asset), false);
  assert.ok(validate(asset).length);
});
test('procedural metallic-roughness bindings reject specular-glossiness on same material', () => {
  const asset = read(); asset.extensionsUsed.push('KHR_materials_pbrSpecularGlossiness');
  asset.materials[0].extensions.KHR_materials_pbrSpecularGlossiness = {};
  assert.equal(overlay(asset), false);
  assert.ok(validate(asset).length);
});

for (const name of ['extras', 'extensions']) {
  test(`graph input named ${name} is a port descriptor, not metadata`, () => {
    const asset = read(), graph = asset.extensions[KHR].procedurals[0];
    graph.inputs = { [name]: { nodetype: 'input', type: 'float', value: [0] } };
    assert.deepEqual(validate(asset), []);
    graph.inputs[name].extensions = { [KHR]: { arbitrary: 'invalid placement' } };
    assert.equal(overlay(asset), false);
    assert.ok(validate(asset).length);
  });
  test(`graph output named ${name} is a port descriptor, not metadata`, () => {
    const asset = read(), graph = asset.extensions[KHR].procedurals[0];
    graph.outputs[name] = structuredClone(graph.outputs.metal);
    assert.deepEqual(validate(asset), []);
    graph.outputs[name].extensions = { [KHR]: { arbitrary: 'invalid placement' } };
    assert.equal(overlay(asset), false);
    assert.ok(validate(asset).length);
  });
}
