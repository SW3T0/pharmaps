import React from 'react';
import { Route as RouteIcon, MapPin, Settings, User, Radio, History, Compass, Trash2, LogOut } from 'lucide-react';

export interface Route {
  id: string;
  delegado_id: string;
  name?: string;
  date: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  distance_meters: number;
  duration_seconds: number;
  polyline?: string;
  created_at?: string;
}

interface RouteSidebarProps {
  routes: Route[];
  activeRouteId: string | null;
  onSelectRoute: (id: string) => void;
  onDeleteRoute?: (id: string) => void;
  delegadoName: string;
  startPointKey: string;
  onStartPointChange: (key: string) => void;
  pharmaciesCount?: number;
  onLogout?: () => void;
}

export const RouteSidebar: React.FC<RouteSidebarProps> = ({
  routes,
  activeRouteId,
  onSelectRoute,
  onDeleteRoute,
  delegadoName,
  startPointKey,
  onStartPointChange,
  pharmaciesCount = 0,
  onLogout
}) => {
  return (
    <aside className="sidebar-container">
      {/* Brand Logo & Title */}
      <div className="sidebar-header">
        <div className="logo-glow">
          <Compass className="logo-icon" />
        </div>
        <div>
          <h1>PharmaMaps</h1>
          <span className="subtitle">Galicia VRP MVP</span>
        </div>
      </div>

      {/* Historial de Rutas (Server-Side) */}
      <div className="sidebar-section">
        <h2 className="section-title">
          <History size={14} /> Historial de Rutas (Supabase)
        </h2>
        <div className="route-list">
          {routes.length === 0 ? (
            <p className="empty-text">No hay rutas planificadas en la nube</p>
          ) : (
            routes.map((route) => (
              <div
                key={route.id}
                className={`route-item-wrapper ${activeRouteId === route.id ? 'active' : ''}`}
              >
                <button
                  onClick={() => onSelectRoute(route.id)}
                  className="route-item"
                >
                  <div className="route-info">
                    <RouteIcon size={16} className="route-icon" />
                    <div className="route-labels">
                      <span className="route-name">
                        {route.name || 'Ruta sin nombre'}
                      </span>
                      <span className="route-date">
                        {new Date(route.date).toLocaleDateString('es-ES', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short'
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="route-meta">
                    <span>{(route.distance_meters / 1000).toFixed(1)} km</span>
                    <span className="badge-status" data-status={route.status}>
                      {route.status === 'active' ? 'Activa' : 'Completada'}
                    </span>
                  </div>
                </button>
                {onDeleteRoute && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRoute(route.id);
                    }}
                    className="btn-delete-route"
                    title="Eliminar ruta"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Configuration & Preferences */}
      <div className="sidebar-section">
        <h2 className="section-title">
          <Settings size={14} /> Ajustes y Catálogo
        </h2>
        <div className="settings-panel glass-panel">
          {/* Conteo de farmacias de la base de datos remota */}
          <div className="db-status-row">
            <span className="db-status-label">Base de datos remota:</span>
            <span className="db-status-value success">
              {pharmaciesCount} farmacias (Galicia)
            </span>
          </div>

          <div className="settings-divider"></div>

          <div className="setting-row">
            <label>Origen de Ruta (Partida)</label>
            <div className="input-with-icon">
              <MapPin size={12} />
              <select
                value={startPointKey}
                onChange={(e) => onStartPointChange(e.target.value)}
                className="select-start-point"
              >
                <option value="coruna">A Coruña (Sede Central)</option>
                <option value="santiago">Santiago (Delegación)</option>
                <option value="vigo">Vigo (Delegación Sur)</option>
              </select>
            </div>
          </div>
          <div className="setting-row">
            <label>Modo de Conducción</label>
            <select defaultValue="driving">
              <option value="driving">Automóvil (Google/OSRM)</option>
              <option value="electric">Coche Eléctrico (Eco)</option>
              <option value="walking">A pie (Urbano)</option>
            </select>
          </div>
        </div>
      </div>

      {/* User profile info (Conexión permanente) */}
      <div className="sidebar-footer glass-panel">
        <div className="user-avatar">
          <User size={18} />
        </div>
        <div className="user-details">
          <span className="user-name">{delegadoName}</span>
          <span className="user-role">Delegado Galicia</span>
        </div>
        <div className="footer-actions">
          <Radio size={14} className="radio-pulse active" />
          {onLogout && (
            <button
              className="btn-logout"
              onClick={onLogout}
              title="Cerrar sesión"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Embedded Sidebar Styles */}
      <style>{`
        .sidebar-container {
          background-color: var(--bg-secondary);
          border-right: 1px solid var(--glass-border);
          display: flex;
          flex-direction: column;
          padding: 20px 14px;
          height: 100%;
          overflow-y: auto;
          color: var(--text-primary);
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .logo-glow {
          background: var(--accent-gradient);
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 15px rgba(0, 242, 254, 0.3);
        }

        .logo-icon {
          color: #0b0f19;
        }

        .sidebar-header h1 {
          font-size: 1.1rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          background: linear-gradient(120deg, #ffffff 40%, var(--accent-cyan) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .subtitle {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .sidebar-section {
          margin-bottom: 28px;
        }

        .section-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .route-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .empty-text {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-align: center;
          padding: 10px;
        }

        .route-item-wrapper {
          position: relative;
          display: flex;
          align-items: stretch;
          width: 100%;
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          overflow: hidden;
          transition: all 0.2s ease;
          background-color: rgba(255, 255, 255, 0.02);
        }
        
        .route-item-wrapper:hover {
          background-color: rgba(255, 255, 255, 0.04);
          border-color: var(--accent-blue);
        }

        .route-item-wrapper.active {
          background-color: rgba(79, 172, 254, 0.08);
          border-color: var(--accent-blue);
          box-shadow: 0 0 10px rgba(79, 172, 254, 0.1);
        }

        .route-item {
          background: transparent;
          border: none;
          padding: 10px 12px;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex-grow: 1;
          width: calc(100% - 36px);
        }

        .route-info {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .route-icon {
          color: var(--accent-blue);
          margin-top: 2px;
          flex-shrink: 0;
        }

        .route-labels {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .route-name {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .route-date {
          font-size: 0.7rem;
          font-weight: 400;
          color: var(--text-muted);
        }

        .route-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .badge-status {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .badge-status[data-status="active"] {
          background-color: rgba(16, 185, 129, 0.15);
          color: var(--success);
        }

        .badge-status[data-status="completed"] {
          background-color: rgba(79, 172, 254, 0.15);
          color: var(--accent-blue);
        }

        .btn-delete-route {
          background: transparent;
          border: none;
          width: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
          border-left: 1px solid var(--glass-border);
        }

        .btn-delete-route:hover {
          color: var(--danger);
          background-color: rgba(239, 68, 68, 0.15);
        }

        .settings-panel {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .db-status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.72rem;
          padding: 2px 0;
        }

        .db-status-label {
          color: var(--text-secondary);
        }

        .db-status-value {
          font-weight: 600;
        }

        .db-status-value.success {
          color: var(--success);
        }

        .settings-divider {
          height: 1px;
          background: var(--glass-border);
        }

        .setting-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .setting-row label {
          font-size: 0.7rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .input-with-icon {
          display: flex;
          align-items: center;
          background: var(--bg-primary);
          border: 1px solid var(--glass-border);
          border-radius: 6px;
          padding: 2px 8px;
          gap: 6px;
          color: var(--text-muted);
        }

        .select-start-point {
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 0.75rem;
          width: 100%;
          outline: none;
          cursor: pointer;
          padding: 4px 0;
        }

        .setting-row select {
          background: var(--bg-primary);
          border: 1px solid var(--glass-border);
          color: var(--text-primary);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 0.75rem;
          outline: none;
          cursor: pointer;
        }

        .sidebar-footer {
          margin-top: auto;
          display: flex;
          align-items: center;
          padding: 12px;
          gap: 10px;
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          background: var(--accent-gradient);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0b0f19;
        }

        .user-details {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
        }

        .user-name {
          font-size: 0.8rem;
          font-weight: 600;
        }

        .user-role {
          font-size: 0.65rem;
          color: var(--text-muted);
        }

        .radio-pulse {
          color: var(--text-muted);
        }

        .radio-pulse.active {
          color: var(--success);
          animation: pulse-glow 1.5s infinite;
        }

        @keyframes pulse-glow {
          0%, 100% { 
            opacity: 1; 
            transform: scale(1);
          }
          50% { 
            opacity: 0.5; 
            transform: scale(0.9);
          }
        }

        .footer-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-logout {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 6px;
          color: #fca5a5;
          cursor: pointer;
          padding: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, border-color 0.2s, color 0.2s;
        }

        .btn-logout:hover {
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.4);
          color: #f87171;
        }
      `}</style>
    </aside>
  );
};
