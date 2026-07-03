import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  ChevronLeft, Send, MessageSquare, User, 
  MapPin, Phone, MessageCircle, Home, Compass, Heart, Map
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import './Chat.css';

const Chat = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const targetAgentId = searchParams.get('agentId');
  const targetPropertyId = searchParams.get('propertyId');

  const [currentUser, setCurrentUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [activeProperty, setActiveProperty] = useState(null);
  const [loading, setLoading] = useState(true);

  const messagesEndRef = useRef(null);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auth check
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    } else {
      navigate('/login');
    }
  }, [navigate]);

  // Fetch initial data
  useEffect(() => {
    if (!currentUser) return;

    const fetchInitialData = async () => {
      try {
        setLoading(true);
        // 1. Fetch conversations
        const convRes = await fetch(`${API_BASE_URL}/api/chat/conversations?userId=${currentUser.id}`);
        if (convRes.ok) {
          const convData = await convRes.json();
          setConversations(convData.conversations || []);

          // 2. Determine who to chat with
          if (targetAgentId) {
            const agentIdNum = Number(targetAgentId);
            
            // Check if conversation already exists in lists
            const existing = convData.conversations.find(c => c.partner.id === agentIdNum);
            if (existing) {
              setActiveConversation(existing);
            } else {
              // Create a temporary conversation object for the UI
              const agentDetailsRes = await fetch(`${API_BASE_URL}/api/auth/user/${agentIdNum}`);
              let partnerObj = { id: agentIdNum, name: 'Môi giới', role: 'AGENT' };
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
              const propRes = await fetch(`${API_BASE_URL}/api/properties/${targetPropertyId}`);
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

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!currentUser || !activeConversation) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/chat/messages?userId=${currentUser.id}&otherId=${activeConversation.partner.id}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
      }
    };

    fetchMessages();

    // Poll for new messages every 3 seconds for simulated realtime chat
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [currentUser, activeConversation]);

  // Send message handler
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !activeConversation) return;

    const msgText = newMessage;
    setNewMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: activeConversation.partner.id,
          propertyId: activeProperty?.id || null,
          message: msgText
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        
        // Refresh conversations list to update last message preview
        const convRes = await fetch(`${API_BASE_URL}/api/chat/conversations?userId=${currentUser.id}`);
        if (convRes.ok) {
          const convData = await convRes.json();
          setConversations(convData.conversations || []);
        }
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

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
      <header className="chat-header">
        <div className="chat-header-left">
          <Link to="/" className="back-home-btn">
            <ChevronLeft size={20} />
          </Link>
          <span className="chat-logo" onClick={() => navigate('/')}>Swipe Nest Chat</span>
        </div>
        
        <div className="chat-header-right">
          <div className="header-nav-item" onClick={() => navigate('/swipe/Tất cả')}>
            <Compass size={18} />
            <span>KHÁM PHÁ</span>
          </div>
          <div className="header-nav-item" onClick={() => navigate('/swipe/Tất cả', { state: { activeView: 'saved' } })}>
            <Heart size={18} />
            <span>YÊU THÍCH</span>
          </div>
          <div className="header-nav-item">
            <Map size={18} />
            <span>MAP</span>
          </div>
          <div className="header-nav-item">
            <User size={18} />
            <span>PROFILE</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="chat-main-layout">
        {/* Left pane - conversations */}
        <aside className="chat-sidebar">
          <div className="sidebar-header">
            <h3>Hội thoại</h3>
          </div>
          <div className="conversation-list">
            {loading && conversations.length === 0 ? (
              <p className="chat-status-text">Đang tải cuộc trò chuyện...</p>
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
                        {conv.lastSenderId === currentUser.id ? 'Bạn: ' : ''}
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

              {/* Active Property Context Ribbon */}
              {activeProperty && (
                <div className="active-property-ribbon">
                  <img src={activeProperty.thumbnail} alt={activeProperty.title} className="ribbon-thumb" />
                  <div className="ribbon-info">
                    <h5>{activeProperty.title}</h5>
                    <p className="ribbon-price-address">
                      <span className="price">{formatPrice(activeProperty.price)}/tháng</span>
                      <span className="dot">•</span>
                      <span className="address"><MapPin size={12} /> {activeProperty.district}, {activeProperty.city}</span>
                    </p>
                  </div>
                  <button className="view-property-btn" onClick={() => navigate(`/swipe/Tất cả`, { state: { selectPropertyId: activeProperty.id } })}>
                    Xem tin
                  </button>
                </div>
              )}

              {/* Messages Area */}
              <div className="messages-container">
                {messages.length === 0 ? (
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
                          {msg.property ? (
                            <div 
                              className="chat-property-card" 
                              onClick={() => navigate(`/swipe/Tất cả`, { state: { selectPropertyId: msg.property.id } })}
                              style={{ 
                                cursor: 'pointer', 
                                border: '1px solid #e2e8f0', 
                                borderRadius: '12px', 
                                overflow: 'hidden', 
                                backgroundColor: 'white',
                                width: '260px',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                                display: 'flex',
                                flexDirection: 'column'
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
                          ) : (
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

              {/* Message Input Box */}
              <form className="message-input-form" onSubmit={handleSendMessage}>
                <input 
                  type="text" 
                  placeholder="Nhập tin nhắn..." 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
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
    </div>
  );
};

export default Chat;
