import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("contacts")
    .select("municipality")
    .not("municipality", "is", null)
    .order("municipality")
    .range(0, 999)

  if (error) return NextResponse.json([], { status: 500 })

  const unique = [...new Set(data.map(r => r.municipality).filter(Boolean))].sort((a, b) => a.localeCompare(b, "el"))
  
  return NextResponse.json(unique)
}
