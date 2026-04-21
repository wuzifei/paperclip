import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgres://paperclip:paperclip@127.0.0.1:54329/papercli'
});

(async () => {
  const client = await pool.connect();
  try {
    // Query issue WUY-30
    const r = await client.query("SELECT id, assigneeAgentId, originKind, originId, parentId, status FROM issues WHERE id = 'WUY-30'");
    console.log('Issue WUY-30:');
    console.log(JSON.stringify(r.rows[0], null, 2));

    // Query workflow instance
    const wi = await client.query("SELECT wi.id, wi.status, wi.templateId, wi.currentNodeId, wi.issueId FROM workflow_instances wi WHERE wi.issueId = 'WUY-30'");
    if (wi.rows.length > 0) {
      console.log('\nWorkflow Instance:');
      console.log(JSON.stringify(wi.rows[0], null, 2));

      // Query workflow template
      const wt = await client.query("SELECT * FROM workflow_templates WHERE id = '" + wi.rows[0].template_id + "'");
      if (wt.rows.length > 0) {
        console.log('\nWorkflow Template:');
        console.log(JSON.stringify(wt.rows[0], null, 2));

        // Query template nodes
        const nodes = await client.query("SELECT id, type, title, assigneeAgentId, assigneeRole FROM workflow_template_nodes WHERE template_id = '" + wi.rows[0].template_id + "' ORDER BY id");
        console.log('\nWorkflow Template Nodes:');
        nodes.rows.forEach((node, i) => {
          console.log('  Node ' + (i + 1) + ': ' + JSON.stringify(node, null, 2));
        });
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
})();
