interface TextSettings {
  content: string;
  font: string;
  size: number;
  color: string;
  x: number;
  y: number;
}

interface DetectionResult {
  mask: Uint8ClampedArray;
}

/**
 * Detects the foreground of an image using edge detection and places text behind it
 * This is a frontend-only approach using canvas manipulation techniques
 * 
 * @param canvas The canvas element to render to
 * @param image The source image
 * @param textSettings Settings for text rendering
 * @param returnMaskOnly If true, only generate the mask and don't render text (for optimization)
 * @param fastMode If true, use a faster but less accurate algorithm for mask generation
 * @returns An object containing the foreground mask if returnMaskOnly is true
 */
export function detectForeground(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  textSettings: TextSettings,
  returnMaskOnly: boolean = false,
  fastMode: boolean = false
): DetectionResult | void {
  // Safety check for canvas dimensions
  if (canvas.width <= 0 || canvas.height <= 0) {
    console.error('Invalid canvas dimensions:', canvas.width, canvas.height);
    return { mask: new Uint8ClampedArray(0) };
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { mask: new Uint8ClampedArray(0) };

  try {
    // Step 1: Draw the original image
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    // Step 2: Get image data for processing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Skip processing if we have an empty image
    if (data.length === 0) {
      return { mask: new Uint8ClampedArray(0) };
    }
    
    // Step 3: Apply edge detection based on mode
    let mask: Uint8ClampedArray;
    
    if (fastMode) {
      // Fast mode: Use simplified edge detection for better performance
      mask = fastEdgeDetection(imageData);
    } else {
      // Standard mode: Use Sobel operator for better quality
      const sobelData = applySobelOperator(imageData);
      
      // Create a mask for the foreground
      const threshold = 50; // Adjust this threshold to control edge sensitivity
      mask = new Uint8ClampedArray(data.length / 4);
      
      for (let i = 0; i < sobelData.length; i++) {
        mask[i] = sobelData[i] > threshold ? 255 : 0;
      }
    }
    
    // Apply dilation to connect edges and create a more solid mask
    // Use fewer iterations in fast mode
    const iterations = fastMode ? 1 : 2;
    const dilatedMask = dilate(mask, canvas.width, canvas.height, iterations);
    
    // If we only need the mask (for initial processing), return it now
    if (returnMaskOnly) {
      return { mask: dilatedMask };
    }
    
    // Step 7: Draw the text onto a separate canvas
    const textCanvas = document.createElement('canvas');
    textCanvas.width = canvas.width;
    textCanvas.height = canvas.height;
    const textCtx = textCanvas.getContext('2d');
    
    if (!textCtx) return { mask: dilatedMask };
    
    // Calculate text position based on percentages
    const textX = (textSettings.x / 100) * canvas.width;
    const textY = (textSettings.y / 100) * canvas.height;
    
    // Draw text
    textCtx.font = `${textSettings.size}px ${textSettings.font}`;
    textCtx.fillStyle = textSettings.color;
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    
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
    
    const textImageData = textCtx.getImageData(0, 0, canvas.width, canvas.height);
    const textData = textImageData.data;
    
    // Step 8: Combine original image with text, using the mask to determine what's foreground
    for (let i = 0; i < data.length; i += 4) {
      const maskIndex = i / 4;
      
      // If this is part of the foreground (based on our dilated mask), 
      // keep the original image data
      if (dilatedMask[maskIndex] === 255) {
        // This pixel is part of foreground, keep original
        // No change needed as the original image is already drawn
      } else {
        // This pixel is background, check if there's text here
        if (textData[i + 3] > 0) {
          // There's text at this pixel, draw it
          data[i] = textData[i];
          data[i + 1] = textData[i + 1];
          data[i + 2] = textData[i + 2];
          data[i + 3] = textData[i + 3];
        }
        // If no text, keep the original background
      }
    }
    
    // Draw the final combined image
    ctx.putImageData(imageData, 0, 0);
    
    return { mask: dilatedMask };
  } catch (error) {
    console.error('Error in detectForeground:', error);
    return { mask: new Uint8ClampedArray(0) };
  }
}

/**
 * Apply Sobel operator for edge detection
 */
function applySobelOperator(imageData: ImageData): Uint8ClampedArray {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const result = new Uint8ClampedArray(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Convert to grayscale first
      const i = (y * width + x) * 4;
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      
      // Apply horizontal and vertical Sobel filters
      const horizontalGradient = 
        -1 * getGray(data, (y - 1) * width + (x - 1)) +
        -2 * getGray(data, (y) * width + (x - 1)) +
        -1 * getGray(data, (y + 1) * width + (x - 1)) +
        1 * getGray(data, (y - 1) * width + (x + 1)) +
        2 * getGray(data, (y) * width + (x + 1)) +
        1 * getGray(data, (y + 1) * width + (x + 1));
      
      const verticalGradient = 
        -1 * getGray(data, (y - 1) * width + (x - 1)) +
        -2 * getGray(data, (y - 1) * width + (x)) +
        -1 * getGray(data, (y - 1) * width + (x + 1)) +
        1 * getGray(data, (y + 1) * width + (x - 1)) +
        2 * getGray(data, (y + 1) * width + (x)) +
        1 * getGray(data, (y + 1) * width + (x + 1));
      
      // Calculate gradient magnitude
      const magnitude = Math.sqrt(horizontalGradient * horizontalGradient + verticalGradient * verticalGradient);
      
      // Normalize to 0-255 and set result
      result[y * width + x] = Math.min(255, magnitude);
    }
  }
  
  return result;
}

