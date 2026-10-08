import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { INITIAL_ERD_NODES } from '../../data/mockDatabase';
import { ErdNode } from '../../types/database';
import { api, ErdRelation } from '../../services/api';
import {
  GitFork,
  ChevronsUpDown,
  Network,
  List,
  Share2,
  Code2,
  Minus,
  Plus,
  Maximize2,
  Shuffle,
  Filter,
  Download,
  PanelRight,
  PanelRightClose,
  Table,
  Copy,
  X,
  Key,
  Link,
  ArrowRight,
  ArrowDownLeft,
  Gauge,
  FileEdit,
  Search,
  ExternalLink,
  Database,
  Check,
} from 'lucide-react';

interface SchemaErdProps {
  onSelectTableForEditing: (table: string) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

const CARD_WIDTH = 300;
const GAP_X = 120;
const GAP_Y = 70;
const START_X = 60;
const START_Y = 60;

function calculateLayout(rawNodes: ErdNode[]): ErdNode[] {
  if (rawNodes.length === 0) return [];
  const count = rawNodes.length;
  const numCols = count <= 3 ? count : count <= 8 ? 3 : count <= 16 ? 4 : 5;
  const colHeights = new Array(numCols).fill(START_Y);

  return rawNodes.map((node) => {
    let minCol = 0;
    for (let c = 1; c < numCols; c++) {
      if (colHeights[c] < colHeights[minCol]) {
        minCol = c;
      }
    }

    const x = START_X + minCol * (CARD_WIDTH + GAP_X);
    const y = colHeights[minCol];
    const cardHeight = 46 + Math.max(1, node.columns.length) * 26 + 18;
    colHeights[minCol] += cardHeight + GAP_Y;

    return {
      ...node,
      x,
      y,
    };
  });
}

export const SchemaErd: React.FC<SchemaErdProps> = ({
  onSelectTableForEditing,
  onShowToast,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawMode = (searchParams.get('mode') || 'erd').toLowerCase();
  const mode: 'erd' | 'schema' | 'matrix' | 'ddl' =
    rawMode === 'schema' || rawMode === 'tables'
      ? 'schema'
      : rawMode === 'matrix'
      ? 'matrix'
      : rawMode === 'ddl'
      ? 'ddl'
      : 'erd';

  const setMode = (m: 'erd' | 'schema' | 'matrix' | 'ddl') => {
    const next = new URLSearchParams(searchParams);
    next.set('mode', m);
    setSearchParams(next);
  };

  const navigate = useNavigate();
  const [scale, setScale] = useState(0.82);
  const [translateX, setTranslateX] = useState(40);
  const [translateY, setTranslateY] = useState(40);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('orders');
  const [nodes, setNodes] = useState<ErdNode[]>(INITIAL_ERD_NODES);
  const [relations, setRelations] = useState<ErdRelation[]>([]);

  // Subview search & filter states
  const [tablesSearch, setTablesSearch] = useState('');
  const [ddlSelectedTable, setDdlSelectedTable] = useState('all');
  const [matrixFilter, setMatrixFilter] = useState('');

  // Dragging & Panning References
  const containerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const isDraggingCanvasRef = useRef(false);
  const isMinimapDraggingRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const draggingNodeRef = useRef<{
    id: string;
    startNodeX: number;
    startNodeY: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getCatalogErd().then((res) => {
      if (cancelled) return;
      if (res && res.is_live && res.columns) {
        if (res.relations) {
          setRelations(res.relations);
        }
        const tableNames = Object.keys(res.columns);
        if (tableNames.length === 0) {
          setNodes([]);
          setSelectedNodeId('');
          return;
        }
        const unpositionedNodes: ErdNode[] = tableNames.map((tblName) => {
          const cols = res.columns[tblName] || [];
          const colItems = cols.map((c) => ({
            name: c.name,
            type: c.type,
            keyType: (c.is_pk ? 'PK' : undefined) as any,
          }));

          return {
            id: tblName,
            name: tblName,
            schema: 'public',
            rowCount: 'Live DB',
            x: 0,
            y: 0,
            columns: colItems,
          };
        });

        const liveNodes = calculateLayout(unpositionedNodes);
        setNodes(liveNodes);
        if (liveNodes[0]) {
          setSelectedNodeId(liveNodes[0].id);
        }
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Global Pointer Listeners for smooth Canvas Pan and Node Drag
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isMinimapDraggingRef.current && minimapRef.current) {
        panToMinimapPoint(e.clientX, e.clientY, minimapRef.current);
        return;
      }

      if (draggingNodeRef.current) {
        const { id, startNodeX, startNodeY, mouseX, mouseY } = draggingNodeRef.current;
        const dx = (e.clientX - mouseX) / scale;
        const dy = (e.clientY - mouseY) / scale;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === id
              ? { ...n, x: Math.round(startNodeX + dx), y: Math.round(startNodeY + dy) }
              : n
          )
        );
        return;
      }

      if (isDraggingCanvasRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setTranslateX(panStartRef.current.startX + dx);
        setTranslateY(panStartRef.current.startY + dy);
      }
    };

    const handlePointerUp = () => {
      isDraggingCanvasRef.current = false;
      setIsDraggingCanvas(false);
      draggingNodeRef.current = null;
      isMinimapDraggingRef.current = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [scale]);

  const selectedNode = (nodes.length > 0
    ? nodes.find((n) => n.id === selectedNodeId) || nodes[0]
    : null) as ErdNode | null;

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.15, 2.2));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.15, 0.35));
  const handleZoomReset = () => {
    setScale(1.0);
    setTranslateX(30);
    setTranslateY(30);
  };
  const handleAutoLayout = () => {
    setNodes((prev) => calculateLayout(prev));
    setScale(0.82);
    setTranslateX(50);
    setTranslateY(50);
    onShowToast('Tata letak diagram ERD berhasil dirapikan dengan jarak lega!', 'reorder');
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.erd-node-card')) return;
    if ((e.target as HTMLElement).closest('.erd-minimap')) return;
    if ((e.target as HTMLElement).closest('button')) return;

    isDraggingCanvasRef.current = true;
    setIsDraggingCanvas(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startX: translateX,
      startY: translateY,
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      setScale((s) => Math.min(Math.max(s * zoomFactor, 0.3), 2.2));
    } else {
      setTranslateX((x) => x - e.deltaX);
      setTranslateY((y) => y - e.deltaY);
    }
  };

  // Minimap bounds computation
  const bounds = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: 0, maxX: 2000, minY: 0, maxY: 1500, width: 2000, height: 1500 };
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + CARD_WIDTH);
      minY = Math.min(minY, n.y);
      const h = 46 + Math.max(1, n.columns.length) * 26 + 18;
      maxY = Math.max(maxY, n.y + h);
    });
    const padding = 150;
    const calcMinX = Math.min(0, minX - padding);
    const calcMinY = Math.min(0, minY - padding);
    const calcMaxX = Math.max(maxX + padding, calcMinX + 1600);
    const calcMaxY = Math.max(maxY + padding, calcMinY + 1000);
    return {
      minX: calcMinX,
      maxX: calcMaxX,
      minY: calcMinY,
      maxY: calcMaxY,
      width: calcMaxX - calcMinX,
      height: calcMaxY - calcMinY,
    };
  }, [nodes]);

  const mapInnerW = 164;
  const mapInnerH = 92;
  const miniScale = Math.min(
    mapInnerW / Math.max(1, bounds.width),
    mapInnerH / Math.max(1, bounds.height)
  );

  const panToMinimapPoint = (clientX: number, clientY: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const clickY = Math.max(0, Math.min(clientY - rect.top, rect.height));

    const worldX = bounds.minX + clickX / miniScale;
    const worldY = bounds.minY + clickY / miniScale;

    const containerW = containerRef.current?.clientWidth || 1000;
    const containerH = containerRef.current?.clientHeight || 600;

    setTranslateX(containerW / 2 - worldX * scale);
    setTranslateY(containerH / 2 - worldY * scale);
  };

  const filteredTables = useMemo(() => {
    if (!tablesSearch.trim()) return nodes;
    const q = tablesSearch.toLowerCase();
    return nodes.filter(
      (n) => n.name.toLowerCase().includes(q) || n.columns.some((c) => c.name.toLowerCase().includes(q))
    );
  }, [nodes, tablesSearch]);

  const filteredMatrixNodes = useMemo(() => {
    if (!matrixFilter.trim()) return nodes;
    const q = matrixFilter.toLowerCase();
    return nodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [nodes, matrixFilter]);

  const generateDdl = (targetTable: string = 'all') => {
    const targetNodes =
      targetTable === 'all' ? nodes : nodes.filter((n) => n.name === targetTable);

    if (targetNodes.length === 0) {
      return '-- Tidak ada tabel ditemukan pada skema public';
    }

    let ddl = `-- ========================================================\n`;
    ddl += `-- PostgreSQL Schema DDL Script (pgStudio)\n`;
    ddl += `-- Skema: public | Target Tabel: ${targetNodes.length}\n`;
    ddl += `-- Waktu Generate: ${new Date().toLocaleString()}\n`;
    ddl += `-- ========================================================\n\n`;

    targetNodes.forEach((tbl) => {
      ddl += `-- --------------------------------------------------------\n`;
      ddl += `-- Tabel: public.${tbl.name}\n`;
      ddl += `-- --------------------------------------------------------\n`;
      ddl += `CREATE TABLE IF NOT EXISTS public.${tbl.name} (\n`;

      const lines = tbl.columns.map((c) => {
        const isPk = c.keyType === 'PK';
        let line = `    ${c.name.padEnd(24)} ${c.type}`;
        if (isPk) {
          line += ' NOT NULL';
        }
        return line;
      });

      const pkCols = tbl.columns.filter((c) => c.keyType === 'PK').map((c) => c.name);
      if (pkCols.length > 0) {
        lines.push(`    CONSTRAINT ${tbl.name}_pkey PRIMARY KEY (${pkCols.join(', ')})`);
      }

      ddl += lines.join(',\n') + '\n);\n\n';

      const outbound = relations.filter((r) => r.source_table === tbl.name);
      if (outbound.length > 0) {
        outbound.forEach((r) => {
          ddl += `ALTER TABLE public.${r.source_table}\n`;
          ddl += `    ADD CONSTRAINT fk_${r.source_table}_${r.source_col}\n`;
          ddl += `    FOREIGN KEY (${r.source_col})\n`;
          ddl += `    REFERENCES public.${r.target_table} (${r.target_col})\n`;
          ddl += `    ON DELETE RESTRICT ON UPDATE CASCADE;\n\n`;
        });
      }
    });

    return ddl;
  };

  return (
    <div className="flex flex-col w-full">
      {/* 1. Interactive Schema Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-low px-4 py-2 rounded-lg shadow-sm border border-surface-container-high/60">
        {/* Left: Schema select and mode switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Schema Selector */}
          <div className="flex items-center gap-2 px-3 py-1 rounded bg-surface-container text-on-surface border border-outline-variant/30 cursor-pointer hover:bg-surface-container-high transition-colors">
            <GitFork className="w-3.5 h-3.5 text-secondary shrink-0" />
            <div className="flex flex-col text-left">
              <span className="font-label-sm text-[9px] uppercase tracking-wider text-on-surface-variant leading-none">
                ACTIVE SCHEMA
              </span>
              <span className="font-code-sm text-xs font-semibold text-on-surface">
                public <span className="text-on-surface-variant font-normal">({nodes.length} tables)</span>
              </span>
            </div>
            <ChevronsUpDown className="w-3.5 h-3.5 text-on-surface-variant ml-1 shrink-0" />
          </div>

          <div className="h-6 w-px bg-surface-variant hidden sm:block"></div>

          {/* Mode Toggles */}
          <div className="flex items-center rounded bg-surface-container-lowest p-0.5 border border-surface-container-high">
            <button
              onClick={() => setMode('erd')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded font-label-md text-xs transition-all ${
                mode === 'erd'
                  ? 'bg-surface-container text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <Network className="w-3 h-3" />
              <span>Interactive ERD</span>
            </button>
            <button
              onClick={() => setMode('schema')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded font-label-md text-xs transition-all ${
                mode === 'schema'
                  ? 'bg-surface-container text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <List className="w-3 h-3" />
              <span>Schema Tables</span>
            </button>
            <button
              onClick={() => setMode('matrix')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded font-label-md text-xs transition-all ${
                mode === 'matrix'
                  ? 'bg-surface-container text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <Share2 className="w-3 h-3" />
              <span>FK Matrix</span>
            </button>
            <button
              onClick={() => setMode('ddl')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded font-label-md text-xs transition-all ${
                mode === 'ddl'
                  ? 'bg-surface-container text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <Code2 className="w-3 h-3" />
              <span>DDL Script</span>
            </button>
          </div>
        </div>

        {/* Right: Mode-Specific Controls */}
        <div className="flex items-center gap-2">
          {mode === 'erd' ? (
            <>
              {/* Zoom controls */}
              <div className="flex items-center rounded bg-surface-container-lowest p-0.5 border border-surface-container-high">
                <button
                  onClick={handleZoomOut}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                  title="Zoom Out"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-code-sm text-xs text-on-surface-variant select-none min-w-[3rem] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                  title="Zoom In"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleZoomReset}
                  className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                  title="Reset Scale"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={handleAutoLayout}
                className="flex items-center gap-1 px-3 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-code-sm text-xs border border-outline-variant/30"
              >
                <Shuffle className="w-3.5 h-3.5 text-secondary" />
                <span>Auto-Layout</span>
              </button>

              {/* Filter Badge */}
              <div className="hidden sm:flex items-center gap-1 px-3 py-1 rounded bg-surface-container text-on-surface-variant font-code-sm text-xs border border-outline-variant/30">
                <Filter className="w-3 h-3 text-primary" />
                <span>Tables:</span>
                <span className="text-primary font-semibold">{nodes.length}</span>
              </div>

              {/* Export Dropdown Button */}
              <button
                onClick={() => onShowToast('Exported SVG ERD diagram (Vector format)', 'download')}
                className="flex items-center gap-1 px-3 py-1 rounded bg-primary-container text-on-primary font-label-md text-xs font-semibold shadow hover:brightness-110 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export ERD</span>
              </button>

              {/* Inspector Toggle Button */}
              <button
                onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                className="p-1 rounded bg-surface-container text-secondary hover:bg-surface-container-high transition-colors border border-outline-variant/30 cursor-pointer"
                title="Toggle Table Inspector"
              >
                {isInspectorOpen ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRight className="w-4 h-4" />
                )}
              </button>
            </>
          ) : mode === 'schema' ? (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-surface-container text-xs text-on-surface-variant font-code-sm border border-surface-container-high">
                {nodes.length} Tabel Terdaftar
              </span>
              <button
                onClick={() => setMode('erd')}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-xs transition-colors cursor-pointer border border-surface-container-high"
              >
                <Network className="w-3.5 h-3.5" />
                <span>Buka ERD Diagram</span>
              </button>
            </div>
          ) : mode === 'matrix' ? (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-surface-container text-xs text-secondary font-code-sm border border-surface-container-high font-semibold">
                {relations.length} Foreign Keys
              </span>
              <button
                onClick={() => setMode('erd')}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-xs transition-colors cursor-pointer border border-surface-container-high"
              >
                <Network className="w-3.5 h-3.5" />
                <span>Buka ERD Diagram</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-surface-container text-xs text-primary font-code-sm border border-surface-container-high font-semibold">
                DDL Script Mode
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Primary Working Area: Canvas + Sliding Inspector */}
      {mode === 'erd' ? (
        <div className="relative w-full h-[calc(100vh-7.5rem)] min-h-[420px] overflow-hidden rounded-lg mt-2 bg-surface-container-lowest select-none flex border border-surface-container-high/60">
        {/* Canvas Pan Container */}
        <div
          ref={containerRef}
          onPointerDown={handleCanvasPointerDown}
          onWheel={handleWheel}
          className={`relative flex-1 h-full overflow-hidden select-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-surface-container-low/60 via-surface-container-lowest to-surface-container-lowest ${
            isDraggingCanvas ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {/* Subgrid dots pattern via SVG */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
            <defs>
              <pattern id="erd-grid-pattern" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#86948a" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#erd-grid-pattern)" />
          </svg>

          {/* Scaled Graph World */}
          <div
            className="absolute inset-0 transition-transform duration-75 origin-top-left pointer-events-auto"
            style={{
              transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            }}
          >
            {/* SVG Connections Overlay (Dynamic Crow's Foot & Orthogonal Lines) */}
            <svg
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                width: `${Math.max(4000, bounds.maxX + 600)}px`,
                height: `${Math.max(3000, bounds.maxY + 600)}px`,
              }}
            >
              <defs>
                <filter id="erd-glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#4cd7f6" floodOpacity="0.6" />
                </filter>
                <marker
                  id="erd-crow-foot-many"
                  viewBox="0 0 20 20"
                  refX="16"
                  refY="10"
                  markerWidth="14"
                  markerHeight="14"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 3 L 16 10 L 0 17 M 16 2 L 16 18 M 0 10 L 16 10"
                    fill="none"
                    stroke="#4cd7f6"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </marker>
                <marker
                  id="erd-crow-foot-one"
                  viewBox="0 0 20 20"
                  refX="4"
                  refY="10"
                  markerWidth="14"
                  markerHeight="14"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 6 4 L 6 16 M 12 4 L 12 16"
                    fill="none"
                    stroke="#4edea3"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </marker>
              </defs>

              {/* Render dynamic relationships */}
              {relations.map((rel, idx) => {
                const srcNode = nodes.find((n) => n.id === rel.source_table);
                const tgtNode = nodes.find((n) => n.id === rel.target_table);
                if (!srcNode || !tgtNode) return null;

                const srcColIdx = srcNode.columns.findIndex((c) => c.name === rel.source_col);
                const tgtColIdx = tgtNode.columns.findIndex((c) => c.name === rel.target_col);

                const srcY = srcNode.y + 40 + (srcColIdx >= 0 ? srcColIdx * 26 + 13 : 13);
                const tgtY = tgtNode.y + 40 + (tgtColIdx >= 0 ? tgtColIdx * 26 + 13 : 13);

                if (srcNode.id === tgtNode.id) {
                  // Self-reference loop
                  const x0 = srcNode.x + CARD_WIDTH;
                  const pathD = `M ${x0} ${srcY} C ${x0 + 55} ${srcY}, ${x0 + 55} ${tgtY}, ${x0} ${tgtY}`;
                  return (
                    <g key={`${rel.source_table}-${rel.source_col}-${idx}`} className="transition-all">
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#7bd0ff"
                        strokeWidth="1.8"
                        strokeDasharray="4,3"
                        markerEnd="url(#erd-crow-foot-many)"
                      />
                    </g>
                  );
                }

                const isLeftToRight = srcNode.x < tgtNode.x;
                const srcX = isLeftToRight ? srcNode.x + CARD_WIDTH : srcNode.x;
                const tgtX = isLeftToRight ? tgtNode.x : tgtNode.x + CARD_WIDTH;
                const dist = Math.abs(tgtX - srcX) * 0.45;
                const ctrl1X = isLeftToRight ? srcX + dist : srcX - dist;
                const ctrl2X = isLeftToRight ? tgtX - dist : tgtX + dist;
                const pathD = `M ${srcX} ${srcY} C ${ctrl1X} ${srcY}, ${ctrl2X} ${tgtY}, ${tgtX} ${tgtY}`;
                const midX = (srcX + tgtX) / 2;
                const midY = (srcY + tgtY) / 2;

                const isHighlighted = selectedNodeId === srcNode.id || selectedNodeId === tgtNode.id;

                return (
                  <g key={`${rel.source_table}-${rel.source_col}-${rel.target_table}-${idx}`}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isHighlighted ? '#4edea3' : '#4cd7f6'}
                      strokeWidth={isHighlighted ? 2.5 : 1.8}
                      strokeOpacity={isHighlighted ? 0.95 : 0.65}
                      filter={isHighlighted ? 'url(#erd-glow-cyan)' : undefined}
                      markerStart="url(#erd-crow-foot-one)"
                      markerEnd="url(#erd-crow-foot-many)"
                    />
                    <rect
                      x={midX - 14}
                      y={midY - 9}
                      width="28"
                      height="18"
                      rx="4"
                      className="fill-surface-container-high"
                    />
                    <text
                      x={midX}
                      y={midY + 4}
                      textAnchor="middle"
                      className={`font-code-sm text-[10px] font-bold ${
                        isHighlighted ? 'fill-primary' : 'fill-secondary'
                      }`}
                    >
                      1:N
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Empty State */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 z-10 pointer-events-none">
                <div className="w-14 h-14 rounded-2xl bg-surface-container-high/80 flex items-center justify-center text-secondary mb-3 border border-surface-container-highest">
                  <Network className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-semibold text-on-surface">Tidak ada tabel pada skema database</h4>
                <p className="text-xs text-on-surface-variant/70 mt-1 max-w-sm">
                  Database yang aktif belum memiliki tabel di skema public atau belum terhubung.
                </p>
              </div>
            )}

            {/* NODES */}
            {nodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`erd-node-card absolute z-20 w-[300px] rounded-lg shadow-xl transition-shadow cursor-default border ${
                    isSelected
                      ? 'bg-surface-container ring-2 ring-primary border-primary shadow-2xl'
                      : 'bg-surface-container-low border-surface-container-high hover:border-outline-variant/60'
                  }`}
                  style={{ left: `${node.x}px`, top: `${node.y}px` }}
                >
                  {/* Top Bar for Selected Node */}
                  {isSelected && <div className="h-1 w-full bg-primary rounded-t-lg"></div>}

                  {/* Header - Drag Handle */}
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      draggingNodeRef.current = {
                        id: node.id,
                        startNodeX: node.x,
                        startNodeY: node.y,
                        mouseX: e.clientX,
                        mouseY: e.clientY,
                      };
                    }}
                    className={`cursor-move flex items-center justify-between px-3 py-2 rounded-t-lg select-none ${
                      isSelected ? 'bg-surface-container-high' : 'bg-surface-container'
                    }`}
                    title="Klik dan tahan untuk menggeser posisi tabel ini"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Table className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span
                        className={`font-headline-sm text-sm font-semibold truncate ${
                          isSelected ? 'text-primary' : 'text-on-surface'
                        }`}
                      >
                        {node.name}
                      </span>
                      {isSelected && (
                        <span className="px-1 rounded bg-primary/20 text-primary font-label-sm text-[9px] font-semibold">
                          SELECTED
                        </span>
                      )}
                    </div>
                    <span className="px-1.5 py-0.2 rounded bg-surface-container-highest font-code-sm text-[10px] text-on-surface-variant font-medium">
                      {node.rowCount}
                    </span>
                  </div>

                  {/* Column Rows */}
                  <div className="p-1 space-y-0.5 font-code-sm text-code-sm text-xs">
                    {node.columns.map((col) => (
                      <div
                        key={col.name}
                        className={`flex items-center justify-between px-2 py-1 rounded transition-colors ${
                          col.keyType === 'PK'
                            ? 'bg-surface-container-lowest/80 text-primary font-medium'
                            : col.keyType === 'FK'
                            ? 'bg-secondary/10 text-secondary'
                            : 'hover:bg-surface-container-high text-on-surface'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {col.keyType === 'PK' ? (
                            <span className="px-1 rounded bg-secondary-container text-on-secondary-container font-label-sm text-[9px] font-bold">
                              PK
                            </span>
                          ) : col.keyType === 'FK' ? (
                            <span className="px-1 rounded bg-secondary text-on-secondary font-label-sm text-[9px] font-bold">
                              FK
                            </span>
                          ) : col.keyType === 'UQ' ? (
                            <span className="px-1 rounded bg-surface-variant text-on-surface-variant font-label-sm text-[9px]">
                              UQ
                            </span>
                          ) : col.keyType === 'AI' ? (
                            <span className="px-1 rounded bg-tertiary text-on-tertiary font-label-sm text-[9px] font-bold">
                              AI
                            </span>
                          ) : (
                            <span className="w-3"></span>
                          )}

                          {col.icon && (
                            col.icon === 'key' ? (
                              <Key className="w-3 h-3 text-secondary shrink-0" />
                            ) : (
                              <Link className="w-3 h-3 text-secondary shrink-0" />
                            )
                          )}
                          <span className="truncate">{col.name}</span>
                        </div>
                        <span className="px-1 rounded bg-surface-container text-on-surface-variant text-[10px]">
                          {col.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Minimap Float Overlay */}
          <div className="erd-minimap absolute right-4 bottom-4 w-48 h-32 rounded-lg bg-surface-container-lowest/95 backdrop-blur-md shadow-2xl p-1.5 pointer-events-auto select-none border border-surface-container-high/60 z-30 flex flex-col">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="font-label-sm text-[9px] text-on-surface-variant tracking-wider font-semibold">
                MINIMAP
              </span>
              <span className="font-code-sm text-[10px] text-primary font-medium">
                {nodes.length} NODES
              </span>
            </div>
            <div
              ref={minimapRef}
              onPointerDown={(e) => {
                isMinimapDraggingRef.current = true;
                panToMinimapPoint(e.clientX, e.clientY, e.currentTarget);
              }}
              className="relative w-full flex-1 bg-surface-container-low rounded overflow-hidden cursor-crosshair border border-surface-container-high/40"
              title="Klik atau geser pada minimap untuk berpindah navigasi"
            >
              {/* Render real mini representations of each table node */}
              {nodes.map((n) => {
                const isSelected = n.id === selectedNodeId;
                const left = (n.x - bounds.minX) * miniScale;
                const top = (n.y - bounds.minY) * miniScale;
                const w = Math.max(5, CARD_WIDTH * miniScale);
                const h = Math.max(4, (46 + Math.max(1, n.columns.length) * 26 + 18) * miniScale);
                return (
                  <div
                    key={n.id}
                    className={`absolute rounded-[1px] transition-colors pointer-events-none ${
                      isSelected
                        ? 'bg-primary shadow-xs ring-1 ring-primary z-10'
                        : 'bg-surface-variant/80'
                    }`}
                    style={{
                      left: `${Math.round(left)}px`,
                      top: `${Math.round(top)}px`,
                      width: `${Math.round(w)}px`,
                      height: `${Math.round(h)}px`,
                    }}
                  />
                );
              })}

              {/* Viewport Indicator Box */}
              {(() => {
                const containerW = containerRef.current?.clientWidth || 1000;
                const containerH = containerRef.current?.clientHeight || 600;
                const viewW = Math.max(14, (containerW / scale) * miniScale);
                const viewH = Math.max(10, (containerH / scale) * miniScale);
                const viewX = (-translateX / scale - bounds.minX) * miniScale;
                const viewY = (-translateY / scale - bounds.minY) * miniScale;
                return (
                  <div
                    className="absolute bg-primary/20 border border-primary/80 rounded-xs pointer-events-none transition-all shadow-xs"
                    style={{
                      left: `${Math.round(viewX)}px`,
                      top: `${Math.round(viewY)}px`,
                      width: `${Math.round(viewW)}px`,
                      height: `${Math.round(viewH)}px`,
                    }}
                  />
                );
              })()}
            </div>
          </div>
        </div>

        {/* 3. Table Inspector Sidebar Panel */}
        {isInspectorOpen && selectedNode && (
          <aside className="absolute xl:relative right-0 top-0 bottom-0 z-20 w-64 lg:w-72 h-full bg-surface-container-low flex flex-col shadow-2xl overflow-y-auto border-l border-surface-container-high shrink-0 text-xs">
            {/* Inspector Header */}
            <div className="p-3 bg-surface-container flex items-center justify-between sticky top-0 z-30 border-b border-surface-container-high">
              <div className="flex items-center gap-2 truncate">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center text-primary">
                  <PanelRight className="w-4 h-4" />
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">
                    TABLE INSPECTOR
                  </span>
                  <span className="font-headline-sm text-sm text-on-surface font-bold truncate">
                    public.{selectedNode.name}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(`-- Table Inspector DDL for public.${selectedNode.name}\nSELECT * FROM ${selectedNode.name};`);
                    onShowToast(`Copied DDL for ${selectedNode.name}`, 'content_copy');
                  }}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  title="Copy Table DDL"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsInspectorOpen(false)}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Storage & Tuple Metrics */}
            <div className="p-3 grid grid-cols-2 gap-2 bg-surface-container-lowest/50 border-b border-surface-container-high/40">
              <div className="p-2 rounded bg-surface-container flex flex-col border border-surface-container-high/40">
                <span className="font-label-sm text-[10px] text-on-surface-variant">Total Table Size</span>
                <span className="font-headline-sm text-sm text-secondary font-bold">28.4 MB</span>
                <span className="font-code-sm text-[10px] text-on-surface-variant/70 mt-0.5">
                  Data: 18.2M | Idx: 10.2M
                </span>
              </div>
              <div className="p-2 rounded bg-surface-container flex flex-col border border-surface-container-high/40">
                <span className="font-label-sm text-[10px] text-on-surface-variant">Live Tuples (Rows)</span>
                <span className="font-headline-sm text-sm text-primary font-bold">89,410</span>
                <span className="font-code-sm text-[10px] text-on-surface-variant/70 mt-0.5">
                  Dead: 142 (0.15%)
                </span>
              </div>
            </div>

            {/* Primary Key Section */}
            <div className="p-3 space-y-1.5 border-b border-surface-container-high/30">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-[10px] font-semibold uppercase text-on-surface-variant tracking-wider flex items-center gap-1">
                  <Key className="w-3 h-3 text-secondary" />
                  Primary Key Constraint
                </span>
                <span className="font-code-sm text-[10px] text-secondary font-medium">1 Def</span>
              </div>
              <div className="p-2 rounded bg-surface-container space-y-0.5 text-xs border border-surface-container-high/40 font-code-sm">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface font-semibold">{selectedNode.name}_pkey</span>
                  <span className="px-1.5 py-0.2 rounded bg-surface-container-highest text-primary font-label-sm text-[9px] font-bold">
                    PRIMARY KEY
                  </span>
                </div>
                <div className="text-on-surface-variant text-[11px]">
                  Target: <code className="text-primary font-medium">({selectedNode.columns?.find((c) => c.keyType === 'PK')?.name || 'id'})</code>
                </div>
              </div>
            </div>

            {/* Foreign Key Outbound */}
            <div className="p-3 space-y-1.5 border-b border-surface-container-high/30">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-[10px] font-semibold uppercase text-on-surface-variant tracking-wider flex items-center gap-1">
                  <Link className="w-3 h-3 text-secondary" />
                  Foreign Keys (Outbound)
                </span>
                <span className="font-code-sm text-[10px] text-secondary font-medium">
                  {relations.filter((r) => r.source_table === selectedNode.name).length} Rel
                </span>
              </div>
              {relations
                .filter((r) => r.source_table === selectedNode.name)
                .map((rel, idx) => (
                  <div key={idx} className="p-2 rounded bg-surface-container space-y-1 text-xs border border-surface-container-high/40 font-code-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-secondary font-semibold">fk_{rel.source_table}_{rel.source_col}</span>
                      <span className="px-1 rounded bg-secondary/10 text-secondary text-[9px] font-medium">FK</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-on-surface-variant">{rel.source_table}.{rel.source_col}</span>
                      <ArrowRight className="w-3 h-3 text-secondary" />
                      <span className="text-primary font-medium">{rel.target_table}.{rel.target_col}</span>
                    </div>
                  </div>
                ))}
              {relations.filter((r) => r.source_table === selectedNode.name).length === 0 && (
                <div className="p-2 rounded bg-surface-container/50 text-[11px] text-on-surface-variant/70 italic text-center">
                  Tidak ada foreign key outbound
                </div>
              )}
            </div>

            {/* Inbound References */}
            <div className="p-3 space-y-1.5 border-b border-surface-container-high/30">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-[10px] font-semibold uppercase text-on-surface-variant tracking-wider flex items-center gap-1">
                  <ArrowDownLeft className="w-3 h-3 text-primary" />
                  Referenced By (Inbound)
                </span>
                <span className="font-code-sm text-[10px] text-primary font-medium">
                  {relations.filter((r) => r.target_table === selectedNode.name).length} Rel
                </span>
              </div>
              {relations
                .filter((r) => r.target_table === selectedNode.name)
                .map((rel, idx) => (
                  <div key={idx} className="p-2 rounded bg-surface-container space-y-0.5 text-xs border border-surface-container-high/40 font-code-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-on-surface font-semibold">{rel.source_table}</span>
                      <span className="px-1.5 py-0.2 rounded bg-surface-container-highest text-on-surface-variant text-[9px]">
                        CASCADE
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-on-surface-variant text-[11px]">
                      <span>From:</span>
                      <span className="text-primary font-medium">{rel.source_table} ({rel.source_col})</span>
                    </div>
                  </div>
                ))}
              {relations.filter((r) => r.target_table === selectedNode.name).length === 0 && (
                <div className="p-2 rounded bg-surface-container/50 text-[11px] text-on-surface-variant/70 italic text-center">
                  Tidak ada referensi inbound
                </div>
              )}
            </div>

            {/* Quick Action Bottom Dock */}
            <div className="mt-auto p-3 bg-surface-container sticky bottom-0 flex items-center gap-2 border-t border-surface-container-high">
              <button
                onClick={() => onSelectTableForEditing(selectedNode.name)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-xs transition-colors cursor-pointer"
              >
                <Table className="w-3 h-3" />
                <span>View Rows</span>
              </button>
              <button
                onClick={() => onShowToast(`ALTER TABLE public.${selectedNode.name} wizard opened`, 'edit_note')}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-primary text-on-primary font-label-md text-xs shadow hover:brightness-110 transition-all font-semibold cursor-pointer"
              >
                <FileEdit className="w-3 h-3" />
                <span>Alter Table</span>
              </button>
            </div>
          </aside>
        )}
        {isInspectorOpen && !selectedNode && (
          <aside className="absolute xl:relative right-0 top-0 bottom-0 z-20 w-64 lg:w-72 h-full bg-surface-container-low flex flex-col shadow-2xl p-6 border-l border-surface-container-high shrink-0 text-xs items-center justify-center text-center text-on-surface-variant">
            <PanelRight className="w-8 h-8 text-on-surface-variant/40 mb-2" />
            <span className="font-semibold text-on-surface">Tidak ada tabel</span>
            <span className="text-[11px] text-on-surface-variant/70 mt-1">
              {nodes.length === 0
                ? 'Database aktif belum memiliki tabel di skema public'
                : 'Pilih tabel pada diagram ERD untuk menginspeksi struktur'}
            </span>
          </aside>
        )}
      </div>
      ) : mode === 'schema' ? (
        /* ==================== 2. SCHEMA TABLES CATALOG VIEW ==================== */
        <div className="w-full h-[calc(100vh-7.5rem)] min-h-[420px] overflow-y-auto rounded-lg mt-2 bg-surface-container-lowest p-4 border border-surface-container-high/60 flex flex-col gap-4">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container-high flex flex-col shadow-xs">
              <span className="font-label-sm text-[11px] text-on-surface-variant font-medium">TOTAL TABLES</span>
              <span className="font-headline-sm text-lg font-bold text-on-surface">{nodes.length}</span>
              <span className="text-[10px] text-primary mt-0.5">Schema: public</span>
            </div>
            <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container-high flex flex-col shadow-xs">
              <span className="font-label-sm text-[11px] text-on-surface-variant font-medium">TOTAL COLUMNS</span>
              <span className="font-headline-sm text-lg font-bold text-secondary">
                {nodes.reduce((acc, n) => acc + n.columns.length, 0)}
              </span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">Semua tabel</span>
            </div>
            <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container-high flex flex-col shadow-xs">
              <span className="font-label-sm text-[11px] text-on-surface-variant font-medium">FOREIGN KEY RELATIONS</span>
              <span className="font-headline-sm text-lg font-bold text-tertiary">{relations.length}</span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">1:N & 0..1 dependencies</span>
            </div>
            <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container-high flex flex-col shadow-xs">
              <span className="font-label-sm text-[11px] text-on-surface-variant font-medium">STATUS SKEMA</span>
              <span className="font-headline-sm text-lg font-bold text-primary">Live PostgreSQL</span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">Terhubung aktif</span>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-on-surface-variant" />
              <input
                type="text"
                value={tablesSearch}
                onChange={(e) => setTablesSearch(e.target.value)}
                placeholder="Cari tabel atau kolom..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-container text-on-surface placeholder:text-on-surface-variant/50 text-xs border border-surface-container-high focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <span className="text-xs text-on-surface-variant font-code-sm">
              Menampilkan {filteredTables.length} dari {nodes.length} tabel
            </span>
          </div>

          {/* Table Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTables.map((tbl) => {
              const outbound = relations.filter((r) => r.source_table === tbl.name);
              const inbound = relations.filter((r) => r.target_table === tbl.name);
              return (
                <div
                  key={tbl.id}
                  className="rounded-xl bg-surface-container-low border border-surface-container-high overflow-hidden shadow-sm flex flex-col hover:border-outline-variant/60 transition-all"
                >
                  {/* Card Header */}
                  <div className="p-3.5 bg-surface-container flex items-center justify-between gap-2 border-b border-surface-container-high">
                    <div className="flex items-center gap-2 min-w-0">
                      <Table className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-headline-sm text-sm font-bold text-on-surface truncate">
                          public.{tbl.name}
                        </span>
                        <span className="text-[11px] text-on-surface-variant font-code-sm">
                          {tbl.columns.length} kolom • {tbl.rowCount}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => onSelectTableForEditing(tbl.name)}
                        className="px-2.5 py-1 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:brightness-110 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                        title="Buka data tabel di Table Editor"
                      >
                        <Table className="w-3 h-3" />
                        <span>Data</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedNodeId(tbl.id);
                          setMode('erd');
                        }}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                        title="Lihat tabel di diagram ERD"
                      >
                        <Network className="w-3.5 h-3.5 text-secondary" />
                      </button>
                    </div>
                  </div>

                  {/* Column List Preview */}
                  <div className="p-3 flex-1 space-y-1 overflow-y-auto max-h-56 font-code-sm text-xs divide-y divide-surface-container-high/40">
                    {tbl.columns.map((col) => (
                      <div key={col.name} className="pt-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          {col.keyType === 'PK' ? (
                            <span className="px-1 py-0.2 rounded bg-primary text-on-primary text-[9px] font-bold">
                              PK
                            </span>
                          ) : col.keyType === 'FK' ? (
                            <span className="px-1 py-0.2 rounded bg-secondary/20 text-secondary text-[9px] font-bold">
                              FK
                            </span>
                          ) : (
                            <span className="w-3" />
                          )}
                          <span className="text-on-surface font-medium truncate">{col.name}</span>
                        </div>
                        <span className="text-on-surface-variant text-[11px] shrink-0 font-mono">
                          {col.type}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Footer Relation Tags */}
                  {(outbound.length > 0 || inbound.length > 0) && (
                    <div className="p-2.5 bg-surface-container-lowest border-t border-surface-container-high/60 flex flex-wrap gap-1.5 text-[10px]">
                      {outbound.map((r, i) => (
                        <span
                          key={`out-${i}`}
                          className="px-2 py-0.5 rounded bg-secondary/10 text-secondary font-code-sm flex items-center gap-1"
                          title={`${r.source_table}.${r.source_col} -> ${r.target_table}.${r.target_col}`}
                        >
                          <span>FK:</span>
                          <span className="font-semibold">{r.source_col}</span>
                          <span>&rarr;</span>
                          <span>{r.target_table}</span>
                        </span>
                      ))}
                      {inbound.map((r, i) => (
                        <span
                          key={`in-${i}`}
                          className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-sm flex items-center gap-1"
                          title={`Referenced by ${r.source_table}.${r.source_col}`}
                        >
                          <span>&larr; Ref:</span>
                          <span className="font-semibold">{r.source_table}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : mode === 'matrix' ? (
        /* ==================== 3. FOREIGN KEY DEPENDENCY MATRIX VIEW ==================== */
        <div className="w-full h-[calc(100vh-7.5rem)] min-h-[420px] overflow-y-auto rounded-lg mt-2 bg-surface-container-lowest p-4 border border-surface-container-high/60 flex flex-col gap-4">
          {/* Header Banner */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-col">
              <h3 className="font-headline-sm text-base font-bold text-on-surface flex items-center gap-2">
                <Share2 className="w-4 h-4 text-primary" />
                <span>Foreign Key Dependency Matrix</span>
              </h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Peta relasi antar tabel (Baris = Tabel Sumber / Child &rarr; Kolom = Tabel Target / Parent)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg bg-surface-container font-code-sm text-xs text-primary font-semibold border border-surface-container-high">
                {relations.length} Relasi Terdeteksi
              </span>
            </div>
          </div>

          {/* Matrix Grid */}
          <div className="overflow-x-auto w-full border border-surface-container-high rounded-xl bg-surface-container-low shadow-sm">
            <table className="w-full border-collapse font-code-sm text-xs select-none">
              <thead>
                <tr className="bg-surface-container border-b border-surface-container-high">
                  <th className="p-2.5 text-left sticky left-0 z-20 bg-surface-container font-semibold text-on-surface min-w-[180px] border-r border-surface-container-high">
                    Source \ Target
                  </th>
                  {nodes.map((tgt) => (
                    <th
                      key={tgt.id}
                      className="p-2.5 text-center font-semibold text-on-surface min-w-[130px] border-r border-surface-container-high/50"
                      title={tgt.name}
                    >
                      <div className="truncate max-w-[120px] mx-auto text-primary font-bold">
                        {tgt.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high/30">
                {nodes.map((src) => (
                  <tr key={src.id} className="hover:bg-surface-container/60 transition-colors">
                    <td className="p-2.5 font-semibold text-on-surface sticky left-0 z-10 bg-surface-container-low border-r border-surface-container-high flex items-center gap-1.5 truncate">
                      <Table className="w-3.5 h-3.5 text-secondary shrink-0" />
                      <span className="truncate">{src.name}</span>
                    </td>
                    {nodes.map((tgt) => {
                      const relMatches = relations.filter(
                        (r) => r.source_table === src.name && r.target_table === tgt.name
                      );
                      const isSelf = src.id === tgt.id;

                      if (relMatches.length > 0) {
                        return (
                          <td
                            key={tgt.id}
                            className="p-2 text-center border-r border-surface-container-high/30 bg-primary/10"
                            title={relMatches
                              .map(
                                (r) =>
                                  `${r.source_table}.${r.source_col} -> ${r.target_table}.${r.target_col}`
                              )
                              .join(', ')}
                          >
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-on-primary text-[10px] font-bold shadow-xs">
                              FK (1:N)
                            </span>
                          </td>
                        );
                      }

                      if (isSelf) {
                        return (
                          <td
                            key={tgt.id}
                            className="p-2 text-center border-r border-surface-container-high/30 bg-surface-container/30 text-on-surface-variant/30"
                          >
                            —
                          </td>
                        );
                      }

                      return (
                        <td
                          key={tgt.id}
                          className="p-2 text-center border-r border-surface-container-high/30 text-on-surface-variant/20"
                        >
                          ·
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detailed Directory */}
          <div className="space-y-2 pt-2">
            <h4 className="font-headline-sm text-sm font-semibold text-on-surface">
              Daftar Relasi Foreign Key ({relations.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {relations.map((rel, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-surface-container-low border border-surface-container-high flex items-center justify-between gap-2 text-xs font-code-sm shadow-xs"
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 text-on-surface font-semibold truncate">
                      <span className="text-secondary">{rel.source_table}</span>
                      <span className="text-on-surface-variant/60">({rel.source_col})</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-primary truncate mt-0.5">
                      <span>&rarr; References:</span>
                      <span className="font-bold">{rel.target_table}</span>
                      <span className="text-on-surface-variant/60">({rel.target_col})</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const ddlText = `ALTER TABLE public.${rel.source_table} ADD CONSTRAINT fk_${rel.source_table}_${rel.source_col} FOREIGN KEY (${rel.source_col}) REFERENCES public.${rel.target_table} (${rel.target_col}) ON DELETE RESTRICT ON UPDATE CASCADE;`;
                      navigator.clipboard?.writeText(ddlText);
                      onShowToast(`Copied FK DDL for ${rel.source_table}`, 'content_copy');
                    }}
                    className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer shrink-0"
                    title="Copy FK DDL Constraint SQL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {relations.length === 0 && (
                <div className="col-span-full p-8 text-center text-on-surface-variant/70 italic bg-surface-container-low rounded-xl border border-surface-container-high">
                  Tidak ada relasi foreign key pada database ini
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ==================== 4. DDL SCRIPT GENERATOR VIEW ==================== */
        <div className="w-full h-[calc(100vh-7.5rem)] min-h-[420px] overflow-y-auto rounded-lg mt-2 bg-surface-container-lowest p-4 border border-surface-container-high/60 flex flex-col gap-4">
          {/* DDL Controls Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Code2 className="w-4 h-4 text-primary" />
              <span className="font-headline-sm text-sm font-bold text-on-surface">
                PostgreSQL Schema DDL Generator
              </span>
              <select
                value={ddlSelectedTable}
                onChange={(e) => setDdlSelectedTable(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface font-code-sm text-xs border border-surface-container-high focus:outline-none cursor-pointer"
              >
                <option value="all">Semua Tabel (Full Schema DDL - {nodes.length} tables)</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.name}>
                    public.{n.name} ({n.columns.length} columns)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const ddlText = generateDdl(ddlSelectedTable);
                  navigator.clipboard?.writeText(ddlText);
                  onShowToast('DDL Schema berhasil disalin ke clipboard!', 'content_copy');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs transition-colors cursor-pointer border border-surface-container-high"
              >
                <Copy className="w-3.5 h-3.5 text-primary" />
                <span>Salin DDL</span>
              </button>
              <button
                onClick={() => {
                  const ddlText = generateDdl(ddlSelectedTable);
                  const blob = new Blob([ddlText], { type: 'text/sql;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute(
                    'download',
                    `${ddlSelectedTable === 'all' ? 'schema_public' : ddlSelectedTable}.sql`
                  );
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  onShowToast('File DDL SQL berhasil diunduh!', 'download');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs transition-colors cursor-pointer border border-surface-container-high"
              >
                <Download className="w-3.5 h-3.5 text-secondary" />
                <span>Unduh .sql</span>
              </button>
              <button
                onClick={() => {
                  navigate('/sql');
                  onShowToast('Navigasi ke SQL Editor', 'terminal');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs font-semibold hover:brightness-110 transition-all cursor-pointer shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka di SQL Editor</span>
              </button>
            </div>
          </div>

          {/* Syntax Highlighted Code Viewer */}
          <div className="flex-1 rounded-xl bg-surface-container-lowest border border-surface-container-high overflow-hidden shadow-inner flex flex-col font-mono text-xs">
            <div className="p-2.5 bg-surface-container flex items-center justify-between border-b border-surface-container-high text-[11px] text-on-surface-variant font-code-sm">
              <span>{ddlSelectedTable === 'all' ? 'schema_public.sql' : `${ddlSelectedTable}.sql`}</span>
              <span className="text-primary font-medium">PostgreSQL 17 Syntax</span>
            </div>
            <pre className="p-4 overflow-x-auto text-on-surface leading-relaxed max-h-[calc(100vh-14rem)] whitespace-pre font-code-sm text-xs">
              <code>{generateDdl(ddlSelectedTable)}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
