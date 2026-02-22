"use client";

import { useState } from "react";

interface GalleryImage {
  url: string;
  label: string;
}

export default function ImageGallery({
  images,
  title,
}: {
  images: GalleryImage[];
  title: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="bg-gray-100 flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          <span className="text-sm">No image</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Main image */}
      <div className="bg-gray-100 flex items-center justify-center min-h-[300px]">
        <img
          src={images[selectedIndex].url}
          alt={title}
          className="w-full h-auto object-contain max-h-[500px]"
        />
      </div>

      {/* Thumbnails - only show if more than 1 image */}
      {images.length > 1 && (
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <div className="flex gap-2 overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={img.url}
                onClick={() => setSelectedIndex(i)}
                className={`flex-shrink-0 rounded overflow-hidden border-2 transition-colors ${
                  i === selectedIndex
                    ? "border-gray-900"
                    : "border-transparent hover:border-gray-300"
                }`}
              >
                <img
                  src={img.url}
                  alt={img.label}
                  className="w-16 h-16 object-cover"
                />
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {images[selectedIndex].label}
            {` \u00b7 ${selectedIndex + 1} of ${images.length}`}
          </p>
        </div>
      )}
    </div>
  );
}
