import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  ChevronLeft, Send, MessageSquare, User, 
  MapPin, Phone, MessageCircle, Home, Compass, Heart, Map, X, Plus, Search, Building2,
  Paperclip, Image as ImageIcon, Loader2, Sparkles
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import { supabaseClient, isSupabaseRealtimeConfigured } from '../services/supabaseClient';
import PropertyDetailModal from '../components/PropertyDetailModal';
import SwipeHeader from '../features/swipe/SwipeHeader';
import ImageLoadingSkeleton from '../components/ImageLoadingSkeleton';
import './Chat.css';

const FUNNEL_STAGES = [
  { key: 'AWARENESS', label: 'Nhận biết', color: '#6366f1', bg: '#eef2ff' },
  { key: 'CONSIDERATION', label: 'Cân nhắc', color: '#f59e0b', bg: '#fef3c7' },
  { key: 'INTENT', label: 'Ý định', color: '#10b981', bg: '#ecfdf5' },
  { key: 'ACTION', label: 'Hành động', color: '#ec4899', bg: '#fdf2f8' }
];

const Chat = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const targetAgentId = searchParams.get('agentId');
  const targetPropertyId = searchParams.get('propertyId');

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendError, setSendError] = useState('');
  const [activeProperty, setActiveProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [viewingPropertyModal, setViewingPropertyModal] = useState(null);

  // Agent property attachment modal states
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [agentProperties, setAgentProperties] = useState([]);
  const [isLoadingAgentProperties, setIsLoadingAgentProperties] = useState(false);
  const [propertySearchQuery, setPropertySearchQuery] = useState('');

  const messagesEndRef = useRef(null);
  const isSendingRef = useRef(false);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!messagesLoading) {
      scrollToBottom();
    }
  }, [messages, messagesLoading]);

  const activePartnerId = activeConversation?.partner?.id;
  const activePartnerIdRef = useRef(activePartnerId);
  useEffect(() => {
    activePartnerIdRef.current = activePartnerId;
  }, [activePartnerId]);

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

  // Helper to fetch/refresh conversations list
  const fetchConversationsList = async (showLoading = false) => {
    if (!currentUser) return [];
    try {
      if (showLoading) setLoading(true);
      const convRes = await apiFetch(`${API_BASE_URL}/api/chat/conversations`);
      if (convRes.ok) {
        const convData = await convRes.json();
        const serverConvs = convData.conversations || [];
        setConversations(prev => {
          // If we had a temporary conversation that hasn't sent a message yet, keep it at top
          const tempConv = prev.find(c => c.partner?.id && !serverConvs.some(sc => Number(sc.partner?.id) === Number(c.partner?.id)));
          return tempConv ? [tempConv, ...serverConvs] : serverConvs;
        });
        return serverConvs;
      }
      return [];
    } catch (err) {
      console.error('Error fetching conversations:', err);
      return [];
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Fetch initial conversations list & global inbox Realtime subscription
  useEffect(() => {
    if (!currentUser?.id) return;

    const initConversations = async () => {
      const serverConvs = await fetchConversationsList(true);

      // Resolve requested agent / property if coming from direct CTA
      let requestedAgentId = targetAgentId;
      if (!requestedAgentId && targetPropertyId) {
        const contactRes = await apiFetch(`${API_BASE_URL}/api/properties/${targetPropertyId}/contact-agent`);
        const contactData = await contactRes.json().catch(() => ({}));
        if (!contactRes.ok) {
          setSendError(contactData.error || 'Không thể mở cuộc trò chuyện cho tin đăng này.');
          return;
        }
        requestedAgentId = String(contactData.agentId);
      }

      if (requestedAgentId) {
        const agentIdNum = Number(requestedAgentId);
        if (Number(currentUser.id) === agentIdNum) {
          setSendError('Bạn không thể tự nhắn tin cho chính mình.');
          navigate('/chat', { replace: true });
          if (serverConvs.length > 0) setActiveConversation(serverConvs[0]);
          return;
        }

        const existing = serverConvs.find(c => Number(c.partner.id) === agentIdNum);
        if (existing) {
          setActiveConversation(existing);
        } else {
          const agentDetailsRes = await apiFetch(`${API_BASE_URL}/api/user/${agentIdNum}`);
          let partnerObj = { id: agentIdNum, name: 'Đang tải...', role: 'AGENT' };
          if (agentDetailsRes.ok) {
            const partnerData = await agentDetailsRes.json();
            partnerObj = partnerData.user || partnerObj;
          }

          const tempConv = {
            partner: partnerObj,
            lastMessage: '',
            funnelStage: 'AWARENESS'
          };
          setActiveConversation(tempConv);
          setConversations(prev => {
            if (prev.some(c => Number(c.partner?.id) === agentIdNum)) return prev;
            return [tempConv, ...prev];
          });
        }

        if (targetPropertyId) {
          const propRes = await apiFetch(`${API_BASE_URL}/api/properties/${targetPropertyId}`);
          if (propRes.ok) {
            const propData = await propRes.json();
            setActiveProperty(propData.property);
          }
        }
      } else if (serverConvs.length > 0 && !activePartnerIdRef.current) {
        setActiveConversation(serverConvs[0]);
      }
    };

    initConversations();

    // Background polling for conversation list (fallback every 7s)
    const convPollInterval = setInterval(() => {
      fetchConversationsList(false);
    }, 7000);

    // Global Inbox Realtime subscription for currentUser (receives messages from ANY partner)
    let channel = null;
    if (isSupabaseRealtimeConfigured) {
      channel = supabaseClient
        .channel(`user_inbox_${currentUser.id}`)
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

          // A. If belongs to currently open chat, update messages list immediately
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

          // B. ALWAYS update the sidebar conversations list & push to top!
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
              // Partner not in list yet: trigger fetch to get their profile & add to top
              fetchConversationsList(false);
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
      clearInterval(convPollInterval);
      if (channel) supabaseClient.removeChannel(channel);
    };
  }, [currentUser?.id, targetAgentId, targetPropertyId]);

  // Message fetching when active conversation changes
  useEffect(() => {
    if (!currentUser?.id || !activePartnerId) {
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
          const incoming = data.messages || [];
          setMessages(prev => {
            if (prev.length === incoming.length && 
                (prev.length === 0 || prev[prev.length - 1]?.id === incoming[incoming.length - 1]?.id) &&
                prev.every((m, i) => m.is_read === incoming[i]?.is_read && m.id === incoming[i]?.id)) {
              return prev;
            }
            return incoming;
          });
        }
      } catch (err) {
        if (isCurrent) console.error('Error fetching messages:', err);
      } finally {
        if (isCurrent && isInitial) setMessagesLoading(false);
      }
    };

    fetchMessages(true);

    // Mark as read immediately upon opening
    apiFetch(`${API_BASE_URL}/api/chat/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnerId: activePartnerId })
    }).catch(() => {});

    // Polling fallback specifically for active chat thread
    const interval = setInterval(() => {
      fetchMessages(false);
    }, isSupabaseRealtimeConfigured ? 10000 : 3000);

    return () => {
      isCurrent = false;
      clearInterval(interval);
    };
  }, [currentUser?.id, activePartnerId]);

  // Send message handler with Optimistic UI & non-blocking continuous sending
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const msgText = newMessage.trim();
    const currentAttachment = selectedAttachment;
    const propertyToSend = activeProperty;

    if ((!msgText && !currentAttachment) || !currentUser || !activeConversation?.partner?.id) return;

    // 1. Clear inputs immediately for instant, responsive feel
    setNewMessage('');
    setSelectedAttachment(null);
    setActiveProperty(null); // Detach ribbon right away
    setSendError('');

    if (targetPropertyId) {
      navigate(activeConversation?.partner?.id ? `/chat?agentId=${encodeURIComponent(activeConversation.partner.id)}` : '/chat', { replace: true });
    }

    // 2. Optimistic message (0ms display)
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: activeConversation.partner.id,
      property_id: propertyToSend?.id || null,
      property: propertyToSend || null,
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
          propertyId: propertyToSend?.id || null,
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

  const fetchAgentProperties = async () => {
    if (!currentUser) return;
    setIsLoadingAgentProperties(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/properties`);
      if (res.ok) {
        const data = await res.json();
        const myProps = (data.properties || []).filter(
          p => Number(p.owner_id) === Number(currentUser.id)
        );
        setAgentProperties(myProps);
      }
    } catch (err) {
      console.error('Error fetching agent properties:', err);
    } finally {
      setIsLoadingAgentProperties(false);
    }
  };

  const handleSelectPropertyToAttach = (prop) => {
    setActiveProperty(prop);
    setShowPropertyModal(false);
  };

  const handleQuickSendProperty = async (prop) => {
    if (!currentUser || !activeConversation?.partner?.id) return;
    setShowPropertyModal(false);
    setActiveProperty(null);

    const tempId = `temp_prop_${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: activeConversation.partner.id,
      property_id: prop.id,
      property: prop,
      message: `[Bất động sản] ${prop.title}`,
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
          propertyId: prop.id,
          message: `[Bất động sản] ${prop.title}`
        })
      });
      if (res.ok) {
        const data = await res.json();
        const serverMsg = data.message;
        const confirmedMsg = {
          ...serverMsg,
          property: serverMsg.property || prop
        };
        setMessages(prev => {
          if (prev.some(m => m.id === confirmedMsg.id)) {
            return prev.map(m => m.id === confirmedMsg.id ? confirmedMsg : m).filter(m => m.id !== tempId);
          }
          return prev.map(m => m.id === tempId ? confirmedMsg : m);
        });
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, is_optimistic: false, is_failed: true } : m));
      }
    } catch (err) {
      console.error('Error quick sending property card:', err);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, is_optimistic: false, is_failed: true } : m));
    }
  };

  const isUpdatingFunnelRef = useRef(false);

  const handleStageChange = async (stageKey) => {
    if (!currentUser || currentUser.role !== 'AGENT' || !activeConversation?.partner?.id) return;
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

  const filteredAgentProperties = agentProperties.filter(p => {
    if (!propertySearchQuery.trim()) return true;
    const q = propertySearchQuery.toLowerCase();
    return (
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.district && p.district.toLowerCase().includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q))
    );
  });

  const formatPrice = (price) => {
    if (!price || price === 0) return 'Liên hệ';
    const billion = 1000000000;
    const million = 1000000;
    
    if (price >= billion) {
      return `${(price / billion).toFixed(1).replace('.0', '')} Tỷ`;
    }
    if (price >= million) {
      return `${(price / million).toFixed(1).replace('.0', '')} Triệu`;
    }
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
  };

  return (
    <div className="chat-page-container">
      {/* Header */}
      <SwipeHeader 
        activeView="chat" 
        onSearch={() => navigate('/swipe/Tất cả')} 
      />

      {/* Main Container */}
      <div className={`chat-main-layout ${activeConversation ? 'has-active-chat' : ''}`}>
        {/* Left pane - conversations */}
        <aside className="chat-sidebar">
          <div className="sidebar-header">
            <h3>Hội thoại</h3>
          </div>
          <div className="conversation-list">
            {loading && conversations.length === 0 ? (
              <div className="sidebar-skeleton-list">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="sidebar-skeleton-item">
                    <div className="skeleton-avatar" />
                    <div className="sidebar-skeleton-lines">
                      <div className="skeleton-line line-title" />
                      <div className="skeleton-line line-sub" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="empty-conversations">
                <MessageSquare size={36} color="#cbd5e1" />
                <p>Chưa có cuộc trò chuyện nào.</p>
              </div>
            ) : (
              conversations.map((conv, idx) => {
                const isActive = activeConversation?.partner?.id === conv.partner?.id;
                const initials = conv.partner?.name
                  ? conv.partner.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                  : 'MC';
                
                return (
                  <div 
                    key={idx} 
                    className={`conversation-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (Number(activeConversation?.partner?.id) !== Number(conv.partner?.id)) {
                        setMessages([]);
                        setMessagesLoading(true);
                      }
                      setActiveConversation(conv);
                      setActiveProperty(null); // Do NOT auto-attach past property context on conversation switch
                      // Instantly reset unread count locally for clicked conversation
                      setConversations(prev => prev.map(c => 
                        Number(c.partner?.id) === Number(conv.partner?.id)
                          ? { ...c, unreadCount: 0 }
                          : c
                      ));
                    }}
                  >
                    <div className="conv-avatar">
                      {conv.partner?.avatar ? (
                        <ImageLoadingSkeleton 
                          src={conv.partner.avatar} 
                          alt={conv.partner.name} 
                          fallbackIcon={User}
                          style={{ width: '44px', height: '44px', borderRadius: '50%' }}
                        />
                      ) : (
                        <div className="avatar-placeholder">{initials}</div>
                      )}
                      <span className={`status-dot online`} />
                    </div>
                    <div className="conv-info">
                      <div className="conv-name-row">
                        <h4>{conv.partner?.name || 'Môi giới'}</h4>
                        {conv.partner?.role === 'AGENT' && <span className="agent-badge">Môi giới</span>}
                        {currentUser?.role === 'AGENT' && conv.funnelStage && (
                          <span 
                            className="funnel-badge"
                            style={{ 
                              backgroundColor: FUNNEL_STAGES.find(s => s.key === conv.funnelStage)?.bg || '#eef2ff',
                              color: FUNNEL_STAGES.find(s => s.key === conv.funnelStage)?.color || '#6366f1'
                            }}
                          >
                            {FUNNEL_STAGES.find(s => s.key === conv.funnelStage)?.label || 'Nhận biết'}
                          </span>
                        )}
                        {conv.unreadCount > 0 && !isActive && (
                          <span className="conv-unread-pill">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <p 
                        className="conv-last-msg"
                        style={{
                          fontWeight: conv.unreadCount > 0 && !isActive ? '700' : 'normal',
                          color: conv.unreadCount > 0 && !isActive ? '#0f172a' : '#64748b'
                        }}
                      >
                        {conv.lastSenderId === currentUser?.id ? 'Bạn: ' : ''}
                        {conv.lastMessage || 'Bắt đầu trò chuyện...'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right pane - active chat */}
        <main className="chat-content-area">
          {activeConversation ? (
            <>
              {/* Active Conversation Header */}
              <div className="active-chat-header">
                <button 
                  type="button" 
                  className="chat-mobile-back-btn" 
                  aria-label="Quay lại danh sách hội thoại"
                  onClick={() => setActiveConversation(null)}
                >
                  <ChevronLeft size={22} />
                </button>
                <div className="chat-partner-info">
                  <div className="conv-avatar">
                    {activeConversation.partner?.avatar ? (
                      <ImageLoadingSkeleton 
                        src={activeConversation.partner.avatar} 
                        alt={activeConversation.partner.name} 
                        fallbackIcon={User}
                        style={{ width: '44px', height: '44px', borderRadius: '50%' }}
                      />
                    ) : (
                      <div className="avatar-placeholder">
                        {activeConversation.partner?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'MC'}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4>{activeConversation.partner?.name || 'Môi giới'}</h4>
                    <p className="partner-status">Đang hoạt động</p>
                  </div>
                </div>

                {/* Funnel controls for AGENT */}
                {currentUser?.role === 'AGENT' && (
                  <div className="funnel-actions-row">
                    <span className="funnel-title"><Sparkles size={14} /> Gán nhãn phễu:</span>
                    <div className="funnel-buttons">
                      {FUNNEL_STAGES.map(stage => {
                        const isSelected = (activeConversation.funnelStage || 'AWARENESS') === stage.key;
                        return (
                          <button
                            key={stage.key}
                            type="button"
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
                )}

                {activeConversation.partner?.phone && (
                  <a href={`tel:${activeConversation.partner.phone}`} className="chat-call-btn" title="Gọi điện thoại">
                    <Phone size={18} />
                    <span>Gọi ngay</span>
                  </a>
                )}
              </div>

              {/* Messages Area */}
              <div className="messages-container">
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
                  <div className="empty-messages">
                    <MessageCircle size={48} color="#cbd5e1" />
                    <h3>Bắt đầu cuộc trò chuyện</h3>
                    <p>Hãy gửi lời nhắn đầu tiên để cùng trao đổi thông tin về bất động sản.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.sender_id === currentUser.id;
                    const dateObj = new Date(msg.created_at);
                    const formattedTime = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div key={msg.id} className={`message-bubble-row ${isOwn ? 'own' : 'partner'}`}>
                        {!isOwn && (
                          <div className="message-avatar">
                            {activeConversation.partner?.avatar ? (
                              <ImageLoadingSkeleton 
                                src={activeConversation.partner.avatar} 
                                alt="avatar" 
                                fallbackIcon={User}
                                style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                              />
                            ) : (
                              <div className="avatar-placeholder small">
                                {activeConversation.partner?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'MC'}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="message-bubble-content">
                          {msg.property ? (
                            <div 
                              className="chat-property-card" 
                              onClick={() => setViewingPropertyModal(msg.property)}
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
                                marginBottom: msg.message && !msg.message.startsWith('[Bất động sản]') ? '8px' : '0'
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
                                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#2563eb' }}>{formatPrice(msg.property.price)}/tháng</span>
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
                            <p className="message-text">{msg.message}</p>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isOwn ? 'flex-end' : 'flex-start', gap: '4px' }}>
                            <span className="message-time">{formattedTime}</span>
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

              {/* Active Property Context Ribbon (Moved right above input form) */}
              {activeProperty && (
                <div className="active-property-ribbon">
                  <img src={activeProperty.thumbnail} alt={activeProperty.title} className="ribbon-thumb" />
                  <div className="ribbon-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="ribbon-badge">
                        Đang đính kèm
                      </span>
                      <h5>{activeProperty.title}</h5>
                    </div>
                    <p className="ribbon-price-address">
                      <span className="price">{formatPrice(activeProperty.price)}/tháng</span>
                      <span className="dot">•</span>
                      <span className="address"><MapPin size={12} /> {activeProperty.district}, {activeProperty.city}</span>
                    </p>
                  </div>
                  <div className="ribbon-actions">
                    <button className="view-property-btn" onClick={() => setViewingPropertyModal(activeProperty)}>
                      Xem tin
                    </button>
                    <button 
                      className="detach-property-btn" 
                      onClick={() => {
                        setActiveProperty(null);
                        if (targetPropertyId) {
                          navigate(activeConversation?.partner?.id ? `/chat?agentId=${encodeURIComponent(activeConversation.partner.id)}` : '/chat', { replace: true });
                        }
                      }}
                      title="Gỡ đính kèm bất động sản"
                      aria-label="Gỡ đính kèm"
                    >
                      <X size={15} />
                      <span>Gỡ</span>
                    </button>
                  </div>
                </div>
              )}

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

              {/* Message Input Box */}
              {sendError && <p role="alert" style={{ color: '#b91c1c', margin: '4px 12px' }}>{sendError}</p>}
              <form className="message-input-form" onSubmit={handleSendMessage}>
                <input 
                  type="file" 
                  ref={attachmentInputRef} 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  onChange={handleSelectAttachment} 
                />
                <button 
                  type="button" 
                  className="attach-btn" 
                  onClick={() => attachmentInputRef.current?.click()}
                  title="Gửi hình ảnh / tài liệu đính kèm"
                  aria-label="Đính kèm ảnh"
                >
                  <ImageIcon size={19} />
                </button>
                {(currentUser?.role === 'AGENT' || currentUser?.role === 'ADMIN') && (
                  <button 
                    type="button" 
                    className="attach-btn" 
                    onClick={() => {
                      setShowPropertyModal(true);
                      fetchAgentProperties();
                    }}
                    title="Đính kèm bất động sản của bạn (Shopee Style)"
                    aria-label="Đính kèm BĐS"
                  >
                    <Plus size={20} />
                  </button>
                )}
                <input 
                  type="text" 
                  placeholder={activeProperty ? `Soạn tin nhắn kèm [${activeProperty.title}]...` : "Nhập tin nhắn..."} 
                  value={newMessage}
                  maxLength={2000}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    setSendError('');
                  }}
                />
                <button 
                  type="submit" 
                  className="send-msg-btn"
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
            </>
          ) : (
            <div className="chat-no-selection">
              <MessageSquare size={64} color="#e2e8f0" />
              <h2>Hộp thư của bạn</h2>
              <p>Chọn một cuộc hội thoại từ danh sách bên trái hoặc nhấn nút Chat trên thẻ bất động sản để bắt đầu nhắn tin.</p>
            </div>
          )}
        </main>
      </div>

      {/* Shopee-style Property Selection Modal for Agent */}
      {showPropertyModal && (
        <div className="property-modal-overlay" onClick={() => setShowPropertyModal(false)}>
          <div className="property-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="property-modal-header">
              <div>
                <h3>Kho bất động sản của bạn</h3>
                <p>Chọn BĐS để đính kèm vào tin nhắn hoặc gửi nhanh đến khách hàng</p>
              </div>
              <button 
                className="property-modal-close-btn"
                onClick={() => setShowPropertyModal(false)}
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="property-modal-search">
              <Search size={16} color="#94a3b8" />
              <input 
                type="text"
                placeholder="Tìm nhanh theo tên BĐS, khu vực..."
                value={propertySearchQuery}
                onChange={(e) => setPropertySearchQuery(e.target.value)}
              />
              {propertySearchQuery && (
                <button 
                  onClick={() => setPropertySearchQuery('')}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="property-modal-list">
              {isLoadingAgentProperties ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <p>Đang tải danh sách bất động sản...</p>
                </div>
              ) : agentProperties.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                  <Building2 size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontWeight: 600, color: '#334155' }}>Bạn chưa có bất động sản nào</p>
                  <p style={{ fontSize: '13px', marginTop: '4px' }}>Hãy đăng tin bất động sản mới trong trang quản trị Môi giới.</p>
                </div>
              ) : filteredAgentProperties.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                  <p>Không tìm thấy bất động sản nào khớp với từ khóa "{propertySearchQuery}".</p>
                </div>
              ) : (
                filteredAgentProperties.map((p) => {
                  const isCurrentlyAttached = activeProperty?.id === p.id;
                  return (
                    <div key={p.id} className="property-modal-item">
                      <ImageLoadingSkeleton 
                        src={p.thumbnail} 
                        alt={p.title} 
                        className="property-modal-thumb"
                        fallbackIcon={Building2}
                        style={{ width: '70px', height: '70px', borderRadius: '8px' }}
                      />
                      <div className="property-modal-info">
                        <h4>{p.title}</h4>
                        <p className="property-modal-price">{formatPrice(p.price)}/tháng • {p.area || 0} m²</p>
                        <p className="property-modal-addr">
                          <MapPin size={11} /> {p.district}, {p.city}
                        </p>
                      </div>
                      <div className="property-modal-actions">
                        <button 
                          className="modal-attach-btn"
                          onClick={() => handleSelectPropertyToAttach(p)}
                        >
                          {isCurrentlyAttached ? 'Đang chọn' : 'Đính kèm'}
                        </button>
                        <button 
                          className="modal-quick-send-btn"
                          onClick={() => handleQuickSendProperty(p)}
                        >
                          Gửi ngay
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Property Details Modal directly inside Chat */}
      {viewingPropertyModal && (
        <PropertyDetailModal
          property={viewingPropertyModal}
          onClose={() => setViewingPropertyModal(null)}
        />
      )}
    </div>
  );
};

export default Chat;
