import { X, Sliders } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'

const PRESETS: Record<string, { name: string; preamp: number; gains: number[] }> = {
  flat: { name: 'Flat', preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  classical: { name: 'Classical', preamp: 0, gains: [5, 3, 2, 2, 0, 0, 0, 2, 3, 5] },
  club: { name: 'Club', preamp: 0, gains: [0, 0, 2, 4, 4, 3, 2, 0, 0, 0] },
  dance: { name: 'Dance', preamp: 0, gains: [5, 7, 6, 0, 2, 4, 5, 4, 0, 0] },
  fullBass: { name: 'Full Bass', preamp: 0, gains: [5, 5, 5, 3, 0, -2, -4, -5, -5, -5] },
  fullBassTreble: { name: 'Full Bass & Treble', preamp: 0, gains: [4, 4, 0, -3, -2, 1, 4, 5, 6, 6] },
  fullTreble: { name: 'Full Treble', preamp: 0, gains: [-5, -5, -5, -4, -2, 2, 5, 6, 6, 6] },
  laptop: { name: 'Laptop/Speakers', preamp: 0, gains: [3, 5, -1, 2, 3, 0, -2, 1, 4, 6] },
  largeHall: { name: 'Large Hall', preamp: 0, gains: [5, 5, 3, 3, 0, -2, -2, -2, 0, 0] },
  live: { name: 'Live', preamp: 0, gains: [-2, 0, 2, 3, 3, 3, 2, 1, 1, 1] },
  music: { name: 'Music', preamp: 0, gains: [0, 2, 4, 2, -1, -2, -2, 0, 2, 4] },
  party: { name: 'Party', preamp: 0, gains: [4, 4, 0, 0, 0, 0, 0, 0, 4, 4] },
  pop: { name: 'Pop', preamp: 0, gains: [-2, -1, 2, 4, 4, 2, -1, -2, -2, -2] },
  reggae: { name: 'Reggae', preamp: 0, gains: [0, 0, -2, -2, 0, 3, 4, 4, 0, 0] },
  rock: { name: 'Rock', preamp: 0, gains: [4, 3, -3, -5, -2, 2, 4, 5, 5, 5] },
  soft: { name: 'Soft', preamp: 0, gains: [2, 1, 0, -1, -1, 1, 3, 4, 4, 5] },
  ska: { name: 'Ska', preamp: 0, gains: [-2, -1, 2, 4, 3, 3, 4, 4, 4, 3] },
  techno: { name: 'Techno', preamp: 0, gains: [4, 3, 0, -3, -2, 0, 4, 4, 4, 3.5] },
  softRock: { name: 'Soft Rock', preamp: 0, gains: [2, 2, 1, -1, -2, -1, 1, 2, 3, 4] },
  vocalBooster: { name: 'Vocal Booster', preamp: 0, gains: [-2, -4, -4, 1, 4, 4, 3, 1, -2, -4] },
}

const BANDS = [
  { label: '31 Hz', sub: 'Sub-bass' },
  { label: '63 Hz', sub: 'Bass' },
  { label: '125 Hz', sub: 'Bass' },
  { label: '250 Hz', sub: 'Low-Mid' },
  { label: '500 Hz', sub: 'Low-Mid' },
  { label: '1 kHz', sub: 'Mid' },
  { label: '2 kHz', sub: 'Mid' },
  { label: '4 kHz', sub: 'High-Mid' },
  { label: '8 kHz', sub: 'Treble' },
  { label: '16 kHz', sub: 'Treble' },
]

export default function EqualizerModal() {
  const eqPreset = usePlayerStore((s) => s.eqPreset)
  const eqGains = usePlayerStore((s) => s.eqGains)
  const eqPreamp = usePlayerStore((s) => s.eqPreamp)
  const isEQModalOpen = usePlayerStore((s) => s.isEQModalOpen)
  const isEQEnabled = usePlayerStore((s) => s.isEQEnabled)

  const setEQPreset = usePlayerStore((s) => s.setEQPreset)
  const setEQGains = usePlayerStore((s) => s.setEQGains)
  const setEQPreamp = usePlayerStore((s) => s.setEQPreamp)
  const setEQModalOpen = usePlayerStore((s) => s.setEQModalOpen)
  const setEQEnabled = usePlayerStore((s) => s.setEQEnabled)

  if (!isEQModalOpen) return null

  const handlePresetSelect = (key: string) => {
    setEQPreset(key)
    setEQGains(PRESETS[key].gains)
    setEQPreamp(PRESETS[key].preamp)
  }

  const handleSliderChange = (index: number, val: number) => {
    const newGains = [...eqGains]
    newGains[index] = val
    setEQGains(newGains)

    let matched = 'custom'
    for (const [key, preset] of Object.entries(PRESETS)) {
      if (preset.preamp === eqPreamp && preset.gains.every((g, i) => g === newGains[i])) {
        matched = key
        break
      }
    }
    setEQPreset(matched)
  }

  const handlePreampChange = (val: number) => {
    setEQPreamp(val)

    let matched = 'custom'
    for (const [key, preset] of Object.entries(PRESETS)) {
      if (preset.preamp === val && preset.gains.every((g, i) => g === eqGains[i])) {
        matched = key
        break
      }
    }
    setEQPreset(matched)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative bg-[#12121e] border border-[#22222f] rounded-2xl p-6 w-full max-w-2xl shadow-2xl text-left mx-4 flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#22222f] pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Sliders size={18} />
            </div>
            <div>
              <h2 className="text-md font-bold text-white leading-tight">VLC-Style 10-Band Equalizer</h2>
              <p className="text-[10px] text-[#8d8ba6] mt-0.5">Dual-channel acoustic preamp & decibel scaling</p>
            </div>
          </div>
          <button
            onClick={() => setEQModalOpen(false)}
            className="p-1.5 rounded-full hover:bg-[#22222f] text-[#8d8ba6] hover:text-white transition-colors cursor-pointer"
            title="Close Equalizer"
          >
            <X size={18} />
          </button>
        </div>

        {/* EQ Enable Toggle Switch */}
        <div className="flex items-center justify-between py-4 border-b border-[#22222f] mb-6">
          <div>
            <h3 className="text-sm font-semibold text-white">Enable Equalizer</h3>
            <p className="text-[10px] text-[#8d8ba6] mt-0.5">Acoustic frequency response shaping</p>
          </div>
          <button
            onClick={() => setEQEnabled(!isEQEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
              isEQEnabled ? 'bg-purple-600' : 'bg-[#22222f]'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                isEQEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Preset Selector */}
        <div className={`mb-6 flex items-center gap-4 transition-opacity duration-200 ${!isEQEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#8d8ba6] mb-1.5">
              Preset Selection
            </label>
            <select
              value={eqPreset}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="bg-[#1c1c2e] border border-[#323249] rounded-lg px-3 py-2 text-xs text-white outline-none cursor-pointer hover:border-purple-500 transition-colors focus:border-purple-500 font-medium min-w-[200px]"
            >
              {Object.keys(PRESETS).map((key) => (
                <option key={key} value={key} className="bg-[#12121e]">
                  {PRESETS[key].name}
                </option>
              ))}
              {eqPreset === 'custom' && (
                <option value="custom" disabled>
                  Custom
                </option>
              )}
            </select>
          </div>
          {eqPreset === 'custom' && (
            <div className="mt-4">
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-600/20 text-purple-400 border border-purple-600/30">
                Custom Configuration
              </span>
            </div>
          )}
        </div>

        {/* Equalizer Grid (Preamp + 10 Bands) */}
        <div className={`bg-[#0a0a12]/50 border border-[#22222f] rounded-xl p-5 flex items-stretch h-72 mb-5 overflow-x-auto gap-3 transition-opacity duration-200 ${!isEQEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
          
          {/* Preamp Column */}
          <div className="flex flex-col items-center pr-4 border-r border-[#22222f] min-w-[56px]">
            {/* Value display */}
            <span className="text-[10px] font-bold text-amber-400 mb-3 w-10 text-center tabular-nums">
              {eqPreamp > 0 ? `+${eqPreamp}` : eqPreamp}
            </span>

            {/* Slider */}
            <div className="flex-1 flex justify-center py-2 relative">
              <input
                type="range"
                min={-20}
                max={20}
                step={1}
                value={eqPreamp}
                onChange={(e) => handlePreampChange(Number(e.target.value))}
                className="accent-amber-500 cursor-pointer"
                style={{
                  writingMode: 'bt-lr' as any,
                  WebkitAppearance: 'slider-vertical',
                  height: '100%',
                  width: '6px',
                  padding: '0 8px',
                }}
              />
            </div>

            {/* Labels */}
            <span className="text-[10px] text-amber-400 font-bold mt-3">Preamp</span>
            <span className="text-[8px] text-[#8d8ba6] mt-0.5">Gain dB</span>
          </div>

          {/* 10 Slider Columns */}
          <div className="flex flex-1 justify-between items-stretch gap-1 min-w-[480px]">
            {BANDS.map((band, idx) => {
              const gainVal = eqGains[idx] ?? 0;
              return (
                <div key={idx} className="flex flex-col items-center flex-1 min-w-[42px]">
                  {/* dB Display */}
                  <span className="text-[10px] font-semibold text-purple-400 mb-3 w-8 text-center tabular-nums">
                    {gainVal > 0 ? `+${gainVal}` : gainVal}
                  </span>

                  {/* Slider */}
                  <div className="flex-1 flex justify-center py-2 relative">
                    <input
                      type="range"
                      min={-20}
                      max={20}
                      step={1}
                      value={gainVal}
                      onChange={(e) => handleSliderChange(idx, Number(e.target.value))}
                      className="accent-[#4de8c8] cursor-pointer"
                      style={{
                        writingMode: 'bt-lr' as any,
                        WebkitAppearance: 'slider-vertical',
                        height: '100%',
                        width: '6px',
                        padding: '0 8px',
                      }}
                    />
                  </div>

                  {/* Labels */}
                  <span className="text-[10px] text-white font-medium mt-3 whitespace-nowrap">{band.label}</span>
                  <span className="text-[8px] text-[#8d8ba6] mt-0.5 whitespace-nowrap">{band.sub}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tip text */}
        <div className="p-3 rounded-lg bg-[#0a0a12]/30 border border-[#22222f]/30 text-[10px] text-[#8d8ba6] leading-normal flex items-start gap-2">
          <span>Standard adjustments will modify frequency filters. Boost low end (31Hz to 125Hz) for bass punch or mid-range (1kHz/2kHz) to clarify vocals. Range is adjusted up to ±20dB exactly matching the VLC client.</span>
        </div>
      </div>
    </div>
  )
}
