-- Initialize databases for the application
-- This script runs when PostgreSQL container starts for the first time

-- Create the clarity_ai database for the Flask application
CREATE DATABASE clarity_ai;

-- Create a user for the Flask application
CREATE USER clarity_user WITH ENCRYPTED PASSWORD 'clarity_password';
ALTER ROLE clarity_user SUPERUSER CREATEDB;

-- Grant privileges to the clarity_user on the clarity_ai database
GRANT ALL PRIVILEGES ON DATABASE clarity_ai TO clarity_user;

-- Connect to clarity_ai database and grant schema privileges
\c clarity_ai;
GRANT ALL ON SCHEMA public TO clarity_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO clarity_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO clarity_user;

-- Grant default privileges for future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO clarity_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO clarity_user;


-- Display created databases
\l
