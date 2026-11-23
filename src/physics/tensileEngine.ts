import { MaterialSpec } from './materials';

export type TensilePhase =
  | 'idle'
  | 'elastic'
  | 'plastic_uniform'
  | 'necking'
  | 'unloading_elastic'
  | 'unloading_plastic'
  | 'unloaded_plastic'
  | 'fractured';

export interface SpecimenGeometry {
  /** Initial diameter D0 in mm */
  d0: number;
  /** Initial gauge length L0 in mm */
  l0: number;
}

export interface CurvePoint {
  strain: number;
  stress: number;
  deltaL: number;
  forceKN: number;
}

export interface SimulationSnapshot {
  material: MaterialSpec;
  geometry: SpecimenGeometry;
  s0: number;
  /** Current engineering strain (adimensional) */
  strain: number;
  /** Maximum engineering strain reached along the primary monotonic curve */
  maxStrainReached: number;
  /** Stress at maxStrainReached (MPa) */
  maxReachedStress: number;
  /** Current nominal engineering stress (MPa) */
  stress: number;
  /** Current axial force F (kN) */
  forceKN: number;
  /** Current elongation Delta L (mm) */
  deltaL: number;
  /** Current gauge length L = L0 + Delta L (mm) */
  currentLength: number;
  /** Instantaneous central diameter D (mm) */
  centralDiameter: number;
  /** Instantaneous uniform gauge diameter away from the neck (mm) */
  uniformDiameter: number;
  /** Necking intensity factor [0..1] for specimen rendering */
  neckingFactor: number;
  /** Permanent plastic residual strain if load is removed right now */
  residualStrain: number;
  /** Recoverable elastic strain from maxStrainReached */
  elasticRecoveryStrain: number;
  /** True if specimen has fractured */
  isFractured: boolean;
  /** True if currently below the primary monotonic curve */
  isUnloadedOrUnloading: boolean;
  /** Current descriptive metallurgical phase */
  phase: TensilePhase;
  phaseLabel: string;
  /** Integrated toughness up to maxStrainReached in MJ/m^3 */
  toughnessMJm3: number;
  /** Absorbed mechanical work up to maxStrainReached in Joules */
  workJoules: number;
  /** Post-fracture final permanent gauge length L_f (mm) */
  finalLengthLf: number;
  /** Post-fracture final neck diameter D_f (mm) */
  finalDiameterDf: number;
  /** Post-fracture final area S_f (mm^2) */
  finalAreaSf: number;
  /** Proportional elongation after fracture A% */
  elongationAPct: number;
  /** Reduction of area after fracture Z% */
  reductionZPct: number;
  /** Milestone discovery flags */
  discoveredYoung: boolean;
  discoveredYield: boolean;
  discoveredUTS: boolean;
  discoveredFracture: boolean;
}

/** Initial cross-sectional area S0 in mm^2 */
export function computeArea(diameterMm: number): number {
  const r = diameterMm / 2;
  return Math.PI * r * r;
}

/** Elastic yield strain epsilon_y = sigma_y / E */
export function getYieldStrain(material: MaterialSpec): number {
  return material.yieldStrengthMPa / (material.youngModulusGPa * 1000);
}

/**
 * Exact monotonic engineering stress sigma(epsilon) in MPa.
 * - Linear elastic region: sigma = E * epsilon
 * - Optional yield plateau (structural carbon steel) with subtle Lüders ripple
 * - Smooth strain-hardening region up to UTS with zero slope at epsilon_u
 * - Smooth post-UTS necking drop down to fracture stress
 */
