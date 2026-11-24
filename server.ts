import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Content,
  FunctionDeclaration,
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

interface ChatMessagePayload {
  role: 'user' | 'model';
  text: string;
}

interface PinnedRefContext {
  materialName: string;
  d0: number;
  l0: number;
  s0: number;
}

interface LabContextPayload {
  materialName: string;
  materialStandard: string;
  materialCategory: string;
  fractureType: 'cup-cone' | 'brittle-flat';
  d0: number;
  l0: number;
  s0: number;
  phase: string;
  phaseLabel: string;
  chartMode: 'stress-strain' | 'force-elongation';
  inspectionMode: boolean;
  showToughnessArea: boolean;
  forceKN: number;
  deltaL: number;
  currentLength: number;
  stressMPa: number;
  strainPct: number;
  maxStrainReachedPct: number;
  maxReachedStressMPa: number;
  uniformDiameter: number;
  centralDiameter: number;
  neckingFactor: number;
  residualStrainPct: number;
  elasticRecoveryStrainPct: number;
  isUnloadedOrUnloading: boolean;
  isFractured: boolean;
  youngModulusGPa: number | null;
  yieldStrengthMPa: number | null;
  utsMPa: number | null;
  finalLengthLf: number | null;
  finalDiameterDf: number | null;
  finalAreaSf: number | null;
  elongationAPct: number | null;
  reductionZPct: number | null;
  toughnessMJm3: number;
  workJoules: number;
  pinnedReference: PinnedRefContext | null;
}

export interface SimulatorActionPayload {
  materialId?: 'steel' | 'aluminum' | 'brass' | 'cast_iron';
  d0?: number;
  l0?: number;
  action?:
    | 'play'
    | 'pause'
    | 'unload'
    | 'reset'
    | 'pin_reference'
    | 'clear_reference';
  chartMode?: 'stress-strain' | 'force-elongation';
  showToughnessArea?: boolean;
  showUnloadingGuide?: boolean;
  inspectionMode?: boolean;
}

const controlSimulatorDeclaration: FunctionDeclaration = {
  name: 'controlSimulator',
  description:
    'Controla directamente el simulador de ensayo de tracción LabTracción FINGLUZ cuando el estudiante pide cambiar el material, ajustar dimensiones D0/L0, iniciar o pausar el ensayo automático, descargar la fuerza a 0, reiniciar la probeta, cambiar el modo de gráfica (σ-ε o F-ΔL), sombrear la tenacidad, mostrar la recta de descarga elástica, fijar referencia o abrir el calibrador post-rotura.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      materialId: {
        type: Type.STRING,
        description:
          'Material a montar en la máquina: "steel" (Acero A36), "aluminum" (Aluminio 6061-T6), "brass" (Latón C260) o "cast_iron" (Hierro fundido gris).',
      },
      d0: {
        type: Type.NUMBER,
        description:
          'Diámetro inicial de la probeta en mm (entre 6 y 20, paso 0.5).',
      },
      l0: {
        type: Type.NUMBER,
        description:
          'Longitud calibrada inicial en mm (entre 25 y 100, paso 5).',
      },
      action: {
        type: Type.STRING,
        description:
          'Acción operativa sobre la máquina: "play" (iniciar ensayo automático), "pause" (pausar), "unload" (descargar fuerza a 0 siguiendo pendiente E), "reset" (reiniciar probeta), "pin_reference" (fijar curva actual como referencia), "clear_reference" (quitar curva de referencia).',
      },
      chartMode: {
        type: Type.STRING,
        description:
          'Modo de diagrama a mostrar: "stress-strain" (σ vs ε) o "force-elongation" (F vs ΔL).',
      },
      showToughnessArea: {
        type: Type.BOOLEAN,
        description:
          'Activa o desactiva el sombreado del área bajo la curva (tenacidad).',
      },
      showUnloadingGuide: {
        type: Type.BOOLEAN,
        description:
          'Muestra u oculta la recta paralela de descarga elástica de pendiente E.',
      },
      inspectionMode: {
        type: Type.BOOLEAN,
        description:
          'Activa el calibrador Vernier virtual post-rotura (solo cuando la probeta está fracturada).',
      },
    },
  },
};

