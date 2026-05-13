-- Migration: Landing Page Templates System
-- Supports AI-generated landing pages with pre-built templates

-- 1. Landing Page Templates
CREATE TABLE landing_page_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'lead_capture', 'product', 'event', 'webinar', 'ecommerce', 'consultation'
  thumbnail_url TEXT,
  description TEXT,
  html_structure TEXT NOT NULL, -- HTML skeleton with Tailwind classes
  css_variables JSONB DEFAULT '{}', -- Customizable CSS variables
  default_config JSONB DEFAULT '{}', -- Default settings (colors, fonts, etc.)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lp_templates_category ON landing_page_templates(category);
CREATE INDEX idx_lp_templates_active ON landing_page_templates(is_active);

-- 2. Seed data: Basic templates
INSERT INTO landing_page_templates (name, category, description, html_structure, css_variables, default_config) VALUES

-- Template 1: Lead Capture - Modern
('Lead Capture - Hiện đại', 'lead_capture', 'Mẫu landing page thu thập lead với thiết kế hiện đại, form nổi bật',
'<div class="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center p-4">
  <div class="max-w-6xl w-full grid md:grid-cols-2 gap-8 items-center">
    <!-- Hero Section -->
    <div class="text-white space-y-6">
      <div class="inline-block px-4 py-1 bg-white/10 rounded-full text-sm backdrop-blur">{{tagline}}</div>
      <h1 class="text-4xl md:text-5xl font-bold leading-tight">{{headline}}</h1>
      <p class="text-lg text-white/80">{{subheadline}}</p>
      <div class="flex flex-wrap gap-4 pt-4">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
          <span class="text-sm">{{benefit_1}}</span>
        </div>
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
          <span class="text-sm">{{benefit_2}}</span>
        </div>
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
          <span class="text-sm">{{benefit_3}}</span>
        </div>
      </div>
    </div>

    <!-- Form Section -->
    <div class="bg-white rounded-3xl p-8 shadow-2xl">
      <h2 class="text-2xl font-bold text-gray-900 mb-2">{{form_title}}</h2>
      <p class="text-gray-600 mb-6">{{form_subtitle}}</p>
      <form class="space-y-4" onsubmit="event.preventDefault(); alert(''Thank you!'');">
        <input type="text" placeholder="Họ và tên" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" required>
        <input type="email" placeholder="Email của bạn" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" required>
        <input type="tel" placeholder="Số điện thoại" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" required>
        <button type="submit" class="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:opacity-90 transition">{{cta_text}}</button>
      </form>
      <p class="text-xs text-gray-400 mt-4 text-center">{{privacy_note}}</p>
    </div>
  </div>
</div>',
'{"primary_color": "#7C3AED", "secondary_color": "#EC4899", "bg_gradient_start": "#4F46E5", "bg_gradient_end": "#DB2777"}',
'{"headline": "Tiêu đề chính của bạn", "subheadline": "Mô tả ngắn về sản phẩm/dịch vụ", "tagline": "Ưu đãi đặc biệt"}'),

