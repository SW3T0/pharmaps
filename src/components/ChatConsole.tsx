import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Sparkles, Bot, User, HelpCircle, Navigation } from 'lucide-react';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  type: 'text' | 'route_card' | 'error';
  timestamp: Date;
  metadata?: {
    title?: string;
    stopsCount?: number;
    distanceKm?: number;
    durationMinutes?: number;
    polyline?: string;
    stops?: Array<{ id: string; name: string; city: string; order: number }>;
  };
}

interface ChatConsoleProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onApplyRoute: (routeMetadata: any) => void;
  isProcessing: boolean;
  voiceActive: boolean;
  onToggleVoice: () => void;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  messages,
  onSendMessage,
  onApplyRoute,
  isProcessing,
  voiceActive,
  onToggleVoice
}) => {
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Chips para comandos rápidos
  const quickChips = [
    'Ruta por la costa de Lugo',
    'Farmacias en Santiago centro',
    'Planifica Rías Baixas para mañana',
    'Ruta por Ferrol y comarca'
  ];

  // Auto-scroll al final del chat al recibir mensajes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleChipClick = (chipText: string) => {
    if (isProcessing) return;
    onSendMessage(chipText);
  };

  return (
    <section className="chat-container">
      {/* Console Header */}
      <div className="chat-header glass-panel">
        <div className="header-info">
          <div className="bot-icon">
            <Sparkles size={16} />
          </div>
          <div>
            <h3>Asistente de Rutas IA</h3>
            <div className="model-selector">
              <span className="dot"></span>
              <span>Gemini 2.5 Flash (Activo)</span>
            </div>
          </div>
        </div>
        <HelpCircle size={18} className="help-icon" />
      </div>

      {/* Messages Log */}
      <div className="messages-log">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message-wrapper ${msg.sender === 'user' ? 'user-msg' : 'bot-msg'} fade-in-entry`}
          >
            <div className="message-avatar">
              {msg.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className="message-bubble glass-panel">
              {msg.type === 'text' && <p>{msg.content}</p>}

              {/* Renderizado de tarjeta interactiva de ruta */}
              {msg.type === 'route_card' && msg.metadata && (
                <div className="route-card-content">
                  <p className="card-intro">{msg.content}</p>
                  
                  <div className="route-specs glass-panel">
                    <div className="spec-title">
                      <Navigation size={14} className="accent-cyan-text" />
                      <h4>{msg.metadata.title || 'Propuesta de Itinerario'}</h4>
                    </div>
                    
                    <div className="specs-grid">
                      <div className="spec-item">
                        <span className="spec-val">{msg.metadata.stopsCount}</span>
                        <span className="spec-lbl">Visitas</span>
                      </div>
                      <div className="spec-item">
                        <span className="spec-val">{(msg.metadata.distanceKm || 0).toFixed(1)}</span>
                        <span className="spec-lbl">km totales</span>
                      </div>
                      <div className="spec-item">
                        <span className="spec-val">{msg.metadata.durationMinutes}</span>
                        <span className="spec-lbl">min ruta</span>
                      </div>
                    </div>

                    <div className="stops-itinerary">
                      <h5>Secuencia Planificada:</h5>
                      <ul>
                        {msg.metadata.stops?.map((stop, idx) => (
                          <li key={idx}>
                            <span className="stop-num">{idx + 1}</span>
                            <span className="stop-name">{stop.name}</span>
                            <span className="stop-city">({stop.city})</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => onApplyRoute(msg.metadata)}
                      className="btn-apply animated-glow"
                    >
                      Aplicar y Trazar en Mapa
                    </button>
                  </div>
                </div>
              )}
              <span className="message-time">
                {msg.timestamp.toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="message-wrapper bot-msg fade-in-entry">
            <div className="message-avatar">
              <Bot size={14} />
            </div>
            <div className="message-bubble glass-panel">
              <div className="typing-loader">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input panel & Quick Actions */}
      <div className="chat-input-panel">
        {/* Quick Chips */}
        <div className="chips-container">
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              disabled={isProcessing}
              onClick={() => handleChipClick(chip)}
              className="quick-chip"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="input-form glass-panel">
          {voiceActive ? (
            <div className="voice-active-banner" onClick={onToggleVoice}>
              <div className="voice-wave">
                <span className="voice-wave-bar"></span>
                <span className="voice-wave-bar"></span>
                <span className="voice-wave-bar"></span>
                <span className="voice-wave-bar"></span>
                <span className="voice-wave-bar"></span>
              </div>
              <span className="recording-text">Escuchando voz... (Toca para detener)</span>
              <MicOff size={16} className="mic-off-icon" />
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleVoice}
                className="mic-btn"
                title="Dictar ruta por voz"
              >
                <Mic size={18} />
              </button>
              <input
                type="text"
                placeholder={isProcessing ? "Procesando algoritmo..." : "Planifica tu ruta..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isProcessing}
              />
              <button type="submit" className="send-btn" disabled={!input.trim() || isProcessing}>
                <Send size={16} />
              </button>
            </>
          )}
        </form>
      </div>

      {/* Styles local to the component */}
      <style>{`
        .chat-container {
          background-color: var(--bg-primary);
          border-right: 1px solid var(--glass-border);
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          margin: 14px;
          border-radius: 12px;
        }

        .header-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bot-icon {
          background: var(--accent-gradient);
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0b0f19;
        }

        .chat-header h3 {
          font-size: 0.9rem;
          font-weight: 600;
        }

        .model-selector {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.7rem;
          color: var(--text-muted);
        }

        .model-selector .dot {
          width: 6px;
          height: 6px;
          background-color: var(--accent-cyan);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--accent-cyan);
        }

        .help-icon {
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.2s;
        }

        .help-icon:hover {
          color: var(--text-primary);
        }

        .messages-log {
          flex-grow: 1;
          overflow-y: auto;
          padding: 10px 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .message-wrapper {
          display: flex;
          gap: 12px;
          max-width: 85%;
        }

        .user-msg {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .bot-msg {
          align-self: flex-start;
        }

        .message-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--bg-tertiary);
          border: 1px solid var(--glass-border);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          flex-shrink: 0;
          margin-top: 4px;
        }

        .user-msg .message-avatar {
          background: var(--accent-gradient);
          color: #0b0f19;
        }

        .message-bubble {
          padding: 12px 14px;
          border-radius: 12px;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .user-msg .message-bubble {
          border-top-right-radius: 2px;
          background-color: rgba(79, 172, 254, 0.08);
          border-color: rgba(79, 172, 254, 0.2);
        }

        .bot-msg .message-bubble {
          border-top-left-radius: 2px;
        }

        .message-bubble p {
          font-size: 0.85rem;
          line-height: 1.4;
          white-space: pre-line;
        }

        .message-time {
          font-size: 0.65rem;
          color: var(--text-muted);
          align-self: flex-end;
        }

        /* Route Propose Card */
        .route-card-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }

        .card-intro {
          font-weight: 500;
        }

        .route-specs {
          padding: 14px;
          border-radius: 8px;
          background: rgba(11, 15, 25, 0.5);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .spec-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .spec-title h4 {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .accent-cyan-text {
          color: var(--accent-cyan);
        }

        .specs-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          text-align: center;
        }

        .spec-item {
          background-color: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--glass-border);
          border-radius: 6px;
          padding: 6px 4px;
          display: flex;
          flex-direction: column;
        }

        .spec-val {
          font-size: 1rem;
          font-weight: 700;
          color: var(--accent-cyan);
        }

        .spec-lbl {
          font-size: 0.6rem;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .stops-itinerary {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .stops-itinerary h5 {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .stops-itinerary ul {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stops-itinerary li {
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .stop-num {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          font-weight: 700;
        }

        .stop-name {
          font-weight: 500;
          color: var(--text-primary);
        }

        .stop-city {
          color: var(--text-muted);
        }

        .btn-apply {
          background: var(--accent-gradient);
          border: none;
          color: #0b0f19;
          font-size: 0.8rem;
          font-weight: 700;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: transform 0.1s;
          margin-top: 4px;
          width: 100%;
        }

        .btn-apply:active {
          transform: scale(0.98);
        }

        /* Typing Loader */
        .typing-loader {
          display: flex;
          gap: 4px;
          padding: 4px 6px;
        }

        .typing-loader span {
          width: 6px;
          height: 6px;
          background-color: var(--text-muted);
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }

        .typing-loader span:nth-child(1) { animation-delay: -0.32s; }
        .typing-loader span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        /* Input Panel */
        .chat-input-panel {
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .chips-container {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        /* Hide horizontal scrollbar for chips */
        .chips-container::-webkit-scrollbar {
          height: 0px;
        }

        .quick-chip {
          background-color: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--glass-border);
          color: var(--text-secondary);
          font-size: 0.72rem;
          padding: 6px 12px;
          border-radius: 16px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
        }

        .quick-chip:hover {
          border-color: var(--accent-blue);
          color: var(--text-primary);
          background-color: rgba(255, 255, 255, 0.04);
        }

        .input-form {
          display: flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 24px;
          height: 48px;
        }

        .input-form input {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: 0.85rem;
          flex-grow: 1;
          padding: 8px;
        }

        .mic-btn, .send-btn {
          background: transparent;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .mic-btn:hover {
          background-color: rgba(255, 255, 255, 0.05);
          color: var(--accent-cyan);
        }

        .send-btn {
          color: var(--accent-blue);
        }

        .send-btn:hover:not(:disabled) {
          background-color: rgba(79, 172, 254, 0.1);
          color: var(--accent-cyan);
        }

        .send-btn:disabled {
          color: var(--text-muted);
          cursor: not-allowed;
        }

        /* Voice Active Overlay inside Input Form */
        .voice-active-banner {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 12px;
          cursor: pointer;
          height: 100%;
        }

        .recording-text {
          font-size: 0.8rem;
          color: var(--accent-cyan);
          font-weight: 500;
          flex-grow: 1;
        }

        .mic-off-icon {
          color: var(--danger);
          margin-right: 6px;
        }
      `}</style>
    </section>
  );
};
