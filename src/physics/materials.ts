export type MaterialId = 'steel' | 'aluminum' | 'brass' | 'cast_iron';

export type FractureType = 'cup-cone' | 'brittle-flat';

export interface MaterialSpec {
  id: MaterialId;
  name: string;
  shortName: string;
  standard: string;
  category: 'Dúctil' | 'Dúctil moderado' | 'Alta ductilidad' | 'Frágil';
  description: string;
  /** Young's Modulus in GPa */
  youngModulusGPa: number;
  /** Yield strength (Límite elástico) in MPa */
  yieldStrengthMPa: number;
  /** End of yield plateau strain (only for mild carbon steel; equal to yieldStrain otherwise) */
  yieldPlateauEndStrain: number;
  /** Ultimate Tensile Strength (Resistencia a la tracción) in MPa */
  utsMPa: number;
  /** Uniform strain at UTS (onset of necking) — adimensional */
  utsStrain: number;
  /** Nominal engineering stress immediately before fracture in MPa */
  fractureStressMPa: number;
  /** Engineering strain at fracture — adimensional */
  fractureStrain: number;
  /** Hardening curve exponent (controls curvature between yield plateau and UTS) */
  hardeningShape: number;
  /** Necking drop exponent (controls curvature between UTS and fracture) */
  neckingShape: number;
  /** Reduction of area at fracture Z% (0-100) */
  targetReductionAreaPct: number;
  fractureType: FractureType;
  /** Visual metallic palette for SVG specimen rendering */
  visual: {
    baseDark: string;
    midTone: string;
    highlight: string;
    specular: string;
    fractureInner: string;
    curveColor: string;
  };
}

export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  steel: {
    id: 'steel',
    name: 'Acero estructural al carbono',
    shortName: 'Acero A36',
    standard: 'ASTM A36 / S275',
    category: 'Dúctil',
    description:
      'Elevada rigidez, meseta de fluencia bien definida, amplio endurecimiento por deformación y estricción pronunciada con fractura tipo copa-cono.',
    youngModulusGPa: 210,
    yieldStrengthMPa: 250,
    yieldPlateauEndStrain: 0.015,
    utsMPa: 440,
    utsStrain: 0.165,
    fractureStressMPa: 330,
    fractureStrain: 0.28,
    hardeningShape: 0.42,
    neckingShape: 1.65,
    targetReductionAreaPct: 56,
    fractureType: 'cup-cone',
    visual: {
      baseDark: '#334155',
      midTone: '#78889B',
      highlight: '#CBD5E1',
      specular: '#F1F5F9',
      fractureInner: '#475569',
      curveColor: '#1D4ED8',
    },
  },
  aluminum: {
    id: 'aluminum',
    name: 'Aluminio 6061-T6',
    shortName: 'Aluminio 6061',
    standard: 'AA 6061-T6',
    category: 'Dúctil moderado',
    description:
      'Aleación ligera con módulo de Young aproximadamente un tercio del acero, transición elasto-plástica continua y ductilidad moderada.',
    youngModulusGPa: 69,
    yieldStrengthMPa: 276,
    yieldPlateauEndStrain: 276 / 69000,
    utsMPa: 312,
    utsStrain: 0.075,
    fractureStressMPa: 248,
    fractureStrain: 0.128,
    hardeningShape: 0.36,
    neckingShape: 1.7,
    targetReductionAreaPct: 35,
    fractureType: 'cup-cone',
    visual: {
      baseDark: '#64748B',
      midTone: '#B8C4D0',
      highlight: '#E9EFF5',
      specular: '#FFFFFF',
      fractureInner: '#94A3B8',
      curveColor: '#0284C7',
    },
  },
  brass: {
    id: 'brass',
    name: 'Latón de cartuchería',
    shortName: 'Latón C260',
    standard: 'UNS C26000 (70Cu-30Zn)',
    category: 'Alta ductilidad',
    description:
      'Aleación cobre-zinc de estructura cúbica centrada en caras con altísima capacidad de deformación plástica uniforme y notable endurecimiento.',
    youngModulusGPa: 110,
    yieldStrengthMPa: 140,
    yieldPlateauEndStrain: 140 / 110000,
    utsMPa: 345,
    utsStrain: 0.34,
    fractureStressMPa: 235,
    fractureStrain: 0.48,
    hardeningShape: 0.52,
    neckingShape: 1.55,
    targetReductionAreaPct: 62,
    fractureType: 'cup-cone',
    visual: {
      baseDark: '#855A10',
      midTone: '#C8962E',
      highlight: '#F3D06B',
      specular: '#FEF3C7',
      fractureInner: '#A16207',
      curveColor: '#B45309',
    },
  },
  cast_iron: {
    id: 'cast_iron',
    name: 'Hierro fundido gris',
    shortName: 'Fundición Gris',
    standard: 'ASTM A48 Clase 30',
    category: 'Frágil',
    description:
      'Comportamiento marcadamente frágil debido a las láminas de grafito en su microestructura; fractura plana repentina sin estricción apreciable.',
    youngModulusGPa: 105,
    yieldStrengthMPa: 185,
    yieldPlateauEndStrain: 185 / 105000,
    utsMPa: 215,
    utsStrain: 0.0056,
    fractureStressMPa: 211,
    fractureStrain: 0.0062,
    hardeningShape: 0.48,
    neckingShape: 1.5,
    targetReductionAreaPct: 0.9,
    fractureType: 'brittle-flat',
    visual: {
      baseDark: '#1E293B',
      midTone: '#475569',
      highlight: '#64748B',
      specular: '#94A3B8',
      fractureInner: '#334155',
      curveColor: '#475569',
    },
  },
};

