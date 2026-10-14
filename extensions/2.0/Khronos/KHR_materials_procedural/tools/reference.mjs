// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
// Deterministic fixture evaluator, not a general MaterialX renderer.
export function evaluate(graph, overrides = {}, geometry = {}) {
  const values = new Map();
  const input = p => 'value' in p ? p.value : 'input' in p ? (overrides[p.input] ?? graph.inputs[p.input].value) : node(p.node)[p.output];
  function node(index) {
    if (values.has(index)) return values.get(index);
    const n = graph.nodes[index], p = Object.fromEntries(Object.entries(n.inputs ?? {}).map(([k, v]) => [k, input(v)]));
    let out;
    const binary = fn => p.in1.map((v, i) => fn(v, p.in2[i]));
    switch (n.nodetype) {
      case 'constant': out = p.value; break;
      case 'add': out = binary((a, b) => a + b); break;
      case 'multiply': out = binary((a, b) => a * b); break;
      case 'modulo': out = binary((a, b) => a - b * Math.floor(a / b)); break;
      case 'floor': out = p.in.map(Math.floor); break;
      case 'extract': out = [p.in[p.index[0]]]; break;
      case 'texcoord': out = geometry[`TEXCOORD_${p.index?.[0] ?? 0}`]; if (!out) throw new Error('Missing reference geometry stream'); break;
      default: throw new Error(`Unsupported reference operator ${n.nodetype}`);
    }
    const result = { out }; values.set(index, result); return result;
  }
  return Object.fromEntries(Object.entries(graph.outputs).map(([key, p]) => [key, input(p)]));
}
