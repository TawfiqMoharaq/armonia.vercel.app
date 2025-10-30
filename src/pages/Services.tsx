import React from "react";
import { Link } from "react-router-dom";

const Services: React.FC = () => {
  return (
    <div className="bg-[#F7FAFC] min-h-screen text-gray-800" dir="rtl">
      
      {/* Header */}
      <header className="flex justify-between items-center px-8 py-5 bg-white shadow-sm">
        <Link
          to="/"
          className="text-[#1E90A0] hover:text-[#085A73] text-lg font-medium transition"
        >
          الرئيسية
        </Link>

        <Link
          to="/"
          className="flex items-center gap-2 hover:opacity-80 transition"
        >
          <span className="text-2xl font-bold text-[#0A6D8B]">Armonia</span>
        </Link>
      </header>

      {/* Title */}
      <section className="py-20 text-center">
        <h2 className="text-4xl font-bold text-[#0A6D8B] mb-12">خدماتنا</h2>

        {/* Service Cards */}
        <div className="flex flex-wrap justify-center gap-10 px-4">
          
          {/* Motion Correction Service */}
          <div className="bg-white w-[350px] shadow-lg rounded-2xl p-8 border border-[#E6F4F7] hover:shadow-xl transition flex flex-col">
            <h3 className="text-2xl font-semibold text-[#0A6D8B] mb-4">
              🤸‍♂️ تصحيح الحركة بالذكاء الاصطناعي
            </h3>
            <p className="text-[#4A5568] flex-grow">
              تحليل فوري لحركة الجسم وتصحيح الوضعيات بالذكاء الاصطناعي
              بناءً على حالتك الصحية.
            </p>

            {/* ✅ تم تعديل الرابط هنا */}
            <Link
              to="/diagnosis"
              className="mt-6 block text-center bg-gradient-to-r from-[#0A6D8B] to-[#18A4B8] text-white px-8 py-3 rounded-lg hover:opacity-90 transition font-medium shadow-md"
            >
              جرب الخدمة
            </Link>
          </div>

          {/* Family Guidance Service */}
          <div className="bg-white w-[350px] shadow-lg rounded-2xl p-8 border border-[#E6F4F7] hover:shadow-xl transition flex flex-col">
            <h3 className="text-2xl font-semibold text-[#0A6D8B] mb-4">
              👨‍👩‍👦 الإرشاد الأسري الذكي
            </h3>
            <p className="text-[#4A5568] flex-grow">
              استبيانات تفاعلية وتحليل ذكي لتقديم خطة إرشاد مناسبة
              للأهالي ذوي أطفال التوحد.
            </p>

            <Link
              to="/family-guide"
              className="mt-6 block text-center bg-gradient-to-r from-[#0A6D8B] to-[#18A4B8] text-white px-8 py-3 rounded-lg hover:opacity-90 transition font-medium shadow-md"
            >
              ابدأ الآن
            </Link>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="mt-24 text-center text-sm text-[#4A5568] py-6 border-t border-[#E2E8F0]">
        الدعم الفني:{" "}
        <a
          href="mailto:ai.armonia.sa@gmail.com"
          className="text-[#0A6D8B] font-medium hover:underline"
        >
          ai.armonia.sa@gmail.com
        </a>
      </footer>

    </div>
  );
};

export default Services;
