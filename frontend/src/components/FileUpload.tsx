import { useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  hasFile: boolean;
}

export function FileUpload({ onFileSelect, isLoading, hasFile }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [onFileSelect]
  );

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="p-4">
      <input
        ref={inputRef}
        type="file"
        accept=".svg"
        onChange={handleFileInput}
        className="hidden"
        disabled={isLoading}
      />
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={isLoading}
        className={cn("w-full", isLoading && "shimmer shimmer-bg")}
      >
        {isLoading ? 'Processing...' : hasFile ? 'Replace SVG' : 'Upload SVG'}
      </Button>
    </div>
  );
}
