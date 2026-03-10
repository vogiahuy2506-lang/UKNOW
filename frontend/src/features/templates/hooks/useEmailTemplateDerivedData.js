import { useMemo } from 'react';
import { normalizeS3KeyFromUrl, wrapEmailSrcDoc } from '../utils/emailTemplateEditor.helpers';

/**
 * Derive filtered templates and preview data for template page.
 *
 * @param {Object} params source state values
 * @returns {{editorPreviewSrcDoc: string, filteredTemplates: Array, previewAttachments: Array}}
 */
const useEmailTemplateDerivedData = ({
  bodyHtml,
  templates,
  searchTerm,
  filterCategory,
  previewTemplate,
}) => {
  const editorPreviewSrcDoc = useMemo(
    () => wrapEmailSrcDoc(bodyHtml),
    [bodyHtml]
  );

  const filteredTemplates = useMemo(() => {
    const keyword = String(searchTerm || '').toLowerCase();
    return templates.filter((t) => {
      const matchesSearch =
        t.templateName?.toLowerCase().includes(keyword) ||
        t.subject?.toLowerCase().includes(keyword);
      const matchesCategory = filterCategory ? t.category === filterCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [templates, searchTerm, filterCategory]);

  const previewAttachments = useMemo(() => {
    if (!previewTemplate) return [];
    const list = [];

    if (previewTemplate.attachmentUrl) {
      list.push({
        name: previewTemplate.attachmentName || 'Tập đính kèm',
        url: previewTemplate.attachmentUrl,
        key: normalizeS3KeyFromUrl(previewTemplate.attachmentUrl),
      });
    }

    if (Array.isArray(previewTemplate.attachments)) {
      previewTemplate.attachments.forEach((item, index) => {
        if (typeof item === 'string') {
          list.push({
            name: `Tập đính kèm ${index + 1}`,
            url: item,
            key: normalizeS3KeyFromUrl(item),
          });
          return;
        }
        if (item && typeof item === 'object') {
          const url = item.url || item.link || item.attachmentUrl;
          if (!url) return;
          list.push({
            name: item.name || item.originalName || item.fileName || `Tập đính kèm ${index + 1}`,
            url,
            key: item.key || normalizeS3KeyFromUrl(url),
          });
        }
      });
    }

    return list;
  }, [previewTemplate]);

  return {
    editorPreviewSrcDoc,
    filteredTemplates,
    previewAttachments,
  };
};

export default useEmailTemplateDerivedData;
