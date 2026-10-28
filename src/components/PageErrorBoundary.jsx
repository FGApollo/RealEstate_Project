import { Component } from 'react';

// A failed lazy chunk (for example on an unstable mobile connection) must leave
// a recovery action instead of a blank application.
export default class PageErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="page-failure" role="alert">
      <h1>Chưa thể mở trang</h1><p>Kiểm tra kết nối mạng rồi thử tải lại. Phiên đăng nhập của bạn sẽ được kiểm tra lại an toàn.</p>
      <button type="button" onClick={() => window.location.reload()}>Tải lại trang</button><a href="/">Về trang chủ</a>
    </main>;
    return this.props.children;
  }
}
