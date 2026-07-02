import { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface ImageViewerProps {
  src: string;
  onClose: () => void;
}

export default function ImageViewer({ src, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(3, prev + 0.25));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.25));
    setPosition({ x: 0, y: 0 });
  };

  const handleRotate = () => {
    setRotation(prev => prev + 90);
  };

  const handleDoubleClick = () => {
    if (scale === 1) {
      setScale(2);
    } else {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
        <button
          onClick={handleZoomOut}
          className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-white text-sm min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-white/30 mx-1" />
        <button
          onClick={handleRotate}
          className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <RotateCw className="w-5 h-5" />
        </button>
      </div>

      <img
        ref={imgRef}
        src={src}
        alt="图片预览"
        className="max-w-full max-h-full object-contain select-none"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
          transition: isDragging ? 'none' : 'transform 0.2s ease',
        }}
        draggable={false}
      />
    </div>
  );
}
