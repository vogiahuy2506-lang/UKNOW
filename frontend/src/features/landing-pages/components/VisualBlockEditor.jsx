import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineTrash, HiOutlineDuplicate,
  HiOutlineChevronUp, HiOutlineChevronDown, HiOutlinePlus,
  HiOutlineSparkles, HiOutlineTemplate, HiOutlineViewGrid,
  HiOutlineCode, HiOutlineSave
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Block definitions - each block has a default HTML template
 * Default data keys match translation keys
// eslint-disable-next-line react-refresh/only-export-components
 */
export const BLOCK_TYPES = {
  HERO: {
    id: 'hero',
    name: 'Hero Section',
    icon: '🎯',
    defaultHtml: `
      <section class="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-20 px-6">
        <div class="max-w-6xl mx-auto text-center">
          <h1 class="text-4xl md:text-5xl font-bold mb-6">{{headline}}</h1>
          <p class="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">{{subheadline}}</p>
          <div class="flex flex-wrap justify-center gap-4">
            <button class="bg-white text-blue-600 px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition-colors shadow-xl">{{cta_primary}}</button>
            <button class="border-2 border-white text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition-colors">{{cta_secondary}}</button>
          </div>
        </div>
      </section>
    `,
    defaultDataKeys: ['headline', 'subheadline', 'cta_primary', 'cta_secondary'],
  },
  FEATURES: {
    id: 'features',
    name: 'Features',
    icon: '✨',
    defaultHtml: `
      <section class="py-16 px-6 bg-white">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-3xl font-bold text-center mb-12">{{section_title}}</h2>
          <div class="grid md:grid-cols-3 gap-8">
            <div class="text-center p-6 rounded-2xl bg-gray-50 hover:bg-orange-50 transition-colors">
              <div class="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">🚀</div>
              <h3 class="text-xl font-bold mb-3">{{feature_1_title}}</h3>
              <p class="text-gray-600">{{feature_1_desc}}</p>
            </div>
            <div class="text-center p-6 rounded-2xl bg-gray-50 hover:bg-blue-50 transition-colors">
              <div class="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">⚡</div>
              <h3 class="text-xl font-bold mb-3">{{feature_2_title}}</h3>
              <p class="text-gray-600">{{feature_2_desc}}</p>
            </div>
            <div class="text-center p-6 rounded-2xl bg-gray-50 hover:bg-green-50 transition-colors">
              <div class="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">🛡️</div>
              <h3 class="text-xl font-bold mb-3">{{feature_3_title}}</h3>
              <p class="text-gray-600">{{feature_3_desc}}</p>
            </div>
          </div>
        </div>
      </section>
    `,
    defaultDataKeys: ['section_title', 'feature_1_title', 'feature_1_desc', 'feature_2_title', 'feature_2_desc', 'feature_3_title', 'feature_3_desc'],
  },
  FORM: {
    id: 'form',
    name: 'Registration Form',
    icon: '📝',
    defaultHtml: `
      <section class="py-16 px-6 bg-gradient-to-br from-orange-50 to-amber-50">
        <div class="max-w-2xl mx-auto">
          <h2 class="text-3xl font-bold text-center mb-4">{{form_title}}</h2>
          <p class="text-gray-600 text-center mb-8">{{form_subtitle}}</p>
          <form class="bg-white rounded-2xl shadow-xl p-8 space-y-4">
            <div>
              <input type="text" placeholder="{{form_full_name_placeholder}}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            <div>
              <input type="email" placeholder="{{form_email_placeholder}}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            <div>
              <input type="tel" placeholder="{{form_phone_placeholder}}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            <button type="submit" class="w-full bg-orange-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-orange-600 transition-colors">{{submit_text}}</button>
            <p class="text-center text-sm text-gray-500">{{privacy_text}}</p>
          </form>
        </div>
      </section>
    `,
    defaultDataKeys: ['form_title', 'form_subtitle', 'form_full_name_placeholder', 'form_email_placeholder', 'form_phone_placeholder', 'submit_text', 'privacy_text'],
  },
  TESTIMONIAL: {
    id: 'testimonial',
    name: 'Testimonials',
    icon: '💬',
    defaultHtml: `
      <section class="py-16 px-6 bg-gray-50">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-3xl font-bold text-center mb-12">{{section_title}}</h2>
          <div class="grid md:grid-cols-3 gap-8">
            <div class="bg-white rounded-2xl p-6 shadow-sm">
              <div class="flex items-center gap-4 mb-4">
                <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-xl font-bold text-blue-600">{{reviewer_1_avatar}}</div>
                <div>
                  <p class="font-bold">{{reviewer_1_name}}</p>
                  <p class="text-sm text-gray-500">{{reviewer_1_role}}</p>
                </div>
              </div>
              <p class="text-gray-600 italic">"{{reviewer_1_content}}"</p>
              <div class="mt-4 text-orange-500">★★★★★</div>
            </div>
            <div class="bg-white rounded-2xl p-6 shadow-sm">
              <div class="flex items-center gap-4 mb-4">
                <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-xl font-bold text-green-600">{{reviewer_2_avatar}}</div>
                <div>
                  <p class="font-bold">{{reviewer_2_name}}</p>
                  <p class="text-sm text-gray-500">{{reviewer_2_role}}</p>
                </div>
              </div>
              <p class="text-gray-600 italic">"{{reviewer_2_content}}"</p>
              <div class="mt-4 text-orange-500">★★★★★</div>
            </div>
            <div class="bg-white rounded-2xl p-6 shadow-sm">
              <div class="flex items-center gap-4 mb-4">
                <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-xl font-bold text-purple-600">{{reviewer_3_avatar}}</div>
                <div>
                  <p class="font-bold">{{reviewer_3_name}}</p>
                  <p class="text-sm text-gray-500">{{reviewer_3_role}}</p>
                </div>
              </div>
              <p class="text-gray-600 italic">"{{reviewer_3_content}}"</p>
              <div class="mt-4 text-orange-500">★★★★★</div>
            </div>
          </div>
        </div>
      </section>
    `,
    defaultDataKeys: ['section_title', 'reviewer_1_name', 'reviewer_1_role', 'reviewer_1_avatar', 'reviewer_1_content', 'reviewer_2_name', 'reviewer_2_role', 'reviewer_2_avatar', 'reviewer_2_content', 'reviewer_3_name', 'reviewer_3_role', 'reviewer_3_avatar', 'reviewer_3_content'],
  },
  CTA: {
    id: 'cta',
    name: 'Call to Action',
    icon: '🎯',
    defaultHtml: `
      <section class="py-16 px-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
        <div class="max-w-4xl mx-auto text-center">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">{{cta_title}}</h2>
          <p class="text-xl text-orange-100 mb-8">{{cta_subtitle}}</p>
          <button class="bg-white text-orange-600 px-10 py-4 rounded-xl font-bold text-lg hover:bg-orange-50 transition-colors shadow-xl">
            {{cta_button}}
          </button>
        </div>
      </section>
    `,
    defaultDataKeys: ['cta_title', 'cta_subtitle', 'cta_button'],
  },
  PRICING: {
    id: 'pricing',
    name: 'Pricing',
    icon: '💰',
    defaultHtml: `
      <section class="py-16 px-6 bg-white">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-3xl font-bold text-center mb-12">{{section_title}}</h2>
          <div class="grid md:grid-cols-3 gap-8">
            <div class="border border-gray-200 rounded-2xl p-6 hover:border-orange-300 transition-colors">
              <h3 class="text-xl font-bold mb-2">{{plan_1_name}}</h3>
              <p class="text-4xl font-bold text-orange-600 mb-4">{{plan_1_price}}</p>
              <ul class="space-y-2 mb-6 text-gray-600">
                <li>✓ {{plan_1_feature_1}}</li>
                <li>✓ {{plan_1_feature_2}}</li>
                <li>✓ {{plan_1_feature_3}}</li>
              </ul>
              <button class="w-full py-3 border-2 border-orange-500 text-orange-600 rounded-xl font-bold hover:bg-orange-50 transition-colors">{{select_btn}}</button>
            </div>
            <div class="border-2 border-orange-500 rounded-2xl p-6 bg-orange-50 relative">
              <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-4 py-1 rounded-full text-sm font-bold">{{popular_badge}}</div>
              <h3 class="text-xl font-bold mb-2">{{plan_2_name}}</h3>
              <p class="text-4xl font-bold text-orange-600 mb-4">{{plan_2_price}}</p>
              <ul class="space-y-2 mb-6 text-gray-600">
                <li>✓ {{plan_2_feature_1}}</li>
                <li>✓ {{plan_2_feature_2}}</li>
                <li>✓ {{plan_2_feature_3}}</li>
              </ul>
              <button class="w-full py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors">{{select_btn}}</button>
            </div>
            <div class="border border-gray-200 rounded-2xl p-6 hover:border-orange-300 transition-colors">
              <h3 class="text-xl font-bold mb-2">{{plan_3_name}}</h3>
              <p class="text-4xl font-bold text-orange-600 mb-4">{{plan_3_price}}</p>
              <ul class="space-y-2 mb-6 text-gray-600">
                <li>✓ {{plan_3_feature_1}}</li>
                <li>✓ {{plan_3_feature_2}}</li>
                <li>✓ {{plan_3_feature_3}}</li>
              </ul>
              <button class="w-full py-3 border-2 border-orange-500 text-orange-600 rounded-xl font-bold hover:bg-orange-50 transition-colors">{{select_btn}}</button>
            </div>
          </div>
        </div>
      </section>
    `,
    defaultDataKeys: ['section_title', 'plan_1_name', 'plan_1_price', 'plan_1_feature_1', 'plan_1_feature_2', 'plan_1_feature_3', 'plan_2_name', 'plan_2_price', 'plan_2_feature_1', 'plan_2_feature_2', 'plan_2_feature_3', 'plan_3_name', 'plan_3_price', 'plan_3_feature_1', 'plan_3_feature_2', 'plan_3_feature_3', 'select_btn', 'popular_badge'],
  },
  FAQ: {
    id: 'faq',
    name: 'FAQ',
    icon: '❓',
    defaultHtml: `
      <section class="py-16 px-6 bg-gray-50">
        <div class="max-w-3xl mx-auto">
          <h2 class="text-3xl font-bold text-center mb-12">{{section_title}}</h2>
          <div class="space-y-4">
            <details class="bg-white rounded-xl p-6 shadow-sm group">
              <summary class="font-bold cursor-pointer list-none flex justify-between items-center">
                {{faq_1_q}}
                <span class="text-orange-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="mt-4 text-gray-600">{{faq_1_a}}</p>
            </details>
            <details class="bg-white rounded-xl p-6 shadow-sm group">
              <summary class="font-bold cursor-pointer list-none flex justify-between items-center">
                {{faq_2_q}}
                <span class="text-orange-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="mt-4 text-gray-600">{{faq_2_a}}</p>
            </details>
            <details class="bg-white rounded-xl p-6 shadow-sm group">
              <summary class="font-bold cursor-pointer list-none flex justify-between items-center">
                {{faq_3_q}}
                <span class="text-orange-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="mt-4 text-gray-600">{{faq_3_a}}</p>
            </details>
          </div>
        </div>
      </section>
    `,
    defaultDataKeys: ['section_title', 'faq_1_q', 'faq_1_a', 'faq_2_q', 'faq_2_a', 'faq_3_q', 'faq_3_a'],
  },
  FOOTER: {
    id: 'footer',
    name: 'Footer',
    icon: '📍',
    defaultHtml: `
      <footer class="py-12 px-6 bg-gray-900 text-gray-400">
        <div class="max-w-6xl mx-auto">
          <div class="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 class="text-white font-bold text-lg mb-4">{{brand_name}}</h4>
              <p>{{brand_desc}}</p>
            </div>
            <div>
              <h4 class="text-white font-bold mb-4">{{footer_links}}</h4>
              <ul class="space-y-2">
                <li><a href="#" class="hover:text-white transition-colors">{{link_1}}</a></li>
                <li><a href="#" class="hover:text-white transition-colors">{{link_2}}</a></li>
                <li><a href="#" class="hover:text-white transition-colors">{{link_3}}</a></li>
              </ul>
            </div>
            <div>
              <h4 class="text-white font-bold mb-4">{{footer_contact}}</h4>
              <ul class="space-y-2">
                <li>📍 {{address}}</li>
                <li>📞 {{phone}}</li>
                <li>✉️ {{email}}</li>
              </ul>
            </div>
            <div>
              <h4 class="text-white font-bold mb-4">{{footer_follow}}</h4>
              <div class="flex gap-4">
                <a href="#" class="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-orange-500 transition-colors">f</a>
                <a href="#" class="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-orange-500 transition-colors">in</a>
                <a href="#" class="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-orange-500 transition-colors">yt</a>
              </div>
            </div>
          </div>
          <div class="border-t border-gray-800 pt-8 text-center">
            <p>&copy; {{current_year}} {{brand_name}}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    `,
    defaultDataKeys: ['brand_name', 'brand_desc', 'footer_links', 'footer_contact', 'footer_follow', 'link_1', 'link_2', 'link_3', 'address', 'phone', 'email', 'current_year'],
  },
};

