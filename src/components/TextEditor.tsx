'use client';

import React, { useState, useRef } from 'react';
import { debounce } from 'lodash';

interface TextSettings {
  content: string;
  font: string;
  size: number;
  color: string;
  x: number;
  y: number;
}

interface TextEditorProps {
  textSettings: TextSettings;
  setTextSettings: React.Dispatch<React.SetStateAction<TextSettings>>;
  disabled?: boolean;
}

const FONT_OPTIONS = [
  'Arial',
  'Verdana',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Palatino',
  'Garamond',
  'Comic Sans MS',
  'Impact',
  'copperplate gothic light',
  'Lucida Console',
  'Consolas',
  'monaco',
  'monospace',
  'sans-serif',
  'system-ui',
  'cursive',
  'fantasy',
  'monospace',
  'ui-monospace',
  'ui-rounded',
  'ui-sans-serif',
  'ui-serif',
];

export default function TextEditor({ textSettings, setTextSettings, disabled = false }: TextEditorProps) {
  // Handle text content change
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    setTextSettings(prev => ({
      ...prev,
      content: e.target.value
    }));
  };

  // Handle font change
  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (disabled) return;
    setTextSettings(prev => ({
      ...prev,
      font: e.target.value
    }));
  };

  // Handle size change
  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    setTextSettings(prev => ({
      ...prev,
      size: Number(e.target.value)
    }));
  };

  // Handle color change
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    setTextSettings(prev => ({
      ...prev,
      color: e.target.value
    }));
  };

  // Debounce position update
  const debouncedSetPosition = useRef(
    debounce((axis: 'x' | 'y', value: number) => {
      setTextSettings(prev => ({ ...prev, [axis]: value }));
    }, 16) // ~60fps
  ).current;

  const handlePositionChange = (axis: 'x' | 'y', value: number) => {
    if (disabled) return;
    debouncedSetPosition(axis, value);
  };

  return (
    <div className={`card ${disabled ? 'opacity-75' : ''}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-foreground">Text Settings</h2>
        {disabled && (
          <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-1 px-2 rounded-full">
            Processing...
          </span>
        )}
      </div>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="text-content" className="block text-sm font-medium text-gray-700 mb-1">
            Text Content
          </label>
          <textarea
            id="text-content"
            value={textSettings.content}
            onChange={handleContentChange}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            rows={3}
            disabled={disabled}
          />
        </div>

        <div>
          <label htmlFor="font-select" className="block text-sm font-medium text-gray-700 mb-1">
            Font Family
          </label>
          <select
            id="font-select"
            value={textSettings.font}
            onChange={handleFontChange}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            disabled={disabled}
          >
            {FONT_OPTIONS.map(font => (
              <option key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="text-size" className="block text-sm font-medium text-gray-700 mb-1">
            Font Size: {textSettings.size}px
          </label>
          <input
            id="text-size"
            type="range"
            min="8"
            max="500"
            value={textSettings.size}
            onChange={handleSizeChange}
            className={`w-full h-2 bg-gray-200 rounded-lg appearance-none ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
            disabled={disabled}
          />
        </div>

        <div>
          <label htmlFor="text-color" className="block text-sm font-medium text-gray-700 mb-1">
            Text Color
          </label>
          <div className="flex items-center">
            <input
              id="text-color"
              type="color"
              value={textSettings.color}
              onChange={handleColorChange}
              className={`w-10 h-10 border-none rounded ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
              disabled={disabled}
            />
            <span className="ml-3 text-gray-700">{textSettings.color}</span>
          </div>
        </div>

        <div className="pt-2">
          <p className="block text-sm font-medium text-gray-700 mb-2">
            Text Position
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="position-x" className="block text-sm text-gray-600 mb-1">
                Horizontal: {Math.round(textSettings.x)}%
              </label>
              <input
                id="position-x"
                type="range"
                min="0"
                max="100"
                value={textSettings.x}
                onChange={(e) => handlePositionChange('x', Number(e.target.value))}
                className={`w-full h-2 bg-gray-200 rounded-lg appearance-none ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                disabled={disabled}
              />
              <div className="relative w-full">
                <span className="absolute left-1/2 -translate-x-1/2 -top-6 bg-gray-700 text-white text-xs px-2 py-1 rounded shadow">
                  {Math.round(textSettings.x)}%
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="position-y" className="block text-sm text-gray-600 mb-1">
                Vertical: {Math.round(textSettings.y)}%
              </label>
              <input
                id="position-y"
                type="range"
                min="0"
                max="100"
                value={textSettings.y}
                onChange={(e) => handlePositionChange('y', Number(e.target.value))}
                className={`w-full h-2 bg-gray-200 rounded-lg appearance-none ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                disabled={disabled}
              />
              <div className="relative w-full">
                <span className="absolute left-1/2 -translate-x-1/2 -top-6 bg-gray-700 text-white text-xs px-2 py-1 rounded shadow">
                  {Math.round(textSettings.y)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-6 p-4 border border-gray-200 rounded-md bg-gray-50">
        <p className="text-sm text-gray-500 mb-2">Text Preview</p>
        <div
          className="p-4 bg-gray-800 rounded-md overflow-hidden"
          style={{
            minHeight: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <p
            style={{
              fontFamily: textSettings.font,
              fontSize: `${Math.min(textSettings.size, 48)}px`,
              color: textSettings.color,
            }}
          >
            {textSettings.content || 'Your text here'}
          </p>
        </div>
      </div>
    </div>
  );
}