const { supabase } = require('../config/supabase');

const getMessages = async (userId, otherId) => {
  // Fetch messages between userId and otherId
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      property:properties(id, title, price, thumbnail, area)
    `)
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

const sendMessage = async (senderId, receiverId, propertyId, message) => {
  const { data, error } = await supabase
    .from('messages')
    .insert([{
      sender_id: senderId,
      receiver_id: receiverId,
      property_id: propertyId || null,
      message
    }])
    .select(`
      *,
      property:properties(id, title, price, thumbnail, area)
    `)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

const getConversations = async (userId) => {
  // 1. Fetch all messages involving the user
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (msgError) {
    throw new Error(msgError.message);
  }

  // 2. Extract unique other user IDs and their latest message
  const uniquePartnersMap = new Map();
  messages.forEach(msg => {
    const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    if (!uniquePartnersMap.has(partnerId)) {
      uniquePartnersMap.set(partnerId, msg);
    }
  });

  const partnerIds = Array.from(uniquePartnersMap.keys());
  if (partnerIds.length === 0) return [];

  // 3. Fetch details of all conversation partners
  const { data: partners, error: partnersError } = await supabase
    .from('users')
    .select('id, name, email, avatar, role, phone')
    .in('id', partnerIds);

  if (partnersError) {
    throw new Error(partnersError.message);
  }

  // 4. Fetch funnel stages if any
  const { data: funnels, error: funnelError } = await supabase
    .from('agent_user_funnel')
    .select('user_id, funnel_stage')
    .eq('agent_id', userId)
    .in('user_id', partnerIds);

  const funnelMap = new Map();
  if (!funnelError && funnels) {
    funnels.forEach(f => funnelMap.set(f.user_id, f.funnel_stage));
  }

  // 5. Combine data
  return partners.map(partner => {
    const lastMsg = uniquePartnersMap.get(partner.id);
    return {
      partner,
      lastMessage: lastMsg.message,
      lastMessageTime: lastMsg.created_at,
      lastSenderId: lastMsg.sender_id,
      funnelStage: funnelMap.get(partner.id) || 'AWARENESS' // Default to AWARENESS stage
    };
  }).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
};

const updateFunnelStage = async (agentId, userId, stage) => {
  const { data, error } = await supabase
    .from('agent_user_funnel')
    .upsert({
      agent_id: agentId,
      user_id: userId,
      funnel_stage: stage,
      updated_at: new Date()
    }, {
      onConflict: 'agent_id,user_id'
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

const getFunnelStats = async (agentId) => {
  // Fetch funnel statistics for the agent
  const { data, error } = await supabase
    .from('agent_user_funnel')
    .select('funnel_stage')
    .eq('agent_id', agentId);

  if (error) {
    throw new Error(error.message);
  }

  // Count by stage
  const counts = {
    AWARENESS: 0,
    CONSIDERATION: 0,
    INTENT: 0,
    ACTION: 0
  };

  if (data) {
    data.forEach(item => {
      if (counts[item.funnel_stage] !== undefined) {
        counts[item.funnel_stage]++;
      }
    });
  }

  return counts;
};

module.exports = {
  getMessages,
  sendMessage,
  getConversations,
  updateFunnelStage,
  getFunnelStats
};