export function evaluateMonotonicStress(
  material: MaterialSpec,
  strain: number
): number {
  if (strain <= 0) return 0;

  const E_MPa = material.youngModulusGPa * 1000;
  const epsY = getYieldStrain(material);
  const epsP = Math.max(epsY, material.yieldPlateauEndStrain);
  const epsU = material.utsStrain;
  const epsF = material.fractureStrain;

  // 1. Elastic linear zone (Hooke's law)
  if (strain <= epsY) {
    return E_MPa * strain;
  }

  // 2. Yield plateau (for structural mild steel)
  if (strain <= epsP && epsP > epsY + 1e-6) {
    const t = (strain - epsY) / (epsP - epsY);
    // Subtle upper/lower yield drop + Lüders band wave (realistic mild steel signature)
    const upperDrop = 8 * Math.exp(-t * 9) * (1 - t);
    const ludersRipple = 2.2 * Math.sin(t * Math.PI * 5) * Math.sin(t * Math.PI);
    return material.yieldStrengthMPa + upperDrop + ludersRipple;
  }

  // 3. Uniform plastic strain-hardening region [epsP, epsU]
  // Uses f(u) = 1 - (1 - u)^q where q > 1 gives f(0)=0, f(1)=1, and f'(1)=0 (smooth peak at UTS)
  if (strain <= epsU) {
    const u = Math.min(1, Math.max(0, (strain - epsP) / Math.max(1e-6, epsU - epsP)));
    const q = 1 / Math.max(0.15, material.hardeningShape);
    const smoothCurve = 1 - Math.pow(1 - u, q);
    return (
      material.yieldStrengthMPa +
      (material.utsMPa - material.yieldStrengthMPa) * smoothCurve
    );
  }

  // 4. Necking region [epsU, epsF]
  // Starts with zero derivative at UTS and falls smoothly to fractureStressMPa
  if (strain <= epsF) {
    const v = Math.min(1, Math.max(0, (strain - epsU) / Math.max(1e-6, epsF - epsU)));
    const drop = Math.pow(v, material.neckingShape);
    return material.utsMPa - (material.utsMPa - material.fractureStressMPa) * drop;
  }

  return 0;
}

/**
 * Computes instantaneous uniform diameter and central (necked) diameter in mm.
 */
export function computeDiameters(
  material: MaterialSpec,
  d0: number,
  strain: number,
  maxStrainReached: number
): { uniformDiameter: number; centralDiameter: number; neckingFactor: number } {
  const epsY = getYieldStrain(material);
  const epsU = material.utsStrain;
  const epsF = material.fractureStrain;

  // Effective elastic strain for Poisson contraction (~0.30 for metals)
  const poisson = 0.3;
  const clampedForUniform = Math.min(strain, epsU);
  const elasticPart = Math.min(clampedForUniform, epsY);
  const plasticUniformPart = Math.max(0, Math.min(maxStrainReached, epsU) - epsY);

  // Uniform diameter outside neck (Poisson elastic + volume-conserving plastic)
  const uniformFactor =
    (1 - poisson * elasticPart) / Math.sqrt(1 + plasticUniformPart);
  const uniformDiameter = d0 * uniformFactor;

  // Target final diameter at fracture from Z% = (S0 - Sf) / S0
  const targetDf = d0 * Math.sqrt(1 - material.targetReductionAreaPct / 100);

  if (maxStrainReached <= epsU || material.fractureType === 'brittle-flat') {
    const microBrittleNeck =
      material.fractureType === 'brittle-flat' && maxStrainReached > epsU
        ? ((maxStrainReached - epsU) / Math.max(1e-6, epsF - epsU)) * 0.005
        : 0;
    return {
      uniformDiameter,
      centralDiameter: uniformDiameter * (1 - microBrittleNeck),
      neckingFactor: 0,
    };
  }

  // Localized necking progresses smoothly from uniformDiameter at epsU to targetDf at epsF
  const neckProgress = Math.min(
    1,
    Math.max(0, (maxStrainReached - epsU) / Math.max(1e-6, epsF - epsU))
  );
  // Smooth S-like / power ramp for realistic neck onset
  const neckWeight = Math.pow(neckProgress, 0.85);
  const centralDiameter =
    uniformDiameter - (uniformDiameter - Math.min(uniformDiameter, targetDf)) * neckWeight;

  return {
    uniformDiameter,
    centralDiameter,
    neckingFactor: neckWeight,
  };
}

/**
 * Numerical integration (trapezoidal rule) of area under monotonic stress-strain curve
 * from 0 to targetStrain. Since 1 MPa = 1 MJ/m^3, integral(sigma_MPa * d_epsilon) is directly in MJ/m^3.
 */
