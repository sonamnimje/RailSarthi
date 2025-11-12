import React, { useState, useEffect } from 'react';

interface OverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (action: string, reason?: string) => void;
  trainId: string;
  aiAction: string;
}

export default function OverrideModal({ isOpen, onClose, onConfirm, trainId, aiAction }: OverrideModalProps) {
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAction('');
      setReason('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (action.trim()) {
      onConfirm(action.trim(), reason.trim() || undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-blue-50 rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Override AI Recommendation
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 p-3 bg-gray-50 rounded-xl">
            <div className="text-sm text-gray-600 mb-1">Train ID</div>
            <div className="font-medium text-gray-800">{trainId}</div>
          </div>

          <div className="mb-4 p-3 bg-blue-50 rounded-xl">
            <div className="text-sm text-blue-600 mb-1">AI Recommended Action</div>
            <div className="text-sm text-blue-800">{aiAction}</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="action" className="block text-sm font-medium text-gray-700 mb-2">
                Your Override Action
              </label>
              <input
                id="action"
                type="text"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="e.g., Hold at next signal for 2 min"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                autoFocus
                required
              />
            </div>

            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                Reason (Optional)
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Manual operational context"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!action.trim()}
                className="flex-1 px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
              >
                Apply Override
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
