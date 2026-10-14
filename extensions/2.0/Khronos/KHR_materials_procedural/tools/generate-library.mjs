// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
// Registry data is derived from Copyright Contributors to the MaterialX Project,
// licensed Apache-2.0 in the pinned official libraries below.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
const revision = 'f679db7875a928fd0162cd38bdc7461b2aa81c0f';
const sources = ['libraries/stdlib/stdlib_defs.mtlx', 'libraries/pbrlib/pbrlib_defs.mtlx'];
const sourceDigests = ['58a2f916adea0ad9b87eceab1af6d7bcf000f7e2d95dece0022b54c590395654', '04944c856715dd9f1463f4026aa8846d512b636f62c7ed2981b4c8e80d5078cb'];
const types = new Set(['boolean', 'integer', 'float', 'color3', 'color4', 'vector2', 'vector3', 'vector4', 'matrix33', 'matrix44', 'string', 'filename']);
const geometry = new Set(['texcoord', 'geomcolor', 'position', 'normal', 'tangent', 'bitangent']);
const excludedNodes = new Set(['geompropvalue', 'ambientocclusion', 'frame', 'time']);
const asArray = v => v === undefined ? [] : Array.isArray(v) ? v : [v];
const convertType = t => ({ matrix33: 'matrix3x3', matrix44: 'matrix4x4' })[t] ?? t;
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false });
function value(type, text) {
  if (['string', 'filename'].includes(type)) return text;
  if (type === 'boolean') return text === 'true';
  return text.split(',').map(s => Number(s.trim()));
}
const definitions = [], excluded = [], provenance = [];
for (const source of sources) {
  const url = `https://raw.githubusercontent.com/AcademySoftwareFoundation/MaterialX/${revision}/${source}`;
  const localDir = process.argv[2];
  let xml;
  if (localDir) xml = await fs.readFile(path.join(localDir, path.basename(source)), 'utf8');
  else { const response = await fetch(url); if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`); xml = await response.text(); }
  const digest = crypto.createHash('sha256').update(xml).digest('hex');
  if (digest !== sourceDigests[sources.indexOf(source)]) throw new Error(`Source does not match pinned MaterialX 1.39.0: ${source}`);
  provenance.push({ path: source, sha256: digest });
  for (const d of asArray(parser.parse(xml).materialx.nodedef)) {
    const inputs = asArray(d.input), outputs = asArray(d.output), ports = [...inputs, ...outputs];
    let reason;
    if (ports.some(p => !types.has(p.type))) reason = 'unsupported port type';
    else if (excludedNodes.has(d.node)) reason = 'excluded geometry/global/time access';
    else if (d.target || ports.some(p => p.target)) reason = 'target-specific definition';
    else if (ports.some(p => p.colorspace && p.colorspace !== 'lin_rec709')) reason = 'alternate color space';
    else if (d.version && d.isdefaultversion !== 'true') reason = 'nondefault node version';
    else if (d.node === 'texcoord' && outputs[0].type !== 'vector2') reason = 'glTF UV streams are VEC2';
    else if (d.node === 'geomcolor' && !['color3', 'color4', 'vector3', 'vector4'].includes(outputs[0].type)) reason = 'glTF vertex color requires color/vector';
    if (reason) { excluded.push({ name: d.name, node: d.node, reason }); continue; }
    const entry = { name: d.name, node: d.node, inputs: {}, outputs: {} };
    for (const p of inputs) {
      const input = { type: convertType(p.type) };
      if (p.value !== undefined) input.default = value(p.type, p.value);
      if (p.defaultgeomprop) input.geometricDefault = p.defaultgeomprop;
      if (p.uniform === 'true') input.uniform = true;
      if (p.enum && p.type === 'string') input.enum = p.enum.split(',').map(s => s.trim());
      // Numeric enumvalues describe UI choices, not necessarily a closed range.
      if (['space', 'fromspace', 'tospace'].includes(p.name) && (geometry.has(d.node) || ['transformpoint', 'transformvector', 'transformnormal'].includes(d.node))) input.enum = ['object', 'world'];
      if (p.name === 'framerange' && ['image', 'tiledimage'].includes(d.node)) input.enum = [''];
      entry.inputs[p.name] = input;
    }
    for (const p of outputs) entry.outputs[p.name] = convertType(p.type);
    definitions.push(entry);
  }
}
definitions.sort((a,b) => a.name.localeCompare(b.name, 'en'));
excluded.sort((a,b) => a.name.localeCompare(b.name, 'en'));
const result = { copyright: 'Copyright Contributors to the MaterialX Project; Copyright 2026 The Khronos Group Inc.', license: 'Apache-2.0', version: '1.39.0', revision, sources: provenance, definitions, excluded };
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), 'materialx-library.json');
// One definition per line keeps the generated registry compact and reviewable.
const header = { ...result }; delete header.definitions; delete header.excluded;
const json = JSON.stringify(header, null, 2).slice(0, -2) + ',\n  "definitions": [\n' + definitions.map(d => `    ${JSON.stringify(d)}`).join(',\n') + '\n  ],\n  "excluded": [\n' + excluded.map(d => `    ${JSON.stringify(d)}`).join(',\n') + '\n  ]\n}';
await fs.writeFile(output, json + '\n');
await fs.writeFile(output + '.license', 'Copyright Contributors to the MaterialX Project\nCopyright 2026 The Khronos Group Inc.\nSPDX-License-Identifier: Apache-2.0\n');
console.log(`Generated ${definitions.length} eligible definitions; ${excluded.length} excluded`);
