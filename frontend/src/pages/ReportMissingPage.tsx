import React, { useState, useEffect, useRef } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Send, Music, ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertCircle, Play } from 'lucide-react'
import {
  searchSongCandidates,
  submitCandidateSelection,
  simulateAdminApproval
} from '@/api/agenticIngest'
import type { CandidateSong } from '@/api/agenticIngest'
import { usePlayerStore } from '@/store/playerStore'
import { useAuthStore } from '@/store/authStore'

interface Message {
  id: string
  sender: 'bot' | 'user'
  text: string
  type?: 'text' | 'candidates' | 'logs' | 'admin_simulation' | 'status'
  candidates?: CandidateSong[]
  logs?: string[]
  statusType?: 'success' | 'error' | 'warning'
  selected?: boolean
}

export default function ReportMissingPage() {
  const location = useLocation()
  const prefilledQuery = (location.state as any)?.prefilledQuery || ''
  
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ingestionLogs, setIngestionLogs] = useState<string[]>([])
  const [isComplete, setIsComplete] = useState<boolean>(false)
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Initialize and load chat state from sessionStorage on mount
  useEffect(() => {
    if (!user) return

    const cacheKey = `fermata-chatbot-state-${user.id}`
    const cached = sessionStorage.getItem(cacheKey)

    // If navigated here with a prefilled query, always start a fresh session
    // (clear any prior completed or non-pending session so the query goes through)
    if (prefilledQuery) {
      // Clear stale/completed sessions so the query runs fresh
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          // Only clear if the prior session was completed — ongoing sessions are preserved
          if (parsed.isComplete) {
            sessionStorage.removeItem(cacheKey)
          }
        } catch (e) {}
      }

      const welcomeId = Math.random().toString()
      const welcomeMsg: Message = {
        id: welcomeId,
        sender: 'bot',
        text: "Hello! I am the Fermata Ingestion Assistant powered by Agentic AI. Which missing song can I help you find and ingest today? Please type the song name and artist.",
        type: 'text'
      }
      setMessages([welcomeMsg])
      // Kick off the search immediately with the prefilled query
      handleSearch(prefilledQuery)
      return
    }

    // No prefilled query — restore from cache if available
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setMessages(parsed.messages || [])
        setThreadId(parsed.threadId || null)
        setIngestionLogs(parsed.ingestionLogs || [])
        setIsComplete(parsed.isComplete || false)
        // Restore in-progress spinner — if the session had an active request running
        // when the tab was left, show the spinner until the async resolves
        if (parsed.loading) {
          setLoading(true)
        }
        return
      } catch (e) {
        console.error('Failed to parse cached chatbot state', e)
      }
    }

    // Fresh session — show welcome message
    const welcomeId = Math.random().toString()
    setMessages([
      {
        id: welcomeId,
        sender: 'bot',
        text: "Hello! I am the Fermata Ingestion Assistant powered by Agentic AI. Which missing song can I help you find and ingest today? Please type the song name and artist.",
        type: 'text'
      }
    ])
  }, [user, prefilledQuery])

  // Save chat state to sessionStorage on state changes (including loading)
  useEffect(() => {
    if (!user) return
    if (messages.length > 0) {
      const cacheKey = `fermata-chatbot-state-${user.id}`
      sessionStorage.setItem(cacheKey, JSON.stringify({
        messages,
        threadId,
        ingestionLogs,
        isComplete,
        loading
      }))
    }
  }, [messages, threadId, ingestionLogs, isComplete, loading, user])

  // Sync completion state using a ref for cleanups
  const isCompleteRef = useRef(isComplete)
  useEffect(() => {
    isCompleteRef.current = isComplete
  }, [isComplete])

  // Clear session cache if the chat was completed before navigating away
  useEffect(() => {
    return () => {
      if (isCompleteRef.current && user) {
        const cacheKey = `fermata-chatbot-state-${user.id}`
        sessionStorage.removeItem(cacheKey)
      }
    }
  }, [user])

  // Core Search Ingestion Function
  const handleSearch = async (songQuery: string) => {
    if (!songQuery.trim() || !user) return
    setLoading(true)
    setIsComplete(false) // Reset completion state for new search

    const cacheKey = `fermata-chatbot-state-${user.id}`
    const userMsgId = Math.random().toString()
    const userMsg: Message = { id: userMsgId, sender: 'user', text: songQuery }

    // Read cached state to append the user message immediately
    let currentMsgs: Message[] = []
    let currentThread: string | null = null
    let currentLogs: string[] = []
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        currentMsgs = parsed.messages || []
        currentThread = parsed.threadId || null
        currentLogs = parsed.ingestionLogs || []
      } catch (e) {}
    }

    const messagesWithUser = [...currentMsgs, userMsg]
    sessionStorage.setItem(cacheKey, JSON.stringify({
      messages: messagesWithUser,
      threadId: currentThread,
      ingestionLogs: currentLogs,
      isComplete: false,
      loading: true
    }))
    setMessages(messagesWithUser)
    
    try {
      const response = await searchSongCandidates(songQuery)
      const botMsgId = Math.random().toString()
      let finalBotMsg: Message
      let newIsComplete = false
      let newThreadId = response.thread_id

      if (response.status === 'not_found' || response.candidates.length === 0) {
        newIsComplete = true
        finalBotMsg = {
          id: botMsgId,
          sender: 'bot',
          text: `I searched YouTube and external registries for "${songQuery}" but found no matching candidate tracks. The query has been logged as missing and the workflow completed cleanly.`,
          type: 'status',
          statusType: 'warning'
        }
      } else {
        finalBotMsg = {
          id: botMsgId,
          sender: 'bot',
          text: `I found ${response.candidates.length} potential matches for "${songQuery}". Please select the correct version you'd like to ingest:`,
          type: 'candidates',
          candidates: response.candidates
        }
      }

      // Read current sessionStorage again to capture any updates in case they switched tab back and forth
      let latestCachedMsgs = messagesWithUser
      const currentCached = sessionStorage.getItem(cacheKey)
      if (currentCached) {
        try {
          const parsed = JSON.parse(currentCached)
          latestCachedMsgs = parsed.messages || messagesWithUser
        } catch (e) {}
      }

      const finalMessages = [...latestCachedMsgs, finalBotMsg]
      sessionStorage.setItem(cacheKey, JSON.stringify({
        messages: finalMessages,
        threadId: newThreadId,
        ingestionLogs: currentLogs,
        isComplete: newIsComplete,
        loading: false
      }))

      // Update state for currently mounted view
      setIsComplete(newIsComplete)
      setThreadId(newThreadId)
      setMessages(finalMessages)
    } catch (err: any) {
      console.error(err)
      const errorMsgId = Math.random().toString()
      const errorMsg: Message = {
        id: errorMsgId,
        sender: 'bot',
        text: `An error occurred during search: ${err.message || 'Server connection failed.'}`,
        type: 'status',
        statusType: 'error'
      }

      let latestCachedMsgs = messagesWithUser
      const currentCached = sessionStorage.getItem(cacheKey)
      if (currentCached) {
        try {
          const parsed = JSON.parse(currentCached)
          latestCachedMsgs = parsed.messages || messagesWithUser
        } catch (e) {}
      }

      const finalMessages = [...latestCachedMsgs, errorMsg]
      sessionStorage.setItem(cacheKey, JSON.stringify({
        messages: finalMessages,
        threadId: currentThread,
        ingestionLogs: currentLogs,
        isComplete: true,
        loading: false
      }))

      setIsComplete(true)
      setMessages(finalMessages)
    } finally {
      setLoading(false)
    }
  }

  // Handle Candidate Selection
  const handleSelectSong = async (candidateId: string, songName: string) => {
    if (!threadId || !user) return
    setLoading(true)
    
    // Add choice log
    const userMsgId = Math.random().toString()
    const selectionName = candidateId === 'report_missing' 
      ? 'None of these - Report Missing Song'
      : songName
    
    const choiceMsg: Message = { id: userMsgId, sender: 'user', text: `Option: ${selectionName}` }

    const cacheKey = `fermata-chatbot-state-${user.id}`
    let currentMsgs: Message[] = []
    let currentLogs: string[] = []
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        currentMsgs = parsed.messages || []
        currentLogs = parsed.ingestionLogs || []
      } catch (e) {}
    }

    // Filter candidates list in existing messages immediately
    const filteredMsgs = currentMsgs.map((m) => {
      if (m.type === 'candidates' && m.candidates) {
        if (candidateId === 'report_missing') {
          if (m.candidates.some((c) => c.title !== "Ingested Track")) {
            return {
              ...m,
              candidates: [],
              selected: true
            }
          }
        } else {
          if (m.candidates.some((c) => c.id === candidateId)) {
            return {
              ...m,
              candidates: m.candidates.filter((c) => c.id === candidateId),
              selected: true
            }
          }
        }
      }
      return m
    })

    const messagesWithChoice = [...filteredMsgs, choiceMsg]
    sessionStorage.setItem(cacheKey, JSON.stringify({
      messages: messagesWithChoice,
      threadId: threadId,
      ingestionLogs: currentLogs,
      isComplete: false,
      loading: true
    }))
    setMessages(messagesWithChoice)
    
    try {
      const response = await submitCandidateSelection(threadId, candidateId)
      const botMsgId = Math.random().toString()
      const successMsg: Message = {
        id: botMsgId,
        sender: 'bot',
        text: "Requested submitted successfully - The music will be availble in a day",
        type: 'status',
        statusType: 'success'
      }

      let latestCachedMsgs = messagesWithChoice
      const currentCached = sessionStorage.getItem(cacheKey)
      if (currentCached) {
        try {
          const parsed = JSON.parse(currentCached)
          latestCachedMsgs = parsed.messages || messagesWithChoice
        } catch (e) {}
      }

      // Re-apply filter on loaded messages in case cache was reloaded from unmounted state
      const reFilteredMsgs = latestCachedMsgs.map((m) => {
        if (m.type === 'candidates' && m.candidates) {
          if (candidateId === 'report_missing') {
            if (m.candidates.some((c) => c.title !== "Ingested Track")) {
              return { ...m, candidates: [], selected: true }
            }
          } else {
            if (m.candidates.some((c) => c.id === candidateId)) {
              return {
                ...m,
                candidates: m.candidates.filter((c) => c.id === candidateId),
                selected: true
              }
            }
          }
        }
        return m
      })

      const finalMessages = [...reFilteredMsgs, successMsg]
      sessionStorage.setItem(cacheKey, JSON.stringify({
        messages: finalMessages,
        threadId: threadId,
        ingestionLogs: currentLogs,
        isComplete: true,
        loading: false
      }))

      setIsComplete(true) // Session finished
      setMessages(finalMessages)
    } catch (err: any) {
      console.error(err)
      const errorMsgId = Math.random().toString()
      const errorMsg: Message = {
        id: errorMsgId,
        sender: 'bot',
        text: `Failed to submit selection: ${err.message || 'Server error.'}`,
        type: 'status',
        statusType: 'error'
      }

      let latestCachedMsgs = messagesWithChoice
      const currentCached = sessionStorage.getItem(cacheKey)
      if (currentCached) {
        try {
          const parsed = JSON.parse(currentCached)
          latestCachedMsgs = parsed.messages || messagesWithChoice
        } catch (e) {}
      }

      const finalMessages = [...latestCachedMsgs, errorMsg]
      sessionStorage.setItem(cacheKey, JSON.stringify({
        messages: finalMessages,
        threadId: threadId,
        ingestionLogs: currentLogs,
        isComplete: true,
        loading: false
      }))

      setIsComplete(true)
      setMessages(finalMessages)
    } finally {
      setLoading(false)
    }
  }

  // Simulate Admin Review Decision
  const handleAdminReview = async (approved: boolean) => {
    if (!threadId) return
    setLoading(true)
    
    const botMsgId = Math.random().toString()
    setMessages((prev) => [
      ...prev,
      {
        id: botMsgId,
        sender: 'bot',
        text: `Starting Ingestion workflow... Resolving audio streams and downloading into memory...`,
        type: 'text'
      }
    ])
    
    try {
      const response = await simulateAdminApproval(threadId, approved, "Simulated from Ingestion Chatbot Interface")
      const finalMsgId = Math.random().toString()
      
      if (response.status === 'completed') {
        setIsComplete(true) // Session finished
        setMessages((prev) => [
          ...prev,
          {
            id: finalMsgId,
            sender: 'bot',
            text: `Ingestion Successful! The song was successfully extracted, optimized cover uploaded, and saved to the database.`,
            type: 'status',
            statusType: 'success',
            logs: response.logs
          }
        ])
        
        // Add a play card if audio URL exists
        if (response.track_id && response.audio_url) {
          const playMsgId = Math.random().toString()
          setMessages((prev) => [
            ...prev,
            {
              id: playMsgId,
              sender: 'bot',
              text: `Ingested Track ID: ${response.track_id}. You can play this track immediately!`,
              type: 'candidates',
              candidates: [
                {
                  id: String(response.track_id),
                  title: "Ingested Track",
                  artist: "Ready",
                  album: "Fermata Library",
                  duration_seconds: 200,
                  source_url: response.audio_url || '',
                  cover_url: response.cover_url || ''
                }
              ]
            }
          ])
        }
      } else {
        setIsComplete(true) // Session finished
        setMessages((prev) => [
          ...prev,
          {
            id: finalMsgId,
            sender: 'bot',
            text: `Ingestion request was rejected by the admin. Rejection notification filed.`,
            type: 'status',
            statusType: 'error',
            logs: response.logs
          }
        ])
      }
    } catch (err: any) {
      console.error(err)
      const errorMsgId = Math.random().toString()
      setMessages((prev) => [
        ...prev,
        {
          id: errorMsgId,
          sender: 'bot',
          text: `Pipeline failed: ${err.message || 'Check logs for S3 credentials or connection errors.'}`,
          type: 'status',
          statusType: 'error'
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  // Play function for freshly ingested tracks
  const handlePlayIngested = (cand: CandidateSong) => {
    // Construct player store track object
    const trackObj = {
      id: Number(cand.id),
      title: cand.title === "Ingested Track" ? "Ingested Song" : cand.title,
      album_id: null,
      duration_seconds: cand.duration_seconds,
      audio_url: cand.source_url, // Contains the ingested play URL
      cover_url: cand.cover_url || null,
      album_title: cand.album,
      artist_id: null,
      artist_name: cand.artist
    }
    setQueue([trackObj])
    setTrack(trackObj)
  }

  const handleSend = () => {
    if (!inputValue.trim()) return
    const text = inputValue
    setInputValue('')
    handleSearch(text)
  }

  if (!user || !token) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-subtext">Authenticating...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-surface-highlight/30 pb-3">
        <Link 
          to="/search" 
          className="p-2 hover:bg-surface-highlight rounded-full text-subtext hover:text-primary transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <RefreshCw className="animate-spin text-spotify-green" size={18} />
            Ingestion Chatbot
          </h1>
          <p className="text-xs text-subtext">
            Search, request, and ingest missing songs with Agentic AI pipelines
          </p>
        </div>
      </div>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto bg-surface-highlight/5 rounded-2xl border border-surface-highlight/20 p-4 space-y-4 min-h-0 scrollbar-thin">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-spotify-green text-black font-semibold rounded-tr-none'
                  : 'bg-surface-highlight/40 text-primary rounded-tl-none border border-surface-highlight/40'
              }`}
            >
              {/* Normal Text message */}
              {(!msg.type || msg.type === 'text') && <p>{msg.text}</p>}

              {/* Status alerts */}
              {msg.type === 'status' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    {msg.statusType === 'success' && <CheckCircle size={18} className="text-spotify-green mt-0.5 shrink-0" />}
                    {msg.statusType === 'error' && <XCircle size={18} className="text-red-500 mt-0.5 shrink-0" />}
                    {msg.statusType === 'warning' && <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />}
                    <p className="font-semibold">{msg.text}</p>
                  </div>

                  {/* Logs Section */}
                  {msg.logs && msg.logs.length > 0 && (
                    <div className="mt-3 bg-black/60 rounded-xl p-3 border border-surface-highlight/20">
                      <p className="text-xs font-mono font-bold text-spotify-green border-b border-surface-highlight/20 pb-1 mb-2">Ingestion logs:</p>
                      <div className="max-h-48 overflow-y-auto scrollbar-thin text-xs font-mono text-zinc-300 space-y-1">
                        {msg.logs.map((log, i) => (
                          <div key={i} className="whitespace-pre-wrap leading-tight">{log}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Ingest Search Candidate lists */}
              {msg.type === 'candidates' && msg.candidates && (
                <div className="space-y-3 mt-1">
                  <p>{msg.text}</p>
                  <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
                    {msg.candidates.map((cand) => {
                      // Check if it's the final ingested play card
                      const isPlayCard = cand.title === "Ingested Track"
                      return (
                        <div
                          key={cand.id}
                          className="flex items-center gap-3 p-3.5 bg-[#181818] hover:bg-[#222222] rounded-xl border border-zinc-800/80 hover:border-spotify-green/50 transition-all text-left group shadow-lg"
                        >
                          <div className="w-10 h-10 bg-zinc-800 rounded-lg shrink-0 overflow-hidden flex items-center justify-center border border-zinc-700/50">
                            {cand.cover_url ? (
                              <img src={cand.cover_url} alt="Cover" className="w-full h-full object-cover" />
                            ) : (
                              <Music size={16} className="text-zinc-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-zinc-100 group-hover:text-white truncate text-xs">{cand.title}</p>
                            <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                              {cand.artist} • {cand.album} ({cand.duration_seconds}s)
                            </p>
                          </div>
                          {isPlayCard ? (
                            <button
                              onClick={() => handlePlayIngested(cand)}
                              className="px-4 py-2 bg-spotify-green hover:bg-[#1ed760] text-black text-xs font-extrabold rounded-full flex items-center gap-1.5 shrink-0 shadow transition-all hover:scale-[1.04]"
                            >
                              <Play size={12} fill="black" /> Play
                            </button>
                          ) : msg.selected ? (
                            null
                          ) : (
                            <button
                              onClick={() => handleSelectSong(cand.id, cand.title)}
                              className="px-4 py-2 bg-spotify-green hover:bg-[#1ed760] text-black text-xs font-extrabold rounded-full shrink-0 shadow transition-all hover:scale-[1.04]"
                            >
                              Ingest
                            </button>
                          )}
                        </div>
                      )
                    })}
                    
                    {/* Add report option at the very bottom */}
                    {!msg.selected && msg.candidates[0]?.title !== "Ingested Track" && (
                      <button
                        onClick={() => handleSelectSong('report_missing', 'Report Missing Song')}
                        className="w-full py-2.5 bg-[#281515] hover:bg-[#3d1a1a] text-red-400 border border-red-900/40 hover:border-red-500/50 text-xs font-bold rounded-xl transition-all hover:scale-[1.01]"
                      >
                        Option 11: None of these match - File a Missing Song Report
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Simulation review node */}
              {msg.type === 'admin_simulation' && (
                <div className="space-y-4">
                  <p className="font-semibold text-primary flex items-center gap-2">
                    <AlertCircle size={18} className="text-spotify-green shrink-0" />
                    {msg.text}
                  </p>
                  
                  <div className="bg-black/50 p-4 rounded-xl border border-surface-highlight/30 space-y-3">
                    <p className="text-xs text-subtext">
                      Ingestion requests submitted to the queue require administrator approval. For testing, choose a simulated review action below:
                    </p>
                    <div className="flex gap-2.5">
                      <button
                        onClick={() => handleAdminReview(true)}
                        className="flex-1 py-2 bg-spotify-green hover:bg-spotify-green/80 text-black text-xs font-bold rounded-xl transition-all"
                      >
                        Approve & Ingest In-Memory
                      </button>
                      <button
                        onClick={() => handleAdminReview(false)}
                        className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl transition-all border border-surface-highlight/30"
                      >
                        Reject Ingestion Request
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-highlight/40 border border-surface-highlight/40 rounded-2xl rounded-tl-none px-4 py-3">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-subtext rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-subtext rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-subtext rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input box */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a song title and artist... (e.g. Yesterday The Originals)"
          className="flex-1 px-4 py-3 bg-surface-highlight/10 text-primary border border-surface-highlight/30 rounded-full focus:outline-none focus:border-spotify-green/60 text-sm"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !inputValue.trim()}
          className="p-3 bg-spotify-green hover:bg-spotify-green/80 disabled:bg-zinc-800 text-black disabled:text-subtext rounded-full transition-all flex items-center justify-center shrink-0"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
