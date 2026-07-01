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
                        {msg.property && (
                          <div className="msg-property-wrap">
                            <img src={msg.property.thumbnail} alt="Prop" />
                            <div className="msg-prop-details">
                              <h6>{msg.property.title}</h6>
                              <p>{(msg.property.price || 0).toLocaleString('vi-VN')} VND/tháng</p>
                            </div>
                          </div>
                        )}
                        <p className="msg-txt">{msg.message}</p>
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
    </div>
  );
};

export default AgentChat;