export const MATERIAL_LIST: MaterialSpec[] = [
  MATERIALS.steel,
  MATERIALS.aluminum,
  MATERIALS.brass,
  MATERIALS.cast_iron,
];

export interface GlossaryEntry {
  id: string;
  title: string;
  symbol: string;
  formula: string;
  units: string;
  summary: string;
}

export const THEORY_GLOSSARY: Record<string, GlossaryEntry> = {
  stress: {
    id: 'stress',
    title: 'Tensión ingenieril (esfuerzo nominal)',
    symbol: 'σ',
    formula: 'σ = F / S₀',
    units: 'MPa (N/mm²)',
    summary:
      'Fuerza axial instantánea dividida por el área de la sección transversal inicial S₀. Es una propiedad intensiva independiente del tamaño de la probeta.',
  },
  strain: {
    id: 'strain',
    title: 'Deformación unitaria ingenieril',
    symbol: 'ε',
    formula: 'ε = ΔL / L₀ = (L − L₀) / L₀',
    units: 'adimensional (o %)',
    summary:
      'Cambio de longitud relativo de la zona calibrada respecto a su longitud inicial L₀. Permite comparar materiales sin importar cuán larga sea la probeta.',
  },
  area: {
    id: 'area',
    title: 'Sección transversal inicial',
    symbol: 'S₀',
    formula: 'S₀ = π · (D₀ / 2)²',
    units: 'mm²',
    summary:
      'Área circular inicial en la zona calibrada de la probeta cilíndrica antes de aplicar la carga.',
  },
  young: {
    id: 'young',
    title: 'Módulo de Young (Módulo de elasticidad)',
    symbol: 'E',
    formula: 'E = σ / ε   (en zona elástica)',
    units: 'GPa',
    summary:
      'Pendiente de la recta elástica según la Ley de Hooke. Mide la rigidez intrínseca del material frente a deformaciones elásticas reversibles.',
  },
  yield: {
    id: 'yield',
    title: 'Límite elástico (tensión de fluencia)',
    symbol: 'σ_y (LE)',
    formula: 'σ_y = F_y / S₀',
    units: 'MPa',
    summary:
      'Tensión máxima que soporta el material sin sufrir deformación plástica permanente. Por debajo de σ_y, al retirar la carga la probeta recupera su longitud L₀.',
  },
  uts: {
    id: 'uts',
    title: 'Resistencia a la tracción (UTS)',
    symbol: 'σ_R',
    formula: 'σ_R = F_máx / S₀',
    units: 'MPa',
    summary:
      'Tensión nominal máxima del diagrama. En materiales dúctiles marca el inicio de la estricción (encuellamiento localizado) en la zona central.',
  },
  elongation: {
    id: 'elongation',
    title: 'Alargamiento proporcional a rotura',
    symbol: 'A%',
    formula: 'A% = [(L_f − L₀) / L₀] × 100',
    units: '%',
    summary:
      'Medida de ductilidad obtenida al juntar las dos mitades fracturadas y medir la longitud permanente final L_f (descontada la recuperación elástica).',
  },
  reduction: {
    id: 'reduction',
    title: 'Estricción (reducción de área)',
    symbol: 'Z%',
    formula: 'Z% = [(S₀ − S_f) / S₀] × 100',
    units: '%',
    summary:
      'Disminución porcentual del área en el cuello de fractura respecto a la sección inicial S₀. Es muy alta en metales dúctiles y casi nula en frágiles.',
  },
  toughness: {
    id: 'toughness',
    title: 'Tenacidad por unidad de volumen',
    symbol: 'U_T',
    formula: 'U_T = ∫₀^{ε_f} σ(ε) dε',
    units: 'MJ/m³',
    summary:
      'Energía mecánica absorbida por unidad de volumen hasta la rotura. Geométricamente corresponde al área total bajo la curva tensión-deformación.',
  },
  unloading: {
    id: 'unloading',
    title: 'Descarga elástica y deformación residual',
    symbol: 'ε_pl',
    formula: 'ε_pl = ε_máx − (σ_máx / E)',
    units: 'adimensional (o %)',
    summary:
      'Al retirar la fuerza en zona plástica, la descarga sigue una recta paralela a la pendiente elástica E. Se recupera ε_el = σ/E y persiste la deformación plástica ε_pl.',
  },
  force: {
    id: 'force',
    title: 'Fuerza axial de tracción',
    symbol: 'F',
    formula: 'F = σ · S₀',
    units: 'kN',
    summary:
      'Carga registrada por la célula de carga de la Máquina Universal. A diferencia de σ, depende directamente del diámetro D₀ de la probeta.',
  },
  deltaL: {
    id: 'deltaL',
    title: 'Alargamiento absoluto',
    symbol: 'ΔL',
    formula: 'ΔL = L − L₀ = ε · L₀',
    units: 'mm',
    summary:
      'Incremento absoluto de la distancia entre las dos marcas de longitud calibrada. Depende proporcionalmente de L₀.',
  },
};
