const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    nodes: { type: [mongoose.Schema.Types.Mixed], required: true },
    edges: { type: [mongoose.Schema.Types.Mixed], required: true },
    preview: { triggerType: String, nodeCount: Number, highlights: [String] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Template', templateSchema);
