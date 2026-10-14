// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { visit } from 'jsonc-parser';
import { materialBindings } from './material-bindings.mjs';
export const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KHR = 'KHR_materials_procedural', MX = 'EXT_materials_procedural_mx_1_39';
const channels = Object.fromEntries(Object.entries(materialBindings).map(([name, binding]) => [name, binding.type]));
const library = JSON.parse(fs.readFileSync(path.join(directory, 'tools/materialx-library.json'), 'utf8'));
const geometry = new Set(['texcoord', 'geomcolor', 'position', 'normal', 'tangent', 'bitangent']);
const spatial = new Set([...geometry, 'image', 'tiledimage', 'triplanarprojection']);
function schemaValidator(ctor, dir, entry) {
  const ajv = new ctor({ strict: false, strictNumbers: true, allErrors: true });
  addFormats(ajv);
  // The core schema uses IRI references; resource resolution is outside this tool.
  ajv.addFormat('iri-reference', true);
  const dirs = [dir];
  if (dir.includes('EXT_materials_procedural_mx_1_39')) dirs.push(path.join(directory, 'schema'));
  for (const schemaDir of dirs) for (const name of fs.readdirSync(schemaDir).filter(n => n.endsWith('.json'))) {
    const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8'));
    const uri = pathToFileURL(path.join(schemaDir, name)).href;
    schema.$id = uri;
    ajv.addSchema(schema, uri);
  }
  return ajv.getSchema(pathToFileURL(path.join(dir, entry)).href);
}
let validators;
export function parseAsset(text) {
  const errors = [], objects = [];
  visit(text, {
    onObjectBegin: () => objects.push(new Set()),
    onObjectProperty: name => { const names = objects.at(-1); if (names.has(name)) errors.push(`Duplicate JSON property: ${name}`); names.add(name); },
    onObjectEnd: () => objects.pop(),
    onLiteralValue: value => { if (typeof value === 'number' && !Number.isFinite(value)) errors.push('Nonfinite JSON number'); },
    onError: error => errors.push(`Invalid JSON: ${error}`)
  }, { disallowComments: true, allowTrailingComma: false });
  if (errors.length) throw new Error(errors.join('; '));
  return JSON.parse(text);
}
export function validate(asset) {
  validators ??= [schemaValidator(Ajv2020, path.resolve(directory, '../../../../specification/2.0/schema'), 'glTF.schema.json'), schemaValidator(Ajv, path.join(directory, 'schema'), 'material.KHR_materials_procedural_schema.json'), schemaValidator(Ajv, path.resolve(directory, '../../Vendor/EXT_materials_procedural_mx_1_39/schema'), 'material.EXT_materials_procedural_mx_1_39_schema.json')];
  const errors = [];
  for (const check of validators) if (!check(asset)) errors.push(...check.errors.map(e => `${e.instancePath}: ${e.message}`));
  if (errors.length) return errors;
  const fail = message => errors.push(message);
  function checkLocations(value, location = []) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && value.extensions?.[KHR] && !(location.length === 0 || (location.length === 2 && location[0] === 'materials' && Number.isInteger(location[1])))) fail(`Procedural payload at invalid location /${location.join('/')}`);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'extras') continue;
      if (key === 'extensions') {
        // Foreign extension payloads are opaque application-defined objects.
        if (child?.[KHR]) checkLocations(child[KHR], [...location, key, KHR]);
      } else checkLocations(child, [...location, Array.isArray(value) ? Number(key) : key]);
    }
  }
  checkLocations(asset);
  const root = asset.extensions?.[KHR];
  if (!root) return errors;
  const used = asset.extensionsUsed ?? [], required = asset.extensionsRequired ?? [];
  if (!used.includes(KHR) || !used.includes(MX)) fail('Both procedural extension identifiers must be used');
  if (used.some(id => id.startsWith('EXT_materials_procedural_mx_') && id !== MX)) fail('Only MaterialX 1.39 is supported');
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
  const standard = new Set(library.definitions.map(d => d.node));
  const customDefaults = new Set();
  defs.forEach(d => { if (d.nodetype === 'nodedef' && d.defaultVersion) { if (customDefaults.has(d.node)) fail(`Multiple default versions for ${d.node}`); customDefaults.add(d.node); } });
  defs.forEach((d, i) => { if (d.nodetype === 'nodedef') { if (!implementations.has(i)) fail(`Definition ${i}: missing implementation`); if (standard.has(d.node)) fail('Custom definition overrides standard operator'); } });
  const dependencies = defs.map(() => []);
  const selected = new WeakMap();
  function textureCheck(index, context) {
    const texture = asset.textures?.[index];
    if (!texture) { fail(`${context}: invalid texture index`); return; }
    const sources = [];
    if (texture.source !== undefined) sources.push(texture.source);
    for (const codec of ['KHR_texture_basisu', 'EXT_texture_webp', 'EXT_texture_avif']) if (texture.extensions?.[codec]) {
      if (!used.includes(codec)) fail(`${context}: codec extension not declared`);
      sources.push(texture.extensions[codec].source);
    }
    if (!sources.length || sources.some(source => !asset.images?.[source])) fail(`${context}: invalid texture/image resource`);
  }
  function materialTextureCheck(material) {
    const pbr = material.pbrMetallicRoughness;
    // Only core texture-info properties are known here. Other extensions
    // validate their own payloads, which must remain opaque to this tool.
    for (const [name, info] of [
      ['baseColorTexture', pbr?.baseColorTexture],
      ['metallicRoughnessTexture', pbr?.metallicRoughnessTexture],
      ['normalTexture', material.normalTexture],
      ['occlusionTexture', material.occlusionTexture],
      ['emissiveTexture', material.emissiveTexture]
    ]) if (info && 'index' in info) textureCheck(info.index, `material/${name}`);
  }
  (asset.materials ?? []).forEach(materialTextureCheck);
  const rootEnvironment = g => Object.fromEntries(Object.entries(g.inputs ?? {}).map(([name, p]) => [name, { p, g, env: {} }]));
  const customEnvironment = (n, g, env) => Object.fromEntries(Object.entries(defs[n.nodedef]?.inputs ?? {}).map(([name, p]) => [name, { p: n.inputs?.[name] ?? p, g, env }]));
  function literal(p, g, env, seen = new Set()) {
    if (!p) return undefined;
    if ('value' in p) return p.value;
    if ('input' in p) { const c = env[p.input]; return c ? literal(c.p, c.g, c.env, seen) : undefined; }
    if ('node' in p) {
      const n = g.nodes[p.node]; if (!n || seen.has(n)) return undefined;
      const next = new Set(seen).add(n);
      if (n.nodetype === 'constant') return literal(n.inputs?.value ?? { value: selected.get(n)?.inputs.value?.default }, g, env, next);
      if (n.nodedef !== undefined) { const impl = implementations.get(n.nodedef); return impl ? literal(impl.outputs[p.output], impl, customEnvironment(n, g, env), next) : undefined; }
      const values = Object.fromEntries(Object.entries(n.inputs ?? {}).map(([name, input]) => [name, literal(input, g, env, next)]));
      if (['add', 'subtract', 'multiply', 'divide', 'modulo'].includes(n.nodetype) && Array.isArray(values.in1) && Array.isArray(values.in2)) return values.in1.map((v,i) => ({ add: () => v + values.in2[i], subtract: () => v - values.in2[i], multiply: () => v * values.in2[i], divide: () => v / values.in2[i], modulo: () => v - values.in2[i] * Math.floor(v / values.in2[i]) })[n.nodetype]());
      if (n.nodetype === 'floor' && Array.isArray(values.in)) return values.in.map(Math.floor);
      if (n.nodetype === 'convert' && Array.isArray(values.in)) return n.type === 'integer' ? values.in.map(Math.trunc) : values.in;
      if (n.nodetype === 'dot') return values.in ?? selected.get(n)?.inputs.in?.default;
    }
    return undefined;
  }
  function uniform(p, g, env, seen = new Set()) {
    if (!p || 'value' in p || 'texture' in p) return true;
    if ('input' in p) { const c = env[p.input]; return c ? uniform(c.p, c.g, c.env, seen) : false; }
    const n = g.nodes[p.node]; if (!n || seen.has(n) || spatial.has(n.nodetype)) return false;
    const next = new Set(seen).add(n);
    if (n.nodedef !== undefined) { const impl = implementations.get(n.nodedef); return !!impl && uniform(impl.outputs[p.output], impl, customEnvironment(n, g, env), next); }
    return Object.values(n.inputs ?? {}).every(p => uniform(p, g, env, next));
  }
  function checkContext(n, g, env, label) {
    const def = selected.get(n); if (!def) return;
    for (const [name, spec] of Object.entries(def.inputs)) {
      const p = n.inputs?.[name] ?? { value: spec.default };
      if (spec.uniform && !uniform(p, g, env)) fail(`${label}: ${name} requires a uniform source`);
      const value = literal(p, g, env);
      if (spec.enum && value !== undefined && !spec.enum.some(v => JSON.stringify(v) === JSON.stringify(value))) fail(`${label}: invalid ${name} mode`);
      if (['texcoord', 'geomcolor', 'tangent', 'bitangent'].includes(n.nodetype) && name === 'index' && value !== undefined && (!Number.isInteger(value[0]) || value[0] < 0 || (['tangent','bitangent'].includes(n.nodetype) && value[0] !== 0))) fail(`${label}: invalid geometry index`);
    }
  }
  function graphCheck(g, label, inputs = g.inputs ?? {}) {
    const edges = g.nodes.map(() => []);
    const source = (p, context, owner) => {
      if ('texture' in p) {
        textureCheck(p.texture, context);
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
        if (g.nodedef !== undefined) dependencies[g.nodedef]?.push(n.nodedef);
      } else { const def = checkStandard(n, ctx, fail); if (def) selected.set(n, def); }
    });
    cycleCheck(edges, `${label}: cyclic node graph`, fail);
  }
  root.procedurals.forEach((g, i) => graphCheck(g, `procedurals/${i}`));
  defs.forEach((g, i) => { if (g.nodetype === 'nodegraph') {
    const def = defs[g.nodedef];
    if (def?.outputs && (Object.keys(g.outputs).length !== Object.keys(def.outputs).length || Object.entries(g.outputs).some(([name,p]) => p.type !== def.outputs[name]?.type))) fail(`definitions/${i}: implementation outputs mismatch`);
    graphCheck(g, `definitions/${i}`, def?.inputs ?? {});
  } });
  cycleCheck(dependencies, 'Recursive custom definitions', fail);
  // Do not evaluate contexts after invalid references or cyclic definitions.
  if (errors.length) return errors;
  // Validate uniform/enum constraints in root contexts, including custom instances.
  function contextVisit(g, env, primitive, outputs = Object.values(g.outputs), seen = new Set()) {
    function visit(p) {
      if ('input' in p) { const c = env[p.input]; if (c && 'node' in c.p) contextVisit(c.g, c.env, primitive, [c.p], seen); return; }
      if (!('node' in p)) return;
      const n = g.nodes[p.node]; if (!n || seen.has(n)) return;
      const next = new Set(seen).add(n);
      checkContext(n, g, env, n.nodetype);
      if (n.nodedef !== undefined) {
        const impl = implementations.get(n.nodedef);
        if (impl?.outputs[p.output]) contextVisit(impl, customEnvironment(n, g, env), primitive, [impl.outputs[p.output]], next);
      }
      if (primitive && geometry.has(n.nodetype)) {
        const def = selected.get(n), idx = literal(n.inputs?.index ?? { value: def?.inputs.index?.default ?? [0] }, g, env)?.[0];
        let semantic, type;
        if (n.nodetype === 'texcoord' || n.nodetype === 'geomcolor') {
          if (!Number.isInteger(idx) || idx < 0) { fail(`Unsupported validation: ${n.nodetype} stream index is not statically resolvable`); return; }
          semantic = `${n.nodetype === 'texcoord' ? 'TEXCOORD' : 'COLOR'}_${idx}`;
          type = n.nodetype === 'texcoord' ? ['VEC2'] : ['VEC3', 'VEC4'];
        } else { semantic = n.nodetype === 'position' ? 'POSITION' : n.nodetype === 'normal' ? 'NORMAL' : 'TANGENT'; type = semantic === 'TANGENT' ? ['VEC4'] : ['VEC3']; }
        let accessor = asset.accessors?.[primitive.attributes[semantic]];
        if (semantic === 'TANGENT' && primitive.attributes.NORMAL === undefined) accessor = undefined;
        if (!accessor && semantic === 'TANGENT') {
          const uv = asset.accessors?.[primitive.attributes.TEXCOORD_0];
          if (!uv || uv.type !== 'VEC2') fail(`${n.nodetype}: missing TEXCOORD_0 for tangent-frame generation`);
        }
        else if (!accessor && semantic === 'NORMAL') {
          if (![4,5,6].includes(primitive.mode ?? 4)) fail('Unsupported validation: generated normals for nontriangle primitive');
        }
        else if (!accessor) fail(`${n.nodetype}: missing geometry stream ${semantic}`);
        else if (!type.includes(accessor.type)) fail(`${n.nodetype}: invalid stream type ${semantic}`);
      }
      for (const input of Object.values(n.inputs ?? {})) contextVisit(g, env, primitive, [input], next);
    }
    outputs.forEach(visit);
  }
  root.procedurals.forEach(g => {
    const env = rootEnvironment(g);
    g.nodes.forEach((n, i) => contextVisit(g, env, null, [{ node: i, output: Object.keys(n.outputs)[0] }]));
  });
  for (const [i, m] of (asset.materials ?? []).entries()) for (const [name, b] of Object.entries(m.extensions?.[KHR]?.bindings ?? {})) {
    if (m.extensions?.KHR_materials_pbrSpecularGlossiness) fail('Procedural materials cannot use KHR_materials_pbrSpecularGlossiness');
    if (root.procedurals[b.index]?.outputs?.[b.output]?.type !== channels[name]) fail(`material/${i}/${name}: channel type/reference mismatch`);
    if (m.extensions?.KHR_materials_unlit && !['baseColor', 'opacity'].includes(name)) fail('Unlit material uses lit channel');
    const g = root.procedurals[b.index];
    const descriptor = materialBindings[name];
    if (descriptor?.owner) {
      const owner = descriptor.owner;
      if (!Object.hasOwn(m.extensions ?? {}, owner)) fail(`material/${i}/${name}: missing owning extension ${owner}`);
      if (!used.includes(owner)) fail(`material/${i}/${name}: owning extension ${owner} missing from extensionsUsed`);
      if (owner === 'KHR_materials_dispersion' && !m.extensions?.KHR_materials_volume) fail(`material/${i}/${name}: dispersion requires KHR_materials_volume`);
      if (owner === 'KHR_materials_dispersion' && !used.includes('KHR_materials_volume')) fail(`material/${i}/${name}: volume dependency missing from extensionsUsed`);
      if (name === 'ior' && m.extensions?.KHR_materials_ior?.ior === 0) fail(`material/${i}/ior: cannot bind immutable zero-IOR compatibility mode`);
      const port = g?.outputs[b.output];
      if (port) {
        const env = rootEnvironment(g);
        const requiresUniform = descriptor.uniform || (descriptor.uniformWhen && Object.hasOwn(m.extensions ?? {}, descriptor.uniformWhen));
        if (requiresUniform && !uniform(port, g, env)) fail(`material/${i}/${name}: homogeneous-medium property requires a uniform output`);
        const value = literal(port, g, env);
        if (Array.isArray(value)) {
          if (value.some(v => !Number.isFinite(v) || (descriptor.min !== undefined && (descriptor.exclusiveMin ? v <= descriptor.min : v < descriptor.min)) || (descriptor.max !== undefined && v > descriptor.max))) fail(`material/${i}/${name}: value outside binding domain`);
          if (descriptor.nonzero && value.every(v => v === 0)) fail(`material/${i}/${name}: direction or normal must be nonzero`);
        }
      }
    }
    if (g?.outputs[b.output]) for (const mesh of asset.meshes ?? []) for (const primitive of mesh.primitives) if (primitive.material === i) contextVisit(g, rootEnvironment(g), primitive, [g.outputs[b.output]]);
  }
  const animationTargets = new WeakMap();
  for (const animation of asset.animations ?? []) for (const channel of animation.channels) {
    const pointerExtension = channel.target.extensions?.KHR_animation_pointer;
    if (pointerExtension === undefined) continue;
    const pointer = pointerExtension?.pointer;
    if (typeof pointer !== 'string') { fail('Invalid animation pointer extension object'); continue; }
    if (pointer !== `/extensions/${KHR}` && !pointer.startsWith(`/extensions/${KHR}/`)) continue;
    if (!animationTargets.has(animation)) animationTargets.set(animation, new Set());
    const targets = animationTargets.get(animation);
    if (targets.has(pointer)) fail('Duplicate procedural animation target');
    targets.add(pointer);
    if (channel.target.path !== 'pointer' || channel.target.node !== undefined) fail('Invalid animation pointer target object');
    if (!used.includes('KHR_animation_pointer')) fail('Animation pointer extension undeclared');
    const match = pointer.match(/^\/extensions\/KHR_materials_procedural\/procedurals\/(0|[1-9][0-9]*)\/inputs\/([^/]+)\/value$/);
    if (!match || /~(?![01])/.test(match[2])) { fail('Invalid procedural animation target'); continue; }
    const name = match[2].replace(/~1/g, '/').replace(/~0/g, '~');
    const p = root.procedurals[Number(match[1])]?.inputs?.[name];
    const types = { float: 'SCALAR', vector2: 'VEC2', vector3: 'VEC3', color3: 'VEC3', vector4: 'VEC4', color4: 'VEC4' };
    const s = animation.samplers[channel.sampler], output = asset.accessors?.[s?.output], input = asset.accessors?.[s?.input];
    if (input?.type !== 'SCALAR' || input?.componentType !== 5126 || !input?.min || !input?.max) fail('Invalid animation time accessor');
    if (!p || !('value' in p) || !types[p.type] || output?.type !== types[p.type]) fail('Animation accessor/target type mismatch');
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
  const candidates = library.definitions.filter(d => d.node === n.nodetype && Object.keys(d.outputs).length === Object.keys(n.outputs).length && Object.entries(n.outputs).every(([name,p]) => d.outputs[name] === p.type) && Object.entries(n.inputs ?? {}).every(([name,p]) => d.inputs[name]?.type === p.type));
  if (candidates.length !== 1) { fail(`${context}: unknown, excluded, or ambiguous MaterialX signature`); return; }
  const def = candidates[0];
  for (const [name, p] of Object.entries(def.inputs)) {
    if (!n.inputs?.[name] && (p.geometricDefault || p.type === 'filename' || !Object.hasOwn(p, 'default'))) fail(`${context}: required explicit input ${name}`);
  }
  return def;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let files = process.argv.slice(2);
  if (files.includes('examples/*.gltf')) files = fs.readdirSync(path.join(directory, 'examples')).filter(n => n.endsWith('.gltf')).map(n => path.join(directory, 'examples', n));
  for (const file of files) {
    try { const errors = validate(parseAsset(fs.readFileSync(file, 'utf8'))); console.log(`${file}: ${errors.length ? errors.join('; ') : 'valid'}`); if (errors.length) process.exitCode = 1; }
    catch (error) { console.error(`${file}: ${error.message}`); process.exitCode = 1; }
  }
}
