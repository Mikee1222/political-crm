INSERT INTO role_permissions (role_name, permission_key, allowed) VALUES
('admin', 'ai_summary_view', true),
('manager', 'ai_summary_view', true),
('caller', 'ai_summary_view', false)
ON CONFLICT (role_name, permission_key) DO UPDATE SET allowed = EXCLUDED.allowed;