-- Template 2: Product Showcase
('Giới thiệu Sản phẩm', 'product', 'Landing page giới thiệu sản phẩm với hình ảnh lớn và tính năng nổi bật',
'<div class="min-h-screen bg-white">
  <!-- Header -->
  <header class="bg-white shadow-sm sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
      <div class="text-2xl font-bold text-gray-900">{{brand_name}}</div>
      <a href="#form" class="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-full hover:bg-indigo-700 transition">{{cta_text}}</a>
    </div>
  </header>

  <!-- Hero -->
  <section class="py-16 bg-gradient-to-br from-slate-50 to-blue-50">
    <div class="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
      <div class="space-y-6">
        <span class="inline-block px-4 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">{{tagline}}</span>
        <h1 class="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">{{headline}}</h1>
        <p class="text-xl text-gray-600">{{subheadline}}</p>
        <div class="flex gap-4 pt-4">
          <a href="#form" class="px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">{{cta_primary}}</a>
          <a href="#features" class="px-8 py-4 bg-white border-2 border-gray-200 text-gray-700 font-bold rounded-xl hover:border-indigo-300 transition">{{cta_secondary}}</a>
        </div>
      </div>
      <div class="relative">
        <div class="bg-gradient-to-br from-indigo-100 to-purple-100 rounded-3xl p-12 aspect-square flex items-center justify-center">
          <div class="text-8xl">{{product_emoji}}</div>
        </div>
        <div class="absolute -bottom-4 -right-4 bg-white rounded-2xl p-4 shadow-xl">
          <div class="flex items-center gap-2">
            <span class="text-2xl">⭐</span>
            <div>
              <div class="font-bold text-gray-900">{{rating}}</div>
              <div class="text-sm text-gray-500">{{review_count}} đánh giá</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section id="features" class="py-20">
    <div class="max-w-7xl mx-auto px-4">
      <h2 class="text-3xl font-bold text-center mb-12">{{features_title}}</h2>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="text-center p-6 rounded-2xl bg-gray-50 hover:bg-gray-100 transition">
          <div class="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">{{feature_1_icon}}</div>
          <h3 class="text-xl font-bold mb-2">{{feature_1_title}}</h3>
          <p class="text-gray-600">{{feature_1_desc}}</p>
        </div>
        <div class="text-center p-6 rounded-2xl bg-gray-50 hover:bg-gray-100 transition">
          <div class="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">{{feature_2_icon}}</div>
          <h3 class="text-xl font-bold mb-2">{{feature_2_title}}</h3>
          <p class="text-gray-600">{{feature_2_desc}}</p>
        </div>
        <div class="text-center p-6 rounded-2xl bg-gray-50 hover:bg-gray-100 transition">
          <div class="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">{{feature_3_icon}}</div>
          <h3 class="text-xl font-bold mb-2">{{feature_3_title}}</h3>
          <p class="text-gray-600">{{feature_3_desc}}</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Form -->
  <section id="form" class="py-20 bg-gradient-to-br from-indigo-900 to-purple-900">
    <div class="max-w-2xl mx-auto px-4">
      <div class="bg-white rounded-3xl p-8 shadow-2xl">
        <h2 class="text-2xl font-bold text-center mb-2">{{form_title}}</h2>
        <p class="text-gray-600 text-center mb-6">{{form_subtitle}}</p>
        <form class="space-y-4" onsubmit="event.preventDefault(); alert(''Thank you!'');">
          <input type="text" placeholder="Họ và tên" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
          <input type="email" placeholder="Email" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
          <input type="tel" placeholder="Số điện thoại" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
          <button type="submit" class="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition">{{cta_text}}</button>
        </form>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="bg-gray-900 text-white py-8">
    <div class="max-w-7xl mx-auto px-4 text-center">
      <p class="text-gray-400">© 2024 {{brand_name}}. All rights reserved.</p>
    </div>
  </footer>
</div>',
'{"primary_color": "#4F46E5", "secondary_color": "#7C3AED"}',
'{"brand_name": "Tên thương hiệu", "tagline": "Sản phẩm của năm"}'),

