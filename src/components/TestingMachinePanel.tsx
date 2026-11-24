import React, { useState } from 'react';
import { Ruler, Eye, CheckCircle2 } from 'lucide-react';
import { SimulationSnapshot } from '../physics/tensileEngine';

interface TestingMachinePanelProps {
  snapshot: SimulationSnapshot;
  inspectionMode: boolean;
  onToggleInspection: (open: boolean) => void;
}

/**
 * Generates a smooth SVG path for a cylindrical dog-bone specimen with optional necking.
 * Works both for an intact specimen and for the upper/lower halves after fracture.
 */
function buildSpecimenHalfPath(params: {
  cx: number;
  yStart: number;
  yEnd: number;
  shoulderHalfW: number;
  uniformHalfW: number;
  neckHalfW: number;
  neckCenterY: number;
  neckSigma: number;
  shoulderLength: number;
  isUpper: boolean;
  fractureType: 'cup-cone' | 'brittle-flat' | 'none';
}): string {
  const {
    cx,
    yStart,
    yEnd,
    shoulderHalfW,
    uniformHalfW,
    neckHalfW,
    neckCenterY,
    neckSigma,
    shoulderLength,
    isUpper,
    fractureType,
  } = params;

  const steps = 40;
  const rightPts: Array<[number, number]> = [];
  const leftPts: Array<[number, number]> = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = yStart + (yEnd - yStart) * t;

    // Determine distance from gripped shoulder end
    const distFromGrip = isUpper ? y - yStart : yEnd - y;
    let halfW = uniformHalfW;

    if (distFromGrip < shoulderLength) {
      const u = distFromGrip / shoulderLength;
      // Smooth cubic fillet from shoulder to gauge cylinder
      const blend = u * u * (3 - 2 * u);
      halfW = shoulderHalfW + (uniformHalfW - shoulderHalfW) * blend;
    } else {
      // Apply localized Gaussian necking around neckCenterY
      const dy = y - neckCenterY;
      const gauss = Math.exp(-(dy * dy) / (2 * neckSigma * neckSigma));
      halfW = uniformHalfW - (uniformHalfW - neckHalfW) * gauss;
    }

    rightPts.push([cx + halfW, y]);
    leftPts.push([cx - halfW, y]);
  }

  // Construct path clockwise
  const pts: string[] = [];
  pts.push(`M ${leftPts[0][0].toFixed(2)} ${leftPts[0][1].toFixed(2)}`);
  pts.push(`L ${rightPts[0][0].toFixed(2)} ${rightPts[0][1].toFixed(2)}`);

  for (let i = 1; i < rightPts.length; i++) {
    pts.push(`L ${rightPts[i][0].toFixed(2)} ${rightPts[i][1].toFixed(2)}`);
  }

  // Fracture tip geometry on the broken end
  if (fractureType === 'cup-cone' && isUpper) {
    // Upper half ends in an outward cone with 45-degree shear lip
    const rEdge = rightPts[rightPts.length - 1];
    const lEdge = leftPts[leftPts.length - 1];
    const rW = (rEdge[0] - lEdge[0]) / 2;
    const tipDrop = Math.max(4, Math.min(9, rW * 0.65));
    pts.push(`L ${(cx + rW * 0.45).toFixed(2)} ${(rEdge[1] + tipDrop).toFixed(2)}`);
    pts.push(`L ${(cx - rW * 0.45).toFixed(2)} ${(rEdge[1] + tipDrop).toFixed(2)}`);
    pts.push(`L ${lEdge[0].toFixed(2)} ${lEdge[1].toFixed(2)}`);
  } else if (fractureType === 'cup-cone' && !isUpper) {
    // Lower half starts at top with recessed cup (handled at top edge below)
    const lEdge = leftPts[leftPts.length - 1];
    pts.push(`L ${lEdge[0].toFixed(2)} ${lEdge[1].toFixed(2)}`);
  } else if (fractureType === 'brittle-flat' && isUpper) {
    // Slight crystalline jaggedness perpendicular to axis
    const rEdge = rightPts[rightPts.length - 1];
    const lEdge = leftPts[leftPts.length - 1];
    const rW = (rEdge[0] - lEdge[0]) / 2;
    pts.push(`L ${(cx + rW * 0.5).toFixed(2)} ${(rEdge[1] + 1.4).toFixed(2)}`);
    pts.push(`L ${(cx).toFixed(2)} ${(rEdge[1] - 1.2).toFixed(2)}`);
    pts.push(`L ${(cx - rW * 0.5).toFixed(2)} ${(rEdge[1] + 1.3).toFixed(2)}`);
    pts.push(`L ${lEdge[0].toFixed(2)} ${lEdge[1].toFixed(2)}`);
  } else {
    const lEdge = leftPts[leftPts.length - 1];
    pts.push(`L ${lEdge[0].toFixed(2)} ${lEdge[1].toFixed(2)}`);
  }

  for (let i = leftPts.length - 2; i >= 0; i--) {
    pts.push(`L ${leftPts[i][0].toFixed(2)} ${leftPts[i][1].toFixed(2)}`);
  }

  // If lower half and cup-cone, carve top cup indentation between leftPts[0] and rightPts[0]
  if (fractureType === 'cup-cone' && !isUpper) {
    const rTop = rightPts[0];
    const lTop = leftPts[0];
    const rW = (rTop[0] - lTop[0]) / 2;
    const cupDepth = Math.max(4, Math.min(9, rW * 0.65));
    const carved = [
      `M ${lTop[0].toFixed(2)} ${lTop[1].toFixed(2)}`,
      `L ${(cx - rW * 0.45).toFixed(2)} ${(lTop[1] + cupDepth).toFixed(2)}`,
      `L ${(cx + rW * 0.45).toFixed(2)} ${(lTop[1] + cupDepth).toFixed(2)}`,
      `L ${rTop[0].toFixed(2)} ${rTop[1].toFixed(2)}`,
      ...rightPts.slice(1).map((p) => `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`),
      `L ${leftPts[leftPts.length - 1][0].toFixed(2)} ${leftPts[leftPts.length - 1][1].toFixed(2)}`,
      ...leftPts
        .slice(0, -1)
        .reverse()
        .map((p) => `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`),
      'Z',
    ];
    return carved.join(' ');
  }

  if (fractureType === 'brittle-flat' && !isUpper) {
    const rTop = rightPts[0];
    const lTop = leftPts[0];
    const rW = (rTop[0] - lTop[0]) / 2;
    const flatTop = [
      `M ${lTop[0].toFixed(2)} ${lTop[1].toFixed(2)}`,
      `L ${(cx - rW * 0.5).toFixed(2)} ${(lTop[1] + 1.3).toFixed(2)}`,
      `L ${cx.toFixed(2)} ${(lTop[1] - 1.2).toFixed(2)}`,
      `L ${(cx + rW * 0.5).toFixed(2)} ${(lTop[1] + 1.4).toFixed(2)}`,
      `L ${rTop[0].toFixed(2)} ${rTop[1].toFixed(2)}`,
      ...rightPts.slice(1).map((p) => `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`),
      `L ${leftPts[leftPts.length - 1][0].toFixed(2)} ${leftPts[leftPts.length - 1][1].toFixed(2)}`,
      ...leftPts
        .slice(0, -1)
        .reverse()
        .map((p) => `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`),
      'Z',
    ];
    return flatTop.join(' ');
  }

  pts.push('Z');
  return pts.join(' ');
}