/**
 * Get grayscale value from RGBA data
 */
function getGray(data: Uint8ClampedArray, index: number): number {
  index *= 4;
  return (data[index] + data[index + 1] + data[index + 2]) / 3;
}

/**
 * Apply dilation to connect edges and create a more solid mask
 */
function dilate(data: Uint8ClampedArray, width: number, height: number, iterations: number = 2): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data);
  const temp = new Uint8ClampedArray(data);
  
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Check if any neighbors are foreground (255)
        const hasWhiteNeighbor = 
          temp[idx - width - 1] === 255 || // top-left
          temp[idx - width] === 255 ||     // top
          temp[idx - width + 1] === 255 || // top-right
          temp[idx - 1] === 255 ||         // left
          temp[idx + 1] === 255 ||         // right
          temp[idx + width - 1] === 255 || // bottom-left
          temp[idx + width] === 255 ||     // bottom
          temp[idx + width + 1] === 255;   // bottom-right
        
        if (hasWhiteNeighbor) {
          result[idx] = 255; // Set to foreground
        }
      }
    }
    
    // Copy result back to temp buffer for next iteration
    for (let i = 0; i < temp.length; i++) {
      temp[i] = result[i];
    }
  }
  
  return result;
}

/**
 * Fast edge detection for better performance
 * Uses a simplified algorithm that checks for significant color differences between adjacent pixels
 */
function fastEdgeDetection(imageData: ImageData): Uint8ClampedArray {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const result = new Uint8ClampedArray(width * height);
  
  // Process only every other pixel for speed
  const step = 2;
  const threshold = 30; // Threshold for detecting edges
  
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const idx = (y * width + x) * 4;
      
      // Get current pixel color
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      // Check horizontal difference
      const rightIdx = (y * width + x + step) * 4;
      const dr = Math.abs(r - data[rightIdx]);
      const dg = Math.abs(g - data[rightIdx + 1]);
      const db = Math.abs(b - data[rightIdx + 2]);
      
      // Check vertical difference
      const downIdx = ((y + step) * width + x) * 4;
      const dr2 = Math.abs(r - data[downIdx]);
      const dg2 = Math.abs(g - data[downIdx + 1]);
      const db2 = Math.abs(b - data[downIdx + 2]);
      
      // Calculate total difference
      const diff = Math.max(dr + dg + db, dr2 + dg2 + db2);
      
      // Mark edge if difference exceeds threshold
      if (diff > threshold) {
        // Mark this pixel and neighboring pixels
        const pixelIndex = y * width + x;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ni = pixelIndex + dy * width + dx;
            if (ni >= 0 && ni < result.length) {
              result[ni] = 255;
            }
          }
        }
      }
    }
  }
  
  return result;
}