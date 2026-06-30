import { useState } from 'react';
import { FaInfoCircle, FaCopy, FaCheck } from 'react-icons/fa';

const AVAILABLE_VARIABLES = [
  { key: '{{user_name}}', description: 'Tên người dùng' },
  { key: '{{user_email}}', description: 'Email người dùng' },
  { key: '{{user_plan}}', description: 'Gói dịch vụ hiện tại' },
  { key: '{{product_name}}', description: 'Tên sản phẩm (FounderAI)' },
  { key: '{{current_date}}', description: 'Ngày hiện tại' },
  { key: '{{dashboard_url}}', description: 'Link dashboard' },
  { key: '{{support_email}}', description: 'Email hỗ trợ' }
];

export default function VariablesHelper({ onInsert }) {
  const [copied, setCopied] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleCopy = async (variable) => {
    try {
      await navigator.clipboard.writeText(variable.key);
      setCopied(variable.key);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleInsert = (variable) => {
    onInsert?.(variable.key);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
      >
        <FaInfoCircle />
        Biến số có sẵn
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200">
            <div className="p-3 border-b border-gray-100">
              <h4 className="font-medium text-gray-900">Biến số có sẵn</h4>
              <p className="text-xs text-gray-500 mt-1">
                Click để chèn vào nội dung hoặc copy
              </p>
            </div>
            <div className="p-2 max-h-64 overflow-y-auto">
              {AVAILABLE_VARIABLES.map(variable => (
                <div
                  key={variable.key}
                  className="flex items-center justify-between p-2 rounded hover:bg-gray-50 group"
                >
                  <div>
                    <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded text-purple-700">
                      {variable.key}
                    </code>
                    <p className="text-xs text-gray-500 mt-0.5">{variable.description}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleInsert(variable)}
                      className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                      title="Chèn"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(variable)}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                      title="Copy"
                    >
                      {copied === variable.key ? (
                        <FaCheck className="text-green-600" size={14} />
                      ) : (
                        <FaCopy size={14} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
              <p className="text-xs text-gray-500">
                Biến sẽ được thay thế tự động khi gửi email
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export { AVAILABLE_VARIABLES };
