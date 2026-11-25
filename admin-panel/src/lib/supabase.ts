import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
    createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://comecchrihstbgbdvqqd.supabase.co',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbWVjY2hyaWhzdGJnYmR2cXFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMDg1OTgsImV4cCI6MjA4NDc4NDU5OH0.LG1ICJFZka6bKdD2oFO_JgkCfK2rAX9zYfMiGBvYlYk'
    )
