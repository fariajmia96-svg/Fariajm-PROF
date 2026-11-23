/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, MessageSquare } from 'lucide-react';
import { MATERIALS, MaterialId } from './physics/materials';
import {
  SpecimenGeometry,
  buildCsvReport,
  computeSnapshot,
  evaluateMonotonicStress,
  getYieldStrain,
  progressToStrain,
  sampleMonotonicCurve,
  strainToProgress,
} from './physics/tensileEngine';
import { TestingMachinePanel } from './components/TestingMachinePanel';
import {
  ChartMode,
  PinnedReferenceCurve,
  TensileChartPanel,
} from './components/TensileChartPanel';
import { ControlInstrumentationPanel } from './components/ControlInstrumentationPanel';
import { TheoryModal } from './components/TheoryModal';
import { MaterialComparisonModal } from './components/MaterialComparisonModal';
import { GeminiChatDrawer } from './components/GeminiChatDrawer';

export default function App() {
  const [materialId, setMaterialId] = useState<MaterialId>('steel');
  const [geometry, setGeometry] = useState<SpecimenGeometry>({
    d0: 12,
    l0: 50,
  });

  // Core simulation state (displacement/strain controlled with full unloading hysteresis)
  const [currentStrain, setCurrentStrain] = useState(0);
  const [maxStrainReached, setMaxStrainReached] = useState(0);
  const [isFractured, setIsFractured] = useState(false);

  // Playback & unloading animation flags
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUnloadingAnim, setIsUnloadingAnim] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Chart & inspection UI controls
  const [chartMode, setChartMode] = useState<ChartMode>('stress-strain');
  const [showToughnessArea, setShowToughnessArea] = useState(false);
  const [showUnloadingGuide, setShowUnloadingGuide] = useState(true);
  const [pinnedReference, setPinnedReference] =
    useState<PinnedReferenceCurve | null>(null);
  const [inspectionMode, setInspectionMode] = useState(false);

  // Modals & AI Tutor Drawer
  const [theoryOpen, setTheoryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const material = MATERIALS[materialId];

  // Derived physical snapshot (exact formulas, zero drift)
  const snapshot = useMemo(
    () =>
      computeSnapshot(
        material,
        geometry,
        currentStrain,
        maxStrainReached,
        isFractured
      ),
    [material, geometry, currentStrain, maxStrainReached, isFractured]
  );

  // Current slider value [0..1000] synced with currentStrain
  const sliderProgress = useMemo(
    () =>
      isFractured
        ? 1000
        : strainToProgress(material, currentStrain),
    [material, currentStrain, isFractured]
  );

  // Refs for smooth rAF animation loop
  const stateRef = useRef({
    currentStrain,
    maxStrainReached,
    isFractured,
    material,
    playbackSpeed,
  });
  stateRef.current = {
    currentStrain,
    maxStrainReached,
    isFractured,
    material,
    playbackSpeed,
  };

  // Automatic Quasi-Static Tensile Test Animation Loop
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const {
        currentStrain: cStrain,
        maxStrainReached: mStrain,
        isFractured: frac,
        material: mat,
        playbackSpeed: spd,
      } = stateRef.current;

      if (frac) {
        setIsPlaying(false);
        return;
      }

      // If currently unloaded below maxStrainReached, reload straight up elastic line first
      if (cStrain < mStrain - 1e-6) {
        const reloadSpan = Math.max(0.0005, mStrain - cStrain);
        const E_MPa = mat.youngModulusGPa * 1000;
        const maxStress = evaluateMonotonicStress(mat, mStrain);
        const totalElSpan = Math.max(0.0004, maxStress / E_MPa);
        const stepStrain = totalElSpan * dt * 1.4 * spd;
        const nextStrain = Math.min(mStrain, cStrain + Math.min(reloadSpan, stepStrain));
        setCurrentStrain(nextStrain);
      } else {
        // Advance along the piecewise progress curve (~14 seconds full test at 1x)
        const currentP = strainToProgress(mat, cStrain);
        const deltaP = 72 * spd * dt;
        const nextP = Math.min(1000, currentP + deltaP);
        const nextStrain = progressToStrain(mat, nextP);

        if (nextP >= 1000 || nextStrain >= mat.fractureStrain - 1e-9) {
          setCurrentStrain(mat.fractureStrain);
          setMaxStrainReached(mat.fractureStrain);
          setIsFractured(true);
          setIsPlaying(false);
          return;
        }

        setCurrentStrain(nextStrain);
        setMaxStrainReached((prev) => Math.max(prev, nextStrain));
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  // Smooth Elastic Unloading Animation (F -> 0 along slope E)
  useEffect(() => {
    if (!isUnloadingAnim) return;
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const {
        currentStrain: cStrain,
        maxStrainReached: mStrain,
        material: mat,
      } = stateRef.current;

      const epsY = getYieldStrain(mat);
      const E_MPa = mat.youngModulusGPa * 1000;
      const peakStress = evaluateMonotonicStress(mat, mStrain);
      const targetResidual =
        mStrain <= epsY ? 0 : Math.max(0, mStrain - peakStress / E_MPa);
      const elSpan = Math.max(0.0003, mStrain - targetResidual);

      const nextStrain = cStrain - elSpan * dt * 1.8;

      if (nextStrain <= targetResidual + 1e-8) {
        setCurrentStrain(targetResidual);
        // If unloaded from inside the elastic zone, the specimen completely recovers!
        if (mStrain <= epsY) {
          setMaxStrainReached(0);
        }
        setIsUnloadingAnim(false);
        return;
      }

      setCurrentStrain(nextStrain);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isUnloadingAnim]);

  // Reset specimen to fresh state
  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setIsUnloadingAnim(false);
    setCurrentStrain(0);
    setMaxStrainReached(0);
    setIsFractured(false);
    setInspectionMode(false);
  }, []);

  // Switch material (resets specimen cleanly)
  const handleSelectMaterial = useCallback((id: MaterialId) => {
    setMaterialId(id);
    setIsPlaying(false);
    setIsUnloadingAnim(false);
    setCurrentStrain(0);
    setMaxStrainReached(0);
    setIsFractured(false);
    setInspectionMode(false);
  }, []);

  // Manual slider interaction
  const handleSliderChange = useCallback(
    (progress: number) => {
      if (isFractured) return;
      setIsPlaying(false);
      setIsUnloadingAnim(false);

      const targetStrain = progressToStrain(material, progress);
      const epsY = getYieldStrain(material);
      const E_MPa = material.youngModulusGPa * 1000;
      const peakStress = evaluateMonotonicStress(material, maxStrainReached);
      const residual =
        maxStrainReached <= epsY
          ? 0
          : Math.max(0, maxStrainReached - peakStress / E_MPa);

      // Fracture when reaching the end of the slider
      if (progress >= 1000 || targetStrain >= material.fractureStrain - 1e-9) {
        setCurrentStrain(material.fractureStrain);
        setMaxStrainReached(material.fractureStrain);
        setIsFractured(true);
        return;
      }

      // If dragging backwards inside elastic zone, recoverable back to 0
      if (maxStrainReached <= epsY && targetStrain < maxStrainReached) {
        setCurrentStrain(targetStrain);
        setMaxStrainReached(targetStrain);
        return;
      }

      // If dragging backwards in plastic zone, stop at permanent residual strain (cannot undo plasticity)
      const clampedStrain = Math.max(residual, targetStrain);
      setCurrentStrain(clampedStrain);
      if (clampedStrain > maxStrainReached) {
        setMaxStrainReached(clampedStrain);
      }
    },
    [isFractured, material, maxStrainReached]
  );

  // Trigger smooth unloading to F = 0
  const handleUnload = useCallback(() => {
    if (isFractured || snapshot.stress <= 0.5) return;
    setIsPlaying(false);
    setShowUnloadingGuide(true);
    setIsUnloadingAnim(true);
  }, [isFractured, snapshot.stress]);

  // Pin current curve as reference for geometry comparison
  const handlePinReference = useCallback(() => {
    if (maxStrainReached < 0.0002) return;
    const pts = sampleMonotonicCurve(material, geometry, maxStrainReached);
    setPinnedReference({
      materialId: material.id,
      materialName: material.shortName,
      d0: geometry.d0,
      l0: geometry.l0,
      s0: snapshot.s0,
      points: pts,
    });
  }, [material, geometry, maxStrainReached, snapshot.s0]);

  // Export CSV with real sampled tensile history
  const handleExportCsv = useCallback(() => {
    if (maxStrainReached < 1e-6) return;
    const pts = sampleMonotonicCurve(material, geometry, maxStrainReached);
    const rows = pts.map((pt, idx) => {
      const snapAtPt = computeSnapshot(
        material,
        geometry,
        pt.strain,
        pt.strain,
        false
      );
      return {
        step: idx + 1,
        deltaL: pt.deltaL,
        forceKN: pt.forceKN,
        strain: pt.strain,
        stress: pt.stress,
        diameter: snapAtPt.centralDiameter,
        phase: snapAtPt.phaseLabel,
      };
    });

    // If currently unloaded in plastic zone, append final unloaded row
    if (snapshot.isUnloadedOrUnloading && snapshot.stress <= 0.5) {
      rows.push({
        step: rows.length + 1,
        deltaL: snapshot.deltaL,
        forceKN: 0,
        strain: snapshot.strain,
        stress: 0,
        diameter: snapshot.centralDiameter,
        phase: snapshot.phaseLabel,
      });
    } else if (isFractured) {
      rows.push({
        step: rows.length + 1,
        deltaL: snapshot.finalLengthLf - geometry.l0,
        forceKN: 0,
        strain: snapshot.residualStrain,
        stress: 0,
        diameter: snapshot.finalDiameterDf,
        phase: 'Probeta Fracturada (post-rotura)',
      });
    }

    const csv = buildCsvReport(snapshot, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ensayo_traccion_${material.id}_D${geometry.d0}_L${geometry.l0}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [material, geometry, maxStrainReached, snapshot, isFractured]);

  // Dynamic pedagogical observation strip under the chart
  const observationNote = useMemo(() => {
    switch (snapshot.phase) {
      case 'idle':
        return 'Ajusta el diámetro D₀ y la longitud calibrada L₀ si lo deseas, y desliza el control de carga o inicia el ensayo automático para observar el comportamiento elástico inicial.';
      case 'elastic':
        return `Comportamiento lineal reversible (σ = E·ε, con E = ${material.youngModulusGPa} GPa). Si pulsas «Descargar (F → 0)» ahora, la probeta recuperará su longitud original L₀ = ${geometry.l0.toFixed(0)} mm sin deformación permanente.`;
      case 'plastic_uniform':
        return `Se ha superado el límite elástico (${material.yieldStrengthMPa} MPa). La deformación es permanente y uniforme en toda la zona calibrada. Prueba a pulsar «Descargar» para visualizar la recta paralela de pendiente E y la deformación plástica residual.`;
      case 'necking':
        return material.fractureType === 'brittle-flat'
          ? 'Material frágil muy próximo a su tensión crítica de rotura: la fractura se producirá de forma repentina sin formación de cuello.'
          : `Se superó la resistencia máxima σ_R (${material.utsMPa} MPa). La probeta forma una estricción (cuello) localizada en el centro y la tensión nominal desciende hasta alcanzar la rotura.`;
      case 'unloading_elastic':
        return 'Descarga elástica en curso: la probeta retrocede exactamente sobre la misma recta de carga recuperando el 100% de su forma original.';
      case 'unloading_plastic':
      case 'unloaded_plastic':
        return `Descarga completada siguiendo la recta paralela al módulo de Young (E = ${material.youngModulusGPa} GPa). Se recuperó una deformación elástica de ${(snapshot.elasticRecoveryStrain * 100).toFixed(2)}% y permanece una deformación plástica residual de ${(snapshot.residualStrain * 100).toFixed(2)}% (+${(snapshot.residualStrain * geometry.l0).toFixed(2)} mm).`;
      case 'fractured':
        return `Fractura alcanzada (${material.fractureType === 'cup-cone' ? 'morfología dúctil copa-cono' : 'morfología frágil plana'}). Pulsa «Unir mitades y medir» en el panel izquierdo para usar el calibrador virtual y verificar L_f, D_f, A% y Z%.`;
    }
  }, [snapshot, material, geometry.l0]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] text-slate-900">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Wordmark */}
          <a
            href="#laboratorio"
            onClick={(e) => {
              e.preventDefault();
              setTheoryOpen(false);
              setCompareOpen(false);
              setChatOpen(false);
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            LabTracción FINGLUZ
          </a>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav
            aria-label="Navegación principal"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => {
                setTheoryOpen(false);
                setCompareOpen(false);
                setChatOpen(false);
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !theoryOpen && !compareOpen && !chatOpen
                  ? 'text-slate-900 underline underline-offset-8 decoration-blue-700 decoration-2'
                  : ''
              }`}
            >
              Laboratorio
            </button>
            <button
              type="button"
              onClick={() => {
                setTheoryOpen(false);
                setChatOpen(false);
                setCompareOpen(true);
              }}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Comparar materiales
            </button>
            <button
              type="button"
              onClick={() => {
                setCompareOpen(false);
                setChatOpen(false);
                setTheoryOpen(true);
              }}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Guía teórica
            </button>
            <button
              type="button"
              onClick={() => {
                setCompareOpen(false);
                setTheoryOpen(false);
                setChatOpen(true);
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chatOpen
                  ? 'text-blue-700 underline underline-offset-8 decoration-blue-700 decoration-2'
                  : ''
              }`}
            >
              Tutor IA
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={maxStrainReached < 1e-6}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Strip (visible only below md) */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-4 text-xs font-medium text-slate-600 overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            setTheoryOpen(false);
            setCompareOpen(false);
            setChatOpen(false);
          }}
          className="text-slate-900 font-semibold whitespace-nowrap shrink-0"
        >
          Laboratorio
        </button>
        <button
          type="button"
          onClick={() => setCompareOpen(true)}
          className="hover:text-slate-900 whitespace-nowrap shrink-0"
        >
          Comparar materiales
        </button>
        <button
          type="button"
          onClick={() => setTheoryOpen(true)}
          className="hover:text-slate-900 whitespace-nowrap shrink-0"
        >
          Guía teórica
        </button>
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="text-blue-700 font-semibold whitespace-nowrap shrink-0"
        >
          Tutor IA
        </button>
      </div>

      {/* Main 3-Panel Engineering Laboratory Workspace */}
      <main
        id="laboratorio"
        className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5"
      >
        {/* Concise Context Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1
              className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              LabTracción FINGLUZ — Ensayo de Tracción en Probetas
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Simulación cuasi-estática por desplazamiento controlado ·{' '}
              {material.name} ({material.standard})
            </p>
          </div>

          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-blue-200 text-blue-800 hover:bg-blue-50 hover:border-blue-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Consultar con Tutor IA (Gemini)
          </button>
        </div>

        {/* 3-Panel Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 xl:grid-cols-[360px_minmax(0,1fr)_360px] gap-4 items-start">
          {/* LEFT PANEL: Universal Testing Machine + Post-Fracture Caliper */}
          <div className="lg:col-span-5 xl:col-span-1">
            <TestingMachinePanel
              snapshot={snapshot}
              inspectionMode={inspectionMode}
              onToggleInspection={setInspectionMode}
            />
          </div>

          {/* CENTER PANEL: Real-Time Interactive Diagram + Live Pedagogical Observation */}
          <div className="lg:col-span-7 xl:col-span-1 flex flex-col gap-4 min-w-0">
            <TensileChartPanel
              snapshot={snapshot}
              chartMode={chartMode}
              onChangeChartMode={setChartMode}
              showToughnessArea={showToughnessArea}
              onToggleToughnessArea={() => setShowToughnessArea((v) => !v)}
              showUnloadingGuide={showUnloadingGuide}
              onToggleUnloadingGuide={() => setShowUnloadingGuide((v) => !v)}
              pinnedReference={pinnedReference}
              onPinReference={handlePinReference}
              onClearReference={() => setPinnedReference(null)}
            />

            {/* Contextual Real-Time Observation Card */}
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <h3 className="text-xs font-semibold text-slate-900">
                  Análisis físico en tiempo real
                </h3>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {snapshot.phaseLabel}
                </span>
              </div>
              <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                {observationNote}
              </p>
            </div>
          </div>

          {/* RIGHT PANEL: Controls, Digital Readouts & Calculated Mechanical Properties */}
          <div className="lg:col-span-12 xl:col-span-1">
            <ControlInstrumentationPanel
              snapshot={snapshot}
              selectedMaterialId={materialId}
              onSelectMaterial={handleSelectMaterial}
              geometry={geometry}
              onChangeGeometry={setGeometry}
              sliderProgress={sliderProgress}
              onSliderChange={handleSliderChange}
              isPlaying={isPlaying}
              onTogglePlay={() => {
                setIsUnloadingAnim(false);
                setIsPlaying((p) => !p);
              }}
              playbackSpeed={playbackSpeed}
              onChangeSpeed={setPlaybackSpeed}
              onUnload={handleUnload}
              onReset={handleReset}
              onExportCsv={handleExportCsv}
              isUnloadingAnim={isUnloadingAnim}
            />
          </div>
        </div>
      </main>

      {/* Clean Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 mt-6">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
          <p className="font-medium text-slate-800">
            LabTracción FINGLUZ
          </p>
          <p className="text-center sm:text-right">
            Desarrollado por el profesor ingeniero{' '}
            <span className="font-semibold text-slate-900">
              José Manuel Faría
            </span>
          </p>
        </div>
      </footer>

      {/* Modals & Gemini Chat Drawer */}
      <TheoryModal open={theoryOpen} onClose={() => setTheoryOpen(false)} />
      <MaterialComparisonModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        selectedMaterialId={materialId}
        onSelectAndClose={(id) => {
          handleSelectMaterial(id);
          setCompareOpen(false);
        }}
      />
      <GeminiChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        snapshot={snapshot}
        chartMode={chartMode}
        inspectionMode={inspectionMode}
        showToughnessArea={showToughnessArea}
        pinnedReference={pinnedReference}
      />
    </div>
  );
}
