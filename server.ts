import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

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

function buildSystemInstruction(ctx?: LabContextPayload): string {
  const basePrompt = `Eres el profesor asistente de Ciencia de los Materiales del simulador **LabTracción FINGLUZ** (desarrollado por el Prof. Ing. José Manuel Faría).

Tu rol es ayudar a estudiantes de ingeniería respondiendo de forma **asertiva, clara, precisa y pedagógica** sobre el ensayo de tracción uniaxial y analizando directamente lo que está ocurriendo en la simulación en vivo.

Reglas estrictas de estilo y formato:
1. Responde siempre en español técnico claro, directo y bien estructurado.
2. **NO uses sintaxis LaTeX** (nunca escribas signos de dólar $, ni \\sigma, \\varepsilon, \\Delta, \\text{}, \\frac{}). Usa directamente símbolos Unicode legibles: σ, ε, ΔL, S₀, D₀, L₀, L_f, D_f, S_f, σ_y, σ_R, E, A%, Z%, U_T, π, ×, ·, ≈, ≤, ≥, MPa, GPa, kN, mm, mm², MJ/m³, J.
3. Sé asertivo y concreto: cuando el estudiante consulte sobre su ensayo, cita explícitamente los valores reales actuales de su probeta y explica la causa física (Ley de Hooke, movimiento de dislocaciones, conservación de volumen, endurecimiento por deformación, criterio de Considère / estricción, fractura copa-cono o fractura frágil plana por láminas de grafito).
4. Mantén respuestas concisas y fáciles de leer (párrafos cortos o viñetas con negritas en los conceptos clave).
5. Si el estudiante pregunta algo fuera de Ciencia de los Materiales o del ensayo de tracción, reconduce amablemente la conversación hacia el laboratorio.`;

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

function isTransientError(err: unknown): boolean {
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: number }).status)
      : undefined;
  if (status && (status === 429 || status >= 500)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('UNAVAILABLE') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('fetch failed')
  );
}

const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

async function callModelOnce(
  ai: GoogleGenAI,
  model: string,
  sanitized: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  systemInstruction: string,
  timeoutMs: number
): Promise<string> {
  const config: {
    systemInstruction: string;
    abortSignal: AbortSignal;
    thinkingConfig?: { thinkingLevel: ThinkingLevel };
  } = {
    systemInstruction,
    abortSignal: AbortSignal.timeout(timeoutMs),
  };

  if (model === MODEL_NAME) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }

  const response = await ai.models.generateContent({
    model,
    contents: sanitized,
    config,
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('EMPTY_MODEL_RESPONSE');
  }
  return text;
}

async function generateReplyWithRetry(
  ai: GoogleGenAI,
  sanitized: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  systemInstruction: string
): Promise<string> {
  try {
    return await callModelOnce(ai, MODEL_NAME, sanitized, systemInstruction, 12000);
  } catch (err) {
    const isTimeoutOrTransient =
      isTransientError(err) ||
      (err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError'));
    if (!isTimeoutOrTransient) {
      throw err;
    }
    return await callModelOnce(
      ai,
      FALLBACK_MODEL,
      sanitized,
      systemInstruction,
      12000
    );
  }
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
    if (messages.length === 0) {
      res.status(400).json({ error: 'Debe enviar al menos un mensaje.' });
      return;
    }

    const sanitized = messages
      .filter(
        (m): m is ChatMessagePayload =>
          (m.role === 'user' || m.role === 'model') &&
          typeof m.text === 'string' &&
          m.text.trim().length > 0
      )
      .slice(-16)
      .map((m) => ({
        role: m.role,
        parts: [{ text: m.text.trim().slice(0, 3000) }],
      }));

    if (
      sanitized.length === 0 ||
      sanitized[sanitized.length - 1].role !== 'user'
    ) {
      res
        .status(400)
        .json({ error: 'El último mensaje debe ser del estudiante.' });
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
      const reply = await generateReplyWithRetry(
        ai,
        sanitized,
        systemInstruction
      );
      res.json({ reply });
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: number }).status)
          : undefined;
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
            'Se alcanzó el límite temporal de consultas a Gemini (cuota agotada). Espera unos segundos o revisa tu clave en Settings > Secrets.',
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
          'No se pudo obtener respuesta del modelo Gemini en este momento. Intenta nuevamente.',
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
