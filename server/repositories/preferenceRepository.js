const { supabase } = require('../config/supabase');

const getByUserId = async (userId) => {
  const { data, error } = await supabase.from('user_preferences').select('*')
    .eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const upsertForUser = async (userId, fields) => {
  const { data, error } = await supabase.from('user_preferences')
    .upsert({ user_id: userId, ...fields, onboarding_completed: true, updated_at: new Date().toISOString() }, {
      onConflict: 'user_id'
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
};

module.exports = { getByUserId, upsertForUser };
