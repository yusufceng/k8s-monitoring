// frontend/src/components/DetailModal.tsx
import React from 'react';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: any;
}

const DetailModal: React.FC<DetailModalProps> = ({ isOpen, onClose, details }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-lg w-full max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Detaylı Bilgi</h2>
          <button 
            onClick={onClose} 
            className="text-gray-600 hover:text-gray-900"
          >
            ✕
          </button>
        </div>
        <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap break-words">
          {JSON.stringify(details, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default DetailModal;