function sanitizeActions(
  raw: Record<string, unknown> | undefined
): SimulatorActionPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: SimulatorActionPayload = {};

  if (
    raw.materialId === 'steel' ||
    raw.materialId === 'aluminum' ||
    raw.materialId === 'brass' ||
    raw.materialId === 'cast_iron'
  ) {
    out.materialId = raw.materialId;
  }

  if (typeof raw.d0 === 'number' && Number.isFinite(raw.d0)) {
    const clamped = Math.min(20, Math.max(6, Math.round(raw.d0 * 2) / 2));
    out.d0 = clamped;
  }

  if (typeof raw.l0 === 'number' && Number.isFinite(raw.l0)) {
    const clamped = Math.min(100, Math.max(25, Math.round(raw.l0 / 5) * 5));
    out.l0 = clamped;
  }

  if (
    raw.action === 'play' ||
    raw.action === 'pause' ||
    raw.action === 'unload' ||
    raw.action === 'reset' ||
    raw.action === 'pin_reference' ||
    raw.action === 'clear_reference'
  ) {
    out.action = raw.action;
  }

  if (
    raw.chartMode === 'stress-strain' ||
    raw.chartMode === 'force-elongation'
  ) {
    out.chartMode = raw.chartMode;
  }

  if (typeof raw.showToughnessArea === 'boolean') {
    out.showToughnessArea = raw.showToughnessArea;
  }
  if (typeof raw.showUnloadingGuide === 'boolean') {
    out.showUnloadingGuide = raw.showUnloadingGuide;
  }
  if (typeof raw.inspectionMode === 'boolean') {
    out.inspectionMode = raw.inspectionMode;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function buildSystemInstruction(ctx?: LabContextPayload): string {
  const basePrompt = `Eres el profesor asistente interactivo de Ciencia de los Materiales del simulador **LabTracción FINGLUZ** (Facultad de Ingeniería de la Universidad del Zulia, desarrollado por el Prof. Ing. José Manuel Faría).

Tu rol es ayudar a estudiantes de ingeniería respondiendo de forma **asertiva, clara, precisa y pedagógica** sobre el ensayo de tracción uniaxial, analizando directamente los datos en vivo del simulador y ejecutando acciones mediante la herramienta controlSimulator cuando el estudiante te pida operar o configurar el ensayo.

Reglas estrictas de estilo y formato:
1. Responde siempre en español técnico claro, directo y bien estructurado.
2. **NO uses sintaxis LaTeX** (nunca escribas signos de dólar $, ni \\sigma, \\varepsilon, \\Delta, \\text{}, \\frac{}). Usa directamente símbolos Unicode legibles: σ, ε, ΔL, S₀, D₀, L₀, L_f, D_f, S_f, σ_y, σ_R, E, A%, Z%, U_T, π, ×, ·, ≈, ≤, ≥, MPa, GPa, kN, mm, mm², MJ/m³, J.
3. Sé asertivo y concreto: cuando el estudiante consulte sobre su ensayo, cita explícitamente los valores reales actuales de su probeta y explica la causa física (Ley de Hooke, movimiento de dislocaciones, conservación de volumen, endurecimiento por deformación, criterio de Considère / estricción, fractura copa-cono o fractura frágil plana).
4. Si el estudiante pide cambiar material, cambiar D₀ o L₀, iniciar/pausar, descargar a 0, reiniciar, cambiar la gráfica (σ-ε / F-ΔL), sombrear la tenacidad o abrir el calibrador post-rotura, llama a la función controlSimulator y explica claramente qué debe observar el estudiante.
5. Mantén respuestas concisas y fáciles de leer (párrafos cortos o viñetas con negritas en los conceptos clave).
6. Si el estudiante pregunta algo fuera de Ciencia de los Materiales o del ensayo de tracción, reconduce amablemente la conversación hacia el laboratorio.`;

  if (!ctx) return basePrompt;

  const refLine = ctx.pinnedReference
    ? `- Curva de referencia fijada en gráfica: ${ctx.pinnedReference.materialName} con D₀ = ${ctx.pinnedReference.d0.toFixed(1)} mm, L₀ = ${ctx.pinnedReference.l0.toFixed(0)} mm, S₀ = ${ctx.pinnedReference.s0.toFixed(2)} mm².`
    : '- Curva de referencia fijada: ninguna.';

  const fractureLine = ctx.isFractured
    ? `- Probeta FRACTURADA (${ctx.fractureType === 'cup-cone' ? 'morfología dúctil copa-cono' : 'morfología frágil plana'}). Medidas post-rotura: L_f = ${ctx.finalLengthLf?.toFixed(2)} mm, D_f = ${ctx.finalDiameterDf?.toFixed(2)} mm, S_f = ${ctx.finalAreaSf?.toFixed(2)} mm², A% = ${ctx.elongationAPct?.toFixed(2)}%, Z% = ${ctx.reductionZPct?.toFixed(2)}%.`
    : `- Probeta íntegra (no fracturada). ${ctx.neckingFactor > 0.05 ? `Estricción activa (intensidad ${(ctx.neckingFactor * 100).toFixed(0)}%, diámetro en cuello ${ctx.centralDiameter.toFixed(2)} mm frente a diámetro uniforme ${ctx.uniformDiameter.toFixed(2)} mm).` : 'Sin estricción localizada aún.'}`;

  const unloadLine = ctx.isUnloadedOrUnloading
    ? `- Estado de descarga/recarga: ACTIVO sobre la recta paralela de pendiente E. Máximo alcanzado previo: ε_máx = ${ctx.maxStrainReachedPct.toFixed(2)}%, σ_máx = ${ctx.maxReachedStressMPa.toFixed(1)} MPa. Recuperación elástica ε_el = ${ctx.elasticRecoveryStrainPct.toFixed(2)}%, deformación plástica residual permanente ε_pl = ${ctx.residualStrainPct.toFixed(2)}%.`
    : `- Deformación máxima alcanzada: ε_máx = ${ctx.maxStrainReachedPct.toFixed(2)}% (σ_máx = ${ctx.maxReachedStressMPa.toFixed(1)} MPa). Si se descargara ahora, la deformación residual sería ε_pl = ${ctx.residualStrainPct.toFixed(2)}%.`;

  return `${basePrompt}

=== TELEMETRÍA EN VIVO DEL SIMULADOR LABTRACCIÓN FINGLUZ ===
- Material seleccionado: ${ctx.materialName} (${ctx.materialStandard} · ${ctx.materialCategory})
- Geometría inicial de la probeta: D₀ = ${ctx.d0.toFixed(1)} mm | L₀ = ${ctx.l0.toFixed(0)} mm | S₀ = ${ctx.s0.toFixed(2)} mm²
- Vista actual: Gráfica en modo ${ctx.chartMode === 'stress-strain' ? 'Tensión – Deformación (σ vs ε)' : 'Fuerza – Alargamiento (F vs ΔL)'}${ctx.showToughnessArea ? ' (área de tenacidad sombreada)' : ''}${ctx.inspectionMode ? ' | Modo Banco de Metrología Post-Rotura (Calibrador Vernier activo)' : ''}
- Fase metalúrgica actual: ${ctx.phaseLabel}
- Lecturas instantáneas: F = ${ctx.forceKN.toFixed(2)} kN | ΔL = ${ctx.deltaL.toFixed(2)} mm (L = ${ctx.currentLength.toFixed(2)} mm) | σ = ${ctx.stressMPa.toFixed(1)} MPa | ε = ${ctx.strainPct.toFixed(2)}% | D_central = ${ctx.centralDiameter.toFixed(2)} mm
${unloadLine}
${fractureLine}
- Propiedades mecánicas reveladas en la tabla:
  * Módulo de Young (E): ${ctx.youngModulusGPa !== null ? `${ctx.youngModulusGPa.toFixed(1)} GPa` : 'aún no determinado (ensayo en reposo)'}
  * Límite elástico (σ_y): ${ctx.yieldStrengthMPa !== null ? `${ctx.yieldStrengthMPa.toFixed(1)} MPa` : 'aún no superado'}
  * Resistencia a la tracción (σ_R / UTS): ${ctx.utsMPa !== null ? `${ctx.utsMPa.toFixed(1)} MPa` : 'aún no alcanzada'}
  * Tenacidad acumulada (U_T): ${ctx.toughnessMJm3.toFixed(2)} MJ/m³ (Trabajo absorbido: ${ctx.workJoules.toFixed(1)} J)
${refLine}`;
}

function normalizeConversation(messages: ChatMessagePayload[]): Content[] {
  const valid = messages
    .filter(
      (m): m is ChatMessagePayload =>
        (m.role === 'user' || m.role === 'model') &&
        typeof m.text === 'string' &&
        m.text.trim().length > 0
    )
    .slice(-16);

  let startIdx = 0;
  while (startIdx < valid.length && valid[startIdx].role !== 'user') {
    startIdx++;
  }

  const normalized: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (let i = startIdx; i < valid.length; i++) {
    const item = valid[i];
    const cleanText = item.text.trim().slice(0, 3000);
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === item.role) {
      prev.text = `${prev.text}\n\n${cleanText}`.slice(0, 4000);
    } else {
      normalized.push({ role: item.role, text: cleanText });
    }
  }

  return normalized.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getErrorStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const num = Number((err as { status?: number }).status);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
}

