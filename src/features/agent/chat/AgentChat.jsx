import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Phone, Shield, User, Sparkles, MessageCircle, Image as ImageIcon, X, Loader2, Building2 } from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { apiFetch } from '../../../auth/apiClient';
import { supabaseClient, isSupabaseRealtimeConfigured } from '../../../services/supabaseClient';
import ImageLoadingSkeleton from '../../../components/ImageLoadingSkeleton';
import PropertyDetailModal from '../../../components/PropertyDetailModal';
import './AgentChat.css';

const FUNNEL_STAGES = [
  { key: 'AWARENESS', label: 'Nhận biết & Quan tâm', color: '#6366f1', bg: '#e0e7ff' },
  { key: 'CONSIDERATION', label: 'Cân nhắc', color: '#f59e0b', bg: '#fef3c7' },
  { key: 'INTENT', label: 'Ý định / Thương lượng', color: '#2563eb', bg: '#dbeafe' },
  { key: 'ACTION', label: 'Hành động / Chốt', color: '#10b981', bg: '#d1fae5' }
];

const AgentChat = ({ currentUser }) => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [viewingPropertyModal, setViewingPropertyModal] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [sendError, setSendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const [showPropertySelector, setShowPropertySelector] = useState(false);
  const [agentProperties, setAgentProperties] = useState([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  const openPropertySelector = async () => {
    setShowPropertySelector(true);
    setIsLoadingProperties(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/properties`);
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.properties || []).filter(
          p => p.owner_id === currentUser.id && p.status === 'AVAILABLE'
        );
        setAgentProperties(filtered);
      }
    } catch (err) {
      console.error('Error fetching agent properties:', err);
    } finally {
      setIsLoadingProperties(false);
    }
  };

  const sendPropertyCard = async (property) => {
    if (!currentUser || !activeConversation?.partner?.id) return;
    setShowPropertySelector(false);

    const tempId = `temp_prop_${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: activeConversation.partner.id,
      property_id: property.id,
      property: property,
      message: `[Bất động sản] ${property.title}`,
      attachments: [],
      is_read: false,
      created_at: new Date().toISOString(),
      is_optimistic: true
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: activeConversation.partner.id,
          propertyId: property.id,
          message: `[Bất động sản] ${property.title}`
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => {
          if (prev.some(m => m.id === data.message.id)) {
            return prev.filter(m => m.id !== tempId);
          }
          return prev.map(m => m.id === tempId ? data.message : m);
        });
        fetchConversations();
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, is_optimistic: false, is_failed: true } : m));
      }
    } catch (err) {
      console.error('Error sending property card message:', err);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, is_optimistic: false, is_failed: true } : m));
    }
  };

  const activePartnerId = activeConversation?.partner?.id;
  const activePartnerIdRef = useRef(activePartnerId);
  useEffect(() => {
    activePartnerIdRef.current = activePartnerId;
  }, [activePartnerId]);

  // Fetch conversations
  const fetchConversations = async () => {
    if (!currentUser) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/chat/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        
        // Keep active conversation reference updated with new status/last message
        if (activePartnerIdRef.current) {
          const updated = (data.conversations || []).find(c => c.partner?.id === activePartnerIdRef.current);
          if (updated) {
            setActiveConversation(prev => ({ ...prev, ...updated }));
          }
        }
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  // Fetch initial conversations list & global inbox Realtime subscription
  useEffect(() => {
    if (!currentUser?.id) return;
    let isMounted = true;

    const init = async () => {
      setLoading(true);
      await fetchConversations();
      if (isMounted) setLoading(false);
    };
    init();

    // Fallback polling for conversation list (every 7s)
    const pollInterval = setInterval(() => {
      fetchConversations();
    }, 7000);

    // Global Agent Inbox Realtime channel (receives messages from ANY customer)
    let channel = null;
    if (isSupabaseRealtimeConfigured) {
      channel = supabaseClient
        .channel(`agent_inbox_${currentUser.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        }, (payload) => {
          const newMsg = payload.new;
          if (!newMsg) return;

          const isRecipient = Number(newMsg.receiver_id) === Number(currentUser.id);
          const isSender = Number(newMsg.sender_id) === Number(currentUser.id);
          if (!isRecipient && !isSender) return;

          const partnerId = isSender ? Number(newMsg.receiver_id) : Number(newMsg.sender_id);
          const currentActivePartnerId = Number(activePartnerIdRef.current);
          const isCurrentlyActive = currentActivePartnerId === partnerId;

          // A. If belongs to currently open customer chat, update messages thread
          if (isCurrentlyActive) {
            setMessages((prev) => {
              const existingTemp = prev.find(m => 
                m.id === newMsg.id || 
                (m.is_optimistic && m.sender_id === newMsg.sender_id && (Number(m.property_id) === Number(newMsg.property_id) || m.message === newMsg.message))
              );
              const propertyObj = existingTemp?.property || null;
              const merged = { ...newMsg, property: newMsg.property || propertyObj };

              if (existingTemp) {
                return prev.map(m => m.id === existingTemp.id ? merged : m);
              }
              if (prev.some(m => m.id === newMsg.id)) {
                return prev.map(m => m.id === newMsg.id ? { ...m, ...merged } : m);
              }
              return [...prev, merged];
            });

            if (newMsg.property_id) {
              apiFetch(`${API_BASE_URL}/api/properties/${newMsg.property_id}`)
                .then(r => r.ok ? r.json() : null)
                .then(pData => {
                  if (pData?.property) {
                    setMessages(prev => prev.map(m => 
                      (m.id === newMsg.id || Number(m.property_id) === Number(newMsg.property_id))
                        ? { ...m, property: pData.property }
                        : m
                    ));
                  }
                })
                .catch(() => {});
            }

            if (isRecipient) {
              apiFetch(`${API_BASE_URL}/api/chat/read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partnerId })
              }).catch(() => {});
            }
          }

          // B. ALWAYS update conversation list in sidebar & bring sender to TOP!
          setConversations((prev) => {
            const existingIdx = prev.findIndex(c => Number(c.partner?.id) === partnerId);
            const displayMsg = (newMsg.message && !newMsg.message.startsWith('[Bất động sản]')) 
              ? newMsg.message 
              : (newMsg.attachments?.length ? '[Hình ảnh]' : (newMsg.property_id ? '[Bất động sản]' : newMsg.message));

            if (existingIdx !== -1) {
              const existingConv = prev[existingIdx];
              const updatedConv = {
                ...existingConv,
                lastMessage: displayMsg,
                lastMessageTime: newMsg.created_at,
                lastSenderId: newMsg.sender_id,
                unreadCount: isCurrentlyActive 
                  ? 0 
                  : (isRecipient ? (Number(existingConv.unreadCount) || 0) + 1 : (existingConv.unreadCount || 0))
              };
              const rest = prev.filter((_, idx) => idx !== existingIdx);
              return [updatedConv, ...rest];
            } else {
              // New customer: refresh conversation list from server
              fetchConversations();
              return prev;
            }
          });
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        }, (payload) => {
          const updatedMsg = payload.new;
          if (!updatedMsg) return;
          setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
          setConversations((prev) => prev.map(c => {
            if (Number(c.partner?.id) === Number(updatedMsg.receiver_id) || Number(c.partner?.id) === Number(updatedMsg.sender_id)) {
              return { ...c, isRead: updatedMsg.is_read };
            }
            return c;
          }));
        })
        .subscribe();
    }

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      if (channel) supabaseClient.removeChannel(channel);
    };
  }, [currentUser?.id]);

  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const attachmentInputRef = useRef(null);

  const handleSelectAttachment = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Kích thước ảnh tối đa là 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedAttachment({
        url: reader.result,
        name: file.name,
        type: file.type,
        size: file.size
      });
    };
    reader.readAsDataURL(file);
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  };

  // Fetch messages for active conversation
  useEffect(() => {
    if (!currentUser || !activePartnerId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    let isCurrent = true;
    setMessages([]);
    setMessagesLoading(true);

    const fetchMessages = async (isInitial = false) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/chat/messages?otherId=${activePartnerId}&limit=50`);
        if (res.ok && isCurrent) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        if (isCurrent) console.error('Error fetching messages:', err);
      } finally {
        if (isCurrent && isInitial) setMessagesLoading(false);
      }
    };

    fetchMessages(true);

    // F35: Mark incoming messages as read
    apiFetch(`${API_BASE_URL}/api/chat/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnerId: activePartnerId })
    }).catch(() => {});

    // Active thread polling fallback
    const interval = setInterval(() => fetchMessages(false), isSupabaseRealtimeConfigured ? 10000 : 3000);
    return () => {
      isCurrent = false;
      clearInterval(interval);
    };
  }, [currentUser?.id, activePartnerId]);

  // Send message with Optimistic UI & non-blocking continuous sending
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const msgText = newMessage.trim();
    const currentAttachment = selectedAttachment;

    if ((!msgText && !currentAttachment) || !currentUser || !activeConversation?.partner?.id) return;

    // 1. Clear inputs immediately (instant responsive feel)
    setNewMessage('');
    setSelectedAttachment(null);
    setSendError('');

    // 2. Optimistic message (0ms display)
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: activeConversation.partner.id,
      property_id: null,
      message: msgText,
      attachments: currentAttachment ? [{ url: currentAttachment.url, name: currentAttachment.name }] : [],
      is_read: false,
      created_at: new Date().toISOString(),
      is_optimistic: true
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: activeConversation.partner.id,
          propertyId: null,
          message: msgText,
          attachments: currentAttachment ? [currentAttachment] : []
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Mark optimistic message as failed without wiping user's new draft
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, is_optimistic: false, is_failed: true } : m));
        setNewMessage(prev => prev ? prev : msgText);
        setSendError(data.error || (res.status === 429
          ? 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng thử lại sau.'
          : 'Không thể gửi tin nhắn. Vui lòng thử lại.'));
        return;
      }

      // Replace optimistic message with confirmed server response
      setMessages(prev => {
        if (prev.some(m => m.id === data.message.id)) {
          return prev.filter(m => m.id !== tempId);
        }
        return prev.map(m => m.id === tempId ? data.message : m);
      });

      // Update conversations list preview
      setConversations(prev => {
        const partnerId = activeConversation.partner.id;
        return prev.map(c => {
          if (Number(c.partner?.id) === Number(partnerId)) {
            return {
              ...c,
              lastMessage: msgText || '[Hình ảnh]',
              lastMessageTime: data.message?.created_at || new Date().toISOString(),
              lastSenderId: currentUser.id
            };
          }
          return c;
        });
      });
    } catch (err) {
      console.error('Error sending message:', err);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, is_optimistic: false, is_failed: true } : m));
      setNewMessage(prev => prev ? prev : msgText);
      setSendError('Lỗi kết nối khi gửi tin nhắn.');
    }
  };

  // Funnel stage change handler (Optimistic UI + In-flight guard)
  const isUpdatingFunnelRef = useRef(false);

  const handleStageChange = async (stageKey) => {
    if (!currentUser || !activeConversation?.partner?.id) return;
    if (activeConversation.funnelStage === stageKey || isUpdatingFunnelRef.current) return;

    const previousStage = activeConversation.funnelStage;
    isUpdatingFunnelRef.current = true;

    // 1. Optimistic Update (0ms instant visual feedback)
    setActiveConversation(prev => ({
      ...prev,
      funnelStage: stageKey
    }));
    setConversations(prev => prev.map(c => 
      Number(c.partner?.id) === Number(activeConversation.partner?.id)
        ? { ...c, funnelStage: stageKey }
        : c
    ));

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/chat/funnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeConversation.partner.id,
          stage: stageKey
        })
      });

      if (!res.ok) {
        // Rollback on server error
        setActiveConversation(prev => ({ ...prev, funnelStage: previousStage }));
        setConversations(prev => prev.map(c => 
          Number(c.partner?.id) === Number(activeConversation.partner?.id)
            ? { ...c, funnelStage: previousStage }
            : c
        ));
      }
    } catch (err) {
      console.error('Error updating funnel stage:', err);
      // Rollback on network failure
      setActiveConversation(prev => ({ ...prev, funnelStage: previousStage }));
      setConversations(prev => prev.map(c => 
        Number(c.partner?.id) === Number(activeConversation.partner?.id)
          ? { ...c, funnelStage: previousStage }
          : c
      ));
    } finally {
      isUpdatingFunnelRef.current = false;
    }
  };

  return (
    <div className="agent-chat-container">
      {/* Sidebar Conversation List */}
      <aside className="agent-chat-sidebar">
        <div className="sidebar-title">
          <h3>Khách hàng liên hệ</h3>
        </div>
        <div className="conv-list">
          {loading && conversations.length === 0 ? (
            <div className="sidebar-skeleton-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px' }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', padding: '10px', alignItems: 'center', borderRadius: '12px', backgroundColor: '#f8fafc' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e2e8f0', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ height: '14px', width: '60%', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
                    <div style={{ height: '11px', width: '85%', backgroundColor: '#f1f5f9', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="empty-convs">
              <MessageSquare size={32} color="#cbd5e1" />
              <p>Chưa có khách hàng nhắn tin.</p>
            </div>
          ) : (
            conversations.map((conv, idx) => {
              const isActive = activeConversation?.partner?.id === conv.partner?.id;
              const stageInfo = FUNNEL_STAGES.find(s => s.key === conv.funnelStage);
              const initials = conv.partner?.name
                ? conv.partner.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                : 'KH';

              return (
                <div
                  key={idx}
                  className={`conv-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (Number(activeConversation?.partner?.id) !== Number(conv.partner?.id)) {
                      setMessages([]);
                      setMessagesLoading(true);
                    }
                    setActiveConversation(conv);
                    // Instantly reset unread count locally for clicked customer
                    setConversations(prev => prev.map(c => 
                      Number(c.partner?.id) === Number(conv.partner?.id)
                        ? { ...c, unreadCount: 0 }
                        : c
                    ));
                  }}
                >
                  <div className="avatar-wrap">
                    {conv.partner?.avatar ? (
                      <ImageLoadingSkeleton 
                        src={conv.partner.avatar} 
                        alt="avatar" 
                        fallbackIcon={User}
                        style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                      />
                    ) : (
                      <div className="avatar-ph">{initials}</div>
                    )}
                  </div>
                  <div className="card-info">
                    <div className="card-top">
                      <h4>{conv.partner?.name || 'Khách hàng'}</h4>
                      {stageInfo && (
                        <span 
                          className="funnel-badge"
                          style={{ color: stageInfo.color, backgroundColor: stageInfo.bg }}
                        >
                          {stageInfo.label}
                        </span>
                      )}
                      {conv.unreadCount > 0 && !isActive && (
                        <span className="conv-unread-pill">
                          {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p 
                      className="last-msg"
                      style={{
                        fontWeight: conv.unreadCount > 0 && !isActive ? '700' : 'normal',
                        color: conv.unreadCount > 0 && !isActive ? '#0f172a' : '#64748b'
                      }}
                    >
                      {conv.lastSenderId === currentUser.id ? 'Bạn: ' : ''}
                      {conv.lastMessage || 'Bắt đầu hội thoại...'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="agent-chat-main">
        {activeConversation ? (
          <>
            {/* Header info */}
            <header className="chat-main-header">
              <div className="partner-profile">
                <div className="avatar-wrap">
                  {activeConversation.partner?.avatar ? (
                    <img src={activeConversation.partner.avatar} alt="avatar" />
                  ) : (
                    <div className="avatar-ph">
                      {activeConversation.partner?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'KH'}
                    </div>
                  )}
                </div>
                <div>
                  <h4>{activeConversation.partner?.name || 'Khách hàng'}</h4>
                  <p className="partner-meta">{activeConversation.partner?.email || 'Chưa cập nhật email'}</p>
                </div>
              </div>

              {/* Funnel controls */}
              <div className="funnel-actions-row">
                <span className="funnel-title"><Sparkles size={14} /> Gán nhãn phễu:</span>
                <div className="funnel-buttons">
                  {FUNNEL_STAGES.map(stage => {
                    const isSelected = activeConversation.funnelStage === stage.key;
                    return (
                      <button
                        key={stage.key}
                        className={`funnel-stage-btn ${isSelected ? 'active' : ''}`}
                        style={{
                          borderColor: stage.color,
                          backgroundColor: isSelected ? stage.color : 'transparent',
                          color: isSelected ? '#ffffff' : stage.color
                        }}
                        onClick={() => handleStageChange(stage.key)}
                      >
                        {stage.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </header>

            {/* F33: Contextual Property Banner */}
            {activeConversation.property && (
              <div 
                className="agent-context-property-banner" 
                onClick={() => setViewingPropertyModal(activeConversation.property)}
                title="Bấm để xem chi tiết bất động sản này"
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}
              >
                <ImageLoadingSkeleton 
                  src={activeConversation.property.thumbnail} 
                  alt="" 
                  fallbackIcon={Building2}
                  style={{ width: '48px', height: '48px', borderRadius: '8px' }} 
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>Ngữ cảnh BĐS</span>
                    <h5 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeConversation.property.title}</h5>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    {(activeConversation.property.price || 0).toLocaleString('vi-VN')} VND • {activeConversation.property.district}, {activeConversation.property.city}
                  </p>
                </div>
              </div>
            )}

            {/* Message Thread */}
            <div className="agent-messages-container">
              {messagesLoading ? (
                <div className="chat-messages-skeleton" aria-label="Đang tải tin nhắn...">
                  <div className="skeleton-row partner">
                    <div className="skeleton-avatar" />
                    <div className="skeleton-bubble-wrap">
                      <div className="skeleton-bubble skeleton-bubble-lg" />
                      <div className="skeleton-bubble skeleton-bubble-sm" />
                    </div>
                  </div>
                  <div className="skeleton-row own">
                    <div className="skeleton-bubble-wrap">
                      <div className="skeleton-bubble skeleton-bubble-md own-bubble" />
                    </div>
                  </div>
                  <div className="skeleton-row partner">
                    <div className="skeleton-avatar" />
                    <div className="skeleton-bubble-wrap">
                      <div className="skeleton-card" />
                      <div className="skeleton-bubble skeleton-bubble-sm" />
                    </div>
                  </div>
                  <div className="skeleton-row own">
                    <div className="skeleton-bubble-wrap">
                      <div className="skeleton-bubble skeleton-bubble-lg own-bubble" />
                    </div>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-thread">
                  <MessageCircle size={48} color="#cbd5e1" />
                  <h3>Cuộc hội thoại trống</h3>
                  <p>Hãy gửi lời chào đến khách hàng để bắt đầu tư vấn.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOwn = msg.sender_id === currentUser.id;
                  const dateObj = new Date(msg.created_at);
                  const formattedTime = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div key={msg.id} className={`msg-row ${isOwn ? 'own' : 'partner'}`}>
                      {!isOwn && (
                        <div className="msg-avatar-ph">
                          {activeConversation.partner?.avatar ? (
                            <ImageLoadingSkeleton 
                              src={activeConversation.partner.avatar} 
                              alt="avatar" 
                              fallbackIcon={User}
                              style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                            />
                          ) : (
                            <div className="avatar-ph small">
                              {activeConversation.partner?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'KH'}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="msg-bubble">
                        {msg.property ? (
                          <div 
                            className="chat-property-card" 
                            onClick={() => setViewingPropertyModal(msg.property)}
                            title="Bấm để xem chi tiết bất động sản"
                            style={{ 
                              cursor: 'pointer',
                              border: '1px solid #e2e8f0', 
                              borderRadius: '12px', 
                              overflow: 'hidden', 
                              backgroundColor: 'white',
                              width: '260px',
                              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                              display: 'flex',
                              flexDirection: 'column',
                              marginBottom: msg.message && !msg.message.startsWith('[Bất động sản]') ? '8px' : '0',
                              transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                            }}
                          >
                            <ImageLoadingSkeleton 
                              src={msg.property.thumbnail} 
                              alt={msg.property.title} 
                              fallbackIcon={Building2}
                              fallbackText="Không có ảnh BĐS"
                              style={{ width: '100%', height: '140px' }}
                            />
                            <div style={{ padding: '12px', textAlign: 'left' }}>
                              <h5 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: '700', color: '#1e293b', lineHeight: '1.4' }}>{msg.property.title}</h5>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: '700', color: '#2563eb' }}>{(msg.property.price || 0).toLocaleString('vi-VN')} VND/tháng</span>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>{msg.property.area || 0} m²</span>
                              </div>
                            </div>
                          </div>
                        ) : (Boolean(msg.property_id) || (typeof msg.message === 'string' && msg.message.startsWith('[Bất động sản]'))) ? (
                          <div 
                            className="chat-property-card loading-card" 
                            style={{ 
                              border: '1px solid #e2e8f0', 
                              borderRadius: '12px', 
                              overflow: 'hidden', 
                              backgroundColor: 'white',
                              width: '260px',
                              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                              display: 'flex',
                              flexDirection: 'column',
                              marginBottom: '6px'
                            }}
                          >
                            <div style={{ width: '100%', height: '100px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                              <Building2 size={32} style={{ opacity: 0.6 }} />
                            </div>
                            <div style={{ padding: '10px 12px', textAlign: 'left' }}>
                              <h5 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '700', color: '#1e293b', lineHeight: '1.4' }}>
                                {typeof msg.message === 'string' && msg.message.startsWith('[Bất động sản]') ? msg.message.replace('[Bất động sản] ', '').trim() : 'Đang tải thông tin BĐS...'}
                              </h5>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                                <Loader2 size={12} className="animate-spin" />
                                <span>Đang nạp dữ liệu chi tiết...</span>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                          <div className="chat-attachments-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                            {msg.attachments.map((att, attIdx) => (
                              <a key={attIdx} href={att.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                                <ImageLoadingSkeleton 
                                  src={att.url} 
                                  alt={att.name || 'Ảnh đính kèm'} 
                                  fallbackIcon={ImageIcon}
                                  style={{ maxWidth: '240px', maxHeight: '180px', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
                                />
                              </a>
                            ))}
                          </div>
                        )}
                        {msg.message && !msg.message.startsWith('[Bất động sản]') && (
                          <p className="msg-txt">{msg.message}</p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isOwn ? 'flex-end' : 'flex-start', gap: '4px' }}>
                          <span className="msg-time">{formattedTime}</span>
                          {isOwn && (
                            <span 
                              className={`message-read-receipt ${msg.is_read ? 'is-read' : 'is-sent'}`}
                              style={{ 
                                fontSize: '11px', 
                                color: msg.is_failed ? '#f87171' : msg.is_optimistic ? 'rgba(255, 255, 255, 0.7)' : msg.is_read ? '#a5f3fc' : 'rgba(255, 255, 255, 0.85)', 
                                fontWeight: (msg.is_read || msg.is_failed) ? '600' : '500' 
                              }}
                            >
                              {msg.is_failed ? '❌ Lỗi gửi' : msg.is_optimistic ? '⏳ Đang gửi...' : msg.is_read ? '✓✓ Đã xem' : '✓ Đã gửi'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Image Attachment Preview */}
            {selectedAttachment && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: '#f1f5f9', borderRadius: '8px', margin: '4px 16px', border: '1px solid #cbd5e1' }}>
                <img src={selectedAttachment.url} alt="preview" style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                <span style={{ fontSize: '12px', color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedAttachment.name}
                </span>
                <button 
                  type="button" 
                  onClick={() => setSelectedAttachment(null)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                  title="Gỡ ảnh"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Input Bar */}
            <form className="agent-chat-input-form" onSubmit={handleSendMessage}>
              <input 
                type="file" 
                ref={attachmentInputRef} 
                accept="image/*" 
                style={{ display: 'none' }} 
                onChange={handleSelectAttachment} 
              />
              <button 
                type="button" 
                onClick={() => attachmentInputRef.current?.click()}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#64748b', 
                  padding: '8px 8px', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  fontSize: '13px',
                  fontWeight: '500'
                }}
                title="Đính kèm hình ảnh"
              >
                <ImageIcon size={18} />
              </button>
              <button 
                type="button" 
                className="attach-property-btn" 
                onClick={openPropertySelector}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#2563eb', 
                  padding: '8px 12px', 
                  cursor: 'pointer', 
                  fontWeight: '600', 
                  fontSize: '14px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  whiteSpace: 'nowrap'
                }}
              >
                [+] Gửi Bất Động Sản
              </button>
              <input
                type="text"
                placeholder="Nhập phản hồi..."
                value={newMessage}
                maxLength={2000}
                onChange={(e) => { setNewMessage(e.target.value); setSendError(''); }}
              />
              <button 
                type="submit" 
                className="send-btn"
                disabled={!newMessage.trim() && !selectedAttachment}
                style={{ 
                  opacity: (!newMessage.trim() && !selectedAttachment) ? 0.6 : 1, 
                  cursor: (!newMessage.trim() && !selectedAttachment) ? 'not-allowed' : 'pointer' 
                }}
                title="Gửi tin nhắn"
                aria-label="Gửi tin nhắn"
              >
                <Send size={18} />
              </button>
            </form>
            {sendError && <p role="alert" style={{ color: '#b91c1c', margin: '4px 12px' }}>{sendError}</p>}
          </>
        ) : (
          <div className="chat-placeholder">
            <MessageSquare size={64} color="#e2e8f0" />
            <h2>Trang tư vấn khách hàng</h2>
            <p>Chọn một hội thoại khách hàng ở danh sách bên trái để phản hồi và quản lý phân loại phễu kinh doanh.</p>
          </div>
        )}
      </main>

      {showPropertySelector && (
        <div className="modal-backdrop property-selector-backdrop" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="filter-modal-content property-selector-content" style={{ width: '450px', maxHeight: '500px', padding: '25px', backgroundColor: 'white', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>Danh sách bất động sản của bạn</h3>
              <button onClick={() => setShowPropertySelector(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '5px' }}>
              {isLoadingProperties ? (
                <p style={{ textAlign: 'center', color: '#64748b' }}>Đang tải...</p>
              ) : agentProperties.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', padding: '20px 0' }}>Bạn chưa có bất động sản nào đang hoạt động.</p>
              ) : (
                agentProperties.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => sendPropertyCard(p)}
                    style={{ 
                      display: 'flex', 
                      gap: '12px', 
                      padding: '10px', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '8px', 
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <ImageLoadingSkeleton 
                      src={p.thumbnail} 
                      alt={p.title} 
                      fallbackIcon={Building2}
                      style={{ width: '60px', height: '60px', borderRadius: '6px' }} 
                    />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '600', color: '#1e293b', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#2563eb', fontWeight: '700' }}>
                        {(p.price || 0).toLocaleString('vi-VN')} VND/tháng • {p.area} m²
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Property Detail Modal for Agent */}
      {viewingPropertyModal && (
        <PropertyDetailModal 
          property={viewingPropertyModal} 
          onClose={() => setViewingPropertyModal(null)} 
        />
      )}
    </div>
  );
};

export default AgentChat;
