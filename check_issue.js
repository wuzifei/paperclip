const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: 54329,
  user: 'paperclip',
  password: 'paperclip',
  database: 'papercli',
});

(async () => {
  const client = await pool.connect();
  try {
    // Query issue WUY-30
    const issueResult = await client.query("SELECT id, assigneeAgentId, originKind, originId, parentId, status FROM issues WHERE id = 'WUY-30'");
    console.log('Issue WUY-30:');
    console.log(JSON.stringify(issueResult.rows[0], null, 2));

    // Query workflow instance
    const workflowResult = await client.query("SELECT wi.id, wi.status, wi.templateId, wi.currentNodeId, wi.issueId, wt.name FROM workflow_instances wi LEFT JOIN workflow_templates wt ON wi.templateId = wt.id WHERE wi.issueId = 'WUY-30'");
    console.log('\nWorkflow Instance for WUY-30:');
    if (workflowResult.rows.length > 0) {
      console.log(JSON.stringify(workflowResult.rows[0], null, 2));

      // Query workflow template nodes
      const nodesResult = await client.query("SELECT id, type, title, assigneeAgentId, assigneeRole FROM workflow_template_nodes WHERE template_id = '" + workflowResult.rows[0].template_id + "' ORDER BY id");
      console.log('\nWorkflow Template Nodes:');
      nodesResult.rows.forEach((node, i) => {
        console.log('  Node ' + (i + 1) + ': ' + JSON.stringify(node, null, 2));
      });
    }
  } finally {
    await client.end();
  }
})();
