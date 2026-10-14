// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import { validate, directory } from '../tools/validate.mjs';
import { evaluate } from '../tools/reference.mjs';
import { materialBindings } from '../tools/material-bindings.mjs';
const K = 'KHR_materials_procedural';
const read = () => JSON.parse(fs.readFileSync(path.join(directory, 'examples/material-extensions.gltf'), 'utf8'));
const graph = asset => asset.extensions[K].procedurals[0];
const extensionChannels = Object.entries(materialBindings).filter(([, d]) => d.owner);
const ajv = new Ajv({ strict: false, allErrors: true });
for (const name of fs.readdirSync(path.join(directory, 'schema')).filter(n => n.endsWith('.json'))) {
  const uri = pathToFileURL(path.join(directory, 'schema', name)).href;
  ajv.addSchema({ ...JSON.parse(fs.readFileSync(path.join(directory, 'schema', name), 'utf8')), $id: uri }, uri);
}
const overlay = ajv.getSchema(pathToFileURL(path.join(directory, 'schema/material.KHR_materials_procedural_schema.json')).href);
function only(name) {
  const asset = read(), owner = materialBindings[name].owner;
  const keep = [owner, ...((owner === 'KHR_materials_volume' || name === 'dispersion') ? ['KHR_materials_transmission'] : []), ...(name === 'dispersion' ? ['KHR_materials_volume'] : [])];
  asset.materials[0].extensions = { ...Object.fromEntries(keep.map(o => [o, {}])),
    [K]: { bindings: { [name]: { index: 0, output: name } } } };
  asset.extensionsUsed = asset.extensionsUsed.filter(o => o === K || o.startsWith('EXT_') || keep.includes(o));
  return asset;
}
for (const [name, descriptor] of extensionChannels) {
  test(`${name}: owning default object and its dependencies activate binding`, () => {
    const asset = only(name); assert.deepEqual(validate(asset), []);
    assert.equal(overlay(asset), true, JSON.stringify(overlay.errors));
  });
  test(`${name}: rejects missing owner object`, () => {
    const asset = only(name); delete asset.materials[0].extensions[descriptor.owner];
    assert.ok(validate(asset).length);
    assert.equal(overlay(asset), false);
  });
  test(`${name}: rejects undeclared owner`, () => {
    const asset = only(name); asset.extensionsUsed = asset.extensionsUsed.filter(o => o !== descriptor.owner);
    assert.ok(validate(asset).length);
    assert.equal(overlay(asset), false);
  });
  test(`${name}: rejects wrong graph output type`, () => {
    const asset = only(name), type = descriptor.type === 'float' ? 'color3' : 'float';
    graph(asset).inputs[name] = { nodetype: 'input', type, value: type === 'float' ? [1] : [1,1,1] };
    graph(asset).outputs[name].type = type;
    assert.ok(validate(asset).some(e => e.includes('channel type/reference mismatch')));
  });
  if (descriptor.min !== undefined) test(`${name}: enforces lower domain bound`, () => {
    const asset = only(name); graph(asset).inputs[name].value.fill(descriptor.min - 0.1);
    assert.ok(validate(asset).some(e => e.includes('outside binding domain')));
    if (!descriptor.exclusiveMin) { graph(asset).inputs[name].value.fill(descriptor.min); assert.deepEqual(validate(asset), []); }
  });
  if (descriptor.max !== undefined) test(`${name}: enforces upper domain bound`, () => {
    const asset = only(name); graph(asset).inputs[name].value.fill(descriptor.max + 0.1);
    assert.ok(validate(asset).some(e => e.includes('outside binding domain')));
    graph(asset).inputs[name].value.fill(descriptor.max); assert.deepEqual(validate(asset), []);
  });
  if (descriptor.nonzero) test(`${name}: rejects zero vector`, () => {
    const asset = only(name); graph(asset).inputs[name].value.fill(0);
    assert.ok(validate(asset).some(e => e.includes('must be nonzero')));
  });
}
test('dispersion requires volume object and declaration', () => {
  for (const remove of [a => { delete a.materials[0].extensions.KHR_materials_volume; },
    a => { a.extensionsUsed = a.extensionsUsed.filter(n => n !== 'KHR_materials_volume'); }]) {
    const asset = only('dispersion'); remove(asset);
    assert.ok(validate(asset).some(e => e.includes('volume')));
  }
});
test('IOR binding cannot override immutable native zero compatibility mode', () => {
  const asset = only('ior'); asset.materials[0].extensions.KHR_materials_ior.ior = 0;
  assert.ok(validate(asset).length); assert.equal(overlay(asset), false);
});
test('specular color preserves HDR components until ordinary Fresnel calculation', () => {
  const asset = only('specularColor'); assert.deepEqual(validate(asset), []);
  assert.deepEqual(evaluate(graph(asset)).specularColor, [2,1,0.5]);
});
test('resolved iridescence thickness ignores native interpolation endpoints', () => {
  const asset = only('iridescenceThickness');
  asset.materials[0].extensions.KHR_materials_iridescence = { iridescenceThicknessMinimum: 800, iridescenceThicknessMaximum: 100 };
  assert.deepEqual(validate(asset), []); assert.deepEqual(evaluate(graph(asset)).iridescenceThickness, [250]);
  asset.materials[0].extensions[K].bindings = { emissive: { index: 0, output: 'emissive' } };
  assert.deepEqual(validate(asset), []); // Unbound owner's reversed interval remains permitted.
});
test('attenuation distance excludes zero', () => {
  const asset = only('attenuationDistance'); graph(asset).inputs.attenuationDistance.value = [0];
  assert.ok(validate(asset).some(e => e.includes('outside binding domain')));
});