-- Template 3: Webinar/Event
('Webinar - Sự kiện', 'event', 'Landing page cho webinar hoặc sự kiện trực tuyến',
'<div class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
  <div class="max-w-5xl mx-auto px-4 py-16">
    <!-- Event Badge -->
    <div class="text-center mb-8">
      <span class="inline-block px-6 py-2 bg-red-500/20 border border-red-500/50 rounded-full text-red-400 text-sm font-semibold">{{event_type}}</span>
    </div>

    <!-- Title -->
    <div class="text-center mb-12">
      <h1 class="text-4xl md:text-6xl font-bold text-white mb-6">{{headline}}</h1>
      <p class="text-xl text-gray-300 max-w-3xl mx-auto">{{subheadline}}</p>
    </div>

    <!-- Event Details -->
    <div class="grid md:grid-cols-3 gap-6 mb-12">
      <div class="bg-white/5 backdrop-blur rounded-2xl p-6 text-center border border-white/10">
        <div class="text-4xl mb-3">📅</div>
        <div class="text-white font-bold text-lg">{{event_date}}</div>
        <div class="text-gray-400 text-sm">{{event_time}}</div>
      </div>
      <div class="bg-white/5 backdrop-blur rounded-2xl p-6 text-center border border-white/10">
        <div class="text-4xl mb-3">⏰</div>
        <div class="text-white font-bold text-lg">{{duration}}</div>
        <div class="text-gray-400 text-sm">Thời lượng</div>
      </div>
      <div class="bg-white/5 backdrop-blur rounded-2xl p-6 text-center border border-white/10">
        <div class="text-4xl mb-3">👥</div>
        <div class="text-white font-bold text-lg">{{spots_left}}</div>
        <div class="text-gray-400 text-sm">Suất còn lại</div>
      </div>
    </div>

    <!-- What You Will Learn -->
    <div class="bg-white/5 backdrop-blur rounded-3xl p-8 mb-12 border border-white/10">
      <h2 class="text-2xl font-bold text-white mb-6 text-center">{{learn_title}}</h2>
      <div class="grid md:grid-cols-2 gap-4">
        <div class="flex items-start gap-3">
          <span class="text-green-400 text-xl">✓</span>
          <span class="text-gray-300">{{learn_1}}</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-green-400 text-xl">✓</span>
          <span class="text-gray-300">{{learn_2}}</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-green-400 text-xl">✓</span>
          <span class="text-gray-300">{{learn_3}}</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-green-400 text-xl">✓</span>
          <span class="text-gray-300">{{learn_4}}</span>
        </div>
      </div>
    </div>

    <!-- Speaker -->
    <div class="bg-white/10 backdrop-blur rounded-3xl p-8 mb-12 border border-white/10">
      <h2 class="text-xl font-bold text-white mb-4 text-center">Diễn giả</h2>
      <div class="flex items-center gap-6 justify-center">
        <div class="w-24 h-24 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-4xl">{{speaker_emoji}}</div>
        <div>
          <div class="text-white font-bold text-xl">{{speaker_name}}</div>
          <div class="text-gray-400">{{speaker_title}}</div>
        </div>
      </div>
    </div>

    <!-- Registration Form -->
    <div class="bg-white rounded-3xl p-8 shadow-2xl" id="register">
      <h2 class="text-2xl font-bold text-center mb-2">{{form_title}}</h2>
      <p class="text-gray-600 text-center mb-6">{{form_subtitle}}</p>
      <form class="space-y-4" onsubmit="event.preventDefault(); alert(''Registration successful!'');">
        <input type="text" placeholder="Họ và tên" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" required>
        <input type="email" placeholder="Email" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" required>
        <input type="tel" placeholder="Số điện thoại" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" required>
        <button type="submit" class="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:opacity-90 transition">{{cta_text}}</button>
      </form>
    </div>
  </div>
</div>',
'{"primary_color": "#7C3AED", "accent_color": "#EC4899"}',
'{"event_type": "WEBINAR MIỄN PHÍ"}'),

