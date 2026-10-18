import React, { useState, useEffect, useRef } from 'react';
import { Building2, Image as ImageIcon } from 'lucide-react';
import './ImageLoadingSkeleton.css';

/**
 * ImageLoadingSkeleton - Progressive image loader with smooth shimmer placeholder
 * Resolves cache races and lazy-load deadlocks in scrollable chat threads.
 */
const ImageLoadingSkeleton = ({
  src,
  alt = 'Hình ảnh',
  className = '',
  imageClassName = '',
  style = {},
  aspectRatio,
  objectFit = 'cover',
  fallbackIcon: FallbackIcon = Building2,
  fallbackText = '',
  borderRadius,
  width,
  height,
  onClick,
  ...rest
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(!src);
  const imgRef = useRef(null);

  // Sync state whenever src changes & detect instant cache hits
  useEffect(() => {
    if (!src) {
      setHasError(true);
      setIsLoaded(false);
      return;
    }

    setHasError(false);
    setIsLoaded(false);

    // If the browser already has the image cached and completed
    if (imgRef.current && imgRef.current.complete) {
      if (imgRef.current.naturalWidth > 0) {
        setIsLoaded(true);
      } else {
        setHasError(true);
      }
    }
  }, [src]);

  const containerStyle = {
    ...style,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(borderRadius ? { borderRadius } : {})
  };

  const imageStyle = {
    objectFit,
    ...(borderRadius ? { borderRadius } : {})
  };

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(false);
  };

  return (
    <div
      className={`img-skeleton-container ${className}`}
      style={containerStyle}
      onClick={onClick}
    >
      {/* Shimmer Placeholder while loading */}
      {!isLoaded && !hasError && (
        <div className="img-skeleton-shimmer" style={{ borderRadius }}>
          {FallbackIcon && (
            <FallbackIcon size={24} className="img-skeleton-icon" />
          )}
        </div>
      )}

      {/* Error / Missing Source Fallback */}
      {hasError ? (
        <div className="img-skeleton-fallback" style={{ borderRadius }}>
          {FallbackIcon ? (
            <FallbackIcon size={24} />
          ) : (
            <ImageIcon size={24} />
          )}
          {fallbackText && <span>{fallbackText}</span>}
        </div>
      ) : (
        /* Actual Image: Eager loading to avoid lazy-load deadlock in scroll containers */
        <img
          ref={(node) => {
            imgRef.current = node;
            if (node && node.complete && node.naturalWidth > 0 && !isLoaded) {
              setIsLoaded(true);
            }
          }}
          src={src}
          alt={alt}
          decoding="async"
          className={`img-skeleton-element ${isLoaded ? 'img-loaded' : ''} ${imageClassName}`}
          style={imageStyle}
          onLoad={handleLoad}
          onError={handleError}
          {...rest}
        />
      )}
    </div>
  );
};

export default ImageLoadingSkeleton;
