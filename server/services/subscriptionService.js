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

const createOrUpdateSubscription = async (userId, planName, priceVnd, status, months = 1) => {
  const now = new Date();
  const startDate = now.toISOString();
  
  // Calculate end date based on duration
  const endDateObj = new Date();
  endDateObj.setMonth(endDateObj.getMonth() + months);
  const endDate = endDateObj.toISOString();

  // Check if subscription exists
  const existing = await getSubscription(userId);

  let result;
  if (existing) {
    const { data, error } = await supabase
      .from('seller_subscriptions')
      .update({
        plan_name: planName,
        price_vnd: priceVnd,
        start_date: startDate,
        end_date: endDate,
        status: status,
        updated_at: startDate
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    result = data;
  } else {
    const { data, error } = await supabase
      .from('seller_subscriptions')
      .insert([{
        user_id: userId,
        plan_name: planName,
        price_vnd: priceVnd,
        start_date: startDate,
        end_date: endDate,
        status: status,
        created_at: startDate,
        updated_at: startDate
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    result = data;
  }

  return result;
};

module.exports = {
  getSubscription,
  createOrUpdateSubscription
};