-- Template 4: E-commerce
('Cửa hàng - Bán hàng', 'ecommerce', 'Landing page bán hàng với showcase sản phẩm và pricing',
'<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="bg-white shadow-sm">
    <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
      <div class="text-2xl font-bold text-gray-900">{{brand_name}}</div>
      <a href="#buy" class="px-6 py-2 bg-pink-600 text-white font-semibold rounded-full hover:bg-pink-700 transition">{{cta_text}}</a>
    </div>
  </header>

  <!-- Hero -->
  <section class="py-20 bg-gradient-to-br from-pink-500 to-rose-600">
    <div class="max-w-7xl mx-auto px-4 text-center text-white">
      <span class="inline-block px-4 py-1 bg-white/20 rounded-full text-sm font-medium mb-4">{{badge}}</span>
      <h1 class="text-4xl md:text-6xl font-bold mb-6">{{headline}}</h1>
      <p class="text-xl text-white/90 max-w-3xl mx-auto mb-8">{{subheadline}}</p>
      <a href="#buy" class="inline-block px-10 py-4 bg-white text-pink-600 font-bold rounded-full hover:bg-gray-100 transition shadow-xl">{{cta_primary}}</a>
    </div>
  </section>

  <!-- Product Showcase -->
  <section class="py-20">
    <div class="max-w-7xl mx-auto px-4">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div class="bg-gradient-to-br from-pink-100 to-rose-100 rounded-3xl p-16 flex items-center justify-center">
          <div class="text-9xl">{{product_emoji}}</div>
        </div>
        <div class="space-y-6">
          <h2 class="text-3xl font-bold text-gray-900">{{product_name}}</h2>
          <p class="text-gray-600 text-lg">{{product_description}}</p>
          <div class="flex items-center gap-4">
            <span class="text-4xl font-bold text-pink-600">{{price}}</span>
            <span class="text-xl text-gray-400 line-through">{{original_price}}</span>
            <span class="px-3 py-1 bg-red-100 text-red-600 rounded-full text-sm font-bold">{{discount}}</span>
          </div>
          <ul class="space-y-3">
            <li class="flex items-center gap-2"><span class="text-green-500">✓</span> <span>{{feature_1}}</span></li>
            <li class="flex items-center gap-2"><span class="text-green-500">✓</span> <span>{{feature_2}}</span></li>
            <li class="flex items-center gap-2"><span class="text-green-500">✓</span> <span>{{feature_3}}</span></li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- Testimonials -->
  <section class="py-20 bg-white">
    <div class="max-w-7xl mx-auto px-4">
      <h2 class="text-3xl font-bold text-center mb-12">{{testimonials_title}}</h2>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="bg-gray-50 rounded-2xl p-6">
          <div class="flex text-yellow-400 mb-4">★★★★★</div>
          <p class="text-gray-600 mb-4">"{{testimonial_1_text}}"</p>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center">{{testimonial_1_emoji}}</div>
            <div>
              <div class="font-bold text-gray-900">{{testimonial_1_name}}</div>
              <div class="text-sm text-gray-500">{{testimonial_1_role}}</div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 rounded-2xl p-6">
          <div class="flex text-yellow-400 mb-4">★★★★★</div>
          <p class="text-gray-600 mb-4">"{{testimonial_2_text}}"</p>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">{{testimonial_2_emoji}}</div>
            <div>
              <div class="font-bold text-gray-900">{{testimonial_2_name}}</div>
              <div class="text-sm text-gray-500">{{testimonial_2_role}}</div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 rounded-2xl p-6">
          <div class="flex text-yellow-400 mb-4">★★★★★</div>
          <p class="text-gray-600 mb-4">"{{testimonial_3_text}}"</p>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">{{testimonial_3_emoji}}</div>
            <div>
              <div class="font-bold text-gray-900">{{testimonial_3_name}}</div>
              <div class="text-sm text-gray-500">{{testimonial_3_role}}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Buy Section -->
  <section id="buy" class="py-20 bg-gradient-to-br from-pink-600 to-rose-600">
    <div class="max-w-md mx-auto px-4">
      <div class="bg-white rounded-3xl p-8 shadow-2xl">
        <h2 class="text-2xl font-bold text-center mb-6">Đặt hàng ngay</h2>
        <form class="space-y-4" onsubmit="event.preventDefault(); alert(''Order placed!'');">
          <input type="text" placeholder="Họ và tên" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none" required>
          <input type="tel" placeholder="Số điện thoại" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none" required>
          <input type="text" placeholder="Địa chỉ" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none" required>
          <button type="submit" class="w-full py-4 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition">{{cta_text}}</button>
        </form>
        <p class="text-xs text-gray-400 mt-4 text-center">Thanh toán khi nhận hàng (COD)</p>
      </div>
    </div>
  </section>

  <footer class="bg-gray-900 text-white py-8 text-center">
    <p class="text-gray-400">© 2024 {{brand_name}}</p>
  </footer>
</div>',
'{"primary_color": "#DB2777", "secondary_color": "#E11D48"}',
'{"badge": "ƯU ĐÃI 50%", "discount": "-50%"}'),

