-- Check all ENUM types in the database
SELECT typname, string_agg(enumlabel, ', ') as enum_values
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
GROUP BY typname;

-- Check for triggers on campaign_nodes table
SELECT 
    trigger_name, 
    action_statement,
    event_manipulation,
    event_object_schema,
    event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'campaign_nodes';
