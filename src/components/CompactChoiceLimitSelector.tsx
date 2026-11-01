import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

interface CompactChoiceLimitSelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
}

interface Coords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

export const CompactChoiceLimitSelector: React.FC<CompactChoiceLimitSelectorProps> = ({
  value,
  onChange,
  min = 1,
  max = 15,
  disabled = false,
  id,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<Coords>({
    top: 0,
    left: 0,
    width: 80,
    maxHeight: 240,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Generate numbers array from min to max
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  // Calculate coordinates relative to viewport so portal renders cleanly without any container clipping
  const calculateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Dropdown width: slightly wider than trigger button for easy clicking, at least 90px
    const dropdownWidth = Math.max(90, rect.width);

    // Horizontal alignment: align to left edge of trigger, or right edge if overflowing screen
    let left = rect.left;
    if (left + dropdownWidth > viewportWidth - 8) {
      left = Math.max(8, rect.right - dropdownWidth);
    }

    // Vertical alignment: open DOWN if sufficient space below, otherwise open UP
    // A comfortable maxHeight of up to 260px allows displaying ~7-8 items with clean scroll
    const preferDown = spaceBelow >= 200 || spaceBelow >= spaceAbove;

    if (preferDown) {
      const maxHeight = Math.min(260, Math.max(120, spaceBelow - 16));
      setCoords({
        top: rect.bottom + 4,
        bottom: undefined,
        left,
        width: dropdownWidth,
        maxHeight,
      });
    } else {
      const maxHeight = Math.min(260, Math.max(120, spaceAbove - 16));
      setCoords({
        top: undefined,
        bottom: viewportHeight - rect.top + 4,
        left,
        width: dropdownWidth,
        maxHeight,
      });
    }
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      calculateCoords();
    }
    setIsOpen((prev) => !prev);
  };

  // Close on outside click or touch
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // Keep dropdown aligned on scroll or resize; avoid jumping when scrolling inside the dropdown itself
  useEffect(() => {
    if (!isOpen) return;

    calculateCoords();

    const handleScroll = (e: Event) => {
      // Do not recalculate if user is scrolling inside the dropdown itself
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
        return;
      }
      calculateCoords();
    };

    const handleResize = () => {
      calculateCoords();
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  // Auto-scroll to selected option when opened so selected number (e.g. 10 or 15) is immediately visible
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const selectedEl = dropdownRef.current.querySelector('[aria-selected="true"]');
      if (selectedEl) {
        (selectedEl as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        calculateCoords();
        setIsOpen(true);
      } else {
        const next = Math.min(max, value + 1);
        onChange(next);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        calculateCoords();
        setIsOpen(true);
      } else {
        const prev = Math.max(min, value - 1);
        onChange(prev);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) {
        calculateCoords();
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    }
  };

  const dropdownMenu = isOpen && typeof document !== 'undefined' ? (
    <div
      ref={dropdownRef}
      role="listbox"
      tabIndex={-1}
      className="fixed bg-white border border-[#D1D5DB] rounded-xl shadow-2xl py-1 overflow-y-auto overscroll-contain z-[9999] animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: coords.top !== undefined ? `${coords.top}px` : undefined,
        bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
        left: `${coords.left}px`,
        width: `${coords.width}px`,
        maxHeight: `${coords.maxHeight}px`,
        scrollbarWidth: 'thin',
      }}
    >
      {options.map((num) => {
        const isSelected = num === value;
        return (
          <button
            key={num}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => {
              onChange(num);
              setIsOpen(false);
              triggerRef.current?.focus();
            }}
            className={`w-full px-3.5 py-1.5 text-xs sm:text-sm text-left flex items-center justify-between transition-colors cursor-pointer ${
              isSelected
                ? 'bg-[#F3F4F6] font-bold text-[#111827]'
                : 'text-[#374151] hover:bg-[#F9FAFB] hover:text-[#111827] font-medium'
            }`}
          >
            <span className="tabular-nums font-mono">{num}</span>
            {isSelected && <Check className="w-3.5 h-3.5 text-[#111827] shrink-0" />}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button: [ 3  ▼ ] */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Limite de escolhas: ${value}`}
        className="inline-flex items-center justify-between gap-2.5 font-bold text-sm bg-white hover:bg-[#F3F4F6] active:bg-[#E5E7EB] border border-[#D1D5DB] rounded-xl px-3.5 py-1.5 text-[#111827] focus:outline-hidden focus:ring-2 focus:ring-[#111827] cursor-pointer shadow-2xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none min-w-[68px]"
      >
        <span className="tabular-nums font-mono text-sm leading-none">{value}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#6B7280] transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180 text-[#111827]' : ''
          }`}
        />
      </button>

      {/* Render dropdown through portal directly to document.body to prevent clipping by overflow-hidden or overflow-y-auto parents */}
      {dropdownMenu && createPortal(dropdownMenu, document.body)}
    </div>
  );
};
