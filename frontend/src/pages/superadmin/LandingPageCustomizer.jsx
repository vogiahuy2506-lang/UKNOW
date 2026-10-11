import { useState } from 'react';
import CanvasEditor from '../../features/landing-customizer/components/CanvasEditor';
import HtmlFullPageEditor from '../../features/landing-customizer/components/HtmlFullPageEditor';

// 11/10/2026: thanh "Editor Mode" cũ bị bỏ — mỗi trình soạn tự dựng thanh trên kiểu "Tạo landing page" (AdminEditorShell) và
// đưa việc đổi chế độ soạn (Canva Editor / HTML Full) vào modal Cài đặt. State `editorMode` vẫn nằm ở đây; trình soạn chỉ
// nhận `editorMode` + `onEditorModeChange`.
export default function LandingPageCustomizer() {
  const [editorMode, setEditorMode] = useState('canva');

  return (
    <div className="h-full flex flex-col min-h-0">
      {editorMode === 'canva' && <CanvasEditor editorMode={editorMode} onEditorModeChange={setEditorMode} />}
      {editorMode === 'html' && <HtmlFullPageEditor editorMode={editorMode} onEditorModeChange={setEditorMode} />}
    </div>
  );
}
