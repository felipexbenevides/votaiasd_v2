import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, Check, X, ChevronDown } from 'lucide-react';

interface CompactDateTimePickerProps {
  value: string; // Format: YYYY-MM-DDTHH:mm or ISO string or empty
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
}

const MONTHS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Fev' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Abr' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Ago' },
  { value: 9, label: 'Set' },
  { value: 10, label: 'Out' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dez' },
];

export const CompactDateTimePicker: React.FC<CompactDateTimePickerProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = 'DD/MM/AAAA HH:MM',
  id,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to parse value into components
  const parseDateTime = (val: string) => {
    let d = new Date(val);
    if (isNaN(d.getTime())) {
      // Default to today + 7 days at 23:59
      d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(23, 59, 0, 0);
    }
    return {
      day: d.getDate(),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      hour: d.getHours(),
      minute: d.getMinutes(),
    };
  };

  const currentParsed = parseDateTime(value);
  const [tempDay, setTempDay] = useState(currentParsed.day);
  const [tempMonth, setTempMonth] = useState(currentParsed.month);
  const [tempYear, setTempYear] = useState(currentParsed.year);
  const [tempHour, setTempHour] = useState(currentParsed.hour);
  const [tempMinute, setTempMinute] = useState(currentParsed.minute);

  // Synchronize when value changes or when opening
  useEffect(() => {
    if (value) {
      const parsed = parseDateTime(value);
      setTempDay(parsed.day);
      setTempMonth(parsed.month);
      setTempYear(parsed.year);
      setTempHour(parsed.hour);
      setTempMinute(parsed.minute);
    }
  }, [value, isOpen]);

  // Close on click outside or touch outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen]);

  // Days in selected month
  const getDaysInMonth = (m: number, y: number) => {
    return new Date(y, m, 0).getDate();
  };

  const daysInCurrentMonth = getDaysInMonth(tempMonth, tempYear);
  const validDay = Math.min(tempDay, daysInCurrentMonth);

  // Year options (current year and next 2 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear + 1, currentYear + 2];

  // Format date display DD/MM/AAAA HH:MM
  const formatDisplay = (val: string): string => {
    if (!val) return '';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const handleConfirm = () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const safeDay = Math.min(tempDay, daysInCurrentMonth);
    const formatted = `${tempYear}-${pad(tempMonth)}-${pad(safeDay)}T${pad(tempHour)}:${pad(tempMinute)}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const handleQuickAdd = (daysToAdd: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    setTempDay(d.getDate());
    setTempMonth(d.getMonth() + 1);
    setTempYear(d.getFullYear());
    setTempHour(23);
    setTempMinute(59);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button/Field */}
      <div
        id={id}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 bg-white border border-[#D1D5DB] hover:border-[#9CA3AF] rounded-xl px-3.5 py-2 text-xs text-[#111827] cursor-pointer transition-colors shadow-2xs select-none ${
          disabled ? 'opacity-50 cursor-not-allowed bg-[#F9FAFB]' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
          <span className={`font-medium truncate ${value ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>
            {value ? formatDisplay(value) : placeholder}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-0.5 text-[#9CA3AF] hover:text-[#DC2626] rounded-md transition-colors cursor-pointer"
              title="Remover prazo (sem prazo)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-[#6B7280] transition-transform duration-150 shrink-0 ${
              isOpen ? 'rotate-180 text-[#111827]' : ''
            }`}
          />
        </div>
      </div>

      {/* Compact Popover Dialog */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Selecionar data e hora limite"
          className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-50 w-full min-w-[280px] max-w-[320px] bg-white border border-[#D1D5DB] rounded-2xl shadow-xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#111827]">
              <Clock className="w-3.5 h-3.5 text-[#6B7280]" />
              <span>Data e Hora Limite</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-[#9CA3AF] hover:text-[#111827] rounded-lg transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Shortcuts */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleQuickAdd(1)}
              className="px-2 py-0.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] rounded-lg text-[10px] font-semibold transition-colors cursor-pointer"
            >
              +24h
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd(3)}
              className="px-2 py-0.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] rounded-lg text-[10px] font-semibold transition-colors cursor-pointer"
            >
              +3 dias
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd(7)}
              className="px-2 py-0.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] rounded-lg text-[10px] font-semibold transition-colors cursor-pointer"
            >
              +7 dias
            </button>
            <button
              type="button"
              onClick={() => {
                setTempHour(23);
                setTempMinute(59);
              }}
              className="px-2 py-0.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ml-auto"
            >
              23:59
            </button>
          </div>

          {/* Date Selector Row: Dia / Mês / Ano */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
              Data (Dia / Mês / Ano)
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {/* Dia */}
              <select
                value={validDay}
                onChange={(e) => setTempDay(Number(e.target.value))}
                className="bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-2 py-1.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-[#111827]"
              >
                {Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {String(d).padStart(2, '0')}
                  </option>
                ))}
              </select>

              {/* Mês */}
              <select
                value={tempMonth}
                onChange={(e) => setTempMonth(Number(e.target.value))}
                className="bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-2 py-1.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-[#111827]"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {/* Ano */}
              <select
                value={tempYear}
                onChange={(e) => setTempYear(Number(e.target.value))}
                className="bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-2 py-1.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-[#111827]"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Time Selector Row: Hora : Minuto */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
              Horário (Hora : Minuto)
            </span>
            <div className="flex items-center gap-1.5">
              {/* Hora */}
              <select
                value={tempHour}
                onChange={(e) => setTempHour(Number(e.target.value))}
                className="flex-1 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-[#111827]"
              >
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}h
                  </option>
                ))}
              </select>

              <span className="font-bold text-xs text-[#9CA3AF]">:</span>

              {/* Minuto */}
              <select
                value={tempMinute}
                onChange={(e) => setTempMinute(Number(e.target.value))}
                className="flex-1 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-[#111827]"
              >
                {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}min
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary Preview: DD/MM/AAAA HH:MM */}
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5 flex items-center justify-between text-[11px]">
            <span className="text-[#6B7280]">Formato final:</span>
            <span className="font-mono font-bold text-[#111827]">
              {String(validDay).padStart(2, '0')}/{String(tempMonth).padStart(2, '0')}/{tempYear}{' '}
              {String(tempHour).padStart(2, '0')}:{String(tempMinute).padStart(2, '0')}
            </span>
          </div>

          {/* Action Buttons: Sem Prazo, Cancelar & Confirmar */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={handleClear}
              className="px-2.5 py-1.5 text-xs text-[#DC2626] hover:bg-[#FEF2F2] rounded-xl transition-colors cursor-pointer font-medium"
              title="Deixar sem prazo limite"
            >
              Sem Prazo
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-3.5 py-1.5 bg-[#111827] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Check className="w-3.5 h-3.5 text-[#34D399]" />
                <span>Confirmar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
