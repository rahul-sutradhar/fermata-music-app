import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ZoomIn, ZoomOut, RotateCcw, Check, Move } from 'lucide-react'

interface Props {
  isOpen: boolean
  imageFile: File | null
  onClose: () => void
  onCropComplete: (croppedFile: File) => void
}

export default function ImageCropperModal({
  isOpen,
  imageFile,
  onClose,
  onCropComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null)

  // Transform states
  const [scale, setScale] = useState<number>(1)
  const [minScale, setMinScale] = useState<number>(1)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Interaction tracking
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const offsetStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const initialPinchDistRef = useRef<number | null>(null)
  const initialPinchScaleRef = useRef<number>(1)

  // Load image when file changes
  useEffect(() => {
    if (!isOpen || !imageFile) {
      setImgObj(null)
      return
    }

    const objectUrl = URL.createObjectURL(imageFile)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImgObj(img)
      // Calculate initial scale to cover 400x400 canvas
      const canvasSize = 400
      const fitScale = Math.max(canvasSize / img.width, canvasSize / img.height)
      setMinScale(fitScale)
      setScale(fitScale)
      setOffset({ x: 0, y: 0 })
    }
    img.src = objectUrl

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [isOpen, imageFile])

  // Clamp offset so image always covers the viewport
  const clampOffset = useCallback(
    (newX: number, newY: number, currentScale: number) => {
      if (!imgObj) return { x: 0, y: 0 }
      const canvasSize = 400
      const scaledW = imgObj.width * currentScale
      const scaledH = imgObj.height * currentScale

      const maxOffsetX = Math.max(0, (scaledW - canvasSize) / 2)
      const maxOffsetY = Math.max(0, (scaledH - canvasSize) / 2)

      return {
        x: Math.min(maxOffsetX, Math.max(-maxOffsetX, newX)),
        y: Math.min(maxOffsetY, Math.max(-maxOffsetY, newY)),
      }
    },
    [imgObj],
  )

  // Draw preview onto canvas
  useEffect(() => {
    if (!isOpen || !imgObj || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = 400
    canvas.width = size
    canvas.height = size

    ctx.clearRect(0, 0, size, size)

    ctx.save()
    ctx.translate(size / 2 + offset.x, size / 2 + offset.y)
    ctx.scale(scale, scale)
    ctx.drawImage(imgObj, -imgObj.width / 2, -imgObj.height / 2)
    ctx.restore()
  }, [isOpen, imgObj, scale, offset])

  // Mouse Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    offsetStartRef.current = { ...offset }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    const newOffset = clampOffset(
      offsetStartRef.current.x + dx,
      offsetStartRef.current.y + dy,
      scale,
    )
    setOffset(newOffset)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Touch Handling (Drag & Pinch-to-Zoom)
  const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.hypot(dx, dy)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true)
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      offsetStartRef.current = { ...offset }
    } else if (e.touches.length === 2) {
      setIsDragging(false)
      initialPinchDistRef.current = getTouchDistance(e.touches[0], e.touches[1])
      initialPinchScaleRef.current = scale
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - dragStartRef.current.x
      const dy = e.touches[0].clientY - dragStartRef.current.y
      const newOffset = clampOffset(
        offsetStartRef.current.x + dx,
        offsetStartRef.current.y + dy,
        scale,
      )
      setOffset(newOffset)
    } else if (e.touches.length === 2 && initialPinchDistRef.current !== null) {
      const currentDist = getTouchDistance(e.touches[0], e.touches[1])
      const pinchRatio = currentDist / initialPinchDistRef.current
      const newScale = Math.min(
        minScale * 3.5,
        Math.max(minScale, initialPinchScaleRef.current * pinchRatio),
      )
      setScale(newScale)
      setOffset((prev) => clampOffset(prev.x, prev.y, newScale))
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    initialPinchDistRef.current = null
  }

  // Scroll wheel zoom on desktop
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92
    const newScale = Math.min(
      minScale * 3.5,
      Math.max(minScale, scale * zoomFactor),
    )
    setScale(newScale)
    setOffset((prev) => clampOffset(prev.x, prev.y, newScale))
  }

  // Reset transform
  const handleReset = () => {
    setScale(minScale)
    setOffset({ x: 0, y: 0 })
  }

  // Crop & Export File
  const handleCropSave = () => {
    if (!imgObj) return

    const exportCanvas = document.createElement('canvas')
    const exportSize = 600 // Output crisp high-resolution 600x600 cover photo
    exportCanvas.width = exportSize
    exportCanvas.height = exportSize
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) return

    const renderRatio = exportSize / 400
    ctx.save()
    ctx.translate(exportSize / 2 + offset.x * renderRatio, exportSize / 2 + offset.y * renderRatio)
    ctx.scale(scale * renderRatio, scale * renderRatio)
    ctx.drawImage(imgObj, -imgObj.width / 2, -imgObj.height / 2)
    ctx.restore()

    exportCanvas.toBlob(
      (blob) => {
        if (!blob) return
        const fileName = (imageFile?.name || 'cover.jpg').replace(/\.[^/.]+$/, '') + '_cropped.jpg'
        const croppedFile = new File([blob], fileName, { type: 'image/jpeg' })
        onCropComplete(croppedFile)
        onClose()
      },
      'image/jpeg',
      0.92,
    )
  }

  if (!isOpen || !imageFile) return null

  const maxScaleLimit = minScale * 3.5
  const zoomPercentage = Math.round(((scale - minScale) / (maxScaleLimit - minScale || 1)) * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-surface-elevated rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-surface-highlight flex flex-col space-y-4 text-left">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Crop & Position Cover Image</h2>
            <p className="text-xs text-subtext mt-0.5">
              Drag to reposition • Pinch or scroll to zoom
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-highlight transition-colors text-subtext hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewport Canvas Area */}
        <div className="relative flex justify-center items-center py-2 select-none">
          <div
            className="relative w-[300px] h-[300px] sm:w-[360px] sm:h-[360px] rounded-2xl overflow-hidden border-2 border-spotify-green/60 shadow-2xl bg-black cursor-grab active:cursor-grabbing touch-none flex items-center justify-center"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full object-cover pointer-events-none"
            />

            {/* Grid Overlay Guide */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20">
              <div className="border-r border-b border-white" />
              <div className="border-r border-b border-white" />
              <div className="border-b border-white" />
              <div className="border-r border-b border-white" />
              <div className="border-r border-b border-white" />
              <div className="border-b border-white" />
              <div className="border-r border-white" />
              <div className="border-r border-white" />
              <div />
            </div>

            {/* Reposition Badge */}
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-white flex items-center gap-1.5 pointer-events-none border border-white/10">
              <Move size={12} className="text-spotify-green animate-pulse" />
              <span>Drag to Pan</span>
            </div>
          </div>
        </div>

        {/* Zoom Controls Slider */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-semibold text-subtext">
            <span className="flex items-center gap-1">
              <ZoomOut size={14} /> Zoom
            </span>
            <span>{zoomPercentage}%</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const newScale = Math.max(minScale, scale - (maxScaleLimit - minScale) * 0.1)
                setScale(newScale)
                setOffset((prev) => clampOffset(prev.x, prev.y, newScale))
              }}
              className="p-2 rounded-lg bg-surface-highlight text-subtext hover:text-primary transition-colors"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>

            <input
              type="range"
              min={minScale}
              max={maxScaleLimit}
              step={0.001}
              value={scale}
              onChange={(e) => {
                const newScale = Number(e.target.value)
                setScale(newScale)
                setOffset((prev) => clampOffset(prev.x, prev.y, newScale))
              }}
              className="flex-1 accent-spotify-green cursor-pointer h-1.5 bg-surface-highlight rounded-lg"
            />

            <button
              onClick={() => {
                const newScale = Math.min(maxScaleLimit, scale + (maxScaleLimit - minScale) * 0.1)
                setScale(newScale)
                setOffset((prev) => clampOffset(prev.x, prev.y, newScale))
              }}
              className="p-2 rounded-lg bg-surface-highlight text-subtext hover:text-primary transition-colors"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>

            <button
              onClick={handleReset}
              className="p-2 rounded-lg bg-surface-highlight text-subtext hover:text-primary transition-colors"
              title="Reset Alignment"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 pt-3 border-t border-surface-highlight">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm font-medium hover:bg-surface-highlight transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCropSave}
            className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-colors flex items-center justify-center gap-1.5 shadow-lg hover:scale-[1.02]"
          >
            <Check size={16} />
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  )
}
