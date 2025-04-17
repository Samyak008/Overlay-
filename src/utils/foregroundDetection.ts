import { removeBackground } from '@imgly/background-removal';

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
  foregroundUrl?: string;
}

/**
 * Detects the foreground of an image using IMG.LY's background removal API
 * and places text behind it.
 * 
 * @param image The source image (as HTMLImageElement, Blob, or File)
 * @param textSettings Settings for text rendering
 * @param returnMaskOnly If true, only generate the mask without rendering text
 * @param progressCallback Optional callback for tracking progress
 * @returns Promise resolving to DetectionResult containing the foreground mask and URL
 */
export async function detectForeground(
  image: HTMLImageElement | string | Blob | File,
  textSettings?: TextSettings,
  returnMaskOnly: boolean = false,
  progressCallback?: (progress: number) => void
): Promise<DetectionResult> {
  try {
    // Process with IMG.LY background removal
    const processingStartTime = performance.now();
    console.log('Starting background removal...');
    
    // Get the foreground image with transparent background
    const foregroundBlob = await removeBackground(image, {
      // The progress callback in IMG.LY's API expects a function with different parameters
      // than what TypeScript is inferring. Using the 'any' type to bypass type checking for this callback.
      progress: (progress: any, ...args: any[]) => {
        // Ensure progress is treated as a number between 0-1
        const progressValue = typeof progress === 'number' ? progress : 
                             (typeof args[0] === 'number' ? args[0] : 0);
        
        const progressPercent = Math.round(progressValue * 100);
        console.log(`Background removal progress: ${progressPercent}%`);
        if (progressCallback) {
          progressCallback(progressPercent);
        }
      },
    });

    console.log(`Background removal completed in ${(performance.now() - processingStartTime) / 1000}s`);

    // Create a URL for the foreground image
    const foregroundUrl = URL.createObjectURL(foregroundBlob);
    
    // Create mask data from the foreground image
    const maskData = await createMaskFromForeground(foregroundUrl);
    
    if (returnMaskOnly) {
      return { 
        mask: maskData.mask,
        foregroundUrl
      };
    }
    
    // If textSettings is provided, handle rendering
    if (textSettings) {
      // Text rendering will be handled in the component
      // This approach keeps this function focused on background removal
    }
    
    return { 
      mask: maskData.mask,
      foregroundUrl
    };
  } catch (error) {
    console.error('Error in detectForeground:', error);
    return { mask: new Uint8ClampedArray(0) };
  }
}

/**
 * Convert a foreground image with alpha channel to a binary mask
 */
async function createMaskFromForeground(foregroundUrl: string): Promise<{mask: Uint8ClampedArray}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Create a canvas to process the image
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Draw the image to the canvas
      ctx.drawImage(img, 0, 0);
      
      // Extract the alpha channel as a binary mask
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const mask = new Uint8ClampedArray(data.length / 4);
      
      // Convert alpha values to binary mask (255 for foreground, 0 for background)
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        mask[i / 4] = alpha > 128 ? 255 : 0;
      }
      
      resolve({ mask });
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load foreground image'));
    };
    
    img.src = foregroundUrl;
  });
}