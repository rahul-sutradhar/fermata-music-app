import { useEffect, useRef } from 'react'
import { X, Headphones, Sparkles, Sliders } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'

export default function SpatialAudioModal() {
  const is3DEnabled = usePlayerStore((s) => s.is3DEnabled)
  const is3DReverbEnabled = usePlayerStore((s) => s.is3DReverbEnabled)
  const orbitSpeedSeconds = usePlayerStore((s) => s.orbitSpeedSeconds)
  const orbitHeightPercent = usePlayerStore((s) => s.orbitHeightPercent)
  const is3DModalOpen = usePlayerStore((s) => s.is3DModalOpen)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  const set3DEnabled = usePlayerStore((s) => s.set3DEnabled)
  const set3DReverbEnabled = usePlayerStore((s) => s.set3DReverbEnabled)
  const setOrbitSpeedSeconds = usePlayerStore((s) => s.setOrbitSpeedSeconds)
  const setOrbitHeightPercent = usePlayerStore((s) => s.setOrbitHeightPercent)
  const set3DModalOpen = usePlayerStore((s) => s.set3DModalOpen)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!is3DModalOpen) return

    let animationFrameId: number

    const drawOrbit = (angle: number, x: number, y: number) => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Dynamic canvas layout sizing adjustment to prevent squishing on rectangular layouts
      const rect = canvas.getBoundingClientRect()
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width
        canvas.height = rect.height
      }

      const ctx2d = canvas.getContext('2d')
      if (!ctx2d) return

      const W = canvas.width, H = canvas.height
      const cx = W / 2, cy = H / 2
      // R should be based on the smallest dimension to fit perfectly
      const R = Math.min(W, H) * 0.32

      ctx2d.clearRect(0, 0, W, H)

      // 1. Radar background crosshair lines
      ctx2d.strokeStyle = 'rgba(124, 92, 255, 0.05)'
      ctx2d.lineWidth = 1
      ctx2d.beginPath()
      ctx2d.moveTo(cx - R * 1.2, cy)
      ctx2d.lineTo(cx + R * 1.2, cy)
      ctx2d.moveTo(cx, cy - R * 1.2 * 0.45)
      ctx2d.lineTo(cx, cy + R * 1.2 * 0.45)
      ctx2d.stroke()

      // 2. Radar concentric background rings
      ctx2d.strokeStyle = 'rgba(124, 92, 255, 0.06)'
      for (let r = 1; r <= 3; r++) {
        ctx2d.beginPath()
        ctx2d.ellipse(cx, cy, R * (r / 3), R * 0.45 * (r / 3), 0, 0, Math.PI * 2)
        ctx2d.stroke()
      }

      // 3. Orbit main path ring
      ctx2d.strokeStyle = 'rgba(124, 92, 255, 0.2)'
      ctx2d.lineWidth = 2
      ctx2d.beginPath()
      ctx2d.ellipse(cx, cy, R, R * 0.45, 0, 0, Math.PI * 2)
      ctx2d.stroke()

      // Calculate beat scale
      let beatScale = 1.0
      const analyser = (window as any).fermataAnalyser
      if (analyser && isPlaying && is3DEnabled) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        const bins = Math.floor(dataArray.length * 0.15)
        for (let i = 0; i < bins; i++) {
          sum += dataArray[i]
        }
        const avg = sum / bins
        beatScale = 1.0 + (avg / 255) * 0.3
      }

      // Draw listener head
      const listenerRadius = 16 * beatScale
      ctx2d.fillStyle = '#e7e6f3'
      ctx2d.beginPath()
      ctx2d.arc(cx, cy, listenerRadius, 0, Math.PI * 2)
      ctx2d.fill()

      // Inner label
      ctx2d.fillStyle = '#0a0a12'
      ctx2d.font = 'bold 9px Inter'
      ctx2d.textAlign = 'center'
      ctx2d.textBaseline = 'middle'
      ctx2d.fillText('YOU', cx, cy + 1)

      // Headphones representation
      ctx2d.strokeStyle = '#e7e6f3'
      ctx2d.lineWidth = 3
      // Left earcup
      ctx2d.beginPath()
      ctx2d.arc(cx - listenerRadius - 3, cy, 5 * beatScale, 0, Math.PI * 2)
      ctx2d.stroke()
      // Right earcup
      ctx2d.beginPath()
      ctx2d.arc(cx + listenerRadius + 3, cy, 5 * beatScale, 0, Math.PI * 2)
      ctx2d.stroke()
      // Headphone arch
      ctx2d.beginPath()
      ctx2d.arc(cx, cy, listenerRadius + 2, Math.PI, 0)
      ctx2d.stroke()

      // Sound source position
      const px = cx + Math.cos(angle) * R
      const py = cy + Math.sin(angle) * R * 0.45 - y * 40

      // Connecting trace line
      ctx2d.strokeStyle = is3DEnabled ? 'rgba(77, 232, 200, 0.2)' : 'rgba(141, 139, 166, 0.15)'
      ctx2d.lineWidth = 1
      ctx2d.setLineDash([4, 4])
      ctx2d.beginPath()
      ctx2d.moveTo(cx, cy)
      ctx2d.lineTo(px, py)
      ctx2d.stroke()
      ctx2d.setLineDash([])

      // Sound source glow
      const glowRadius = (is3DEnabled ? 24 : 14) * beatScale
      const grad = ctx2d.createRadialGradient(px, py, 0, px, py, glowRadius)
      if (is3DEnabled) {
        grad.addColorStop(0, 'rgba(77, 232, 200, 0.85)')
        grad.addColorStop(0.3, 'rgba(77, 232, 200, 0.35)')
        grad.addColorStop(1, 'rgba(77, 232, 200, 0)')
      } else {
        grad.addColorStop(0, 'rgba(141, 139, 166, 0.5)')
        grad.addColorStop(1, 'rgba(141, 139, 166, 0)')
      }
      ctx2d.fillStyle = grad
      ctx2d.beginPath()
      ctx2d.arc(px, py, glowRadius, 0, Math.PI * 2)
      ctx2d.fill()

      // Sound source core dot
      ctx2d.fillStyle = is3DEnabled ? '#4de8c8' : '#8d8ba6'
      ctx2d.beginPath()
      ctx2d.arc(px, py, 7, 0, Math.PI * 2)
      ctx2d.fill()
    }

    const updateLoop = () => {
      const angle = (window as any).fermata3DAngle || 0
      const x = (window as any).fermata3DX || 0
      const y = (window as any).fermata3DY || 0
      drawOrbit(angle, x, y)
      animationFrameId = requestAnimationFrame(updateLoop)
    }

    updateLoop()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [is3DModalOpen, isPlaying, is3DEnabled])

  if (!is3DModalOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative bg-[#12121e] border border-[#22222f] rounded-2xl p-6 w-full max-w-md shadow-2xl text-left mx-4 flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#22222f] pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 animate-pulse">
              <Headphones size={18} />
            </div>
            <div>
              <h2 className="text-md font-bold text-white leading-tight">3D Spatial Audio</h2>
              <p className="text-[10px] text-[#8d8ba6] mt-0.5">Custom Binaural Environment</p>
            </div>
          </div>
          <button
            onClick={() => set3DModalOpen(false)}
            className="p-1.5 rounded-full hover:bg-[#22222f] text-[#8d8ba6] hover:text-white transition-colors cursor-pointer"
            title="Close Settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Orbit Visualization Stage */}
        <div className="relative w-full aspect-square bg-[#0a0a12]/50 border border-[#22222f] rounded-xl overflow-hidden mb-5">
          <canvas 
            ref={canvasRef} 
            width={400} 
            height={400} 
            className="w-full h-full block"
          />
          {!is3DEnabled && (
            <div className="absolute inset-0 bg-[#0a0a12]/80 backdrop-blur-[1px] flex flex-col items-center justify-center text-center p-4">
              <Sparkles size={24} className="text-[#8d8ba6] mb-2" />
              <p className="text-sm font-semibold text-white">Spatial Audio is Off</p>
              <p className="text-xs text-[#8d8ba6] max-w-[200px] mt-1">Enable 3D Spatial Mode below to activate orbital audio</p>
            </div>
          )}
        </div>

        {/* Options Panel */}
        <div className="space-y-4">
          {/* Spatial Mode Toggle */}
          <div className="flex items-center justify-between py-2 border-b border-[#22222f]/50">
            <div>
              <div className="text-sm font-medium text-white">3D Spatial Mode</div>
              <div className="text-[10px] text-[#8d8ba6] mt-0.5">Orbits the sound source around your head</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={is3DEnabled}
                onChange={(e) => set3DEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-[#22222f] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#e7e6f3] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {/* Reverb Toggle */}
          <div className="flex items-center justify-between py-2 border-b border-[#22222f]/50">
            <div>
              <div className="text-sm font-medium text-white">Room Depth Reverb</div>
              <div className="text-[10px] text-[#8d8ba6] mt-0.5 font-normal">Simulates high-fidelity acoustic reflections</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={is3DReverbEnabled}
                disabled={!is3DEnabled}
                onChange={(e) => set3DReverbEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-[#22222f] peer-focus:outline-none rounded-full peer peer-disabled:opacity-30 peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#e7e6f3] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4de8c8]"></div>
            </label>
          </div>

          {/* Orbit Speed Slider */}
          <div className="space-y-1.5 py-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#8d8ba6]">Orbit Speed</span>
              <span className="font-medium text-white">{orbitSpeedSeconds}s / rev</span>
            </div>
            <input
              type="range"
              min={2}
              max={30}
              value={orbitSpeedSeconds}
              disabled={!is3DEnabled}
              onChange={(e) => setOrbitSpeedSeconds(Number(e.target.value))}
              className="w-full accent-[#4de8c8] h-1.5 bg-[#22222f] rounded-lg cursor-pointer disabled:opacity-30"
            />
          </div>

          {/* Orbit Height Slider */}
          <div className="space-y-1.5 py-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#8d8ba6]">Vertical Elevation</span>
              <span className="font-medium text-white">{orbitHeightPercent}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={orbitHeightPercent}
              disabled={!is3DEnabled}
              onChange={(e) => setOrbitHeightPercent(Number(e.target.value))}
              className="w-full accent-[#4de8c8] h-1.5 bg-[#22222f] rounded-lg cursor-pointer disabled:opacity-30"
            />
          </div>
        </div>

        {/* Tip text */}
        <div className="mt-5 p-3 rounded-lg bg-[#0a0a12]/30 border border-[#22222f]/30 text-[10px] text-[#8d8ba6] leading-normal flex items-start gap-2">
          <Sliders size={12} className="text-purple-400 shrink-0 mt-0.5" />
          <span>This effect simulates headphone HRTF listening. Connect stereo headphones for the full 3D spatial effect. Normal speakers will map to stereo pan.</span>
        </div>
      </div>
    </div>
  )
}