function isRetryableError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (
    status &&
    (status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504)
  ) {
    return true;
  }
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
    const msg = err.message;
    if (
      msg.includes('UNAVAILABLE') ||
      msg.includes('DEADLINE_EXCEEDED') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('fetch failed') ||
      msg.includes('EMPTY_MODEL_RESPONSE')
    ) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callModelOnce(
  ai: GoogleGenAI,
  model: string,
  contents: Content[],
  systemInstruction: string,
  timeoutMs: number,
  useLowThinking: boolean
): Promise<{ reply: string; actions?: SimulatorActionPayload }> {
  const config: {
    systemInstruction: string;
    abortSignal: AbortSignal;
    tools: Array<{ functionDeclarations: FunctionDeclaration[] }>;
    thinkingConfig?: { thinkingLevel: ThinkingLevel };
  } = {
    systemInstruction,
    abortSignal: AbortSignal.timeout(timeoutMs),
    tools: [{ functionDeclarations: [controlSimulatorDeclaration] }],
  };

  if (useLowThinking && model === PRIMARY_MODEL) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config,
  });

  const functionCall = response.functionCalls?.find(
    (fc) => fc.name === 'controlSimulator'
  );
  const actions = sanitizeActions(
    functionCall?.args as Record<string, unknown> | undefined
  );

  let replyText = response.text?.trim() ?? '';

  // If Gemini invoked controlSimulator without accompanying prose, complete turn 2 with functionResponse
  if (functionCall && !replyText) {
    const previousContent = response.candidates?.[0]?.content;
    if (previousContent) {
      const followUp = await ai.models.generateContent({
        model,
        contents: [
          ...contents,
          previousContent,
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: functionCall.id,
                  name: functionCall.name,
                  response: {
                    status: 'applied',
                    appliedActions: actions ?? {},
                  },
                },
              },
            ],
          },
        ],
        config: {
          systemInstruction,
          abortSignal: AbortSignal.timeout(timeoutMs),
          tools: [{ functionDeclarations: [controlSimulatorDeclaration] }],
        },
      });
      replyText = followUp.text?.trim() ?? '';
    }
  }

  if (!replyText && actions) {
    replyText =
      'He aplicado los ajustes solicitados directamente en el simulador LabTracción FINGLUZ. Observa la evolución de la probeta y el diagrama en tiempo real.';
  }

  if (!replyText) {
    throw new Error('EMPTY_MODEL_RESPONSE');
  }

  return { reply: replyText, actions };
}