/**
 * Generates an intact dog-bone specimen path from yTop to yBottom.
 */
function buildIntactSpecimenPath(params: {
  cx: number;
  yTop: number;
  yBottom: number;
  shoulderHalfW: number;
  uniformHalfW: number;
  neckHalfW: number;
  neckSigma: number;
  shoulderLength: number;
}): string {
  const {
    cx,
    yTop,
    yBottom,
    shoulderHalfW,
    uniformHalfW,
    neckHalfW,
    neckSigma,
    shoulderLength,
  } = params;

  const steps = 64;
  const centerY = (yTop + yBottom) / 2;
  const rightPts: Array<[number, number]> = [];
  const leftPts: Array<[number, number]> = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = yTop + (yBottom - yTop) * t;
    const distTop = y - yTop;
    const distBot = yBottom - y;
    const distEnd = Math.min(distTop, distBot);

    let halfW = uniformHalfW;
    if (distEnd < shoulderLength) {
      const u = distEnd / shoulderLength;
      const blend = u * u * (3 - 2 * u);
      halfW = shoulderHalfW + (uniformHalfW - shoulderHalfW) * blend;
    } else {
      const dy = y - centerY;
      const gauss = Math.exp(-(dy * dy) / (2 * neckSigma * neckSigma));
      halfW = uniformHalfW - (uniformHalfW - neckHalfW) * gauss;
    }

    rightPts.push([cx + halfW, y]);
    leftPts.push([cx - halfW, y]);
  }

  const d: string[] = [
    `M ${leftPts[0][0].toFixed(2)} ${leftPts[0][1].toFixed(2)}`,
    `L ${rightPts[0][0].toFixed(2)} ${rightPts[0][1].toFixed(2)}`,
    ...rightPts.slice(1).map((p) => `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`),
    `L ${leftPts[leftPts.length - 1][0].toFixed(2)} ${leftPts[leftPts.length - 1][1].toFixed(2)}`,
    ...leftPts
      .slice(0, -1)
      .reverse()
      .map((p) => `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`),
    'Z',
  ];

  return d.join(' ');
}

