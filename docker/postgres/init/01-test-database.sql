-- Runs once, when the local volume is first created.
-- API integration tests use their own database so they never touch development data.
CREATE DATABASE hms_test OWNER hms;