-- Template 5: Consultation
('Tư vấn - Dịch vụ', 'consultation', 'Landing page dịch vụ tư vấn với booking form',
'<div class="min-h-screen bg-white">
  <!-- Navigation -->
  <nav class="bg-white border-b">
    <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
      <div class="text-2xl font-bold text-gray-900">{{brand_name}}</div>
      <a href="#book" class="px-6 py-2 bg-emerald-600 text-white font-semibold rounded-full hover:bg-emerald-700 transition">Đặt lịch tư vấn</a>
    </div>
  </nav>

  <!-- Hero -->
  <section class="py-20 bg-gradient-to-br from-emerald-50 to-teal-50">
    <div class="max-w-7xl mx-auto px-4">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div class="space-y-6">
          <span class="inline-block px-4 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">{{badge}}</span>
          <h1 class="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">{{headline}}</h1>
          <p class="text-xl text-gray-600">{{subheadline}}</p>
          <div class="grid grid-cols-2 gap-4 pt-4">
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <div class="text-3xl font-bold text-emerald-600">{{years_exp}}</div>
              <div class="text-gray-600 text-sm">Năm kinh nghiệm</div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <div class="text-3xl font-bold text-emerald-600">{{clients_served}}</div>
              <div class="text-gray-600 text-sm">Khách hàng</div>
            </div>
          </div>
        </div>
        <div class="relative">
          <div class="bg-gradient-to-br from-emerald-100 to-teal-100 rounded-3xl p-12">
            <div class="text-8xl text-center">{{consultant_emoji}}</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Services -->
  <section class="py-20">
    <div class="max-w-7xl mx-auto px-4">
      <h2 class="text-3xl font-bold text-center mb-12">{{services_title}}</h2>
      <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-emerald-50 rounded-2xl p-6 hover:bg-emerald-100 transition">
          <div class="text-4xl mb-4">{{service_1_icon}}</div>
          <h3 class="font-bold text-gray-900 mb-2">{{service_1_title}}</h3>
          <p class="text-gray-600 text-sm">{{service_1_desc}}</p>
        </div>
        <div class="bg-teal-50 rounded-2xl p-6 hover:bg-teal-100 transition">
          <div class="text-4xl mb-4">{{service_2_icon}}</div>
          <h3 class="font-bold text-gray-900 mb-2">{{service_2_title}}</h3>
          <p class="text-gray-600 text-sm">{{service_2_desc}}</p>
        </div>
        <div class="bg-cyan-50 rounded-2xl p-6 hover:bg-cyan-100 transition">
          <div class="text-4xl mb-4">{{service_3_icon}}</div>
          <h3 class="font-bold text-gray-900 mb-2">{{service_3_title}}</h3>
          <p class="text-gray-600 text-sm">{{service_3_desc}}</p>
        </div>
        <div class="bg-blue-50 rounded-2xl p-6 hover:bg-blue-100 transition">
          <div class="text-4xl mb-4">{{service_4_icon}}</div>
          <h3 class="font-bold text-gray-900 mb-2">{{service_4_title}}</h3>
          <p class="text-gray-600 text-sm">{{service_4_desc}}</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Process -->
  <section class="py-20 bg-gray-50">
    <div class="max-w-7xl mx-auto px-4">
      <h2 class="text-3xl font-bold text-center mb-12">{{process_title}}</h2>
      <div class="grid md:grid-cols-4 gap-8">
        <div class="text-center">
          <div class="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">1</div>
          <h3 class="font-bold mb-2">{{step_1_title}}</h3>
          <p class="text-gray-600 text-sm">{{step_1_desc}}</p>
        </div>
        <div class="text-center">
          <div class="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">2</div>
          <h3 class="font-bold mb-2">{{step_2_title}}</h3>
          <p class="text-gray-600 text-sm">{{step_2_desc}}</p>
        </div>
        <div class="text-center">
          <div class="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">3</div>
          <h3 class="font-bold mb-2">{{step_3_title}}</h3>
          <p class="text-gray-600 text-sm">{{step_3_desc}}</p>
        </div>
        <div class="text-center">
          <div class="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">4</div>
          <h3 class="font-bold mb-2">{{step_4_title}}</h3>
          <p class="text-gray-600 text-sm">{{step_4_desc}}</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Booking Form -->
  <section id="book" class="py-20 bg-gradient-to-br from-emerald-600 to-teal-600">
    <div class="max-w-lg mx-auto px-4">
      <div class="bg-white rounded-3xl p-8 shadow-2xl">
        <h2 class="text-2xl font-bold text-center mb-2">{{form_title}}</h2>
        <p class="text-gray-600 text-center mb-6">{{form_subtitle}}</p>
        <form class="space-y-4" onsubmit="event.preventDefault(); alert(''Booking confirmed!'');">
          <input type="text" placeholder="Họ và tên" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" required>
          <input type="email" placeholder="Email" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" required>
          <input type="tel" placeholder="Số điện thoại" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" required>
          <select class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" required>
            <option value="">Chọn dịch vụ</option>
            <option>{{service_option_1}}</option>
            <option>{{service_option_2}}</option>
            <option>{{service_option_3}}</option>
          </select>
          <textarea placeholder="Mô tả ngắn về nhu cầu" rows="3" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"></textarea>
          <button type="submit" class="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition">{{cta_text}}</button>
        </form>
      </div>
    </div>
  </section>

  <footer class="bg-gray-900 text-white py-8 text-center">
    <p class="text-gray-400">© 2024 {{brand_name}}</p>
  </footer>
</div>',
'{"primary_color": "#059669", "secondary_color": "#0D9488"}',
'{"badge": "DỊCH VỤ CHUYÊN NGHIỆP"}');

-- 3. Add template_id to landing_pages for reference
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES landing_page_templates(id);
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS custom_config JSONB DEFAULT '{}';

-- 4. Create index for template lookup
CREATE INDEX IF NOT EXISTS idx_landing_pages_template ON landing_pages(template_id);
