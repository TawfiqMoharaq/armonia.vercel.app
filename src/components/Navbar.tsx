import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="flex justify-between items-center px-8 py-5 bg-white shadow-sm" dir="rtl">
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
  );
}
