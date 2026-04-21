const pg = require('@paperclipai/embedded-postgres');

const pool = new pg.Pool({
  connectionString: 'postgres://paperclip:paperclip@127.0.0.1:54329/papercli'
});

(async () => {
  const client = await pool.connect();
  try {
    const r = await client.query('SELECT id, assigneeAgentId, originKind, originId, parentId, status FROM issues WHERE id = \'WUY-30\'');
    console.log('Issue WUY-30:');
    console.log(JSON.stringify(r.rows[0], null, 2));

    const wi = await client.query('SELECT wi.id, wi.status, wi.templateId, wi.currentNodeId, wi.issueId FROM workflow_instances wi WHERE wi.issueId = \'WUY-30\'');
    if (wi.rows.length > 0) {
      console.log('\nWorkflow Instance:');
      console.log(JSON.stringify(wi.rows[0], null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
})();
