import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  
  const { data, error } = await supabase.rpc("get_distinct_municipalities")

  if (error) {
    // fallback
    return NextResponse.json([])
  }
  
  return NextResponse.json(data)
}
