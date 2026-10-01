import React, { useState } from 'react';
import { Composer } from './Composer';
import { PreviewCards } from './PreviewCards';
import { JobsList } from './JobsList';
import { Media } from '../../types/api';

export const DownloadView: React.FC = () => {
  const [previewItems, setPreviewItems] = useState<Media[]>([]);

  const handlePreviewSuccess = (items: Media[]) => {
    setPreviewItems(items);
  };

  const handleClearPreview = () => {
    setPreviewItems([]);
  };

  const handleDownloaded = () => {
    setPreviewItems([]);
  };

  return (
    <>
      <Composer
        onPreviewSuccess={handlePreviewSuccess}
        onDownloadStarted={handleDownloaded}
      />

      {previewItems.length > 0 && (
        <PreviewCards
          items={previewItems}
          onClear={handleClearPreview}
          onDownloaded={handleDownloaded}
        />
      )}

      <JobsList />
    </>
  );
};
