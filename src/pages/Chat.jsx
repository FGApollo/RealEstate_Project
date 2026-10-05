import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  ChevronLeft, Send, MessageSquare, User, 
  MapPin, Phone, MessageCircle, Home, Compass, Heart, Map, X, Plus, Search, Building2
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import PropertyDetailModal from '../components/PropertyDetailModal';
import SwipeHeader from '../features/swipe/SwipeHeader';
import './Chat.css';

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
  const [viewingPropertyModal, setViewingPropertyModal] = useState(null);

  // Agent property attachment modal states
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [agentProperties, setAgentProperties] = useState([]);
  const [isLoadingAgentProperties, setIsLoadingAgentProperties] = useState(false);
  const [propertySearchQuery, setPropertySearchQuery] = useState('');

  const messagesEndRef = useRef(null);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!messagesLoading) {
      scrollToBottom();
    }
  }, [messages, messagesLoading]);

  // Fetch initial data
  useEffect(() => {
    if (!currentUser) return;

    const fetchInitialData = async () => {
      try {
        setLoading(true);
        // 1. Fetch conversations
        const convRes = await apiFetch(`${API_BASE_URL}/api/chat/conversations`);
        if (convRes.ok) {
          const convData = await convRes.json();
          setConversations(convData.conversations || []);

          // A pending contact action carries only the property id. Resolve its
          // owner through the authenticated contact endpoint after login.
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

          // 2. Determine who to chat with
          if (requestedAgentId) {
            const agentIdNum = Number(requestedAgentId);
            
            // Check if user is attempting to chat with themselves
            if (currentUser && Number(currentUser.id) === agentIdNum) {
              setSendError('Bạn không thể tự nhắn tin cho chính mình.');
              navigate('/chat', { replace: true });
              if (convData.conversations.length > 0) {
                setActiveConversation(convData.conversations[0]);
              }
              return;
            }

            // Check if conversation already exists in lists
            const existing = convData.conversations.find(c => Number(c.partner.id) === agentIdNum);
            if (existing) {
              setActiveConversation(existing);
            } else {
              // Create a temporary conversation object for the UI
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
              setConversations(prev => [tempConv, ...prev]);
            }

            // Fetch property info if any
            if (targetPropertyId) {
              const propRes = await apiFetch(`${API_BASE_URL}/api/properties/${targetPropertyId}`);
              if (propRes.ok) {
                const propData = await propRes.json();
                setActiveProperty(propData.property);
              }
            }
          } else if (convData.conversations.length > 0) {
            // Default to first conversation
            setActiveConversation(convData.conversations[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching chat data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [currentUser, targetAgentId, targetPropertyId]);

  // Fetch messages when active conversation changes (clean reset on partner switch)
  const activePartnerId = activeConversation?.partner?.id;

  useEffect(() => {
    if (!currentUser?.id || !activePartnerId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    let isCurrent = true;
    // Clear previous partner's messages immediately to avoid flashing stale messages
    setMessages([]);
    setMessagesLoading(true);

    const fetchMessages = async (isInitial = false) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/chat/messages?otherId=${activePartnerId}`);
        if (res.ok && isCurrent) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        if (isCurrent) {
          console.error('Error fetching messages:', err);
        }
      } finally {
        if (isCurrent && isInitial) {
          setMessagesLoading(false);
        }
      }
    };

    fetchMessages(true);

    // Poll for new messages every 3 seconds for simulated realtime chat without re-triggering skeleton
    const interval = setInterval(() => {
      fetchMessages(false);
    }, 3000);

    return () => {
      isCurrent = false;
      clearInterval(interval);
    };
  }, [currentUser?.id, activePartnerId]);

  // Send message handler
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !activeConversation) return;

    const msgText = newMessage.trim();
    setSendError('');

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: activeConversation.partner.id,
          propertyId: activeProperty?.id || null,
          message: msgText
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data.error || (res.status === 429
          ? 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng thử lại sau.'
          : 'Không thể gửi tin nhắn. Vui lòng thử lại.'));
        return;
      }

      setNewMessage('');
      setMessages(prev => [...prev, data.message]);
      setActiveProperty(null); // Detach property after first send

      // Refresh conversations list to update last message preview
      const convRes = await apiFetch(`${API_BASE_URL}/api/chat/conversations`);
      if (convRes.ok) {
        const convData = await convRes.json();
        setConversations(convData.conversations || []);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setSendError('Lỗi kết nối. Tin nhắn vẫn được giữ lại để bạn thử gửi lại.');
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
    if (!currentUser || !activeConversation) return;
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
        setMessages(prev => [...prev, data.message]);
        setShowPropertyModal(false);
        setActiveProperty(null);

        const convRes = await apiFetch(`${API_BASE_URL}/api/chat/conversations`);
        if (convRes.ok) {
          const convData = await convRes.json();
          setConversations(convData.conversations || []);
        }
      }
    } catch (err) {
      console.error('Error quick sending property card:', err);
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
                      setActiveConversation(conv);
                      setActiveProperty(null); // Reset property context since we're switching chats
                    }}
                  >
                    <div className="conv-avatar">
                      {conv.partner?.avatar ? (
                        <img src={conv.partner.avatar} alt={conv.partner.name} />
                      ) : (
                        <div className="avatar-placeholder">{initials}</div>
                      )}
                      <span className={`status-dot online`} />
                    </div>
                    <div className="conv-info">
                      <div className="conv-name-row">
                        <h4>{conv.partner?.name || 'Môi giới'}</h4>
                        {conv.partner?.role === 'AGENT' && <span className="agent-badge">Môi giới</span>}
                      </div>
                      <p className="conv-last-msg">
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
                      <img src={activeConversation.partner.avatar} alt={activeConversation.partner.name} />
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
                              <img src={activeConversation.partner.avatar} alt="avatar" />
                            ) : (
                              <div className="avatar-placeholder small">
                                {activeConversation.partner?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'MC'}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="message-bubble-content">
                          {msg.property && (
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
                                marginBottom: msg.message && msg.message !== `[Bất động sản] ${msg.property?.title}` ? '8px' : '0'
                              }}
                            >
                              <img src={msg.property.thumbnail} alt={msg.property.title} style={{ width: '100%', height: '140px', objectFit: 'cover' }} />
                              <div style={{ padding: '12px', textAlign: 'left' }}>
                                <h5 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: '700', color: '#1e293b', lineHeight: '1.4' }}>{msg.property.title}</h5>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#2563eb' }}>{formatPrice(msg.property.price)}/tháng</span>
                                  <span style={{ fontSize: '12px', color: '#64748b' }}>{msg.property.area || 0} m²</span>
                                </div>
                              </div>
                            </div>
                          )}
                          {msg.message && msg.message !== `[Bất động sản] ${msg.property?.title}` && (
                            <p className="message-text">{msg.message}</p>
                          )}
                          <span className="message-time">{formattedTime}</span>
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
                      onClick={() => setActiveProperty(null)}
                      title="Gỡ đính kèm bất động sản"
                      aria-label="Gỡ đính kèm"
                    >
                      <X size={15} />
                      <span>Gỡ</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Message Input Box */}
              {sendError && <p role="alert" style={{ color: '#b91c1c', margin: '4px 12px' }}>{sendError}</p>}
              <form className="message-input-form" onSubmit={handleSendMessage}>
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
                <button type="submit" className="send-msg-btn">
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
                      <img src={p.thumbnail} alt={p.title} className="property-modal-thumb" />
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
