import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Send,
  Trash2,
  MessageSquare,
  AlertCircle,
  Loader2,
  Activity,
  RotateCw,
  CheckCircle2,
} from 'lucide-react';
import { SimulationSnapshot } from '../physics/tensileEngine';
import { ChartMode, PinnedReferenceCurve } from './TensileChartPanel';
import { MaterialId } from '../physics/materials';

export interface SimulatorActionPayload {
  materialId?: MaterialId;
  d0?: number;
  l0?: number;
  action?:
    | 'play'
    | 'pause'
    | 'unload'
    | 'reset'
    | 'pin_reference'
    | 'clear_reference';
  chartMode?: ChartMode;
  showToughnessArea?: boolean;
  showUnloadingGuide?: boolean;
  inspectionMode?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  appliedSummary?: string;
}

interface GeminiChatDrawerProps {
  open: boolean;
  onClose: () => void;
  snapshot: SimulationSnapshot;
  chartMode: ChartMode;
  inspectionMode: boolean;
  showToughnessArea: boolean;
  pinnedReference: PinnedReferenceCurve | null;
  onApplySimulatorActions: (actions: SimulatorActionPayload) => string;
}

const SUGGESTED_QUESTIONS = [
  'Analiza qué está ocurriendo ahora mismo en mi probeta',
  'Cambia a Aluminio 6061, inicia el ensayo y explícame su rigidez',
  '¿Por qué desciende la tensión nominal durante la estricción?',
  'Cambia a gráfica F–ΔL, sombrea la tenacidad y explica qué representa',
];

function normalizeMathNotation(raw: string): string {
  return raw
    .replace(/\$\$([^$]+)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\sigma_?\{?y\}?/g, (m) => (m.includes('y') ? 'σ_y' : 'σ'))
    .replace(/\\sigma_?\{?R\}?/g, (m) => (m.includes('R') ? 'σ_R' : 'σ'))
    .replace(/\\sigma/g, 'σ')
    .replace(/\\varepsilon/g, 'ε')
    .replace(/\\epsilon/g, 'ε')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\pi/g, 'π')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\approx/g, '≈')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\%/g, '%')
    .replace(/\\,/g, ' ');
}

