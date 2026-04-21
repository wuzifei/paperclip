-- Workflow instances v2: single-issue model
-- Each pipeline run is now represented by ONE issue traveling through assignees.
ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES issues(id),
  ADD COLUMN IF NOT EXISTS current_node_id text;
