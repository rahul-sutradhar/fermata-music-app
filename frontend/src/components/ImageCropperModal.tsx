import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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

  return createPortal(
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
            className="p-1.5 rounded-full hover:bg-surface-highlight text-subtext hover:text-primary transition-colors cursor-pointer"
            title="Cancel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cropper Container */}
        <div
          className="relative aspect-square w-full max-w-[400px] mx-auto bg-surface-highlight/30 rounded-xl overflow-hidden shadow-inner border border-surface-highlight/50 flex items-center justify-center cursor-move"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <canvas
            ref={canvasRef}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-950 pointer-events-none rounded-lg"
          />
          {/* Transparent Overlay with circular grid */}
          <div className="absolute inset-0 pointer-events-none border-[12px] border-black/50 flex items-center justify-center rounded-xl">
            <div className="w-full h-full border border-white/20 rounded-lg flex items-center justify-center">
              {/* Central circle overlay */}
              <div className="w-full h-full border border-dashed border-white/30 rounded-full flex items-center justify-center">
                <Move className="text-white/20" size={32} />
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-subtext">
            <span>Zoom: {zoomPercentage}%</span>
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
            className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-accent-text text-sm font-semibold hover:bg-spotify-green-hover transition-colors flex items-center justify-center gap-1.5 shadow-lg hover:scale-[1.02]"
          >
            <Check size={16} />
            Apply Crop
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
