// Builders for workflow definitions used across tests.
const node = (id, type, config = {}, label) => ({ id, type, position: { x: 0, y: 0 }, data: { label: label || id, config } });
const edge = (source, target, sourceHandle) => ({ id: `${source}-${target}-${sourceHandle || 'o'}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) });
module.exports = { node, edge };
