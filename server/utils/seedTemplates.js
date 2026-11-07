const Template = require('../models/Template');
const definitions = require('./templates');

async function seedTemplates() {
  for (const t of definitions) {
    const trigger = t.nodes.find((x) => x.type.endsWith('Trigger'));
    await Template.updateOne(
      { slug: t.slug },
      { $set: { ...t, preview: { triggerType: trigger.type, nodeCount: t.nodes.length, highlights: t.nodes.map((x) => x.data.label) } } },
      { upsert: true }
    );
  }
  return definitions.length;
}

if (require.main === module) {
  const mongoose = require('mongoose');
  const env = require('../config/env');
  mongoose.connect(env.mongoUri).then(seedTemplates).then((c) => { console.log(`Seeded ${c} templates`); return mongoose.disconnect(); }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seedTemplates };
