import { useState, useEffect } from 'react';
import { CheckCircle2, Mail, CreditCard, Sparkles, AlertCircle, Clock } from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import './AgentPricing.css';

const AgentPricing = ({ currentUser }) => {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSubscription = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/subscriptions?userId=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
    } catch (err) {
      console.error('Error fetching subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [currentUser.id]);

  const handleSubscribe = async (planName, priceVnd) => {
    setActionLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: currentUser.id,
          planName: planName,
          priceVnd: priceVnd,
          status: 'ACTIVE',
          months: 1
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
        setMessage(planName === 'FREE_TRIAL' 
          ? 'Kích hoạt dùng thử 1 tháng thành công!' 
          : 'Đăng ký gói trả phí 1.000.000đ/tháng thành công!'
        );
      } else {
        setMessage('Có lỗi xảy ra, vui lòng thử lại.');
      }
    } catch (err) {
      console.error('Error subscribing:', err);
      setMessage('Lỗi kết nối máy chủ.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
  };

  return (
    <div className="pricing-panel-container">
      <div className="pricing-header">
        <h1>Gói Dịch Vụ & Bảng Giá</h1>
        <p className="subtitle">Nâng cấp tài khoản của bạn để mở khóa các công cụ và gia tăng khả năng tiếp cận khách hàng.</p>
      </div>

      {message && (
        <div className="pricing-message-banner">
          <AlertCircle size={18} />
          <span>{message}</span>
        </div>
      )}

      {/* Current Subscription Status */}
      <div className="current-subscription-card">
        <div className="status-header">
          <Clock size={20} color="#3b82f6" />
          <h3>Trạng thái tài khoản của bạn</h3>
        </div>
        
        {loading ? (
          <p className="loading-text">Đang kiểm tra thông tin tài khoản...</p>
        ) : subscription ? (
          <div className="subscription-details">
            <p>
              Gói hiện tại: <strong>{subscription.plan_name === 'FREE_TRIAL' ? 'Dùng thử miễn phí (Free Trial)' : 'Thành viên trả phí (Paid Premium)'}</strong>
            </p>
            <p>
              Chi phí: <strong>{formatPrice(subscription.price_vnd)} / tháng</strong>
            </p>
            <p>
              Ngày hết hạn: <strong>{formatDate(subscription.end_date)}</strong>
            </p>
            <span className="badge-active">ĐANG HOẠT ĐỘNG</span>
          </div>
        ) : (
          <div className="subscription-details">
            <p>Gói hiện tại: <strong>Chưa đăng ký gói (Standard)</strong></p>
            <p>Bạn đang sử dụng các tính năng cơ bản của tài khoản môi giới.</p>
            <span className="badge-inactive">CHƯA KÍCH HOẠT</span>
          </div>
        )}
      </div>

      {/* Plans Grid */}
      <div className="pricing-grid">
        {/* Plan 1: Free Trial / Standard Paid */}
        <div className={`pricing-card ${subscription?.plan_name === 'FREE_TRIAL' ? 'active-plan' : ''}`}>
          <div className="plan-header">
            <h3>Miễn Phí Dùng Thử</h3>
            <div className="price-row">
              <span className="amount">0đ</span>
              <span className="period">/ 1 tháng đầu</span>
            </div>
            <p className="plan-desc">Sau 1 tháng dùng thử, tự động gia hạn gói cơ bản với mức phí chỉ 1.000.000đ / tháng.</p>
          </div>

          <ul className="plan-features">
            <li>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Đăng tin bất động sản cơ bản</span>
            </li>
            <li>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Quản lý tin đăng và bộ lọc</span>
            </li>
            <li>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Tiếp cận khách hàng tìm kiếm tự nhiên</span>
            </li>
            <li>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Hỗ trợ email chuẩn</span>
            </li>
          </ul>

          <div className="plan-action">
            {subscription?.plan_name === 'FREE_TRIAL' ? (
              <button className="btn-plan-disabled" disabled>
                Đang sử dụng gói dùng thử
              </button>
            ) : subscription?.plan_name === 'PAID' ? (
              <button className="btn-plan-disabled" disabled>
                Bạn đang sử dụng gói Premium cao hơn
              </button>
            ) : (
              <button 
                className="btn-plan-action" 
                onClick={() => handleSubscribe('FREE_TRIAL', 0)}
                disabled={actionLoading}
              >
                Kích hoạt dùng thử ngay
              </button>
            )}
          </div>
        </div>

        {/* Plan 1.5: Paid Premium (Simulated Option) */}
        <div className={`pricing-card popular-plan ${subscription?.plan_name === 'PAID' ? 'active-plan' : ''}`}>
          <div className="popular-badge">KHUYÊN DÙNG</div>
          <div className="plan-header">
            <h3>Gói Premium</h3>
            <div className="price-row">
              <span className="amount">1.000.000đ</span>
              <span className="period">/ tháng</span>
            </div>
            <p className="plan-desc">Gói tiêu chuẩn dành cho môi giới chuyên nghiệp cần duy trì hoạt động lâu dài.</p>
          </div>

          <ul className="plan-features">
            <li>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Duy trì đăng tin không giới hạn</span>
            </li>
            <li>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Quản lý tin đăng và bộ lọc nâng cao</span>
            </li>
            <li>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Tiếp cận khách hàng ổn định</span>
            </li>
            <li>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Hỗ trợ kỹ thuật 24/7</span>
            </li>
          </ul>

          <div className="plan-action">
            {subscription?.plan_name === 'PAID' ? (
              <button className="btn-plan-disabled" disabled>
                Gói Premium đang hoạt động
              </button>
            ) : (
              <button 
                className="btn-plan-action" 
                onClick={() => handleSubscribe('PAID', 1000000)}
                disabled={actionLoading}
              >
                Đăng ký gói Premium
              </button>
            )}
          </div>
        </div>

        {/* Plan 2: Plus Plan */}
        <div className="pricing-card premium-plan">
          <div className="plan-header">
            <div className="premium-icon-row">
              <Sparkles size={20} color="#f59e0b" />
              <span>Gói Nâng Cao (Plus Plan)</span>
            </div>
            <div className="price-row">
              <span className="amount-contact">Liên hệ</span>
            </div>
            <p className="plan-desc">Giải pháp tối ưu hóa tối đa doanh số dành cho các nhà môi giới xuất sắc hoặc doanh nghiệp.</p>
          </div>

          <ul className="plan-features">
            <li>
              <CheckCircle2 size={18} color="#f59e0b" />
              <span style={{ fontWeight: 700 }}>Đẩy tin đăng lên đầu (Promote posts)</span>
            </li>
            <li>
              <CheckCircle2 size={18} color="#f59e0b" />
              <span style={{ fontWeight: 700 }}>Tăng khả năng tiếp cận khách hàng tiềm năng (Increase reachout)</span>
            </li>
            <li>
              <CheckCircle2 size={18} color="#f59e0b" />
              <span style={{ fontWeight: 700 }}>Công cụ quản lý bán hàng nâng cao (Higher sales tools)</span>
            </li>
            <li>
              <CheckCircle2 size={18} color="#f59e0b" />
              <span>Chăm sóc khách hàng VIP & hỗ trợ hotline riêng</span>
            </li>
          </ul>

          <div className="plan-action">
            <a 
              href="mailto:contact@swipenest.com?subject=Đăng ký gói Plus Plan Swipe Nest" 
              className="btn-plan-contact"
            >
              Liên hệ chúng tôi
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentPricing;
