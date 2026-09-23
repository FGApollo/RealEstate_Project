const { supabase } = require('../config/supabase');

const getSubscription = async (userId) => {
  const { data, error } = await supabase
    .from('seller_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

const startFreeTrial = async (userId, planName) => {
  if (planName !== 'FREE_TRIAL') {
    const error = new Error('Paid subscriptions require a verified payment flow');
    error.statusCode = 409;
    throw error;
  }

  const existing = await getSubscription(userId);
  if (existing) {
    const error = new Error('A subscription has already been started for this account');
    error.statusCode = 409;
    throw error;
  }

  const now = new Date();
  const startDate = now.toISOString();
  const endDateObj = new Date();
  endDateObj.setMonth(endDateObj.getMonth() + 1);
  const endDate = endDateObj.toISOString();

  const { data, error } = await supabase
    .from('seller_subscriptions')
    .insert([{
      user_id: userId,
      plan_name: 'FREE_TRIAL',
      price_vnd: 0,
      start_date: startDate,
      end_date: endDate,
      status: 'ACTIVE',
      created_at: startDate,
      updated_at: startDate
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

module.exports = {
  getSubscription,
  startFreeTrial
};