async function generateReplyResilient(
  ai: GoogleGenAI,
  contents: Content[],
  systemInstruction: string
): Promise<{ reply: string; actions?: SimulatorActionPayload }> {
  const schedule: Array<{
    model: string;
    timeoutMs: number;
    useLowThinking: boolean;
    delayBeforeMs: number;
  }> = [
    {
      model: PRIMARY_MODEL,
      timeoutMs: 12000,
      useLowThinking: true,
      delayBeforeMs: 0,
    },
    {
      model: FALLBACK_MODEL,
      timeoutMs: 12000,
      useLowThinking: false,
      delayBeforeMs: 600,
    },
    {
      model: PRIMARY_MODEL,
      timeoutMs: 14000,
      useLowThinking: false,
      delayBeforeMs: 1400,
    },
    {
      model: FALLBACK_MODEL,
      timeoutMs: 14000,
      useLowThinking: false,
      delayBeforeMs: 2600,
    },
  ];

  let lastError: unknown;

  for (const step of schedule) {
    if (step.delayBeforeMs > 0) {
      const jitter = Math.floor(Math.random() * 250);
      await sleep(step.delayBeforeMs + jitter);
    }

    try {
      return await callModelOnce(
        ai,
        step.model,
        contents,
        systemInstruction,
        step.timeoutMs,
        step.useLowThinking
      );
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err)) {
        break;
      }
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/chat', async (req, res) => {
    const body = req.body as {
      messages?: ChatMessagePayload[];
      labContext?: LabContextPayload;
    };

    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const contents = normalizeConversation(messages);

    if (
      contents.length === 0 ||
      contents[contents.length - 1].role !== 'user'
    ) {
      res
        .status(400)
        .json({ error: 'Debe enviar al menos una pregunta válida.' });
      return;
    }

    let ai: GoogleGenAI;
    try {
      ai = getGenAIClient();
    } catch {
      res.status(503).json({
        error:
          'No se encontró la clave de API de Gemini en el entorno del servidor. Verifica Settings > Secrets.',
      });
      return;
    }

    try {
      const systemInstruction = buildSystemInstruction(body.labContext);
      const result = await generateReplyResilient(
        ai,
        contents,
        systemInstruction
      );
      res.json(result);
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      const rawMessage = err instanceof Error ? err.message : String(err);
      console.error('[Gemini /api/chat error]', { status, rawMessage });

      if (
        status === 403 ||
        rawMessage.includes('API_KEY_INVALID') ||
        rawMessage.includes('PERMISSION_DENIED')
      ) {
        res.status(403).json({
          error:
            'Clave de API de Gemini inválida o sin permisos. Verifica la configuración en Settings > Secrets.',
        });
        return;
      }

      if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Se alcanzó el límite temporal de consultas a Gemini (cuota agotada). Espera unos segundos o selecciona una clave con facturación en Settings > Secrets.',
        });
        return;
      }

      if (status === 503 || rawMessage.includes('UNAVAILABLE')) {
        res.status(503).json({
          error:
            'El servicio de Gemini presenta alta demanda momentánea (503). Pulsa «Reintentar consulta» en unos segundos o usa una clave con facturación en Settings > Secrets.',
        });
        return;
      }

      if (status === 404 || rawMessage.includes('NOT_FOUND')) {
        res.status(404).json({
          error:
            'El modelo configurado no está disponible actualmente en la API de Gemini.',
        });
        return;
      }

      res.status(502).json({
        error:
          'No se pudo obtener respuesta del modelo Gemini en este momento. Pulsa «Reintentar consulta».',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `LabTracción FINGLUZ server listening on http://0.0.0.0:${PORT}`
    );
  });
}

startServer();
