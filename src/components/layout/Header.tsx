'use client';
import { Menu } from 'lucide-react';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="fixed top-2.5 left-1 z-[60]">
      {/* Ultra Glass Liquid Hamburger toggle */}
      <button
        id="btn-toggle-sidebar"
        onClick={onMenuClick}
        className="group relative flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 shadow-sm hover:bg-white/15 hover:border-white/20 transition-all duration-300 active:scale-95 overflow-hidden"
        aria-label="Toggle sidebar"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
        <Menu size={20} className="text-white group-hover:text-blue-200 transition-colors" />
      </button>
    </header>
  );
}