function renderFormattedMessage(rawText: string): React.ReactNode {
  const text = normalizeMathNotation(rawText);
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let ulItems: string[] = [];
  let olItems: string[] = [];

  const formatInline = (line: string, keyPrefix: string): React.ReactNode[] => {
    const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return tokens.map((token, idx) => {
      if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
        return (
          <strong
            key={`${keyPrefix}-${idx}`}
            className="font-bold text-slate-950 underline decoration-slate-400 underline-offset-2"
          >
            {token.slice(2, -2)}
          </strong>
        );
      }
      if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
        return (
          <code
            key={`${keyPrefix}-${idx}`}
            className="px-1 py-0.5 rounded bg-slate-100 font-mono text-sm font-bold text-blue-950"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      return (
        <React.Fragment key={`${keyPrefix}-${idx}`}>{token}</React.Fragment>
      );
    });
  };

  const flushLists = (keyIdx: number) => {
    if (ulItems.length > 0) {
      blocks.push(
        <ul key={`ul-${keyIdx}`} className="list-disc pl-5 space-y-1.5 my-1.5">
          {ulItems.map((item, idx) => (
            <li key={`uli-${keyIdx}-${idx}`} className="leading-relaxed">
              {formatInline(item, `uli-${keyIdx}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      ulItems = [];
    }
    if (olItems.length > 0) {
      blocks.push(
        <ol
          key={`ol-${keyIdx}`}
          className="list-decimal pl-5 space-y-1.5 my-1.5"
        >
          {olItems.map((item, idx) => (
            <li key={`oli-${keyIdx}-${idx}`} className="leading-relaxed">
              {formatInline(item, `oli-${keyIdx}-${idx}`)}
            </li>
          ))}
        </ol>
      );
      olItems = [];
    }
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushLists(idx);
      return;
    }
    if (/^[-*•]\s+/.test(trimmed)) {
      if (olItems.length > 0) flushLists(idx);
      ulItems.push(trimmed.replace(/^[-*•]\s+/, ''));
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (ulItems.length > 0) flushLists(idx);
      olItems.push(trimmed.replace(/^\d+\.\s+/, ''));
      return;
    }
    flushLists(idx);
    if (/^#{1,3}\s+/.test(trimmed)) {
      const headingText = trimmed.replace(/^#{1,3}\s+/, '');
      blocks.push(
        <div
          key={`h-${idx}`}
          className="font-bold text-slate-950 mt-2 mb-1 first:mt-0"
        >
          {formatInline(headingText, `h-${idx}`)}
        </div>
      );
      return;
    }
    blocks.push(
      <p
        key={`p-${idx}`}
        className="leading-relaxed my-1.5 first:mt-0 last:mb-0"
      >
        {formatInline(trimmed, `p-${idx}`)}
      </p>
    );
  });

  flushLists(lines.length);
  return blocks;
}

export const GeminiChatDrawer: React.FC<GeminiChatDrawerProps> = ({
  open,
  onClose,
  snapshot,
  chartMode,
  inspectionMode,
  showToughnessArea,
  pinnedReference,
  onApplySimulatorActions,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hola. Soy el asistente académico de **LabTracción FINGLUZ** conectado a Gemini. Analizo en tiempo real los datos de tu probeta y puedo operar el simulador (cambiar material, ajustar D₀/L₀, iniciar, descargar o cambiar la gráfica) cuando me lo pidas.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const scrollEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const buildLabContext = () => ({
    materialName: snapshot.material.name,
    materialStandard: snapshot.material.standard,
    materialCategory: snapshot.material.category,
    fractureType: snapshot.material.fractureType,
    d0: snapshot.geometry.d0,
    l0: snapshot.geometry.l0,
    s0: snapshot.s0,
    phase: snapshot.phase,
    phaseLabel: snapshot.phaseLabel,
    chartMode,
    inspectionMode,
    showToughnessArea,
    forceKN: snapshot.forceKN,
    deltaL: snapshot.deltaL,
    currentLength: snapshot.currentLength,
    stressMPa: snapshot.stress,
    strainPct: snapshot.strain * 100,
    maxStrainReachedPct: snapshot.maxStrainReached * 100,
    maxReachedStressMPa: snapshot.maxReachedStress,
    uniformDiameter: snapshot.uniformDiameter,
    centralDiameter: snapshot.centralDiameter,
    neckingFactor: snapshot.neckingFactor,
    residualStrainPct: snapshot.residualStrain * 100,
    elasticRecoveryStrainPct: snapshot.elasticRecoveryStrain * 100,
    isUnloadedOrUnloading: snapshot.isUnloadedOrUnloading,
    isFractured: snapshot.isFractured,
    youngModulusGPa: snapshot.discoveredYoung
      ? snapshot.material.youngModulusGPa
      : null,
    yieldStrengthMPa: snapshot.discoveredYield
      ? snapshot.material.yieldStrengthMPa
      : null,
    utsMPa: snapshot.discoveredUTS ? snapshot.material.utsMPa : null,
    finalLengthLf: snapshot.discoveredFracture ? snapshot.finalLengthLf : null,
    finalDiameterDf: snapshot.discoveredFracture
      ? snapshot.finalDiameterDf
      : null,
    finalAreaSf: snapshot.discoveredFracture ? snapshot.finalAreaSf : null,
    elongationAPct: snapshot.discoveredFracture
      ? snapshot.elongationAPct
      : null,
    reductionZPct: snapshot.discoveredFracture ? snapshot.reductionZPct : null,
    toughnessMJm3: snapshot.toughnessMJm3,
    workJoules: snapshot.workJoules,
    pinnedReference: pinnedReference
      ? {
          materialName: pinnedReference.materialName,
          d0: pinnedReference.d0,
          l0: pinnedReference.l0,
          s0: pinnedReference.s0,
        }
      : null,
  });

  const handleSend = async (overrideText?: string, isRetry = false) => {
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || isStreaming) return;

    setErrorMsg(null);
    setLastFailedPrompt(null);
    if (!isRetry) {
      setInput('');
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const modelMsgId = `m-${Date.now() + 1}`;
    const placeholderModelMsg: ChatMessage = {
      id: modelMsgId,
      role: 'model',
      text: '',
    };

    const baseMessages =
      isRetry &&
      messages.length > 0 &&
      messages[messages.length - 1].role === 'user' &&
      messages[messages.length - 1].text === trimmed
        ? messages.slice(0, -1)
        : messages;

    const historyForApi = [
      ...baseMessages.filter((m) => m.id !== 'welcome'),
      userMsg,
    ].map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages([...baseMessages, userMsg, placeholderModelMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyForApi,
          labContext: buildLabContext(),
        }),
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => null)) as {
        reply?: string;
        actions?: SimulatorActionPayload;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          data?.error || 'No se pudo conectar con el asistente Gemini.'
        );
      }

      if (!data?.reply) {
        throw new Error(
          'El modelo devolvió una respuesta vacía. Intenta reformular tu pregunta.'
        );
      }

      let appliedSummary: string | undefined;
      if (data.actions) {
        appliedSummary = onApplySimulatorActions(data.actions);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === modelMsgId
            ? { ...m, text: data.reply ?? '', appliedSummary }
            : m
        )
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Error inesperado al consultar el asistente.';
      setErrorMsg(message);
      setLastFailedPrompt(trimmed);
      setMessages((prev) =>
        prev.filter((m) => !(m.id === modelMsgId && m.text.trim() === ''))
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleClear = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setErrorMsg(null);
    setLastFailedPrompt(null);
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        text: 'Conversación reiniciada. ¿Qué duda tienes sobre el ensayo de tracción actual o qué acción deseas realizar en el simulador?',
      },
    ]);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/40 flex justify-end text-sm font-bold text-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label="Asistente académico con Gemini"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white h-full border-l border-slate-300 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-300 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-blue-800 shrink-0" />
              Tutor IA · Gemini
            </h2>
            <p className="text-sm font-bold text-slate-950 truncate mt-0.5 font-mono tabular-nums">
              {snapshot.material.shortName} · σ={snapshot.stress.toFixed(1)} MPa · ε=
              {(snapshot.strain * 100).toFixed(2)}%
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClear}
              title="Reiniciar conversación"
              aria-label="Reiniciar conversación"
              className="p-2 rounded-lg text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar tutor IA"
              className="p-2 rounded-lg text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active Specimen Context Strip + Instant Analyze Action */}
        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-300 flex items-center justify-between gap-2">
          <div className="min-w-0 text-sm font-bold text-slate-950">
            <div className="truncate">{snapshot.phaseLabel}</div>
            <div className="font-mono text-slate-900 tabular-nums">
              F={snapshot.forceKN.toFixed(2)} kN · D={snapshot.centralDiameter.toFixed(2)} mm
            </div>
          </div>

          <button
            type="button"
            disabled={isStreaming}
            onClick={() =>
              handleSend(
                'Analiza el estado actual de mi ensayo con los valores actuales de la probeta y explícame qué fenómeno físico está ocurriendo.'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-bold bg-blue-800 text-white hover:bg-blue-900 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Activity className="w-4 h-4" />
            Analizar estado
          </button>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8FAFC]">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm font-bold ${
                    isUser
                      ? 'bg-blue-800 text-white'
                      : 'bg-white border border-slate-300 text-slate-950'
                  }`}
                >
                  {isUser ? (
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  ) : msg.text ? (
                    <div className="space-y-2">
                      {msg.appliedSummary && (
                        <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-950 text-sm font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
                          <span>Acción aplicada: {msg.appliedSummary}</span>
                        </div>
                      )}
                      <div>{renderFormattedMessage(msg.text)}</div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-950">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analizando datos del simulador...
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {errorMsg && (
            <div
              role="alert"
              className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm font-bold text-red-950 space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-800 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              {lastFailedPrompt && (
                <button
                  type="button"
                  onClick={() => handleSend(lastFailedPrompt, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-red-300 text-red-950 font-bold hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                  Reintentar consulta
                </button>
              )}
            </div>
          )}

          {messages.length <= 1 && !isStreaming && (
            <div className="pt-2 space-y-2">
              <div className="text-sm font-bold text-slate-950">
                Consultas sugeridas
              </div>
              <div className="flex flex-col gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSend(q)}
                    className="text-left text-sm font-bold px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-950 hover:border-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 bg-white border-t border-slate-300"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Pregunta sobre resultados o pide controlar el ensayo..."
              disabled={isStreaming}
              className="flex-1 resize-none rounded-lg border border-slate-400 px-3 py-2 text-sm font-bold text-slate-950 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              aria-label="Enviar pregunta"
              className="inline-flex items-center justify-center h-11 px-4 rounded-lg bg-blue-800 text-white hover:bg-blue-900 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-sm font-bold text-slate-900 mt-1.5">
            Enter para enviar · Shift+Enter para salto de línea
          </p>
        </form>
      </div>
    </div>
  );
};
