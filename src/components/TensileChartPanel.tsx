import React, { useMemo, useRef, useState } from 'react';
import {
  Layers,
  TrendingDown,
  ZoomIn,
  ZoomOut,
  Pin,
  PinOff,
} from 'lucide-react';
import {
  CurvePoint,
  SimulationSnapshot,
  evaluateMonotonicStress,
  getYieldStrain,
  sampleMonotonicCurve,
} from '../physics/tensileEngine';
import { MaterialId } from '../physics/materials';
import { InfoTooltip } from './InfoTooltip';

export type ChartMode = 'stress-strain' | 'force-elongation';

export interface PinnedReferenceCurve {
  materialId: MaterialId;
  materialName: string;
  d0: number;
  l0: number;
  s0: number;
  points: CurvePoint[];
}

interface TensileChartPanelProps {
  snapshot: SimulationSnapshot;
  chartMode: ChartMode;
  onChangeChartMode: (mode: ChartMode) => void;
  showToughnessArea: boolean;
  onToggleToughnessArea: () => void;
  showUnloadingGuide: boolean;
  onToggleUnloadingGuide: () => void;
  pinnedReference: PinnedReferenceCurve | null;
  onPinReference: () => void;
  onClearReference: () => void;
}

function niceAxisMax(rawMax: number): number {
  if (rawMax <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normalized = rawMax / magnitude;
  let nice = 1;
  if (normalized <= 1.2) nice = 1.2;
  else if (normalized <= 1.5) nice = 1.5;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 2.5) nice = 2.5;
  else if (normalized <= 3) nice = 3;
  else if (normalized <= 4) nice = 4;
  else if (normalized <= 5) nice = 5;
  else if (normalized <= 6) nice = 6;
  else if (normalized <= 8) nice = 8;
  else nice = 10;
  return nice * magnitude;
}

