import React, { useState } from 'react';
import {
  DEFAULT_PRESETS,
  FontFamilyChoice,
  ThemeColors,
  ThemePreset,
} from '../../types/theme';
import {
  Palette,
  X,
  LayoutGrid,
  Sliders,
  Check,
  Trash2,
  Eye,
  Play,
  BookmarkCheck,
} from 'lucide-react';

interface ThemeMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTheme: ThemePreset;
  customPresets: ThemePreset[];
  onApplyTheme: (theme: ThemePreset) => void;
  onSaveCustomPreset: (preset: ThemePreset) => void;
  onDeleteCustomPreset: (id: string) => void;
  onResetToDefault: () => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export const ThemeMasterModal: React.FC<ThemeMasterModalProps> = ({
  isOpen,
  onClose,
  activeTheme,
  customPresets,
  onApplyTheme,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onResetToDefault,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'builder'>('presets');
  const [filterCategory, setFilterCategory] = useState<'all' | 'popular' | 'oled' | 'custom'>('all');

  // Custom builder working state
  const [customName, setCustomName] = useState('My Custom Theme');
  const [customColors, setCustomColors] = useState<ThemeColors>({ ...activeTheme.colors });
  const [customFont, setCustomFont] = useState<FontFamilyChoice>(activeTheme.fontFamily || 'Geist');
  const [customDensity, setCustomDensity] = useState<'compact' | 'standard' | 'spacious'>(
    activeTheme.density || 'compact'
  );
  const [customRadius, setCustomRadius] = useState<'sharp' | 'standard' | 'rounded'>(
    activeTheme.radius || 'standard'
  );

  if (!isOpen) return null;

  // Background tone helper presets
  const applySurfaceTone = (tone: 'obsidian' | 'black' | 'tokyo' | 'charcoal' | 'slate') => {
    let surface = '#0b1326';
    let surfaceLow = '#131b2e';
    let surfaceLowest = '#060e20';
    let surfaceContainer = '#171f33';
    let surfaceHigh = '#222a3d';
    let surfaceHighest = '#2d3449';

    if (tone === 'black') {
      surface = '#000000';
      surfaceLowest = '#000000';
      surfaceLow = '#09090b';
      surfaceContainer = '#121215';
      surfaceHigh = '#1c1c20';
      surfaceHighest = '#27272a';
    } else if (tone === 'tokyo') {
      surface = '#1a1b26';
      surfaceLowest = '#13141c';
      surfaceLow = '#1f2335';
      surfaceContainer = '#24283b';
      surfaceHigh = '#2f3549';
      surfaceHighest = '#3b4261';
    } else if (tone === 'charcoal') {
      surface = '#18181b';
      surfaceLowest = '#09090b';
      surfaceLow = '#121215';
      surfaceContainer = '#202024';
      surfaceHigh = '#27272a';
      surfaceHighest = '#3f3f46';
    } else if (tone === 'slate') {
      surface = '#0f172a';
      surfaceLowest = '#020617';
      surfaceLow = '#0f172a';
      surfaceContainer = '#1e293b';
      surfaceHigh = '#334155';
      surfaceHighest = '#475569';
    }

    setCustomColors((prev) => ({
      ...prev,
      surface,
      surfaceDim: surface,
      surfaceLowest,
      surfaceLow,
      surfaceContainer,
      surfaceHigh,
      surfaceHighest,
    }));
  };

  const handleSaveAndApplyCustom = () => {
    if (!customName.trim()) {
      onShowToast('Nama tema kustom tidak boleh kosong', 'warning', true);
      return;
    }

    const newPreset: ThemePreset = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      description: 'Preset kustom buatan pengguna',
      badge: 'CUSTOM',
      isCustom: true,
      colors: customColors,
      fontFamily: customFont,
      density: customDensity,
      radius: customRadius,
    };

    onSaveCustomPreset(newPreset);
    onApplyTheme(newPreset);
    onShowToast(`Tema "${newPreset.name}" disimpan & diterapkan!`, 'palette');
  };

  const allPresets = [...DEFAULT_PRESETS, ...customPresets];

  const filteredPresets = allPresets.filter((p) => {
    if (filterCategory === 'custom') return p.isCustom;
    if (filterCategory === 'popular') return p.badge === 'POPULAR' || p.badge === 'DEFAULT' || p.badge === 'PRO';
    if (filterCategory === 'oled') return p.badge === 'OLED' || p.badge === 'LEGEND';
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-surface-container-low border border-surface-container-highest rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 px-3 sm:px-4 bg-surface-container-lowest border-b border-surface-container-high flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-headline-sm text-xs sm:text-sm font-bold text-on-surface">
                  Master Pengaturan Tema &amp; Preset
                </h2>
                <span className="px-1.5 py-0.2 rounded bg-surface-container-highest text-primary font-code-sm text-[9px] font-semibold">
                  {activeTheme.name}
                </span>
              </div>
              <p className="font-body-sm text-[10px] text-on-surface-variant hidden sm:block">
                Pilih tema preset studio atau rancang palet warna, tipografi, dan aksen kustom sendiri.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onResetToDefault}
              className="px-2 py-1 rounded text-on-surface-variant hover:text-on-surface text-[11px] font-medium transition-colors cursor-pointer hover:bg-surface-container-high"
              title="Kembalikan ke tema default (Emerald Obsidian)"
            >
              Reset Default
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="flex items-center justify-between px-3 bg-surface-container-lowest/60 border-b border-surface-container-high shrink-0 text-xs">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('presets')}
              className={`flex items-center gap-1.5 px-3 py-2 font-medium transition-all cursor-pointer border-b-2 ${
                activeTab === 'presets'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Koleksi Preset ({allPresets.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('builder');
                setCustomColors({ ...activeTheme.colors });
                setCustomFont(activeTheme.fontFamily || 'Geist');
              }}
              className={`flex items-center gap-1.5 px-3 py-2 font-medium transition-all cursor-pointer border-b-2 ${
                activeTab === 'builder'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Kustomisasi Tema (Custom Builder)</span>
            </button>
          </div>

          {activeTab === 'presets' && (
            <div className="hidden sm:flex items-center gap-1 p-0.5 rounded bg-surface-container text-[11px]">
              {(['all', 'popular', 'oled', 'custom'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2 py-0.5 rounded capitalize cursor-pointer transition-colors ${
                    filterCategory === cat
                      ? 'bg-surface-bright text-on-surface font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {cat === 'all' ? 'Semua' : cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5">
          {activeTab === 'presets' ? (
            /* TAB 1: PRESET CARDS GRID */
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {filteredPresets.map((preset) => {
                  const isActive = activeTheme.id === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        onApplyTheme(preset);
                        onShowToast(`Tema beralih ke: ${preset.name}`, 'palette');
                      }}
                      className={`flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer shadow-sm relative group ${
                        isActive
                          ? 'border-primary ring-2 ring-primary/40 bg-surface-container'
                          : 'border-surface-container-high hover:border-surface-container-highest bg-surface-container-lowest hover:bg-surface-container'
                      }`}
                    >
                      <div className="space-y-2">
                        {/* Header card */}
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="px-1.5 py-0.2 rounded font-code-sm text-[9px] font-bold uppercase"
                            style={{
                              backgroundColor: `${preset.colors.primary}20`,
                              color: preset.colors.primary,
                              border: `1px solid ${preset.colors.primary}40`,
                            }}
                          >
                            {preset.badge}
                          </span>

                          {isActive && (
                            <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-primary text-on-primary font-label-sm text-[9px] font-bold shadow-xs">
                              <Check className="w-2.5 h-2.5" />
                              AKTIF
                            </span>
                          )}
                        </div>

                        {/* Title & Desc */}
                        <div>
                          <h3 className="font-headline-sm text-xs font-bold text-on-surface">
                            {preset.name}
                          </h3>
                          <p className="font-body-sm text-[10px] text-on-surface-variant line-clamp-2 mt-0.5">
                            {preset.description}
                          </p>
                        </div>

                        {/* Color Swatch Preview Strip */}
                        <div
                          className="p-1.5 rounded-lg border flex items-center justify-between gap-1"
                          style={{
                            backgroundColor: preset.colors.surface,
                            borderColor: preset.colors.outlineVariant,
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <span
                              className="w-3.5 h-3.5 rounded-full shadow-xs"
                              style={{ backgroundColor: preset.colors.primary }}
                              title={`Primary: ${preset.colors.primary}`}
                            ></span>
                            <span
                              className="w-3.5 h-3.5 rounded-full shadow-xs"
                              style={{ backgroundColor: preset.colors.secondary }}
                              title={`Secondary: ${preset.colors.secondary}`}
                            ></span>
                            <span
                              className="w-3.5 h-3.5 rounded-full shadow-xs"
                              style={{ backgroundColor: preset.colors.tertiary }}
                              title={`Tertiary: ${preset.colors.tertiary}`}
                            ></span>
                          </div>

                          <span
                            className="font-code-sm text-[9px] px-1 py-0.2 rounded"
                            style={{
                              backgroundColor: preset.colors.surfaceContainer,
                              color: preset.colors.onSurface,
                            }}
                          >
                            {preset.fontFamily}
                          </span>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="mt-2.5 pt-2 border-t border-surface-container-high/60 flex items-center justify-between text-xs">
                        <span className="text-[10px] text-on-surface-variant">
                          {preset.isCustom ? 'Kustom' : 'Sistem'}
                        </span>

                        <div className="flex items-center gap-1">
                          {preset.isCustom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteCustomPreset(preset.id);
                              }}
                              className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error/10 cursor-pointer"
                              title="Hapus tema kustom ini"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                              isActive
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                            }`}
                          >
                            {isActive ? 'Digunakan' : 'Pilih'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredPresets.length === 0 && (
                <div className="p-8 text-center bg-surface-container-lowest rounded-xl border border-surface-container-high text-xs space-y-1">
                  <Palette className="w-8 h-8 text-on-surface-variant mx-auto mb-1" />
                  <p className="text-on-surface font-semibold">Belum ada preset kustom</p>
                  <p className="text-on-surface-variant text-[11px]">
                    Buka tab <strong>Kustomisasi Tema</strong> untuk membuat tema sesuai selera Anda.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: CUSTOM THEME BUILDER */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
              {/* Left Config Controls (7 cols) */}
              <div className="lg:col-span-7 space-y-3">
                {/* Theme Name */}
                <div className="p-3 rounded-xl bg-surface-container-lowest border border-surface-container-high/80 space-y-2">
                  <label className="block text-xs font-semibold text-on-surface">
                    Nama Preset Kustom
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Contoh: Dark Cyber Neon, Deep Forest..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface font-code-sm text-xs border border-surface-container-high focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Primary & Secondary Color Pickers */}
                <div className="p-3 rounded-xl bg-surface-container-lowest border border-surface-container-high/80 space-y-3">
                  <div className="font-headline-sm text-xs font-bold text-on-surface flex items-center justify-between">
                    <span>Aksen Warna Utama (Brand Accents)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Primary Color */}
                    <div className="p-2 rounded-lg bg-surface-container space-y-1.5 border border-surface-container-high/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-on-surface">Primary Accent</span>
                        <span className="font-code-sm text-[10px] text-primary">{customColors.primary}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={customColors.primary}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomColors((prev) => ({
                              ...prev,
                              primary: val,
                              primaryContainer: val,
                              primaryFixed: val,
                              primaryFixedDim: val,
                            }));
                          }}
                          className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent"
                        />
                        <div className="flex items-center gap-1">
                          {['#4edea3', '#7aa2f7', '#bd93f9', '#58a6ff', '#a3e635', '#f59e0b'].map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() =>
                                setCustomColors((prev) => ({
                                  ...prev,
                                  primary: hex,
                                  primaryContainer: hex,
                                  primaryFixed: hex,
                                  primaryFixedDim: hex,
                                }))
                              }
                              className="w-4 h-4 rounded-full border border-black/30 cursor-pointer shadow-xs"
                              style={{ backgroundColor: hex }}
                            ></button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Secondary Color */}
                    <div className="p-2 rounded-lg bg-surface-container space-y-1.5 border border-surface-container-high/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-on-surface">Secondary Accent</span>
                        <span className="font-code-sm text-[10px] text-secondary">{customColors.secondary}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={customColors.secondary}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomColors((prev) => ({
                              ...prev,
                              secondary: val,
                              secondaryContainer: val,
                              secondaryFixed: val,
                              secondaryFixedDim: val,
                            }));
                          }}
                          className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent"
                        />
                        <div className="flex items-center gap-1">
                          {['#4cd7f6', '#bb9af7', '#ff79c6', '#3fb950', '#f43f5e', '#38bdf8'].map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() =>
                                setCustomColors((prev) => ({
                                  ...prev,
                                  secondary: hex,
                                  secondaryContainer: hex,
                                  secondaryFixed: hex,
                                  secondaryFixedDim: hex,
                                }))
                              }
                              className="w-4 h-4 rounded-full border border-black/30 cursor-pointer shadow-xs"
                              style={{ backgroundColor: hex }}
                            ></button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Base Background Tone Presets */}
                <div className="p-3 rounded-xl bg-surface-container-lowest border border-surface-container-high/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-on-surface">
                      Warna Latar (Surface Base Tone)
                    </span>
                    <span className="font-code-sm text-[10px] text-on-surface-variant">
                      {customColors.surface}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => applySurfaceTone('obsidian')}
                      className="p-1.5 rounded-lg bg-[#0b1326] text-[#dae2fd] border border-[#222a3d] hover:border-primary text-center cursor-pointer transition-colors"
                    >
                      Obsidian
                    </button>
                    <button
                      type="button"
                      onClick={() => applySurfaceTone('black')}
                      className="p-1.5 rounded-lg bg-[#000000] text-[#f4f4f5] border border-[#27272a] hover:border-primary text-center cursor-pointer transition-colors"
                    >
                      OLED Black
                    </button>
                    <button
                      type="button"
                      onClick={() => applySurfaceTone('tokyo')}
                      className="p-1.5 rounded-lg bg-[#1a1b26] text-[#c0caf5] border border-[#2f3549] hover:border-primary text-center cursor-pointer transition-colors"
                    >
                      Tokyo Deep
                    </button>
                    <button
                      type="button"
                      onClick={() => applySurfaceTone('charcoal')}
                      className="p-1.5 rounded-lg bg-[#18181b] text-[#f4f4f5] border border-[#27272a] hover:border-primary text-center cursor-pointer transition-colors"
                    >
                      Charcoal
                    </button>
                    <button
                      type="button"
                      onClick={() => applySurfaceTone('slate')}
                      className="p-1.5 rounded-lg bg-[#0f172a] text-[#e2e8f0] border border-[#334155] hover:border-primary text-center cursor-pointer transition-colors"
                    >
                      Slate Gray
                    </button>
                  </div>
                </div>

                {/* Typography and Font */}
                <div className="p-3 rounded-xl bg-surface-container-lowest border border-surface-container-high/80 space-y-2">
                  <span className="text-xs font-semibold text-on-surface">
                    Tipografi &amp; UI Font Family
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-xs">
                    {(['Geist', 'JetBrains Mono', 'Inter', 'Fira Code', 'System'] as const).map((font) => (
                      <button
                        key={font}
                        type="button"
                        onClick={() => setCustomFont(font)}
                        className={`p-1.5 rounded-lg border text-center cursor-pointer transition-colors ${
                          customFont === font
                            ? 'bg-primary/15 border-primary text-primary font-bold'
                            : 'bg-surface-container border-surface-container-high text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Live Preview Sandbox (5 cols) */}
              <div className="lg:col-span-5 space-y-3">
                <div
                  className="p-3.5 rounded-xl border shadow-lg space-y-3 transition-colors sticky top-2"
                  style={{
                    backgroundColor: customColors.surface,
                    borderColor: customColors.outlineVariant,
                    color: customColors.onSurface,
                  }}
                >
                  <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: customColors.outlineVariant }}>
                    <span className="font-headline-sm text-xs font-bold flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" style={{ color: customColors.primary }} />
                      Live Sandbox Preview
                    </span>
                    <span
                      className="px-1.5 py-0.2 rounded font-code-sm text-[9px] font-bold uppercase"
                      style={{
                        backgroundColor: `${customColors.primary}20`,
                        color: customColors.primary,
                        border: `1px solid ${customColors.primary}40`,
                      }}
                    >
                      PREVIEW
                    </span>
                  </div>

                  {/* Sample Active Connection Card */}
                  <div
                    className="p-2.5 rounded-lg border space-y-1.5"
                    style={{
                      backgroundColor: customColors.surfaceContainerLow,
                      borderColor: `${customColors.primary}40`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-code-sm text-xs font-bold" style={{ color: customColors.onSurface }}>
                        aws-production-cluster-01
                      </span>
                      <span
                        className="px-1.5 py-0.2 rounded font-code-sm text-[9px] font-semibold"
                        style={{
                          backgroundColor: `${customColors.primary}25`,
                          color: customColors.primary,
                        }}
                      >
                        18ms
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px]" style={{ color: customColors.onSurfaceVariant }}>
                      <span>Host: 127.0.0.1:5432</span>
                      <span>•</span>
                      <span style={{ color: customColors.secondary }}>PostgreSQL 16</span>
                    </div>
                  </div>

                  {/* Sample Buttons & Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-medium block" style={{ color: customColors.onSurfaceVariant }}>
                      Komponen Tombol:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className="px-2.5 py-1 rounded text-xs font-bold shadow-xs cursor-default flex items-center gap-1"
                        style={{
                          backgroundColor: customColors.primary,
                          color: '#000000',
                        }}
                      >
                        <Play className="w-3 h-3" />
                        Run Query
                      </button>

                      <button
                        type="button"
                        className="px-2.5 py-1 rounded text-xs font-semibold border cursor-default flex items-center gap-1"
                        style={{
                          backgroundColor: customColors.surfaceContainerHigh,
                          color: customColors.secondary,
                          borderColor: `${customColors.secondary}40`,
                        }}
                      >
                        <Sliders className="w-3 h-3" />
                        Filter (2)
                      </button>
                    </div>
                  </div>

                  {/* Mini Code Highlighting Preview */}
                  <div
                    className="p-2 rounded-lg font-code-sm text-[11px] leading-relaxed border space-y-0.5"
                    style={{
                      backgroundColor: customColors.surfaceContainerLowest,
                      borderColor: customColors.outlineVariant,
                    }}
                  >
                    <div>
                      <span style={{ color: customColors.secondary }}>SELECT</span>{' '}
                      <span style={{ color: customColors.onSurface }}>id, name, total_amount</span>
                    </div>
                    <div>
                      <span style={{ color: customColors.secondary }}>FROM</span>{' '}
                      <span style={{ color: customColors.primary }}>public.orders</span>
                    </div>
                    <div>
                      <span style={{ color: customColors.secondary }}>WHERE</span>{' '}
                      <span style={{ color: customColors.onSurface }}>status =</span>{' '}
                      <span style={{ color: customColors.tertiary }}>'completed'</span>;
                    </div>
                  </div>

                  {/* Save button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSaveAndApplyCustom}
                      className="w-full py-2 rounded-lg font-label-md text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                      style={{
                        backgroundColor: customColors.primary,
                        color: '#000000',
                      }}
                    >
                      <BookmarkCheck className="w-4 h-4" />
                      <span>Simpan &amp; Terapkan Tema Ini</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-11 px-3 sm:px-4 bg-surface-container-lowest border-t border-surface-container-high flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2 text-on-surface-variant font-code-sm text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            <span>Tema Aktif: <strong className="text-on-surface">{activeTheme.name}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-medium cursor-pointer transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