const BLOCK_LIST = Object.values(BLOCK_TYPES);

/**
 * Get default data for a block type using translations
 */
function getBlockDefaultData(blockType, t) {
  const defaults = {
    hero: {
      headline: t('visualBlockEditor.heroHeadline', 'Welcome to our product'),
      subheadline: t('visualBlockEditor.heroSubheadline', 'The best solution for your business'),
      cta_primary: t('visualBlockEditor.heroCtaPrimary', 'Sign up now'),
      cta_secondary: t('visualBlockEditor.heroCtaSecondary', 'Learn more'),
    },
    features: {
      section_title: t('visualBlockEditor.featuresTitle', 'Why choose us?'),
      feature_1_title: t('visualBlockEditor.feature1Title', 'Fast'),
      feature_1_desc: t('visualBlockEditor.feature1Desc', 'Deploy in minutes'),
      feature_2_title: t('visualBlockEditor.feature2Title', 'Secure'),
      feature_2_desc: t('visualBlockEditor.feature2Desc', 'Absolute data security'),
      feature_3_title: t('visualBlockEditor.feature3Title', '24/7 Support'),
      feature_3_desc: t('visualBlockEditor.feature3Desc', 'Professional team always ready'),
    },
    form: {
      form_title: t('visualBlockEditor.formBlockTitle', 'Free consultation signup'),
      form_subtitle: t('visualBlockEditor.formBlockSubtitle', 'Fill in your information, we will contact within 24h'),
      form_full_name_placeholder: t('visualBlockEditor.formFullNamePlaceholder', 'Full Name'),
      form_email_placeholder: t('visualBlockEditor.formEmailPlaceholder', 'Your Email'),
      form_phone_placeholder: t('visualBlockEditor.formPhonePlaceholder', 'Phone Number'),
      submit_text: t('visualBlockEditor.formSubmitText', 'Submit information'),
      privacy_text: t('visualBlockEditor.formPrivacyText', 'We are committed to protecting your information'),
    },
    testimonial: {
      section_title: t('visualBlockEditor.testimonialTitle', 'What our customers say'),
      reviewer_1_name: t('visualBlockEditor.reviewer1Name', 'John Doe'),
      reviewer_1_role: t('visualBlockEditor.reviewer1Role', 'CEO Company A'),
      reviewer_1_avatar: 'J',
      reviewer_1_content: t('visualBlockEditor.reviewer1Content', 'Amazing product, very dedicated support team!'),
      reviewer_2_name: t('visualBlockEditor.reviewer2Name', 'Jane Smith'),
      reviewer_2_role: t('visualBlockEditor.reviewer2Role', 'Startup Founder'),
      reviewer_2_avatar: 'J',
      reviewer_2_content: t('visualBlockEditor.reviewer2Content', 'Very satisfied with the results.'),
      reviewer_3_name: t('visualBlockEditor.reviewer3Name', 'Bob Johnson'),
      reviewer_3_role: t('visualBlockEditor.reviewer3Role', 'CEO Company C'),
      reviewer_3_avatar: 'B',
      reviewer_3_content: t('visualBlockEditor.reviewer3Content', 'Perfect solution for my business.'),
    },
    cta: {
      cta_title: t('visualBlockEditor.ctaBlockTitle', 'Ready to start?'),
      cta_subtitle: t('visualBlockEditor.ctaBlockSubtitle', 'Sign up today for exclusive offers'),
      cta_button: t('visualBlockEditor.ctaBlockButton', 'Get started'),
    },
    pricing: {
      section_title: t('visualBlockEditor.pricingTitle', 'Service pricing'),
      plan_1_name: t('visualBlockEditor.plan1Name', 'Basic'),
      plan_1_price: t('visualBlockEditor.plan1Price', '199K'),
      plan_1_feature_1: t('visualBlockEditor.plan1Feature1', 'Basic features'),
      plan_1_feature_2: t('visualBlockEditor.plan1Feature2', '8/5 Support'),
      plan_1_feature_3: t('visualBlockEditor.plan1Feature3', '1 user'),
      plan_2_name: t('visualBlockEditor.plan2Name', 'Pro'),
      plan_2_price: t('visualBlockEditor.plan2Price', '499K'),
      plan_2_feature_1: t('visualBlockEditor.plan2Feature1', 'All features'),
      plan_2_feature_2: t('visualBlockEditor.plan2Feature2', '24/7 Support'),
      plan_2_feature_3: t('visualBlockEditor.plan2Feature3', '5 users'),
      plan_3_name: t('visualBlockEditor.plan3Name', 'Enterprise'),
      plan_3_price: t('visualBlockEditor.plan3Price', 'Contact'),
      plan_3_feature_1: t('visualBlockEditor.plan3Feature1', 'Unlimited'),
      plan_3_feature_2: t('visualBlockEditor.plan3Feature2', 'Dedicated support'),
      plan_3_feature_3: t('visualBlockEditor.plan3Feature3', 'Unlimited users'),
      select_btn: t('visualBlockEditor.selectPlanBtn', 'Choose this plan'),
      popular_badge: t('visualBlockEditor.popularBadge', 'Popular'),
    },
    faq: {
      section_title: t('visualBlockEditor.faqTitle', 'Frequently Asked Questions'),
      faq_1_q: t('visualBlockEditor.faq1Question', 'How to get started?'),
      faq_1_a: t('visualBlockEditor.faq1Answer', 'Register an account and follow the guide.'),
      faq_2_q: t('visualBlockEditor.faq2Question', 'How much does it cost?'),
      faq_2_a: t('visualBlockEditor.faq2Answer', 'We have pricing plans suitable for all needs.'),
      faq_3_q: t('visualBlockEditor.faq3Question', 'Is technical support available?'),
      faq_3_a: t('visualBlockEditor.faq3Answer', 'Our support team is always ready 24/7.'),
    },
    footer: {
      brand_name: t('visualBlockEditor.footerBrandName', 'UKNOW'),
      brand_desc: t('visualBlockEditor.footerBrandDesc', 'Leading marketing automation solution'),
      footer_links: t('visualBlockEditor.footerLinks', 'Links'),
      footer_contact: t('visualBlockEditor.footerContact', 'Contact'),
      footer_follow: t('visualBlockEditor.footerFollow', 'Follow us'),
      link_1: t('visualBlockEditor.footerLink1', 'About us'),
      link_2: t('visualBlockEditor.footerLink2', 'Services'),
      link_3: t('visualBlockEditor.footerLink3', 'Contact'),
      address: t('visualBlockEditor.footerAddress', '123 ABC Street, District 1, HCMC'),
      phone: t('visualBlockEditor.footerPhone', '0901 234 567'),
      email: t('visualBlockEditor.footerEmail', 'contact@uknow.vn'),
      current_year: new Date().getFullYear(),
    },
  };
  return defaults[blockType.id] || {};
}

