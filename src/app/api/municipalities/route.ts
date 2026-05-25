import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  
  const { data, error } = await supabase.rpc("get_distinct_municipalities")

  if (error) {
    // fallback
    return NextResponse.json([])
  }

  const municipalities = (data as { municipality: string }[])
    .map(r => r.municipality)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "el"))

  return NextResponse.json(municipalities)
}
