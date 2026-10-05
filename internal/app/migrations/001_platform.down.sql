DROP TABLE IF EXISTS verification_challenges, attachments, audit_events, point_applications, points, questionnaire_answers, questionnaire_sessions;
ALTER TABLE questionnaire_scenarios DROP CONSTRAINT current_version_fk;
DROP TABLE questionnaire_versions, questionnaire_scenarios, organizations, auth_sessions, users;
DROP FUNCTION protect_published_version();
DELETE FROM schema_migrations WHERE name='001_platform.up.sql';
