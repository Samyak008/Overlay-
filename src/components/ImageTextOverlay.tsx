'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import TextEditor from './TextEditor';
import { detectForeground } from '../utils/foregroundDetection';

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
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [textSettings, setTextSettings] = useState<TextSettings>({
    content: 'Your custom text here',
    font: 'Arial',
    size: 24,
    color: '#ffffff',
    x: 50,
    y: 50,
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const foregroundMaskRef = useRef<Uint8ClampedArray | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [loadingProgress, setLoadingProgress] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const workerTimeoutRef = useRef<TimeoutRef>(null);

  // Handle image upload with improved error handling
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

    if (workerTimeoutRef.current) {
      clearTimeout(workerTimeoutRef.current);
    }

    setIsProcessing(true);
    setLoadingProgress(10);

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

  // Create foreground mask once when image is loaded with enhanced error handling and performance
  useEffect(() => {
    if (!image) return;

    setIsProcessing(true);
    setLoadingProgress(20);

    const img = new Image();

    img.onload = () => {
      // Ensure image has valid dimensions
      if (img.width === 0 || img.height === 0) {
        setIsProcessing(false);
        alert('Invalid image dimensions. Please try another image.');
        return;
      }

      // Store the original image for reuse
      originalImageRef.current = img;
      setLoadingProgress(40);

      // Use setTimeout to allow UI to update before heavy processing
      setTimeout(() => {
        try {
          // Set up canvas dimensions
          if (canvasRef.current && textCanvasRef.current && maskCanvasRef.current) {
            // Constrain maximum dimensions to improve performance
            const maxDimension = 1200; // Limit image processing size for performance
            let canvasWidth = img.width;
            let canvasHeight = img.height;

            // Resize large images to improve performance while maintaining aspect ratio
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

            // Ensure dimensions are at least 1 pixel
            canvasWidth = Math.max(1, canvasWidth);
            canvasHeight = Math.max(1, canvasHeight);

            setCanvasSize({ width: canvasWidth, height: canvasHeight });
            setLoadingProgress(60);

            // Set up main canvas
            canvasRef.current.width = canvasWidth;
            canvasRef.current.height = canvasHeight;

            // Set up text canvas (for rendering text layer only)
            textCanvasRef.current.width = canvasWidth;
            textCanvasRef.current.height = canvasHeight;

            // Set up mask canvas (for storing foreground mask)
            maskCanvasRef.current.width = canvasWidth;
            maskCanvasRef.current.height = canvasHeight;

            // Using a separate timeout for the most intensive part
            workerTimeoutRef.current = setTimeout(() => {
              try {
                // Generate and store foreground mask
                const maskCtx = maskCanvasRef.current?.getContext('2d', { willReadFrequently: true });
                if (maskCtx && canvasWidth > 0 && canvasHeight > 0 && maskCanvasRef.current) {
                  // Draw original image (resized if necessary)
                  maskCtx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
                  setLoadingProgress(80);

                  // Detect edges and create mask with lower quality for performance
                  const result = detectForeground(maskCanvasRef.current, img, textSettings, true, true);

                  // Check if result exists and has a mask property
                  if (result && 'mask' in result) {
                    // Store the mask for later use
                    foregroundMaskRef.current = result.mask;
                    setLoadingProgress(90);

                    // Initial render with brief timeout to allow UI update
                    setTimeout(() => {
                      renderCompositeImage();
                      setIsProcessing(false);
                      setLoadingProgress(100);
                    }, 50);
                  } else {
                    throw new Error('Invalid result from detectForeground');
                  }
                } else {
                  throw new Error('Invalid canvas context or dimensions');
                }
              } catch (error) {
                console.error('Error during mask generation:', error);
                setIsProcessing(false);
                alert('Error processing image. Please try a different image or smaller file.');
              }
            }, 100); // Brief delay before intensive processing
          }
        } catch (error) {
          console.error('Error setting up canvases:', error);
          setIsProcessing(false);
          alert('Error setting up image processing. Please try again.');
        }
      }, 50); // Brief delay to allow UI update
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
  }, [image]);

  // Render the composite image with text behind foreground
  const renderCompositeImage = useCallback(() => {
    if (!canvasRef.current || !textCanvasRef.current || !originalImageRef.current || !foregroundMaskRef.current) {
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
      // Clear the text canvas for rendering new text
      textCtx.clearRect(0, 0, width, height);

      // Draw text on the text canvas
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

      // Get text image data
      const textImageData = textCtx.getImageData(0, 0, width, height);
      const textData = textImageData.data;

      // Clear main canvas and draw original image (resized if necessary)
      mainCtx.clearRect(0, 0, width, height);
      mainCtx.drawImage(originalImageRef.current, 0, 0, width, height);

      // Get the main canvas image data (original image)
      const mainImageData = mainCtx.getImageData(0, 0, width, height);
      const mainData = mainImageData.data;

      // Compose final image: text where there's no foreground mask
      for (let i = 0; i < mainData.length; i += 4) {
        const maskIndex = i / 4;

        // If this pixel is not part of the foreground mask and there's text
        if (foregroundMaskRef.current[maskIndex] !== 255 && textData[i + 3] > 0) {
          // Place text pixel
          mainData[i] = textData[i];
          mainData[i + 1] = textData[i + 1];
          mainData[i + 2] = textData[i + 2];
          mainData[i + 3] = textData[i + 3];
        }
        // Otherwise, keep original pixel (foreground)
      }

      // Update main canvas with final composite
      mainCtx.putImageData(mainImageData, 0, 0);

      // Store processed image for download
      setProcessedImage(canvasRef.current.toDataURL('image/png'));
    } catch (error) {
      console.error('Error during rendering:', error);
      // Don't block the UI with alerts during interactive operations
    }
  }, [textSettings, canvasSize]);

  // Update image when text settings change with improved throttling for performance
  useEffect(() => {
    if (!image || isProcessing || canvasSize.width === 0 || canvasSize.height === 0) return;

    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Schedule a new render with debouncing for dragging operations
    if (isDragging) {
      // Use less frequent updates during dragging for better performance
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
  }, [textSettings, renderCompositeImage, isProcessing, image, isDragging, canvasSize]);

  // Handle text position dragging with visual feedback
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current || isProcessing) return;
    setIsDragging(true);

    updateTextPosition(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !canvasRef.current || isProcessing) return;

    updateTextPosition(e);
  };

  const updateTextPosition = useCallback((e: React.MouseEvent) => {
    if (!canvasContainerRef.current || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Update text position with bounds checking
    const boundedX = Math.max(0, Math.min(100, x));
    const boundedY = Math.max(0, Math.min(100, y));

    setTextSettings(prev => ({
      ...prev,
      x: boundedX,
      y: boundedY
    }));
  }, []);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle download of final image
  const handleDownload = () => {
    if (!processedImage) return;

    const link = document.createElement('a');
    link.href = processedImage;
    link.download = 'overlay-image.png';
    link.click();
  };

  return (
    <div className="flex flex-col md:flex-row gap-8 w-full max-w-7xl mx-auto">
      <div className="flex-1">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Upload Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            disabled={isProcessing}
          />
        </div>

        <div ref={canvasContainerRef} className="relative border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50 h-[400px] flex items-center justify-center">
          {isProcessing && (
            <div className="absolute inset-0 bg-black bg-opacity-60 flex flex-col items-center justify-center z-20">
              <div className="text-white font-medium mb-2">Processing image... {loadingProgress}%</div>
              <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300 ease-out" 
                  style={{ width: `${loadingProgress}%` }}
                ></div>
              </div>
            </div>
          )}
          
          {image ? (
            <>
              {/* Hidden canvases for processing */}
              <canvas 
                ref={textCanvasRef}
                className="hidden"
              />
              <canvas 
                ref={maskCanvasRef}
                className="hidden"
              />
              
              {/* Main visible canvas */}
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-full object-contain cursor-move relative z-0"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
              
              {/* Overlay to show where text is during dragging */}
              {isDragging && (
                <div 
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: `${textSettings.x}%`,
                    top: `${textSettings.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    border: '2px solid white',
                    borderRadius: '50%',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.3)'
                  }}
                />
              )}
            </>
          ) : (
            <div className="text-center p-6">
              <p className="text-gray-500">Upload an image to get started</p>
            </div>
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
      </div>
    </div>
  );
}