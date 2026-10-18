const { supabase } = require('../config/supabase');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Helper to save base64 attachments if needed
const saveChatAttachment = async (attachment) => {
  if (!attachment || !attachment.url) return attachment;
  const base64Str = attachment.url;
  if (typeof base64Str !== 'string' || !base64Str.startsWith('data:image/')) {
    return attachment;
  }
  try {
    const matches = base64Str.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return attachment;
    
    const ext = matches[1].replace('jpeg', 'jpg');
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `chat_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    
    const uploadDir = path.join(__dirname, '../../public/uploads/chat');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, filename), buffer);
    return {
      ...attachment,
      url: `/uploads/chat/${filename}`
    };
  } catch (err) {
    console.error('Failed to save chat attachment locally:', err);
    return attachment;
  }
};

const getMessages = async (userId, otherId, limit = 50) => {
  const numLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  // Fetch latest messages between userId and otherId up to numLimit
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id, sender_id, receiver_id, message, attachments, is_read, created_at, property_id,
      property:properties(id, title, price, thumbnail, area, property_type, address, status)
    `)
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: false })
    .limit(numLimit);

  if (error) {
    throw new Error(error.message);
  }
  // Reverse to chronological order (oldest to newest for chat UI)
  return (data || []).reverse();
};

const sendMessage = async (senderId, receiverId, propertyId, message, rawAttachments = []) => {
  // F33: Only attach property_id when explicitly sent (e.g. from PropertyDetailModal CTA or property card picker)
  const effectivePropertyId = propertyId ? Number(propertyId) : null;

  // F35: Process attachments if provided
  let processedAttachments = [];
  if (Array.isArray(rawAttachments) && rawAttachments.length > 0) {
    processedAttachments = await Promise.all(rawAttachments.map(saveChatAttachment));
  }

  const { data, error } = await supabase
    .from('messages')
    .insert([{
      sender_id: senderId,
      receiver_id: receiverId,
      property_id: effectivePropertyId,
      message,
      attachments: processedAttachments,
      is_read: false
    }])
    .select(`
      *,
      property:properties(id, title, price, thumbnail, area, property_type, address, status)
    `)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // F37: Auto-create lead in agent_user_funnel if conversation involves an AGENT
  try {
    const { data: users } = await supabase
      .from('users')
      .select('id, role')
      .in('id', [senderId, receiverId]);

    const senderObj = users?.find(u => u.id === senderId);
    const receiverObj = users?.find(u => u.id === receiverId);

    let agentId = null;
    let customerId = null;

    if (senderObj?.role === 'AGENT' && receiverObj?.role === 'USER') {
      agentId = senderId;
      customerId = receiverId;
    } else if (receiverObj?.role === 'AGENT' && senderObj?.role === 'USER') {
      agentId = receiverId;
      customerId = senderId;
    }

    if (agentId && customerId) {
      const { data: existingFunnel } = await supabase
        .from('agent_user_funnel')
        .select('id')
        .eq('agent_id', agentId)
        .eq('user_id', customerId)
        .maybeSingle();

      if (!existingFunnel) {
        await supabase.from('agent_user_funnel').insert({
          agent_id: agentId,
          user_id: customerId,
          funnel_stage: 'AWARENESS',
          updated_at: new Date()
        });
      }
    }
  } catch (funnelError) {
    console.error('Auto funnel error (non-blocking):', funnelError.message);
  }

  return data;
};

const markMessagesAsRead = async (userId, partnerId) => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('messages')
    .update({ is_read: true, read_at: now })
    .eq('receiver_id', userId)
    .eq('sender_id', partnerId)
    .eq('is_read', false)
    .select('id');

  if (error) {
    throw new Error(error.message);
  }
  return { updatedCount: data?.length || 0, readAt: now };
};

const getConversations = async (userId) => {
  // 1. Fetch lightweight recent messages involving the user (skip large base64 attachments/full joins)
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, message, is_read, created_at, property_id')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(300);

  if (msgError) {
    throw new Error(msgError.message);
  }

  // 2. Extract unique other user IDs, latest message, active property ID and unread counts
  const uniquePartnersMap = new Map();
  const unreadCountMap = new Map();
  const partnerPropertyIdMap = new Map();

  (messages || []).forEach(msg => {
    const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    if (!uniquePartnersMap.has(partnerId)) {
      uniquePartnersMap.set(partnerId, msg);
    }

    // Count unread incoming messages
    if (msg.receiver_id === userId && !msg.is_read) {
      unreadCountMap.set(partnerId, (unreadCountMap.get(partnerId) || 0) + 1);
    }

    // Preserve latest referenced property id for context
    if (msg.property_id && !partnerPropertyIdMap.has(partnerId)) {
      partnerPropertyIdMap.set(partnerId, msg.property_id);
    }
  });

  const partnerIds = Array.from(uniquePartnersMap.keys());
  if (partnerIds.length === 0) return [];

  // 3. Concurrently fetch partner profiles and only the active property headers
  const activePropertyIds = Array.from(new Set(Array.from(partnerPropertyIdMap.values()))).filter(Boolean);

  const [partnersResult, propertiesResult, funnelsResult] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, email, avatar, role, phone, verification_status')
      .in('id', partnerIds),
    activePropertyIds.length > 0
      ? supabase
          .from('properties')
          .select('id, title, price, thumbnail, area, property_type, address, status')
          .in('id', activePropertyIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('agent_user_funnel')
      .select('user_id, funnel_stage')
      .eq('agent_id', userId)
      .in('user_id', partnerIds)
  ]);

  if (partnersResult.error) {
    throw new Error(partnersResult.error.message);
  }

  const propertyMap = new Map();
  if (propertiesResult.data) {
    propertiesResult.data.forEach(p => propertyMap.set(p.id, p));
  }

  const funnelMap = new Map();
  if (!funnelsResult.error && funnelsResult.data) {
    funnelsResult.data.forEach(f => funnelMap.set(f.user_id, f.funnel_stage));
  }

  // 4. Combine into final lightweight conversation list
  return partnersResult.data.map(partner => {
    const lastMsg = uniquePartnersMap.get(partner.id);
    const propId = partnerPropertyIdMap.get(partner.id);
    return {
      partner,
      lastMessage: lastMsg.message,
      lastMessageTime: lastMsg.created_at,
      lastSenderId: lastMsg.sender_id,
      isRead: lastMsg.is_read,
      unreadCount: unreadCountMap.get(partner.id) || 0,
      property: propId ? propertyMap.get(propId) || null : null,
      funnelStage: funnelMap.get(partner.id) || 'AWARENESS'
    };
  }).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
};

const updateFunnelStage = async (agentId, userId, stage) => {
  if (!['AWARENESS', 'CONSIDERATION', 'INTENT', 'ACTION'].includes(stage)) {
    const error = new Error('Invalid funnel stage');
    error.statusCode = 400;
    throw error;
  }

  const { data: messages, error: relationshipError } = await supabase
    .from('messages')
    .select('id')
    .or(`and(sender_id.eq.${agentId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${agentId})`)
    .limit(1);

  if (relationshipError) throw new Error(relationshipError.message);
  if (!messages?.length) {
    const error = new Error('Customer is not in this agent conversation');
    error.statusCode = 403;
    throw error;
  }

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
  markMessagesAsRead,
  getConversations,
  updateFunnelStage,
  getFunnelStats
};
