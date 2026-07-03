import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Phone, Shield, User, Sparkles, MessageCircle } from 'lucide-react';
import { API_BASE_URL } from '../../../config';
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
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

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
      const res = await fetch(`${API_BASE_URL}/api/properties`);
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
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: activeConversation.partner.id,
          propertyId: property.id,
          message: `[Bất động sản] ${property.title}`
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        fetchConversations();
        setShowPropertySelector(false);
      }
    } catch (err) {
      console.error('Error sending property card message:', err);
    }
  };

  // Fetch conversations
  const fetchConversations = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/conversations?userId=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        
        // Keep active conversation reference updated with new status/last message
        if (activeConversation) {
          const updated = data.conversations.find(c => c.partner.id === activeConversation.partner.id);
          if (updated) {
            setActiveConversation(updated);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  // Fetch initial conversations list
  useEffect(() => {
    fetchConversations();
    setLoading(false);
  }, [currentUser]);

  // Fetch messages for active conversation
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

    // Poll for simulation
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [currentUser, activeConversation?.partner?.id]);

  // Send message
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
          message: msgText
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        fetchConversations();
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Funnel stage change handler
  const handleStageChange = async (stageKey) => {
    if (!currentUser || !activeConversation) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/funnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: currentUser.id,
          userId: activeConversation.partner.id,
          stage: stageKey
        })
      });

      if (res.ok) {
        // Update local state directly to show immediate response
        setActiveConversation(prev => ({
          ...prev,
          funnelStage: stageKey
        }));
        
        // Refresh conversations list to update tags
        fetchConversations();
      }
    } catch (err) {
      console.error('Error updating funnel stage:', err);
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
            <p className="status-loading">Đang tải...</p>
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
                    setActiveConversation(conv);
                  }}
                >
                  <div className="avatar-wrap">
                    {conv.partner?.avatar ? (
                      <img src={conv.partner.avatar} alt="avatar" />
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
                    </div>
                    <p className="last-msg">
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

            {/* Message Thread */}
            <div className="agent-messages-container">
              {messages.length === 0 ? (
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
                            <img src={activeConversation.partner.avatar} alt="avatar" />
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
                            style={{ 
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
                                <span style={{ fontSize: '13px', fontWeight: '700', color: '#2563eb' }}>{(msg.property.price || 0).toLocaleString('vi-VN')} VND/tháng</span>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>{msg.property.area || 0} m²</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="msg-txt">{msg.message}</p>
                        )}
                        <span className="msg-time">{formattedTime}</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form className="agent-chat-input-form" onSubmit={handleSendMessage}>
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
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <button type="submit" className="send-btn">
                <Send size={18} />
              </button>
            </form>
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
                    <img src={p.thumbnail} alt={p.title} style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover' }} />
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
    </div>
  );
};

export default AgentChat;
