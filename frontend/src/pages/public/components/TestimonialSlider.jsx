import { useState } from 'react';
import { FaStar, FaQuoteLeft, FaChevronLeft, FaChevronRight } from 'react-icons/fa';

const testimonials = [
  {
    name: 'Nguyễn Văn Minh',
    role: 'Marketing Manager',
    company: 'TechCorp Vietnam',
    avatar: 'N',
    content: 'FounderAI đã giúp chúng tôi tăng 300% hiệu quả chiến dịch email marketing chỉ trong 3 tháng đầu sử dụng.',
    rating: 5,
  },
  {
    name: 'Trần Thị Lan',
    role: 'CEO',
    company: 'EduLearn VN',
    avatar: 'T',
    content: 'Hệ thống tự động hóa của FounderAI tiết kiệm cho team tôi hơn 20 giờ mỗi tuần. Tuyệt vời!',
    rating: 5,
  },
  {
    name: 'Lê Hoàng Nam',
    role: 'Head of Sales',
    company: 'AutoSales Plus',
    avatar: 'L',
    content: 'Tỷ lệ chuyển đổi khách hàng tăng đáng kể nhờ Zalo marketing và email automation.',
    rating: 5,
  },
];

export default function TestimonialSlider() {
  const [current, setCurrent] = useState(0);

  const next = () => setCurrent((prev) => (prev + 1) % testimonials.length);
  const prev = () => setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);

  return (
    <div className="relative max-w-4xl mx-auto">
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {testimonials.map((testimonial, index) => (
            <div key={index} className="w-full flex-shrink-0 px-4">
              <div className="bg-white rounded-3xl p-8 md:p-12 shadow-2xl">
                <FaQuoteLeft className="text-4xl text-orange-200 mb-6" />
                <p className="text-xl md:text-2xl text-gray-700 mb-8 leading-relaxed italic">
                  {testimonial.content}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
                      {testimonial.avatar}
                    </div>
                    <div className="ml-4">
                      <div className="font-bold text-gray-900">{testimonial.name}</div>
                      <div className="text-gray-500">{testimonial.role} - {testimonial.company}</div>
                    </div>
                  </div>
                  <div className="flex">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <FaStar key={i} className="text-yellow-400" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={prev}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-orange-50 transition-colors"
      >
        <FaChevronLeft className="text-orange-500" />
      </button>
      <button
        onClick={next}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-orange-50 transition-colors"
      >
        <FaChevronRight className="text-orange-500" />
      </button>

      <div className="flex justify-center gap-2 mt-8">
        {testimonials.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrent(index)}
            className={`w-3 h-3 rounded-full transition-all ${current === index ? 'bg-orange-500 w-8' : 'bg-gray-300'}`}
          />
        ))}
      </div>
    </div>
  );
}
