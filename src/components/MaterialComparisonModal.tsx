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
        className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Comparativa de Materiales Metálicos (σ – ε)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Contraste directo de rigidez (E), resistencia (σ_R), ductilidad (A%) y tenacidad (U_T)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoomLowStrain((z) => !z)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                zoomLowStrain
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {zoomLowStrain ? (
                <ZoomOut className="w-3.5 h-3.5" />
              ) : (
                <ZoomIn className="w-3.5 h-3.5" />
              )}
              {zoomLowStrain ? 'Ver escala completa' : 'Ampliar 0–2.5% (Rigidez)'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar comparativa"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Multi-curve SVG */}
          <div className="border border-slate-200 rounded-lg p-3 bg-[#FAFBFD]">
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
                stroke="#CBD5E1"
                strokeWidth="1"
              />

              {yTicks.map((val) => (
                <g key={`cy-${val}`}>
                  <line
                    x1={padLeft}
                    y1={yToPx(val)}
                    x2={padLeft + plotW}
                    y2={yToPx(val)}
                    stroke="#E2E8F0"
                    strokeWidth="0.8"
                  />
                  <text
                    x={padLeft - 8}
                    y={yToPx(val) + 3.5}
                    textAnchor="end"
                    fill="#475569"
                    fontSize="10"
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
                    stroke="#E2E8F0"
                    strokeWidth="0.8"
                  />
                  <text
                    x={xToPx(val)}
                    y={padTop + plotH + 16}
                    textAnchor="middle"
                    fill="#475569"
                    fontSize="10"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {zoomLowStrain ? val.toFixed(1) : Math.round(val)}%
                  </text>
                </g>
              ))}

              <text
                x={padLeft + plotW / 2}
                y={height - 8}
                textAnchor="middle"
                fill="#0F172A"
                fontSize="11.5"
                fontWeight="600"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                Deformación unitaria ingenieril, ε (%)
              </text>
              <text
                x={16}
                y={padTop + plotH / 2}
                textAnchor="middle"
                fill="#0F172A"
                fontSize="11.5"
                fontWeight="600"
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
                        strokeWidth={mat.id === selectedMaterialId ? '3' : '2'}
                        opacity={mat.id === selectedMaterialId ? 1 : 0.82}
                      />
                      {last.strain * 100 <= xMaxPct && (
                        <circle
                          cx={xToPx(last.strain * 100)}
                          cy={yToPx(last.stress)}
                          r="3.5"
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
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 font-semibold">Material</th>
                  <th className="py-2.5 px-3 font-semibold text-right">E (GPa)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">σ_y (MPa)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">σ_R (MPa)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">A%</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Z%</th>
                  <th className="py-2.5 px-3 font-semibold text-right">U_T (MJ/m³)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisonData.map(({ mat, finalSnap }) => {
                  const isCurrent = mat.id === selectedMaterialId;
                  return (
                    <tr
                      key={mat.id}
                      className={isCurrent ? 'bg-blue-50/40' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: mat.visual.curveColor }}
                          />
                          <div>
                            <div className="font-semibold text-slate-900">
                              {mat.name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {mat.category} · {mat.standard}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {mat.youngModulusGPa.toFixed(0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {mat.yieldStrengthMPa.toFixed(0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {mat.utsMPa.toFixed(0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {finalSnap.elongationAPct.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {finalSnap.reductionZPct.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-blue-800">
                        {finalSnap.toughnessMJm3.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectAndClose(mat.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {isCurrent ? 'Activo' : 'Ensayar'}
                          {!isCurrent && <ArrowRight className="w-3 h-3" />}
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