export function integrateToughnessMJm3(
  material: MaterialSpec,
  targetStrain: number,
  steps = 240
): number {
  const clamped = Math.min(Math.max(0, targetStrain), material.fractureStrain);
  if (clamped <= 0) return 0;

  const epsY = getYieldStrain(material);
  let area = 0;

  // Integrate elastic region exactly first so tiny elastic triangles have zero numerical error
  if (clamped <= epsY) {
    const s = evaluateMonotonicStress(material, clamped);
    return 0.5 * s * clamped;
  }

  area += 0.5 * material.yieldStrengthMPa * epsY;

  // Integrate plastic & necking region from epsY to clamped
  const span = clamped - epsY;
  const n = Math.max(40, steps);
  const dx = span / n;
  let prevY = evaluateMonotonicStress(material, epsY);
  for (let i = 1; i <= n; i++) {
    const x = epsY + i * dx;
    const currY = evaluateMonotonicStress(material, x);
    area += 0.5 * (prevY + currY) * dx;
    prevY = currY;
  }

  return area;
}

/**
 * Generates sampled points along the primary monotonic curve up to `maxStrain`.
 */
export function sampleMonotonicCurve(
  material: MaterialSpec,
  geometry: SpecimenGeometry,
  maxStrain: number
): CurvePoint[] {
  const clamped = Math.min(Math.max(0, maxStrain), material.fractureStrain);
  const s0 = computeArea(geometry.d0);
  const epsY = getYieldStrain(material);
  const epsP = Math.max(epsY, material.yieldPlateauEndStrain);
  const epsU = material.utsStrain;

  const strains = new Set<number>([0]);

  const addSegment = (start: number, end: number, count: number) => {
    if (end <= start) return;
    const actualEnd = Math.min(end, clamped);
    if (actualEnd <= start) return;
    for (let i = 1; i <= count; i++) {
      strains.add(start + ((actualEnd - start) * i) / count);
    }
  };

  addSegment(0, epsY, 16);
  if (epsP > epsY + 1e-6) {
    addSegment(epsY, epsP, 20);
  }
  addSegment(epsP, epsU, 70);
  addSegment(epsU, material.fractureStrain, 60);
  strains.add(clamped);

  const sorted = Array.from(strains)
    .filter((e) => e <= clamped + 1e-9)
    .sort((a, b) => a - b);

  return sorted.map((strain) => {
    const stress = evaluateMonotonicStress(material, strain);
    return {
      strain,
      stress,
      deltaL: strain * geometry.l0,
      forceKN: (stress * s0) / 1000,
    };
  });
}

/**
 * Computes full simulation snapshot for given current strain, max strain reached, and fracture state.
 */
