import React from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";

const Signup: React.FC = () => {
  const navigate = useNavigate();

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/services");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#F7FAFC]" dir="rtl">
      <div className="bg-white shadow-lg rounded-2xl p-10 w-96 text-center">
        <h2 className="text-2xl font-bold text-[#0A6D8B] mb-6">إنشاء حساب جديد</h2>
        <form className="flex flex-col gap-4" onSubmit={handleSignup}>
          <input
            type="text"
            placeholder="الاسم الكامل"
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]"
          />
          <input
            type="number"
            placeholder="العمر"
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]"
          />
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]"
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0A6D8B]"
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-[#0A6D8B] to-[#18A4B8] text-white py-2 rounded-lg font-semibold hover:opacity-90 transition"
          >
            إنشاء الحساب
          </button>
        </form>
      </div>

      <Footer />
    </div>
  );
};

export default Signup;
