import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { THEORY_GLOSSARY } from '../physics/materials';

interface TheoryModalProps {
  open: boolean;
  onClose: () => void;
}

export const TheoryModal: React.FC<TheoryModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const coreKeys = [
    'stress',
    'strain',
    'area',
    'young',
    'yield',
    'uts',
    'unloading',
    'elongation',
    'reduction',
    'toughness',
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Guía teórica y fundamentos matemáticos del ensayo de tracción"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Fundamentos Teóricos y Ecuaciones del Ensayo de Tracción
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mecánica de materiales en ensayo uniaxial cuasi-estático (normas ISO 6892-1 / ASTM E8)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar guía teórica"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Pedagogical Experiment Callout */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-1.5">
              Experimento guiado: ¿Por qué usamos σ–ε en lugar de F–ΔL?
            </h3>
            <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>
                Ejecuta un ensayo completo con <strong>Acero A36</strong> usando
                las dimensiones iniciales (D₀ = 12 mm, L₀ = 50 mm) y pulsa{' '}
                <strong>«Fijar ref.»</strong> en la barra superior de la gráfica.
              </li>
              <li>
                Pulsa <strong>«Reiniciar probeta»</strong>, aumenta el diámetro
                a D₀ = 16 mm y la longitud a L₀ = 80 mm, y ejecuta de nuevo el
                ensayo.
              </li>
              <li>
                Alterna entre los modos <strong>F – ΔL</strong> y{' '}
                <strong>σ – ε</strong>: verás que la curva fuerza-alargamiento
                cambia drásticamente de altura y anchura, mientras que la curva
                tensión-deformación se superpone de forma idéntica porque es una
                propiedad intrínseca del material.
              </li>
            </ol>
          </div>

          {/* 4 Regimes Overview */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Etapas físicas de la deformación uniaxial
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="border border-slate-200 rounded-lg p-3.5">
                <div className="font-semibold text-emerald-800 mb-1">
                  1. Zona Elástica (0 ≤ ε ≤ ε_y)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Relación lineal gobernada por la Ley de Hooke (σ = E·ε). Los
                  enlaces atómicos se estiran de forma reversible: si se retira
                  la carga antes de superar σ_y, la probeta recupera exactamente
                  su longitud L₀.
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3.5">
                <div className="font-semibold text-blue-800 mb-1">
                  2. Zona Plástica Uniforme (ε_y &lt; ε ≤ ε_u)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Movimiento irreversible de dislocaciones con endurecimiento por
                  deformación. Si se descarga en este tramo, la probeta retorna
                  por una recta paralela a E dejando una deformación plástica
                  permanente ε_pl.
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3.5">
                <div className="font-semibold text-amber-800 mb-1">
                  3. Estricción / Encuellamiento (ε_u &lt; ε &lt; ε_f)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Al alcanzar σ_R (UTS), la deformación se localiza en un cuello
                  central. Aunque la tensión real sigue creciendo, la fuerza y la
                  tensión nominal σ = F/S₀ descienden debido a la rápida reducción
                  de la sección local.
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3.5">
                <div className="font-semibold text-red-800 mb-1">
                  4. Rotura y Metrología Post-Ensayo
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Los metales dúctiles rompen con geometría copa-cono y alto A% y
                  Z%; los frágiles (como la fundición gris) presentan fractura
                  plana perpendicular al eje sin estricción apreciable.
                </p>
              </div>
            </div>
          </div>

          {/* Complete Formula Grid */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Formulario de referencia
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {coreKeys.map((key) => {
                const item = THEORY_GLOSSARY[key];
                return (
                  <div
                    key={key}
                    className="border border-slate-200 rounded-lg p-3.5 bg-white"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        {item.title}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 shrink-0">
                        {item.units}
                      </span>
                    </div>
                    <div className="mt-2 bg-slate-50 border border-slate-200/80 rounded px-2.5 py-1.5 font-mono text-xs text-blue-900">
                      {item.formula}
                    </div>
                    <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                      {item.summary}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
