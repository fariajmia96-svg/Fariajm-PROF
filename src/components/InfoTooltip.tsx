import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { THEORY_GLOSSARY } from '../physics/materials';

interface InfoTooltipProps {
  glossaryKey: keyof typeof THEORY_GLOSSARY;
  align?: 'left' | 'right' | 'center';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  glossaryKey,
  align = 'right',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const entry = THEORY_GLOSSARY[glossaryKey];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!entry) return null;

  const alignmentClass =
    align === 'left'
      ? 'left-0'
      : align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'right-0';

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={`Información teórica sobre ${entry.title}`}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-slate-400 hover:text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={entry.title}
          className={`absolute z-50 top-7 ${alignmentClass} w-72 sm:w-80 bg-white border border-slate-200 rounded-lg shadow-lg p-3.5 text-left`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="text-xs font-medium text-blue-700 font-mono">
                {entry.symbol} · {entry.units}
              </div>
              <h4 className="text-sm font-semibold text-slate-900 leading-snug mt-0.5">
                {entry.title}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar explicación"
              className="p-0.5 text-slate-400 hover:text-slate-700 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded px-2.5 py-1.5 font-mono text-xs text-slate-900 mb-2">
            {entry.formula}
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {entry.summary}
          </p>
        </div>
      )}
    </div>
  );
};
