const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { resolveSupabaseServerKey } = require('./supabaseKey');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required by the backend');
}

const supabase = createClient(supabaseUrl, resolveSupabaseServerKey());

module.exports = { supabase };
