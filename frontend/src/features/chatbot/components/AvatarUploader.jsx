/**
 * Simple URL input for image/logo URL.
 * Replaces the previous file-upload-based AvatarUploader.
 *
 * @param {object}   props
 * @param {string}   props.value   - current image URL (may be null/undefined)
 * @param {Function} props.onChange- called with the new URL (or empty string on clear)
 * @param {string}   [props.label] - field label shown above
 * @param {string}   [props.placeholder] - input placeholder
 * @param {string}   [props.help]  - helper text shown below
 */
export default function ImageUrlInput({
  value,
  onChange,
  label = 'Logo URL',
  placeholder = 'https://example.com/logo.png',
  help,
}) {
  const handleChange = (e) => {
    onChange?.(e.target.value);
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium text-slate-700">{label}</p>}
      <input
        type="url"
        value={value || ''}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
      {help && <p className="text-xs text-slate-400">{help}</p>}
    </div>
  );
}
