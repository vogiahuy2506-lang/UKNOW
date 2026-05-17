-- Check ALL tables that have a 'node_type' column
SELECT 
    table_name, 
    column_name, 
    data_type, 
    udt_name
FROM information_schema.columns 
WHERE column_name = 'node_type';
