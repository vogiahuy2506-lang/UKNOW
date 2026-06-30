import { useState } from 'react';
import { FaGlobe, FaLanguage } from 'react-icons/fa';
import VariablesHelper from './VariablesHelper';

export default function NotificationEditor({ data, onChange, previewContent }) {
  const [activeTab, setActiveTab] = useState('vi');

  const updateField = (field, value) => {
    onChange?.({ ...data, [field]: value });
  };

  const insertVariable = (field, variable) => {
    const currentValue = data[field] || '';
    const newValue = currentValue + variable;
    updateField(field, newValue);
  };

  return (
    <div className="space-y-4">
      {/* Language Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('vi')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
              ${activeTab === 'vi'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-orange-200 hover:text-orange-600'
              }
            `}
          >
            <FaLanguage className="w-4 h-4" />
            Tiếng Việt
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('en')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
              ${activeTab === 'en'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-orange-200 hover:text-orange-600'
              }
            `}
          >
            <FaGlobe className="w-4 h-4" />
            English
          </button>
        </div>

        <VariablesHelper onInsert={(variable) => {
          const field = activeTab === 'vi' ? 'message' : 'message_en';
          insertVariable(field, variable);
        }} />
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">
          Tiêu đề {activeTab === 'vi' ? '' : '(EN)'}
        </label>
        <input
          type="text"
          value={activeTab === 'vi' ? (data.title || '') : (data.title_en || '')}
          onChange={(e) => {
            const field = activeTab === 'vi' ? 'title' : 'title_en';
            updateField(field, e.target.value);
          }}
          placeholder={activeTab === 'vi'
            ? 'Nhập tiêu đề thông báo...'
            : 'Enter notification title...'
          }
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-400 transition-all bg-white text-gray-900"
        />
      </div>

      {/* Message */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">
          Nội dung {activeTab === 'vi' ? '' : '(EN)'}
        </label>
        <textarea
          value={activeTab === 'vi' ? (data.message || '') : (data.message_en || '')}
          onChange={(e) => {
            const field = activeTab === 'vi' ? 'message' : 'message_en';
            updateField(field, e.target.value);
          }}
          placeholder={activeTab === 'vi'
            ? 'Nhập nội dung thông báo...\n\nBạn có thể dùng các biến số như:\n{{user_name}} - Tên người dùng\n{{user_plan}} - Gói dịch vụ'
            : 'Enter notification content...\n\nYou can use variables like:\n{{user_name}} - User name\n{{user_plan}} - Service plan'
          }
          rows={8}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-400 transition-all resize-none bg-white text-gray-900"
        />
      </div>

      {/* Preview */}
      {previewContent && (
        <div className="border border-orange-200 rounded-xl p-4 bg-orange-50">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Xem trước nội dung</h4>
          <div className="space-y-2">
            <div>
              <span className="text-xs text-gray-500">Tiêu đề: </span>
              <span className="text-sm font-medium">{previewContent.title || previewContent.title_en}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500">Nội dung: </span>
              <p className="text-sm whitespace-pre-wrap">{previewContent.message || previewContent.message_en}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Variable Insert */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">
          Chèn nhanh biến số
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { key: '{{user_name}}', label: 'Tên' },
            { key: '{{user_email}}', label: 'Email' },
            { key: '{{user_plan}}', label: 'Gói' },
            { key: '{{current_date}}', label: 'Ngày' },
            { key: '{{product_name}}', label: 'Tên SP' }
          ].map(variable => (
            <button
              key={variable.key}
              type="button"
              onClick={() => {
                const field = activeTab === 'vi' ? 'message' : 'message_en';
                insertVariable(field, variable.key);
              }}
              className="px-3 py-1.5 text-xs bg-white border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors font-medium"
            >
              {variable.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