export const TensileChartPanel: React.FC<TensileChartPanelProps> = ({
  snapshot,
  chartMode,
  onChangeChartMode,
  showToughnessArea,
  onToggleToughnessArea,
  showUnloadingGuide,
  onToggleUnloadingGuide,
  pinnedReference,
  onPinReference,
  onClearReference,
}) => {
  const [zoomElastic, setZoomElastic] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{
    xPx: number;
    yPx: number;
    xVal: number;
    yVal: number;
    strain: number;
    stress: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const { material, geometry, s0 } = snapshot;

  // Chart SVG dimensions
  const width = 620;
  const height = 430;
  const padLeft = 64;
  const padRight = 28;
  const padTop = 32;
  const padBottom = 52;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const epsY = getYieldStrain(material);
  const epsU = material.utsStrain;
  const epsF = material.fractureStrain;

  // Active monotonic traced curve up to maxStrainReached
  const activePoints = useMemo(
    () => sampleMonotonicCurve(material, geometry, snapshot.maxStrainReached),
    [material, geometry, snapshot.maxStrainReached]
  );

  // Determine clean axis bounds (accounting for pinned reference curve if present)
  const { xMax, yMax } = useMemo(() => {
    const isStress = chartMode === 'stress-strain';

    if (zoomElastic) {
      const targetStrainMax = Math.min(epsF * 1.15, Math.max(epsY * 3.5, 0.004));
      const refStressAtZoom = Math.max(
        material.yieldStrengthMPa * 1.35,
        evaluateMonotonicStress(material, Math.min(targetStrainMax, epsF)) * 1.15
      );
      if (isStress) {
        return {
          xMax: niceAxisMax(targetStrainMax * 100), // in %
          yMax: niceAxisMax(refStressAtZoom),
        };
      }
      return {
        xMax: niceAxisMax(targetStrainMax * geometry.l0), // in mm
        yMax: niceAxisMax((refStressAtZoom * s0) / 1000), // in kN
      };
    }

    let rawXMax = isStress ? epsF * 100 * 1.08 : epsF * geometry.l0 * 1.08;
    let rawYMax = isStress
      ? material.utsMPa * 1.16
      : ((material.utsMPa * s0) / 1000) * 1.16;

    if (pinnedReference && pinnedReference.points.length > 0) {
      const refLastX = isStress
        ? pinnedReference.points[pinnedReference.points.length - 1].strain * 100
        : pinnedReference.points[pinnedReference.points.length - 1].deltaL;
      const refPeakY = pinnedReference.points.reduce(
        (acc, p) => Math.max(acc, isStress ? p.stress : p.forceKN),
        0
      );
      rawXMax = Math.max(rawXMax, refLastX * 1.08);
      rawYMax = Math.max(rawYMax, refPeakY * 1.16);
    }

    return {
      xMax: niceAxisMax(rawXMax),
      yMax: niceAxisMax(rawYMax),
    };
  }, [chartMode, zoomElastic, epsF, epsY, material, geometry.l0, s0, pinnedReference]);

  // Coordinate converters
  const xToPx = (val: number) =>
    padLeft + Math.min(1.02, Math.max(0, val / xMax)) * plotW;
  const yToPx = (val: number) =>
    padTop + plotH - Math.min(1.02, Math.max(0, val / yMax)) * plotH;

  const getPointX = (pt: { strain: number; deltaL: number }) =>
    chartMode === 'stress-strain' ? pt.strain * 100 : pt.deltaL;
  const getPointY = (pt: { stress: number; forceKN: number }) =>
    chartMode === 'stress-strain' ? pt.stress : pt.forceKN;

  // Build SVG path for active monotonic curve
  const activePathD = useMemo(() => {
    if (activePoints.length < 2) return '';
    return activePoints
      .map((pt, i) => {
        const x = xToPx(getPointX(pt));
        const y = yToPx(getPointY(pt));
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [activePoints, chartMode, xMax, yMax]);

  // Shaded Toughness Area path under active monotonic curve
  const toughnessAreaD = useMemo(() => {
    if (!showToughnessArea || activePoints.length < 2) return '';
    const lastPt = activePoints[activePoints.length - 1];
    const baseY = yToPx(0);
    const startX = xToPx(0);
    const endX = xToPx(getPointX(lastPt));
    return `${activePathD} L ${endX.toFixed(2)} ${baseY.toFixed(2)} L ${startX.toFixed(2)} ${baseY.toFixed(2)} Z`;
  }, [showToughnessArea, activePoints, activePathD, chartMode, xMax, yMax]);

  // Pinned reference curve path
  const pinnedPathD = useMemo(() => {
    if (!pinnedReference || pinnedReference.points.length < 2) return '';
    return pinnedReference.points
      .map((pt, i) => {
        const x = xToPx(getPointX(pt));
        const y = yToPx(getPointY(pt));
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [pinnedReference, chartMode, xMax, yMax]);

  // Current operating point coordinates
  const currentXVal =
    chartMode === 'stress-strain' ? snapshot.strain * 100 : snapshot.deltaL;
  const currentYVal =
    chartMode === 'stress-strain' ? snapshot.stress : snapshot.forceKN;
  const currentXPx = xToPx(currentXVal);
  const currentYPx = yToPx(currentYVal);

  // Peak/Max reached point coordinates (anchor of the elastic unloading line)
  const peakXVal =
    chartMode === 'stress-strain'
      ? snapshot.maxStrainReached * 100
      : snapshot.maxStrainReached * geometry.l0;
  const peakYVal =
    chartMode === 'stress-strain'
      ? snapshot.maxReachedStress
      : (snapshot.maxReachedStress * s0) / 1000;
  const residualXVal =
    chartMode === 'stress-strain'
      ? snapshot.residualStrain * 100
      : snapshot.residualStrain * geometry.l0;

  // Milestone coordinates
  const yieldXVal = chartMode === 'stress-strain' ? epsY * 100 : epsY * geometry.l0;
  const yieldYVal =
    chartMode === 'stress-strain'
      ? material.yieldStrengthMPa
      : (material.yieldStrengthMPa * s0) / 1000;

  const utsXVal = chartMode === 'stress-strain' ? epsU * 100 : epsU * geometry.l0;
  const utsYVal =
    chartMode === 'stress-strain'
      ? material.utsMPa
      : (material.utsMPa * s0) / 1000;

  const fracXVal = chartMode === 'stress-strain' ? epsF * 100 : epsF * geometry.l0;
  const fracYVal =
    chartMode === 'stress-strain'
      ? material.fractureStressMPa
      : (material.fractureStressMPa * s0) / 1000;

  // Axis ticks (5 intervals)
  const xTicks = Array.from({ length: 6 }, (_, i) => (xMax * i) / 5);
  const yTicks = Array.from({ length: 6 }, (_, i) => (yMax * i) / 5);

  // Interactive hover crosshair snapped to plotted curve
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || activePoints.length < 2) {
      setHoverInfo(null);
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    if (
      mx < padLeft ||
      mx > width - padRight ||
      my < padTop ||
      my > height - padBottom
    ) {
      setHoverInfo(null);
      return;
    }

    const mouseXVal = ((mx - padLeft) / plotW) * xMax;
    // Find nearest point on activePoints
    let nearest = activePoints[0];
    let minDist = Infinity;
    for (const pt of activePoints) {
      const pxVal = getPointX(pt);
      const dist = Math.abs(pxVal - mouseXVal);
      if (dist < minDist) {
        minDist = dist;
        nearest = pt;
      }
    }

    const nxVal = getPointX(nearest);
    const nyVal = getPointY(nearest);
    if (nxVal > xMax * 1.01) {
      setHoverInfo(null);
      return;
    }

    setHoverInfo({
      xPx: xToPx(nxVal),
      yPx: yToPx(nyVal),
      xVal: nxVal,
      yVal: nyVal,
      strain: nearest.strain,
      stress: nearest.stress,
    });
  };

  const formatTick = (val: number, maxVal: number) => {
    if (maxVal < 1) return val.toFixed(2);
    if (maxVal < 10) return val.toFixed(1);
    return Math.round(val).toString();
  };

  return (
    <section
      aria-label="Gráfica interactiva del ensayo de tracción"
      className="bg-white border border-slate-300 rounded-xl flex flex-col overflow-hidden text-sm font-bold text-slate-950"
    >
      {/* Top Bar: Chart Mode Switch & Analytical Tools */}
      <div className="px-4 py-3 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2.5">
        {/* Mode Segmented Control */}
        <div
          role="tablist"
          aria-label="Tipo de diagrama"
          className="inline-flex items-center p-1 bg-slate-200 rounded-lg border border-slate-300"
        >
          <button
            type="button"
            role="tab"
            aria-selected={chartMode === 'stress-strain'}
            onClick={() => onChangeChartMode('stress-strain')}
            className={`px-3 py-1.5 text-sm font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              chartMode === 'stress-strain'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-900 hover:text-slate-950'
            }`}
          >
            Tensión – Deformación (σ – ε)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={chartMode === 'force-elongation'}
            onClick={() => onChangeChartMode('force-elongation')}
            className={`px-3 py-1.5 text-sm font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              chartMode === 'force-elongation'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-900 hover:text-slate-950'
            }`}
          >
            Fuerza – Alargamiento (F – ΔL)
          </button>
        </div>

        {/* Chart Analysis Toggles */}
        <div className="flex items-center flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onToggleToughnessArea}
            aria-pressed={showToughnessArea}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-bold border transition-colors whitespace-nowrap cursor-pointer ${
              showToughnessArea
                ? 'bg-blue-100 border-blue-400 text-blue-950'
                : 'bg-white border-slate-300 text-slate-950 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            Tenacidad (Área)
          </button>

          <button
            type="button"
            onClick={onToggleUnloadingGuide}
            aria-pressed={showUnloadingGuide}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-bold border transition-colors whitespace-nowrap cursor-pointer ${
              showUnloadingGuide
                ? 'bg-emerald-100 border-emerald-400 text-emerald-950'
                : 'bg-white border-slate-300 text-slate-950 hover:bg-slate-100'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Recta descarga (E)
          </button>

          <button
            type="button"
            onClick={() => setZoomElastic((z) => !z)}
            aria-pressed={zoomElastic}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-bold border transition-colors whitespace-nowrap cursor-pointer ${
              zoomElastic
                ? 'bg-slate-950 border-slate-950 text-white'
                : 'bg-white border-slate-300 text-slate-950 hover:bg-slate-100'
            }`}
          >
            {zoomElastic ? (
              <ZoomOut className="w-4 h-4" />
            ) : (
              <ZoomIn className="w-4 h-4" />
            )}
            Zoom elástico
          </button>

          {pinnedReference ? (
            <button
              type="button"
              onClick={onClearReference}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-bold border border-amber-400 bg-amber-100 text-amber-950 hover:bg-amber-200 transition-colors whitespace-nowrap cursor-pointer"
              title="Quitar curva de referencia fijada"
            >
              <PinOff className="w-4 h-4" />
              Quitar ref.
            </button>
          ) : (
            <button
              type="button"
              onClick={onPinReference}
              disabled={snapshot.maxStrainReached < 0.0002}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-bold border border-slate-300 bg-white text-slate-950 hover:bg-slate-100 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
              title="Fija la curva actual para compararla tras cambiar D₀ o L₀"
            >
              <Pin className="w-4 h-4" />
              Fijar ref.
            </button>
          )}
        </div>
      </div>

      {/* Pedagogical Context Sub-bar */}
      <div className="px-4 py-2 bg-slate-100 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-slate-950">
        <div className="flex items-center gap-2">
          {chartMode === 'stress-strain' ? (
            <>
              <span>
                Propiedad intrínseca del material: independiente de D₀ y L₀
              </span>
              <InfoTooltip glossaryKey="stress" align="left" />
            </>
          ) : (
            <>
              <span>
                Respuesta de esta probeta: S₀ ={' '}
                <strong className="font-mono text-slate-950">
                  {s0.toFixed(1)} mm²
                </strong>{' '}
                y L₀ ={' '}
                <strong className="font-mono text-slate-950">
                  {geometry.l0.toFixed(0)} mm
                </strong>
              </span>
              <InfoTooltip glossaryKey="force" align="left" />
            </>
          )}
        </div>

        {pinnedReference && (
          <div className="font-mono text-sm font-bold text-amber-950">
            Ref.: {pinnedReference.materialName} (D₀=
            {pinnedReference.d0.toFixed(1)} mm, L₀={pinnedReference.l0.toFixed(0)}{' '}
            mm)
          </div>
        )}
      </div>

      {/* Interactive SVG Plot */}
      <div className="relative flex-1 flex flex-col justify-center p-3 sm:p-4 bg-white">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto cursor-crosshair select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
          role="img"
          aria-label={
            chartMode === 'stress-strain'
              ? 'Diagrama tensión en MPa frente a deformación porcentual'
              : 'Diagrama fuerza en kN frente a alargamiento en milímetros'
          }
        >
          <defs>
            <clipPath id="plotClip">
              <rect x={padLeft} y={padTop} width={plotW} height={plotH} />
            </clipPath>
            <pattern
              id="toughnessHatch"
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="7"
                stroke={material.visual.curveColor}
                strokeWidth="1.2"
                strokeOpacity="0.22"
              />
            </pattern>
          </defs>

          {/* Plot Background */}
          <rect
            x={padLeft}
            y={padTop}
            width={plotW}
            height={plotH}
            fill="#FAFBFD"
            stroke="#CBD5E1"
            strokeWidth="1"
          />

          {/* Horizontal Gridlines & Y Ticks */}
          {yTicks.map((val, i) => {
            const y = yToPx(val);
            return (
              <g key={`y-${i}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke={i === 0 ? '#94A3B8' : '#E2E8F0'}
                  strokeWidth={i === 0 ? '1' : '0.8'}
                />
                <text
                  x={padLeft - 9}
                  y={y + 4}
                  textAnchor="end"
                  fill="#020617"
                  fontSize="11.5"
                  fontWeight="700"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {formatTick(val, yMax)}
                </text>
              </g>
            );
          })}

          {/* Vertical Gridlines & X Ticks */}
          {xTicks.map((val, i) => {
            const x = xToPx(val);
            return (
              <g key={`x-${i}`}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke={i === 0 ? '#64748B' : '#CBD5E1'}
                  strokeWidth={i === 0 ? '1.2' : '0.8'}
                />
                <text
                  x={x}
                  y={padTop + plotH + 18}
                  textAnchor="middle"
                  fill="#020617"
                  fontSize="11.5"
                  fontWeight="700"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {formatTick(val, xMax)}
                </text>
              </g>
            );
          })}

          {/* Axis Titles */}
          <text
            x={padLeft + plotW / 2}
            y={height - 10}
            textAnchor="middle"
            fill="#020617"
            fontSize="13"
            fontWeight="700"
            fontFamily="Plus Jakarta Sans, sans-serif"
          >
            {chartMode === 'stress-strain'
              ? 'Deformación unitaria ingenieril, ε (%)'
              : 'Alargamiento absoluto, ΔL (mm)'}
          </text>

          <text
            x={18}
            y={padTop + plotH / 2}
            textAnchor="middle"
            fill="#020617"
            fontSize="13"
            fontWeight="700"
            fontFamily="Plus Jakarta Sans, sans-serif"
            transform={`rotate(-90 18 ${padTop + plotH / 2})`}
          >
            {chartMode === 'stress-strain'
              ? 'Tensión nominal, σ (MPa)'
              : 'Fuerza axial, F (kN)'}
          </text>

          {/* === CLIPPED DATA LAYERS === */}
          <g clipPath="url(#plotClip)">
            {/* Subtle Elastic Zone Tint */}
            <rect
              x={padLeft}
              y={padTop}
              width={Math.max(0, xToPx(yieldXVal) - padLeft)}
              height={plotH}
              fill="#ECFDF5"
              opacity="0.55"
            />

            {/* Pinned Reference Curve (for proving sigma-epsilon invariance vs F-DeltaL change) */}
            {pinnedPathD && (
              <path
                d={pinnedPathD}
                fill="none"
                stroke="#D97706"
                strokeWidth="2"
                strokeDasharray="6 4"
                opacity="0.85"
              />
            )}

            {/* Shaded Toughness Area under active curve */}
            {toughnessAreaD && (
              <>
                <path
                  d={toughnessAreaD}
                  fill={material.visual.curveColor}
                  fillOpacity="0.11"
                />
                <path d={toughnessAreaD} fill="url(#toughnessHatch)" />
              </>
            )}

            {/* Primary Monotonic Curve */}
            {activePathD && (
              <path
                d={activePathD}
                fill="none"
                stroke={material.visual.curveColor}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Fracture Vertical Drop Line when fractured */}
            {snapshot.isFractured && (
              <line
                x1={xToPx(fracXVal)}
                y1={yToPx(fracYVal)}
                x2={xToPx(fracXVal)}
                y2={yToPx(0)}
                stroke="#DC2626"
                strokeWidth="1.6"
                strokeDasharray="3 3"
              />
            )}

            {/* Parallel Elastic Unloading Guide Line (slope E) */}
            {(showUnloadingGuide || snapshot.isUnloadedOrUnloading) &&
              snapshot.maxStrainReached > 0.0001 && (
                <g>
                  {/* Full theoretical parallel slope-E line from maxReached to residual on X-axis */}
                  <line
                    x1={xToPx(peakXVal)}
                    y1={yToPx(peakYVal)}
                    x2={xToPx(residualXVal)}
                    y2={yToPx(0)}
                    stroke="#059669"
                    strokeWidth={snapshot.isUnloadedOrUnloading ? '2.2' : '1.6'}
                    strokeDasharray={snapshot.isUnloadedOrUnloading ? 'none' : '5 3'}
                  />

                  {/* Highlight active segment when currently unloading/unloaded */}
                  {snapshot.isUnloadedOrUnloading && (
                    <line
                      x1={xToPx(peakXVal)}
                      y1={yToPx(peakYVal)}
                      x2={currentXPx}
                      y2={currentYPx}
                      stroke="#059669"
                      strokeWidth="2.6"
                    />
                  )}

                  {/* Residual Plastic Strain Marker on X-axis */}
                  {snapshot.residualStrain > 1e-5 && (
                    <g>
                      <circle
                        cx={xToPx(residualXVal)}
                        cy={yToPx(0)}
                        r="4"
                        fill="#059669"
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                      />
                      {/* Horizontal bracket showing permanent residual deformation */}
                      <line
                        x1={padLeft}
                        y1={yToPx(0) - 5}
                        x2={xToPx(residualXVal)}
                        y2={yToPx(0) - 5}
                        stroke="#059669"
                        strokeWidth="2"
                      />
                      <text
                        x={Math.min(
                          padLeft + plotW - 50,
                          Math.max(padLeft + 38, xToPx(residualXVal))
                        )}
                        y={yToPx(0) - 11}
                        textAnchor="middle"
                        fill="#047857"
                        fontSize="9.5"
                        fontWeight="600"
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        {chartMode === 'stress-strain'
                          ? `ε_pl = ${(snapshot.residualStrain * 100).toFixed(2)}%`
                          : `ΔL_pl = ${(snapshot.residualStrain * geometry.l0).toFixed(2)} mm`}
                      </text>
                    </g>
                  )}
                </g>
              )}

            {/* Automatic Milestone Markers: Yield (LE), UTS (sigma_R), Fracture */}
            {snapshot.discoveredYield && yieldXVal <= xMax && (
              <g>
                <circle
                  cx={xToPx(yieldXVal)}
                  cy={yToPx(yieldYVal)}
                  r="4.2"
                  fill="#059669"
                  stroke="#FFFFFF"
                  strokeWidth="1.6"
                />
                <rect
                  x={Math.min(padLeft + plotW - 96, xToPx(yieldXVal) + 8)}
                  y={Math.max(padTop + 6, yToPx(yieldYVal) - 24)}
                  width="88"
                  height="20"
                  rx="3"
                  fill="#FFFFFF"
                  stroke="#A7F3D0"
                  strokeWidth="1"
                />
                <text
                  x={Math.min(padLeft + plotW - 52, xToPx(yieldXVal) + 52)}
                  y={Math.max(padTop + 19, yToPx(yieldYVal) - 11)}
                  textAnchor="middle"
                  fill="#065F46"
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  LE: {yieldYVal.toFixed(0)} {chartMode === 'stress-strain' ? 'MPa' : 'kN'}
                </text>
              </g>
            )}

            {snapshot.discoveredUTS && utsXVal <= xMax && (
              <g>
                <circle
                  cx={xToPx(utsXVal)}
                  cy={yToPx(utsYVal)}
                  r="4.5"
                  fill="#D97706"
                  stroke="#FFFFFF"
                  strokeWidth="1.6"
                />
                <rect
                  x={Math.min(
                    padLeft + plotW - 102,
                    Math.max(padLeft + 4, xToPx(utsXVal) - 51)
                  )}
                  y={Math.max(padTop + 4, yToPx(utsYVal) - 28)}
                  width="102"
                  height="20"
                  rx="3"
                  fill="#FFFFFF"
                  stroke="#FDE68A"
                  strokeWidth="1"
                />
                <text
                  x={Math.min(
                    padLeft + plotW - 51,
                    Math.max(padLeft + 55, xToPx(utsXVal))
                  )}
                  y={Math.max(padTop + 17, yToPx(utsYVal) - 15)}
                  textAnchor="middle"
                  fill="#92400E"
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {chartMode === 'stress-strain'
                    ? `σ_R: ${utsYVal.toFixed(0)} MPa`
                    : `F_máx: ${utsYVal.toFixed(1)} kN`}
                </text>
              </g>
            )}

            {snapshot.discoveredFracture && fracXVal <= xMax && (
              <g>
                {/* X marker for fracture */}
                <path
                  d={`M ${xToPx(fracXVal) - 4.5} ${yToPx(fracYVal) - 4.5} L ${xToPx(fracXVal) + 4.5} ${yToPx(fracYVal) + 4.5} M ${xToPx(fracXVal) + 4.5} ${yToPx(fracYVal) - 4.5} L ${xToPx(fracXVal) - 4.5} ${yToPx(fracYVal) + 4.5}`}
                  stroke="#DC2626"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <rect
                  x={Math.max(padLeft + 4, xToPx(fracXVal) - 66)}
                  y={Math.min(padTop + plotH - 28, yToPx(fracYVal) + 8)}
                  width="62"
                  height="19"
                  rx="3"
                  fill="#FEF2F2"
                  stroke="#FECACA"
                  strokeWidth="1"
                />
                <text
                  x={Math.max(padLeft + 35, xToPx(fracXVal) - 35)}
                  y={Math.min(padTop + plotH - 15, yToPx(fracYVal) + 21)}
                  textAnchor="middle"
                  fill="#991B1B"
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  Rotura
                </text>
              </g>
            )}

            {/* Live Moving Operating Point + Drop Hairlines */}
            {!snapshot.isFractured && currentXVal <= xMax && (
              <g>
                <line
                  x1={currentXPx}
                  y1={currentYPx}
                  x2={currentXPx}
                  y2={padTop + plotH}
                  stroke="#64748B"
                  strokeWidth="0.9"
                  strokeDasharray="3 3"
                />
                <line
                  x1={padLeft}
                  y1={currentYPx}
                  x2={currentXPx}
                  y2={currentYPx}
                  stroke="#64748B"
                  strokeWidth="0.9"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={currentXPx}
                  cy={currentYPx}
                  r="8"
                  fill={
                    snapshot.isUnloadedOrUnloading
                      ? '#059669'
                      : material.visual.curveColor
                  }
                  fillOpacity="0.18"
                />
                <circle
                  cx={currentXPx}
                  cy={currentYPx}
                  r="4.8"
                  fill={
                    snapshot.isUnloadedOrUnloading
                      ? '#059669'
                      : material.visual.curveColor
                  }
                  stroke="#FFFFFF"
                  strokeWidth="1.8"
                />
              </g>
            )}

            {/* Hover Crosshair Probe */}
            {hoverInfo && (
              <g>
                <line
                  x1={hoverInfo.xPx}
                  y1={padTop}
                  x2={hoverInfo.xPx}
                  y2={padTop + plotH}
                  stroke="#0F172A"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                  opacity="0.45"
                />
                <line
                  x1={padLeft}
                  y1={hoverInfo.yPx}
                  x2={padLeft + plotW}
                  y2={hoverInfo.yPx}
                  stroke="#0F172A"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                  opacity="0.45"
                />
                <circle
                  cx={hoverInfo.xPx}
                  cy={hoverInfo.yPx}
                  r="4"
                  fill="#0F172A"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              </g>
            )}
          </g>

          {/* Floating In-Plot Legend / Toughness Energy Callout */}
          {showToughnessArea && snapshot.maxStrainReached > 0.0001 && (
            <g>
              <rect
                x={padLeft + 10}
                y={padTop + 10}
                width="178"
                height="36"
                rx="4"
                fill="#FFFFFF"
                fillOpacity="0.94"
                stroke="#BFDBFE"
                strokeWidth="1"
              />
              <text
                x={padLeft + 18}
                y={padTop + 23}
                fill="#1E40AF"
                fontSize="8.5"
                fontWeight="600"
                fontFamily="IBM Plex Mono, monospace"
              >
                {chartMode === 'stress-strain'
                  ? 'ÁREA = TENACIDAD (U_T)'
                  : 'ÁREA = TRABAJO ABSORBIDO'}
              </text>
              <text
                x={padLeft + 18}
                y={padTop + 38}
                fill="#0F172A"
                fontSize="11.5"
                fontWeight="600"
                fontFamily="IBM Plex Mono, monospace"
              >
                {chartMode === 'stress-strain'
                  ? `${snapshot.toughnessMJm3.toFixed(2)} MJ/m³`
                  : `${snapshot.workJoules.toFixed(1)} J`}
              </text>
            </g>
          )}

          {/* Hover Coordinate HUD */}
          {hoverInfo && (
            <g>
              <rect
                x={padLeft + plotW - 166}
                y={padTop + 10}
                width="156"
                height="36"
                rx="4"
                fill="#0F172A"
                fillOpacity="0.92"
              />
              <text
                x={padLeft + plotW - 158}
                y={padTop + 24}
                fill="#94A3B8"
                fontSize="8.5"
                fontFamily="IBM Plex Mono, monospace"
              >
                INSPECCIÓN EN CURVA
              </text>
              <text
                x={padLeft + plotW - 158}
                y={padTop + 38}
                fill="#F8FAFC"
                fontSize="10"
                fontWeight="600"
                fontFamily="IBM Plex Mono, monospace"
              >
                {chartMode === 'stress-strain'
                  ? `ε=${hoverInfo.xVal.toFixed(2)}% · σ=${hoverInfo.yVal.toFixed(1)} MPa`
                  : `ΔL=${hoverInfo.xVal.toFixed(2)}mm · F=${hoverInfo.yVal.toFixed(2)} kN`}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Bottom Legend Strip */}
      <div className="px-4 py-2.5 bg-slate-100 border-t border-slate-300 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-slate-950">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-4 h-1 inline-block rounded"
              style={{ backgroundColor: material.visual.curveColor }}
            />
            Curva carga ({material.shortName})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-1 inline-block bg-emerald-700" />
            Descarga paralela (E = {material.youngModulusGPa} GPa)
          </span>
          {pinnedReference && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-0.5 inline-block border-t-2 border-dashed border-amber-700" />
              Referencia fijada
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-slate-950">
          <span>{zoomElastic ? 'Escala ampliada (elástica)' : 'Escala completa'}</span>
          <InfoTooltip glossaryKey="unloading" align="right" />
        </div>
      </div>
    </section>
  );
};
