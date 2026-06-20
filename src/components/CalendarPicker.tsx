import { useState, useEffect, useRef } from 'react';
import { PresetType } from '../types';

interface CalendarPickerProps {
  preset: PresetType;
  setPreset: (preset: PresetType) => void;
  calState: { from: string | null; to: string | null };
  setCalState: (state: { from: string | null; to: string | null }) => void;
  onApply: () => void;
}

export function CalendarPicker({
  preset,
  setPreset,
  calState,
  setCalState,
  onApply
}: CalendarPickerProps) {
  const [openDropdown, setOpenDropdown] = useState<'from' | 'to' | null>(null);
  
  // View month states for calendar views
  const [fromViewMonth, setFromViewMonth] = useState<Date>(new Date());
  const [toViewMonth, setToViewMonth] = useState<Date>(new Date());

  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  // Close calendar popups when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        openDropdown === 'from' && 
        fromRef.current && 
        !fromRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
      if (
        openDropdown === 'to' && 
        toRef.current && 
        !toRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  // Sync calendar opening with state defaults
  useEffect(() => {
    if (preset === '1') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      setFromViewMonth(yesterday);
    } else {
      setFromViewMonth(new Date());
      setToViewMonth(new Date());
    }
  }, [preset]);

  const toYMD = (d: Date): string => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handleMonthChange = (type: 'from' | 'to', delta: number) => {
    if (type === 'from') {
      setFromViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    } else {
      setToViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    }
  };

  const handleSelectDate = (type: 'from' | 'to', ymd: string) => {
    if (preset === '1') {
      // Single Day Mode: Set both to same date, store in LocalStorage and trigger close
      setCalState({ from: ymd, to: ymd });
      localStorage.setItem('selectedSingleDate', ymd);
      setOpenDropdown(null);
    } else {
      const newState = { ...calState, [type]: ymd };
      setCalState(newState);
      setOpenDropdown(null);
    }
  };

  const handleClear = () => {
    setCalState({ from: null, to: null });
    localStorage.removeItem('selectedSingleDate');
    setOpenDropdown(null);
  };

  const todayStr = toYMD(new Date());

  const renderCalendarGrid = (type: 'from' | 'to') => {
    const isSingleMode = preset === '1';
    const vm = type === 'from' ? fromViewMonth : toViewMonth;
    const year = vm.getFullYear();
    const month = vm.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const grid = [];
    
    // Empty boxes for preceding month offset
    for (let i = 0; i < firstDay; i++) {
      grid.push(<div key={`empty-${i}`} className="cal-day cal-empty p-1.5" />);
    }

    // Days list
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isFuture = ymd > todayStr;
      const isToday = ymd === todayStr;
      
      // Determine selection highlighting based on preset
      let isSelected = false;
      if (isSingleMode) {
        isSelected = ymd === calState.from;
      } else {
        isSelected = ymd === calState[type];
      }

      const isSubRangeHighlight = !isSingleMode && calState.from && calState.to && ymd >= calState.from && ymd <= calState.to;

      let cls = "cal-day text-center p-1 px-2 text-xs rounded-sm transition-all duration-100 font-mono select-none cursor-pointer ";
      if (isFuture) {
        cls += "opacity-30 cursor-not-allowed pointer-events-none ";
      } else {
        if (isSelected) {
          cls += "bg-blue-600 text-white font-semibold shadow-sm ";
        } else if (isSubRangeHighlight) {
          cls += "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 ";
        } else if (isToday) {
          cls += "text-blue-500 font-bold border border-blue-500/20 ";
        } else {
          cls += "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 ";
        }
      }

      grid.push(
        <div
          key={`day-${d}`}
          className={cls}
          onClick={() => {
            if (!isFuture) handleSelectDate(type, ymd);
          }}
        >
          {d}
        </div>
      );
    }

    return (
      <div className="cal-popup open mt-2 p-3 bg-white dark:bg-[#0d1420] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-[280px]">
        {/* Nav Header */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-lg hover:text-blue-500 hover:border-blue-500 text-sm transition-all shadow-sm"
            onClick={() => handleMonthChange(type, -1)}
          >
            ‹
          </button>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-none">
            {monthNames[month]} {year}
          </span>
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-lg hover:text-blue-500 hover:border-blue-500 text-sm transition-all shadow-sm"
            onClick={() => handleMonthChange(type, 1)}
          >
            ›
          </button>
        </div>

        {/* Days Header */}
        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(w => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1">
          {grid}
        </div>

        {/* Footer info and clear */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
            {isSingleMode ? (calState.from || 'Select date') : (calState.from && calState.to ? `${calState.from} to ${calState.to}` : 'Pick range')}
          </span>
          <button
            type="button"
            className="text-[10px] text-red-500 hover:underline cursor-pointer bg-transparent border-none p-0 inline-block font-sans"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
      </div>
    );
  };

  const isCustomOrSingle = preset === 'custom' || preset === '1';

  return (
    <>
      {/* Preset Dropdown */}
      <div className="flex flex-col gap-1.5 min-w-[130px]">
        <label className="text-[10px] text-slate-450 dark:text-slate-500 font-bold uppercase tracking-wider">
          Preset
        </label>
        <select
          id="preset"
          className="p-2.5 px-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-800 dark:text-slate-100 rounded-lg text-xs leading-tight font-sans transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-xs cursor-pointer w-full"
          value={preset}
          onChange={(e) => {
            const val = e.target.value as PresetType;
            setPreset(val);
          }}
        >
          <option value="7">Last 7 days</option>
          <option value="28">Last 28 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 365 days</option>
          <option value="1">Single Day</option>
          <option value="custom">Custom range</option>
        </select>
      </div>

      {/* Date Pickers for Custom and Single day */}
      {isCustomOrSingle && (
        <>
          {/* From Picker */}
          <div className="relative flex flex-col gap-1.5 min-w-[125px]" ref={fromRef}>
            <label className="text-[10px] text-slate-450 dark:text-slate-500 font-bold uppercase tracking-wider">
              {preset === '1' ? 'Target Date' : 'From'}
            </label>
            <div
              className={`flex items-center gap-2 p-2.5 px-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-800 dark:text-slate-100 rounded-lg text-xs font-mono cursor-pointer transition-all hover:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-xs ${openDropdown === 'from' ? 'border-blue-500 ring-1 ring-blue-500/10' : ''}`}
              onClick={() => setOpenDropdown(openDropdown === 'from' ? null : 'from')}
            >
              <span>📅</span>
              <span className="truncate">{calState.from || 'Select date'}</span>
            </div>
            {openDropdown === 'from' && (
              <div className="absolute top-full left-0 z-50">
                {renderCalendarGrid('from')}
              </div>
            )}
          </div>

          {/* Spacer if Custom range */}
          {preset === 'custom' && (
            <div className="flex items-center justify-center self-end pb-3 select-none text-slate-400 dark:text-slate-500 font-bold px-0.5">
              →
            </div>
          )}

          {/* To Picker */}
          {preset === 'custom' && (
            <div className="relative flex flex-col gap-1.5 min-w-[125px]" ref={toRef}>
              <label className="text-[10px] text-slate-450 dark:text-slate-500 font-bold uppercase tracking-wider">
                To
              </label>
              <div
                className={`flex items-center gap-2 p-2.5 px-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-800 dark:text-slate-100 rounded-lg text-xs font-mono cursor-pointer transition-all hover:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-xs ${openDropdown === 'to' ? 'border-blue-500 ring-1 ring-blue-500/10' : ''}`}
                onClick={() => setOpenDropdown(openDropdown === 'to' ? null : 'to')}
              >
                <span>📅</span>
                <span className="truncate">{calState.to || 'Select date'}</span>
              </div>
              {openDropdown === 'to' && (
                <div className="absolute top-full left-0 z-50">
                  {renderCalendarGrid('to')}
                </div>
              )}
            </div>
          )}

          {/* Actions to apply */}
          <div className="flex flex-col gap-1.5 self-end">
            <button
              type="button"
              className="p-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold rounded-lg text-xs transition-all flex items-center justify-center cursor-pointer h-[38px] shadow-sm"
              onClick={onApply}
            >
              Apply
            </button>
          </div>
        </>
      )}
    </>
  );
}
