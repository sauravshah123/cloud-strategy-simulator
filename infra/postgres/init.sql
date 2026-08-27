-- Cloud Strategy Simulator — PostgreSQL Initialization
-- Run once on first database start

CREATE DATABASE cloudscale;

-- Extensions
\c cloudscale;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- The schema is managed by Spring JPA (ddl-auto=update)
-- This script creates the database and enables useful extensions.
