-- Migration: Add campaign node type enum values
-- This migration adds support for AI-generated node types in campaign builder

-- Drop existing type if exists and recreate with all values
DO $$ BEGIN
    DROP TYPE IF EXISTS campaign_node_type;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE TYPE campaign_node_type AS ENUM (
    'trigger',
    'action',
    'logic',
    'condition',
    'send_email',
    'send_zalo_personal',
    'send_zalo_group',
    'send_zalo_friend_request',
    'delay',
    'wait',
    'end',
    'zns',
    'sms',
    'data',
    'filter',
    'branch',
    'split'
);

-- Add NOT NULL constraint and default value to campaign_nodes table
ALTER TABLE campaign_nodes 
    ALTER COLUMN node_type TYPE campaign_node_type USING node_type::campaign_node_type,
    ALTER COLUMN node_type SET DEFAULT 'action';

-- Also update campaign_node_runs table if it exists
DO $$ BEGIN
    ALTER TABLE campaign_node_runs 
        ALTER COLUMN node_type TYPE campaign_node_type USING node_type::campaign_node_type;
EXCEPTION
    WHEN undefined_column THEN null;
END $$;
