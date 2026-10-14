// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { directory, validate } from '../tools/validate.mjs';

const documents = [
  path.join(directory, 'README.md'),
  path.resolve(directory, '../../Vendor/EXT_materials_procedural_mx_1_39/README.md')
];
const ajv = new Ajv({ strict: false, strictNumbers: true, allErrors: true });
const schema = JSON.parse(fs.readFileSync(path.join(directory, 'schema/glTF.KHR_materials_procedural.schema.json'), 'utf8'));
ajv.addSchema(schema, 'root');
const graph = ajv.compile({ $ref: 'root#/definitions/nodegraph' });

for (const document of documents) {
  const text = fs.readFileSync(document, 'utf8');
  test(`normative JSON examples: ${path.relative(directory, document)}`, () => {
    const snippets = [...text.matchAll(/```json\r?\n([\s\S]*?)```/g)];
    assert.ok(snippets.length, 'document must include a JSON example');
    for (const [, code] of snippets) {
      const value = JSON.parse(code);
      if (value.asset) assert.deepEqual(validate(value), []);
      else if (value.nodetype === 'nodegraph') assert.ok(graph(value), ajv.errorsText(graph.errors));
      else assert.equal(value.path, 'pointer', 'the only other snippet is an animation target');
    }
  });
  test(`local specification links: ${path.relative(directory, document)}`, () => {
    for (const [, href] of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^[a-z]+:/i.test(href) || href.startsWith('#')) continue;
      const target = href.split('#')[0];
      assert.ok(fs.existsSync(path.resolve(path.dirname(document), target)), `missing target: ${href}`);
    }
  });
}
