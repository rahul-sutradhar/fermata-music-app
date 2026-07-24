export interface User {
  id: number
  username: string
  email: string
  role?: 'user' | 'artist' | 'admin'
  created_at?: string | null
  updated_at?: string | null
}

export interface Artist {
  id: number
  name: string
  user_id?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export interface Album {
  id: number
  title: string
  artist_id: number
  artist_name?: string
  cover_url?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface Track {
  id: number
  title: string
  album_id?: number | null
  duration_seconds: number | null
  audio_url?: string | null
  cover_url?: string | null
  album_title?: string | null
  artist_id?: number | null
  artist_name?: string | null
  lyrics?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface Playlist {
  id: number
  name: string
  user_id: number
  cover_url?: string | null
}

export interface PlaylistItem {
  track: Track
  position: number
}

export interface PlayerState {
  id?: number
  track_id: number | null
  is_playing: boolean
  progress_ms: number
  volume: number
  shuffle: boolean
  repeat_mode: 'off' | 'context' | 'track'
}

export interface RecentlyPlayed {
  id: number
  track_id: number
  played_at: string
}

export interface LibraryItem {
  id: number
  track_id: number
  added_at: string
}

export interface LikedAlbum {
  id: number
  album_id: number
  added_at: string
}

export interface TopItem {
  id: number
  name: string
  type: 'artist' | 'track'
}

export interface Show {
  id: number
  title: string
  description: string | null
  image_url: string | null
}

export interface Episode {
  id: number
  show_id: number
  title: string
  description: string | null
  audio_url: string | null
  duration_ms: number
}

export interface Audiobook {
  id: number
  title: string
  author: string | null
  description: string | null
  image_url: string | null
}

export interface Chapter {
  id: number
  audiobook_id: number
  title: string
  description: string | null
  audio_url: string | null
  duration_ms: number
  chapter_number: number
}

export interface SearchResultItem {
  type: 'track' | 'album' | 'artist'
  id: number
  title?: string
  name?: string
}

export interface SearchResponse {
  query: string
  tracks: Track[]
  albums: Album[]
  artists: Artist[]
}

export interface TokenResponse {
  access_token: string
  token_type: string
  refresh_token?: string
}

export interface CoverUploadResponse {
  filename: string
  path: string
}
