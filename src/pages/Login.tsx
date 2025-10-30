import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [isNew, setIsNew] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/services");
  };

  return (
    <div className="min-h-screen bg-[#F7FAFC] flex flex-col justify-center items-center p-6" dir="rtl">
      <div className="bg-white shadow-lg rounded-2xl p-8 max-w-md w-full text-center">
        <h2 className="text-3xl font-bold text-[#0A6D8B] mb-6">
          {isNew ? "إنشاء حساب جديد" : "تسجيل الدخول"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 text-right">
          {isNew && (
            <>
              <input
                type="text"
                placeholder="الاسم الكامل"
                className="w-full border p-3 rounded-lg"
                required
              />
              <input
                type="number"
                placeholder="العمر"
                className="w-full border p-3 rounded-lg"
                required
              />
            </>
          )}
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            className="w-full border p-3 rounded-lg"
            required
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            className="w-full border p-3 rounded-lg"
            required
          />

          <button
            type="submit"
            className="bg-gradient-to-r from-[#0A6D8B] to-[#18A4B8] text-white w-full py-3 rounded-lg shadow-md hover:opacity-90"
          >
            {isNew ? "إنشاء الحساب" : "تسجيل الدخول"}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-600">
          {isNew ? (
            <>
              لديك حساب؟{" "}
              <button onClick={() => setIsNew(false)} className="text-[#0A6D8B] font-semibold">
                تسجيل الدخول
              </button>
            </>
          ) : (
            <>
              مستخدم جديد؟{" "}
              <button onClick={() => setIsNew(true)} className="text-[#0A6D8B] font-semibold">
                إنشاء حساب
              </button>
            </>
          )}
        </div>
      </div>

      <footer className="mt-8 text-sm text-gray-500">
        الدعم الفني:{" "}
        <a href="mailto:ai.armonia.sa@gmail.com" className="text-[#0A6D8B] hover:underline">
          ai.armonia.sa@gmail.com
        </a>
      </footer>
    </div>
  );
};

export default Login;
