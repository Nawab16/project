const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePlan } = require('../server');

test('generatePlan returns a structured study schedule', async () => {
  const plan = await generatePlan({ subjects: 'Math, Biology', days: 3, focus: 'exam' });
  assert.equal(plan.summary.includes('exam'), true);
  assert.equal(plan.plan.length, 2);
  assert.equal(plan.plan[0].subject, 'Math');
});
