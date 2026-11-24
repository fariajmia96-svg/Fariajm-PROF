import React, { useEffect, useMemo, useState } from 'react';
import { X, ZoomIn, ZoomOut, ArrowRight } from 'lucide-react';
import { MATERIAL_LIST, MaterialId } from '../physics/materials';
import {
  computeSnapshot,
  sampleMonotonicCurve,
} from '../physics/tensileEngine';

interface MaterialComparisonModalProps {
  open: boolean;
  onClose: () => void;
  selectedMaterialId: MaterialId;
  onSelectAndClose: (id: MaterialId) => void;
}

export const MaterialComparisonModal: React.FC<MaterialComparisonModalProps> = ({
  open,
  onClose,
  selectedMaterialId,
  onSelectAndClose,
}) => {
  const [zoomLowStrain, setZoomLowStrain] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const comparisonData = useMemo(() => {
    const refGeom = { d0: 12, l0: 50 };
    return MATERIAL_LIST.map((mat) => {
      const pts = sampleMonotonicCurve(mat, refGeom, mat.fractureStrain);
      const finalSnap = computeSnapshot(
        mat,
        refGeom,
        mat.fractureStrain,
        mat.fractureStrain,
        true
      );
      return { mat, pts, finalSnap };
    });
  }, []);

  if (!open) return null;

  const width = 680;
  const height = 310;
  const padLeft = 58;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 46;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const xMaxPct = zoomLowStrain ? 2.5 : 52;
  const yMaxMPa = 500;

  const xToPx = (pct: number) =>
    padLeft + Math.min(1.02, Math.max(0, pct / xMaxPct)) * plotW;
  const yToPx = (mpa: number) =>
    padTop + plotH - Math.min(1.02, Math.max(0, mpa / yMaxMPa)) * plotH;

  const xTicks = Array.from({ length: 6 }, (_, i) => (xMaxPct * i) / 5);
  const yTicks = [0, 100, 200, 300, 400, 500];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Comparación de diagramas tensión-deformación entre materiales"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-300 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl text-sm font-bold text-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-300 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-950">
              Comparativa de Materiales Metálicos (σ – ε)
            </h2>
            <p className="text-sm font-bold text-slate-950 mt-0.5">
              Contraste directo de rigidez (E), resistencia (σ_R), ductilidad (A%) y tenacidad (U_T)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoomLowStrain((z) => !z)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                zoomLowStrain
                  ? 'bg-slate-950 text-white border-slate-950'
                  : 'bg-white text-slate-950 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {zoomLowStrain ? (
                <ZoomOut className="w-4 h-4" />
              ) : (
                <ZoomIn className="w-4 h-4" />
              )}
              {zoomLowStrain ? 'Ver escala completa' : 'Ampliar 0–2.5% (Rigidez)'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar comparativa"
              className="p-2 rounded-lg text-slate-950 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Multi-curve SVG */}
          <div className="border border-slate-300 rounded-lg p-3 bg-[#FAFBFD]">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto select-none"
              role="img"
              aria-label="Superposición de las curvas tensión-deformación de los cuatro materiales"
            >
              <defs>
                <clipPath id="compClip">
                  <rect x={padLeft} y={padTop} width={plotW} height={plotH} />
                </clipPath>
              </defs>

              <rect
                x={padLeft}
                y={padTop}
                width={plotW}
                height={plotH}
                fill="#FFFFFF"
                stroke="#94A3B8"
                strokeWidth="1.2"
              />

              {yTicks.map((val) => (
                <g key={`cy-${val}`}>
                  <line
                    x1={padLeft}
                    y1={yToPx(val)}
                    x2={padLeft + plotW}
                    y2={yToPx(val)}
                    stroke="#CBD5E1"
                    strokeWidth="0.8"
                  />
                  <text
                    x={padLeft - 8}
                    y={yToPx(val) + 4}
                    textAnchor="end"
                    fill="#020617"
                    fontSize="12"
                    fontWeight="700"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {val}
                  </text>
                </g>
              ))}

              {xTicks.map((val, idx) => (
                <g key={`cx-${idx}`}>
                  <line
                    x1={xToPx(val)}
                    y1={padTop}
                    x2={xToPx(val)}
                    y2={padTop + plotH}
                    stroke="#CBD5E1"
                    strokeWidth="0.8"
                  />
                  <text
                    x={xToPx(val)}
                    y={padTop + plotH + 17}
                    textAnchor="middle"
                    fill="#020617"
                    fontSize="12"
                    fontWeight="700"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {zoomLowStrain ? val.toFixed(1) : Math.round(val)}%
                  </text>
                </g>
              ))}

              <text
                x={padLeft + plotW / 2}
                y={height - 7}
                textAnchor="middle"
                fill="#020617"
                fontSize="13"
                fontWeight="700"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                Deformación unitaria ingenieril, ε (%)
              </text>
              <text
                x={16}
                y={padTop + plotH / 2}
                textAnchor="middle"
                fill="#020617"
                fontSize="13"
                fontWeight="700"
                fontFamily="Plus Jakarta Sans, sans-serif"
                transform={`rotate(-90 16 ${padTop + plotH / 2})`}
              >
                Tensión, σ (MPa)
              </text>

              <g clipPath="url(#compClip)">
                {comparisonData.map(({ mat, pts }) => {
                  const pathD = pts
                    .map(
                      (p, i) =>
                        `${i === 0 ? 'M' : 'L'} ${xToPx(p.strain * 100).toFixed(2)} ${yToPx(p.stress).toFixed(2)}`
                    )
                    .join(' ');
                  const last = pts[pts.length - 1];
                  return (
                    <g key={mat.id}>
                      <path
                        d={pathD}
                        fill="none"
                        stroke={mat.visual.curveColor}
                        strokeWidth={mat.id === selectedMaterialId ? '3.2' : '2.2'}
                        opacity={mat.id === selectedMaterialId ? 1 : 0.88}
                      />
                      {last.strain * 100 <= xMaxPct && (
                        <circle
                          cx={xToPx(last.strain * 100)}
                          cy={yToPx(last.stress)}
                          r="3.8"
                          fill={mat.visual.curveColor}
                          stroke="#FFFFFF"
                          strokeWidth="1.2"
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Comparative Data Table */}
          <div className="overflow-x-auto border border-slate-300 rounded-lg">
            <table className="w-full text-left border-collapse text-sm font-bold text-slate-950">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-950">
                  <th className="py-2.5 px-3 font-bold">Material</th>
                  <th className="py-2.5 px-3 font-bold text-right">E (GPa)</th>
                  <th className="py-2.5 px-3 font-bold text-right">σ_y (MPa)</th>
                  <th className="py-2.5 px-3 font-bold text-right">σ_R (MPa)</th>
                  <th className="py-2.5 px-3 font-bold text-right">A%</th>
                  <th className="py-2.5 px-3 font-bold text-right">Z%</th>
                  <th className="py-2.5 px-3 font-bold text-right">U_T (MJ/m³)</th>
                  <th className="py-2.5 px-3 font-bold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {comparisonData.map(({ mat, finalSnap }) => {
                  const isCurrent = mat.id === selectedMaterialId;
                  return (
                    <tr
                      key={mat.id}
                      className={isCurrent ? 'bg-blue-50/70' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-xs shrink-0"
                            style={{ backgroundColor: mat.visual.curveColor }}
                          />
                          <div>
                            <div className="text-sm font-bold text-slate-950">
                              {mat.name}
                            </div>
                            <div className="text-sm font-bold text-slate-950">
                              {mat.category} · {mat.standard}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-950">
                        {mat.youngModulusGPa.toFixed(0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-950">
                        {mat.yieldStrengthMPa.toFixed(0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-950">
                        {mat.utsMPa.toFixed(0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-950">
                        {finalSnap.elongationAPct.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-950">
                        {finalSnap.reductionZPct.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-blue-950">
                        {finalSnap.toughnessMJm3.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectAndClose(mat.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-sm font-bold text-blue-950 hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {isCurrent ? 'Activo' : 'Ensayar'}
                          {!isCurrent && <ArrowRight className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
