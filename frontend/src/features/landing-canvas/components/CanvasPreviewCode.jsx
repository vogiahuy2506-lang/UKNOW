import { HiOutlineCode } from 'react-icons/hi';
import MonacoCanvasEditor from './MonacoCanvasEditor.jsx';

/**
 * Code mode: Monaco editor cho HTML.
 */
export default function CanvasPreviewCode({ value, onChange }) {
  return (
    <div className="w-full max-w-5xl flex flex-col bg-[#1e1e1e] rounded-lg border border-[#333] shadow-xl overflow-hidden">
      <MonacoCanvasEditor value={value} onChange={onChange} />
    </div>
  );
}
