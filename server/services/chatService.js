const { supabase } = require('../config/supabase');
const { positiveId, boundedInteger, text, badRequest } = require('./businessValidation');
const { savePublicImage } = require('./publicImageStorage');
const plusService = require('./plusService');

const getMessages = async (userId, otherId, { limit, offset } = {}) => {
  userId = positiveId(userId, 'userId');
  otherId = positiveId(otherId, 'otherId');
  const pageLimit = boundedInteger(limit, 200, 1, 200);
  const pageOffset = boundedInteger(offset, 0, 0, 100000);
  // Fetch messages between userId and otherId
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id, sender_id, receiver_id, message, attachments, is_read, created_at, property_id,
      property:properties(id, title, price, thumbnail, area, property_type, address, status)
    `)
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(pageOffset, pageOffset + pageLimit - 1);

  if (error) {
    throw new Error(error.message);
  }
  return (data || []).reverse();
};

const sendMessage = async (senderId, receiverId, propertyId, message, rawAttachments = []) => {
  senderId = positiveId(senderId, 'senderId');
  receiverId = positiveId(receiverId, 'receiverId');
  if (!Array.isArray(rawAttachments) || rawAttachments.length > 5) throw badRequest('Tối đa 5 ảnh mỗi tin nhắn.');
  message = text(message, 'message', 2000, { required: rawAttachments.length === 0 });
  const attachments = rawAttachments.map((attachment) => {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)
      || typeof attachment.url !== 'string'
      || !/^data:image\/(?:jpeg|jpg|png|webp);base64,/.test(attachment.url)) {
      throw badRequest('Ảnh đính kèm phải có định dạng JPG, PNG hoặc WEBP.');
    }
    return { url: attachment.url, name: text(attachment.name, 'attachment name', 255) };
  });
  if (senderId === receiverId) throw badRequest('Bạn không thể tự gửi tin nhắn cho chính mình');
  const { data: receiver, error: receiverError } = await supabase.from('users')
    .select('id, role, is_active, is_official').eq('id', receiverId).maybeSingle();
  if (receiverError) throw new Error(receiverError.message);
  if (!receiver || receiver.is_active !== true) {
    throw Object.assign(badRequest('Không tìm thấy người nhận đang hoạt động.'), { statusCode: 404 });
  }
  // Chỉ được mở cuộc trò chuyện mới với môi giới. Người không phải môi giới (người dùng, admin) chỉ nhận tin
  // từ người mà họ đã nhắn trước, để không ai nhắn rác hay dò thông tin của tài khoản bất kỳ.
  if (String(receiver.role).toUpperCase() !== 'AGENT') {
    const { data: priorContact, error: priorError } = await supabase.from('messages')
      .select('id').eq('sender_id', receiverId).eq('receiver_id', senderId).limit(1);
    if (priorError) throw new Error(priorError.message);
    if (!priorContact?.length) {
      throw Object.assign(badRequest('Bạn chỉ có thể trả lời người đã nhắn tin cho bạn.'), { statusCode: 403 });
    }
  }
  // Nhắn tin cho tài khoản chính thức của Swipe Nest là quyền lợi của gói Plus.
  if (receiver.is_official === true) await plusService.assertPlusForOfficialContact(senderId);
  if (propertyId !== undefined && propertyId !== null) {
    propertyId = positiveId(propertyId, 'propertyId');
    const { data: property, error: propertyError } = await supabase.from('properties')
      .select('id, owner_id, status, is_hidden').eq('id', propertyId).maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    if (!property || property.is_hidden === true || !['AVAILABLE', 'SOLD', 'RENTED'].includes(property.status)
      || ![senderId, receiverId].includes(Number(property.owner_id))) {
      throw Object.assign(badRequest('Không thể đính kèm tin đăng này.'), { statusCode: 404 });
    }
  }
  // Preserve explicit property context; validate recipients and ownership before saving attachments.
  const processedAttachments = [];
  for (const attachment of attachments) {
    processedAttachments.push({ name: attachment.name, url: await savePublicImage(attachment.url, 'chat', senderId) });
  }
  const { data, error } = await supabase
    .from('messages')
    .insert([{
      sender_id: senderId,
      receiver_id: receiverId,
      property_id: propertyId ?? null,
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
  userId = positiveId(userId, 'userId');
  partnerId = positiveId(partnerId, 'partnerId');
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
  userId = positiveId(userId, 'userId');
  // Fetch lightweight recent messages involving the user.
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
    // Tin tự gửi cho chính mình (dữ liệu cũ, trước khi server chặn) không phải một cuộc trò chuyện.
    if (partnerId === userId) return;
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
      .select('id, name, avatar, role, phone, verification_status, is_official')
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

  // 4. Combine into final lightweight conversation list.
  // Không lộ email; số điện thoại chỉ hiện khi đối phương là môi giới (số liên hệ công việc).
  return partnersResult.data.map(({ phone, ...rest }) => {
    const partner = String(rest.role).toUpperCase() === 'AGENT' ? { ...rest, phone } : rest;
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
      // Phễu khách hàng chỉ áp dụng cho người dùng (USER), không áp dụng cho môi giới khác hay admin.
      funnelStage: isCustomer(partner) ? funnelMap.get(partner.id) || 'AWARENESS' : null
    };
  }).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
};

const isCustomer = (user) => String(user?.role || '').toUpperCase() === 'USER';

// Mọi khách hàng (USER) đã từng nhắn tin qua lại với môi giới này.
const listCustomerPartnerIds = async (agentId) => {
  const partnerIds = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${agentId},receiver_id.eq.${agentId}`)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    (data || []).forEach((msg) => {
      const partnerId = msg.sender_id === agentId ? msg.receiver_id : msg.sender_id;
      if (partnerId !== agentId) partnerIds.add(partnerId);
    });
    if (!data || data.length < PAGE) break;
  }
  if (partnerIds.size === 0) return [];
  const { data: users, error } = await supabase.from('users').select('id, role').in('id', [...partnerIds]);
  if (error) throw new Error(error.message);
  return (users || []).filter(isCustomer).map((user) => user.id);
};

const updateFunnelStage = async (agentId, userId, stage) => {
  agentId = positiveId(agentId, 'agentId');
  userId = positiveId(userId, 'userId');
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
  const { data: customer, error: customerError } = await supabase.from('users').select('id, role').eq('id', userId).maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!isCustomer(customer)) {
    const error = new Error('Chỉ gán phễu cho khách hàng, không gán cho môi giới hay quản trị viên.');
    error.statusCode = 400;
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

// Đếm giống hệt danh sách chat: mỗi khách hàng đã nhắn tin được tính một lần, khách chưa được gán
// (chưa có dòng trong agent_user_funnel) thì tính là "Nhận biết".
const getFunnelStats = async (agentId) => {
  agentId = positiveId(agentId, 'agentId');
  const customerIds = await listCustomerPartnerIds(agentId);
  const stageByCustomer = new Map();
  if (customerIds.length > 0) {
    const { data: rows, error } = await supabase
      .from('agent_user_funnel')
      .select('user_id, funnel_stage')
      .eq('agent_id', agentId)
      .in('user_id', customerIds);
    if (error) throw new Error(error.message);
    (rows || []).forEach((row) => stageByCustomer.set(row.user_id, row.funnel_stage));
  }
  const data = customerIds.map((id) => ({ funnel_stage: stageByCustomer.get(id) || 'AWARENESS' }));

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
