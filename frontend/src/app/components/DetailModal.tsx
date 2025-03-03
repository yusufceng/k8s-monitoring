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
    <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg max-w-lg w-full max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Detaylı Bilgi</h2>
          <button 
            onClick={onClose} 
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <pre className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
          {JSON.stringify(details, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default DetailModal;