export const TestingMachinePanel: React.FC<TestingMachinePanelProps> = ({
  snapshot,
  inspectionMode,
  onToggleInspection,
}) => {
  const [caliperTarget, setCaliperTarget] = useState<'length' | 'diameter'>('length');
  const { material, geometry, isFractured } = snapshot;

  // Visual mapping constants for the UTM SVG (340 x 500)
  const cx = 170;
  const lowerGripTopY = 398;
  const baseSpecimenLenPx = 152;

  // Visual elongation scaled so both ductile and brittle stretches remain clear and proportional
  // For ductile materials (up to 48% strain), cap visual elongation to ~64px so it fits nicely in frame
  const visualStrainScale =
    material.fractureType === 'brittle-flat'
      ? Math.min(1, snapshot.strain / Math.max(0.006, material.fractureStrain)) * 10
      : Math.min(68, snapshot.strain * 155);

  const fractureGapPx = isFractured ? 18 : 0;
  const totalExtensionPx = visualStrainScale + fractureGapPx;

  const upperGripBottomY = lowerGripTopY - baseSpecimenLenPx - totalExtensionPx;
  const crossheadY = upperGripBottomY - 82;

  // Specimen radius scaling in px (proportional to D0 within [6..20] mm)
  const baseHalfW = 7 + ((geometry.d0 - 6) / 14) * 9.5; // 7px to 16.5px
  const shoulderHalfW = baseHalfW + 6.5;
  const uniformHalfW = baseHalfW * (snapshot.uniformDiameter / geometry.d0);
  const neckHalfW = Math.max(
    3.2,
    baseHalfW * (snapshot.centralDiameter / geometry.d0)
  );

  const specimenTopY = upperGripBottomY;
  const specimenBottomY = lowerGripTopY;
  const shoulderLenPx = 22;

  // Gauge marks L0 initially occupy the central 62% of the unstretched specimen
  const initialGaugeSpanPx = baseSpecimenLenPx * 0.58;
  const currentGaugeSpanPx = initialGaugeSpanPx + visualStrainScale * 0.88;
  const specimenMidY = (specimenTopY + specimenBottomY) / 2;

  // For intact vs fractured gauge mark positions
  const upperGaugeMarkY = isFractured
    ? specimenMidY - fractureGapPx / 2 - currentGaugeSpanPx / 2
    : specimenMidY - currentGaugeSpanPx / 2;
  const lowerGaugeMarkY = isFractured
    ? specimenMidY + fractureGapPx / 2 + currentGaugeSpanPx / 2
    : specimenMidY + currentGaugeSpanPx / 2;

  const neckSigma = 16 + (1 - snapshot.neckingFactor) * 6;

  // Screw thread animation offset proportional to crosshead movement
  const screwOffset = (totalExtensionPx * 1.4) % 8;

  const intactPath = !isFractured
    ? buildIntactSpecimenPath({
        cx,
        yTop: specimenTopY,
        yBottom: specimenBottomY,
        shoulderHalfW,
        uniformHalfW,
        neckHalfW,
        neckSigma,
        shoulderLength: shoulderLenPx,
      })
    : '';

  const upperHalfPath = isFractured
    ? buildSpecimenHalfPath({
        cx,
        yStart: specimenTopY,
        yEnd: specimenMidY - fractureGapPx / 2,
        shoulderHalfW,
        uniformHalfW,
        neckHalfW,
        neckCenterY: specimenMidY - fractureGapPx / 2,
        neckSigma,
        shoulderLength: shoulderLenPx,
        isUpper: true,
        fractureType: material.fractureType,
      })
    : '';

  const lowerHalfPath = isFractured
    ? buildSpecimenHalfPath({
        cx,
        yStart: specimenMidY + fractureGapPx / 2,
        yEnd: specimenBottomY,
        shoulderHalfW,
        uniformHalfW,
        neckHalfW,
        neckCenterY: specimenMidY + fractureGapPx / 2,
        neckSigma,
        shoulderLength: shoulderLenPx,
        isUpper: false,
        fractureType: material.fractureType,
      })
    : '';

  // Post-fracture inspection joined specimen coordinates (horizontal layout on virtual caliper bench)
  const benchCenterY = 232;
  const benchCenterX = 170;
  const benchL0Px = 144;
  const benchStrainFactor = Math.min(0.46, snapshot.elongationAPct / 100);
  const benchLfPx = benchL0Px * (1 + benchStrainFactor);
  const benchHalfW = 14 + ((geometry.d0 - 6) / 14) * 8; // 14..22 px
  const benchUniformHalfW = benchHalfW * (snapshot.uniformDiameter / geometry.d0);
  const benchNeckHalfW = Math.max(
    4.5,
    benchHalfW * (snapshot.finalDiameterDf / geometry.d0)
  );
  const benchTotalHalfLen = benchLfPx / 2 + 46;

  // Build horizontal joined halves by rotating vertical paths -90deg around (benchCenterX, benchCenterY)
  const joinedLeftHalfPath = buildSpecimenHalfPath({
    cx: benchCenterX,
    yStart: benchCenterY - benchTotalHalfLen,
    yEnd: benchCenterY - 0.8,
    shoulderHalfW: benchHalfW + 7,
    uniformHalfW: benchUniformHalfW,
    neckHalfW: benchNeckHalfW,
    neckCenterY: benchCenterY,
    neckSigma: 18,
    shoulderLength: 24,
    isUpper: true,
    fractureType: material.fractureType,
  });

  const joinedRightHalfPath = buildSpecimenHalfPath({
    cx: benchCenterX,
    yStart: benchCenterY + 0.8,
    yEnd: benchCenterY + benchTotalHalfLen,
    shoulderHalfW: benchHalfW + 7,
    uniformHalfW: benchUniformHalfW,
    neckHalfW: benchNeckHalfW,
    neckCenterY: benchCenterY,
    neckSigma: 18,
    shoulderLength: 24,
    isUpper: false,
    fractureType: material.fractureType,
  });

  return (
    <section
      aria-label="Máquina Universal de Ensayos"
      className="bg-white border border-slate-300 rounded-xl flex flex-col overflow-hidden text-sm font-bold text-slate-950"
    >
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-slate-300 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-950 truncate">
            {inspectionMode
              ? 'Banco de Metrología Post-Rotura'
              : 'Máquina Universal de Ensayos'}
          </h2>
          <p className="text-sm font-bold text-slate-950 truncate mt-0.5">
            {material.shortName} · D₀ = {geometry.d0.toFixed(1)} mm · L₀ ={' '}
            {geometry.l0.toFixed(0)} mm
          </p>
        </div>

        {isFractured && (
          <button
            type="button"
            onClick={() => onToggleInspection(!inspectionMode)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              inspectionMode
                ? 'bg-slate-200 text-slate-950 hover:bg-slate-300'
                : 'bg-blue-800 text-white hover:bg-blue-900'
            }`}
          >
            {inspectionMode ? (
              <>
                <Eye className="w-4 h-4" />
                Vista máquina
              </>
            ) : (
              <>
                <Ruler className="w-4 h-4" />
                Unir mitades y medir
              </>
            )}
          </button>
        )}
      </div>

      {/* Main Visual Stage */}
      <div className="relative flex-1 bg-[#F8FAFC] flex flex-col items-center justify-center p-3 min-h-[450px]">
        {!inspectionMode ? (
          <svg
            viewBox="0 0 340 500"
            className="w-full max-w-[335px] h-auto select-none"
            role="img"
            aria-label={`Simulación de probeta de ${material.name} en la máquina universal de ensayos`}
          >
            <defs>
              {/* Metallic cylindrical shader for selected specimen */}
              <linearGradient id="specimenMetal" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={material.visual.baseDark} />
                <stop offset="22%" stopColor={material.visual.midTone} />
                <stop offset="44%" stopColor={material.visual.specular} />
                <stop offset="68%" stopColor={material.visual.highlight} />
                <stop offset="88%" stopColor={material.visual.midTone} />
                <stop offset="100%" stopColor={material.visual.baseDark} />
              </linearGradient>

              {/* Brushed steel frame gradient */}
              <linearGradient id="columnMetal" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#94A3B8" />
                <stop offset="30%" stopColor="#E2E8F0" />
                <stop offset="55%" stopColor="#F8FAFC" />
                <stop offset="85%" stopColor="#CBD5E1" />
                <stop offset="100%" stopColor="#64748B" />
              </linearGradient>

              {/* Dark machined steel for grips and crosshead */}
              <linearGradient id="darkFrame" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="50%" stopColor="#1E293B" />
                <stop offset="100%" stopColor="#0F172A" />
              </linearGradient>

              <linearGradient id="gripSteel" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1E293B" />
                <stop offset="25%" stopColor="#475569" />
                <stop offset="50%" stopColor="#64748B" />
                <stop offset="75%" stopColor="#334155" />
                <stop offset="100%" stopColor="#0F172A" />
              </linearGradient>

              {/* Subtle stress concentration glow in necking zone */}
              <radialGradient id="neckStressGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#D97706" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#D97706" stopOpacity="0" />
              </radialGradient>

              {/* Background precision millimeter grid */}
              <pattern
                id="labGrid"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="0.6"
                />
              </pattern>

              {/* Screw thread pattern */}
              <pattern
                id="ballScrew"
                width="10"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform={`translate(0, ${-screwOffset.toFixed(2)})`}
              >
                <rect width="10" height="8" fill="#CBD5E1" />
                <path
                  d="M 0 2 L 10 5 M 0 6 L 10 9"
                  stroke="#64748B"
                  strokeWidth="1.2"
                />
              </pattern>
            </defs>

            {/* Subtle background calibration grid */}
            <rect x="0" y="0" width="340" height="500" fill="url(#labGrid)" />

            {/* Fixed Top Bridge Beam of UTM */}
            <rect
              x="28"
              y="18"
              width="284"
              height="24"
              rx="4"
              fill="url(#darkFrame)"
            />
            <rect x="36" y="24" width="268" height="3" fill="#475569" opacity="0.55" />
            <text
              x="170"
              y="34"
              textAnchor="middle"
              fill="#CBD5E1"
              fontSize="8.5"
              fontFamily="IBM Plex Mono, monospace"
              letterSpacing="0.08em"
            >
              BASTIDOR ELECTROMECÁNICO · 250 kN
            </text>

            {/* Left & Right Twin Precision Columns */}
            <rect x="44" y="42" width="16" height="414" fill="url(#columnMetal)" stroke="#94A3B8" strokeWidth="0.7" />
            <rect x="280" y="42" width="16" height="414" fill="url(#columnMetal)" stroke="#94A3B8" strokeWidth="0.7" />

            {/* Left & Right Ball Screws (inside columns) */}
            <rect x="65" y="42" width="8" height="414" fill="url(#ballScrew)" stroke="#94A3B8" strokeWidth="0.6" />
            <rect x="267" y="42" width="8" height="414" fill="url(#ballScrew)" stroke="#94A3B8" strokeWidth="0.6" />

            {/* Heavy Lower Base Plinth */}
            <rect
              x="22"
              y="456"
              width="296"
              height="30"
              rx="4"
              fill="url(#darkFrame)"
            />
            <rect x="34" y="460" width="272" height="2.5" fill="#64748B" opacity="0.45" />
            {/* Mounting bolts */}
            <circle cx="44" cy="471" r="4" fill="#64748B" />
            <circle cx="296" cy="471" r="4" fill="#64748B" />

            {/* Lower Fixed Pedestal & Hydraulic Wedge Grip */}
            <rect x="148" y="432" width="44" height="24" fill="url(#columnMetal)" stroke="#64748B" strokeWidth="0.8" />
            <path
              d={`M ${cx - 32} ${lowerGripTopY} L ${cx + 32} ${lowerGripTopY} L ${cx + 26} ${lowerGripTopY + 34} L ${cx - 26} ${lowerGripTopY + 34} Z`}
              fill="url(#gripSteel)"
              stroke="#0F172A"
              strokeWidth="1"
            />
            {/* Serrated jaw insert lines (lower) */}
            <rect
              x={cx - shoulderHalfW - 4}
              y={lowerGripTopY + 2}
              width={(shoulderHalfW + 4) * 2}
              height="16"
              fill="#0F172A"
              opacity="0.45"
              rx="1"
            />
            <text
              x={cx}
              y={lowerGripTopY + 28}
              textAnchor="middle"
              fill="#CBD5E1"
              fontSize="7.5"
              fontFamily="IBM Plex Mono, monospace"
            >
              MORDAZA INFERIOR
            </text>

            {/* === MOVING UPPER CROSSHEAD GROUP === */}
            <g>
              {/* Moving Crosshead Beam */}
              <rect
                x="38"
                y={crossheadY}
                width="264"
                height="26"
                rx="3"
                fill="url(#darkFrame)"
                stroke="#0F172A"
                strokeWidth="0.8"
              />
              {/* Guide Bushings on Columns */}
              <rect x="40" y={crossheadY - 4} width="24" height="34" rx="2" fill="#475569" stroke="#1E293B" strokeWidth="0.8" />
              <rect x="276" y={crossheadY - 4} width="24" height="34" rx="2" fill="#475569" stroke="#1E293B" strokeWidth="0.8" />

              {/* Direction arrow on crosshead when moving */}
              {snapshot.stress > 0 && !isFractured && (
                <g transform={`translate(254, ${crossheadY + 13})`}>
                  <path
                    d={
                      snapshot.isUnloadedOrUnloading
                        ? 'M 0 -5 L 0 5 M -3.5 1.5 L 0 5 L 3.5 1.5'
                        : 'M 0 5 L 0 -5 M -3.5 -1.5 L 0 -5 L 3.5 -1.5'
                    }
                    stroke="#38BDF8"
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}

              {/* Load Cell Housing (Célula de Carga) */}
              <rect
                x={cx - 46}
                y={crossheadY + 26}
                width="92"
                height="26"
                rx="3"
                fill="#0F172A"
                stroke="#475569"
                strokeWidth="1"
              />
              <text
                x={cx}
                y={crossheadY + 35.5}
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="6.5"
                fontFamily="IBM Plex Mono, monospace"
              >
                CÉLULA DE CARGA
              </text>
              <text
                x={cx}
                y={crossheadY + 47.5}
                textAnchor="middle"
                fill={
                  isFractured
                    ? '#F87171'
                    : snapshot.phase === 'necking'
                      ? '#FBBF24'
                      : '#38BDF8'
                }
                fontSize="10.5"
                fontWeight="600"
                fontFamily="IBM Plex Mono, monospace"
              >
                {snapshot.forceKN.toFixed(2)} kN
              </text>

              {/* Upper Hydraulic Wedge Grip */}
              <path
                d={`M ${cx - 26} ${upperGripBottomY - 30} L ${cx + 26} ${upperGripBottomY - 30} L ${cx + 32} ${upperGripBottomY} L ${cx - 32} ${upperGripBottomY} Z`}
                fill="url(#gripSteel)"
                stroke="#0F172A"
                strokeWidth="1"
              />
              <rect
                x={cx - shoulderHalfW - 4}
                y={upperGripBottomY - 16}
                width={(shoulderHalfW + 4) * 2}
                height="14"
                fill="#0F172A"
                opacity="0.45"
                rx="1"
              />
              <text
                x={cx}
                y={upperGripBottomY - 19}
                textAnchor="middle"
                fill="#CBD5E1"
                fontSize="7.5"
                fontFamily="IBM Plex Mono, monospace"
              >
                MORDAZA SUPERIOR
              </text>
            </g>

            {/* === METALLIC SPECIMEN === */}
            {!isFractured ? (
              <g>
                {/* Optional subtle stress halo during active necking */}
                {snapshot.neckingFactor > 0.08 && (
                  <ellipse
                    cx={cx}
                    cy={specimenMidY}
                    rx={neckHalfW * 2.4}
                    ry={26}
                    fill="url(#neckStressGlow)"
                  />
                )}
                <path
                  d={intactPath}
                  fill="url(#specimenMetal)"
                  stroke={material.visual.baseDark}
                  strokeWidth="1"
                />
              </g>
            ) : (
              <g>
                {/* Upper fractured half */}
                <path
                  d={upperHalfPath}
                  fill="url(#specimenMetal)"
                  stroke={material.visual.baseDark}
                  strokeWidth="1"
                />
                {/* Lower fractured half */}
                <path
                  d={lowerHalfPath}
                  fill="url(#specimenMetal)"
                  stroke={material.visual.baseDark}
                  strokeWidth="1"
                />
                {/* Fracture plane visual annotation */}
                <line
                  x1={cx - 26}
                  y1={specimenMidY}
                  x2={cx + 26}
                  y2={specimenMidY}
                  stroke="#DC2626"
                  strokeWidth="1"
                  strokeDasharray="3 2"
                />
              </g>
            )}

            {/* === GAUGE LENGTH MARKS (L0) ON SPECIMEN === */}
            <g>
              {/* Upper scribe mark */}
              <line
                x1={cx - uniformHalfW - 1}
                y1={upperGaugeMarkY}
                x2={cx + uniformHalfW + 1}
                y2={upperGaugeMarkY}
                stroke="#1D4ED8"
                strokeWidth="2.2"
              />
              {/* Lower scribe mark */}
              <line
                x1={cx - uniformHalfW - 1}
                y1={lowerGaugeMarkY}
                x2={cx + uniformHalfW + 1}
                y2={lowerGaugeMarkY}
                stroke="#1D4ED8"
                strokeWidth="2.2"
              />

              {/* Right-side live dimension bracket for L = L0 + Delta L */}
              <line
                x1={cx + shoulderHalfW + 8}
                y1={upperGaugeMarkY}
                x2={cx + shoulderHalfW + 26}
                y2={upperGaugeMarkY}
                stroke="#1D4ED8"
                strokeWidth="0.9"
                strokeDasharray="2 2"
              />
              <line
                x1={cx + shoulderHalfW + 8}
                y1={lowerGaugeMarkY}
                x2={cx + shoulderHalfW + 26}
                y2={lowerGaugeMarkY}
                stroke="#1D4ED8"
                strokeWidth="0.9"
                strokeDasharray="2 2"
              />
              <line
                x1={cx + shoulderHalfW + 22}
                y1={upperGaugeMarkY}
                x2={cx + shoulderHalfW + 22}
                y2={lowerGaugeMarkY}
                stroke="#1D4ED8"
                strokeWidth="1.2"
              />
              <polygon
                points={`${cx + shoulderHalfW + 22},${upperGaugeMarkY} ${cx + shoulderHalfW + 19},${upperGaugeMarkY + 5} ${cx + shoulderHalfW + 25},${upperGaugeMarkY + 5}`}
                fill="#1D4ED8"
              />
              <polygon
                points={`${cx + shoulderHalfW + 22},${lowerGaugeMarkY} ${cx + shoulderHalfW + 19},${lowerGaugeMarkY - 5} ${cx + shoulderHalfW + 25},${lowerGaugeMarkY - 5}`}
                fill="#1D4ED8"
              />

              {/* Live L readout label */}
              <rect
                x={cx + shoulderHalfW + 26}
                y={specimenMidY - 19}
                width="66"
                height="38"
                rx="3"
                fill="#FFFFFF"
                stroke="#64748B"
                strokeWidth="1.1"
              />
              <text
                x={cx + shoulderHalfW + 59}
                y={specimenMidY - 5}
                textAnchor="middle"
                fill="#020617"
                fontSize="8.5"
                fontWeight="700"
                fontFamily="IBM Plex Mono, monospace"
              >
                {isFractured ? 'L_f' : 'L actual'}
              </text>
              <text
                x={cx + shoulderHalfW + 59}
                y={specimenMidY + 10}
                textAnchor="middle"
                fill="#020617"
                fontSize="10"
                fontWeight="700"
                fontFamily="IBM Plex Mono, monospace"
              >
                {(isFractured
                  ? snapshot.finalLengthLf
                  : snapshot.currentLength
                ).toFixed(2)}{' '}
                mm
              </text>

              {/* Left-side live central diameter D indicator */}
              <line
                x1={cx - neckHalfW}
                y1={specimenMidY}
                x2={cx - shoulderHalfW - 14}
                y2={specimenMidY}
                stroke={snapshot.neckingFactor > 0.05 ? '#B45309' : '#020617'}
                strokeWidth="1.1"
                strokeDasharray="2 2"
              />
              <rect
                x={cx - shoulderHalfW - 78}
                y={specimenMidY - 19}
                width="66"
                height="38"
                rx="3"
                fill="#FFFFFF"
                stroke={snapshot.neckingFactor > 0.05 ? '#B45309' : '#64748B'}
                strokeWidth="1.1"
              />
              <text
                x={cx - shoulderHalfW - 45}
                y={specimenMidY - 5}
                textAnchor="middle"
                fill={snapshot.neckingFactor > 0.05 ? '#78350F' : '#020617'}
                fontSize="8.5"
                fontWeight="700"
                fontFamily="IBM Plex Mono, monospace"
              >
                {isFractured
                  ? 'D_f cuello'
                  : snapshot.neckingFactor > 0.05
                    ? 'Estricción'
                    : 'D central'}
              </text>
              <text
                x={cx - shoulderHalfW - 45}
                y={specimenMidY + 10}
                textAnchor="middle"
                fill="#020617"
                fontSize="10"
                fontWeight="700"
                fontFamily="IBM Plex Mono, monospace"
              >
                {snapshot.centralDiameter.toFixed(2)} mm
              </text>
            </g>

            {/* Bottom status footer inside SVG */}
            <text
              x="170"
              y="475"
              textAnchor="middle"
              fill="#E2E8F0"
              fontSize="8"
              fontFamily="IBM Plex Mono, monospace"
            >
              {isFractured
                ? `FRACTURA ${material.fractureType === 'cup-cone' ? 'DÚCTIL (COPA-CONO)' : 'FRÁGIL (PLANA)'}`
                : `EXTENSIÓMETRO ACTIVO · ΔL = ${snapshot.deltaL.toFixed(2)} mm`}
            </text>
          </svg>
        ) : (
          /* === POST-FRACTURE VIRTUAL CALIPER INSPECTION BENCH === */
          <div className="w-full flex flex-col items-center">
            {/* Segmented switch: Measure Lf vs Measure Df */}
            <div className="inline-flex items-center p-1 bg-slate-200 rounded-lg mb-3">
              <button
                type="button"
                onClick={() => setCaliperTarget('length')}
                className={`px-3 py-1.5 text-sm font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  caliperTarget === 'length'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-900 hover:text-slate-950'
                }`}
              >
                Medir L_f (A%)
              </button>
              <button
                type="button"
                onClick={() => setCaliperTarget('diameter')}
                className={`px-3 py-1.5 text-sm font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  caliperTarget === 'diameter'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-900 hover:text-slate-950'
                }`}
              >
                Medir D_f (Z%)
              </button>
            </div>

            <svg
              viewBox="0 0 340 340"
              className="w-full max-w-[335px] h-auto select-none bg-white border border-slate-200 rounded-lg"
              role="img"
              aria-label="Calibrador virtual midiendo las dos mitades unidas de la probeta fracturada"
            >
              <defs>
                <linearGradient id="benchMetal" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={material.visual.baseDark} />
                  <stop offset="25%" stopColor={material.visual.midTone} />
                  <stop offset="48%" stopColor={material.visual.specular} />
                  <stop offset="72%" stopColor={material.visual.highlight} />
                  <stop offset="100%" stopColor={material.visual.baseDark} />
                </linearGradient>
                <pattern
                  id="caliperGrid"
                  width="16"
                  height="16"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 16 0 L 0 0 0 16"
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="0.8"
                  />
                </pattern>
              </defs>

              <rect width="340" height="340" fill="url(#caliperGrid)" />

              {/* Title & Fracture Type */}
              <text
                x="14"
                y="24"
                fill="#0F172A"
                fontSize="10"
                fontWeight="600"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                Calibrador Vernier Virtual · Mitades Reensambladas
              </text>
              <text
                x="14"
                y="38"
                fill="#64748B"
                fontSize="8.5"
                fontFamily="IBM Plex Mono, monospace"
              >
                Morfología:{' '}
                {material.fractureType === 'cup-cone'
                  ? 'Fractura dúctil copa-cono'
                  : 'Fractura frágil plana transversal'}
              </text>

              {/* Original D0 / L0 Ghost Reference Outline */}
              <rect
                x={benchCenterX - benchL0Px / 2}
                y={benchCenterY - benchHalfW}
                width={benchL0Px}
                height={benchHalfW * 2}
                fill="none"
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <text
                x={benchCenterX}
                y={benchCenterY + benchHalfW + 14}
                textAnchor="middle"
                fill="#64748B"
                fontSize="8"
                fontFamily="IBM Plex Mono, monospace"
              >
                Silueta inicial: L₀ = {geometry.l0.toFixed(1)} mm · D₀ ={' '}
                {geometry.d0.toFixed(1)} mm
              </text>

              {/* Rejoined Specimen Halves (Rotated Horizontally) */}
              <g transform={`rotate(-90 ${benchCenterX} ${benchCenterY})`}>
                <path
                  d={joinedLeftHalfPath}
                  fill="url(#benchMetal)"
                  stroke={material.visual.baseDark}
                  strokeWidth="1"
                />
                <path
                  d={joinedRightHalfPath}
                  fill="url(#benchMetal)"
                  stroke={material.visual.baseDark}
                  strokeWidth="1"
                />
              </g>

              {/* Gauge marks on joined halves */}
              <line
                x1={benchCenterX - benchLfPx / 2}
                y1={benchCenterY - benchUniformHalfW - 2}
                x2={benchCenterX - benchLfPx / 2}
                y2={benchCenterY + benchUniformHalfW + 2}
                stroke="#1D4ED8"
                strokeWidth="2.4"
              />
              <line
                x1={benchCenterX + benchLfPx / 2}
                y1={benchCenterY - benchUniformHalfW - 2}
                x2={benchCenterX + benchLfPx / 2}
                y2={benchCenterY + benchUniformHalfW + 2}
                stroke="#1D4ED8"
                strokeWidth="2.4"
              />

              {/* Rejoined fracture seam line */}
              <line
                x1={benchCenterX}
                y1={benchCenterY - benchNeckHalfW - 3}
                x2={benchCenterX}
                y2={benchCenterY + benchNeckHalfW + 3}
                stroke="#DC2626"
                strokeWidth="1"
                strokeDasharray="2 2"
              />

              {caliperTarget === 'length' ? (
                /* Horizontal Vernier Caliper Measuring L_f */
                <g>
                  {/* Main stainless ruler bar */}
                  <rect
                    x="22"
                    y="108"
                    width="296"
                    height="24"
                    rx="2"
                    fill="#E2E8F0"
                    stroke="#64748B"
                    strokeWidth="1"
                  />
                  {/* Millimeter scale ticks */}
                  {Array.from({ length: 36 }).map((_, idx) => {
                    const tx = 30 + idx * 8;
                    const isMajor = idx % 5 === 0;
                    return (
                      <line
                        key={idx}
                        x1={tx}
                        y1={132}
                        x2={tx}
                        y2={isMajor ? 121 : 126}
                        stroke="#334155"
                        strokeWidth={isMajor ? '1.1' : '0.7'}
                      />
                    );
                  })}

                  {/* Fixed Left Jaw aligned with left gauge mark */}
                  <path
                    d={`M ${benchCenterX - benchLfPx / 2 - 10} 108 L ${benchCenterX - benchLfPx / 2} 108 L ${benchCenterX - benchLfPx / 2} ${benchCenterY - benchUniformHalfW - 3} L ${benchCenterX - benchLfPx / 2 - 10} ${benchCenterY - benchUniformHalfW - 14} Z`}
                    fill="#CBD5E1"
                    stroke="#475569"
                    strokeWidth="1"
                  />

                  {/* Sliding Right Jaw aligned with right gauge mark */}
                  <path
                    d={`M ${benchCenterX + benchLfPx / 2} 108 L ${benchCenterX + benchLfPx / 2 + 12} 108 L ${benchCenterX + benchLfPx / 2 + 12} ${benchCenterY - benchUniformHalfW - 14} L ${benchCenterX + benchLfPx / 2} ${benchCenterY - benchUniformHalfW - 3} Z`}
                    fill="#CBD5E1"
                    stroke="#475569"
                    strokeWidth="1"
                  />

                  {/* Digital Caliper LCD Box */}
                  <rect
                    x={benchCenterX - 54}
                    y="62"
                    width="108"
                    height="36"
                    rx="4"
                    fill="#0F172A"
                    stroke="#334155"
                    strokeWidth="1.2"
                  />
                  <text
                    x={benchCenterX}
                    y="74"
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="7"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    LECTURA L_f (CALIBRADA)
                  </text>
                  <text
                    x={benchCenterX}
                    y="90"
                    textAnchor="middle"
                    fill="#38BDF8"
                    fontSize="13"
                    fontWeight="600"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {snapshot.finalLengthLf.toFixed(2)} mm
                  </text>

                  {/* Span dimension line */}
                  <line
                    x1={benchCenterX - benchLfPx / 2}
                    y1={172}
                    x2={benchCenterX + benchLfPx / 2}
                    y2={172}
                    stroke="#1D4ED8"
                    strokeWidth="1.4"
                  />
                  <text
                    x={benchCenterX}
                    y={166}
                    textAnchor="middle"
                    fill="#1D4ED8"
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    ΔL_f = +{(snapshot.finalLengthLf - geometry.l0).toFixed(2)} mm (A ={' '}
                    {snapshot.elongationAPct.toFixed(1)}%)
                  </text>
                </g>
              ) : (
                /* Vertical Caliper Jaws Measuring Neck Diameter D_f */
                <g>
                  {/* Upper Caliper Jaw touching top of neck */}
                  <path
                    d={`M ${benchCenterX - 6} ${benchCenterY - benchNeckHalfW} L ${benchCenterX + 6} ${benchCenterY - benchNeckHalfW} L ${benchCenterX + 14} 135 L ${benchCenterX - 14} 135 Z`}
                    fill="#CBD5E1"
                    stroke="#475569"
                    strokeWidth="1"
                  />
                  {/* Lower Caliper Jaw touching bottom of neck */}
                  <path
                    d={`M ${benchCenterX - 6} ${benchCenterY + benchNeckHalfW} L ${benchCenterX + 6} ${benchCenterY + benchNeckHalfW} L ${benchCenterX + 14} 308 L ${benchCenterX - 14} 308 Z`}
                    fill="#CBD5E1"
                    stroke="#475569"
                    strokeWidth="1"
                  />

                  {/* Digital Caliper LCD Box */}
                  <rect
                    x={benchCenterX - 60}
                    y="62"
                    width="120"
                    height="36"
                    rx="4"
                    fill="#0F172A"
                    stroke="#334155"
                    strokeWidth="1.2"
                  />
                  <text
                    x={benchCenterX}
                    y="74"
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="7"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    DIÁMETRO DE ESTRICCIÓN D_f
                  </text>
                  <text
                    x={benchCenterX}
                    y="90"
                    textAnchor="middle"
                    fill="#FBBF24"
                    fontSize="13"
                    fontWeight="600"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {snapshot.finalDiameterDf.toFixed(2)} mm
                  </text>

                  {/* Callout arrow */}
                  <text
                    x={benchCenterX}
                    y="124"
                    textAnchor="middle"
                    fill="#B45309"
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    S_f = {snapshot.finalAreaSf.toFixed(1)} mm² · Z ={' '}
                    {snapshot.reductionZPct.toFixed(1)}%
                  </text>
                </g>
              )}
            </svg>

            {/* Concise Post-Fracture Metrology Summary */}
            <div className="w-full max-w-[335px] mt-3 grid grid-cols-2 gap-2 text-sm font-bold text-slate-950">
              <div className="bg-white border border-slate-300 rounded-lg p-2.5">
                <div className="text-slate-950">Alargamiento A%</div>
                <div className="font-mono font-bold text-sm text-slate-950 tabular-nums mt-0.5">
                  {snapshot.elongationAPct.toFixed(2)} %
                </div>
                <div className="font-mono text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                  L_f = {snapshot.finalLengthLf.toFixed(2)} mm
                </div>
              </div>
              <div className="bg-white border border-slate-300 rounded-lg p-2.5">
                <div className="text-slate-950">Estricción Z%</div>
                <div className="font-mono font-bold text-sm text-slate-950 tabular-nums mt-0.5">
                  {snapshot.reductionZPct.toFixed(2)} %
                </div>
                <div className="font-mono text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                  D_f = {snapshot.finalDiameterDf.toFixed(2)} mm
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contextual Bottom Hint inside Machine Panel */}
      <div className="px-4 py-2.5 bg-slate-100 border-t border-slate-300 text-sm font-bold text-slate-950 flex items-center justify-between gap-2">
        {isFractured ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-900 font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Ensayo completado. Inspecciona L_f y D_f o reinicia.
          </span>
        ) : snapshot.phase === 'unloaded_plastic' ? (
          <span>
            Deformación residual permanente:{' '}
            <strong className="font-mono text-slate-950">
              +{(snapshot.residualStrain * geometry.l0).toFixed(2)} mm
            </strong>
          </span>
        ) : snapshot.phase === 'necking' ? (
          <span className="text-amber-950 font-bold">
            Estricción activa en la zona central (diámetro en reducción).
          </span>
        ) : (
          <span>
            S₀ ={' '}
            <strong className="font-mono text-slate-950 tabular-nums">
              {snapshot.s0.toFixed(1)} mm²
            </strong>{' '}
            · Control por desplazamiento
          </span>
        )}
      </div>
    </section>
  );
};
