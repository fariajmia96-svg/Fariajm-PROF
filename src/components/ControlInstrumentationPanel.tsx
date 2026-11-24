import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ArrowDownToLine,
  Download,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Activity,
  OctagonX,
} from 'lucide-react';
import { MATERIAL_LIST, MaterialId } from '../physics/materials';
import {
  SimulationSnapshot,
  SpecimenGeometry,
  getProgressBreakpoints,
} from '../physics/tensileEngine';
import { InfoTooltip } from './InfoTooltip';

interface ControlInstrumentationPanelProps {
  snapshot: SimulationSnapshot;
  selectedMaterialId: MaterialId;
  onSelectMaterial: (id: MaterialId) => void;
  geometry: SpecimenGeometry;
  onChangeGeometry: (geom: SpecimenGeometry) => void;
  sliderProgress: number;
  onSliderChange: (progress: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed: number;
  onChangeSpeed: (speed: number) => void;
  onUnload: () => void;
  onReset: () => void;
  onExportCsv: () => void;
  isUnloadingAnim: boolean;
}

export const ControlInstrumentationPanel: React.FC<
  ControlInstrumentationPanelProps
> = ({
  snapshot,
  selectedMaterialId,
  onSelectMaterial,
  geometry,
  onChangeGeometry,
  sliderProgress,
  onSliderChange,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onChangeSpeed,
  onUnload,
  onReset,
  onExportCsv,
  isUnloadingAnim,
}) => {
  const { material, isFractured } = snapshot;
  const isGeometryLocked = snapshot.maxStrainReached > 1e-6 || isFractured;
  const { pYield, pUTS } = getProgressBreakpoints(material);

  const canUnload = !isFractured && snapshot.stress > 0.5 && !isUnloadingAnim;

  const getPhaseIndicator = () => {
    switch (snapshot.phase) {
      case 'elastic':
        return {
          icon: <Activity className="w-4 h-4 text-emerald-900 shrink-0" />,
          textClass: 'text-emerald-950',
          bgClass: 'bg-emerald-100/80 border-emerald-400',
        };
      case 'plastic_uniform':
        return {
          icon: <Activity className="w-4 h-4 text-blue-900 shrink-0" />,
          textClass: 'text-blue-950',
          bgClass: 'bg-blue-100/80 border-blue-400',
        };
      case 'necking':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-900 shrink-0" />,
          textClass: 'text-amber-950',
          bgClass: 'bg-amber-100/80 border-amber-400',
        };
      case 'fractured':
        return {
          icon: <OctagonX className="w-4 h-4 text-red-900 shrink-0" />,
          textClass: 'text-red-950',
          bgClass: 'bg-red-100/80 border-red-400',
        };
      case 'unloading_elastic':
      case 'unloading_plastic':
      case 'unloaded_plastic':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-teal-900 shrink-0" />,
          textClass: 'text-teal-950',
          bgClass: 'bg-teal-100/80 border-teal-400',
        };
      default:
        return {
          icon: <Activity className="w-4 h-4 text-slate-900 shrink-0" />,
          textClass: 'text-slate-950',
          bgClass: 'bg-slate-100 border-slate-300',
        };
    }
  };

  const phaseStyle = getPhaseIndicator();

  return (
    <aside
      aria-label="Controles e instrumentación digital"
      className="flex flex-col gap-4 text-sm font-bold text-slate-950"
    >
      {/* 1. LIVE DIGITAL INSTRUMENT DISPLAY */}
      <section className="bg-white border border-slate-300 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-300 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-950">
            Instrumentación Digital
          </h2>
          <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
            Cuasi-estático
          </span>
        </div>

        <div className="p-4 space-y-3">
          {/* Current Metallurgical Phase Banner */}
          <div
            className={`px-3 py-2 rounded-lg border flex items-center gap-2 ${phaseStyle.bgClass}`}
          >
            {phaseStyle.icon}
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-950 leading-tight">
                Estado del ensayo
              </div>
              <div
                className={`text-sm font-bold mt-0.5 truncate ${phaseStyle.textClass}`}
              >
                {snapshot.phaseLabel}
              </div>
            </div>
          </div>

          {/* 4-Channel Live Instrument Readouts */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Force F */}
            <div className="bg-slate-100 border border-slate-300 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-slate-950">Fuerza (F)</span>
                <InfoTooltip glossaryKey="force" align="right" />
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-mono text-sm font-bold text-slate-950 tabular-nums">
                  {snapshot.forceKN.toFixed(2)}
                </span>
                <span className="font-mono text-sm font-bold text-slate-900">kN</span>
              </div>
            </div>

            {/* Elongation Delta L */}
            <div className="bg-slate-100 border border-slate-300 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-slate-950">Alargam. (ΔL)</span>
                <InfoTooltip glossaryKey="deltaL" align="right" />
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-mono text-sm font-bold text-slate-950 tabular-nums">
                  {snapshot.deltaL.toFixed(2)}
                </span>
                <span className="font-mono text-sm font-bold text-slate-900">mm</span>
              </div>
            </div>

            {/* Stress sigma */}
            <div className="bg-slate-100 border border-slate-300 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-slate-950">Tensión (σ)</span>
                <InfoTooltip glossaryKey="stress" align="right" />
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-mono text-sm font-bold text-blue-950 tabular-nums">
                  {snapshot.stress.toFixed(1)}
                </span>
                <span className="font-mono text-sm font-bold text-slate-900">MPa</span>
              </div>
            </div>

            {/* Strain epsilon */}
            <div className="bg-slate-100 border border-slate-300 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-slate-950">Deform. (ε)</span>
                <InfoTooltip glossaryKey="strain" align="right" />
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-mono text-sm font-bold text-blue-950 tabular-nums">
                  {(snapshot.strain * 100).toFixed(2)}
                </span>
                <span className="font-mono text-sm font-bold text-slate-900">%</span>
              </div>
              <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                {snapshot.strain.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. LOAD & DISPLACEMENT CONTROL */}
      <section className="bg-white border border-slate-300 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-300 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-950">
            Control de Carga
          </h2>
          <div className="inline-flex items-center bg-slate-200 rounded-md p-0.5 border border-slate-300">
            {[0.5, 1, 2].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onChangeSpeed(spd)}
                className={`px-2 py-0.5 text-sm font-mono font-bold rounded transition-colors cursor-pointer ${
                  playbackSpeed === spd
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-900 hover:text-slate-950'
                }`}
              >
                {spd}×
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-3.5">
          {/* Manual Displacement Slider */}
          <div>
            <div className="flex items-center justify-between text-sm font-bold mb-1.5">
              <label
                htmlFor="tensile-progress-slider"
                className="text-slate-950"
              >
                Avance de la cruceta
              </label>
              <span className="font-mono text-slate-950 tabular-nums">
                {((sliderProgress / 1000) * 100).toFixed(1)}%
              </span>
            </div>

            <div className="relative pt-1 pb-5">
              <input
                id="tensile-progress-slider"
                type="range"
                min={0}
                max={1000}
                step={1}
                value={Math.round(sliderProgress)}
                disabled={isFractured}
                onChange={(e) => onSliderChange(Number(e.target.value))}
                className="lab-slider w-full"
              />
              <div className="relative w-full h-4 mt-1 text-sm font-mono font-bold text-slate-950 select-none">
                <span className="absolute left-0">0</span>
                <span
                  className="absolute -translate-x-1/2 text-emerald-900"
                  style={{ left: `${(pYield / 1000) * 100}%` }}
                >
                  LE
                </span>
                <span
                  className="absolute -translate-x-1/2 text-amber-900"
                  style={{ left: `${(pUTS / 1000) * 100}%` }}
                >
                  UTS
                </span>
                <span className="absolute right-0 text-red-900">Rot.</span>
              </div>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={isFractured}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                isPlaying
                  ? 'bg-slate-950 text-white hover:bg-slate-800'
                  : 'bg-blue-800 text-white hover:bg-blue-900'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pausar
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Automático
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onUnload}
              disabled={!canUnload}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border border-emerald-400 bg-emerald-100 text-emerald-950 hover:bg-emerald-200 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              title="Retira la fuerza hasta 0 kN siguiendo la pendiente elástica E"
            >
              <ArrowDownToLine className="w-4 h-4" />
              Descargar
            </button>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border border-slate-300 bg-white text-slate-950 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Reiniciar probeta
          </button>
        </div>
      </section>

      {/* 3. MATERIAL SELECTOR & SPECIMEN GEOMETRY */}
      <section className="bg-white border border-slate-300 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-300 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-950">
            Material y Geometría
          </h2>
          {isGeometryLocked && (
            <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-900">
              <Lock className="w-3.5 h-3.5" />
              Fijada
            </span>
          )}
        </div>

        <div className="p-4 space-y-4">
          <div
            role="radiogroup"
            aria-label="Seleccionar material de la probeta"
            className="grid grid-cols-2 gap-2"
          >
            {MATERIAL_LIST.map((mat) => {
              const active = mat.id === selectedMaterialId;
              return (
                <button
                  key={mat.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSelectMaterial(mat.id)}
                  className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'border-blue-700 bg-blue-50'
                      : 'border-slate-300 bg-white hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm border border-black/30 shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${mat.visual.baseDark}, ${mat.visual.highlight})`,
                      }}
                    />
                    <span className="text-sm font-bold text-slate-950 truncate">
                      {mat.shortName}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-1 truncate">
                    E={mat.youngModulusGPa} GPa
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-sm font-bold text-slate-950 leading-relaxed">
            {material.description}
          </p>

          {/* Editable Dimensions D0 and L0 */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div>
              <div className="flex items-center justify-between text-sm font-bold mb-1">
                <label htmlFor="diameter-slider" className="text-slate-950">
                  Diámetro inicial (D₀)
                </label>
                <span className="font-mono font-bold text-slate-950 tabular-nums">
                  {geometry.d0.toFixed(1)} mm
                </span>
              </div>
              <input
                id="diameter-slider"
                type="range"
                min={6}
                max={20}
                step={0.5}
                value={geometry.d0}
                disabled={isGeometryLocked}
                onChange={(e) =>
                  onChangeGeometry({ ...geometry, d0: Number(e.target.value) })
                }
                className="lab-slider w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-sm font-bold mb-1">
                <label htmlFor="length-slider" className="text-slate-950">
                  Longitud calibrada (L₀)
                </label>
                <span className="font-mono font-bold text-slate-950 tabular-nums">
                  {geometry.l0.toFixed(0)} mm
                </span>
              </div>
              <input
                id="length-slider"
                type="range"
                min={25}
                max={100}
                step={5}
                value={geometry.l0}
                disabled={isGeometryLocked}
                onChange={(e) =>
                  onChangeGeometry({ ...geometry, l0: Number(e.target.value) })
                }
                className="lab-slider w-full"
              />
            </div>

            <div className="flex items-center justify-between bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold">
              <div className="flex items-center gap-1.5 text-slate-950">
                <span>Sección S₀</span>
                <InfoTooltip glossaryKey="area" align="right" />
              </div>
              <span className="font-mono font-bold text-slate-950 tabular-nums">
                {snapshot.s0.toFixed(2)} mm²
              </span>
            </div>

            {isGeometryLocked && (
              <p className="text-sm font-bold text-slate-900">
                Reinicia la probeta para cambiar D₀ o L₀.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 4. CALCULATED MECHANICAL PROPERTIES TABLE */}
      <section className="bg-white border border-slate-300 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-300 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-950">
            Propiedades Calculadas
          </h2>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={snapshot.maxStrainReached < 1e-6}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-bold border border-slate-300 text-slate-950 hover:bg-slate-100 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>

        <div className="divide-y divide-slate-200 text-sm font-bold text-slate-950">
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span>Módulo Young (E)</span>
              <InfoTooltip glossaryKey="young" align="right" />
            </div>
            <span className="font-mono font-bold text-slate-950 tabular-nums">
              {snapshot.discoveredYoung
                ? `${material.youngModulusGPa.toFixed(1)} GPa`
                : '—'}
            </span>
          </div>

          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span>Límite elástico (σ_y)</span>
              <InfoTooltip glossaryKey="yield" align="right" />
            </div>
            <span className="font-mono font-bold text-slate-950 tabular-nums">
              {snapshot.discoveredYield
                ? `${material.yieldStrengthMPa.toFixed(1)} MPa`
                : '—'}
            </span>
          </div>

          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span>Resistencia (σ_R)</span>
              <InfoTooltip glossaryKey="uts" align="right" />
            </div>
            <span className="font-mono font-bold text-slate-950 tabular-nums">
              {snapshot.discoveredUTS
                ? `${material.utsMPa.toFixed(1)} MPa`
                : '—'}
            </span>
          </div>

          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span>Alargamiento (A%)</span>
              <InfoTooltip glossaryKey="elongation" align="right" />
            </div>
            <span className="font-mono font-bold text-slate-950 tabular-nums">
              {snapshot.discoveredFracture
                ? `${snapshot.elongationAPct.toFixed(2)} %`
                : '—'}
            </span>
          </div>

          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span>Estricción (Z%)</span>
              <InfoTooltip glossaryKey="reduction" align="right" />
            </div>
            <span className="font-mono font-bold text-slate-950 tabular-nums">
              {snapshot.discoveredFracture
                ? `${snapshot.reductionZPct.toFixed(2)} %`
                : '—'}
            </span>
          </div>

          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span>Tenacidad (U_T)</span>
              <InfoTooltip glossaryKey="toughness" align="right" />
            </div>
            <span className="font-mono font-bold text-blue-950 tabular-nums">
              {snapshot.maxStrainReached > 1e-5
                ? `${snapshot.toughnessMJm3.toFixed(2)} MJ/m³`
                : '—'}
            </span>
          </div>
        </div>
      </section>
    </aside>
  );
};