function varyingScalar(asset, name) {
  const g = graph(asset);
  g.nodes = [
    { nodetype: 'texcoord', type: 'vector2', inputs: { index: { nodetype: 'input', type: 'integer', value: [0] } }, outputs: { out: { nodetype: 'output', type: 'vector2' } } },
    { nodetype: 'extract', type: 'float', inputs: { in: { nodetype: 'input', type: 'vector2', node: 0, output: 'out' }, index: { nodetype: 'input', type: 'integer', value: [0] } }, outputs: { out: { nodetype: 'output', type: 'float' } } },
    { nodetype: 'add', type: 'float', inputs: { in1: { nodetype: 'input', type: 'float', node: 1, output: 'out' }, in2: { nodetype: 'input', type: 'float', value: [1.5] } }, outputs: { out: { nodetype: 'output', type: 'float' } } }
  ];
  g.outputs[name] = { nodetype: 'output', type: 'float', node: 2, output: 'out' };
}

test('dispersion remains uniform in the homogeneous medium', () => {
  const asset = only('dispersion'); varyingScalar(asset, 'dispersion');
  assert.ok(validate(asset).some(e => e.includes('requires a uniform output')));
});

test('IOR may vary on a surface but is uniform when volume is present', () => {
  const asset = only('ior'); varyingScalar(asset, 'ior');
  assert.deepEqual(validate(asset), []);
  asset.materials[0].extensions.KHR_materials_volume = {};
  asset.materials[0].extensions.KHR_materials_transmission = {};
  asset.extensionsUsed.push('KHR_materials_volume', 'KHR_materials_transmission');
  assert.ok(validate(asset).some(e => e.includes('requires a uniform output')));
});
for (const name of ['attenuationDistance', 'attenuationColor']) for (const custom of [false, true]) {
  test(`${name}: homogeneous medium rejects ${custom ? 'custom-wrapped' : 'direct'} geometry`, () => {
    const asset = only(name), g = graph(asset), type = materialBindings[name].type;
    const uv = { nodetype: 'texcoord', type: 'vector2', inputs: { index: { nodetype: 'input', type: 'integer', value: [0] } },
      outputs: { out: { nodetype: 'output', type: 'vector2' } } };
    const convert = { nodetype: type === 'float' ? 'extract' : 'convert', type,
      inputs: { in: { nodetype: 'input', type: 'vector2', node: 0, output: 'out' },
        ...(type === 'float' ? { index: { nodetype: 'input', type: 'integer', value: [0] } } : {}) },
      outputs: { out: { nodetype: 'output', type } } };
    g.nodes = [uv, convert]; g.outputs[name] = { nodetype: 'output', type, node: 1, output: 'out' };
    if (custom) {
      const outputs = { out: { nodetype: 'output', type } };
      asset.extensions[K].procedural_definitions = [
        { nodetype: 'nodedef', node: 'medium_geometry', inputs: {}, outputs },
        { nodetype: 'nodegraph', nodedef: 0, type, nodes: g.nodes,
          outputs: { out: g.outputs[name] } }
      ];
      g.nodes = [{ nodetype: 'medium_geometry', nodedef: 0, type, outputs }];
      g.outputs[name] = { nodetype: 'output', type, node: 0, output: 'out' };
    }
    const errors = validate(asset);
    assert.ok(errors.some(e => e.includes('requires a uniform output')));
    assert.ok(!errors.some(e => e.includes('signature')), errors.join('\n'));
  });
}
test('example provides all extension channels, optional owners and explicit tangent frame', () => {
  const asset = read(); assert.equal(extensionChannels.length, 19); assert.deepEqual(validate(asset), []);
  assert.equal(overlay(asset), true, JSON.stringify(overlay.errors));
  const owners = [...new Set(extensionChannels.map(([, d]) => d.owner))]; assert.equal(owners.length, 10);
  for (const owner of owners) { assert.deepEqual(asset.materials[0].extensions[owner], {}); assert.ok(asset.extensionsUsed.includes(owner)); assert.ok(!asset.extensionsRequired.includes(owner)); }
  const attributes = asset.meshes[0].primitives[0].attributes;
  for (const stream of ['NORMAL', 'TANGENT', 'TEXCOORD_0']) assert.ok(Number.isInteger(attributes[stream]));
  const outputs = evaluate(graph(asset));
  // CPU arithmetic checks the specified composition order; this is not a renderer test.
  const emitted = outputs.emissive.map(v => v * outputs.emissiveStrength[0]);
  emitted.forEach((v, i) => assert.ok(Math.abs(v - [0.3,0.6,0.9][i]) < 1e-12));
  const distance = 0.2, attenuation = outputs.attenuationColor.map(v => v ** (distance / outputs.attenuationDistance[0]));
  assert.deepEqual(attenuation, [0.25,0.5625,1]);
  assert.deepEqual(outputs.anisotropyDirection, [0,1]); assert.deepEqual(outputs.iridescenceThickness, [250]);
});
