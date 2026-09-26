import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

const NotFound = () => {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8fafc',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <div style={{
        fontSize: '6rem',
        fontWeight: 800,
        color: '#0f2963',
        lineHeight: 1,
        marginBottom: '1rem',
        letterSpacing: '-2px'
      }}>
        404
      </div>
      <h1 style={{
        fontSize: '1.75rem',
        fontWeight: 700,
        color: '#1e293b',
        marginBottom: '0.75rem'
      }}>
        Không tìm thấy trang
      </h1>
      <p style={{
        fontSize: '1rem',
        color: '#64748b',
        maxWidth: '460px',
        lineHeight: 1.6,
        marginBottom: '2rem'
      }}>
        Đường dẫn bạn yêu cầu không tồn tại hoặc đã được chuyển sang một địa chỉ khác.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link 
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#0f2963',
            color: '#ffffff',
            padding: '10px 20px',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.95rem',
            textDecoration: 'none',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
        >
          <Home size={18} /> Về Trang Chủ
        </Link>
        <button
          onClick={() => window.history.back()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#ffffff',
            color: '#475569',
            border: '1px solid #cbd5e1',
            padding: '10px 20px',
            borderRadius: '8px',
            fontWeight: 500,
            fontSize: '0.95rem',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} /> Quay lại
        </button>
      </div>
    </div>
  );
};

export default NotFound;
