'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import TextEditor from './TextEditor';
import { detectForeground } from '../utils/foregroundDetection';
import { debounce } from 'lodash'; // If lodash is not available, use a simple debounce util

// Update the type definition to avoid the timers module error
type TimeoutRef = ReturnType<typeof setTimeout> | null;

interface TextSettings {
  content: string;
  font: string;
  size: number;
  color: string;
  x: number;
  y: number;
}

export default function ImageTextOverlay() {
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [textSettings, setTextSettings] = useState<TextSettings>({
    content: 'Your custom text here',
    font: 'Arial',
    size: 24,
    color: '#ffffff',
    x: 50,
    y: 50,
  });
  const [showMask, setShowMask] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const foregroundImageRef = useRef<HTMLImageElement | null>(null);
  const foregroundUrlRef = useRef<string | null>(null);
  const foregroundMaskRef = useRef<Uint8ClampedArray | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [loadingProgress, setLoadingProgress] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const workerTimeoutRef = useRef<TimeoutRef>(null);
  const dragRAF = useRef<number | null>(null);

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous state
    if (foregroundMaskRef.current) {
      foregroundMaskRef.current = null;
    }

    if (originalImageRef.current) {
      originalImageRef.current = null;
    }

    if (foregroundUrlRef.current) {
      URL.revokeObjectURL(foregroundUrlRef.current);
      foregroundUrlRef.current = null;
    }

    if (foregroundImageRef.current) {
      foregroundImageRef.current = null;
    }

    if (workerTimeoutRef.current) {
      clearTimeout(workerTimeoutRef.current);
    }

    setIsProcessing(true);
    setLoadingProgress(10);
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImage(event.target.result as string);
      }
    };
    reader.onerror = () => {
      setIsProcessing(false);
      alert('Error reading file. Please try another image.');
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload({ target: { files: [file] } } as any);
    }
  };

  // Process the image with background removal when image is loaded
  useEffect(() => {
    if (!image || !imageFile) return;

    setIsProcessing(true);
    setLoadingProgress(20);

    const img = new Image();
    img.onload = async () => {
      // Ensure image has valid dimensions
      if (img.width === 0 || img.height === 0) {
        setIsProcessing(false);
        alert('Invalid image dimensions. Please try another image.');
        return;
      }

      // Store the original image for reuse
      originalImageRef.current = img;
      setLoadingProgress(30);

      try {
        // Process the image with background removal
        const result = await detectForeground(
          imageFile,
          undefined,
          true,
          (progress) => {
            // Update progress in UI from 30% to 80%
            setLoadingProgress(30 + Math.floor(progress * 0.5));
          }
        );

        if (!result.mask || !result.foregroundUrl) {
          throw new Error('Background removal failed to return valid results');
        }

        // Store the foreground mask for later use
        foregroundMaskRef.current = result.mask;
        foregroundUrlRef.current = result.foregroundUrl;

        // Load the foreground image
        const foregroundImg = new Image();
        foregroundImg.onload = () => {
          foregroundImageRef.current = foregroundImg;
          setLoadingProgress(90);

          // Set up canvas dimensions based on the image
          if (canvasRef.current && textCanvasRef.current && maskCanvasRef.current) {
            const maxDimension = 1200;
            let canvasWidth = img.width;
            let canvasHeight = img.height;

            // Resize large images for better performance
            if (canvasWidth > maxDimension || canvasHeight > maxDimension) {
              if (canvasWidth > canvasHeight) {
                const ratio = maxDimension / canvasWidth;
                canvasWidth = maxDimension;
                canvasHeight = Math.floor(canvasHeight * ratio);
              } else {
                const ratio = maxDimension / canvasHeight;
                canvasHeight = maxDimension;
                canvasWidth = Math.floor(canvasWidth * ratio);
              }
            }

            canvasWidth = Math.max(1, canvasWidth);
            canvasHeight = Math.max(1, canvasHeight);

            setCanvasSize({ width: canvasWidth, height: canvasHeight });

            canvasRef.current.width = canvasWidth;
            canvasRef.current.height = canvasHeight;
            textCanvasRef.current.width = canvasWidth;
            textCanvasRef.current.height = canvasHeight;
            maskCanvasRef.current.width = canvasWidth;
            maskCanvasRef.current.height = canvasHeight;

            // Display mask if enabled
            if (showMask && maskCanvasRef.current) {
              const maskCtx = maskCanvasRef.current.getContext('2d', { willReadFrequently: true });
              if (maskCtx) {
                // Create a red overlay for the mask
                const maskImageData = maskCtx.createImageData(canvasWidth, canvasHeight);
                for (let i = 0; i < result.mask.length; i++) {
                  const value = result.mask[i];
                  maskImageData.data[i * 4] = 255; // Red
                  maskImageData.data[i * 4 + 1] = 0; // Green
                  maskImageData.data[i * 4 + 2] = 0; // Blue
                  maskImageData.data[i * 4 + 3] = value; // Alpha (from mask)
                }
                maskCtx.putImageData(maskImageData, 0, 0);
              }
            }

            // Initial render with brief timeout to allow UI update
            setTimeout(() => {
              renderCompositeImage();
              setIsProcessing(false);
              setLoadingProgress(100);
            }, 50);
          }
        };

        foregroundImg.onerror = () => {
          console.error('Error loading foreground image');
          setIsProcessing(false);
          alert('Error processing image foreground. Please try again.');
        };

        foregroundImg.src = result.foregroundUrl;
      } catch (error) {
        console.error('Error during background removal:', error);
        setIsProcessing(false);
        alert('Error removing background. Please try a different image.');
      }
    };

    img.onerror = () => {
      console.error('Error loading image');
      setIsProcessing(false);
      alert('Error loading image. Please try another file.');
    };

    img.src = image;

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (workerTimeoutRef.current) {
        clearTimeout(workerTimeoutRef.current);
      }
    };
  }, [image, imageFile, showMask]);

  // Render the composite image with text behind foreground
  const renderCompositeImage = useCallback(() => {
    if (
      !canvasRef.current ||
      !textCanvasRef.current ||
      !originalImageRef.current ||
      !foregroundImageRef.current ||
      !foregroundMaskRef.current
    ) {
      return;
    }

    const mainCtx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    const textCtx = textCanvasRef.current.getContext('2d', { willReadFrequently: true });

    if (!mainCtx || !textCtx) return;

    const { width, height } = canvasSize;

    // Safety check for dimensions
    if (width <= 0 || height <= 0) {
      console.error('Invalid canvas dimensions:', width, height);
      return;
    }

    try {
      // Step 1: Clear all canvases
      mainCtx.clearRect(0, 0, width, height);
      textCtx.clearRect(0, 0, width, height);

      // Step 2: Draw the background (original image)
      mainCtx.drawImage(originalImageRef.current, 0, 0, width, height);

      // Step 3: Draw text on the text canvas
      textCtx.font = `${textSettings.size}px ${textSettings.font}`;
      textCtx.fillStyle = textSettings.color;
      textCtx.textAlign = 'center';
      textCtx.textBaseline = 'middle';

      // Calculate text position based on percentages
      const textX = (textSettings.x / 100) * width;
      const textY = (textSettings.y / 100) * height;

      // Handle multi-line text
      const lines = textSettings.content.split('\n');
      const lineHeight = textSettings.size * 1.2;

      lines.forEach((line, index) => {
        textCtx.fillText(
          line,
          textX,
          textY + (index - lines.length / 2 + 0.5) * lineHeight
        );
      });

      // Step 4: Get image data for compositing
      const bgImageData = mainCtx.getImageData(0, 0, width, height);
      const bgData = bgImageData.data;

      const textImageData = textCtx.getImageData(0, 0, width, height);
      const textData = textImageData.data;

      // Step 5: Composite - place text behind foreground
      // This approach keeps text only where there's no foreground
      for (let i = 0; i < bgData.length; i += 4) {
        const maskIndex = i / 4;

        // If this pixel is part of the foreground mask, we'll draw the foreground later
        if (foregroundMaskRef.current[maskIndex] !== 255) {
          // This is a background pixel, check if there's text here
          if (textData[i + 3] > 0) {
            // Place text pixel
            bgData[i] = textData[i];
            bgData[i + 1] = textData[i + 1];
            bgData[i + 2] = textData[i + 2];
            bgData[i + 3] = textData[i + 3];
          }
        }
      }

      // Update background with text composite
      mainCtx.putImageData(bgImageData, 0, 0);

      // Step 6: Draw the foreground with transparency on top
      mainCtx.drawImage(foregroundImageRef.current, 0, 0, width, height);

      // Store processed image for download
      setProcessedImage(canvasRef.current.toDataURL('image/png'));
    } catch (error) {
      console.error('Error during rendering:', error);
    }
  }, [textSettings, canvasSize]);

  // Effect to update image when text settings change
  useEffect(() => {
    if (
      !image ||
      isProcessing ||
      canvasSize.width === 0 ||
      canvasSize.height === 0 ||
      !foregroundImageRef.current
    )
      return;

    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Schedule a new render with debouncing for dragging operations
    if (isDragging) {
      // Less frequent updates during dragging for better performance
      animationFrameRef.current = requestAnimationFrame(() => {
        setTimeout(renderCompositeImage, 50);
      });
    } else {
      // Immediate update when not dragging
      animationFrameRef.current = requestAnimationFrame(renderCompositeImage);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    textSettings,
    renderCompositeImage,
    isProcessing,
    image,
    isDragging,
    canvasSize,
    foregroundImageRef.current,
  ]);

  // Effect to update the mask display when showMask changes
  useEffect(() => {
    if (!maskCanvasRef.current || !foregroundMaskRef.current || isProcessing) return;

    const maskCtx = maskCanvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) return;

    if (showMask) {
      const { width, height } = canvasSize;
      const maskImageData = maskCtx.createImageData(width, height);

      for (let i = 0; i < foregroundMaskRef.current.length; i++) {
        const value = foregroundMaskRef.current[i];
        maskImageData.data[i * 4] = 255; // Red
        maskImageData.data[i * 4 + 1] = 0; // Green
        maskImageData.data[i * 4 + 2] = 0; // Blue
        maskImageData.data[i * 4 + 3] = value * 0.5; // Semi-transparent alpha
      }

      maskCtx.putImageData(maskImageData, 0, 0);
    } else {
      // Clear the mask canvas when not showing mask
      maskCtx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    }
  }, [showMask, foregroundMaskRef.current, canvasSize, isProcessing]);

  // Handle text position dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || isProcessing) return;
    setIsDragging(true);
    updateTextPosition(e);
    document.body.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current || isProcessing) return;
    if (dragRAF.current) cancelAnimationFrame(dragRAF.current);
    dragRAF.current = requestAnimationFrame(() => updateTextPosition(e));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    document.body.style.cursor = '';
    if (dragRAF.current) cancelAnimationFrame(dragRAF.current);
  };

  const updateTextPosition = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasContainerRef.current || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Update text position with bounds checking
    const boundedX = Math.max(0, Math.min(100, x));
    const boundedY = Math.max(0, Math.min(100, y));

    setTextSettings((prev) => ({
      ...prev,
      x: boundedX,
      y: boundedY,
    }));
  }, []);

  // Handle download of final image
  const handleDownload = () => {
    if (!processedImage) return;

    const link = document.createElement('a');
    link.href = processedImage;
    link.download = 'overlay-image.png';
    link.click();
  };

  // Clean up object URLs when component unmounts
  useEffect(() => {
    return () => {
      if (foregroundUrlRef.current) {
        URL.revokeObjectURL(foregroundUrlRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col md:flex-row gap-8 w-full max-w-7xl mx-auto">
      <div className="flex-1">
        <div
          ref={canvasContainerRef}
          className={`relative border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50 h-[400px] flex items-center justify-center transition-all duration-200 ${
            isDragActive ? 'ring-4 ring-primary/60 bg-primary/10' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragActive && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-primary/30 bg-blur-lg pointer-events-none">
              <span className="text-2xl font-bold text-primary drop-shadow">
                Drop your image here
              </span>
            </div>
          )}

          {image ? (
            <>
              {/* Hidden canvases for processing */}
              <canvas ref={textCanvasRef} className="hidden" />

              {/* Mask overlay canvas */}
              <canvas
                ref={maskCanvasRef}
                className={`absolute top-0 left-0 z-10 ${showMask ? '' : 'hidden'}`}
              />

              {/* Main visible canvas */}
              <canvas
                ref={canvasRef}
                className={`max-w-full max-h-full object-contain relative z-0 ${
                  isDragging ? 'cursor-grabbing' : 'cursor-move'
                }`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />

              {/* Overlay to show where text is during dragging */}
              {isDragging && (
                <div
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: `${textSettings.x}%`,
                    top: `${textSettings.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    border: '2px solid white',
                    borderRadius: '50%',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
                  }}
                />
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <span className="text-lg font-semibold text-gray-400">
                Drag & drop an image here
              </span>
              <span className="text-xs text-gray-400 mt-2">or click to select</span>
            </div>
          )}

          {/* Optional: Click to select fallback */}
          {!image && !isProcessing && (
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="absolute inset-0 opacity-0 cursor-pointer z-20"
              tabIndex={0}
              aria-label="Upload image"
            />
          )}
        </div>

        <div className="mt-4 flex justify-between items-center">
          {image && (
            <div className="text-sm text-gray-500">
              {isDragging ? (
                <span className="text-blue-500 font-medium">Positioning text...</span>
              ) : (
                <span>Drag on canvas to position text or use sliders</span>
              )}
            </div>
          )}

          {processedImage && (
            <button
              onClick={handleDownload}
              className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
              disabled={isProcessing}
            >
              Download Image
            </button>
          )}
        </div>
      </div>

      <div className="flex-1">
        <TextEditor
          textSettings={textSettings}
          setTextSettings={setTextSettings}
          disabled={isProcessing}
        />

        <div className="mt-4 p-4 bg-gray-100 rounded-md">
          <div className="flex items-center mb-2">
            <h3 className="text-sm font-medium">Advanced Options</h3>
          </div>

          <label className="flex items-center space-x-2 mb-2">
            <input
              type="checkbox"
              checked={showMask}
              onChange={(e) => setShowMask(e.target.checked)}
              disabled={isProcessing || !image}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm">Show Foreground Mask</span>
          </label>

          <p className="text-xs text-gray-500 mt-2">
            Powered by IMG.LY Background Removal - processing happens in your browser
          </p>
        </div>
      </div>
    </div>
  );
}