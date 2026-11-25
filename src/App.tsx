/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileCode2, MessageSquare } from 'lucide-react';
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
import {
  GeminiChatDrawer,
  SimulatorActionPayload,
} from './components/GeminiChatDrawer';

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

  // Execute bidirectional simulator actions triggered by Gemini Function Calling
  const handleApplySimulatorActions = useCallback(
    (actions: SimulatorActionPayload): string => {
      const notes: string[] = [];
      let willReset = false;

      if (actions.materialId && MATERIALS[actions.materialId]) {
        setMaterialId(actions.materialId);
        willReset = true;
        notes.push(`Material: ${MATERIALS[actions.materialId].shortName}`);
      }

      if (typeof actions.d0 === 'number' || typeof actions.l0 === 'number') {
        const nextD0 =
          typeof actions.d0 === 'number'
            ? Math.min(20, Math.max(6, Math.round(actions.d0 * 2) / 2))
            : geometry.d0;
        const nextL0 =
          typeof actions.l0 === 'number'
            ? Math.min(100, Math.max(30, Math.round(actions.l0)))
            : geometry.l0;

        setGeometry({ d0: nextD0, l0: nextL0 });
        if (maxStrainReached > 0 || isFractured) {
          willReset = true;
        }
        notes.push(`D₀ = ${nextD0} mm · L₀ = ${nextL0} mm`);
      }

      if (willReset) {
        setIsPlaying(false);
        setIsUnloadingAnim(false);
        setCurrentStrain(0);
        setMaxStrainReached(0);
        setIsFractured(false);
        setInspectionMode(false);
      }

      if (
        actions.chartMode === 'stress-strain' ||
        actions.chartMode === 'force-elongation'
      ) {
        setChartMode(actions.chartMode);
        notes.push(
          actions.chartMode === 'stress-strain'
            ? 'Gráfica σ – ε'
            : 'Gráfica F – ΔL'
        );
      }

      if (typeof actions.showToughnessArea === 'boolean') {
        setShowToughnessArea(actions.showToughnessArea);
        notes.push(
          actions.showToughnessArea
            ? 'Área de tenacidad activada'
            : 'Área de tenacidad oculta'
        );
      }

      if (typeof actions.showUnloadingGuide === 'boolean') {
        setShowUnloadingGuide(actions.showUnloadingGuide);
        notes.push(
          actions.showUnloadingGuide
            ? 'Guía de descarga activada'
            : 'Guía de descarga oculta'
        );
      }

      if (typeof actions.inspectionMode === 'boolean') {
        if (actions.inspectionMode && isFractured && !willReset) {
          setInspectionMode(true);
          notes.push('Calibrador post-rotura activado');
        } else if (!actions.inspectionMode) {
          setInspectionMode(false);
          notes.push('Vista de máquina universal');
        }
      }

      if (actions.action) {
        switch (actions.action) {
          case 'reset':
            handleReset();
            notes.push('Probeta reiniciada');
            break;
          case 'play':
            if (isFractured && !willReset) {
              setCurrentStrain(0);
              setMaxStrainReached(0);
              setIsFractured(false);
              setInspectionMode(false);
            }
            setIsUnloadingAnim(false);
            setIsPlaying(true);
            notes.push('Ensayo automático iniciado');
            break;
          case 'pause':
            setIsPlaying(false);
            setIsUnloadingAnim(false);
            notes.push('Ensayo pausado');
            break;
          case 'unload':
            if (!isFractured && !willReset && snapshot.stress > 0.5) {
              setIsPlaying(false);
              setShowUnloadingGuide(true);
              setIsUnloadingAnim(true);
              notes.push('Descarga elástica iniciada (F → 0)');
            }
            break;
          case 'pin_reference':
            if (maxStrainReached >= 0.0002 && !willReset) {
              handlePinReference();
              notes.push('Curva fijada como referencia');
            }
            break;
          case 'clear_reference':
            setPinnedReference(null);
            notes.push('Curva de referencia limpiada');
            break;
        }
      }

      return notes.join(' · ');
    },
    [
      geometry.d0,
      geometry.l0,
      maxStrainReached,
      isFractured,
      snapshot.stress,
      handleReset,
      handlePinReference,
    ]
  );

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
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] text-slate-950 text-sm font-bold">
      {/* Strict 3-Zone Top Navigation Bar with Official LUZ & Facultad de Ingeniería Logo */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-300">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Institutional LUZ + Facultad de Ingeniería Lockup & Brand */}
          <a
            href="#laboratorio"
            onClick={(e) => {
              e.preventDefault();
              setTheoryOpen(false);
              setCompareOpen(false);
              setChatOpen(false);
            }}
            className="flex items-center gap-3 shrink-0"
          >
            <img
              src="/assets/luz-fing-logo.png"
              alt="Universidad del Zulia · Facultad de Ingeniería"
              referrerPolicy="no-referrer"
              className="h-10 sm:h-11 w-auto object-contain shrink-0"
            />
            <span className="h-8 w-px bg-slate-300 hidden sm:block shrink-0" />
            <span
              className="text-sm font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              LabTracción FINGLUZ
            </span>
          </a>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav
            aria-label="Navegación principal"
            className="hidden md:flex items-center gap-6 text-sm font-bold text-slate-950"
          >
            <button
              type="button"
              onClick={() => {
                setTheoryOpen(false);
                setCompareOpen(false);
                setChatOpen(false);
              }}
              className={`hover:text-blue-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !theoryOpen && !compareOpen && !chatOpen
                  ? 'text-slate-950 underline underline-offset-8 decoration-blue-800 decoration-2'
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
              className="hover:text-blue-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              className="hover:text-blue-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              className={`hover:text-blue-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chatOpen
                  ? 'text-blue-900 underline underline-offset-8 decoration-blue-800 decoration-2'
                  : ''
              }`}
            >
              Tutor IA
            </button>
          </nav>

          {/* Zone 3: Download Presentation HTML & Export CSV Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {!(
              typeof window !== 'undefined' &&
              (
                window as unknown as {
                  __LABTRACCION_STANDALONE__?: boolean;
                }
              ).__LABTRACCION_STANDALONE__
            ) && (
              <a
                href="/LabTraccion_FINGLUZ_Presentacion.html"
                download="LabTraccion_FINGLUZ_Presentacion.html"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-slate-950 bg-white border-2 border-slate-950 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Descargar el simulador completo en un solo archivo HTML portable para abrir en tu presentación"
              >
                <FileCode2 className="w-4 h-4" />
                Descargar HTML
              </a>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={maxStrainReached < 1e-6}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-slate-950 rounded-lg hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Strip (visible only below md) */}
      <div className="md:hidden bg-white border-b border-slate-300 px-4 py-2 flex items-center gap-4 text-sm font-bold text-slate-950 overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            setTheoryOpen(false);
            setCompareOpen(false);
            setChatOpen(false);
          }}
          className="text-slate-950 font-bold whitespace-nowrap shrink-0"
        >
          Laboratorio
        </button>
        <button
          type="button"
          onClick={() => setCompareOpen(true)}
          className="text-slate-950 hover:text-blue-900 whitespace-nowrap shrink-0"
        >
          Comparar materiales
        </button>
        <button
          type="button"
          onClick={() => setTheoryOpen(true)}
          className="text-slate-950 hover:text-blue-900 whitespace-nowrap shrink-0"
        >
          Guía teórica
        </button>
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="text-blue-900 font-bold whitespace-nowrap shrink-0"
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
              className="text-sm font-bold text-slate-950 tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              LabTracción FINGLUZ — Ensayo de Tracción en Probetas
            </h1>
            <p className="text-sm font-bold text-slate-950 mt-0.5">
              Simulación cuasi-estática por desplazamiento controlado ·{' '}
              {material.name} ({material.standard})
            </p>
          </div>

          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-white border-2 border-blue-900 text-blue-950 hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
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
            <div className="bg-white border border-slate-300 rounded-xl px-4 py-3.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <h3 className="text-sm font-bold text-slate-950">
                  Análisis físico en tiempo real
                </h3>
                <span className="text-sm font-bold text-slate-950 font-mono tabular-nums">
                  {snapshot.phaseLabel}
                </span>
              </div>
              <p className="text-sm font-bold text-slate-950 leading-relaxed">
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
      <footer className="bg-white border-t border-slate-300 mt-6">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm font-bold text-slate-950">
          <div className="flex items-center gap-3">
            <img
              src="/assets/luz-fing-logo.png"
              alt="Universidad del Zulia · Facultad de Ingeniería"
              referrerPolicy="no-referrer"
              className="h-8 w-auto object-contain shrink-0"
            />
            <span className="text-sm font-bold text-slate-950">
              LabTracción FINGLUZ
            </span>
          </div>
          <p className="text-center sm:text-right text-sm font-bold text-slate-950">
            Desarrollado por el profesor ingeniero José Manuel Faría
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
        onApplySimulatorActions={handleApplySimulatorActions}
      />
    </div>
  );
}
