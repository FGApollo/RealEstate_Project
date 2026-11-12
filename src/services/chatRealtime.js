// Tín hiệu realtime cho chat.
//
// Trình duyệt không đọc trực tiếp bảng messages. Server (Express) phát một sự kiện Supabase Realtime
// Broadcast vào kênh riêng của từng tài khoản mỗi khi có tin mới hoặc tin được đánh dấu đã xem.
// Sự kiện không chứa nội dung: nhận được tín hiệu thì gọi lại API chat (có xác thực) để lấy dữ liệu.
// Polling vẫn chạy làm dự phòng, thưa khi kênh đang kết nối và dày hơn khi mất kết nối.
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { supabaseClient, isSupabaseRealtimeConfigured } from './supabaseClient';

export const POLL_WHEN_CONNECTED_MS = 20000;
export const POLL_WHEN_DISCONNECTED_MS = 4000;
const SIGNAL_DEBOUNCE_MS = 300;

// Bắt đầu nghe tín hiệu chat của người đang đăng nhập. onSignal được gọi (đã gom nhịp) mỗi khi cần tải lại dữ liệu.
export function startChatRealtime(onSignal) {
  let stopped = false;
  let channel = null;
  let connected = false;
  let connecting = false;
  let debounceTimer = null;

  const signal = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { if (!stopped) onSignal(); }, SIGNAL_DEBOUNCE_MS);
  };

  const disconnect = () => {
    connected = false;
    if (channel) {
      supabaseClient.removeChannel(channel);
      channel = null;
    }
  };

  const connect = async () => {
    if (stopped || connecting || !isSupabaseRealtimeConfigured) return;
    connecting = true;
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/chat/realtime`);
      if (!response.ok) return;
      const { topic } = await response.json();
      if (stopped || !topic) return;
      disconnect();
      channel = supabaseClient
        .channel(topic)
        .on('broadcast', { event: 'new_message' }, signal)
        .on('broadcast', { event: 'messages_read' }, signal)
        .subscribe((status) => {
          const wasConnected = connected;
          connected = status === 'SUBSCRIBED';
          // Vừa kết nối (lại): tải lại một lần để bù những tin có thể đã lỡ.
          if (connected && !wasConnected) signal();
        });
    } catch {
      connected = false;
    } finally {
      connecting = false;
    }
  };

  // Quay lại tab mà kênh đã rớt: kết nối lại, đồng thời tải lại dữ liệu ngay.
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || stopped) return;
    if (!connected) {
      disconnect();
      connect();
    }
    signal();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  connect();

  return {
    isConnected: () => connected,
    stop() {
      stopped = true;
      clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      disconnect();
    }
  };
}

// Polling dự phòng tự điều chỉnh nhịp theo trạng thái kết nối realtime. Trả về hàm dừng.
export function startAdaptivePolling(task, isConnected) {
  let stopped = false;
  let timer = null;
  const schedule = () => {
    timer = setTimeout(async () => {
      if (stopped) return;
      try { await task(); } catch { /* lần sau thử lại */ }
      if (!stopped) schedule();
    }, isConnected() ? POLL_WHEN_CONNECTED_MS : POLL_WHEN_DISCONNECTED_MS);
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

// Tin đang gửi mà server đã có bản chính thức (cùng người gửi, cùng nội dung, cùng số ảnh) trong các tin mới nhất.
// Xảy ra khi tín hiệu realtime về trước phản hồi của lệnh gửi: bỏ bản tạm để tin không hiện hai lần.
const alreadyOnServer = (pendingMessage, incoming) => incoming.slice(-10).some((message) => (
  Number(message.sender_id) === Number(pendingMessage.sender_id)
  && (message.message || '') === (pendingMessage.message || '')
  && (message.attachments?.length || 0) === (pendingMessage.attachments?.length || 0)
));

// Ghép danh sách tin từ server với các tin đang gửi dở (chưa có trên server) để chúng không biến mất khi tải lại.
// Tin gửi lỗi luôn được giữ lại để người dùng thấy và gửi lại.
export function mergeServerMessages(previous, incoming) {
  const pending = previous.filter((message) => message.is_failed
    || (message.is_optimistic && !alreadyOnServer(message, incoming)));
  const merged = pending.length ? [...incoming, ...pending] : incoming;
  const unchanged = previous.length === merged.length
    && previous.every((message, index) => message.id === merged[index]?.id && message.is_read === merged[index]?.is_read);
  return unchanged ? previous : merged;
}