/**
 * Visual Block Editor - Drag and drop landing page builder
 * 
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {string} props.initialHtml
 * @param {object} props.initialData
 * @param {function} props.onSave - Called with { html, data } when saving
 * @param {function} props.onClose
 */
export default function VisualBlockEditor({ isOpen, initialHtml, initialData, onSave, onClose }) {
  const { t } = useI18n();
  const [blocks, setBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [viewMode, setViewMode] = useState('visual'); // 'visual' | 'code'
  const [draggedBlockType, setDraggedBlockType] = useState(null);
  const dragOverRef = useRef(null);

  // Initialize blocks from initial HTML/data
  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      // Try to parse from data
      const parsedBlocks = [];
      for (const blockType of BLOCK_LIST) {
        const blockData = {};
        const defaultData = getBlockDefaultData(blockType, t);
        let hasData = false;
        for (const key of blockType.defaultDataKeys || []) {
          if (initialData[key]) {
            blockData[key] = initialData[key];
            hasData = true;
          } else if (defaultData[key]) {
            blockData[key] = defaultData[key];
            hasData = true;
          }
        }
        if (hasData) {
          parsedBlocks.push({
            id: `${blockType.id}_${Date.now()}_${Math.random()}`,
            type: blockType.id,
            data: { ...defaultData, ...blockData },
          });
        }
      }
      if (parsedBlocks.length > 0) {
        setBlocks(parsedBlocks);
      }
    }
  }, [initialHtml, initialData, t]);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  const handleDragStart = (e, blockType) => {
    setDraggedBlockType(blockType);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dragOverRef.current = e.currentTarget;
  };

  const handleDrop = (e, targetIndex = null) => {
    e.preventDefault();
    if (!draggedBlockType) return;

    const defaultData = getBlockDefaultData(draggedBlockType, t);
    const newBlock = {
      id: `${draggedBlockType.id}_${Date.now()}`,
      type: draggedBlockType.id,
      data: { ...defaultData },
    };

    setBlocks(prev => {
      const newBlocks = [...prev];
      const insertIndex = targetIndex !== null ? targetIndex : newBlocks.length;
      newBlocks.splice(insertIndex, 0, newBlock);
      return newBlocks;
    });

    setDraggedBlockType(null);
    setSelectedBlockId(newBlock.id);
  };

  const handleAddBlock = (blockType) => {
    const defaultData = getBlockDefaultData(blockType, t);
    const newBlock = {
      id: `${blockType.id}_${Date.now()}`,
      type: blockType.id,
      data: { ...defaultData },
    };
    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  };

  const handleDeleteBlock = (blockId) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  };

  const handleDuplicateBlock = (block) => {
    const newBlock = {
      id: `${block.type}_${Date.now()}`,
      type: block.type,
      data: { ...block.data },
    };
    const index = blocks.findIndex(b => b.id === block.id);
    setBlocks(prev => {
      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      return newBlocks;
    });
    setSelectedBlockId(newBlock.id);
  };

  const handleMoveBlock = (blockId, direction) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === blocks.length - 1) return;

    setBlocks(prev => {
      const newBlocks = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
      return newBlocks;
    });
  };

  const handleUpdateBlockData = (blockId, key, value) => {
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, data: { ...b.data, [key]: value } } : b
    ));
  };

  const generateHtml = useCallback(() => {
    let html = '';
    for (const block of blocks) {
      const blockDef = BLOCK_LIST.find(b => b.id === block.type);
      if (blockDef) {
        let blockHtml = blockDef.defaultHtml;
        for (const [key, value] of Object.entries(block.data)) {
          blockHtml = blockHtml.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
        }
        html += blockHtml;
      }
    }
    return html;
  }, [blocks]);

  const handleSave = () => {
    const html = generateHtml();
    const data = {};
    for (const block of blocks) {
      Object.assign(data, block.data);
    }
    onSave?.({ html, data });
  };

  const blockDef = selectedBlock ? BLOCK_LIST.find(b => b.id === selectedBlock.type) : null;

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[400] flex flex-col bg-gray-100">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-gray-900">{t('visualBlockEditor.title', 'Visual Block Editor')}</h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setViewMode('visual')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'visual' ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HiOutlineViewGrid className="w-4 h-4" />
              {t('visualBlockEditor.blocks', 'Blocks')}
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'code' ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HiOutlineCode className="w-4 h-4" />
              {t('visualBlockEditor.code', 'Code')}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors"
          >
            {t('visualBlockEditor.close', 'Close')}
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/25"
          >
            <HiOutlineSave className="w-4 h-4" />
            {t('visualBlockEditor.saveAndExit', 'Save & Exit')}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel - Block Library */}
        <div className="w-72 shrink-0 bg-white border-r border-gray-200 overflow-y-auto p-4">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">{t('visualBlockEditor.addBlock', 'Add Block')}</h3>
          <div className="space-y-2">
            {BLOCK_LIST.map(blockType => (
              <div
                key={blockType.id}
                draggable
                onDragStart={(e) => handleDragStart(e, blockType)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e)}
                onClick={() => handleAddBlock(blockType)}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-grab hover:bg-orange-50 hover:border-orange-300 border border-transparent transition-all active:cursor-grabbing"
              >
                <span className="text-2xl">{blockType.icon}</span>
                <span className="font-medium text-gray-700">{blockType.name}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">{t('visualBlockEditor.aiGeneration', 'AI Generation')}</h3>
            <button
              onClick={() => {
                // TODO: Open AI prompt dialog
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-indigo-600 transition-all shadow-lg"
            >
              <HiOutlineSparkles className="w-4 h-4" />
              {t('visualBlockEditor.generateWithAI', 'Generate with AI')}
            </button>
          </div>
        </div>

        {/* Main Canvas */}
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'visual' ? (
            <div className="max-w-5xl mx-auto py-8 px-4">
              {/* Drop zone when dragging */}
              {blocks.length === 0 && !draggedBlockType && (
                <div
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 0)}
                  className="border-2 border-dashed border-gray-300 rounded-2xl p-16 text-center"
                >
                  <HiOutlinePlus className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-500">{t('visualBlockEditor.dropOrClick', 'Drag block from left or click to add')}</p>
                  <p className="text-sm text-gray-400 mt-2">{t('visualBlockEditor.orGenerateWithAI', 'Or click "Generate with AI" to auto-create landing page')}</p>
                </div>
              )}

              {/* Block list */}
              <div className="space-y-4">
                {blocks.map((block, index) => {
                  const def = BLOCK_LIST.find(b => b.id === block.type);
                  const isSelected = selectedBlockId === block.id;

                  return (
                    <div
                      key={block.id}
                      onClick={() => setSelectedBlockId(block.id)}
                      className={`relative group rounded-2xl overflow-hidden transition-all ${
                        isSelected ? 'ring-2 ring-orange-500 shadow-xl' : 'hover:ring-2 hover:ring-orange-300'
                      }`}
                    >
                      {/* Block Controls */}
                      <div className={`absolute top-2 right-2 flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-xl p-1 shadow-lg transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveBlock(block.id, 'up'); }}
                          disabled={index === 0}
                          className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors"
                          title={t('visualBlockEditor.moveUp', 'Move up')}
                        >
                          <HiOutlineChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveBlock(block.id, 'down'); }}
                          disabled={index === blocks.length - 1}
                          className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors"
                          title={t('visualBlockEditor.moveDown', 'Move down')}
                        >
                          <HiOutlineChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDuplicateBlock(block); }}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title={t('visualBlockEditor.duplicate', 'Duplicate')}
                        >
                          <HiOutlineDuplicate className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteBlock(block.id); }}
                          className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                          title={t('visualBlockEditor.delete', 'Delete')}
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Block Label */}
                      <div className="absolute top-2 left-2 px-3 py-1 bg-white/95 backdrop-blur-sm rounded-lg text-xs font-medium text-gray-500 shadow-lg">
                        {def?.icon} {def?.name}
                      </div>

                      {/* Block Preview */}
                      <div className="pointer-events-none select-none">
                        <iframe
                          title={`Block preview ${block.id}`}
                          className="w-full border-0 bg-white"
                          style={{ height: '400px' }}
                          srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  ${(() => {
    const blockDef = BLOCK_LIST.find(b => b.id === block.type);
    if (!blockDef) return '';
    let html = blockDef.defaultHtml;
    for (const [key, value] of Object.entries(block.data)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return html;
  })()}
</body>
</html>`}
                          sandbox="allow-scripts"
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Drop zone at bottom */}
                {draggedBlockType && (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e)}
                    className="border-2 border-dashed border-orange-300 bg-orange-50 rounded-2xl p-8 text-center"
                  >
                    <p className="text-orange-600 font-medium">{t('visualBlockEditor.dropToAdd', 'Drop to add block')}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Code View */
            <div className="max-w-5xl mx-auto py-8 px-4">
              <pre className="bg-gray-900 text-gray-100 rounded-2xl p-6 overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                {generateHtml()}
              </pre>
            </div>
          )}
        </div>

        {/* Right Panel - Block Properties */}
        <div className="w-80 shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">{t('visualBlockEditor.blockProperties', 'Block Properties')}</h3>
          </div>

          {selectedBlock && blockDef ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-2xl">{blockDef.icon}</span>
                <div>
                  <p className="font-medium text-gray-900">{blockDef.name}</p>
                  <p className="text-xs text-gray-500">ID: {selectedBlock.type}</p>
                </div>
              </div>

              <div className="space-y-3">
                {(blockDef.defaultDataKeys || []).map((key) => {
                  const defaultValue = selectedBlock.data[key] || '';
                  const labelKey = `visualBlockEditor.${key}`;

                  return (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                        {t(labelKey, key.replace(/_/g, ' '))}
                      </label>
                      {typeof defaultValue === 'string' && defaultValue.length > 50 ? (
                        <textarea
                          value={selectedBlock.data[key] || ''}
                          onChange={(e) => handleUpdateBlockData(selectedBlock.id, key, e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder={getBlockDefaultData(blockDef, t)[key] || ''}
                        />
                      ) : (
                        <input
                          type="text"
                          value={selectedBlock.data[key] || ''}
                          onChange={(e) => handleUpdateBlockData(selectedBlock.id, key, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder={getBlockDefaultData(blockDef, t)[key] || ''}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => handleDeleteBlock(selectedBlock.id)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors"
              >
                <HiOutlineTrash className="w-4 h-4" />
                {t('visualBlockEditor.deleteBlock', 'Delete Block')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 p-4 text-center">
              <HiOutlineTemplate className="w-12 h-12 mb-3" />
              <p className="text-sm">{t('visualBlockEditor.selectBlockToEdit', 'Select a block to edit properties')}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