export function computeSnapshot(
  material: MaterialSpec,
  geometry: SpecimenGeometry,
  currentStrain: number,
  maxStrainReached: number,
  isFractured: boolean
): SimulationSnapshot {
  const s0 = computeArea(geometry.d0);
  const E_MPa = material.youngModulusGPa * 1000;
  const epsY = getYieldStrain(material);
  const epsU = material.utsStrain;
  const epsF = material.fractureStrain;

  const clampedMax = Math.min(Math.max(0, maxStrainReached), epsF);
  const maxReachedStress = evaluateMonotonicStress(material, clampedMax);

  // Permanent residual strain if unloaded from clampedMax along elastic slope E
  const residualStrain =
    clampedMax <= epsY
      ? 0
      : Math.max(0, clampedMax - maxReachedStress / E_MPa);
  const elasticRecoveryStrain = Math.max(0, clampedMax - residualStrain);

  // Post-fracture theoretical permanent metrics (after elastic snap-back of the two halves)
  const fractureResidualStrain = Math.max(
    0,
    epsF - material.fractureStressMPa / E_MPa
  );
  const finalLengthLf = geometry.l0 * (1 + fractureResidualStrain);
  const finalDiameterDf =
    geometry.d0 * Math.sqrt(1 - material.targetReductionAreaPct / 100);
  const finalAreaSf = computeArea(finalDiameterDf);
  const elongationAPct = ((finalLengthLf - geometry.l0) / geometry.l0) * 100;
  const reductionZPct = ((s0 - finalAreaSf) / s0) * 100;

  let strain = currentStrain;
  let stress = 0;
  let isUnloadedOrUnloading = false;

  if (isFractured) {
    // Once fractured, load drops instantaneously to 0; halves recoil elastically
    strain = fractureResidualStrain;
    stress = 0;
  } else if (strain >= clampedMax - 1e-7) {
    // Loading along primary monotonic curve
    strain = Math.min(strain, epsF);
    stress = evaluateMonotonicStress(material, strain);
  } else {
    // Unloading / Reloading along line parallel to Young's modulus E
    isUnloadedOrUnloading = true;
    const minStrain = residualStrain;
    strain = Math.max(minStrain, strain);
    if (clampedMax <= epsY) {
      stress = Math.max(0, E_MPa * strain);
    } else {
      stress = Math.max(0, maxReachedStress - E_MPa * (clampedMax - strain));
    }
  }

  const forceKN = (stress * s0) / 1000;
  const deltaL = strain * geometry.l0;
  const currentLength = geometry.l0 + deltaL;

  const { uniformDiameter, centralDiameter, neckingFactor } = computeDiameters(
    material,
    geometry.d0,
    strain,
    isFractured ? epsF : clampedMax
  );

  // Determine phase and Spanish label
  let phase: TensilePhase = 'idle';
  let phaseLabel = 'En reposo (sin carga)';

  if (isFractured) {
    phase = 'fractured';
    phaseLabel = 'Probeta Fracturada';
  } else if (clampedMax < 1e-6 && strain < 1e-6) {
    phase = 'idle';
    phaseLabel = 'En reposo (sin carga)';
  } else if (isUnloadedOrUnloading) {
    if (stress <= 0.5 && residualStrain > 1e-5) {
      phase = 'unloaded_plastic';
      phaseLabel = 'Descargada (Deformación Plástica Residual)';
    } else if (clampedMax <= epsY) {
      phase = 'unloading_elastic';
      phaseLabel = 'Descarga Elástica (Recuperación Reversible)';
    } else {
      phase = 'unloading_plastic';
      phaseLabel = 'Descarga Elástica desde Zona Plástica';
    }
  } else if (strain <= epsY + 1e-7) {
    phase = 'elastic';
    phaseLabel = 'Zona Elástica';
  } else if (strain <= epsU + 1e-7) {
    phase = 'plastic_uniform';
    phaseLabel = 'Zona Plástica Uniforme';
  } else {
    phase = 'necking';
    phaseLabel =
      material.fractureType === 'brittle-flat'
        ? 'Microfisuración Inminente'
        : 'Estricción / Encuellamiento';
  }

  const toughnessMJm3 = integrateToughnessMJm3(
    material,
    isFractured ? epsF : clampedMax
  );
  // Work in Joules = Toughness [MJ/m^3 = N/mm^2] * Volume [mm^3] * 1e-3
  const volumeMm3 = s0 * geometry.l0;
  const workJoules = toughnessMJm3 * volumeMm3 * 1e-3;

  return {
    material,
    geometry,
    s0,
    strain,
    maxStrainReached: isFractured ? epsF : clampedMax,
    maxReachedStress,
    stress,
    forceKN,
    deltaL,
    currentLength,
    centralDiameter: isFractured ? finalDiameterDf : centralDiameter,
    uniformDiameter,
    neckingFactor: isFractured && material.fractureType !== 'brittle-flat' ? 1 : neckingFactor,
    residualStrain: isFractured ? fractureResidualStrain : residualStrain,
    elasticRecoveryStrain,
    isFractured,
    isUnloadedOrUnloading,
    phase,
    phaseLabel,
    toughnessMJm3,
    workJoules,
    finalLengthLf,
    finalDiameterDf,
    finalAreaSf,
    elongationAPct,
    reductionZPct,
    discoveredYoung: clampedMax >= epsY * 0.25,
    discoveredYield: clampedMax >= epsY * 0.999,
    discoveredUTS: clampedMax >= epsU * 0.999,
    discoveredFracture: isFractured,
  };
}

/**
 * Piecewise progress mapping [0..1000] <-> strain [0..fractureStrain]
 * Gives students comfortable manual & automatic resolution in the Elastic zone,
 * Uniform Plastic zone, and Necking zone without cramping the elastic line into 1px.
 */
