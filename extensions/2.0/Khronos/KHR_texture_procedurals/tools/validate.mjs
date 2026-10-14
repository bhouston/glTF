// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
export const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KHR = 'KHR_texture_procedurals', MX = 'EXT_texture_procedurals_mx_1_39';
const channels = { baseColor: 'color3', metallic: 'float', roughness: 'float', opacity: 'float', normal: 'vector3', occlusion: 'float', emissive: 'color3' };
function schemaValidator(ctor, dir, entry) {
  const ajv = new ctor({ strict: false, allErrors: true });
  addFormats(ajv);
  // The core schema uses IRI references; resource resolution is outside this tool.
  ajv.addFormat('iri-reference', true);
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const schema = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    ajv.addSchema(schema, name);
  }
  return ajv.getSchema(entry);
}
let validators;
export function validate(asset) {
  validators ??= [schemaValidator(Ajv2020, path.resolve(directory, '../../../../specification/2.0/schema'), 'glTF.schema.json'), schemaValidator(Ajv, path.join(directory, 'schema'), 'material.KHR_texture_procedurals_schema.json')];
  const errors = [];
  for (const check of validators) if (!check(asset)) errors.push(...check.errors.map(e => `${e.instancePath}: ${e.message}`));
  if (errors.length) return errors;
  const fail = message => errors.push(message);
  const root = asset.extensions?.[KHR];
  if (!root) return errors;
  const used = asset.extensionsUsed ?? [], required = asset.extensionsRequired ?? [];
  if (!used.includes(KHR) || !used.includes(MX)) fail('Both procedural extension identifiers must be used');
  if (used.some(id => id.startsWith('EXT_texture_procedurals_mx_') && id !== MX)) fail('Only MaterialX 1.39 is supported');
  if (required.includes(KHR) !== required.includes(MX)) fail('Both procedural identifiers must be required together');
  for (const id of required) if (!used.includes(id)) fail('Required extension missing from extensionsUsed');
  const defs = root.procedural_definitions ?? [];
  const implementations = new Map();
  defs.forEach((d, i) => {
    if (d.nodetype === 'nodegraph') {
      if (defs[d.nodedef]?.nodetype !== 'nodedef') fail(`Definition ${i}: invalid nodedef`);
      if (implementations.has(d.nodedef)) fail('Duplicate functional implementation');
      implementations.set(d.nodedef, d);
    }
  });
  const standard = new Set(['constant', 'add', 'subtract', 'multiply', 'divide', 'floor', 'modulo', 'mix', 'extract', 'texcoord', 'geomcolor', 'image']);
  defs.forEach((d, i) => { if (d.nodetype === 'nodedef') { if (!implementations.has(i)) fail(`Definition ${i}: missing implementation`); if (standard.has(d.node)) fail('Custom definition overrides standard operator'); } });
  const dependencies = defs.map(() => []);
  function graphCheck(g, label, inputs = g.inputs ?? {}) {
    const edges = g.nodes.map(() => []);
    const source = (p, context, owner) => {
      if ('texture' in p) {
        const texture = asset.textures?.[p.texture];
        if (!texture || !asset.images?.[texture.source]) fail(`${context}: invalid texture/image resource`);
        if (p.type !== 'filename') fail(`${context}: texture source requires filename`);
      }
      if ('input' in p && inputs[p.input]?.type !== p.type) fail(`${context}: interface input type/reference mismatch`);
      if ('node' in p) {
        if (g.nodes[p.node]?.outputs?.[p.output]?.type !== p.type) fail(`${context}: node output type/reference mismatch`);
        if (owner !== undefined) edges[owner].push(p.node);
      }
    };
    Object.entries(g.outputs).forEach(([name, p]) => source(p, `${label}/${name}`));
    Object.entries(g.inputs ?? {}).forEach(([name, p]) => source(p, `${label}/inputs/${name}`));
    const outTypes = Object.values(g.outputs).map(p => p.type);
    if (g.type !== (outTypes.length === 1 ? outTypes[0] : 'multioutput')) fail(`${label}: graph type mismatch`);
    g.nodes.forEach((n, i) => {
      const ctx = `${label}/nodes/${i}`;
      const outputs = Object.values(n.outputs);
      if (n.type !== (outputs.length === 1 ? outputs[0].type : 'multioutput')) fail(`${ctx}: node type mismatch`);
      Object.entries(n.inputs ?? {}).forEach(([name, p]) => source(p, `${ctx}/${name}`, i));
      if (n.nodedef !== undefined) {
        const d = defs[n.nodedef];
        if (d?.nodetype !== 'nodedef' || d.node !== n.nodetype) { fail(`${ctx}: custom nodedef mismatch`); return; }
        if (Object.keys(n.outputs).length !== Object.keys(d.outputs).length || Object.entries(n.outputs).some(([name, p]) => p.type !== d.outputs[name]?.type)) fail(`${ctx}: custom outputs mismatch`);
        for (const [name, p] of Object.entries(n.inputs ?? {})) if (d.inputs?.[name]?.type !== p.type) fail(`${ctx}: custom input mismatch`);
        for (const [name, p] of Object.entries(d.inputs ?? {})) if (p.type === 'filename' && !n.inputs?.[name]) fail(`${ctx}: filename default must be overridden`);
        if (g.nodedef !== undefined) dependencies[g.nodedef].push(n.nodedef);
      } else checkStandard(n, ctx, fail);
      if (['texcoord', 'geomcolor'].includes(n.nodetype)) {
        const idx = n.inputs?.index?.value?.[0] ?? 0;
        const semantic = `${n.nodetype === 'texcoord' ? 'TEXCOORD' : 'COLOR'}_${idx}`;
        // A material-only asset has no geometry context to check.
        for (const mesh of asset.meshes ?? []) for (const primitive of mesh.primitives) {
          if (!(semantic in primitive.attributes)) fail(`${ctx}: missing geometry stream ${semantic}`);
          else if (n.nodetype === 'texcoord' && asset.accessors[primitive.attributes[semantic]]?.type !== 'VEC2') fail(`${ctx}: texcoord stream must be VEC2`);
        }
      }
    });
    cycleCheck(edges, `${label}: cyclic node graph`, fail);
  }
  root.procedurals.forEach((g, i) => graphCheck(g, `procedurals/${i}`));
  defs.forEach((g, i) => { if (g.nodetype === 'nodegraph') graphCheck(g, `definitions/${i}`, defs[g.nodedef]?.inputs ?? {}); });
  cycleCheck(dependencies, 'Recursive custom definitions', fail);
  for (const [i, m] of (asset.materials ?? []).entries()) for (const [name, b] of Object.entries(m.extensions?.[KHR]?.bindings ?? {})) {
    if (root.procedurals[b.index]?.outputs?.[b.output]?.type !== channels[name]) fail(`material/${i}/${name}: channel type/reference mismatch`);
    if (m.extensions?.KHR_materials_unlit && !['baseColor', 'opacity'].includes(name)) fail('Unlit material uses lit channel');
  }
  for (const animation of asset.animations ?? []) for (const channel of animation.channels) {
    const pointer = channel.target.extensions?.KHR_animation_pointer?.pointer;
    if (!pointer?.startsWith(`/extensions/${KHR}/`)) continue;
    if (!used.includes('KHR_animation_pointer')) fail('Animation pointer extension undeclared');
    const match = pointer.match(/^\/extensions\/KHR_texture_procedurals\/procedurals\/(0|[1-9][0-9]*)\/inputs\/([^/]+)\/value$/);
    if (!match) { fail('Invalid procedural animation target'); continue; }
    const name = match[2].replace(/~1/g, '/').replace(/~0/g, '~');
    const p = root.procedurals[Number(match[1])]?.inputs?.[name];
    const types = { float: 'SCALAR', vector2: 'VEC2', vector3: 'VEC3', color3: 'VEC3', vector4: 'VEC4', color4: 'VEC4' };
    const s = animation.samplers[channel.sampler], output = asset.accessors?.[s?.output], input = asset.accessors?.[s?.input];
    if (!p || !('value' in p) || !types[p.type] || output?.type !== types[p.type] || output?.componentType !== 5126) fail('Animation accessor/target type mismatch');
    if (output?.count !== input?.count * (s?.interpolation === 'CUBICSPLINE' ? 3 : 1)) fail('Animation key count mismatch');
  }
  return errors;
}
function cycleCheck(edges, message, fail) {
  const active = new Set(), done = new Set();
  function visit(i) { if (active.has(i)) { fail(message); return; } if (done.has(i)) return; active.add(i); for (const j of edges[i] ?? []) visit(j); active.delete(i); done.add(i); }
  edges.forEach((_, i) => visit(i));
}
function checkStandard(n, context, fail) {
  // Deliberately limited signature checks; this is not the full MaterialX library validator.
  const names = { constant: ['value'], add: ['in1', 'in2'], subtract: ['in1', 'in2'], multiply: ['in1', 'in2'], divide: ['in1', 'in2'], modulo: ['in1', 'in2'], floor: ['in'], mix: ['fg', 'bg', 'mix'], extract: ['in', 'index'], texcoord: ['index'], geomcolor: ['index'], image: ['file', 'texcoord'] };
  if (!names[n.nodetype]) return;
  if (Object.keys(n.outputs).join() !== 'out') fail(`${context}: standard output must be out`);
  for (const key of Object.keys(n.inputs ?? {})) if (!names[n.nodetype].includes(key) && n.nodetype !== 'image') fail(`${context}: unknown standard input ${key}`);
  for (const [key, p] of Object.entries(n.inputs ?? {})) {
    const expected = key === 'index' ? 'integer' : key === 'file' ? 'filename' : key === 'texcoord' ? 'vector2' : key === 'mix' ? 'float' : key === 'in' && n.nodetype === 'extract' ? null : n.type;
    if (expected && p.type !== expected) fail(`${context}: standard input ${key} type mismatch`);
  }
  if (n.nodetype === 'texcoord' && n.type !== 'vector2') fail(`${context}: texcoord must output vector2`);
  if (n.nodetype === 'extract' && n.type !== 'float') fail(`${context}: extract must output float`);
  if (n.nodetype === 'image' && !n.inputs?.texcoord) fail(`${context}: geometric image default must be explicit`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let files = process.argv.slice(2);
  if (files.includes('examples/*.gltf')) files = fs.readdirSync(path.join(directory, 'examples')).filter(n => n.endsWith('.gltf')).map(n => path.join(directory, 'examples', n));
  for (const file of files) { const errors = validate(JSON.parse(fs.readFileSync(file, 'utf8'))); console.log(`${file}: ${errors.length ? errors.join('; ') : 'valid'}`); if (errors.length) process.exitCode = 1; }
}
