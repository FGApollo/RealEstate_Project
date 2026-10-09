import { useState, useEffect, useRef } from 'react';
import { Camera, X, RotateCcw, Check, RefreshCw, AlertCircle, SwitchCamera } from 'lucide-react';
import './KycCameraModal.css';

// Chuyển DataURL Base64 thành File object
const dataUrlToFile = (dataUrl, fileName) => {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], fileName, { type: mime });
};

const KycCameraModal = ({
  isOpen,
  onClose,
  title = 'Chụp ảnh từ Camera',
  subtitle = 'Vui lòng căn chỉnh hình ảnh vào trong khung và nhấn nút chụp',
  shape = 'card', // 'card' (chữ nhật cho CCCD) hoặc 'face' (hình bầu dục cho khuôn mặt)
  onCapture
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [error, setError] = useState(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState(null);
  const [facingMode, setFacingMode] = useState(shape === 'face' ? 'user' : 'environment');
  const [devices, setDevices] = useState([]);
  const [flash, setFlash] = useState(false);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsVideoReady(false);
  };

  const startCamera = async () => {
    stopCameraStream();
    setIsLoading(true);
    setIsVideoReady(false);
    setError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Trình duyệt của bạn không hỗ trợ camera hoặc đang chạy trong môi trường không an toàn (cần HTTPS hoặc localhost).');
      setIsLoading(false);
      return;
    }

    try {
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsVideoReady(true);
            setIsLoading(false);
          }).catch(() => {
            setIsVideoReady(true);
            setIsLoading(false);
          });
        };
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setIsLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Quyền truy cập Camera đã bị từ chối. Vui lòng cho phép quyền Camera trên thanh địa chỉ của trình duyệt.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('Không tìm thấy thiết bị Camera nào trên máy tính hoặc điện thoại của bạn.');
      } else {
        setError('Không thể kết nối Camera: ' + (err.message || 'Lỗi không xác định'));
      }
    }
  };

  // Khởi động Camera khi modal mở hoặc đổi facingMode
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setCapturedDataUrl(null);
      setError(null);
      setIsVideoReady(false);
      return;
    }

    startCamera();

    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((deviceList) => {
        const videoDevs = deviceList.filter((d) => d.kind === 'videoinput');
        setDevices(videoDevs);
      }).catch(() => {});
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen, facingMode]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    if (width === 0 || height === 0) return;

    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Nếu selfie camera trước, lật gương ngang để hình ảnh tự nhiên
    if (facingMode === 'user' && shape === 'face') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);

    // Tạo Data URL vĩnh viễn (base64) - không bao giờ bị hủy/revoke
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedDataUrl(dataUrl);

    // Tạm ngưng camera để người dùng xem lại ảnh
    stopCameraStream();
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (!capturedDataUrl) return;

    const fileName = shape === 'face' ? 'selfie-camera.jpg' : shape === 'card' ? 'card-camera.jpg' : 'captured.jpg';
    const file = dataUrlToFile(capturedDataUrl, fileName);

    // Truyền cả File (để gửi lên server) và Data URL (để preview ngay lập tức)
    onCapture(file, capturedDataUrl);
    handleClose();
  };

  const handleClose = () => {
    stopCameraStream();
    setCapturedDataUrl(null);
    setError(null);
    setIsVideoReady(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="kyc-camera-modal-backdrop" onClick={handleClose}>
      <div className="kyc-camera-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="kyc-camera-modal-header">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="btn-close-camera" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Viewfinder Body */}
        <div className="kyc-camera-viewfinder-area">
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {flash && <div className="camera-flash-overlay" />}

          {error ? (
            <div className="camera-error-container">
              <AlertCircle size={44} color="#ef4444" />
              <h4>Không thể kết nối Camera</h4>
              <p>{error}</p>
              <button type="button" className="btn-retry-camera" onClick={startCamera}>
                <RefreshCw size={16} /> Thử kết nối lại
              </button>
            </div>
          ) : capturedDataUrl ? (
            <div className="camera-captured-preview-box">
              <img src={capturedDataUrl} alt="Captured preview" className="camera-captured-img" />
              <div className="camera-preview-badge">
                <Check size={14} /> Ảnh chụp xem trước
              </div>
            </div>
          ) : (
            <div className="camera-stream-wrapper">
              {(isLoading || !isVideoReady) && (
                <div className="camera-loading-overlay">
                  <RefreshCw size={32} className="spin-icon" />
                  <span>Đang kết nối Camera...</span>
                </div>
              )}

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onCanPlay={() => {
                  setIsVideoReady(true);
                  setIsLoading(false);
                }}
                className={`camera-video-elem ${facingMode === 'user' && shape === 'face' ? 'mirrored' : ''}`}
              />

              {/* Lớp khung hướng dẫn căn chỉnh (Framing Guide) */}
              <div className="camera-guide-overlay">
                {shape === 'card' ? (
                  <div className="card-frame-guide">
                    <div className="guide-corner top-left" />
                    <div className="guide-corner top-right" />
                    <div className="guide-corner bottom-left" />
                    <div className="guide-corner bottom-right" />
                    <span className="guide-text">Căn chỉnh thẻ CCCD trọn vào khung chữ nhật này</span>
                  </div>
                ) : (
                  <div className="face-frame-guide">
                    <div className="face-oval-line" />
                    <span className="guide-text">Đưa khuôn mặt vào trong khung bầu dục này</span>
                  </div>
                )}
              </div>

              {/* Nút đổi camera trước/sau nếu có nhiều camera */}
              {devices.length > 1 && (
                <button
                  type="button"
                  className="btn-switch-camera"
                  onClick={toggleFacingMode}
                  title="Đổi camera trước/sau"
                >
                  <SwitchCamera size={18} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="kyc-camera-modal-footer">
          {capturedDataUrl ? (
            <div className="camera-actions-review">
              <button type="button" className="btn-camera-retake" onClick={handleRetake}>
                <RotateCcw size={16} /> Chụp lại
              </button>
              <button type="button" className="btn-camera-confirm" onClick={handleConfirm}>
                <Check size={16} /> Sử dụng ảnh này
              </button>
            </div>
          ) : (
            <div className="camera-actions-capture">
              <button
                type="button"
                className="btn-camera-snap"
                onClick={handleCapture}
                disabled={isLoading || !isVideoReady || Boolean(error)}
              >
                <div className="snap-inner-circle">
                  <Camera size={26} color="#ffffff" />
                </div>
                <span>Chụp ảnh</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KycCameraModal;
