import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
}

export default function SearchInput({
  value,
  onChange,
  placeholder = 'What do you want to listen to?',
  debounceMs = 250,
}: Props) {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setLocalValue(v)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange(v)
    }, debounceMs)
  }

  const handleClear = () => {
    setLocalValue('')
    if (timerRef.current) clearTimeout(timerRef.current)
    onChange('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (timerRef.current) clearTimeout(timerRef.current)
      onChange(localValue)
    }
  }

  return (
    <div className="relative max-w-md">
      <Search
        size={18}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtext pointer-events-none"
      />
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2.5 rounded-full bg-surface-highlight text-sm text-primary placeholder:text-subtext/60 outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors shadow-sm"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-subtext hover:text-primary hover:bg-surface-elevated transition-colors"
          title="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