export function getProgressBreakpoints(material: MaterialSpec): {
  pYield: number;
  pUTS: number;
  pFracture: number;
} {
  if (material.fractureType === 'brittle-flat') {
    return { pYield: 520, pUTS: 900, pFracture: 1000 };
  }
  return { pYield: 180, pUTS: 680, pFracture: 1000 };
}

export function progressToStrain(material: MaterialSpec, progress: number): number {
  const p = Math.min(1000, Math.max(0, progress));
  const epsY = getYieldStrain(material);
  const epsU = material.utsStrain;
  const epsF = material.fractureStrain;
  const { pYield, pUTS, pFracture } = getProgressBreakpoints(material);

  if (p <= pYield) {
    return (p / pYield) * epsY;
  }
  if (p <= pUTS) {
    const t = (p - pYield) / (pUTS - pYield);
    return epsY + t * (epsU - epsY);
  }
  const t = (p - pUTS) / (pFracture - pUTS);
  return epsU + t * (epsF - epsU);
}

export function strainToProgress(material: MaterialSpec, strain: number): number {
  const epsY = getYieldStrain(material);
  const epsU = material.utsStrain;
  const epsF = material.fractureStrain;
  const s = Math.min(epsF, Math.max(0, strain));
  const { pYield, pUTS, pFracture } = getProgressBreakpoints(material);

  if (s <= epsY) {
    return (s / Math.max(1e-9, epsY)) * pYield;
  }
  if (s <= epsU) {
    return pYield + ((s - epsY) / Math.max(1e-9, epsU - epsY)) * (pUTS - pYield);
  }
  return pUTS + ((s - epsU) / Math.max(1e-9, epsF - epsU)) * (pFracture - pUTS);
}

/**
 * Generates a downloadable CSV report of the tensile test.
 */
export function buildCsvReport(
  snapshot: SimulationSnapshot,
  history: Array<{
    step: number;
    deltaL: number;
    forceKN: number;
    strain: number;
    stress: number;
    diameter: number;
    phase: string;
  }>
): string {
  const { material, geometry, s0 } = snapshot;
  const lines: string[] = [
    `# LabTraccion FINGLUZ - Registro de Ensayo de Traccion (Prof. Ing. Jose Manuel Faria)`,
    `# Material,"${material.name} (${material.standard})"`,
    `# Diametro inicial D0 (mm),${geometry.d0.toFixed(2)}`,
    `# Longitud calibrada L0 (mm),${geometry.l0.toFixed(2)}`,
    `# Seccion inicial S0 (mm2),${s0.toFixed(2)}`,
    `# Modulo de Young E (GPa),${snapshot.discoveredYoung ? material.youngModulusGPa.toFixed(1) : 'N/D'}`,
    `# Limite elastico sigma_y (MPa),${snapshot.discoveredYield ? material.yieldStrengthMPa.toFixed(1) : 'N/D'}`,
    `# Resistencia a la traccion sigma_R (MPa),${snapshot.discoveredUTS ? material.utsMPa.toFixed(1) : 'N/D'}`,
    `# Alargamiento proporcional A (%),${snapshot.discoveredFracture ? snapshot.elongationAPct.toFixed(2) : 'N/D'}`,
    `# Estriccion Z (%),${snapshot.discoveredFracture ? snapshot.reductionZPct.toFixed(2) : 'N/D'}`,
    `# Tenacidad (MJ/m3),${snapshot.toughnessMJm3.toFixed(2)}`,
    '',
    'Paso,Alargamiento_mm,Fuerza_kN,Deformacion_unitaria,Deformacion_pct,Tension_MPa,Diametro_central_mm,Fase',
  ];

  for (const row of history) {
    lines.push(
      [
        row.step,
        row.deltaL.toFixed(4),
        row.forceKN.toFixed(4),
        row.strain.toFixed(6),
        (row.strain * 100).toFixed(4),
        row.stress.toFixed(2),
        row.diameter.toFixed(3),
        `"${row.phase}"`,
      ].join(',')
    );
  }

  return lines.join('\n');
}
